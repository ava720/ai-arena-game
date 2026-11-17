'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const {io:client}=require('socket.io-client');
const server=require('../server.cjs'),io=server.io;
const wait=ms=>new Promise(r=>setTimeout(r,ms));
const emit=(s,event,data={})=>new Promise((resolve,reject)=>s.timeout(2000).emit(event,data,(e,d)=>e?reject(e):resolve(d)));
test('WebSocket rooms, real-time inputs, pulses, pause/rejoin and leave',async()=>{
 await new Promise(r=>server.listen(0,'127.0.0.1',r));let url='http://127.0.0.1:'+server.address().port;
 let clients=[];async function connect(){let c=client(url,{transports:['websocket'],forceNew:true,reconnection:false});clients.push(c);await new Promise((r,j)=>{c.once('connect',r);c.once('connect_error',j)});return c}
 try{
 const a=await connect(),b=await connect(),third=await connect();let sa,sb;a.on('state',d=>sa=d);b.on('state',d=>sb=d);
 assert.ok((await emit(a,'net:ping')).ok);
 const room=await emit(a,'create',{mode:'fight',character:'gpt'});assert.ok(room.ok);
 const guest=await emit(b,'join',{code:room.code,character:'deepseek'});assert.ok(guest.ok);
 assert.equal((await emit(third,'join',{code:room.code})).ok,false);
 await emit(a,'ready');await emit(b,'ready');await wait(70);assert.equal(sa.epoch,1);assert.ok(sb.state);
 for(let i=0;i<150&&sa.state.phase!=='playing';i++)await wait(50);assert.equal(sa.state.phase,'playing');let x=sa.state.fighters[0].x;
 await emit(a,'input',{epoch:1,seq:1,input:{right:true},pulses:[]});await wait(150);
 assert.ok(sa.state.fighters[0].x>x);assert.equal(sa.inputAck[0].seq,1);assert.equal(sa.inputAck[0].input.right,true);
 await emit(a,'release');let stable=sa.state.fighters[0].x;await wait(100);assert.equal(sa.state.fighters[0].x,stable);
 // A complete press/release arriving between server ticks must still trigger a jump.
 await emit(a,'input',{epoch:1,seq:2,input:{jump:true},pulses:['jump']});await emit(a,'input',{epoch:1,seq:3,input:{},pulses:[]});await wait(100);assert.ok(sa.state.fighters[0].y<480);assert.equal(sa.inputAck[0].seq,3);
 b.disconnect();await wait(100);let frame=sa.state.frame;await wait(100);assert.equal(sa.state.frame,frame);assert.equal(sa.disconnected,true);
 const rejoined=await connect();assert.ok((await emit(rejoined,'resume',{code:room.code,token:guest.token})).ok);await wait(100);assert.ok(sa.state.frame>frame);
 await emit(rejoined,'leave');await wait(60);assert.equal(sa.state,null);assert.equal(sa.players,1);
 await emit(a,'leave');
 const raceRoom=await emit(a,'create',{mode:'race'});await emit(rejoined,'join',{code:raceRoom.code});
 await emit(a,'ready');await emit(rejoined,'ready');
 for(let i=0;i<100&&sa.state?.phase!=='playing';i++)await wait(50);
 assert.equal(sa.mode,'race');assert.equal(sa.state.phase,'playing');
 const initialZ=sa.state.players[0].z;
 await emit(a,'input',{epoch:1,seq:1,input:{up:true},pulses:[]});await wait(150);
 assert.ok(sa.state.players[0].z>initialZ);assert.equal(sa.inputAck[0].seq,1);
 assert.equal((await fetch(url+'/socket.io/socket.io.js')).status,200);
 assert.equal((await fetch(url+'/api/room',{method:'POST'})).status,404);
 }finally{clients.forEach(c=>c.disconnect());await new Promise(r=>io.close(r));}
});
