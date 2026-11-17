'use strict';
const test=require('node:test'),assert=require('node:assert/strict');
const F=require('../fighter-engine.js'),P=require('../party-controller.js');
function fight(){const s=F.create();for(let i=0;i<180;i++)F.step(s);return s;}
function party(){const s=P.create();for(let i=0;i<180;i++)P.step(s);return s;}
test('template is 4/3/10 with 12 tick hitstun for every fighter',()=>{
 for(const id of F.characters.map(c=>c.id)){const m=F.frameData[id].light;assert.deepEqual([m.startup,m.active,m.recovery,m.stun],[4,3,10,12]);}
});
test('FSM follows idle -> attack -> recovery -> idle, and rejects invalid direct recovery',()=>{
 const s=fight(),f=s.fighters[0];assert.equal(f.state,'idle');assert.throws(()=>F.transition(f,'recovery'));
 F.step(s,[{light:true},{}]);assert.equal(f.state,'attack');
 for(let i=0;i<6;i++)F.step(s);assert.equal(f.state,'recovery');
 for(let i=0;i<10;i++)F.step(s);assert.equal(f.state,'idle');
});
test('hitboxes only exist on 3 active ticks; recovery cannot start a whiff cancel',()=>{
 const s=fight();let active=0;for(let i=0;i<17;i++){
  F.step(s,[{light:i===0,heavy:i===8},{}]);if(s.hitboxes.length)active++;
  if(i===8)assert.equal(s.fighters[0].action,'light');
 }assert.equal(active,3);
});
test('hit immediately interrupts FSM without waiting for hit-stop to finish',()=>{
 const s=fight();s.fighters[0].x=550;s.fighters[1].x=635;
 F.step(s,[{light:true},{}]);for(let i=0;i<4;i++)F.step(s);
 assert.equal(s.fighters[1].state,'hitstun');assert.equal(s.fighters[1].stun,12);
});
test('equal mass impulse conserves momentum, loses energy and separates cylinders',()=>{
 const s=party(),[a,b]=s.players;a.x=-10;b.x=10;a.z=b.z=100;a.vx=100;b.vx=-100;
 const momentum=a.vx+b.vx,energy=a.vx*a.vx+b.vx*b.vx;
 P.collidePlayers(s);assert.ok(Math.abs(a.vx+b.vx-momentum)<1e-9);
 assert.ok(a.vx<0&&b.vx>0);assert.ok(a.vx*a.vx+b.vx*b.vx<energy);
 assert.ok(Math.hypot(a.x-b.x,a.z-b.z)>=36-1e-9);
});
test('rest overlap is finite; vertically separated cylinders do not collide',()=>{
 const s=party(),[a,b]=s.players;a.x=b.x=0;a.z=b.z=100;P.collidePlayers(s);assert.ok(Number.isFinite(a.x));
 a.x=b.x=0;a.y=100;P.collidePlayers(s);assert.equal(a.x,0);assert.equal(b.x,0);
});
test('acceleration ramps velocity; damping decays it without reversal; jump returns to ground',()=>{
 const s=party(),a=s.players[0];P.step(s,[{up:true},{}]);const first=a.vz;assert.ok(first>0&&first<P.rules.runSpeed);
 for(let i=0;i<10;i++)P.step(s,[{up:true},{}]);const speed=a.vz;P.step(s);assert.ok(a.vz>0&&a.vz<speed);
 a.vx=a.vz=0;P.step(s,[{jump:true},{}]);assert.ok(a.y>0);for(let i=0;i<70;i++)P.step(s);assert.equal(a.y,0);assert.equal(a.vy,0);
});
