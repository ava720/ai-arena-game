'use strict';
const test = require('node:test');
const assert = require('node:assert/strict');
const Race = require('../race.js');
const idle = {};
function ready() {
  const s = Race.create({ characters: ['gpt', 'claude'] });
  for (let n = 0; n < Race.rules.countdownFrames; n++) Race.step(s, [idle, idle]);
  assert.equal(s.phase, 'playing');
  return s;
}
function advance(s, frames, inputs = [idle, idle]) {
  for (let n = 0; n < frames; n++) Race.step(s, inputs);
  return s;
}
test('countdown locks movement; race has no automatic running', () => {
  const s = Race.create();
  advance(s, 179, [{ up: true }, { up: true }]);
  assert.equal(s.players[0].z, 40);
  assert.equal(s.time, 0);
  Race.step(s);
  advance(s, 90);
  assert.equal(s.phase, 'playing');
  assert.equal(s.players[0].z, 40);
  assert.equal(s.players[1].z, 40);
});
test('both local players steer independently in two dimensions', () => {
  const s = ready();
  advance(s, 30, [{ up: true }, { right: true }]);
  assert.ok(s.players[0].z > 100);
  assert.equal(s.players[0].x, -48);
  assert.ok(s.players[1].x > 100);
  assert.equal(s.players[1].z, 40);
});
test('diagonal movement is normalized', () => {
  const a = ready(), b = ready();
  advance(a, 20, [{ up: true }, idle]);
  advance(b, 20, [{ up: true, right: true }, idle]);
  const p = a.players[0], q = b.players[0];
  assert.ok(Math.hypot(q.vx, q.vz) <= Race.rules.runSpeed + 1e-9);
  assert.ok(Math.abs(Math.hypot(q.vx, q.vz) - Math.hypot(p.vx, p.vz)) < 1e-9);
});
test('jump is edge-triggered and lands without holding to repeat', () => {
  const s = ready();
  Race.step(s, [{ jump: true }, idle]);
  assert.ok(s.players[0].y > 0);
  advance(s, 100, [{ jump: true }, idle]);
  assert.equal(s.players[0].y, 0);
  assert.equal(s.players[0].grounded, true);
});
test('dash has cooldown and held button cannot auto-repeat', () => {
  const s = ready();
  Race.step(s, [{ dash: true }, idle]);
  assert.equal(s.players[0].dashCooldown, Race.rules.dashCooldown);
  advance(s, 220, [{ dash: true }, idle]);
  assert.equal(s.players[0].dashCooldown, 0);
  assert.equal(s.players[0].dashTime, 0);
  Race.step(s, [idle, idle]);
  Race.step(s, [{ dash: true }, idle]);
  assert.equal(s.players[0].dashCooldown, Race.rules.dashCooldown);
});
test('falling off track respawns once at safe checkpoint', () => {
  const s = ready(), p = s.players[0];
  p.x = 350;
  p.checkpoint = 1;
  p.z = 800;
  advance(s, 130);
  assert.equal(p.falls, 1);
  assert.equal(p.z, Race.checkpoints[1]);
  assert.equal(p.y, 0);
  assert.equal(p.grounded, true);
  assert.equal(p.respawnTimer, 0);
});
test('pit has no floor except on moving platform', () => {
  const raft = Race.course.find(o => o.id === 'raft-1');
  const moving = Race.dynamicObstacle(raft, 260);
  assert.equal(Race.groundAt(-205, 1020, 260), null);
  assert.equal(Race.groundAt(moving.x, moving.z, 260).platform, raft.id);
});
test('grounded player is carried by a moving platform', () => {
  const s = ready(), p = s.players[0];
  const raft = Race.course.find(o => o.id === 'raft-1');
  const before = Race.dynamicObstacle(raft, s.frame);
  Object.assign(p, { x: before.x, z: before.z, platform: raft.id, grounded: true });
  advance(s, 30);
  const after = Race.dynamicObstacle(raft, s.frame);
  assert.ok(Math.abs(p.x - after.x) < 1e-6);
  assert.equal(p.grounded, true);
  assert.equal(p.falls, 0);
});
test('jump plus dash can cross full first gap without falling', () => {
  const s = ready(), p = s.players[0];
  Object.assign(p, { x: -185, z: 910, checkpoint: 1 });
  Race.step(s, [{ up: true, jump: true, dash: true }, idle]);
  advance(s, 70, [{ up: true }, idle]);
  assert.ok(p.z > 1105, `z=${p.z}`);
  assert.equal(p.falls, 0);
  assert.equal(p.grounded, true);
});
test('mid-air player clears low sweeper but grounded player is hit', () => {
  const a = ready(), b = ready();
  const obstacle = Race.dynamicObstacle(Race.course.find(o => o.id === 'sweep-1'), a.frame + 1);
  Object.assign(a.players[0], { x: obstacle.x, z: obstacle.z, y: 75, grounded: false, vy: 0 });
  Object.assign(b.players[0], { x: obstacle.x, z: obstacle.z, y: 0 });
  Race.step(a);
  Race.step(b);
  assert.equal(a.players[0].stun, 0);
  assert.ok(b.players[0].stun > 0);
});
test('checkpoints are recorded sequentially and invalid finish cannot win', () => {
  const s = ready(), p = s.players[0];
  p.z = 718;
  p.vz = Race.rules.runSpeed;
  Race.step(s, [{ up: true }, idle]);
  assert.equal(p.checkpoint, 1);
  p.z = 3199;
  Race.step(s, [{ up: true }, idle]);
  assert.equal(s.phase, 'playing');
  assert.equal(p.finished, false);
});
test('finish selects earliest crossing within tick, independent of player order', () => {
  const s = ready();
  s.players.forEach(p => Object.assign(p, { z: 3199, vz: 165, checkpoint: 3 }));
  s.players[1].z = 3199.5;
  Race.step(s, [{ up: true }, { up: true }]);
  assert.equal(s.phase, 'ended');
  assert.equal(s.winner, 1);
  assert.ok(s.players[1].time < s.players[0].time);
});
test('exact same tick finish is draw and ended state is frozen', () => {
  const s = ready();
  s.players.forEach(p => Object.assign(p, { z: 3199, vz: 165, checkpoint: 3 }));
  Race.step(s, [{ up: true }, { up: true }]);
  assert.equal(s.phase, 'ended');
  assert.equal(s.winner, null);
  const snapshot = JSON.stringify(s);
  advance(s, 120, [{ up: true }, { up: true }]);
  assert.equal(JSON.stringify(s), snapshot);
});
test('timeout awards checkpoint progress before distance', () => {
  const s = ready();
  s.time = Race.rules.timeLimit - 0.001;
  s.players[0].checkpoint = 2;
  s.players[0].z = 1460;
  s.players[1].checkpoint = 1;
  s.players[1].z = 1600;
  Race.step(s);
  assert.equal(s.winner, 0);
  assert.equal(s.reason, 'timeout');
});
test('fixed step replay produces identical complete states', () => {
  const a = Race.create(), b = Race.create();
  for (let i = 0; i < 1200; i++) {
    const input = [{ up: i % 300 < 280, right: i % 200 < 50, left: i % 200 > 150, jump: i % 97 === 0, dash: i % 183 === 0 },
      { up: true, left: i % 240 < 50, right: i % 240 > 170, jump: i % 83 === 0 }];
    Race.step(a, input); Race.step(b, input);
  }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
});

