// The simulation.
//
// The ball does not fly around the screen — it runs back and forth along the
// line strung between the two paddles, parameterised by t in [0,1] where t=0 is
// player A's paddle (bottom) and t=1 is player B's (top). Moving a paddle swings
// the whole line, and that is how you aim.

import { CFG, difficulty, derived } from './config.js';
import {
  PALETTE, GATES, SHIELDS, COLLECTABLES, OBSTACLES, makeCollectable, makeObstacle,
  updateEntity, hitTest, resolveObstacle, stateColorOf, ballColorFor,
} from './entities.js';
import { sfx } from './audio.js';

const clamp = (v, a, b) => (v < a ? a : v > b ? b : v);
const rand = (a, b) => a + Math.random() * (b - a);

export class Game {
  constructor(canvas, input, hooks = {}) {
    this.canvas = canvas;
    this.input = input;
    this.hooks = hooks;

    this.W = 400; this.H = 800; this.S = 1;
    this.mode = 'idle';        // 'run' | 'playground' | 'idle'
    this.phase = 'idle';       // 'launch' | 'play' | 'idle'
    this.paused = false;
    this.active = false;

    this.entities = [];
    this.particles = [];
    this.floaters = [];
    this.ball = { t: 0, dir: 1, state: 'normal', trail: [], x: 0, y: 0 };
    this.shake = 0;
    this.flash = 0;
    this.flashColor = GATES.never.color;
    this.banner = null;
  }

  resize(w, h, s) { this.W = w; this.H = h; this.S = s; }

  // ── lifecycle ─────────────────────────────────────────────────────────────

  startRun(run, upgrades) {
    const d = derived(upgrades);
    this.mode = 'run';
    this.run = run;
    this.diff = difficulty(run);
    this.power = d.power;
    this.livesMax = d.lives;
    this.lives = d.lives;
    this.timeLeft = d.time;
    this.timeMax = d.time;
    this.target = CFG.run.target(run);
    this.input.boostDur = CFG.boost.dur * d.boostScale;
    this._begin();
  }

  startPlayground(type) {
    const def = COLLECTABLES[type] || OBSTACLES[type];
    this.mode = 'playground';
    this.run = 1;
    this.pgType = type;
    this.pgIsObstacle = def.cls === 'obs';
    this.diff = difficulty(1);
    this.diff.maxObstacles = this.pgIsObstacle ? 3 : 0;
    this.diff.obstacleGap = 2.4;
    this.diff.obstacleTtl = 22;
    this.diff.obstaclePool = this.pgIsObstacle ? [type] : [];
    // Obstacle pages get MOTEs as filler: ringless, so the practice loop is
    // pure dodging with nothing else to think about.
    this.diff.collectPool = this.pgIsObstacle ? ['mote'] : [type];
    this.power = CFG.base.power;
    this.livesMax = Infinity;
    this.lives = Infinity;
    this.timeLeft = Infinity;
    this.target = Infinity;
    this.input.boostDur = CFG.boost.dur;
    this._begin();
  }

  _begin() {
    this.score = 0;
    this.mult = 1;
    this.entities = [];
    this.particles = [];
    this.floaters = [];
    this.obstacleTimer = this.mode === 'playground' ? 0.6 : 2.2;
    this.collectTimer = 0.35;
    this.shake = 0;
    this.flash = 0;
    this.banner = null;
    this.active = true;
    this.paused = false;
    this.input.reset();
    this.input.enabled = true;
    this._armLaunch(0, 0);
  }

  stop() {
    this.active = false;
    this.phase = 'idle';
    this.mode = 'idle';
    this.input.enabled = false;
  }

  // Park the ball on a paddle and wait for both players to hold.
  _armLaunch(t, delay) {
    this.phase = 'launch';
    this.ball.t = t;
    this.ball.dir = t >= 0.5 ? -1 : 1;   // it always sets off away from its paddle
    this.ball.state = 'normal';
    this.ball.trail.length = 0;
    this.holdT = 0;
    this.launchDelay = delay;
  }

  // ── geometry ──────────────────────────────────────────────────────────────

  get paddleW() { return CFG.paddle.w * this.S; }
  get paddleH() { return CFG.paddle.h * this.S; }
  get ballR() { return CFG.ball.r * this.S; }
  get margin() { return CFG.paddle.margin * this.S; }

  paddleAPos() { return { x: this.input.a.nx * this.W, y: this.H - this.margin }; }
  paddleBPos() { return { x: this.input.b.nx * this.W, y: this.margin }; }

  ballPos(A, B) {
    const t = this.ball.t;
    return { x: A.x + (B.x - A.x) * t, y: A.y + (B.y - A.y) * t };
  }

  // The playable envelope. A paddle centre can only reach [hw, W-hw], so every
  // point on the line does too — anything spawned outside that band would be
  // impossible to touch.
  fieldBounds() {
    const hw = this.paddleW / 2;
    const pad = 34 * this.S;
    return {
      x0: hw, x1: this.W - hw,
      y0: this.margin + pad,
      y1: this.H - this.margin - pad,
    };
  }

  // ── main update ───────────────────────────────────────────────────────────

  update(dt) {
    if (!this.active || this.paused) return;
    dt = Math.min(dt, 1 / 30);

    this.input.update(dt);
    this.input.setBounds(this.paddleW / 2, this.W);

    if (this.input.a.justBoosted || this.input.b.justBoosted) sfx.boost();

    // Keep the ball's screen position current even while parked, so spawn
    // spacing has something honest to measure against.
    const bp = this.ballPos(this.paddleAPos(), this.paddleBPos());
    this.ball.x = bp.x; this.ball.y = bp.y;

    const bounds = this.fieldBounds();
    for (const e of this.entities) updateEntity(e, dt, bounds);

    if (this.phase === 'launch') this._updateLaunch(dt);
    else if (this.phase === 'play') this._updatePlay(dt);

    this._sweep();
    this._updateFx(dt);
    this.input.clearEdges();
  }

  _updateLaunch(dt) {
    if (this.launchDelay > 0) { this.launchDelay -= dt; return; }

    const both = this.input.a.touching && this.input.b.touching;
    if (both) {
      const before = this.holdT;
      this.holdT = Math.min(CFG.launch.hold, this.holdT + dt);
      if (Math.floor(this.holdT * 12) !== Math.floor(before * 12)) sfx.charge();
      if (this.holdT >= CFG.launch.hold) {
        this.phase = 'play';
        this.banner = null;
        sfx.launch();
      }
    } else {
      this.holdT = Math.max(0, this.holdT - dt * CFG.launch.drain);
    }
  }

  _updatePlay(dt) {
    if (this.mode === 'run') {
      this.timeLeft -= dt;
      if (this.timeLeft <= 0) {
        this.timeLeft = 0;
        return this._finish(false, 'OUT OF TIME');
      }
    }

    this._stepBall(dt);
    if (this.phase !== 'play') return;   // a life was lost mid-step

    this._director(dt);

    if (this.mode === 'run' && this.score >= this.target) {
      this._finish(true, 'TARGET MET');
    }
  }

  // What state is the ball in? A shove already under way always wins: the ball
  // finishes its boost before it will drift, so letting go of the second finger
  // never snatches a shove away mid-flight.
  //
  // A lift shoves the ball away from the lifter and does nothing at all to a
  // ball coming the other way. Two lifts cancel, which is also what lets the
  // ghost drift start the moment both players are off with nothing left to run.
  _ballState() {
    const nd = this.input.boostDir;
    if (nd !== 0) return Math.sign(this.ball.dir) === nd ? 'boost' : 'normal';
    return this.input.handsOff ? 'ghost' : 'normal';
  }

  _speedMult(state) {
    if (state === 'boost') return CFG.boost.mult;
    if (state === 'ghost') return CFG.ghost.slow;
    return 1;
  }

  _stepBall(dt) {
    const A = this.paddleAPos(), B = this.paddleBPos();
    const len = Math.hypot(B.x - A.x, B.y - A.y) || 1;
    const basePx = CFG.ball.tps * (this.H - 2 * this.margin) * this.diff.ballSpeed;

    const worst = basePx * (this.input.boostDir !== 0 ? CFG.boost.mult : 1);
    const steps = clamp(Math.ceil((worst * dt) / (this.ballR * 0.6)), 1, 40);
    const sdt = dt / steps;

    for (let i = 0; i < steps; i++) {
      this.ball.state = this._ballState();
      const m = this._speedMult(this.ball.state);
      this.ball.t += this.ball.dir * ((basePx * m * sdt) / len);

      if (this.ball.t <= 0) {
        this.ball.t = -this.ball.t;
        this.ball.dir = 1;
        this._paddleHit(A);
      } else if (this.ball.t >= 1) {
        this.ball.t = 2 - this.ball.t;
        this.ball.dir = -1;
        this._paddleHit(B);
      }

      const p = this.ballPos(A, B);
      this.ball.x = p.x; this.ball.y = p.y;
      if (this._collide(p.x, p.y)) return;
    }

    // The trail remembers the state, so a punch leaves a violet streak and a
    // drift leaves a gold one.
    this.ball.trail.push({
      x: this.ball.x, y: this.ball.y,
      c: ballColorFor(this.ball.state),
    });
    if (this.ball.trail.length > CFG.ball.trail) this.ball.trail.shift();
  }

  _paddleHit(P) {
    sfx.paddle();
    this.shake = Math.max(this.shake, 1.4 * this.S);
    const up = P.y > this.H / 2 ? -1 : 1;
    for (let i = 0; i < 5; i++) {
      this._spark(P.x + rand(-14, 14) * this.S, P.y, rand(-40, 40) * this.S, up * rand(30, 110) * this.S, '#e9ecef', 0.25);
    }
  }

  // ── collision ─────────────────────────────────────────────────────────────

  // Returns true if the step should abort (a life was lost).
  _collide(x, y) {
    const br = this.ballR;
    // The ball's state *is* the key it carries, so what it can strip is exactly
    // what it is drawn as. handsOff stays separate: a phantom is safe to touch
    // the moment both fingers are off, even while a shove is still finishing.
    const world = {
      boosted: this.ball.state === 'boost',
      ghosted: this.ball.state === 'ghost',
      handsOff: this.input.handsOff,
    };

    for (const e of this.entities) {
      if (e.dead || e.cool > 0 || e.spawnT > 0) continue;
      if (!hitTest(e, x, y, br)) continue;

      if (e.cls === 'col') {
        this._collect(e);   // no rings, no conditions: touching it is banking it
      } else {
        const r = resolveObstacle(e, world);
        if (r === 'kill') { this._loseLife(e); return true; }
        if (r === 'damage') { this._damageObstacle(e); e.cool = CFG.hitCool; }
      }
    }
    return false;
  }

  _collect(e) {
    e.dead = true;
    const gain = Math.round(e.value * this.mult);
    this.score += gain;
    this._float(e.x, e.y, `+${gain}`, e.color);
    this._burst(e.x, e.y, e.color, 16, 150);
    sfx.collect(this.mult);
    this.mult = Math.min(CFG.multCap, this.mult + 1);
    this.shake = Math.max(this.shake, 2 * this.S);
  }

  _damageObstacle(e) {
    e.hp -= this.power;
    e.flare = 1;
    // Chips come off in the shield's own colour, so you can see which key landed.
    this._burst(e.x, e.y, SHIELDS[e.shield]?.color || PALETTE.ring, 8, 120);
    if (e.hp > 0) { sfx.crack(); this.shake = Math.max(this.shake, 2.5 * this.S); return; }

    e.dead = true;
    const gain = Math.round(e.value * this.mult);
    this.score += gain;
    this._float(e.x, e.y, `+${gain}`, stateColorOf(e));
    this._burst(e.x, e.y, stateColorOf(e), 26, 220);
    sfx.destroy();
    this.mult = Math.min(CFG.multCap, this.mult + 1);
    this.shake = Math.max(this.shake, 5 * this.S);
    this.flash = 0.35;
    this.flashColor = stateColorOf(e);
  }

  _loseLife(e) {
    sfx.die();
    this._burst(this.ball.x, this.ball.y, GATES.never.color, 30, 260);
    this.shake = 12 * this.S;
    this.flash = 0.7;
    this.flashColor = GATES.never.color;
    this.mult = 1;
    if (e) { e.dead = true; this._burst(e.x, e.y, stateColorOf(e), 10, 140); }

    if (this.mode === 'run') {
      this.lives -= 1;
      if (this.lives <= 0) { this._finish(false, 'NO LIVES LEFT'); return; }
    }

    // The ball comes back on the paddle it was heading for.
    const t = this.ball.dir > 0 ? 1 : 0;
    const A = this.paddleAPos(), B = this.paddleBPos();
    const home = t === 1 ? B : A;

    // Anything camped on the respawn gets swept away so it isn't a free death.
    const rr = CFG.safeClear * this.S;
    for (const o of this.entities) {
      if (o.cls === 'obs' && Math.hypot(o.x - home.x, o.y - home.y) < rr) {
        o.dead = true;
        this._burst(o.x, o.y, stateColorOf(o), 6, 90);
      }
    }

    this.banner = 'LIFE LOST';
    this._armLaunch(t, CFG.launch.delay);
  }

  // ── spawning ──────────────────────────────────────────────────────────────

  _director(dt) {
    const live = this.entities.filter((e) => !e.dead);

    const cols = live.filter((e) => e.cls === 'col');
    if (cols.length === 0) {
      this.collectTimer -= dt;
      if (this.collectTimer <= 0) {
        this._spawnCollectable();
        this.collectTimer = 0.35;
      }
    } else {
      this.collectTimer = 0.35;
    }

    if (this.diff.obstaclePool.length && this.diff.maxObstacles > 0) {
      const obs = live.filter((e) => e.cls === 'obs');
      this.obstacleTimer -= dt;
      if (this.obstacleTimer <= 0 && obs.length < this.diff.maxObstacles) {
        this._spawnObstacle();
        this.obstacleTimer = this.diff.obstacleGap * rand(0.8, 1.25);
      } else if (this.obstacleTimer <= 0) {
        this.obstacleTimer = 0.6;
      }
    }
  }

  _spawnCollectable() {
    const pool = this.diff.collectPool;
    const type = pool[Math.floor(Math.random() * pool.length)];
    const def = COLLECTABLES[type];
    const spot = this._freeSpot((def.r || 12) * this.S, 60);
    if (!spot) return;
    this.entities.push(makeCollectable(type, spot.x, spot.y, this.S, this.diff));
  }

  _spawnObstacle() {
    const pool = this.diff.obstaclePool;
    const type = pool[Math.floor(Math.random() * pool.length)];
    const def = OBSTACLES[type];
    const guess = (def.r || def.armLen || 30) * this.S;
    const spot = this._freeSpot(guess, 90);
    if (!spot) return;
    this.entities.push(makeObstacle(type, spot.x, spot.y, this.S, this.diff));
  }

  // Find somewhere that isn't on top of the ball, a paddle or another entity.
  _freeSpot(r, ballClear) {
    const b = this.fieldBounds();
    const clear = ballClear * this.S;
    for (let i = 0; i < 30; i++) {
      const x = rand(b.x0 + r, b.x1 - r);
      const y = rand(b.y0 + r, b.y1 - r);
      if (Math.hypot(x - this.ball.x, y - this.ball.y) < clear) continue;
      let ok = true;
      for (const e of this.entities) {
        if (e.dead) continue;
        if (Math.hypot(x - e.x, y - e.y) < r + e.r + 16 * this.S) { ok = false; break; }
      }
      if (ok) return { x, y };
    }
    return null;
  }

  _sweep() {
    for (let i = this.entities.length - 1; i >= 0; i--) {
      if (this.entities[i].dead) this.entities.splice(i, 1);
    }
  }

  // ── run resolution ────────────────────────────────────────────────────────

  _finish(cleared, reason) {
    this.phase = 'idle';
    this.active = false;
    this.input.enabled = false;
    const bonus = cleared ? Math.round(this.timeLeft * CFG.run.timeBonusPerSec) : 0;
    if (cleared) { this.score += bonus; sfx.clear(); } else sfx.over();
    this.hooks.onFinish?.({
      cleared, reason, run: this.run,
      score: this.score, target: this.target,
      timeLeft: this.timeLeft, bonus,
      livesLeft: this.lives,
    });
  }

  // ── effects ───────────────────────────────────────────────────────────────

  _spark(x, y, vx, vy, color, life) {
    if (this.particles.length > CFG.maxParticles) return;
    this.particles.push({ x, y, vx, vy, color, life, max: life, size: rand(1, 2.4) * this.S });
  }

  _burst(x, y, color, n, speed) {
    for (let i = 0; i < n; i++) {
      const a = Math.random() * Math.PI * 2;
      const s = speed * this.S * rand(0.25, 1);
      this._spark(x, y, Math.cos(a) * s, Math.sin(a) * s, color, rand(0.25, 0.6));
    }
  }

  _float(x, y, text, color) {
    this.floaters.push({ x, y, text, color, life: 0.95, max: 0.95 });
  }

  _updateFx(dt) {
    for (let i = this.particles.length - 1; i >= 0; i--) {
      const p = this.particles[i];
      p.life -= dt;
      if (p.life <= 0) { this.particles.splice(i, 1); continue; }
      p.x += p.vx * dt; p.y += p.vy * dt;
      p.vx *= Math.pow(0.12, dt); p.vy *= Math.pow(0.12, dt);
    }
    for (let i = this.floaters.length - 1; i >= 0; i--) {
      const f = this.floaters[i];
      f.life -= dt;
      if (f.life <= 0) { this.floaters.splice(i, 1); continue; }
      f.y -= 26 * this.S * dt;
    }
    for (const e of this.entities) if (e.flare) e.flare = Math.max(0, e.flare - dt * 3.5);
    this.shake *= Math.pow(0.02, dt);
    this.flash = Math.max(0, this.flash - dt * 2.4);
  }
}
