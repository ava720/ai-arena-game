'use strict';
// online.html loads fight -> race -> renderer -> Socket.IO -> interpolation -> this entry.
// Authoritative hitFlash/knockback/effects flow through interpolation into ArenaRender.
const $ = id => document.getElementById(id);
const requiredModules = [
  ['AIFight', window.AIFight?.frameData],
  ['AIRace', window.AIRace?.step],
  ['ArenaRender', window.ArenaRender?.fight],
  ['ArenaView', window.ArenaView?.Buffer],
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
let seq = 0;
let joining = false;
const screenCanvas=$('screen');
const screenContext=screenCanvas.getContext('2d',{alpha:false});
const viewBuffer=new ArenaView.Buffer(22);
let renderId=0, latestPacket=null, receivedAt=0;
let frameCount=0, statsStart=0, renderCost=0;
const performanceStats={fps:0,renderMs:0,snapshotAgeMs:0};
window.ArenaPerformance=performanceStats;
function setText(id,value){const el=$(id);if(el.textContent!==value)el.textContent=value;}
function stopRendering(){cancelAnimationFrame(renderId);renderId=0;viewBuffer.reset();latestPacket=null;}
function renderFrame(now){
 renderId=0;
 if(document.hidden||!session||!latestPacket?.state)return;
 const visual=viewBuffer.sample(now);
 if(visual){
  const start=performance.now();
  (session.mode==='fight'?ArenaRender.fight:ArenaRender.race)(screenContext,visual,false);
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
if (query.get('mode') === 'race') $('mode').value = 'race';
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
  socket.emit('input',{epoch:session.epoch,seq:++seq,input:{...input},pulses:Array.from(pulseBuffer)});
  pulseBuffer.clear();
}
function clearControls(notify = true) {
  input = {};
  pulseBuffer.clear();
  activePointers.forEach(r=>r.btn.classList.remove('active'));
  activePointers.clear();
  if(notify && session && socket.connected) socket.emit('release',{});
}
function buildGamepad(mode) {
  const pad = $('pad');
  if (mode === 'fight') {
    pad.innerHTML = `
      <div class="pad-left">
        <button class="pad-btn" data-action="left">←</button>
        <button class="pad-btn" data-action="right">→</button>
        <button class="pad-btn" data-action="down">蹲</button>
        <button class="pad-btn" data-action="jump">跳</button>
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
        <button class="pad-btn" data-action="dash">翻滚</button>
        <button class="pad-btn wide" data-action="grab">推搡</button>
      </div>
    `;
  }

  pad.querySelectorAll('.pad-btn').forEach(btn => {
    const action = btn.dataset.action;

    btn.addEventListener('pointerdown', e => {
      e.preventDefault();
      btn.setPointerCapture(e.pointerId);
      activePointers.set(e.pointerId, { btn, action });
      btn.classList.add('active');
      input[action] = true;
      pulseBuffer.add(action);
      sendInput();
    });

    const release = e => {
      const record = activePointers.get(e.pointerId);
      if (record) {

        activePointers.delete(e.pointerId);
        const stillHeld = Array.from(activePointers.values()).some(r => r.action === record.action);
        if (!stillHeld) { input[record.action] = false; record.btn.classList.remove('active'); }
        sendInput();
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
async function connect(action) {
  if(joining || session) return;
  const code=$('code').value.trim();
  if(action==='join' && !/^\d{6}$/.test(code)) { $('status').textContent='请输入 6 位数字房间码'; return; }
  joining=true;
  try {
    session=await request(action,{code,mode:$('mode').value,character:$('character').value});
    seq=0;
    clearControls();
    $('setup').hidden=true;
    $('room-actions').hidden=false;
    buildGamepad(session.mode);
    $('status').textContent=`房间 ${session.code} · 你是 P${session.slot+1} · 请准备`;
  } catch(e) { $('status').textContent=e.message; }
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
  latestPacket=d;receivedAt=performance.now();viewBuffer.push(d,receivedAt);
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
