(function(g){
'use strict';
const C={gpt:['#91f2b8','#26756e'],deepseek:['#79c7ff','#2f5e9c'],claude:['#f9b58c','#995647'],gemini:['#c2a2ff','#6050ab']};
function box(c,x,y,w,h,r,fill){c.fillStyle=fill;c.beginPath();c.roundRect(x,y,w,h,r);c.fill()}
function txt(c,t,x,y,size=20,color='#fff',align='left'){c.fillStyle=color;c.font=`600 ${size}px "Segoe UI",sans-serif`;c.textAlign=align;c.fillText(t,x,y)}
function line(c,points,color,width){c.strokeStyle=color;c.lineWidth=width;c.lineCap='round';c.lineJoin='round';c.beginPath();points.forEach((p,i)=>i?c.lineTo(...p):c.moveTo(...p));c.stroke()}
function fighter(c,f,scale=1,frame=0){const colors=C[f.id]||C.gpt;let atk=/light|heavy|special|super/i.test(f.action||''),walk=Math.abs(f.vx||0)>1,phase=frame*.16;let dir=f.facing||1;let y=f.y;let move=window.AIFight?.frameData[f.id]?.[f.action],active=move&&f.actionFrame>=move.startup&&f.actionFrame<move.startup+move.active; c.save();c.translate(f.x,y);c.scale(scale*dir,scale);let crouch=f.crouch;if(crouch)c.scale(1,.60);if(f.knockdown){c.translate(0,-18);c.rotate(-1.35);}if(f.action==='dash')c.transform(1,0,-.22,1,0,0);let stride=walk?Math.sin(phase)*14:0;
// cloak silhouette and articulated boots
c.fillStyle=colors[1];c.beginPath();c.moveTo(-25,-102);c.lineTo(-42,-48);c.lineTo(-22,-35);c.lineTo(30,-54);c.lineTo(20,-112);c.fill();line(c,[[-13,-58],[-20+stride,-29],[-22+stride,-7]],'#192a41',18);line(c,[[14,-58],[23-stride,-31],[25-stride,-7]],'#263b56',18);box(c,-36+stride,-13,30,12,4,colors[0]);box(c,13-stride,-13,32,12,4,colors[0]);
box(c,-25,-113,50,61,12,'#17283b');box(c,-17,-105,34,40,7,colors[1]);line(c,[[-16,-84],[0,-75],[16,-84]],colors[0],3);
let ax=atk?(active?Math.min(155,(move?.reach||90)+10):f.actionFrame<(move?.startup||0)?18:50):36,ay=atk?-106:-69;line(c,[[-21,-106],[-33,-83],[-25,-68]],colors[1],15);line(c,[[21,-106],[39,-91],[ax,ay]],colors[0],16);box(c,ax-10,ay-8,22,17,6,'#e5f4f5');
// unique head silhouettes
if(f.id==='deepseek'){c.fillStyle=colors[0];c.beginPath();c.moveTo(-26,-123);c.lineTo(-36,-154);c.lineTo(-10,-148);c.quadraticCurveTo(28,-157,30,-131);c.lineTo(48,-126);c.lineTo(28,-115);c.lineTo(-20,-115);c.fill();line(c,[[0,-132],[18,-132]],'#11344f',5)}
else if(f.id==='claude'){for(let i=0;i<10;i++){let a=i*Math.PI/5;c.strokeStyle=colors[0];c.lineWidth=4;c.beginPath();c.moveTo(Math.cos(a)*27,-138+Math.sin(a)*27);c.lineTo(Math.cos(a)*35,-138+Math.sin(a)*35);c.stroke()}box(c,-22,-161,44,45,13,colors[0]);box(c,-16,-147,34,14,4,'#633d39');line(c,[[-9,-141],[9,-141]],'#ffe9cb',3)}
else if(f.id==='gemini'){c.fillStyle=colors[0];c.beginPath();c.moveTo(0,-177);c.lineTo(26,-146);c.lineTo(22,-119);c.lineTo(-22,-119);c.lineTo(-27,-149);c.fill();box(c,-20,-145,40,10,3,'#342962');line(c,[[0,-160],[0,-123]],'#e7dcff',3);txt(c,'✦',-53,-130,24,colors[0]);}
else{box(c,-25,-161,50,43,12,colors[0]);box(c,-21,-147,42,14,4,'#163d36');for(let i=0;i<3;i++)line(c,[[-15+i*13,-143],[-10+i*13,-143]],'#c5ffe6',3);c.strokeStyle=colors[0];c.lineWidth=5;c.beginPath();c.arc(0,-140,31,Math.PI,Math.PI*1.8);c.stroke()}
if(f.guard){c.strokeStyle=colors[0];c.globalAlpha=.6;c.lineWidth=4;c.beginPath();c.ellipse(25,-88,42,74,0,-1.4,1.4);c.stroke();c.globalAlpha=1}
if(atk&&active&&!move?.projectile){c.globalAlpha=.65;c.strokeStyle=colors[0];c.lineWidth=f.action==='super'?18:8;c.beginPath();c.ellipse(26,-89,Math.max(55,(move?.reach||90)),f.action==='super'?115:59,-.3,-1.2,1.1);c.stroke();c.globalAlpha=1;}if(f.stun>0){c.strokeStyle='#fff';c.lineWidth=3;c.strokeRect(-29,-165,58,168)}c.restore()}
function portrait(canvas,id,large=false){const c=canvas.getContext('2d');c.clearRect(0,0,canvas.width,canvas.height);let col=C[id]||C.gpt;let grad=c.createRadialGradient(canvas.width/2,canvas.height*.55,10,canvas.width/2,canvas.height*.55,canvas.width*.55);grad.addColorStop(0,col[1]+'66');grad.addColorStop(1,'#00000000');c.fillStyle=grad;c.fillRect(0,0,canvas.width,canvas.height);fighter(c,{id,x:canvas.width/2,y:canvas.height-7,facing:1},large?1.8:1.15);}
function hero(canvas){const c=canvas.getContext('2d');c.clearRect(0,0,640,360);c.strokeStyle='#426c6240';for(let i=0;i<9;i++){c.beginPath();c.ellipse(330,280,i*35,i*9,0,0,Math.PI*2);c.stroke()}fighter(c,{id:'deepseek',x:450,y:290,facing:-1,action:'guard'},1.3);fighter(c,{id:'gpt',x:250,y:320,facing:1},1.65);txt(c,'VERSUS',355,150,13,'#7b9d9f','center');}
let fightBackground=null;
function background(c){
 if(!fightBackground){fightBackground=document.createElement('canvas');fightBackground.width=1280;fightBackground.height=720;const c=fightBackground.getContext('2d');
const W=1280;c.clearRect(0,0,W,720);let grad=c.createLinearGradient(0,0,0,600);grad.addColorStop(0,'#0e1931');grad.addColorStop(1,'#233e54');c.fillStyle=grad;c.fillRect(0,0,W,720);for(let i=0;i<18;i++){let h=90+(i*37%160);box(c,i*80-20,420-h,60,h,2,i%2?'#12283a':'#172f43');for(let j=0;j<6;j++)box(c,i*80-11,435-h+j*21,5,5,0,'#64948544')}
// floating architecture and stage
line(c,[[0,350],[1280,350]],'#4f799255',1);box(c,445,175,390,77,8,'#162a3e');txt(c,'MODEL / CLASH',640,224,31,'#82b8b3','center');txt(c,'NEURAL DISTRICT · NIGHT 01',640,279,11,'#65869d','center');box(c,0,480,W,240,0,'#1b2b3e');for(let i=-10;i<20;i++)line(c,[[640+i*100,480],[640+i*190,720]],'#3a5b6c50',1);for(let i=0;i<6;i++)line(c,[[0,480+i*i*9],[1280,480+i*i*9]],'#40657c66',1);line(c,[[0,480],[1280,480]],'#89bbba',3);
 }
 c.drawImage(fightBackground,0,0);
}
function fight(c,s,debug){
background(c);
c.save();
const impact=(s.effects||[]).find(e=>e.type==='hit'&&e.life>e.maxLife-6);
if(impact){const magnitude=impact.damage>=120?5:2.5;c.translate(Math.sin(s.frame*5.7)*magnitude,Math.cos(s.frame*4.3)*magnitude*.5);}

for(let f of s.fighters){c.fillStyle='#0005';c.beginPath();c.ellipse(f.x,485,47,10,0,0,Math.PI*2);c.fill()}
for(let p of s.projectiles||[]){let col=C[s.fighters[p.owner]?.id]?.[0]||'#abf5da';let radius=p.radius||17;c.shadowBlur=25;c.shadowColor=col;c.fillStyle=col;c.beginPath();c.ellipse(p.x,p.y,radius*1.8,radius,0,0,Math.PI*2);c.fill();c.shadowBlur=0;line(c,[[p.x-(p.dir||1)*45,p.y],[p.x,p.y]],col,5)}
for(let f of s.fighters){
 if(f.action==='dash'||f.action==='special'&&Math.abs(f.vx)>4){for(let i=3;i>0;i--){c.globalAlpha=.08+(3-i)*.04;fighter(c,{...f,x:f.x-f.facing*i*17},.85,s.frame-i*2);}c.globalAlpha=1;}
 c.globalAlpha=f.invulnerable>0&&Math.floor(s.frame/3)%2?.45:1;
 fighter(c,f,.85,s.frame);c.globalAlpha=1;
 if(f.hitFlash>0){c.globalAlpha=f.hitFlash/30;box(c,f.x-25,f.y-140,50,140,10,'#fff');c.globalAlpha=1;}
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
for(let i=0;i<2;i++){const f=s.fighters[i],x=i?770:40,col=C[f.id]?.[0]||'#fff';txt(c,`${i?'P2':'P1'} / ${f.id.toUpperCase()}`,i?1240:40,35,21,col,i?'right':'left');box(c,x,48,470,27,4,'#543447');let hp=Math.max(0,f.hp)/f.maxHp;box(c,i?x+470*(1-hp):x,48,470*hp,27,4,col);txt(c,`${Math.ceil(f.hp)} / ${f.maxHp}`,i?1240:40,98,13,'#9fb7cf',i?'right':'left');box(c,x,108,470*((f.guardMeter??100)/100),4,0,'#bfd8ec');box(c,x,630,470,12,4,'#0c1b2d');box(c,x,630,470*f.energy/100,12,4,col);txt(c,`${f.energy>=100?'SUPER READY':'ENERGY'} ${Math.floor(f.energy)}`,i?1240:40,670,15,col,i?'right':'left');for(let w=0;w<2;w++)box(c,i?1196-w*28:40+w*28,125,16,7,2,w<s.wins[i]?col:'#455568')}
box(c,551,17,178,111,12,'#0c1827cc');txt(c,`${Math.ceil(s.timer)}`,640,75,49,'#f1f5ff','center');txt(c,`ROUND ${s.round}`,640,106,12,'#8fa9bf','center');if(s.announcement)txt(c,s.announcement,640,185,26,'#eff7ff','center');for(let i=0;i<2;i++){let f=s.fighters[i];if(f.combo>1){txt(c,`${f.combo} HIT COMBO`,i?1050:180,235,30,'#ffe6a1','center');txt(c,`${f.comboDamage} DAMAGE`,i?1050:180,263,16,'#d9c899','center');}txt(c,`击倒 ${s.stats?.[i]?.knockdowns||0} · 最大连击 ${s.stats?.[i]?.maxCombo||0}`,i?1240:40,695,14,'#8caec6',i?'right':'left')}
if(s.phase==='ended'){box(c,355,285,570,170,18,'#091728ee');txt(c,'K.O.',640,357,65,'#ffe2b3','center');txt(c,`PLAYER ${s.winner+1} 获胜 · ${s.wins.join(' : ')}`,640,409,25,'#d9f8e4','center');}
if(s.phase==='countdown'||s.phase==='roundOver'){box(c,390,310,500,75,12,'#0c172add');txt(c,s.announcement||'READY',640,360,37,'#d6ffdc','center')}
}
g.ArenaRender={portrait,hero,fighter,fight,box,txt,colors:C};
})(window);
(function(){
const R=window.ArenaRender;
R.race=function(c,s){c.clearRect(0,0,1280,720);for(let view=0;view<2;view++){c.save();c.beginPath();c.rect(view*640,0,640,720);c.clip();c.translate(view*640,0);let me=s.players[view],cam=me.z-270;let grad=c.createLinearGradient(0,0,0,720);grad.addColorStop(0,view?'#22335b':'#19394d');grad.addColorStop(1,'#101d37');c.fillStyle=grad;c.fillRect(0,0,640,720);
const proj=(x,z,y=0)=>{let d=Math.max(40,z-cam+220),scale=430/d;return {x:320+x*scale,y:125+180000/d-y*scale,s:scale}};
const quad=(x,z,w,d,col)=>{let pts=[proj(x-w/2,z-d/2),proj(x+w/2,z-d/2),proj(x+w/2,z+d/2),proj(x-w/2,z+d/2)];c.fillStyle=col;c.beginPath();pts.forEach((p,i)=>i?c.lineTo(p.x,p.y):c.moveTo(p.x,p.y));c.closePath();c.fill()};
// Floating clouds and distant ring gates.
for(let i=0;i<8;i++){let x=(i*129+30)%680,y=100+(i*41)%200;R.box(c,x,y,70+(i%3)*25,14,9,'#b4e9ee0a')}
for(let z=Math.min(AIRace.finish+80,Math.ceil((cam+1300)/35)*35);z>cam+70;z-=35){if(z<-20)continue;let gap=AIRace.course.some(o=>o.type==='pit'&&Math.abs(z-o.z)<o.d/2);if(!gap){quad(0,z,440,36,Math.floor(z/105)%2?'#5d83a2':'#668fa7');quad(-216,z,8,36,'#c8f6e6');quad(216,z,8,36,'#c8f6e6')}}
let objects=AIRace.course.map(o=>({...AIRace.dynamicObstacle(o,s.frame),_kind:'course'})).filter(o=>o.z>cam+70&&o.z<cam+1350);s.players.forEach((p,i)=>objects.push({...p,_kind:'player',index:i}));objects.sort((a,b)=>b.z-a.z);
for(let o of objects){if(o.z<cam+45)continue;let p=proj(o.x,o.z,o.y||0);if(o._kind==='player'){if(o.respawnTimer>0)continue;let color=R.colors[o.id]?.[0]||'#fff';let shadow=proj(o.x,o.z);c.fillStyle='#0b254c66';c.beginPath();c.ellipse(shadow.x,shadow.y,20*p.s,7*p.s,0,0,Math.PI*2);c.fill();c.save();c.translate(p.x,p.y);let roll=o.dashTime>0?Math.sin(s.frame*.5)*.7:0;c.rotate(roll);let body=c.createLinearGradient(0,-60*p.s,0,0);body.addColorStop(0,color);body.addColorStop(1,R.colors[o.id]?.[1]||'#48b');R.box(c,-21*p.s,-52*p.s,42*p.s,48*p.s,18*p.s,body);R.box(c,-16*p.s,-41*p.s,32*p.s,14*p.s,6*p.s,'#173146');R.box(c,-10*p.s,-38*p.s,4*p.s,5*p.s,1,'#e1ffff');R.box(c,6*p.s,-38*p.s,4*p.s,5*p.s,1,'#e1ffff');if(o.id==='deepseek'){c.fillStyle=color;c.beginPath();c.moveTo(-16*p.s,-49*p.s);c.lineTo(-28*p.s,-65*p.s);c.lineTo(0,-53*p.s);c.fill()}if(o.id==='claude'){R.txt(c,'✺',0,-53*p.s,22*p.s,color,'center')}if(o.id==='gemini')R.txt(c,'✦',0,-55*p.s,22*p.s,color,'center');c.restore();R.txt(c,`P${o.index+1}`,p.x,p.y-66*p.s,Math.max(11,15*p.s),color,'center');if(o.dashTime>0){c.strokeStyle=color;c.lineWidth=3;for(let j=0;j<3;j++){let a=proj(o.x+(j-1)*15,o.z-40,8);c.beginPath();c.moveTo(a.x,a.y);c.lineTo(p.x+(j-1)*12,p.y);c.stroke()}}continue}
if(o.type==='pit'||o.type==='start')continue;
if(o.type==='platform'){quad(o.x,o.z,o.w+6,o.d+6,'#283c6a');quad(o.x,o.z,o.w,o.d,'#b4a8ff');R.txt(c,'↔',p.x,p.y,18*p.s,'#413a69','center')}
if(o.type==='checkpoint'){quad(0,o.z,440,18,'#a1f0c5');R.txt(c,`CHECKPOINT ${o.index}`,p.x,p.y-14*p.s,16*p.s,'#d6ffe7','center')}
if(o.type==='boost'){quad(o.x,o.z,o.w,o.d,'#f2e795');R.txt(c,'»',p.x,p.y,30*p.s,'#765b2c','center')}
if(o.type==='bumper'){let top=proj(o.x,o.z,o.height),radius=o.radius*p.s;R.box(c,p.x-radius,top.y,radius*2,p.y-top.y,9*p.s,'#d96c8b');c.fillStyle='#ffb5bd';c.beginPath();c.ellipse(p.x,top.y,radius,10*p.s,0,0,Math.PI*2);c.fill();c.strokeStyle='#ffd5d0';c.lineWidth=4*p.s;c.beginPath();c.moveTo(p.x-radius+4*p.s,top.y+20*p.s);c.lineTo(p.x+radius-4*p.s,top.y+20*p.s);c.stroke()}
if(o.type==='sweeper'){let dx=Math.cos(o.angle)*o.arm,dz=Math.sin(o.angle)*o.arm,a=proj(o.x-dx,o.z-dz,o.height),b=proj(o.x+dx,o.z+dz,o.height);c.strokeStyle='#7f405f';c.lineWidth=24*p.s;c.lineCap='round';c.beginPath();c.moveTo(a.x,a.y);c.lineTo(b.x,b.y);c.stroke();c.strokeStyle='#ffd185';c.lineWidth=16*p.s;c.stroke();R.box(c,p.x-12*p.s,p.y-55*p.s,24*p.s,55*p.s,5*p.s,'#ffe4ae')}
if(o.type==='finish'){quad(0,o.z,440,40,'#fff');for(let i=0;i<10;i++)quad(-198+i*44,o.z,22,40,'#26364e');let a=proj(-215,o.z,190),b=proj(215,o.z,190),ground=proj(-215,o.z);R.box(c,a.x-6,a.y,12,ground.y-a.y,0,'#f5dda6');let gr=proj(215,o.z);R.box(c,b.x-6,b.y,12,gr.y-b.y,0,'#f5dda6');R.box(c,a.x,a.y,b.x-a.x,45*p.s,0,'#f5dda6');R.txt(c,'FINISH',p.x,a.y+33*p.s,30*p.s,'#3c4461','center')}
}
R.box(c,20,20,600,77,12,'#102039dd');let color=R.colors[me.id]?.[0]||'#fff';R.txt(c,`P${view+1} / ${me.id.toUpperCase()}`,38,52,21,color);R.txt(c,`${s.time.toFixed(1)}s`,600,52,23,'#fff','right');R.box(c,38,70,565,5,2,'#334a65');R.box(c,38,70,565*Math.max(0,me.z/AIRace.finish),5,2,color);R.box(c,20,621,600,77,12,'#102039dd');R.txt(c,`检查点 ${me.checkpoint}/3   跌落 ${me.falls}`,38,651,17,'#b7ccdf');R.txt(c,me.dashCooldown>0?`翻滚 ${me.dashCooldown.toFixed(1)}s`:'翻滚就绪',600,651,17,color,'right');R.txt(c,'左侧方向移动 · 右侧跳跃 / 翻滚',38,679,14,'#7f9bb6');if(me.respawnTimer>0)R.txt(c,'返回检查点…',320,350,28,'#ffe0bf','center');c.restore()}
R.box(c,638,0,4,720,0,'#090e1e');if(s.phase==='countdown'){R.box(c,480,245,320,125,18,'#101c32ee');R.txt(c,'准备出发',640,285,22,'#bcd2ec','center');R.txt(c,`${Math.ceil(s.countdown/60)}`,640,345,49,'#acf3c7','center')}
};
})();
