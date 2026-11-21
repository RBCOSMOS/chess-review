(() => {
'use strict';
const $=id=>document.getElementById(id);
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
let parsed=null,analysis=null,selected=0,flipped=localStorage.getItem("chess-board-black-bottom")==="true",busy=false;
const icons={Brilliant:'brilliant',Great:'great',Best:'best',Excellent:'excellent',Good:'good',Inaccuracy:'inaccuracy',Mistake:'mistake',Blunder:'blunder',Book:'book',Miss:'mistake'};
const cleanUrl=u=>{const x=new URL(u.trim());if(x.protocol!=='https:'||x.username||x.password||x.search||x.hash)throw Error('Use an HTTPS ngrok URL without a path, query or credentials.');return x.origin;};
function message(t){$('error').textContent=t||'';}
function setStatus(text,ok){$('status').textContent='● '+text;$('status').classList.toggle('ok',!!ok);}
function placementAt(i){return i===0?(parsed?.initialPlacement||START):parsed?.moves[i-1]?.position||START;}
function pieceMap(str){const result=new Map();str.split('/').forEach((row,r)=>{let c=0;for(const ch of row){if(/[1-8]/.test(ch))c+=Number(ch);else result.set('abcdefgh'[c++]+(8-r),ch);}});return result;}
function drawBoard(){
 const board=$('board');board.replaceChildren();const map=pieceMap(placementAt(selected));
 const last=selected>0?parsed.moves[selected-1]:null;
 for(let i=0;i<64;i++){
  const rank=flipped?Math.floor(i/8)+1:8-Math.floor(i/8);
  const file=flipped?7-i%8:i%8,sq='abcdefgh'[file]+rank;
  const cell=document.createElement('div');cell.className='square '+((file+rank)%2?'light':'dark');
  if(last&&(last.from===sq||last.to===sq))cell.classList.add('last');
  const piece=map.get(sq);if(piece){const img=document.createElement('img');img.src='pieces/'+(piece===piece.toUpperCase()?'w':'b')+piece.toLowerCase()+'.png';img.alt=piece;cell.append(img);}
  if(i>=56){const coord=document.createElement('span');coord.className='coord';coord.textContent=sq[0];cell.append(coord);}
  board.append(cell);
 }
 const m=parsed?.moves[selected-1],r=analysis?.moves[selected-1];
 $('blackName').textContent=flipped?(parsed?.headers.White||'WHITE'):(parsed?.headers.Black||'BLACK');
 $('whiteName').textContent=flipped?(parsed?.headers.Black||'BLACK'):(parsed?.headers.White||'WHITE');
 $('flip').textContent=flipped?'⇅ White at bottom':'⇅ Black at bottom';
 $('flip').setAttribute('aria-label',flipped?'Put White at bottom':'Put Black at bottom');
 $('moveNum').textContent=m?`${Math.ceil(selected/2)}${selected%2?'.':'...'} ${m.san}`:'Starting position';
 $('rating').textContent=r?`${r.label} · ${m.san}`:'Select a move';
 const badge=$('selectedBadge');badge.hidden=!r;
 if(r){$('selectedBadgeIcon').src='rating-icons/'+(icons[r.label]||'good')+'.png';$('selectedBadgeIcon').alt=r.label+' badge';$('selectedBadgeText').textContent=r.label+' · '+m.san;}
 $('explain').textContent=r?.explanation||'Move explanations will appear here after analysis.';
 $('evaluation').textContent=r?`Evaluation: ${(r.cpAfter/100).toFixed(2)} · Expected loss: ${r.expectedLoss}`:'Eval: —';
 document.querySelectorAll('.move').forEach(el=>el.classList.toggle('selected',+el.dataset.ply===selected));
 document.querySelector('.move.selected')?.scrollIntoView({block:'nearest'});
}
function renderMoves(){
 const box=$('moves');box.replaceChildren();
 if(!analysis){box.innerHTML='<div class="empty">Your analysis will appear here.</div>';return;}
 for(const [i,m] of analysis.moves.entries()){
  const b=document.createElement('button');b.className='move';b.dataset.ply=i+1;
  const name=document.createElement('span');name.textContent=`${Math.ceil((i+1)/2)}${i%2?'...':'.'} ${m.san}`;
  const rating=document.createElement('span');rating.className='rating';
  const img=document.createElement('img');img.src='rating-icons/'+(icons[m.label]||'good')+'.png';img.alt=m.label+' badge';
  const t=document.createElement('em');t.textContent=m.label;rating.append(img,t);b.append(name,rating);
  b.title=m.label+' — '+m.san;b.setAttribute('aria-label',name.textContent+', '+m.label);
  b.addEventListener('click',()=>{selected=i+1;drawBoard();});box.append(b);
 }
 $('moveCount').textContent=analysis.moves.length+' half-moves';
 for(const [color,offset] of [['white',0],['black',1]]){
  const vals=analysis.moves.filter((_,i)=>i%2===offset).map(m=>m.expectedLoss);
  const accuracy=vals.length?Math.max(0,Math.min(100,100*(1-vals.reduce((a,b)=>a+b,0)/vals.length))):null;
  $('stats').children[offset].querySelector('b').textContent=accuracy===null?'—':accuracy.toFixed(1)+'%';
 }
}
function importGame(){
 parsed=PGNImport.parseGame($('pgn').value);
 selected=0;analysis=null;
 $('match').textContent=parsed.title;
 $('whiteName').textContent=parsed.headers.White||'WHITE';
 $('blackName').textContent=parsed.headers.Black||'BLACK';
 $('detail').textContent=parsed.moves.length+' half-moves · Ready for local analysis';
 renderMoves();drawBoard();
}
async function request(path,options={}){
 const url=cleanUrl($('url').value),token=$('token').value.trim();
 if(!token)throw Error('Enter the access token from your local server.');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),20*60*1000);
 try{
  const res=await fetch(url+path,{...options,signal:ctrl.signal,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json','ngrok-skip-browser-warning':'true'}});
  const body=await res.json().catch(()=>({detail:'Server did not return JSON'}));
  if(!res.ok)throw Error(typeof body.detail==='string'?body.detail:`Server returned ${res.status}`);
  return body;
 }finally{clearTimeout(timer);}
}
$('pasteSetup').addEventListener('click',async()=>{
 try{
  const data=JSON.parse(await navigator.clipboard.readText());
  if(typeof data.url!=='string'||typeof data.token!=='string')throw Error('Clipboard does not contain setup details.');
  $('url').value=cleanUrl(data.url);$('token').value=data.token;
  message('Connection details pasted. Click Test connection.');
 }catch(e){message('Could not paste setup details: '+e.message);}
});
$('connect').addEventListener('click',async()=>{
 message('');try{const data=await request('/health');setStatus('Connected · '+data.engine,true);}catch(e){setStatus('Connection failed',false);message(e.message+' Check ngrok, CORS origin, and your token.');}
});
$('analyze').addEventListener('click',async()=>{
 if(busy)return;message('');
 try{
  importGame();busy=true;$('analyze').disabled=true;$('progress').textContent='ANALYZING…';
  const data=await request('/analyze',{method:'POST',body:JSON.stringify({pgn:$('pgn').value,depth:+$('depth').value,max_plies:300})});
  analysis=data;renderMoves();selected=1;drawBoard();
  $('progress').textContent='COMPLETE';$('detail').textContent=`${data.engine} · depth ${data.depth} · ${data.moves.length} half-moves · Independent classifications`;
  setStatus('Connected',true);
 }catch(e){$('progress').textContent='ERROR';message(e.message);}finally{busy=false;$('analyze').disabled=false;}
});
const badgeLegend=$('badgeLegend');
for(const label of ['Brilliant','Great','Best','Excellent','Good','Book','Inaccuracy','Mistake','Blunder']){
 const item=document.createElement('span');item.className='legend-item';
 const img=document.createElement('img');img.src='rating-icons/'+icons[label]+'.png';img.alt='';
 item.append(img,document.createTextNode(label));badgeLegend.append(item);
}
$('depth').addEventListener('input',()=>{$('depthValue').textContent=$('depth').value;});
$('first').onclick=()=>{selected=0;drawBoard();};
$('prev').onclick=()=>{selected=Math.max(0,selected-1);drawBoard();};
$('next').onclick=()=>{selected=Math.min(parsed?.moves.length||0,selected+1);drawBoard();};
$('last').onclick=()=>{selected=parsed?.moves.length||0;drawBoard();};
$('flip').onclick=()=>{flipped=!flipped;localStorage.setItem('chess-board-black-bottom',String(flipped));drawBoard();};
document.addEventListener('keydown',e=>{
 if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||['INPUT','TEXTAREA'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable)return;
 const n=parsed?.moves.length||0;
 const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-2,ArrowDown:2};
 if(Object.prototype.hasOwnProperty.call(step,e.key)){e.preventDefault();selected=Math.max(0,Math.min(n,selected+step[e.key]));drawBoard();}
 else if(e.key==='Home'){e.preventDefault();selected=0;drawBoard();}
 else if(e.key==='End'){e.preventDefault();selected=n;drawBoard();}
});
const coachHistory=[];
function coachMessage(role,content){const el=document.createElement('div');el.className='coach-message '+role;el.textContent=content;$('coachMessages').append(el);$('coachMessages').scrollTop=$('coachMessages').scrollHeight;return el;}
$('coachForm').addEventListener('submit',async e=>{
 e.preventDefault();const question=$('coachQuestion').value.trim();if(!question)return;
 if(!analysis){message('Analyze a completed game first, then ask the coach about a move.');return;}
 const move=analysis.moves[selected-1]||{};
 const game={white:analysis.white,black:analysis.black,result:analysis.result,depth:analysis.depth,engine:analysis.engine};
 const history=coachHistory.slice(-8);coachMessage('user',question);$('coachQuestion').value='';
 const pending=coachMessage('assistant','Thinking locally…');$('coachSend').disabled=true;
 try{const reply=await request('/coach',{method:'POST',body:JSON.stringify({question,move,game,history})});pending.textContent=reply.answer;coachHistory.push({role:'user',content:question},{role:'assistant',content:reply.answer});}
 catch(err){pending.textContent='Coach error: '+err.message;}
 finally{$('coachSend').disabled=false;}
});
const params=new URLSearchParams(location.search);
if(params.has('pgn')){$('pgn').value=params.get('pgn').slice(0,120000);try{importGame();}catch(e){message(e.message);}}
drawBoard();
})();
