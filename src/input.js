// Two-player input.
//
// The phone lies flat between the players. Whichever half of the screen a
// finger lands on decides which paddle it drives:
//   player A — bottom half, bottom paddle
//   player B — top half, top paddle
//
// Dragging is *relative*: a paddle never teleports to a new touch. That matters
// because the whole boost mechanic is built on lifting and replacing fingers.
//
// Keyboard and mouse fall back to the same model so the prototype is testable
// on a desktop, with one deliberate split that a finger cannot make. On a
// keyboard the two halves of "lifting" are separate keys:
//   direction keys steer, and whether one is down decides whether the line is
//     ghosted — so stopping both paddles ghosts the line, and that is all it
//     does. Letting go of a direction key never shoves the ball.
//   the hold key is the finger. It keeps your side down without moving it, and
//     letting go of it is what boosts.
// So one person can drive both sides with two hands, park them to ghost, and
// still fire a boost exactly when they mean to.

import { CFG } from './config.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);

function makePlayer(nx) {
  return {
    nx,             // paddle centre, normalised 0..1 across the screen width
    touching: false,
    boostT: 0,      // seconds of shove left after a lift
    pointerId: null,
    anchorNx: nx,
    anchorX: 0,
    keyLeft: false,
    keyRight: false,
    keyHold: false,
    heldByKey: false,   // was the hold key down last frame?
    justReleased: false,
    justPressed: false,
    justBoosted: false,
  };
}

export class Input {
  constructor(canvas) {
    this.canvas = canvas;
    this.a = makePlayer(0.5);
    this.b = makePlayer(0.5);
    this.halfN = 0.5 * CFG.paddle.w / CFG.refWidth; // replaced every frame
    this.enabled = false;
    this.boostDur = CFG.boost.dur;
    this.onFirstTouch = null;

    this._bind();
  }

  setBounds(halfWidthPx, screenW) {
    this.halfN = halfWidthPx / screenW;
  }

  reset() {
    for (const p of [this.a, this.b]) {
      p.nx = 0.5; p.anchorNx = 0.5;
      p.touching = false; p.boostT = 0; p.pointerId = null;
      p.keyLeft = p.keyRight = p.keyHold = p.heldByKey = false;
      p.justReleased = p.justPressed = p.justBoosted = false;
    }
  }

  // Drop every finger without moving the paddles. Used around pause, where
  // re-centring the paddles would be a nasty surprise on resume.
  clearTouches() {
    for (const p of [this.a, this.b]) {
      p.touching = false;
      p.boostT = 0;
      p.pointerId = null;
      p.keyLeft = p.keyRight = p.keyHold = p.heldByKey = false;
      p.justReleased = p.justPressed = p.justBoosted = false;
    }
  }

  // Both fingers off the glass — the PHANTOM condition.
  get handsOff() { return !this.a.touching && !this.b.touching; }

  // +1 shoves the ball toward B (up), -1 toward A (down), 0 cancels.
  get boostDir() {
    return (this.a.boostT > 0 ? 1 : 0) + (this.b.boostT > 0 ? -1 : 0);
  }

  press(p) {
    if (p.touching) return;
    p.touching = true;
    p.justPressed = true;
    if (this.onFirstTouch) this.onFirstTouch();
  }

  // A finger coming off the glass both ends the touch and shoves the ball. On a
  // keyboard those are two different keys, so `boost` lets the caller take the
  // touch away without the shove.
  release(p, boost = true) {
    if (!p.touching) return;
    p.touching = false;
    p.justReleased = true;
    p.pointerId = null;
    if (boost) this.boost(p);
  }

  boost(p) {
    p.boostT = this.boostDur;
    p.justBoosted = true;
  }

  _playerFor(id) {
    if (this.a.pointerId === id) return this.a;
    if (this.b.pointerId === id) return this.b;
    return null;
  }

  _bind() {
    const c = this.canvas;
    const local = (e) => {
      const r = c.getBoundingClientRect();
      return { x: e.clientX - r.left, y: e.clientY - r.top, w: r.width, h: r.height };
    };

    c.addEventListener('pointerdown', (e) => {
      if (!this.enabled) return;
      e.preventDefault();
      const q = local(e);
      const p = q.y < q.h / 2 ? this.b : this.a;
      if (p.pointerId !== null) return;   // that side already has a finger down
      p.pointerId = e.pointerId;
      p.anchorNx = p.nx;
      p.anchorX = q.x / q.w;
      this.press(p);
      try { c.setPointerCapture(e.pointerId); } catch { /* not fatal */ }
    }, { passive: false });

    c.addEventListener('pointermove', (e) => {
      if (!this.enabled) return;
      const p = this._playerFor(e.pointerId);
      if (!p) return;
      e.preventDefault();
      const q = local(e);
      this._drag(p, q.x / q.w);
    }, { passive: false });

    const up = (e) => {
      const p = this._playerFor(e.pointerId);
      if (!p) return;
      this.release(p);
      try { c.releasePointerCapture(e.pointerId); } catch { /* already gone */ }
    };
    c.addEventListener('pointerup', up);
    c.addEventListener('pointercancel', up);
    c.addEventListener('lostpointercapture', up);
    c.addEventListener('contextmenu', (e) => e.preventDefault());

    const keyMap = {
      KeyA: [this.a, 'keyLeft'], KeyD: [this.a, 'keyRight'], KeyS: [this.a, 'keyHold'],
      KeyJ: [this.b, 'keyLeft'], KeyL: [this.b, 'keyRight'], KeyK: [this.b, 'keyHold'],
    };

    // Key state only; whether that counts as a touch is settled in update(),
    // so a direction key and the hold key go through the same one door.
    window.addEventListener('keydown', (e) => {
      const m = keyMap[e.code];
      if (!m || !this.enabled) return;
      e.preventDefault();
      if (e.repeat) return;
      m[0][m[1]] = true;
    });

    window.addEventListener('keyup', (e) => {
      const m = keyMap[e.code];
      if (!m) return;
      m[0][m[1]] = false;
    });

    window.addEventListener('blur', () => {
      for (const p of [this.a, this.b]) {
        p.keyLeft = p.keyRight = p.keyHold = p.heldByKey = false;
        this.release(p, false);
      }
    });
  }

  _drag(p, nx) {
    const lo = this.halfN, hi = 1 - this.halfN;
    const want = p.anchorNx + (nx - p.anchorX);
    const got = clamp(want, lo, hi);
    // Re-anchor at the rails so pushing past the edge doesn't build up slack.
    if (got !== want) { p.anchorNx = got; p.anchorX = nx; }
    p.nx = got;
  }

  update(dt) {
    const lo = this.halfN, hi = 1 - this.halfN;
    for (const p of [this.a, this.b]) {
      if (p.boostT > 0) p.boostT = Math.max(0, p.boostT - dt);

      if (p.pointerId === null) {
        const dir = (p.keyRight ? 1 : 0) - (p.keyLeft ? 1 : 0);

        // The hold key is the only thing that shoves. Its falling edge fires
        // whether or not the paddle is also being steered.
        if (p.keyHold) p.heldByKey = true;
        else if (p.heldByKey) { p.heldByKey = false; this.boost(p); }

        // Either key keeps the side down, but taking the touch away here never
        // boosts — the line ghosting when you stop steering is a readout, not
        // an action.
        const down = dir !== 0 || p.keyHold;
        if (down && !p.touching) this.press(p);
        else if (!down && p.touching) this.release(p, false);

        if (dir) p.nx = clamp(p.nx + dir * 0.95 * dt, lo, hi);
      }

      p.nx = clamp(p.nx, lo, hi);
    }
  }

  clearEdges() {
    for (const p of [this.a, this.b]) {
      p.justReleased = p.justPressed = p.justBoosted = false;
    }
  }
}
