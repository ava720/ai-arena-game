'use strict';
// online.html loads fight -> race -> renderer -> Socket.IO -> interpolation -> this entry.
// Authoritative hitFlash/knockback/effects flow through interpolation into ArenaRender.
const $ = id => document.getElementById(id);
const requiredModules = [
  ['AIFight', window.AIFight?.frameData],
  ['AIRace', window.AIRace?.step],
  ['ArenaRender', window.ArenaRender?.fight],
  ['ArenaView', window.ArenaView?.Predictor],
  ['Socket.IO', window.io]
];
const missingModules=requiredModules.filter(([,value])=>!value).map(([name])=>name);
if(missingModules.length){
  $('status').textContent='游戏模块加载失败：'+missingModules.join('、')+'。请刷新页面重试。';
  throw new Error('Missing game modules: '+missingModules.join(', '));
}

let session = null;
let input = {};
const pulseBuffer = new Set();
const activePointers = new Map();
const activeKeys=new Map();
const keyboardBindings={
 fight:{ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowDown:'down',KeyS:'down',ArrowUp:'jump',KeyW:'jump',Space:'jump',ShiftLeft:'run',ShiftRight:'run',KeyJ:'light',KeyK:'heavy',KeyL:'special',KeyU:'super',KeyI:'guard',KeyO:'dash'},
 race:{ArrowLeft:'left',KeyA:'left',ArrowRight:'right',KeyD:'right',ArrowUp:'up',KeyW:'up',ArrowDown:'down',KeyS:'down',Space:'jump',ShiftLeft:'dash',ShiftRight:'dash',KeyJ:'dive',KeyK:'grab'}
};
const engines={fight:window.FighterEngine,race:window.PartyController};
const modeName=mode=>mode==='fight'?'格斗模式':'派对模式';
function selectMode(mode){
 if(session||joining)return;
 $('mode').value=mode==='race'?'race':'fight';
 for(const name of ['fight','race']){const selected=name===$('mode').value,button=$('mode-'+name);button.setAttribute('aria-pressed',String(selected));button.className='btn '+(selected?'btn-primary':'btn-secondary');}
}
$('mode-fight').onclick=()=>selectMode('fight');$('mode-race').onclick=()=>selectMode('race');
function updateAction(action){
 const held=Array.from(activePointers.values()).some(r=>r.action===action)||Array.from(activeKeys.values()).includes(action);
 if(!!input[action]===held)return;
 input[action]=held;if(held)pulseBuffer.add(action);
 $('pad').querySelectorAll('.pad-btn').forEach(btn=>{if(btn.dataset.action===action)btn.classList.toggle('active',held);});
 sendInput();
}
let seq = 0;
let joining = false;
const screenCanvas=$('screen');
const screenContext=screenCanvas.getContext('2d',{alpha:false});
const viewBuffer=new ArenaView.Buffer(50);
let predictor=null,networkRTT=100;
let renderId=0, latestPacket=null, receivedAt=0;
let frameCount=0, statsStart=0, renderCost=0;
const performanceStats={fps:0,renderMs:0,snapshotAgeMs:0};
window.ArenaPerformance=performanceStats;
function setText(id,value){const el=$(id);if(el.textContent!==value)el.textContent=value;}
function stopRendering(){cancelAnimationFrame(renderId);renderId=0;viewBuffer.reset();predictor?.reset();latestPacket=null;ArenaRender.resetFeedback(screenContext);}
function renderFrame(now){
 renderId=0;
 if(document.hidden||!session||!latestPacket?.state)return;
 const interpolated=viewBuffer.sample(now);
 const visual=interpolated&&predictor?predictor.apply(interpolated,now):interpolated;
 if(visual){
  const start=performance.now();
  ArenaRender.forMode(session.mode,screenContext,visual,false,now);
  renderCost+=performance.now()-start;frameCount++;
  if(!statsStart)statsStart=now;
  if(now-statsStart>=1000){performanceStats.fps=Math.round(frameCount*1000/(now-statsStart));performanceStats.renderMs=+(renderCost/frameCount).toFixed(2);screenCanvas.dataset.fps=performanceStats.fps;screenCanvas.dataset.renderMs=performanceStats.renderMs;frameCount=0;renderCost=0;statsStart=now;}
  performanceStats.snapshotAgeMs=Math.round(now-receivedAt);
  if(now-receivedAt>500){screenContext.fillStyle='#091529bb';screenContext.fillRect(350,315,580,70);ArenaRender.txt(screenContext,'网络波动，等待同步…',640,360,26,'#fff','center');}
 }
 if(latestPacket.state.phase!=='ended'&&!latestPacket.disconnected)renderId=requestAnimationFrame(renderFrame);
}
function startRendering(){if(!renderId&&!document.hidden)renderId=requestAnimationFrame(renderFrame);}

const socket = io({transports:['websocket'], autoConnect:true, reconnection:true});
const query = new URLSearchParams(location.search);
selectMode(query.get('mode'));
if (query.get('room')) $('code').value = query.get('room');

function request(event, payload = {}) {
  return new Promise((resolve,reject) => {
    if (!socket.connected) return reject(Error('连接尚未建立，请稍后重试'));
    socket.timeout(8000).emit(event,payload,(err,data) => {
      if(err) return reject(Error('服务器响应超时，请重新连接后确认房间状态'));
      if(!data?.ok) return reject(Error(data?.error || '操作失败'));
      resolve(data);
    });
  });
}
function sendInput() {
  if(!session || !socket.connected) return;
  const command={epoch:session.epoch,seq:++seq,input:{...input},pulses:Array.from(pulseBuffer)};
  predictor?.input(command.seq,command.input,command.pulses,performance.now());
  socket.emit('input',command);
  pulseBuffer.clear();
}
function clearControls(notify = true) {
  input = {};
  pulseBuffer.clear();
  activePointers.forEach(r=>r.btn.classList.remove('active'));
  activePointers.clear();activeKeys.clear();
  $('pad').querySelectorAll('.pad-btn').forEach(btn=>btn.classList.remove('active'));
  if(notify && session && socket.connected){sendInput();socket.emit('release',{});}
}
function buildGamepad(mode) {
  const pad = $('pad');
  setText('input-help',mode==='fight'?'键盘：A/D 移动 · W/空格 跳/受身 · S 蹲 · Shift 跑 · J 轻击 · K 重击 · L 技能 · U 必杀 · I 防御 · O 突进':'键盘：WASD / 方向键移动 · 空格跳 · Shift 滚动 · J 飞扑 · K 推搡');
  if (mode === 'fight') {
    pad.innerHTML = `
      <div class="pad-left">
        <button class="pad-btn" data-action="left">←</button>
        <button class="pad-btn" data-action="right">→</button>
        <button class="pad-btn" data-action="down">蹲</button>
        <button class="pad-btn" data-action="jump">跳 / 受身</button><button class="pad-btn" data-action="run">跑</button>
      </div>
      <div class="pad-right">
        <button class="pad-btn" data-action="light">轻击</button>
        <button class="pad-btn" data-action="heavy">重击</button>
        <button class="pad-btn" data-action="guard">防御</button>
        <button class="pad-btn" data-action="special">技能</button>
        <button class="pad-btn" data-action="super">必杀</button>
        <button class="pad-btn" data-action="dash">突进</button>
      </div>
    `;
  } else {
    pad.innerHTML = `
      <div class="pad-left">
        <button class="pad-btn" data-action="left">←</button>
        <button class="pad-btn" data-action="right">→</button>
        <button class="pad-btn" data-action="up">加速</button>
        <button class="pad-btn" data-action="down">减速</button>
      </div>
      <div class="pad-right">
        <button class="pad-btn wide" data-action="jump">跳跃</button>
        <button class="pad-btn" data-action="dash">滚动</button>
        <button class="pad-btn wide" data-action="dive">飞扑</button><button class="pad-btn wide" data-action="grab">推搡</button>
      </div>
    `;
  }

  pad.querySelectorAll('.pad-btn').forEach(btn => {
    const action = btn.dataset.action;

    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      btn.blur();
      btn.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { btn, action });
      btn.classList.add('active');
      updateAction(action);
    });

    const release = e => {
      const record = activePointers.get(e.pointerId);
      if (record) {

        activePointers.delete(e.pointerId);
        updateAction(record.action);
      }
    };

    btn.addEventListener('pointerup', release);
    btn.addEventListener('pointercancel', release);
    btn.addEventListener('lostpointercapture', release);
  });
}


function showLobby(message) {
  $('game-view').hidden=true;
  $('lobby-view').hidden=false;
  $('status').textContent=message;
}
function leaveView(message='已退出房间') {
  exitPresentation();
  clearControls();
  stopRendering();
  session=null;
  $('match-result').hidden=true;
  $('setup').hidden=false;
  $('room-actions').hidden=true;
  $('ready').disabled=false;
  $('ready').textContent='我已准备好（开始对局）';
  showLobby(message);
}
// Fullscreen must be requested synchronously inside the user's click handler.
let presentationActive=false,presentationGeneration=0,ownsFullscreen=false;
function syncViewport(){
 const viewport=window.visualViewport;
 const width=viewport?.width||window.innerWidth,height=viewport?.height||window.innerHeight;
 if(width>0&&height>0){document.documentElement.style.setProperty('--viewport-width',width+'px');document.documentElement.style.setProperty('--viewport-height',height+'px');}
}
function exitPresentation(){
 presentationActive=false;presentationGeneration++;
 try{window.screen?.orientation?.unlock?.();}catch{}
 if(ownsFullscreen&&(document.fullscreenElement||document.webkitFullscreenElement)){
  try{const exit=document.exitFullscreen||document.webkitExitFullscreen;Promise.resolve(exit?.call(document)).catch(()=>{});}catch{}
 }
 ownsFullscreen=false;syncViewport();
}
function enterPresentation(){
 presentationActive=true;const generation=++presentationGeneration;
 syncViewport();const root=document.documentElement;
 const request=root.requestFullscreen||root.webkitRequestFullscreen;
 if(!request)return; // CSS portrait rotation is always available, even without fullscreen.
 let pending;
 try{pending=document.fullscreenElement||document.webkitFullscreenElement?Promise.resolve():request.call(root);}catch{return;}
 Promise.resolve(pending).then(async()=>{
  ownsFullscreen=(document.fullscreenElement||document.webkitFullscreenElement)===root;
  if(!presentationActive){exitPresentation();return;}
  if(generation!==presentationGeneration)return;
  try{await window.screen?.orientation?.lock?.('landscape');}catch{/* Safari/policy rejection: CSS remains active. */}
  if(!presentationActive){exitPresentation();return;}
  syncViewport();
 }).catch(()=>{syncViewport();});
}
window.addEventListener('resize',syncViewport);
window.visualViewport?.addEventListener('resize',syncViewport);
document.addEventListener('fullscreenchange',syncViewport);
document.addEventListener('webkitfullscreenchange',syncViewport);
syncViewport();
async function connect(action) {
  if(joining || session) return;
  const code=$('code').value.trim();
  if(action==='join' && !/^\d{6}$/.test(code)) { $('status').textContent='请输入 6 位数字房间码'; return; }
  enterPresentation();
  joining=true;
  try {
    session=await request(action,{code,mode:$('mode').value,character:$('character').value});
    seq=0;
    $('mode').value=session.mode;
    clearControls();
    $('setup').hidden=true;
    $('room-actions').hidden=false;
    buildGamepad(session.mode);
    $('status').textContent=`房间 ${session.code} · ${modeName(session.mode)} · 你是 P${session.slot+1} · 请准备`;
  } catch(e) { exitPresentation();$('status').textContent=e.message; }
  finally { joining=false; }
}
$('create').onclick=()=>connect('create');
$('join').onclick=()=>connect('join');
async function sendReady() {
  $('ready').disabled=true;
  $('hud-ready').disabled=true;
  $('result-ready').disabled=true;
  try { await request('ready'); }
  catch(e) { $('status').textContent=e.message; $('hud-text').textContent=e.message; $('ready').disabled=false; $('hud-ready').disabled=false; }
}
$('ready').onclick=sendReady;
$('hud-ready').onclick=sendReady;
$('result-ready').onclick=sendReady;
$('result-exit').onclick=()=>$('hud-exit').click();
$('share').onclick=async()=>{
  if(!session) return;
  const link=`${location.origin}${location.pathname}?room=${session.code}&mode=${session.mode}`;
  try { await navigator.clipboard.writeText(link); $('status').textContent=`邀请链接已复制 · 房间 ${session.code}`; }
  catch { $('status').textContent=`请复制邀请链接：${link}`; }
};
$('hud-exit').onclick=async()=>{
  clearControls();
  try { await request('leave'); } catch { socket.disconnect(); socket.connect(); }
  leaveView();
};
socket.on('state',d=>{
  if(!session || d.code!==session.code) return;
  if(session.epoch!==d.epoch){session.epoch=d.epoch;clearControls();viewBuffer.reset();}
  const wasPlaying=latestPacket?.state?.phase==='playing';
  latestPacket=d;receivedAt=performance.now();viewBuffer.push(d,receivedAt);
  if(!predictor||predictor.slot!==session.slot||predictor.mode!==session.mode)predictor=new ArenaView.Predictor(engines[session.mode],session.slot,session.mode);
  predictor.setRTT(networkRTT);predictor.reconcile(d,receivedAt);
  const ready=!!d.ready[session.slot];
  $('ready').disabled=ready;
  setText('ready',ready?'已准备，等待对手':'我已准备好（开始对局）');
  if(!d.state){
    stopRendering();
    showLobby(`房间 ${session.code} · ${d.players}/2 人 · ${d.disconnected?'等待对方连接':ready?'已准备，等待对手':'请点击准备'}`);
    return;
  }
  $('lobby-view').hidden=true;
  $('game-view').hidden=false;
  if(d.state.phase==='playing'&&!wasPlaying)screenCanvas.focus({preventScroll:true});
  startRendering();
  let info=`房间 ${session.code} · 你是 P${session.slot+1}`;
  if(d.disconnected) info+=' · 对方断线，游戏已暂停';
  const ended=d.state.phase==='ended';
  $('hud-ready').hidden=!ended;
  const resultPanel=$('match-result');
  resultPanel.hidden=!ended;
  if(ended){
    setText('result-title',d.state.winner===null?'双方平局':`P${d.state.winner+1} 获胜`);
    setText('result-detail',session.mode==='fight'?`回合 ${d.state.wins.join(' : ')} · P1 击倒 ${d.state.stats[0].knockdowns} / 最大连击 ${d.state.stats[0].maxCombo} · P2 击倒 ${d.state.stats[1].knockdowns} / 最大连击 ${d.state.stats[1].maxCombo}`:`竞速结束 · 跌落 ${d.state.players[session.slot].falls} 次`);
    $('result-ready').disabled=ready;setText('result-ready',ready?'已准备，等待对手':'再来一局');
  }

  $('hud-ready').disabled=ready;
  setText('hud-ready',ready?'等待对手':'再来一局');
  if(ended) info+=d.state.winner===null?' · 平局':` · P${d.state.winner+1} 获胜`;
  setText('hud-text',info);
});
socket.on('connect',async()=>{
  if(!session){$('status').textContent='服务器已连接，请创建或加入房间';return;}
  // Reconnect authenticates the original slot; never silently creates another player.
  try {
    session=await request('resume',{code:session.code,token:session.token});
    seq=0;clearControls();
    $('hud-text').textContent='连接已恢复';
  } catch(e){leaveView(e.message);}
});
socket.on('disconnect',()=>{
  clearControls(false);stopRendering();
  $('status').textContent='连接已中断，正在重连…';
  $('hud-text').textContent='连接已中断，正在重连…';
});
socket.on('connect_error',()=>{
  $('status').textContent='WebSocket 连接失败，请检查服务器或代理是否支持 WebSocket';
  $('hud-text').textContent='连接失败，正在重试…';
});
socket.on('room:expired',()=>leaveView('房间已过期，请重新创建'));
window.addEventListener('blur',()=>clearControls());
window.addEventListener('pagehide',()=>clearControls());
document.addEventListener('visibilitychange',()=>{if(document.hidden){clearControls();cancelAnimationFrame(renderId);renderId=0;}else startRendering();});

// RTT sampling is telemetry, not state polling; only one probe can be in flight.
let pingPending=false,hasRTT=false;
function measureRTT(){
 if(!socket.connected||pingPending)return;
 pingPending=true;const start=performance.now();
 socket.timeout(3000).emit('net:ping',{},(err,data)=>{
  pingPending=false;if(err||!data?.ok)return;
  const sample=performance.now()-start;networkRTT=hasRTT?networkRTT*.6+sample*.4:sample;hasRTT=true;
  predictor?.setRTT(networkRTT);performanceStats.rttMs=Math.round(networkRTT);
 });
}
socket.on('connect',measureRTT);
setInterval(measureRTT,2000);

window.addEventListener('keydown',e=>{
 if(!session||!latestPacket?.state||latestPacket.disconnected||latestPacket.state.phase!=='playing'||document.hidden)return;
 if(e.ctrlKey||e.metaKey||e.altKey||e.target?.isContentEditable||/^(INPUT|TEXTAREA|SELECT|BUTTON)$/.test(e.target?.tagName||''))return;
 const action=keyboardBindings[session.mode]?.[e.code];if(!action)return;
 e.preventDefault();if(e.repeat||activeKeys.has(e.code))return;
 activeKeys.set(e.code,action);updateAction(action);
});
window.addEventListener('keyup',e=>{
 const action=activeKeys.get(e.code);if(!action)return;
 e.preventDefault();activeKeys.delete(e.code);updateAction(action);
});
