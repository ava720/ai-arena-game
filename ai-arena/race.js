/* AI ARENA — original deterministic party-race simulation.
 * 60 Hz, no renderer or browser dependencies. Units are world units / seconds.
 * x: lateral, z: course distance, y: feet above track. All obstacle bounds are centered.
 */
(function (root, factory) {
  const api = factory();
  if (typeof module === 'object' && module.exports) module.exports = api;
  else root.AIRace = api;
})(typeof globalThis !== 'undefined' ? globalThis : this, function () {
  'use strict';
  const DT = 1 / 60;
  const finish = 3200;
  const trackWidth = 440;
  const checkpoints = Object.freeze([40, 720, 1460, 2300]);
  const rules = Object.freeze({
    tickRate: 60, countdownFrames: 180, timeLimit: 120,
    radius: 18, runSpeed: 165, acceleration: 1000, friction: 1050,
    gravity: 1040, jumpVelocity: 390, dashSpeed: 390,
    dashDuration: 0.30, dashCooldown: 2.8, respawnDelay: 0.7,
    coyoteFrames: 6, jumpBufferFrames: 6
  });
  const course = Object.freeze([
    { id: 'start', type: 'start', x: 0, z: 40, w: 440, d: 60 },
    { id: 'bump-1', type: 'bumper', x: 0, z: 310, w: 70, d: 70, radius: 35, height: 78, amplitude: 125, period: 3.7, phase: 0 },
    { id: 'sweep-1', type: 'sweeper', x: 0, z: 520, w: 310, d: 18, arm: 155, radius: 12, height: 30, period: 4.4, phase: 0.4 },
    { id: 'cp-1', type: 'checkpoint', x: 0, z: 720, w: 440, d: 22, index: 1 },
    { id: 'gap-1', type: 'pit', x: 0, z: 1020, w: 440, d: 170 },
    { id: 'raft-1', type: 'platform', x: 0, z: 1020, w: 115, d: 105, height: 0, amplitude: 115, period: 4.6, phase: 0.8 },
    { id: 'bump-2', type: 'bumper', x: 0, z: 1250, w: 80, d: 80, radius: 40, height: 85, amplitude: 140, period: 2.9, phase: 1.3 },
    { id: 'cp-2', type: 'checkpoint', x: 0, z: 1460, w: 440, d: 22, index: 2 },
    { id: 'sweep-2', type: 'sweeper', x: -25, z: 1655, w: 350, d: 18, arm: 175, radius: 12, height: 32, period: 3.4, phase: 2.1 },
    { id: 'gap-2', type: 'pit', x: 0, z: 1940, w: 440, d: 220 },
    { id: 'raft-2a', type: 'platform', x: -60, z: 1888, w: 110, d: 100, height: 0, amplitude: 85, period: 4.9, phase: 2.4 },
    { id: 'raft-2b', type: 'platform', x: 60, z: 1990, w: 110, d: 100, height: 0, amplitude: 85, period: 4.9, phase: 2.4 },
    { id: 'cp-3', type: 'checkpoint', x: 0, z: 2300, w: 440, d: 22, index: 3 },
    { id: 'bump-3', type: 'bumper', x: 0, z: 2470, w: 76, d: 76, radius: 38, height: 80, amplitude: 150, period: 2.8, phase: 1 },
    { id: 'boost-left', type: 'boost', x: -100, z: 2650, w: 105, d: 100, speed: 235 },
    { id: 'boost-right', type: 'boost', x: 100, z: 2650, w: 105, d: 100, speed: 235 },
    { id: 'sweep-3', type: 'sweeper', x: 0, z: 2840, w: 370, d: 18, arm: 185, radius: 12, height: 30, period: 3.2, phase: 0.9 },
    { id: 'finish', type: 'finish', x: 0, z: finish, w: 440, d: 20 }
  ].map(o => Object.freeze(o)));
  const keys = ['up', 'down', 'left', 'right', 'jump', 'dash', 'grab'];
  const clamp = (v, lo, hi) => Math.max(lo, Math.min(hi, v));
  const approach = (v, target, amount) => v < target ? Math.min(v + amount, target) : Math.max(v - amount, target);
  const inside = (x, z, o, margin = 0) => Math.abs(x - o.x) <= o.w / 2 + margin && Math.abs(z - o.z) <= o.d / 2 + margin;
  function dynamicObstacle(o, frame) {
    const time = frame * DT;
    const result = { ...o };
    if (o.amplitude) result.x = o.x + Math.sin(time * Math.PI * 2 / o.period + (o.phase || 0)) * o.amplitude;
    if (o.type === 'sweeper') result.angle = time * Math.PI * 2 / o.period + (o.phase || 0);
    return result;
  }
  function groundAt(x, z, frame) {
    for (const o of course) {
      if (o.type === 'platform') {
        const platform = dynamicObstacle(o, frame);
        if (inside(x, z, platform, 3)) return { height: o.height, platform: o.id };
      }
    }
    if (Math.abs(x) > trackWidth / 2 || z < -60 || z > finish + 160) return null;
    if (course.some(o => o.type === 'pit' && inside(x, z, o))) return null;
    return { height: 0, platform: null };
  }
  function makePlayer(id, index) {
    return {
      id, x: index === 0 ? -48 : 48, z: checkpoints[0], y: 0,
      vx: 0, vz: 0, vy: 0, checkpoint: 0, falls: 0,
      dashCooldown: 0, dashTime: 0, dashX: 0, dashZ: 1,
      headingX: 0, headingZ: 1, stun: 0, finished: false, time: null,
      grounded: true, platform: null, respawnTimer: 0, invulnerable: 0,
      coyote: rules.coyoteFrames, jumpBuffer: 0, boost: 0,
      grabCooldown: 0, previousInput: {}, lastCheckpointTime: 0, splits: []
    };
  }
  function create(options = {}) {
    const characters = options.characters || ['gpt', 'deepseek'];
    return {
      kind: 'race', version: '0.2.0', phase: 'countdown', frame: 0,
      countdown: rules.countdownFrames, time: 0, winner: null,
      players: [makePlayer(characters[0] || 'gpt', 0), makePlayer(characters[1] || 'deepseek', 1)],
      effects: [], announcement: '准备出发', reason: '', finish, trackWidth
    };
  }
  function normalize(input) {
    const clean = {};
    for (const key of keys) clean[key] = !!(input && input[key]);
    return clean;
  }
  function addEffect(s, type, p, extra = {}) {
    s.effects.push({ type, x: p.x, z: p.z, y: p.y, life: 30, ...extra });
  }
  function resetPlayer(s, p, index) {
    p.x = index === 0 ? -48 : 48;
    p.z = checkpoints[p.checkpoint];
    p.y = 0;
    p.vx = p.vz = p.vy = 0;
    p.dashTime = 0;
    p.stun = 0;
    p.grounded = true;
    p.platform = null;
    p.coyote = rules.coyoteFrames;
    p.jumpBuffer = 0;
    p.invulnerable = 1.0;
    addEffect(s, 'respawn', p);
  }
  function beginFall(s, p, index) {
    if (p.respawnTimer > 0) return;
    p.falls++;
    p.respawnTimer = rules.respawnDelay;
    p.vx = p.vz = p.vy = 0;
    p.dashTime = 0;
    s.announcement = `P${index + 1} 跌落 · 返回检查点 ${p.checkpoint}`;
    addEffect(s, 'fall', p);
  }
  function collideHazards(s, p, index) {
    if (p.invulnerable > 0) return;
    for (const base of course) {
      if (base.type !== 'bumper' && base.type !== 'sweeper') continue;
      const o = dynamicObstacle(base, s.frame);
      let nx, nz, penetration;
      if (o.type === 'bumper') {
        if (p.y > o.height || p.y < -35) continue;
        const dx = p.x - o.x, dz = p.z - o.z;
        const distance = Math.hypot(dx, dz);
        penetration = o.radius + rules.radius - distance;
        if (penetration <= 0) continue;
        nx = distance > 0.001 ? dx / distance : (index ? 1 : -1);
        nz = distance > 0.001 ? dz / distance : 0;
      } else {
        if (p.y > o.height + 14 || p.y < -25) continue;
        const ax = Math.cos(o.angle), az = Math.sin(o.angle);
        const t = clamp((p.x - o.x) * ax + (p.z - o.z) * az, -o.arm, o.arm);
        const dx = p.x - (o.x + t * ax), dz = p.z - (o.z + t * az);
        const distance = Math.hypot(dx, dz);
        penetration = rules.radius + o.radius - distance;
        if (penetration <= 0) continue;
        // Tangential sweep direction gives a predictable rotating-bar impact.
        const sign = t >= 0 ? 1 : -1;
        nx = -az * sign;
        nz = ax * sign;
      }
      p.x += nx * (penetration + 2);
      p.z += nz * (penetration + 2);
      p.vx = nx * 280;
      p.vz = nz * 280;
      p.vy = Math.max(p.vy, 130);
      p.stun = 0.25;
      p.invulnerable = 0.65;
      p.grounded = false;
      p.dashTime = 0;
      addEffect(s, 'impact', p);
      s.announcement = `P${index + 1} 被机关击退`;
      break;
    }
  }
  function movePlayer(s, p, index, input) {
    const previousZ = p.z;
    const rising = key => input[key] && !p.previousInput[key];
    p.dashCooldown = Math.max(0, p.dashCooldown - DT);
    p.dashTime = Math.max(0, p.dashTime - DT);
    p.invulnerable = Math.max(0, p.invulnerable - DT);
    p.stun = Math.max(0, p.stun - DT);
    p.grabCooldown = Math.max(0, p.grabCooldown - DT);
    p.boost = Math.max(0, p.boost - DT);
    p.jumpBuffer = Math.max(0, p.jumpBuffer - 1);
    if (p.respawnTimer > 0) {
      p.respawnTimer = Math.max(0, p.respawnTimer - DT);
      if (p.respawnTimer === 0) resetPlayer(s, p, index);
      p.previousInput = input;
      return { previousZ, crossedAt: null, wantsGrab: false };
    }
    if (p.grounded && p.platform) {
      const base = course.find(o => o.id === p.platform);
      if (base) p.x += dynamicObstacle(base, s.frame).x - dynamicObstacle(base, s.frame - 1).x;
    }
    let dirX = Number(input.right) - Number(input.left);
    let dirZ = Number(input.up) - Number(input.down);
    const length = Math.hypot(dirX, dirZ);
    if (length > 0) { dirX /= length; dirZ /= length; }
    if (length > 0 && p.stun === 0) { p.headingX = dirX; p.headingZ = dirZ; }
    if (rising('jump')) p.jumpBuffer = rules.jumpBufferFrames;
    if (p.grounded) p.coyote = rules.coyoteFrames;
    else p.coyote = Math.max(0, p.coyote - 1);
    if (p.jumpBuffer > 0 && p.coyote > 0 && p.stun === 0) {
      p.vy = rules.jumpVelocity;
      p.grounded = false;
      p.platform = null;
      p.coyote = 0;
      p.jumpBuffer = 0;
      addEffect(s, 'jump', p);
    }
    if (rising('dash') && p.dashCooldown === 0 && p.stun === 0) {
      p.dashTime = rules.dashDuration;
      p.dashCooldown = rules.dashCooldown;
      p.dashX = p.headingX;
      p.dashZ = p.headingZ;
      addEffect(s, 'dash', p);
    }
    if (p.stun === 0) {
      if (p.dashTime > 0) {
        p.vx = p.dashX * rules.dashSpeed;
        p.vz = p.dashZ * rules.dashSpeed;
      } else {
        const speed = p.boost > 0 ? 235 : rules.runSpeed;
        const rate = length > 0 ? rules.acceleration : rules.friction;
        p.vx = approach(p.vx, dirX * speed, rate * DT);
        p.vz = approach(p.vz, dirZ * speed, rate * DT);
      }
    }
    p.x = clamp(p.x + p.vx * DT, -650, 650);
    p.z = Math.max(-30, p.z + p.vz * DT);
    const oldY = p.y;
    p.vy -= rules.gravity * (p.dashTime > 0 && !p.grounded ? 0.40 : 1) * DT;
    p.y += p.vy * DT;
    const support = groundAt(p.x, p.z, s.frame);
    if (support && oldY >= support.height - 0.001 && p.y <= support.height && p.vy <= 0) {
      p.y = support.height;
      p.vy = 0;
      p.grounded = true;
      p.platform = support.platform;
    } else {
      p.grounded = false;
      p.platform = null;
    }
    if (p.y < -160) {
      beginFall(s, p, index);
      p.previousInput = input;
      return { previousZ, crossedAt: null, wantsGrab: false };
    }
    collideHazards(s, p, index);
    if (p.grounded && course.some(o => o.type === 'boost' && inside(p.x, p.z, o))) p.boost = 0.65;
    // Every checkpoint is visited in order. Crossing while falling does not count.
    if (p.checkpoint < checkpoints.length - 1 && p.y >= -1 && Math.abs(p.x) <= trackWidth / 2) {
      const next = checkpoints[p.checkpoint + 1];
      if (previousZ < next && p.z >= next) {
        p.checkpoint++;
        p.splits.push(s.time - p.lastCheckpointTime);
        p.lastCheckpointTime = s.time;
        addEffect(s, 'checkpoint', p);
        s.announcement = `P${index + 1} 到达检查点 ${p.checkpoint}`;
      }
    }
    let crossedAt = null;
    if (p.checkpoint === checkpoints.length - 1 && previousZ < finish && p.z >= finish && p.y >= -1 && Math.abs(p.x) <= trackWidth / 2) {
      crossedAt = clamp((finish - previousZ) / (p.z - previousZ), 0, 1);
      p.finished = true;
      p.time = s.time - DT + crossedAt * DT;
      p.z = finish;
    }
    const wantsGrab = rising('grab') && p.grabCooldown === 0 && p.stun === 0;
    p.previousInput = input;
    return { previousZ, crossedAt, wantsGrab };
  }
  function step(s, inputs = []) {
    if (s.phase === 'ended') return s;
    s.frame++;
    s.effects = s.effects.filter(e => --e.life > 0);
    const clean = [normalize(inputs[0]), normalize(inputs[1])];
    if (s.phase === 'countdown') {
      s.countdown--;
      s.announcement = String(Math.max(1, Math.ceil(s.countdown / 60)));
      s.players.forEach((p, i) => { p.previousInput = clean[i]; });
      if (s.countdown <= 0) { s.phase = 'playing'; s.announcement = '出发！'; }
      return s;
    }
    s.time += DT;
    const results = s.players.map((p, i) => movePlayer(s, p, i, clean[i]));
    // Optional shove is simultaneous and limited by a 1.2 second cooldown.
    const pushes = results.map((r, i) => {
      const p = s.players[i], other = s.players[1 - i];
      return r.wantsGrab && p.respawnTimer === 0 && other.respawnTimer === 0 && other.invulnerable === 0 &&
        Math.hypot(other.x - p.x, other.z - p.z) < 62 && Math.abs(other.y - p.y) < 45;
    });
    pushes.forEach((hit, i) => {
      if (!results[i].wantsGrab) return;
      const p = s.players[i], other = s.players[1 - i];
      p.grabCooldown = 1.2;
      if (!hit) return;
      const dx = other.x - p.x, dz = other.z - p.z, length = Math.hypot(dx, dz) || 1;
      other.vx = dx / length * 220;
      other.vz = dz / length * 220;
      other.stun = 0.18;
      other.invulnerable = 0.6;
      addEffect(s, 'shove', other);
    });
    const crossed = results.map(r => r.crossedAt);
    if (crossed[0] !== null || crossed[1] !== null) {
      s.phase = 'ended';
      s.reason = 'finish';
      if (crossed[0] !== null && crossed[1] !== null) s.winner = Math.abs(crossed[0] - crossed[1]) < 1e-9 ? null : crossed[0] < crossed[1] ? 0 : 1;
      else s.winner = crossed[0] !== null ? 0 : 1;
      s.announcement = s.winner === null ? '同时冲线 · 平局' : `P${s.winner + 1} 率先冲线！`;
    } else if (s.time >= rules.timeLimit) {
      s.time = rules.timeLimit;
      s.phase = 'ended';
      s.reason = 'timeout';
      const [a, b] = s.players;
      const diff = a.checkpoint === b.checkpoint ? a.z - b.z : a.checkpoint - b.checkpoint;
      s.winner = Math.abs(diff) < 1e-6 ? null : diff > 0 ? 0 : 1;
      s.announcement = s.winner === null ? '时间到 · 平局' : `时间到 · P${s.winner + 1} 领先获胜`;
    }
    return s;
  }
  return { create, step, course, dynamicObstacle, groundAt, finish, trackWidth, checkpoints, rules };
});
