'use strict';
const http = require('node:http');
const fs = require('node:fs');
const path = require('node:path');
const crypto = require('node:crypto');
const { Server } = require('socket.io');
const F = require('./fight.js');
const R = require('./race.js');
const root = path.resolve(__dirname, '..');
const rooms = new Map();
const keys = ['left','right','up','down','jump','light','heavy','special','super','dash','guard','grab'];
const actionKeys = keys.filter(k => !['left','right','up','down','guard'].includes(k));
const ids = new Set(F.characters.map(c => c.id));
const MIME = {'.html':'text/html; charset=utf-8','.js':'text/javascript; charset=utf-8','.css':'text/css; charset=utf-8','.json':'application/json','.png':'image/png','.jpg':'image/jpeg','.svg':'image/svg+xml','.ico':'image/x-icon'};
const server = http.createServer((req, res) => {
  let pathname;
  try { pathname = decodeURIComponent(new URL(req.url, 'http://local').pathname); }
  catch { res.writeHead(400); return res.end('Invalid URL'); }
  if (pathname === '/') pathname = '/web-prototype/index.html';
  // Serve only website assets, never Git metadata, research files or server source.
  const allowed = /^\/(ai-arena|web-prototype)\/[^\0]*\.(html|js|css|png|jpg|svg|ico)$/.test(pathname);
  const file = path.resolve(root, '.' + pathname);
  if (!allowed || !file.startsWith(root + path.sep) || pathname.split('/').some(p => p.startsWith('.'))) {
    res.writeHead(404); return res.end('Not found');
  }
  fs.readFile(file, (err, data) => {
    if (err) { res.writeHead(404); return res.end('Not found'); }
    res.writeHead(200, {'Content-Type': MIME[path.extname(file)] || 'application/octet-stream', 'Cache-Control':'no-store'});
    res.end(data);
  });
});
const io = new Server(server, { transports:['websocket'], serveClient:true, maxHttpBufferSize:8192, perMessageDeflate:false });
function clearInput(room, slot) {
  room.inputs[slot] = {};
  room.pulses[slot] = {};
  room.releases[slot] = {};
}
function snapshot(room) {
  return { code:room.code, mode:room.mode, epoch:room.epoch, state:room.state,
    inputAck:room.players.map((p,i)=>({seq:p?.appliedSeq??-1,input:p?.appliedInput||{}})),
    players:room.players.filter(Boolean).length, ready:room.players.map(p => !!p?.ready),
    disconnected:room.players.some(p => !p || !p.socketId) };
}
function publish(room, reliable = false) {
  const target = io.to(room.code);
  (reliable ? target : target.volatile).emit('state', snapshot(room));
}
function playerFor(socket) {
  const room = rooms.get(socket.data.code);
  const slot = socket.data.slot;
  if (!room || !room.players[slot] || room.players[slot].socketId !== socket.id) throw Error('请重新加入房间');
  return {room, slot, player:room.players[slot]};
}
function leave(socket) {
  const room = rooms.get(socket.data.code), slot = socket.data.slot;
  if (!room || room.players[slot]?.socketId !== socket.id) return;
  socket.leave(room.code);
  room.players[slot] = null;
  room.state = null;
  room.players.forEach(p => { if (p) p.ready = false; });
  [0,1].forEach(i => clearInput(room,i));
  socket.data = {};
  if (!room.players.some(Boolean)) rooms.delete(room.code); else publish(room,true);
}
io.on('connection', socket => {
  function handle(event, fn) {
    socket.on(event, (payload, ack) => {
      try { const data = fn(payload || {}); if (typeof ack === 'function') ack({ok:true,...data}); }
      catch (e) { if (typeof ack === 'function') ack({ok:false,error:e.message}); }
    });
  }
  function attach(room, slot) {
    const p = room.players[slot];
    if (p.socketId && p.socketId !== socket.id) throw Error('该身份已在另一连接使用');
    p.socketId = socket.id;
    p.disconnectedAt = null;
    p.seq = -1;p.appliedSeq=-1;p.appliedInput={};
    socket.data = {code:room.code, slot};
    socket.join(room.code);
    clearInput(room,slot);
    room.last = Date.now();
    publish(room,true);
    return {code:room.code, token:p.token, slot, mode:room.mode, epoch:room.epoch};
  }
  handle('net:ping', () => ({time:performance.now()}));
  handle('resume', b => {
    if(socket.data.code) throw Error('连接已经加入房间');
    const room=rooms.get(String(b.code || ''));
    const slot=room?.players.findIndex(p=>p?.token===b.token);
    if(!room || slot<0) throw Error('房间或身份已失效，请重新加入');
    return attach(room,slot);
  });
  handle('create', b => {
    if (socket.data.code) throw Error('请先退出当前房间');
    let code; do {code = String(crypto.randomInt(100000,1000000));} while (rooms.has(code));
    const room = {code,mode:b.mode==='race'?'race':'fight',players:[null,null],inputs:[{},{}],pulses:[{},{}],releases:[{},{}],state:null,epoch:0,last:Date.now()};
    room.players[0] = {token:crypto.randomBytes(24).toString('hex'),id:ids.has(b.character)?b.character:'gpt',ready:false,socketId:null};
    rooms.set(code,room); return attach(room,0);
  });
  handle('join', b => {
    if (socket.data.code) throw Error('请先退出当前房间');
    const room = rooms.get(String(b.code).trim());
    if (!room) throw Error('房间不存在或已过期');
    const slot = room.players.findIndex(p => !p);
    if (slot < 0) throw Error('房间已满');
    room.players[slot] = {token:crypto.randomBytes(24).toString('hex'),id:ids.has(b.character)?b.character:'gpt',ready:false,socketId:null};
    return attach(room,slot);
  });

  handle('ready', () => {
    const {room,player} = playerFor(socket);
    if (room.state && room.state.phase!=='ended') throw Error('对局尚未结束');
    player.ready = true;
    if (room.players.every(p => p?.socketId && p.ready)) {
      room.epoch++;room.endedSent=false;
      room.state = (room.mode==='fight'?F:R).create({characters:room.players.map(p=>p.id)});
      room.players.forEach((p,i)=>{p.ready=false;clearInput(room,i);});
    }
    room.last=Date.now(); publish(room,true); return {};
  });

  handle('input', b => {
    const {room,slot,player}=playerFor(socket);
    if (!Number.isSafeInteger(b.seq) || b.seq<=player.seq || b.epoch!==room.epoch) return {};
    player.seq=b.seq;
    room.inputs[slot]=Object.fromEntries(keys.map(k=>[k,!!b.input?.[k]]));
    if (Array.isArray(b.pulses)) for(const k of b.pulses) if(actionKeys.includes(k)) room.pulses[slot][k]=Math.min(8,(room.pulses[slot][k]||0)+1);
    room.last=Date.now(); return {};
  });
  handle('release', () => {const {room,slot}=playerFor(socket);clearInput(room,slot);return {};});
  handle('leave', () => {leave(socket);return {};});
  socket.on('disconnect', () => {
    try {const {room,slot,player}=playerFor(socket);player.socketId=null;player.ready=false;player.disconnectedAt=Date.now();clearInput(room,slot);publish(room,true);} catch {}
  });
});
const FixedStep=require('./fixed-step.cjs');
const physicsClock=new FixedStep(F.FPS,6);
physicsClock.advance(performance.now());
const tick = setInterval(() => {
  const steps=physicsClock.advance(performance.now());
  const now=Date.now();
  for(const [code,r] of rooms) {
    if(now-r.last>1800000){io.to(code).emit('room:expired');io.in(code).socketsLeave(code);rooms.delete(code);continue;}
    if(r.state && r.state.phase!=='ended' && r.players.every(p=>p?.socketId)) {
      for(let step=0;step<steps&&r.state.phase!=='ended';step++){
      const merged=r.inputs.map((held,slot)=>{
        const result={...held};
        for(const k of actionKeys){
          if(r.releases[slot][k]){if(r.pulses[slot][k]>0)result[k]=false;delete r.releases[slot][k];}
          else if(r.pulses[slot][k]>0){result[k]=true;r.pulses[slot][k]--;r.releases[slot][k]=true;}
        }
        return result;
      });
      r.players.forEach((p,i)=>{p.appliedInput=merged[i];if(!Object.values(r.pulses[i]).some(n=>n>0))p.appliedSeq=p.seq;});
      (r.mode==='fight'?F:R).step(r.state,merged);
      }
    }
    // Obsolete snapshots may be dropped under backpressure instead of building a queue.
    if(r.state&&r.state.phase!=='ended'&&r.players.every(p=>p?.socketId)&&steps>0||r.state?.phase==='ended'&&!r.endedSent)publish(r,r.state?.phase==='ended' && !r.endedSent);
    r.endedSent=r.state?.phase==='ended';
  }
},1000/60);
server.on('close',()=>clearInterval(tick));
if(require.main===module) server.listen(process.env.PORT||4173,'0.0.0.0',()=>console.log('WebSocket 游戏服务已启动，端口 '+(process.env.PORT||4173)));
module.exports=server;
module.exports.io=io;
