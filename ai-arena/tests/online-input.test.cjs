'use strict';
const test=require('node:test'),assert=require('node:assert/strict'),vm=require('node:vm'),fs=require('node:fs');
function boot(){
 const events={},sent=[],nodes=new Map();
 function node(){return {value:'fight',textContent:'',dataset:{},classList:{add(){},remove(){},toggle(){}},setAttribute(k,v){this[k]=v},getContext(){return {}},querySelectorAll(){return []}};}
 const $=id=>{if(!nodes.has(id))nodes.set(id,node());return nodes.get(id)};
 const socket={connected:true,on(){},emit(name,data){sent.push({name,data})}};
 const scope={console,performance:{now:()=>100},URLSearchParams,location:{search:''},setInterval(){},cancelAnimationFrame(){},requestAnimationFrame(){return 1},document:{hidden:false,getElementById:$,addEventListener(){}},window:{AIFight:{frameData:{}},AIRace:{step(){}},FighterEngine:{},PartyController:{},ArenaRender:{fight(){},resetFeedback(){}},ArenaView:{Buffer:class{reset(){}},Predictor:class{}},io:()=>socket,addEventListener(name,fn){events[name]=fn}}};
 Object.assign(scope,{ArenaView:scope.window.ArenaView,ArenaRender:scope.window.ArenaRender,io:scope.window.io});
 vm.createContext(scope);vm.runInContext(fs.readFileSync(require.resolve('../online.js'),'utf8'),scope);
 const run=code=>vm.runInContext(code,scope);
 run("session={slot:0,epoch:1,mode:'fight'};latestPacket={state:{phase:'playing'},disconnected:false}");
 function key(name,code,extra={}){events[name]({code,target:{tagName:'CANVAS'},preventDefault(){},...extra});}
 return {run,key,events,sent,$,scope};
}
test('keyboard aliases and touch release independently; repeated keydown cannot repeat attack pulses',()=>{
 const b=boot();b.key('keydown','KeyD');b.key('keydown','ArrowRight');b.key('keyup','KeyD');assert.equal(b.run('input.right'),true);
 b.run("activePointers.set(1,{action:'right',btn:{classList:{remove(){}}}})");b.key('keyup','ArrowRight');assert.equal(b.run('input.right'),true);
 b.run("activePointers.delete(1);updateAction('right')");assert.equal(b.run('input.right'),false);
 b.key('keydown','KeyJ');const count=b.sent.length;b.key('keydown','KeyJ',{repeat:true});assert.equal(b.sent.length,count);
 assert.deepEqual(Array.from(b.sent.at(-1).data.pulses),['light']);b.key('keyup','KeyJ');assert.equal(b.run('input.light'),false);
});
test('party mappings feed velocity, jump, roll and dive; blur clears every source',()=>{
 const b=boot();b.run("session.mode='race'");
 for(const [code,action]of [['KeyW','up'],['Space','jump'],['ShiftLeft','dash'],['KeyJ','dive']]){b.key('keydown',code);assert.equal(b.run('input.'+action),true);}
 b.events.blur();assert.equal(b.run('activeKeys.size'),0);assert.equal(b.run('Object.keys(input).length'),0);assert.equal(b.sent.at(-1).name,'release');
});
test('typing, countdown and disconnected games cannot send gameplay keys',()=>{
 const b=boot();b.key('keydown','KeyJ',{target:{tagName:'INPUT'}});assert.equal(b.sent.length,0);
 b.run("latestPacket.state.phase='countdown'");b.key('keydown','KeyJ');assert.equal(b.sent.length,0);
 b.run("latestPacket.state.phase='playing';latestPacket.disconnected=true");b.key('keydown','KeyJ');assert.equal(b.sent.length,0);
});
test('mode buttons choose creation mode but cannot change a joined room',()=>{
 const b=boot();b.run('session=null');b.$('mode-race').onclick();assert.equal(b.$('mode').value,'race');assert.equal(b.$('mode-race')['aria-pressed'],'true');
 b.run("session={mode:'race'}");b.$('mode-fight').onclick();assert.equal(b.$('mode').value,'race');
});

test('fullscreen is requested immediately; orientation lock waits for success',async()=>{
 const b=boot(),calls=[];let complete;
 const root={style:{setProperty(){ }},requestFullscreen(){calls.push('fullscreen');return new Promise(r=>complete=r)}};
 b.scope.document.documentElement=root;b.scope.window.screen={orientation:{lock(value){calls.push(value);return Promise.resolve()},unlock(){}}};
 b.run('enterPresentation()');assert.deepEqual(calls,['fullscreen']);
 b.scope.document.fullscreenElement=root;complete();await new Promise(r=>setImmediate(r));assert.deepEqual(calls,['fullscreen','landscape']);
});
test('fullscreen denial and unsupported APIs do not reject; exit restores screen ownership',async()=>{
 const b=boot(),calls=[];
 b.scope.document.documentElement={style:{setProperty(){}},requestFullscreen(){return Promise.reject(Error('denied'))}};
 b.scope.window.screen={orientation:{lock(){calls.push('lock')},unlock(){calls.push('unlock')}}};
 b.run('enterPresentation()');await new Promise(r=>setImmediate(r));assert.equal(calls.length,0);
 b.scope.document.documentElement.requestFullscreen=undefined;assert.doesNotThrow(()=>b.run('enterPresentation()'));
 b.run('exitPresentation()');assert.deepEqual(calls,['unlock']);
});
test('viewport variables track visible dimensions and old rotate blocker is removed',()=>{
 const b=boot(),values={};b.scope.document.documentElement={style:{setProperty(k,v){values[k]=v}}};
 b.scope.window.visualViewport={width:390,height:740};b.run('syncViewport()');assert.equal(values['--viewport-width'],'390px');assert.equal(values['--viewport-height'],'740px');
 const html=fs.readFileSync(require.resolve('../online.html'),'utf8'),css=fs.readFileSync(require.resolve('../style.css'),'utf8');
 assert.ok(!html.includes('rotate-tip'));assert.ok(html.includes('style.css'));assert.match(css,/@media \(orientation:portrait\)/);assert.match(css,/rotate\(90deg\)/);assert.match(css,/#pad,\.pad-left,\.pad-right,\.hud-overlay \{position:absolute;/);
});
