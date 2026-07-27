// Drawing tests, through a recording stand-in for a canvas context.
//
// These exist for one claim in particular: that a released half of the line and
// the PHANTOM are drawn as the same thing. That is the sort of agreement that
// rots silently, so it is checked against what render() actually emits rather
// than against the helper in isolation.

import test from 'node:test';
import assert from 'node:assert/strict';

import { difficulty, emptyUpgrades } from '../src/config.js';
import { GATES, PALETTE, makeObstacle } from '../src/entities.js';
import { Game } from '../src/game.js';
import { render } from '../src/render.js';

const GOLD = GATES.handsOff.color;

// Records every stroke and fill with the state that was live at the time.
function recorder() {
  const ops = [];
  let st = { strokeStyle: '#000', fillStyle: '#000', globalAlpha: 1, lineWidth: 1, lineCap: 'butt', dash: [] };
  const stack = [];
  const ctx = {
    get strokeStyle() { return st.strokeStyle; }, set strokeStyle(v) { st.strokeStyle = v; },
    get fillStyle() { return st.fillStyle; }, set fillStyle(v) { st.fillStyle = v; },
    get globalAlpha() { return st.globalAlpha; }, set globalAlpha(v) { st.globalAlpha = v; },
    get lineWidth() { return st.lineWidth; }, set lineWidth(v) { st.lineWidth = v; },
    get lineCap() { return st.lineCap; }, set lineCap(v) { st.lineCap = v; },
    font: '', textAlign: '', textBaseline: '', letterSpacing: '',
    save() { stack.push({ ...st, dash: [...st.dash] }); },
    restore() { if (stack.length) st = stack.pop(); },
    setLineDash(d) { st.dash = [...d]; },
    translate() {}, rotate() {}, clip() {},
    beginPath() {}, moveTo() {}, lineTo() {}, rect() {}, roundRect() {}, arc() {},
    fillRect() { ops.push({ op: 'fill', ...st, dash: [...st.dash] }); },
    fill() { ops.push({ op: 'fill', ...st, dash: [...st.dash] }); },
    stroke() { ops.push({ op: 'stroke', ...st, dash: [...st.dash] }); },
    fillText() { ops.push({ op: 'text', ...st, dash: [...st.dash] }); },
    measureText() { return { width: 10 }; },
  };
  return { ctx, ops };
}

function stubInput(aTouch, bTouch) {
  const p = (t) => ({ nx: 0.5, touching: t, boostT: 0, pointerId: null, keyLeft: false, keyRight: false, keyHold: false });
  return {
    a: p(aTouch), b: p(bTouch),
    boostDir: 0, boostDur: 0.4, enabled: true,
    get handsOff() { return !this.a.touching && !this.b.touching; },
    update() {}, setBounds() {}, reset() {}, clearTouches() {}, clearEdges() {},
  };
}

// A live playground with one obstacle sitting in the middle of the field.
function frameWith(type, aTouch, bTouch) {
  const input = stubInput(aTouch, bTouch);
  const g = new Game({}, input, {});
  g.resize(400, 800, 1);
  g.startPlayground(type);
  g.phase = 'play';
  g.entities.length = 0;
  const e = makeObstacle(type, 200, 400, 1, difficulty(1));
  e.spawnT = 0;
  g.entities.push(e);

  const { ctx, ops } = recorder();
  render(ctx, g);
  return ops;
}

const frame = (a, b) => frameWith('phantom', a, b);

// Gold dotted strokes: the released line halves and the phantom's ghost shield.
// The X inside the phantom is gold too but deliberately stays solid — dotting
// away the family glyph would cost more legibility than the consistency is
// worth — so the invariant is about the dotted set, not every gold pixel.
const goldDotted = (ops) =>
  ops.filter((o) => o.op === 'stroke' && o.strokeStyle === GOLD && o.dash.length > 0);

test("the phantom's shield is gold and dotted whoever is holding", () => {
  // The shield is the piece's identity, so it never loses its colour — you can
  // always pick a phantom out of the field.
  for (const [a, b] of [[true, true], [true, false], [false, true], [false, false]]) {
    assert.ok(goldDotted(frame(a, b)).length >= 1, `touches ${a}/${b}`);
  }
});

test('gold on the line means the phantom is open right now, and nothing less', () => {
  const dotted = (ops) => ops.filter((o) => o.op === 'stroke' && o.dash.length > 0);

  // One player has let go: their half is dotted the moment they lift, but it is
  // still the line's own ink. Only the shield is gold.
  const one = dotted(frame(true, false));
  assert.ok(one.some((o) => o.strokeStyle === PALETTE.ink),
    'the released half should be dotted ink');
  assert.ok(one.some((o) => o.strokeStyle === GOLD),
    'and the shield should still be gold, so gold has not gone missing');

  // Both let go: the line matches the shield exactly, and no ink dots are left.
  const both = dotted(frame(false, false));
  assert.equal(both.filter((o) => o.strokeStyle === PALETTE.ink).length, 0,
    'once both let go every dotted stroke is gold');
  assert.ok(both.filter((o) => o.strokeStyle === GOLD).length >= 3,
    'both halves plus the shield');
});

test('a ghosted line and a ghost shield are drawn the same way', () => {
  // Nobody holding: two line halves plus every layer of the shield, identical
  // dash, identical weight, identical cap. This is the claim the whole idea
  // rests on — the shield is not *like* a ghosted line, it is one.
  const ops = goldDotted(frame(false, false));
  assert.ok(ops.length >= 3, `expected the line halves and the shield, got ${ops.length}`);

  const shapes = new Set(ops.map((o) => `${o.dash.join(',')}|${o.lineWidth}|${o.lineCap}`));
  assert.equal(shapes.size, 1, `they should be one treatment, found ${[...shapes].join('  /  ')}`);
});

test('a phantom wears no violet at all — its shield is the only ring it has', () => {
  for (const [a, b] of [[true, true], [false, false]]) {
    const violet = frame(a, b).filter((o) => o.op === 'stroke' && o.strokeStyle === PALETTE.ring);
    assert.equal(violet.length, 0, 'the ghost shield replaced the armour, it did not join it');
  }
});

test('a boost shield stays violet and solid, so the two never blur together', () => {
  const ops = frameWith('brittle', false, false)
    .filter((o) => o.op === 'stroke' && o.strokeStyle === PALETTE.ring);
  assert.ok(ops.length >= 3, 'three layers of boost shield');
  for (const o of ops) assert.equal(o.dash.length, 0, 'a boost shield is never dotted');
});

test('the treatment fades until the state is actually live, then brightens', () => {
  const half = goldDotted(frame(true, false));   // one player has let go
  const both = goldDotted(frame(false, false));  // both have

  const alpha = (ops) => Math.max(...ops.map((o) => o.globalAlpha));
  assert.ok(alpha(both) > alpha(half), 'both hands off should be the brighter state');
  // And the phantom moves with the line rather than on its own schedule.
  assert.equal(new Set(half.map((o) => o.globalAlpha.toFixed(3))).size, 1);
  assert.equal(new Set(both.map((o) => o.globalAlpha.toFixed(3))).size, 1);
});

test('a held half of the line is solid ink, not gold and not dotted', () => {
  const ops = frame(true, true).filter((o) => o.op === 'stroke' && o.strokeStyle === PALETTE.ink);
  assert.ok(ops.length >= 2, 'both halves held');
  for (const o of ops) assert.equal(o.dash.length, 0, 'a held half must be solid');
});

test('the run HUD renders without touching anything undefined', () => {
  const input = stubInput(true, true);
  const g = new Game({}, input, {});
  g.resize(400, 800, 1);
  g.startRun(3, emptyUpgrades());
  g.phase = 'play';
  const { ctx, ops } = recorder();
  render(ctx, g);
  assert.ok(ops.some((o) => o.op === 'text'), 'the HUD should have drawn something');
});
