(() => {
'use strict';
const $=id=>document.getElementById(id);
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
let parsed=null,analysis=null,selected=0,flipped=false,busy=false;
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
 $('moveNum').textContent=m?`${Math.ceil(selected/2)}${selected%2?'.':'...'} ${m.san}`:'Starting position';
 $('rating').textContent=r?`${r.label} · ${m.san}`:'Select a move';
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
  const img=document.createElement('img');img.src='rating-icons/'+(icons[m.label]||'good')+'.png';img.alt='';
  const t=document.createElement('em');t.textContent=m.label;rating.append(img,t);b.append(name,rating);
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
$('depth').addEventListener('input',()=>{$('depthValue').textContent=$('depth').value;});
$('first').onclick=()=>{selected=0;drawBoard();};
$('prev').onclick=()=>{selected=Math.max(0,selected-1);drawBoard();};
$('next').onclick=()=>{selected=Math.min(parsed?.moves.length||0,selected+1);drawBoard();};
$('last').onclick=()=>{selected=parsed?.moves.length||0;drawBoard();};
$('flip').onclick=()=>{flipped=!flipped;drawBoard();};
document.addEventListener('keydown',e=>{if(['INPUT','TEXTAREA'].includes(document.activeElement.tagName))return;if(e.key==='ArrowLeft')$('prev').click();if(e.key==='ArrowRight')$('next').click();});
const params=new URLSearchParams(location.search);
if(params.has('pgn')){$('pgn').value=params.get('pgn').slice(0,120000);try{importGame();}catch(e){message(e.message);}}
drawBoard();
})();
