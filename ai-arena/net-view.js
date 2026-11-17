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
return {Buffer};
});
