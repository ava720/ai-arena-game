'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../fight.js'),R=require('../race.js'),{Predictor}=require('../net-view.js');
const copy=s=>JSON.parse(JSON.stringify(s));
function ready(){const s=F.create();for(let i=0;i<180;i++)F.step(s);return s;}
function packet(s,seq=-1,input={},epoch=1){return {epoch,state:copy(s),inputAck:[{seq,input},{seq:-1,input:{}}],disconnected:false};}
function setup(){const s=ready(),p=new Predictor(F,0);p.setRTT(200);p.reconcile(packet(s),0);return {s,p};}
test('direction and attack respond before any server reply, even between ticks',()=>{
 const {s,p}=setup(),before=JSON.stringify(s);
 p.input(1,{right:true},[],1);let view=p.apply(copy(s),1);assert.ok(view.fighters[0].x>s.fighters[0].x);
 p.input(2,{right:true,light:true},['light'],2);view=p.apply(copy(s),2);assert.equal(view.fighters[0].action,'light');
 assert.equal(JSON.stringify(s),before,'authoritative state is immutable');
});
test('prediction does not create hits, damage, energy awards, counters or winners',()=>{
 const s=ready();s.fighters[0].x=550;s.fighters[1].x=635;
 const p=new Predictor(F,0);p.reconcile(packet(s),0);p.input(1,{heavy:true},['heavy'],1);
 for(let t=17;t<350;t+=17){const v=p.apply(copy(s),t);assert.equal(v.fighters[1].hp,1000);assert.equal(v.fighters[0].energy,s.fighters[0].energy);assert.deepEqual(v.effects,[]);}
 assert.equal(p.state.fighters[1].hp,1000);assert.equal(p.state.lastHits.length,0);
});
test('acknowledged tap is discarded and cannot replay as a second attack',()=>{
 const {s,p}=setup();p.input(1,{light:true},['light'],1);p.input(2,{},[],2);p.apply(copy(s),60);
 F.step(s,[{light:true},{}]);for(let i=0;i<8;i++)F.step(s);
 p.reconcile(packet(s,2,{}),100);assert.equal(p.commands.length,0);
 const serial=p.state.fighters[0].attackSerial;
 for(let t=117;t<300;t+=17)p.apply(copy(s),t);
 assert.equal(p.state.fighters[0].attackSerial,serial);
});
test('small corrections preserve visual continuity and settle instead of snapping',()=>{
 const {s,p}=setup();p.input(1,{right:true},[],1);const old=p.apply(copy(s),80).fighters[0].x;
 const update=packet(s,1,{});update.state.frame+=5;update.state.fighters[0].x=old-35;
 p.reconcile(update,80);const first=p.apply(copy(update.state),80).fighters[0].x;
 assert.ok(Math.abs(first-old)<.001);const last=p.apply(copy(update.state),480).fighters[0].x;
 assert.ok(Math.abs(last-update.state.fighters[0].x)<1);
});
test('round, epoch, disconnect, stale packets and long outages reset or bound prediction',()=>{
 const {s,p}=setup();p.input(1,{right:true},[],1);p.apply(copy(s),100);
 const stale=packet(s);stale.state.frame--;p.reconcile(stale,101);assert.equal(p.frame,s.frame);
 const reset=packet(s,-1,{},2);reset.state.fighters[0].x=100;p.reconcile(reset,110);
 assert.equal(p.commands.length,0);assert.equal(p.offset.x,0);
 p.apply(copy(s),700);assert.equal(p.active,false);
 reset.disconnected=true;p.reconcile(reset,710);assert.equal(p.active,false);
});
test('without acknowledgement metadata, older server safely uses interpolation',()=>{
 const s=ready(),p=new Predictor(F,0);p.reconcile({epoch:1,state:s},0);p.input(1,{right:true},[],1);const view=copy(s);assert.equal(p.apply(view,2),view);
});
test('race movement is predicted without replacing authoritative progress and falls',()=>{
 const s=R.create();while(s.phase==='countdown')R.step(s);const p=new Predictor(R,0,'race');p.reconcile(packet(s),0);p.input(1,{up:true},[],1);
 const v=p.apply(copy(s),17);assert.ok(v.players[0].z>s.players[0].z);assert.equal(v.players[0].checkpoint,s.players[0].checkpoint);assert.equal(v.players[0].falls,s.players[0].falls);
});
test('200 ms RTT with jitter and dropped snapshots keeps local movement immediate and converges on release',()=>{
 const s=ready(),p=new Predictor(F,0);p.setRTT(200);p.reconcile(packet(s),0);
 const downlink=[],uplink=[];let held={},ack=-1,previousX=s.fighters[0].x,maxJump=0;
 for(let tick=1;tick<=150;tick++){
  const now=tick*1000/60;
  if(tick===1||tick===45){const seq=tick===1?1:2,input=tick===1?{right:true}:{};p.input(seq,input,[],now);uplink.push({due:now+100,seq,input});}
  while(uplink[0]?.due<=now){const c=uplink.shift();held=c.input;ack=c.seq;}
  F.step(s,[held,{}]);
  if(tick%5!==0)downlink.push({due:now+100+(tick%3)*4,packet:packet(s,ack,held)});
  while(downlink[0]?.due<=now){const c=downlink.shift();p.reconcile(c.packet,now);}
  const visual=p.apply(copy(s),now),x=visual.fighters[0].x;
  if(tick===1)assert.ok(x>380,'local movement precedes 100 ms uplink');
  if(tick<60)maxJump=Math.max(maxJump,Math.abs(x-previousX));previousX=x;
 }
 assert.ok(maxJump<20,'routine corrections do not visibly teleport');
 assert.ok(Math.abs(previousX-s.fighters[0].x)<1,'release eventually converges exactly');
 assert.equal(p.commands.length,0);
});
