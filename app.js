(() => {
'use strict';
const $=id=>document.getElementById(id);
const START='rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR';
let parsed=null,analysis=null,selected=0,flipped=localStorage.getItem("chess-board-black-bottom")==="true",busy=false;
let mode='review', picked=null, variation=null, playState=null, playHistory=[], playSide='w', thinking=false, marks=[], arrowStart=null, playedMoves=[], gameSession=0;
const fullFen=st=>{
 const turn=st.t===1?'w':'b',castle=st.c&&st.c.length?st.c:'-',ep=st.ep<0?'-':PGNImport.square(st.ep);
 return `${PGNImport.placement(st)} ${turn} ${castle} ${ep} ${st.half} ${st.full}`;
};
function reviewState(){
 if(variation)return variation;
 if(!parsed)return PGNImport.parse(START+' w KQkq - 0 1');
 let st=PGNImport.parse(parsed.initialFen);
 for(let i=0;i<selected;i++){
  const u=parsed.moves[i].uci,move=PGNImport.legal(st).find(m=>PGNImport.square(m[0])+PGNImport.square(m[1])+(m[2]||'')===u);
  if(!move)break;st=PGNImport.apply(st,move);
 }
 return st;
}
function activeState(){return mode==='play'?playState:reviewState();}
function resetAnnotations(){marks=[];picked=null;drawAnnotations();}
function drawAnnotations(){
 const svg=$('boardArrows');svg.replaceChildren();
 const ns='http://www.w3.org/2000/svg';
 const point=q=>{const f='abcdefgh'.indexOf(q[0]),r=Number(q[1]);return {x:(flipped?7-f:f)*100+50,y:(flipped?r-1:8-r)*100+50};};
 const defs=document.createElementNS(ns,'defs'),marker=document.createElementNS(ns,'marker');marker.setAttribute('id','arrowtip');marker.setAttribute('markerWidth','4');marker.setAttribute('markerHeight','4');marker.setAttribute('refX','2');marker.setAttribute('refY','2');marker.setAttribute('orient','auto');const tip=document.createElementNS(ns,'path');tip.setAttribute('d','M0,0 L4,2 L0,4 Z');tip.setAttribute('fill','#e8a13a');marker.append(tip);defs.append(marker);svg.append(defs);
 for(const m of marks){const a=point(m.from),b=point(m.to);if(m.from===m.to){const c=document.createElementNS(ns,'circle');c.setAttribute('cx',a.x);c.setAttribute('cy',a.y);c.setAttribute('r','40');c.setAttribute('fill','none');c.setAttribute('stroke','#e8a13a');c.setAttribute('stroke-width','10');c.setAttribute('opacity','.8');svg.append(c);}else{const l=document.createElementNS(ns,'line');for(const [k,v] of Object.entries({x1:a.x,y1:a.y,x2:b.x,y2:b.y,stroke:'#e8a13a','stroke-width':12,'stroke-linecap':'round','marker-end':'url(#arrowtip)',opacity:'.85'}))l.setAttribute(k,v);svg.append(l);}}
}
function boardSquare(el){const cell=el.closest('.square');return cell?.dataset.square||null;}
function makeMove(from,to,promotion='q'){
 const st=activeState();if(!st||thinking)return;
 const legal=PGNImport.legal(st),candidates=legal.filter(m=>PGNImport.square(m[0])===from&&PGNImport.square(m[1])===to);
 if(!candidates.length){picked=null;drawBoard();return;}
 const move=candidates.find(m=>m[2]===promotion)||candidates[0];
 const next=PGNImport.apply(st,move);
 if(mode==='play'){
  if((st.t===1?'w':'b')!==playSide)return;
  playState=next;playHistory.push(next);playedMoves.push(PGNImport.san(st,move));$('playInfo').textContent='You played '+playedMoves[playedMoves.length-1];drawBoard();
  if(PGNImport.legal(next).length)stockfishTurn();
  else $('playInfo').textContent='Game over — no legal moves.';
 }else{variation=next;drawBoard();$('boardHelp').textContent='Exploring a variation. Use the move navigation buttons to return to the original game.';}
 picked=null;resetAnnotations();
}
async function stockfishTurn(){
 if(!playState||thinking)return;
 const session=gameSession;
 thinking=true;$('playInfo').textContent='Stockfish thinking…';
 try{
  const data=await request('/play',{method:'POST',body:JSON.stringify({fen:fullFen(playState),elo:+$('elo').value,depth:12})});
  if(session!==gameSession)return;
  if(data.move){
   const move=PGNImport.legal(playState).find(m=>PGNImport.square(m[0])+PGNImport.square(m[1])+(m[2]||'')===data.move);
   if(!move)throw Error('Server returned an illegal move.');
   playedMoves.push(PGNImport.san(playState,move));playState=PGNImport.apply(playState,move);playHistory.push(playState);
  }
  $('playInfo').textContent=data.gameOver?'Game over: '+data.result:'Stockfish played '+(data.san||'');
 }catch(e){if(session===gameSession)$('playInfo').textContent='Engine error: '+e.message+' Your move is saved. Click Retry engine move.';}
 finally{if(session===gameSession){thinking=false;drawBoard();}}
}
const icons={Brilliant:'brilliant',Great:'great',Best:'best',Excellent:'excellent',Good:'good',Inaccuracy:'inaccuracy',Mistake:'mistake',Blunder:'blunder',Book:'book',Miss:'mistake'};
const cleanUrl=u=>{const raw=String(u||'').trim();if(!raw)throw Error('Enter your ngrok HTTPS URL under Engine connection first.');let x;try{x=new URL(raw);}catch{throw Error('Invalid ngrok URL. Paste the full https://...ngrok-free.dev address from your ngrok terminal.');}if(x.protocol!=='https:'||x.username||x.password||x.search||x.hash||x.pathname!=='/')throw Error('Use the full HTTPS ngrok URL only, without an extra path, query, or credentials.');return x.origin;};
function message(t){$('error').textContent=t||'';}
function setStatus(text,ok){$('status').textContent='● '+text;$('status').classList.toggle('ok',!!ok);}
function placementAt(i){return i===0?(parsed?.initialPlacement||START):parsed?.moves[i-1]?.position||START;}
function pieceMap(str){const result=new Map();str.split('/').forEach((row,r)=>{let c=0;for(const ch of row){if(/[1-8]/.test(ch))c+=Number(ch);else result.set('abcdefgh'[c++]+(8-r),ch);}});return result;}
function drawBoard(){
 const board=$('board');board.replaceChildren();const state=activeState();const map=pieceMap(state?PGNImport.placement(state):placementAt(selected));
 const last=mode==='review'&&!variation&&selected>0?parsed?.moves[selected-1]:null;
 for(let i=0;i<64;i++){
  const rank=flipped?Math.floor(i/8)+1:8-Math.floor(i/8);
  const file=flipped?7-i%8:i%8,sq='abcdefgh'[file]+rank;
  const cell=document.createElement('div');cell.className='square '+((file+rank)%2?'light':'dark');cell.dataset.square=sq;
  if(last&&(last.from===sq||last.to===sq))cell.classList.add('last');if(picked===sq)cell.classList.add('move-source');if(picked&&state&&PGNImport.legal(state).some(m=>PGNImport.square(m[0])===picked&&PGNImport.square(m[1])===sq))cell.classList.add('legal-target');
  const piece=map.get(sq);if(piece){const img=document.createElement('img');img.src='pieces/'+(piece===piece.toUpperCase()?'w':'b')+piece.toLowerCase()+'.png';img.alt=piece;cell.append(img);}
  if(i>=56){const coord=document.createElement('span');coord.className='coord';coord.textContent=sq[0];cell.append(coord);}
  cell.addEventListener('click',()=>{if(thinking||!state)return;if(picked){if(picked===sq){picked=null;drawBoard();return;}if(PGNImport.legal(state).some(m=>PGNImport.square(m[0])===picked&&PGNImport.square(m[1])===sq)){makeMove(picked,sq);return;}}if((state.t===1?/[A-Z]/:/[a-z]/).test(map.get(sq)||'')&&(mode!=='play'||(state.t===1?'w':'b')===playSide)){picked=sq;drawBoard();}else{picked=null;drawBoard();}});board.append(cell);
 }
 const m=mode==='review'&&!variation?parsed?.moves[selected-1]:null,r=mode==='review'&&!variation?analysis?.moves[selected-1]:null;
 $('blackName').textContent=flipped?(parsed?.headers.White||'WHITE'):(parsed?.headers.Black||'BLACK');
 $('whiteName').textContent=flipped?(parsed?.headers.Black||'BLACK'):(parsed?.headers.White||'WHITE');
 $('flip').textContent=flipped?'⇅ White at bottom':'⇅ Black at bottom';
 $('flip').setAttribute('aria-label',flipped?'Put White at bottom':'Put Black at bottom');
 $('moveNum').textContent=mode==='play'?'Playing Stockfish':variation?'Variation explorer':m?`${Math.ceil(selected/2)}${selected%2?'.':'...'} ${m.san}`:'Starting position';
 $('rating').textContent=r?`${r.label} · ${m.san}`:'Select a move';
 const badge=$('selectedBadge');badge.hidden=!r;
 if(r){$('selectedBadgeIcon').src='rating-icons/'+(icons[r.label]||'good')+'.png';$('selectedBadgeIcon').alt=r.label+' badge';$('selectedBadgeText').textContent=r.label+' · '+m.san;}
 $('explain').textContent=r?.explanation||'Move explanations will appear here after analysis.';
 $('evaluation').textContent=r?`Evaluation: ${(r.cpAfter/100).toFixed(2)} · Expected loss: ${r.expectedLoss}`:'Eval: —';
 document.querySelectorAll('.move').forEach(el=>el.classList.toggle('selected',+el.dataset.ply===selected));
 document.querySelector('.move.selected')?.scrollIntoView({block:'nearest'});drawAnnotations();
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
  b.addEventListener('click',()=>{selected=i+1;variation=null;resetAnnotations();drawBoard();});box.append(b);
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
 selected=0;analysis=null;mode='review';variation=null;resetAnnotations();
 $('match').textContent=parsed.title;
 $('whiteName').textContent=parsed.headers.White||'WHITE';
 $('blackName').textContent=parsed.headers.Black||'BLACK';
 $('detail').textContent=parsed.moves.length+' half-moves · Ready for local analysis';
 renderMoves();drawBoard();
}
async function request(path,options={}){
 const url=cleanUrl($('url').value),token=$('token').value.trim();
 if(!token)throw Error('Enter the access token from your local server.');
 const ctrl=new AbortController(),timer=setTimeout(()=>ctrl.abort(),path==='/play'?12000:20*60*1000);
 try{
  const res=await fetch(url+path,{...options,signal:ctrl.signal,headers:{'Authorization':'Bearer '+token,'Content-Type':'application/json','ngrok-skip-browser-warning':'true'}});
  const body=await res.json().catch(()=>({detail:'Server did not return JSON'}));
  if(!res.ok)throw Error(typeof body.detail==='string'?body.detail:`Server returned ${res.status}`);
  return body;
 }catch(e){
  if(e.name==='AbortError')throw Error(path==='/play'?'Stockfish timed out (12 seconds). Check that the server is running, then press Retry engine move.':'Request timed out.');
  if(e instanceof TypeError)throw Error('Cannot reach the server. Test connection, check that ngrok is online, and restart the local server if necessary.');
  throw e;
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
  analysis=data;renderMoves();selected=1;variation=null;drawBoard();
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
$('first').onclick=()=>{selected=0;variation=null;resetAnnotations();drawBoard();};
$('prev').onclick=()=>{selected=Math.max(0,selected-1);variation=null;resetAnnotations();drawBoard();};
$('next').onclick=()=>{selected=Math.min(parsed?.moves.length||0,selected+1);variation=null;resetAnnotations();drawBoard();};
$('last').onclick=()=>{selected=parsed?.moves.length||0;variation=null;resetAnnotations();drawBoard();};
$('flip').onclick=()=>{flipped=!flipped;localStorage.setItem('chess-board-black-bottom',String(flipped));drawBoard();};
document.addEventListener('keydown',e=>{
 if(mode==='play')return;if(e.altKey||e.ctrlKey||e.metaKey||e.shiftKey||['INPUT','TEXTAREA'].includes(document.activeElement.tagName)||document.activeElement.isContentEditable)return;
 const n=parsed?.moves.length||0;
 const step={ArrowLeft:-1,ArrowRight:1,ArrowUp:-2,ArrowDown:2};
 if(Object.prototype.hasOwnProperty.call(step,e.key)){e.preventDefault();selected=Math.max(0,Math.min(n,selected+step[e.key]));variation=null;resetAnnotations();drawBoard();}
 else if(e.key==='Home'){e.preventDefault();selected=0;variation=null;resetAnnotations();drawBoard();}
 else if(e.key==='End'){e.preventDefault();selected=n;variation=null;resetAnnotations();drawBoard();}
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

$('elo').addEventListener('input',()=>{$('eloValue').textContent=$('elo').value;});
$('retryEngine').onclick=()=>{if(mode==='play'&&!thinking&&playState&&(playState.t===1?'w':'b')!==playSide)stockfishTurn();else $('playInfo').textContent='No pending engine move to retry.';};
$('newGame').onclick=()=>{
 gameSession++;thinking=false;playedMoves=[];mode='play';playSide=$('playColor').value;flipped=playSide==='b';
 playState=PGNImport.parse(START+' w KQkq - 0 1');playHistory=[playState];variation=null;resetAnnotations();
 $('boardHelp').textContent='Play against Stockfish: click a piece and a highlighted destination. Right-drag for arrows.';
 $('playInfo').textContent='New game started. You play '+(playSide==='w'?'White':'Black')+'.';drawBoard();
 if(playSide==='b')stockfishTurn();
};
function playedPGN(){
 if(!playedMoves.length)throw Error('Play at least one move before reviewing your game.');
 const date=new Date().toISOString().slice(0,10).replace(/-/g,'.');
 const safe=n=>String(n).replace(/[\\"\r\n]/g,' ');
 const white=playSide==='w'?'You':'Stockfish '+$('elo').value;
 const black=playSide==='b'?'You':'Stockfish '+$('elo').value;
 const header=`[Event "Practice vs Stockfish"]\n[Site "Chess Study Assistant"]\n[Date "${date}"]\n[White "${safe(white)}"]\n[Black "${safe(black)}"]\n[Result "*"]\n\n`;
 const body=[];for(let i=0;i<playedMoves.length;i++){if(i%2===0)body.push(`${Math.floor(i/2)+1}.`);body.push(playedMoves[i]);}
 return header+body.join(' ')+' *';
}
$('reviewMyGame').onclick=async()=>{
 if(thinking){$('playInfo').textContent='Wait for Stockfish to finish its move before reviewing.';return;}
 try{
  const pgn=playedPGN();
  $('pgn').value=pgn;
  gameSession++;mode='review';variation=null;resetAnnotations();
  $('boardHelp').textContent='Review your played game, or explore variations by clicking pieces.';
  $('playInfo').textContent='Game copied into Game Review. Analyzing your moves…';
  $('analyze').click();
 }catch(e){$('playInfo').textContent=e.message;}
};
$('copyMyPGN').onclick=async()=>{try{await navigator.clipboard.writeText(playedPGN());$('playInfo').textContent='PGN copied to clipboard.';}catch(e){$('playInfo').textContent=e.message;}};
$('returnReview').onclick=()=>{gameSession++;thinking=false;mode='review';variation=null;resetAnnotations();$('boardHelp').textContent='Review: click pieces to explore legal moves. Right-drag for arrows.';drawBoard();};
$('clearArrows').onclick=resetAnnotations;
$('board').addEventListener('contextmenu',e=>e.preventDefault());
$('board').addEventListener('pointerdown',e=>{if(e.button!==2)return;arrowStart=boardSquare(e.target);e.preventDefault();});
document.addEventListener('pointerup',e=>{
 if(e.button!==2||!arrowStart)return;
 const hit=document.elementFromPoint(e.clientX,e.clientY),target=hit?boardSquare(hit):null;
 if(target){const found=marks.findIndex(m=>m.from===arrowStart&&m.to===target);if(found>=0)marks.splice(found,1);else marks.push({from:arrowStart,to:target});drawAnnotations();}
 arrowStart=null;
});
const params=new URLSearchParams(location.search);
if(params.has('pgn')){$('pgn').value=params.get('pgn').slice(0,120000);try{importGame();}catch(e){message(e.message);}}
drawBoard();
})();
