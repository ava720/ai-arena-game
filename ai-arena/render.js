(function(g){
'use strict';
const C={gpt:['#91f2b8','#26756e'],deepseek:['#79c7ff','#2f5e9c'],claude:['#f9b58c','#995647'],gemini:['#c2a2ff','#6050ab']};
function box(c,x,y,w,h,r,fill){c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,r);c.fill()}
function txt(c,t,x,y,size=20,color='#fff',align='left'){c.fillStyle=color;c.font=`600 ${size}px "Segoe UI",sans-serif`;c.textAlign=align;c.fillText(t,x,y)}
function line(c,points,color,width){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke()}
// Art sheets have opaque backgrounds and three views. Paths trace the side view in
// half-resolution sheet coordinates, relative to source x=312. Bake once, not per frame.
const art={
 gpt:{name:'奶娃',file:'naiwa',native:-1,b:[50,74,126,262],path:'M84 113 Q82 109 85 104 Q88 98 90 93 Q95 76 114 76 Q140 72 151 112 L154 116 Q170 146 174 208 L173 240 L168 245 L163 245 Q156 257 143 263 L138 277 L132 312 L130 314 Q130 320 135 327 Q136 333 130 333 L82 334 Q70 334 79 329 L89 324 Q71 328 74 322 L110 311 L89 263 Q72 257 62 246 Q51 231 53 209 L55 195 L52 198 Q66 166 85 139 L88 131 Q93 127 84 113 Z'},
 deepseek:{name:'咕咕嘎嘎',file:'gugugaga',native:1,b:[72,31,84,319],path:'M75 57 Q80 31 104 33 Q122 32 134 44 Q141 50 141 66 L140 72 L143 80 L140 85 L140 94 L136 99 Q136 107 119 107 L119 112 Q129 116 135 137 Q150 167 147 210 L146 226 L140 229 Q140 251 133 277 L127 304 L124 305 L124 317 Q133 316 143 323 Q154 328 154 338 Q151 347 137 348 L99 346 Q92 345 94 334 L97 315 L99 312 L98 303 L94 302 Q91 276 88 260 Q73 239 74 219 L77 197 Q72 187 75 165 L76 138 Q77 118 86 108 L89 107 L91 98 Q69 81 75 57 Z'},
 claude:{name:'豆包',file:'doubao',native:1,b:[58,19,92,341],path:'M62 58 Q69 19 96 21 Q110 19 122 24 Q148 29 148 50 L144 62 L143 73 L141 82 L143 89 L140 92 Q140 107 130 108 L123 108 L123 112 Q133 113 132 124 L136 133 Q145 148 142 173 L137 175 L135 174 L140 301 L135 300 L133 305 L122 306 L121 330 Q125 336 139 341 Q149 342 148 351 Q146 356 132 354 L129 357 L88 358 Q81 357 84 347 L87 337 L83 336 L84 305 L73 303 L81 224 L87 182 L84 133 L86 126 Q78 124 82 111 L81 108 L66 104 Q57 95 62 58 Z'},
 gemini:{name:'猪猪侠',file:'zhuzhuxia',native:-1,b:[39,69,133,236],path:'M52 91 Q54 86 65 82 Q68 70 87 71 Q110 69 128 75 Q166 82 170 123 Q173 172 143 189 L135 193 Q135 212 143 232 L146 240 Q152 244 148 252 L145 253 Q142 263 130 270 L126 282 L125 298 Q125 303 121 303 L80 303 Q75 302 81 295 L85 289 L79 269 Q57 258 55 243 Q53 232 61 213 L70 196 Q58 193 51 187 L47 174 Q39 172 41 160 Q40 151 49 148 Q48 120 56 106 Q49 101 52 91 Z'}
};
const sprites=new Map(),pending=new Map();
function loadCharacter(id){
 if(sprites.has(id))return Promise.resolve();
 if(pending.has(id))return pending.get(id);
 const a=art[id],img=new Image();
 const task=new Promise((resolve,reject)=>{
  img.onerror=()=>reject(Error('无法加载'+a.name+'的图片，请重试'));
  img.onload=async()=>{try{
   if(img.decode)await img.decode();
   const [x,y,w,h]=a.b,tile=document.createElement('canvas');tile.width=w*2;tile.height=h*2;
   const ctx=tile.getContext('2d');ctx.scale(2,2);ctx.translate(-x,-y);ctx.clip(new Path2D(a.path));
   ctx.drawImage(img,-156,0,512,383);sprites.set(id,tile);resolve();
  }catch{reject(Error('无法准备'+a.name+'的图片，请重试'));}};
  img.src='assets/'+a.file+'.png';
 }).finally(()=>pending.delete(id));pending.set(id,task);return task;
}
function preloadCharacters(){return Promise.all(Object.keys(art).map(loadCharacter));}
let bgImg=null,backgroundLoad=null;
function loadBackgroundImage(src){
 return new Promise((resolve,reject)=>{
  const img=new Image();
  img.onload=()=>resolve(img);
  img.onerror=reject;
  img.src=src;
 }).then(async img=>{
  if(img.decode)await img.decode();
  return img;
 });
}
function preloadFightBackground(){
 if(bgImg)return Promise.resolve(bgImg);
 if(!backgroundLoad){
  backgroundLoad=loadBackgroundImage('assets/bg_fighting.png')
   .catch(()=>loadBackgroundImage('assets/bg_fighting.jpg'))
   .then(img=>{bgImg=img;return img;})
   .catch(()=>{throw Error('无法加载格斗背景，请重试');})
   .finally(()=>{backgroundLoad=null;});
 }
 return backgroundLoad;
}
function preloadMatchAssets(mode){
 const assets=[preloadCharacters()];
 if(mode==='fight')assets.push(preloadFightBackground());
 return Promise.all(assets);
}
function drawSprite(c,id,height,facing){
 const tile=sprites.get(id);if(!tile)return;
 const width=height*tile.width/tile.height;
 c.save();if((facing<0?-1:1)!==art[id].native)c.scale(-1,1);
 c.drawImage(tile,-width/2,-height,width,height);c.restore();
}
function fighter(c,f,scale=1,frame=0){
 const dir=f.facing||1,m=g.AIFight?.frameData?.[f.id]?.[f.action];
 const active=m&&f.actionFrame>=m.startup&&f.actionFrame<m.startup+m.active;
 c.save();c.translate(f.x,f.y);c.scale(scale,scale);
 if(f.knockdown)c.rotate(-dir*Math.PI/2);
 if(m?.damage&&active){c.translate(8*dir,0);c.rotate(.10*dir);}
 const height=f.crouch?95:145;drawSprite(c,f.id,height,dir);
 if(f.guard){c.strokeStyle='#99d9ff';c.lineWidth=5;c.strokeRect(dir*30-4,-height,8,height);}
 c.restore();
}
function portrait(canvas,id,large=false){if(!sprites.has(id)){loadCharacter(id).then(()=>portrait(canvas,id,large)).catch(()=>{});return;}const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);let col=C[id]||C.gpt;let grad=c.createRadialGradient(canvas.width/2,canvas.height*.55,10,canvas.width/2,canvas.height*.55,canvas.width*.55);grad.addColorStop(0,col[1]+'66');grad.addColorStop(1,'#00000000');c.fillStyle=grad;c.fillRect(0,0,canvas.width,canvas.height);fighter(c,{id,x:canvas.width/2,y:canvas.height-7,facing:1},large?1.8:1.15);}
function hero(canvas){if(!sprites.has('deepseek')||!sprites.has('gpt')){preloadCharacters().then(()=>hero(canvas)).catch(()=>{});return;}const c=canvas.getContext('2d');c.clearRect(0,0,640,360);c.strokeStyle='#426c6240';for(let i=0;i<9;i++){c.beginPath();c.ellipse(330,280,i*35,i*9,0,0,Math.PI*2);c.stroke()}fighter(c,{id:'deepseek',x:450,y:290,facing:-1,action:'guard'},1.3);fighter(c,{id:'gpt',x:250,y:320,facing:1},1.65);txt(c,'VERSUS',355,150,13,'#7b9d9f','center');}
let fightBackground=null;
function background(c){
 if(!fightBackground){fightBackground=document.createElement('canvas');fightBackground.width=1280;fightBackground.height=720;const c=fightBackground.getContext('2d');
const W=1280;c.clearRect(0,0,W,720);let grad=c.createLinearGradient(0,0,0,600);grad.addColorStop(0,'#0e1931');grad.addColorStop(1,'#233e54');c.fillStyle=grad;c.fillRect(0,0,W,720);for(let i=0;i<18;i++){let h=90+(i*37%160);box(c,i*80-20,420-h,60,h,2,i%2?'#12283a':'#172f43');for(let j=0;j<6;j++)box(c,i*80-11,435-h+j*21,5,5,0,'#64948544')}
// floating architecture and stage
line(c,[[0,350],[1280,350]],'#4f799255',1);box(c,445,175,390,77,8,'#162a3e');txt(c,'MODEL / CLASH',640,224,31,'#82b8b3','center');txt(c,'NEURAL DISTRICT · NIGHT 01',640,279,11,'#65869d','center');box(c,0,480,W,240,0,'#1b2b3e');for(let i=-10;i<20;i++)line(c,[[640+i*100,480],[640+i*190,720]],'#3a5b6c50',1);for(let i=0;i<6;i++)line(c,[[0,480+i*i*9],[1280,480+i*i*9]],'#40657c66',1);line(c,[[0,480],[1280,480]],'#89bbba',3);
 }
 c.drawImage(fightBackground,0,0);
}
// Real-time camera feedback never modifies authoritative physics.
const feedbackStates=new WeakMap();
const feedbackOptions={shakeStrength:1,reduceFlashing:false};
function resetFeedback(c){feedbackStates.delete(c);}
function cameraFeedback(c,s,now){
 let v=feedbackStates.get(c);
 if(!v||s.frame<v.frame){v={time:now,frame:s.frame,lastId:0,trauma:0,x:0,y:0};feedbackStates.set(c,v);}
 const dt=Math.max(0,(now-v.time)/1000);v.time=now;v.frame=s.frame;
 v.trauma=Math.max(0,v.trauma-dt*1.8);
 for(const e of s.effects||[]){
  if(e.id<=v.lastId)continue;
  v.lastId=e.id;
  const strength=e.trauma??(e.type==='counter'?.8:e.type==='block'?.18:e.type==='hit'?.35:0);
  v.trauma=Math.min(1,v.trauma+strength);
 }
 const reduced=g.matchMedia?.('(prefers-reduced-motion: reduce)').matches;
 const amplitude=v.trauma*v.trauma*12*(reduced?0:feedbackOptions.shakeStrength),t=now/1000;
 v.x=amplitude*(Math.sin(t*71)*.65+Math.sin(t*113)*.35);
 v.y=amplitude*(Math.sin(t*89+.8)*.6+Math.sin(t*137)*.4)*.65;
 if(amplitude===0){v.x=0;v.y=0;}
 return v;
}
function fight(c,s,debug,now=performance.now()){
 const camera=cameraFeedback(c,s,now);
 const width=c.canvas?.width??1280,height=c.canvas?.height??720;
 c.clearRect(0,0,width,height);
 c.save();c.translate(camera.x,camera.y);
 if(bgImg&&(camera.x||camera.y)){
  // Extend the exposed edges during shake so the image still covers the canvas.
  const x=-Math.max(0,camera.x),y=-Math.max(0,camera.y);
  c.drawImage(bgImg,x,y,width+Math.abs(camera.x),height+Math.abs(camera.y));
 }else if(bgImg){
  c.drawImage(bgImg,0,0,width,height);
 }else{
  background(c);
 }
for(let f of s.fighters){c.fillStyle='#0005';c.beginPath();c.ellipse(f.x,485,47,10,0,0,Math.PI*2);c.fill()}
for(let p of s.projectiles||[]){let col=C[s.fighters[p.owner]?.id]?.[0]||'#abf5da';let radius=p.radius||17;c.shadowBlur=25;c.shadowColor=col;c.fillStyle=col;c.beginPath();c.ellipse(p.x,p.y,radius*1.8,radius,0,0,Math.PI*2);c.fill();c.shadowBlur=0;line(c,[[p.x-(p.dir||1)*45,p.y],[p.x,p.y]],col,5)}
for(let f of s.fighters){
 if(f.action==='dash'||f.action==='special'&&Math.abs(f.vx)>4){for(let i=3;i>0;i--){c.globalAlpha=.08+(3-i)*.04;fighter(c,{...f,x:f.x-f.facing*i*17},.85,(s.combatFrame??s.frame)-i*2);}c.globalAlpha=1;}
 c.globalAlpha=f.invulnerable>0&&Math.floor((s.combatFrame??s.frame)/3)%2?.45:1;
 fighter(c,f,.85,s.combatFrame??s.frame);c.globalAlpha=1;
 if(f.hitFlash>0&&!feedbackOptions.reduceFlashing&&!g.matchMedia?.('(prefers-reduced-motion: reduce)').matches){c.globalAlpha=f.hitFlash/30;box(c,f.x-25,f.y-140,50,140,10,'#fff');c.globalAlpha=1;}
}
for(let e of s.effects||[]){
 const progress=1-e.life/e.maxLife,spread=12+progress*58;
 c.globalAlpha=Math.max(0,1-progress);
 if(e.type==='super'){c.strokeStyle=e.color||'#c7faff';c.lineWidth=8*(1-progress);c.beginPath();c.arc(e.x,e.y,30+progress*160,0,Math.PI*2);c.stroke();}
 else{for(let i=0;i<8;i++){const angle=i*Math.PI/4;line(c,[[e.x+Math.cos(angle)*spread*.3,e.y+Math.sin(angle)*spread*.3],[e.x+Math.cos(angle)*spread,e.y+Math.sin(angle)*spread]],e.type==='block'?'#9cdaff':e.color||'#fff1b9',4*(1-progress)+1);}}
 if(e.damage)txt(c,`−${e.damage}`,e.x,e.y-40-progress*55,26+8*(1-progress),'#fff3c0','center');
 c.globalAlpha=1;
}
c.restore();
if(debug){for(let b of s.hurtboxes){c.strokeStyle='#75ffbd';c.lineWidth=2;c.strokeRect(b.x,b.y,b.w,b.h)}if(s.hitboxes){for(let b of s.hitboxes){c.strokeStyle='#ff687e';c.strokeRect(b.x,b.y,b.w,b.h)}}}
for(let i=0;i<2;i++){const f=s.fighters[i],x=i?770:40,col=C[f.id]?.[0]||'#fff';txt(c,`${i?'P2':'P1'} / ${art[f.id]?.name||f.id}`,i?1240:40,35,21,col,i?'right':'left');box(c,x,48,470,27,4,'#543447');let hp=Math.max(0,f.hp)/f.maxHp;box(c,i?x+470*(1-hp):x,48,470*hp,27,4,col);txt(c,`${Math.ceil(f.hp)} / ${f.maxHp}`,i?1240:40,98,13,'#9fb7cf',i?'right':'left');box(c,x,108,470*((f.guardMeter??100)/100),4,0,'#bfd8ec');box(c,x,630,470,12,4,'#0c1b2d');box(c,x,630,470*f.energy/100,12,4,col);txt(c,`${f.energy>=100?'SUPER READY':'ENERGY'} ${Math.floor(f.energy)}`,i?1240:40,670,15,col,i?'right':'left');for(let w=0;w<2;w++)box(c,i?1196-w*28:40+w*28,125,16,7,2,w<s.wins[i]?col:'#455568')}
box(c,551,17,178,111,12,'#0c1827cc');txt(c,`${Math.ceil(s.timer)}`,640,75,49,'#f1f5ff','center');txt(c,`ROUND ${s.round}`,640,106,12,'#8fa9bf','center');if(s.announcement)txt(c,s.announcement,640,185,26,'#eff7ff','center');for(let i=0;i<2;i++){let f=s.fighters[i];if(f.combo>1){txt(c,`${f.combo} HIT COMBO`,i?1050:180,235,30,'#ffe6a1','center');txt(c,`${f.comboDamage} DAMAGE`,i?1050:180,263,16,'#d9c899','center');}txt(c,`击倒 ${s.stats?.[i]?.knockdowns||0} · 最大连击 ${s.stats?.[i]?.maxCombo||0}`,i?1240:40,695,14,'#8caec6',i?'right':'left')}
if(s.phase==='ended'){box(c,355,285,570,170,18,'#091728ee');txt(c,'K.O.',640,357,65,'#ffe2b3','center');txt(c,`PLAYER ${s.winner+1} 获胜 · ${s.wins.join(' : ')}`,640,409,25,'#d9f8e4','center');}
if(s.phase==='countdown'||s.phase==='roundOver'){box(c,390,310,500,75,12,'#0c172add');txt(c,s.announcement||'READY',640,360,37,'#d6ffdc','center')}
}
function configureFeedback(options={}){
 if(Number.isFinite(options.shakeStrength))feedbackOptions.shakeStrength=Math.max(0,Math.min(1,options.shakeStrength));
 if(typeof options.reduceFlashing==='boolean')feedbackOptions.reduceFlashing=options.reduceFlashing;
}
g.ArenaRender={preloadCharacters,preloadMatchAssets,drawSprite,characterName:id=>art[id]?.name||id,portrait,hero,fighter,fight,box,txt,colors:C,configureFeedback,resetFeedback};
})(window);
(function(){
const R=window.ArenaRender;
const headings=new WeakMap();
R.race=function(c,s){let last=headings.get(c);if(!last||s.frame<last.frame){last={frame:0,dirs:[1,1]};headings.set(c,last);}last.frame=s.frame;s.players.forEach((o,i)=>{if(Math.abs(o.headingX)>.05)last.dirs[i]=Math.sign(o.headingX);});c.clearRect(0,0,1280,720);for(let view=0;view<2;view++){c.save();c.beginPath();c.rect(view*640,0,640,720);c.clip();c.translate(view*640,0);let me=s.players[view],cam=me.z-270;let grad=c.createLinearGradient(0,0,0,720);grad.addColorStop(0,view?'#22335b':'#19394d');grad.addColorStop(1,'#101d37');c.fillStyle=grad;c.fillRect(0,0,640,720);
const proj=(x,z,y=0)=>{let d=Math.max(40,z-cam+220),scale=430/d;return {x:320+x*scale,y:125+180000/d-y*scale,s:scale}};
const quad=(x,z,w,d,col)=>{let pts=[proj(x-w/2,z-d/2),proj(x+w/2,z-d/2),proj(x+w/2,z+d/2),proj(x-w/2,z+d/2)];c.fillStyle=col;c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fill()};
// Floating clouds and distant ring gates.
for(let i=0;i<8;i++){let x=(i*129+30)%680,y=100+(i*41)%200;R.box(c,x,y,70+(i%3)*25,14,9,'#b4e9ee0a')}
for(let z=Math.min(AIRace.finish+80,Math.ceil((cam+1300)/35)*35);z>cam+70;z-=35){if(z<-20)continue;let gap=AIRace.course.some(o=>o.type==='pit'&&Math.abs(z-o.z)<o.d/2);if(!gap){quad(0,z,440,36,Math.floor(z/105)%2?'#5d83a2':'#668fa7');quad(-216,z,8,36,'#c8f6e6');quad(216,z,8,36,'#c8f6e6')}}
let objects=AIRace.course.map(o=>({...AIRace.dynamicObstacle(o,s.frame),_kind:'course'})).filter(o=>o.z>cam+70&&o.z<cam+1350);s.players.forEach((p,i)=>objects.push({...p,_kind:'player',index:i}));objects.sort((a,b)=>b.z-a.z);
for(let o of objects){if(o.z<cam+45)continue;let p=proj(o.x,o.z,o.y||0);if(o._kind==='player'){if(o.respawnTimer>0)continue;let color=R.colors[o.id]?.[0]||'#fff';let shadow=proj(o.x,o.z);c.fillStyle='#0b254c66';c.beginPath();c.ellipse(shadow.x,shadow.y,20*p.s,7*p.s,0,0,Math.PI*2);c.fill();c.save();c.translate(p.x,p.y);c.translate(0,-27*p.s);if(o.dashTime>0)c.rotate(last.dirs[o.index]*s.frame*.25);c.scale(1+(o.squash||0),1-(o.squash||0));c.translate(0,27*p.s);R.drawSprite(c,o.id,54*p.s,last.dirs[o.index]);if(o.diveTime>0){c.strokeStyle='#ffe5a2';c.lineWidth=4;c.strokeRect(-30*p.s,-52*p.s,60*p.s,45*p.s);}c.restore();R.txt(c,`P${o.index+1}`,p.x,p.y-66*p.s,Math.max(11,15*p.s),color,'center');if(o.dashTime>0){c.strokeStyle=color;c.lineWidth=3;for(let j=0;j<3;j++){let a=proj(o.x+(j-1)*15,o.z-40,8);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(p.x+(j-1)*12,p.y);c.stroke()}}continue}
if(o.type==='pit'||o.type==='start')continue;
if(o.type==='platform'){quad(o.x,o.z,o.w+6,o.d+6,'#283c6a');quad(o.x,o.z,o.w,o.d,'#b4a8ff');R.txt(c,'↔',p.x,p.y,18*p.s,'#413a69','center')}
if(o.type==='checkpoint'){quad(0,o.z,440,18,'#a1f0c5');R.txt(c,`CHECKPOINT ${o.index}`,p.x,p.y-14*p.s,16*p.s,'#d6ffe7','center')}
if(o.type==='boost'){quad(o.x,o.z,o.w,o.d,'#f2e795');R.txt(c,'»',p.x,p.y,30*p.s,'#765b2c','center')}
if(o.type==='bumper'){let top=proj(o.x,o.z,o.height),radius=o.radius*p.s;R.box(c,p.x-radius,top.y,radius*2,p.y-top.y,9*p.s,'#d96c8b');c.fillStyle='#ffb5bd';c.beginPath();c.ellipse(p.x,top.y,radius,10*p.s,0,0,Math.PI*2);c.fill();c.strokeStyle='#ffd5d0';c.lineWidth=4*p.s;c.beginPath();c.moveTo(p.x-radius+4*p.s,top.y+20*p.s);c.lineTo(p.x+radius-4*p.s,top.y+20*p.s);c.stroke()}
if(o.type==='sweeper'){let dx=Math.cos(o.angle)*o.arm,dz=Math.sin(o.angle)*o.arm,a=proj(o.x-dx,o.z-dz,o.height),b=proj(o.x+dx,o.z+dz,o.height);c.strokeStyle='#7f405f';c.lineWidth=24*p.s;c.lineCap='round';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.strokeStyle='#ffd185';c.lineWidth=16*p.s;c.stroke();R.box(c,p.x-12*p.s,p.y-55*p.s,24*p.s,55*p.s,5*p.s,'#ffe4ae')}
if(o.type==='finish'){quad(0,o.z,440,40,'#fff');for(let i=0;i<10;i++)quad(-198+i*44,o.z,22,40,'#26364e');let a=proj(-215,o.z,190),b=proj(215,o.z,190),ground=proj(-215,o.z);R.box(c,a.x-6,a.y,12,ground.y-a.y,0,'#f5dda6');let gr=proj(215,o.z);R.box(c,b.x-6,b.y,12,gr.y-b.y,0,'#f5dda6');R.box(c,a.x,a.y,b.x-a.x,45*p.s,0,'#f5dda6');R.txt(c,'FINISH',p.x,a.y+33*p.s,30*p.s,'#3c4461','center')}
}
R.box(c,20,20,600,77,12,'#102039dd');let color=R.colors[me.id]?.[0]||'#fff';R.txt(c,`P${view+1} / ${R.characterName(me.id)}`,38,52,21,color);R.txt(c,`${s.time.toFixed(1)}s`,600,52,23,'#fff','right');R.box(c,38,70,565,5,2,'#334a65');R.box(c,38,70,565*Math.max(0,me.z/AIRace.finish),5,2,color);R.box(c,20,621,600,77,12,'#102039dd');R.txt(c,`检查点 ${me.checkpoint}/3   跌落 ${me.falls}`,38,651,17,'#b7ccdf');R.txt(c,me.dashCooldown>0?`翻滚 ${me.dashCooldown.toFixed(1)}s`:'翻滚就绪',600,651,17,color,'right');R.txt(c,'左侧方向移动 · 右侧跳跃 / 翻滚',38,679,14,'#7f9bb6');if(me.respawnTimer>0)R.txt(c,'返回检查点…',320,350,28,'#ffe0bf','center');c.restore()}
R.box(c,638,0,4,720,0,'#090e1e');if(s.phase==='countdown'){R.box(c,480,245,320,125,18,'#101c32ee');R.txt(c,'准备出发',640,285,22,'#bcd2ec','center');R.txt(c,`${Math.ceil(s.countdown/60)}`,640,345,49,'#acf3c7','center')}
};
})();

window.ArenaRender.forMode=function(mode,context,state,debug=false,now=performance.now()){
 if(mode==='fight')return this.fight(context,state,debug,now);
 if(mode==='race')return this.race(context,state,debug,now);
 throw new Error('Unknown game mode: '+mode);
};
