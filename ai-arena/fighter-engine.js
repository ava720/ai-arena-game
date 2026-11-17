/* AI ARENA — deterministic local fighting simulation, 60 ticks per second.
 * Original implementation. All distances are world pixels; time fields ending
 * in Frames are ticks. Renderer and input devices deliberately live elsewhere.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else {root.AIFight=api;root.FighterEngine=api;}
})(typeof window !== 'undefined' ? window : globalThis, function () {
  'use strict';

  const VERSION = '1.0.0';
  const physics=Object.freeze({tickRate:60,walkSpeed:5.8,runSpeed:9.2,gravity:.65,jumpVelocity:-14.2,cornerX:55,juggleLimit:3,techDelay:12,wakeupInvincibility:24});
  // Combat FSM is separate from locomotion. State is JSON serializable.
  const transitions=Object.freeze({idle:['attack','hitstun'],attack:['recovery','hitstun','idle'],recovery:['idle','attack','hitstun'],hitstun:['idle']});
  const states=Object.freeze(Object.keys(transitions));
  function transition(f,next){
    if(f.state===next)return;
    if(!transitions[f.state]?.includes(next))throw new Error('Illegal fighter transition: '+f.state+' -> '+next);
    f.state=next;f.stateFrame=0;
  }
  function syncState(f){
    const m=frameData[f.id][f.action];
    f.attackPhase=!m?null:f.actionFrame<m.startup?'Startup':f.actionFrame<m.startup+m.active?'Active':'Recovery';
    const next=f.knockdown||f.airborneHit||f.stun||f.blockstun?'hitstun':m?(f.attackPhase==='Recovery'?'recovery':'attack'):'idle';
    if(f.state==='hitstun'&&next!=='hitstun')transition(f,'idle');
    if(f.state==='idle'&&next==='recovery')transition(f,'attack');
    transition(f,next);
    f.locomotion=f.knockdown?'knockdown':f.airborneHit?'airHitstun':f.invulnerable&&f.y===FLOOR?'wakeup':f.y<FLOOR?'jump':f.guard?'guard':f.crouch?'crouch':Math.abs(f.vx)>6?'run':Math.abs(f.vx)>.1?'walk':'idle';
    f.corner=f.x<=55.01?'left':f.x>=WIDTH-55.01?'right':null;
  }
  const WIDTH = 1280, HEIGHT = 600, FLOOR = 480, FPS = 60;
  const MAX_HP = 1000, ROUND_FRAMES = 60 * FPS;
  const clamp = (v, a, b) => Math.max(a, Math.min(b, v));
  const characters = [
    { id: 'gpt', name: 'GPT', title: '协议斗士', color: '#70efd1', secondary: '#e9fff6', archetype: '近身连段',
      description: '快速轻击衔接重击与突进，近身创造压制；挥空的后摇可被惩罚。',
      skillName: '上下文突进', superName: '推理风暴', provenance: 'GPT / Codex 设计的试玩方案；未经过赛事平衡认证。' },
    { id: 'deepseek', name: 'DeepSeek', title: '深海求索者', color: '#64a7ff', secondary: '#dbf6ff', archetype: '飞弹控场',
      description: '以推理波封锁地面，迫使对手跳跃；远程招式有明确前摇。',
      skillName: '深度推理波', superName: '深海回响', provenance: 'Codex 代拟占位，尚未由 DeepSeek 模型设计或确认。' },
    { id: 'claude', name: 'Claude', title: '赭色守望者', color: '#f4ac83', secondary: '#fff1df', archetype: '反击防守',
      description: '短暂反击姿态能惩罚直接攻击；被等待或抓住恢复时间会失去优势。',
      skillName: '审慎反制', superName: '宪章裁决', provenance: 'Codex 代拟占位，尚未由 Claude 模型设计或确认。' },
    { id: 'gemini', name: 'Gemini', title: '双子跃迁者', color: '#b7a0ff', secondary: '#f1e6ff', archetype: '空中机动',
      description: '拥有二段跳，跃迁斩可以在空中改变接近节奏；落地后依然有恢复时间。',
      skillName: '双子跃迁斩', superName: '星轨交汇', provenance: 'Codex 代拟占位，尚未由 Gemini 模型设计或确认。' }
  ];

  const baseMoves = {
    light: { startup: 4, active: 3, recovery: 10, damage: 55, reach: 108, height: 48, y: -104, stun: 12, push: 25, guard: 10, energy: 9, cost: 0 },
    heavy: { startup: 12, active: 5, recovery: 20, damage: 125, reach: 150, height: 63, y: -112, stun: 25, push: 58, guard: 24, energy: 14, cost: 0 },
    sweep: { startup: 12, active: 5, recovery: 25, damage: 90, reach: 123, height: 31, y: -33, stun: 24, push: 50, guard: 21, energy: 11, cost: 0, knockdown: true },
    airLight: { startup: 7, active: 7, recovery: 17, damage: 60, reach: 93, height: 72, y: -85, stun: 19, push: 26, guard: 12, energy: 9, cost: 0 },
    airHeavy: { startup: 12, active: 9, recovery: 22, damage: 100, reach: 113, height: 84, y: -74, stun: 23, push: 35, guard: 22, energy: 12, cost: 0 },
    dash: { startup: 0, active: 10, recovery: 10, damage: 0, cost: 0 },
    special: { startup: 13, active: 7, recovery: 26, damage: 130, reach: 150, height: 78, y: -113, stun: 27, push: 62, guard: 28, energy: 0, cost: 25 },
    super: { startup: 22, active: 9, recovery: 40, damage: 280, reach: 237, height: 145, y: -154, stun: 40, push: 100, guard: 55, energy: 0, cost: 100, knockdown: true }
  };

  function moveData(id, name) {
    const move = Object.assign({}, baseMoves[name]);
    if (id === 'deepseek' && name === 'special') Object.assign(move, { startup: 22, active: 1, recovery: 29, projectile: true, damage: 115, speed: 8, radius: 23 });
    if (id === 'deepseek' && name === 'super') Object.assign(move, { startup: 25, active: 1, recovery: 42, projectile: true, damage: 260, speed: 11, radius: 46 });
    if (id === 'claude' && name === 'special') Object.assign(move, { startup: 4, active: 24, recovery: 29, counter: true, damage: 150 });
    if (id === 'claude' && name === 'super') Object.assign(move, { startup: 15, active: 7, recovery: 40, reach: 185, damage: 290 });
    if (id === 'gemini' && name === 'special') Object.assign(move, { startup: 10, active: 12, recovery: 25, damage: 115, reach: 125, y: -96, height: 110 });
    if (id === 'gemini' && name === 'super') Object.assign(move, { startup: 20, active: 12, recovery: 40, reach: 210, y: -210, height: 215, damage: 265 });
    move.total = move.startup + move.active + move.recovery;
    return move;
  }

  const frameData = Object.fromEntries(characters.map(c => [c.id, Object.fromEntries(Object.keys(baseMoves).map(n => [n, moveData(c.id, n)]))]));
  const buttonNames = ['jump', 'light', 'heavy', 'special', 'super', 'dash'];
  function fighter(id, index) {
    return { id, index, x: index ? 900 : 380, y: FLOOR, vx: 0, vy: 0, facing: index ? -1 : 1,
      hp: MAX_HP, maxHp: MAX_HP, energy: 30, guardMeter: 100,
      state:'idle',stateFrame:0,attackPhase:null,corner:null,airborneHit:false,juggleHits:0,techAge:0,
      action: 'idle', actionFrame: 0, stun: 0, combo: 0, receivedCombo: 0, comboDamage: 0,
      guard: false, crouch: false, blockstun: 0, knockback: 0, hitFlash: 0, jumped: 0, invulnerable: 0, knockdown: 0,
      buffer: null, hitVictims: [], attackSerial: 0, attackConnected: false,
      spawned: false, previousInput: {}, guardCooldown: 0 };
  }
  function create(options = {}) {
    const ids = (options.characters || ['gpt', 'deepseek']).map(id => characters.some(c => c.id === id) ? id : 'gpt');
    while (ids.length < 2) ids.push('deepseek');
    return { version: VERSION, phase: 'countdown', frame: 0, phaseFrames: 180, timer: 60, timeFrames: ROUND_FRAMES,
      round: 1, wins: [0, 0], winner: null, roundWinner: null, fighters: [fighter(ids[0], 0), fighter(ids[1], 1)],
      projectiles: [], effects: [], hitboxes: [], hurtboxes: [], announcement: '准备', announcementFrames:45, freeze: 0,
      nextEffectId:1, nextProjectileId: 1, lastHits: [], stats: [{ damage: 0, blocks: 0, maxCombo: 0, knockdowns: 0 }, { damage: 0, blocks: 0, maxCombo: 0, knockdowns: 0 }] };
  }

  function normalizedInput(input) {
    const out = {};
    for (const k of ['left', 'right', 'down', 'guard','run','tech', ...buttonNames]) out[k] = !!(input && input[k]);
    return out;
  }
  function overlaps(a, b) { return a.x < b.x + b.w && a.x + a.w > b.x && a.y < b.y + b.h && a.y + a.h > b.y; }
  function hurtbox(f) { const h = f.crouch ? 83 : 139; return { x: f.x - 28, y: f.y - h, w: 56, h, owner: f.index }; }
  function attackBox(f, move) {
    return { x: f.facing > 0 ? f.x + 13 : f.x - 13 - move.reach, y: f.y + move.y,
      w: move.reach, h: move.height, owner: f.index, action: f.action };
  }
  function active(f) {
    const m = frameData[f.id][f.action];
    return !!m && f.actionFrame >= m.startup && f.actionFrame < m.startup + m.active;
  }
  function actionable(f) { return !f.airborneHit && !f.stun && !f.knockdown && !f.blockstun && f.action === 'idle'; }
  function changeAction(f, name) {
    f.lightChain=name==='light'&&f.action==='light'?(f.lightChain||0)+1:0;
    transition(f,'attack');
    f.action = name; f.actionFrame = 0; f.hitVictims = []; f.attackSerial++; f.attackConnected = false; f.spawned = false; f.guard = false;
  }
  function canCancel(f, name) {
    if (!f.attackConnected || f.stun || f.knockdown || f.blockstun) return false;
    if(f.action==='light'&&name==='light'&&(f.lightChain||0)<2)return true;
    if ((f.action === 'light' || f.action === 'airLight') && ['heavy', 'special', 'super'].includes(name)) return true;
    return ['heavy', 'airHeavy', 'special'].includes(f.action) && name === 'super';
  }
  function perform(f, name) {
    if (name === 'jump') {
      const extra = f.id === 'gemini' && f.jumped === 1;
      if (!actionable(f) || (f.y < FLOOR && !extra)) return false;
      f.vy = -14.2; f.jumped++; f.guard = false; return true;
    }
    if (!actionable(f) && !canCancel(f, name)) return false;
    if (name === 'light' && f.y < FLOOR) name = 'airLight';
    if (name === 'heavy') name = f.y < FLOOR ? 'airHeavy' : f.crouch ? 'sweep' : 'heavy';
    const m = frameData[f.id][name];
    if (!m || f.energy < m.cost || (name === 'dash' && f.y < FLOOR)) return false;
    if (f.id === 'claude' && name === 'special' && f.y < FLOOR) return false;
    f.energy -= m.cost;
    changeAction(f, name);
    return true;
  }
  function processInput(f, input) {
    const edges = buttonNames.filter(n => input[n] && !f.previousInput[n]);
    // A short input buffer accepts commands entered during the final recovery frames.
    const priority = ['super', 'special', 'heavy', 'light', 'jump', 'dash'];
    const pressed = priority.find(n => edges.includes(n));
    if (pressed) f.buffer = { name: pressed, frames: 10 };
    if (f.buffer) {
      if (perform(f, f.buffer.name)) f.buffer = null;
      else if (--f.buffer.frames <= 0) f.buffer = null;
    }
    f.previousInput = input;
  }
  function particle(state, type, x, y, color, life = 15) { state.announcementFrames=50; if(state.effects.length>=40)state.effects.shift();state.effects.push({ id:state.nextEffectId++,type, x, y, color, life, maxLife: life }); }

  function stepFighter(state, f, opponent, input) {
    if(f.airborneHit){
      f.techAge++;
      if(f.techAge>=physics.techDelay&&(input.tech&&!f.previousInput.tech||input.jump&&!f.previousInput.jump)){
        f.airborneHit=false;f.stun=0;f.action='idle';f.invulnerable=12;f.vy=-5;f.knockback*=.45;f.juggleHits=0;
        particle(state,'tech',f.x,f.y-70,'#b7f7ff',14);
      }
    }
    if(f.hitFlash>0)f.hitFlash--;
    if(f.blockstun>0)f.blockstun--;
    if (f.invulnerable > 0) f.invulnerable--;
    if (f.guardCooldown > 0) f.guardCooldown--;
    if (f.knockdown > 0) {
      if(f.y===FLOOR)f.knockdown--;
      f.action = 'knockdown'; f.guard = false;
      if (!f.knockdown) { f.action = 'idle'; f.invulnerable = 24; f.stun = 0; f.receivedCombo = 0; }
    } else if (f.stun > 0) {
      f.stun--; f.guard = false; f.action = 'hit';
      if (!f.stun) { f.action = 'idle'; f.receivedCombo = 0; opponent.combo = 0; }
    } else if (!frameData[f.id][f.action]) f.action = 'idle';

    if (f.action === 'idle') {
      f.facing = opponent.x >= f.x ? 1 : -1;
      const back = f.facing === 1 ? input.left : input.right;
      f.crouch = input.down && f.y === FLOOR;
      f.guard = !f.guardCooldown && f.y === FLOOR && (input.guard || back);
      const dir = Number(input.right) - Number(input.left);
      f.vx = f.crouch||f.blockstun||f.airborneHit ? 0 : dir * (f.guard ? 2.8 : input.run?physics.runSpeed:physics.walkSpeed);
    } else { f.guard = false; f.crouch = false; f.vx *= 0.81; }
    syncState(f);
    processInput(f, input);

    const m = frameData[f.id][f.action];
    if (m) {
      if (f.action === 'dash' && f.actionFrame < 10) f.vx = f.facing * 13;
      if (f.id === 'gpt' && f.action === 'special' && f.actionFrame < m.startup + m.active) f.vx = f.facing * 7;
      if (f.id === 'gemini' && f.action === 'special' && f.actionFrame < m.startup + m.active) { f.vx = f.facing * 6; if (f.actionFrame === 0 && f.y === FLOOR) f.vy = -8; }
      if (f.action === 'super' && f.actionFrame === 0) {
        state.announcement = characters.find(c => c.id === f.id).superName;
        particle(state, 'super', f.x, f.y - 80, characters.find(c=>c.id===f.id)?.color, 40);
      }
      if (m.projectile && active(f) && !f.spawned) {
        state.projectiles.push({ id: state.nextProjectileId++, x: f.x + f.facing * 65, y: f.y - 72,
          dir: f.facing, owner: f.index, radius: m.radius, speed: m.speed, life: 180, move: Object.assign({}, m), super: f.action === 'super' });
        f.spawned = true;
      }
    }
    f.x = clamp(f.x + f.vx + f.knockback, 55, WIDTH - 55);
    f.knockback *= f.y<FLOOR?0.94:0.87;
    if(Math.abs(f.knockback)<0.08)f.knockback=0;
    f.vy += physics.gravity;
    f.y = Math.min(FLOOR, f.y + f.vy);
    if (f.y === FLOOR) { f.vy = 0; f.jumped = 0; if(f.airborneHit){f.airborneHit=false;f.knockdown=24;f.stun=0;f.action='knockdown';}f.juggleHits=0; }
    if (!f.guard && !f.stun && !f.knockdown) f.guardMeter = Math.min(100, f.guardMeter + 0.13);
    syncState(f);
    return m;
  }

  function resolveHit(state, event) {
    const { owner, target, move, sourceX } = event;
    const attacker = state.fighters[owner], defender = state.fighters[target];
    if (defender.invulnerable || defender.knockdown || defender.airborneHit&&defender.juggleHits>=physics.juggleLimit) return;
    const counter = defender.action === 'special' && defender.id === 'claude' && active(defender);
    if (counter) {
      const amount = 150;
      attacker.hp = Math.max(0, attacker.hp - amount); attacker.stun = 30; attacker.action = 'hit';
      attacker.vx=0;attacker.knockback=sourceX<defender.x?-9:9;attacker.hitFlash=9;
      defender.action = 'idle'; defender.invulnerable = 18; defender.energy = Math.min(100, defender.energy + 15);
      state.stats[target].damage += amount; state.freeze = Math.max(state.freeze, 8);
      state.announcement = '反制成功'; particle(state, 'counter', defender.x, defender.y - 70, '#f4ac83', 24);
      return;
    }
    const front = (sourceX - defender.x) * defender.facing >= 0;
    const blocking = defender.guard && front && defender.y === FLOOR;
    let damage;
    if (blocking) {
      defender.guardMeter = Math.max(0, defender.guardMeter - move.guard);
      state.stats[target].blocks++;
      // Chip cannot kill. A guard break has no hidden extra damage.
      damage = Math.min(defender.hp - 1, Math.ceil(move.damage * 0.05));
      defender.hp -= damage;
      defender.knockback=sourceX<defender.x?3.6:-3.6;defender.blockstun=Math.min(14,move.stun);defender.vx=0;
      defender.guardCooldown = 0;
      if (!defender.guardMeter) {
        defender.guard = false; defender.stun = 48; defender.action = 'hit'; defender.guardCooldown = 90;
        defender.guardMeter = 30; state.announcement = '防御崩解';
      } else state.announcement = '防御';
      particle(state, 'block', defender.x, defender.y - 80, '#b6e8ff');
      state.freeze = Math.max(state.freeze, 3);
    } else {
      const scaled = Math.max(0.35, 1 - defender.receivedCombo * 0.18);
      damage = Math.round(move.damage * scaled);
      defender.hp = Math.max(0, defender.hp - damage);
      defender.receivedCombo++; attacker.combo = defender.receivedCombo;
      attacker.comboDamage = defender.receivedCombo===1?damage:attacker.comboDamage+damage;
      state.stats[owner].maxCombo = Math.max(state.stats[owner].maxCombo, attacker.combo);
      defender.hitFlash=9;defender.blockstun=0;
      defender.stun = move.stun; defender.action = 'hit'; defender.actionFrame = 0;
      defender.vx=0;defender.knockback=(sourceX<defender.x?1:-1)*(move.push/4.5);
      defender.energy = Math.min(100, defender.energy + 6);
      if(move===frameData[attacker.id].heavy||defender.y<FLOOR){defender.airborneHit=true;defender.juggleHits++;defender.techAge=0;defender.vy=-9;defender.stun=Math.max(25,move.stun);}
      if (move.knockdown || defender.receivedCombo >= 4) {
        defender.airborneHit=false;
        defender.vy=-5.5;
        defender.knockdown = 36; defender.stun = 0; defender.action = 'knockdown';
        defender.receivedCombo = 0; defender.guard = false;
      }
      if(defender.x<=55.01||defender.x>=WIDTH-55.01){attacker.knockback=-defender.knockback*.45;}
      syncState(defender);
      state.freeze = Math.max(state.freeze, move.damage > 150 ? 8 : move.damage > 70 ? 5 : 3);
      state.announcement = attacker.combo > 1 ? `${attacker.combo} HIT COMBO` : '命中';
      particle(state, 'hit', defender.x, defender.y - 74, characters.find(c => c.id === attacker.id).color, 16);
      state.effects[state.effects.length-1].damage=damage;
      state.effects[state.effects.length-1].trauma=move.damage>150?.85:move.damage>70?.55:.35;
      if(move.knockdown||defender.knockdown){state.stats[owner].knockdowns++;}
    }
    attacker.energy = Math.min(100, attacker.energy + (blocking ? 3 : move.energy));
    state.stats[owner].damage += damage;
    state.lastHits.push({ frame: state.frame, owner, target, damage, blocked: blocking });
    if (state.lastHits.length > 16) state.lastHits.shift();
  }

  function roundEnd(state, winner, reason) {
    state.roundWinner = winner;
    if (winner !== null) state.wins[winner]++;
    state.projectiles = [];
    state.announcement = winner === null ? 'DRAW · 本回合重赛' : `${winner === 0 ? 'P1' : 'P2'} ${reason}`;
    if (winner !== null && state.wins[winner] >= 2) {
      state.phase = 'ended'; state.winner = winner; state.phaseFrames = 0;
    } else { state.phase = 'roundOver'; state.phaseFrames = 150; }
  }

  function step(state, inputs = [{}, {}], predictionSlot = null) {
    if (state.phase === 'ended') return state;
    state.frame++;
    state.effects = state.effects.filter(e => --e.life > 0);
    const input = [normalizedInput(inputs[0]), normalizedInput(inputs[1])];
    if (state.phase === 'roundOver') {
      if (--state.phaseFrames <= 0) {
        const ids = state.fighters.map(f => f.id);
        state.fighters = ids.map(fighter); state.phase = 'countdown'; state.phaseFrames = 120;
        state.round++; state.timer = 60; state.timeFrames = ROUND_FRAMES; state.freeze = 0;
        state.hitboxes = []; state.hurtboxes = []; state.effects = []; state.roundWinner = null;
      }
      return state;
    }
    if (state.phase === 'countdown') {
      state.announcement = state.phaseFrames > 60 ? String(Math.ceil(state.phaseFrames / 60)) : 'FIGHT';
      if (--state.phaseFrames <= 0) { state.phase = 'playing'; state.announcement = 'FIGHT';state.announcementFrames=45; }
      // Holding an attack through a countdown does not silently trigger a strike.
      state.fighters.forEach((f, i) => { f.previousInput = input[i]; });
      return state;
    }
    if(state.announcementFrames>0&&--state.announcementFrames===0)state.announcement='';
    if (state.freeze > 0) {
      state.freeze--;
      state.fighters.forEach((f, i) => {
        const pressed = ['super', 'special', 'heavy', 'light', 'jump', 'dash'].find(k => input[i][k] && !f.previousInput[k]);
        if (pressed) f.buffer = { name: pressed, frames: 10 };
        f.previousInput = input[i];
      });
      return state;
    }
    state.fighters.forEach(f=>f.stateFrame++);
    state.combatFrame=(state.combatFrame||0)+1;
    state.timeFrames--;
    state.timer = Math.max(0, state.timeFrames / FPS);
    const [a, b] = state.fighters;
    if(predictionSlot===null||predictionSlot===0)stepFighter(state, a, b, input[0]);
    if(predictionSlot===null||predictionSlot===1)stepFighter(state, b, a, input[1]);
    // Pushboxes prevent ground crossing, but jumping can switch sides.
    if (Math.abs(a.y - b.y) < 80 && Math.abs(a.x - b.x) < 57) {
      const left=a.x<=b.x?a:b,right=left===a?b:a;
      const middle=(left.x+right.x)/2;
      left.x=clamp(middle-28.5,55,WIDTH-112);
      right.x=left.x+57;
      if(right.x>WIDTH-55){right.x=WIDTH-55;left.x=right.x-57;}
    }
    state.hurtboxes = state.fighters.map(hurtbox); state.hitboxes = [];
    const events = [];
    for (const f of state.fighters) {
      const m = frameData[f.id][f.action];
      if (predictionSlot!==null || !m || !m.damage || m.projectile || m.counter || !active(f)) continue;
      const box = attackBox(f, m); state.hitboxes.push(box);
      const target = 1 - f.index;
      if (!f.hitVictims.includes(target) && overlaps(box, state.hurtboxes[target])) {
        f.hitVictims.push(target); f.attackConnected = true;
        events.push({ owner: f.index, target, move: m, sourceX: f.x });
      }
    }
    for (const p of state.projectiles) {
      p.x += p.dir * p.speed; p.life--;
      const box = { x: p.x - p.radius, y: p.y - p.radius, w: p.radius * 2, h: p.radius * 2, owner: p.owner };
      state.hitboxes.push(box);
      if (predictionSlot===null && overlaps(box, state.hurtboxes[1 - p.owner])) {
        events.push({ owner: p.owner, target: 1 - p.owner, move: p.move, sourceX: p.x - p.dir * 50 }); p.life = 0;
      }
    }
    state.projectiles = state.projectiles.filter(p => p.life > 0 && p.x > -100 && p.x < WIDTH + 100);
    // Capture all contacts before damage resolution so same-frame strikes trade.
    for (const e of events) resolveHit(state, e);
    for (const f of state.fighters) {
      const m = frameData[f.id][f.action];
      if (m && ++f.actionFrame >= m.total) { f.action = 'idle'; f.actionFrame = 0; f.crouch = false; }
      syncState(f);
      f.energy = clamp(f.energy, 0, 100); f.hp = clamp(f.hp, 0, f.maxHp);
    }
    if(predictionSlot!==null)return state;
    if (a.hp <= 0 || b.hp <= 0) roundEnd(state, a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1, 'K.O.');
    else if (state.timeFrames <= 0) roundEnd(state, a.hp === b.hp ? null : a.hp > b.hp ? 0 : 1, 'TIME UP');
    return state;
  }

  return { VERSION, WIDTH, HEIGHT, FLOOR, FPS, MAX_HP, characters, frameData, physics, states, transitions, transition, overlaps, hurtbox, create, step };
});
