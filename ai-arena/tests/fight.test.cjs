'use strict';
const assert = require('node:assert/strict');
const Fight = require('../fight.js');
let passed = 0;
function test(name, fn) { fn(); passed++; console.log(`PASS ${name}`); }
function ready(ids = ['gpt', 'deepseek']) { const s = Fight.create({ characters: ids }); for (let i = 0; i < 180; i++) Fight.step(s); assert.equal(s.phase, 'playing'); return s; }
function ticks(s, n, input) { for (let i = 0; i < n; i++) Fight.step(s, input || [{}, {}]); }
function close(s) { s.fighters[0].x = 550; s.fighters[1].x = 635; }

test('countdown does not simulate combat', () => {
  const s = Fight.create(); ticks(s, 100, [{ right: true, light: true }, {}]);
  assert.equal(s.fighters[0].x, 380); assert.equal(s.fighters[1].hp, 1000);
});
test('out-of-range strike cannot damage', () => {
  const s = ready(); Fight.step(s, [{ light: true }, {}]); ticks(s, 40);
  assert.equal(s.fighters[1].hp, 1000);
});
test('startup exists and active frames hit only once', () => {
  const s = ready(); close(s); Fight.step(s, [{ light: true }, {}]);
  assert.equal(s.fighters[1].hp, 1000); ticks(s, 4); assert.equal(s.fighters[1].hp, 1000);
  ticks(s, 1); assert.equal(s.fighters[1].hp, 945); ticks(s, 8); assert.equal(s.fighters[1].hp, 945);
});
test('holding attack does not auto-repeat', () => {
  const s = ready(); close(s); ticks(s, 120, [{ light: true }, {}]);
  assert.equal(s.lastHits.length, 1);
});
test('recovery prevents immediate heavy restart', () => {
  const s = ready(); close(s); Fight.step(s, [{ heavy: true }, {}]); ticks(s, 2);
  Fight.step(s, [{ heavy: true }, {}]); assert.equal(s.fighters[0].actionFrame, 4);
});
test('guard reduces damage and consumes guard meter', () => {
  const s = ready(); close(s); Fight.step(s, [{ heavy: true }, { guard: true }]);
  ticks(s, 20, [{}, { guard: true }]); assert.ok(s.fighters[1].hp >= 993); assert.ok(s.fighters[1].guardMeter < 100);
});
test('special requires meter and consumes it once', () => {
  const s = ready(); s.fighters[0].energy = 24; Fight.step(s, [{ special: true }, {}]);
  assert.equal(s.fighters[0].action, 'idle'); ticks(s, 10); s.fighters[0].energy = 30;
  Fight.step(s, [{ special: true }, {}]); assert.equal(s.fighters[0].energy, 5);
});
test('jump clears the low attack hitbox', () => {
  const s = ready(); close(s); Fight.step(s, [{ down: true, heavy: true }, { jump: true }]); ticks(s, 18);
  assert.equal(s.fighters[1].hp, 1000); assert.ok(s.fighters[1].y < 400);
});
test('DeepSeek creates a moving projectile', () => {
  const s = ready(['deepseek', 'gpt']); Fight.step(s, [{ special: true }, {}]); ticks(s, 22);
  assert.equal(s.projectiles.length, 1); const x = s.projectiles[0].x; ticks(s, 1); assert.ok(s.projectiles[0].x > x);
});
test('Claude counter has a genuine reaction window', () => {
  const s = ready(['gpt', 'claude']); close(s); Fight.step(s, [{ heavy: true }, { special: true }]); ticks(s, 20);
  assert.equal(s.fighters[1].hp, 1000); assert.equal(s.fighters[0].hp, 850);
});
test('same-frame KOs trade to a draw', () => {
  const s = ready(['gpt', 'gpt']); close(s); s.fighters.forEach(f => f.hp = 1);
  Fight.step(s, [{ light: true }, { light: true }]); ticks(s, 5);
  assert.equal(s.phase, 'roundOver'); assert.deepEqual(s.wins, [0, 0]); assert.equal(s.roundWinner, null);
});
test('round reset and two-win match end', () => {
  const s = ready(); s.fighters[1].hp = 0; Fight.step(s); assert.equal(s.phase, 'roundOver'); assert.deepEqual(s.wins, [1, 0]);
  ticks(s, 270); assert.equal(s.phase, 'playing'); assert.equal(s.fighters[1].hp, 1000); assert.equal(s.round, 2);
  s.fighters[1].hp = 0; Fight.step(s); assert.equal(s.phase, 'ended'); assert.equal(s.winner, 0);
});
test('timeout uses life and exact tie replays round', () => {
  const s = ready(); s.timeFrames = 1; Fight.step(s); assert.equal(s.phase, 'roundOver'); assert.equal(s.roundWinner, null);
  const t = ready(); t.timeFrames = 1; t.fighters[0].hp = 900; Fight.step(t); assert.equal(t.roundWinner, 1);
});
test('same input log produces byte-identical state', () => {
  const a = ready(['gemini', 'claude']), b = ready(['gemini', 'claude']);
  for (let t = 0; t < 6000; t++) {
    const input = [{ right: t % 170 < 70, left: t % 170 > 125, light: t % 29 === 0, heavy: t % 89 === 0, jump: t % 120 === 0, special: t % 119 === 0 },
      { left: t % 220 < 90, guard: t % 95 < 35, heavy: t % 51 === 0, super: t % 151 === 0, jump: t % 170 === 0 }];
    Fight.step(a, input); Fight.step(b, input);
  }
  assert.equal(JSON.stringify(a), JSON.stringify(b));
  for (const f of a.fighters) { assert.ok(f.hp >= 0 && f.hp <= f.maxHp); assert.ok(f.energy >= 0 && f.energy <= 100); assert.ok(Number.isFinite(f.x)); }
});
console.log(`\n${passed} fighting-engine tests passed.`);
