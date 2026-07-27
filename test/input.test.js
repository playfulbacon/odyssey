// The keyboard model, which is deliberately not the touch model.
//
// A finger does two things at once when it comes off the glass: it ends the
// touch and it shoves the ball. On a keyboard those are split across two keys,
// and the split is easy to collapse again by accident — so it is pinned here.

import test from 'node:test';
import assert from 'node:assert/strict';

import { Input } from '../src/input.js';

// Input wires itself to the DOM in its constructor. Give it just enough to
// build against, then drive update() directly.
function mkInput() {
  const noop = () => {};
  const canvas = {
    addEventListener: noop,
    setPointerCapture: noop,
    releasePointerCapture: noop,
    getBoundingClientRect: () => ({ left: 0, top: 0, width: 400, height: 800 }),
  };
  const had = 'window' in globalThis;
  const prev = globalThis.window;
  globalThis.window = { addEventListener: noop };
  const input = new Input(canvas);
  if (had) globalThis.window = prev; else delete globalThis.window;
  input.setBounds(44, 400);
  input.enabled = true;
  return input;
}

const step = (input, dt = 1 / 60) => { input.clearEdges(); input.update(dt); };

test('a direction key puts the side down and steers it', () => {
  const i = mkInput();
  const before = i.a.nx;

  i.a.keyRight = true;
  step(i);
  assert.equal(i.a.touching, true, 'moving is holding');
  assert.ok(i.a.nx > before, 'and it actually moves');
});

test('letting go of a direction key lifts the side but never shoves the ball', () => {
  const i = mkInput();
  i.a.keyRight = true;
  step(i);

  i.a.keyRight = false;
  step(i);
  assert.equal(i.a.touching, false, 'the side lifts');
  assert.equal(i.a.boostT, 0, 'but stopping is not a shove');
  assert.equal(i.a.justBoosted, false);
});

test('letting go of the hold key is what shoves', () => {
  const i = mkInput();
  i.a.keyHold = true;
  step(i);
  assert.equal(i.a.touching, true);
  assert.equal(i.a.boostT, 0, 'pressing it does nothing on its own');

  i.a.keyHold = false;
  step(i);
  assert.equal(i.a.touching, false);
  assert.ok(i.a.boostT > 0, 'releasing it shoves');
  assert.equal(i.a.justBoosted, true);
});

test('the hold key shoves even while the paddle is still being steered', () => {
  const i = mkInput();
  i.a.keyRight = true; i.a.keyHold = true;
  step(i);

  i.a.keyHold = false;   // still steering
  step(i);
  assert.ok(i.a.boostT > 0, 'the shove is the hold key, whatever else is going on');
  assert.equal(i.a.touching, true, 'and steering keeps the side down');
});

test('a real finger still does both at once', () => {
  const i = mkInput();
  i.press(i.a);
  assert.equal(i.a.touching, true);
  i.release(i.a);
  assert.equal(i.a.touching, false);
  assert.ok(i.a.boostT > 0, 'lifting a finger ends the touch and shoves, as it always did');
});

test('a shove stands whatever the other player does', () => {
  const i = mkInput();
  i.a.keyHold = true; i.b.keyHold = true;
  step(i);

  i.a.keyHold = false;             // A shoves
  step(i);
  const started = i.a.boostT;
  assert.ok(started > 0, 'the shove started');
  assert.equal(i.boostDir, 1, 'and it is pushing');

  i.b.keyHold = false;             // B lifts too, well inside the shove window
  step(i);
  assert.ok(i.a.boostT > 0, 'A\'s shove is still running');
  assert.ok(i.a.boostT < started, 'winding down on its own clock, nothing else');
  assert.equal(i.boostDir, 0, 'though the two shoves now cancel each other');
});

test('a lift shoves even when nobody else is holding', () => {
  const i = mkInput();
  i.a.keyHold = true;              // B never touches the glass at all
  step(i);

  i.a.keyHold = false;
  step(i);
  assert.ok(i.a.boostT > 0, 'the lift still shoves');
  assert.equal(i.boostDir, 1);
});

test('a paddle stays inside the rails however long it is driven', () => {
  const i = mkInput();
  i.a.keyRight = true;
  for (let n = 0; n < 600; n++) step(i);
  assert.ok(i.a.nx <= 1 - i.halfN + 1e-9);

  i.a.keyRight = false; i.a.keyLeft = true;
  for (let n = 0; n < 600; n++) step(i);
  assert.ok(i.a.nx >= i.halfN - 1e-9);
});

test('blur drops everything without firing a parting shove', () => {
  const i = mkInput();
  i.a.keyHold = true; i.b.keyRight = true;
  step(i);

  // Same path the blur handler takes.
  for (const p of [i.a, i.b]) {
    p.keyLeft = p.keyRight = p.keyHold = p.heldByKey = false;
    i.release(p, false);
  }
  assert.equal(i.a.touching, false);
  assert.equal(i.b.touching, false);
  assert.equal(i.a.boostT, 0);
  assert.equal(i.b.boostT, 0);
});
