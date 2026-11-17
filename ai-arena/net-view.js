/* Presentation-only snapshot interpolation. Never changes authoritative state. */
(function(root,factory){const api=factory();if(typeof module==='object'&&module.exports)module.exports=api;else root.ArenaView=api;})(typeof window!=='undefined'?window:globalThis,function(){
'use strict';
class Buffer {
 constructor(delay=22){this.delay=delay;this.frames=[];this.epoch=null;this.output={};this.entities={};}
 reset(){this.frames=[];this.epoch=null;this.output={};this.entities={};}
 push(packet,time){
  const s=packet.state;if(!s){this.reset();return;}
  const last=this.frames.at(-1);
  if(this.epoch!==packet.epoch||last&&(last.state.round!==s.round||last.state.phase!==s.phase))this.frames=[];
  this.epoch=packet.epoch;
  if(this.frames.at(-1)?.state.frame>s.frame)return;
  this.frames.push({state:s,time});if(this.frames.length>12)this.frames.shift();
 }
 sample(now){
  const list=this.frames;if(!list.length)return null;
  const target=now-this.delay;
  while(list.length>2&&list[1].time<=target)list.shift();
  let a=list[0],b=list[1]||a;
  // Discrete combat data always comes from a received snapshot, never predicted damage.
  const alpha=a===b?1:Math.max(0,Math.min(1,(target-a.time)/(b.time-a.time||1)));
  const out=Object.assign(this.output,b.state);
  for(const key of ['fighters','players','projectiles'])if(b.state[key]){
   const pool=this.entities[key]||(this.entities[key]=[]);const source=b.state[key];
   pool.length=source.length;
   for(let i=0;i<source.length;i++){
    const p=source[i],old=key==='projectiles'?a.state[key]?.find(q=>q.id===p.id):a.state[key]?.[i];
    const q=pool[i]||(pool[i]={});Object.assign(q,p);
    if(old&&Math.abs((p.x||0)-(old.x||0))<180&&!(key==='players'&&p.falls!==old.falls)){
     for(const axis of ['x','y','z'])if(Number.isFinite(old[axis])&&Number.isFinite(p[axis]))q[axis]=old[axis]+(p[axis]-old[axis])*alpha;
    }
   }
   out[key]=pool;
  }
  return out;
 }
}
const STEP=1000/60;
const clone=value=>typeof structuredClone==='function'?structuredClone(value):JSON.parse(JSON.stringify(value));
const actions=['jump','light','heavy','special','super','dash','grab','tech','dive'];
// Predict locomotion/animation only. Damage, meter, hit effects and match results are
// always copied from the authoritative presentation buffer, never from this clone.
class Predictor {
 constructor(engine,slot,mode='fight'){this.engine=engine;this.slot=slot;this.mode=mode;this.rtt=100;this.reset();}
 reset(){this.state=null;this.commands=[];this.held={};this.pulses={};this.releases={};this.last=null;this.accumulator=0;this.offset={x:0,y:0,z:0};this.epoch=null;this.frame=-1;this.active=false;this.dirty=false;this.visual=null;}
 setRTT(ms){if(Number.isFinite(ms))this.rtt=Math.max(0,Math.min(2000,ms));}
 entity(s=this.state){return s?.[this.mode==='fight'?'fighters':'players']?.[this.slot];}
 queue(command){this.held={...command.input};for(const k of command.pulses||[])if(actions.includes(k))this.pulses[k]=Math.min(8,(this.pulses[k]||0)+1);}
 input(seq,input,pulses,now){
  if(!this.active)return;
  this.advance(now);
  const command={seq,input:{...input},pulses:[...pulses],time:now};
  this.commands.push(command);if(this.commands.length>128)this.commands.shift();
  this.queue(command);this.dirty=true;
 }
 tick(state=this.state){
  const own={...this.held};
  for(const k of actions){
   if(this.releases[k]){if(this.pulses[k]>0)own[k]=false;delete this.releases[k];}
   else if(this.pulses[k]>0){own[k]=true;this.pulses[k]--;this.releases[k]=true;}
  }
  const inputs=[{},{}];inputs[this.slot]=own;
  this.engine.step(state,inputs,this.slot);
 }
 advance(now){
  if(this.last===null){this.last=now;return;}
  const elapsed=Math.max(0,now-this.last);this.last=now;
  const decay=Math.exp(-elapsed/85);for(const axis of ['x','y','z']){this.offset[axis]*=decay;if(Math.abs(this.offset[axis])<.01)this.offset[axis]=0;}
  if(!this.active||!this.state)return;
  // Never run indefinitely on a lost connection or catch up an entire background tab.
  if(now-this.received>500){this.active=false;return;}
  this.accumulator=Math.min(6*STEP,this.accumulator+elapsed);
  while(this.accumulator+1e-7>=STEP){this.tick();this.accumulator-=STEP;this.dirty=false;}
 }
 reconcile(packet,now){
  const s=packet.state;
  if(!s){this.reset();return;}
  if(packet.epoch===this.epoch&&s.frame<this.frame)return;
  this.advance(now);
  const previous=this.entity();
  // Preserve correction through multiple snapshots arriving before the next paint.
  const old=previous?{x:previous.x+this.offset.x,y:previous.y+this.offset.y,z:(previous.z||0)+this.offset.z}:null;
  const snap=this.epoch!==packet.epoch||this.state?.round!==s.round||this.state?.phase!==s.phase||packet.disconnected||!this.active||
   (this.mode==='race'&&previous?.falls!==this.entity(s)?.falls);
  this.epoch=packet.epoch;this.frame=s.frame;this.received=now;
  this.active=!packet.disconnected&&s.phase==='playing';
  const ack=packet.inputAck?.[this.slot];
  // Without a server acknowledgement contract, fall back to interpolation safely.
  if(!ack){this.active=false;this.commands=[];}
  if(snap)this.commands=[];
  this.commands=this.commands.filter(c=>c.seq>(ack?.seq??-1)&&now-c.time<=500);
  this.state=clone(s);this.held={...(ack?.input||{})};this.pulses={};this.releases={};
  const lead=Math.min(250,Math.max(this.rtt/2,this.commands.length?now-this.commands[0].time+STEP:0));
  const start=now-lead;let index=0;
  if(this.active){
   for(let t=start+STEP;t<=now+1e-7;t+=STEP){
    while(index<this.commands.length&&this.commands[index].time<=t)this.queue(this.commands[index++]);
    this.tick();
   }
   while(index<this.commands.length)this.queue(this.commands[index++]);
  }
  const next=this.entity();
  for(const axis of ['x','y','z']){
   const error=old&&Number.isFinite(old[axis])&&Number.isFinite(next?.[axis])?old[axis]-next[axis]:0;
   this.offset[axis]=snap||Math.abs(error)>180?0:error;
  }
  this.last=now;this.accumulator=0;this.dirty=this.commands.length>0;this.visual=null;
 }
 apply(view,now){
  this.advance(now);
  if(!this.active||!this.state||view.phase!=='playing')return view;
  let predicted=this.entity();
  if(this.dirty){
   // A one-tick visual preview responds in the very next paint, even to a tap
   // wholly between physics ticks. It never advances the simulation clock.
   const preview=clone(this.state),pulses={...this.pulses},releases={...this.releases};
   this.tick(preview);this.pulses=pulses;this.releases=releases;predicted=this.entity(preview);
  }
  const key=this.mode==='fight'?'fighters':'players',authoritative=view[key][this.slot];
  const own={...authoritative};
  const fields=this.mode==='fight'?['x','y','vx','vy','facing','action','actionFrame','state','stateFrame','attackPhase','locomotion','guard','crouch','jumped']:['x','y','z','vx','vy','vz','dashTime','diveTime'];
  for(const k of fields)if(predicted[k]!==undefined)own[k]=predicted[k];
  for(const axis of ['x','y','z'])if(Number.isFinite(own[axis]))own[axis]+=this.offset[axis];
  this.visual={x:own.x,y:own.y,z:own.z};
  return {...view,[key]:view[key].map((p,i)=>i===this.slot?own:p)};
 }
}
return {Buffer,Predictor};
});
