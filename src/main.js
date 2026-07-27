// Bootstrap: canvas sizing, the frame loop, and the meta-game (runs, wallet,
// upgrades, records) that wraps the simulation.

import { CFG, emptyUpgrades } from './config.js';
import { Input } from './input.js';
import { Game } from './game.js';
import { render } from './render.js';
import { UI } from './ui.js';
import * as audio from './audio.js';

const KEY = 'odyssey.meta.v1';

function loadMeta() {
  try {
    const raw = localStorage.getItem(KEY);
    if (raw) return { bestRun: 0, bestGold: 0, muted: false, ...JSON.parse(raw) };
  } catch { /* storage unavailable — play without records */ }
  return { bestRun: 0, bestGold: 0, muted: false };
}

function saveMeta(meta) {
  try { localStorage.setItem(KEY, JSON.stringify(meta)); } catch { /* ignore */ }
}

class App {
  constructor() {
    this.canvas = document.getElementById('stage');
    this.ctx = this.canvas.getContext('2d');
    this.meta = loadMeta();

    this.input = new Input(this.canvas);
    this.input.onFirstTouch = () => audio.unlock();
    this.game = new Game(this.canvas, this.input, { onFinish: (r) => this.onFinish(r) });
    this.ui = new UI(this);

    audio.setMuted(this.meta.muted);
    this.resetMetaGame();

    this._sizeCanvas();
    new ResizeObserver(() => this._sizeCanvas()).observe(document.getElementById('app'));
    window.addEventListener('orientationchange', () => setTimeout(() => this._sizeCanvas(), 120));

    document.addEventListener('visibilitychange', () => {
      if (document.hidden && this.game.active && !this.game.paused) this.pause();
    });
    window.addEventListener('pointerdown', () => audio.unlock(), { once: true });
    window.addEventListener('keydown', (e) => {
      if (e.code === 'Escape' && this.game.active) this.game.paused ? this.resume() : this.pause();
    });

    this.ui.refreshTitle(this.meta);
    this.ui.show('title');

    // Handles for poking at the prototype from the console while tuning.
    window.__odyssey = this;
    window.__g = this.game;

    this.last = performance.now();
    requestAnimationFrame(this._frame);
  }

  resetMetaGame() {
    this.upgrades = emptyUpgrades();
    this.wallet = 0;
    this.run = 1;
    this.runsCleared = 0;
    this.dug = 0;      // gold dug this game, for the results screen
  }

  // ── canvas ────────────────────────────────────────────────────────────────

  _sizeCanvas() {
    const r = this.canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2.5);
    const w = Math.max(1, Math.round(r.width));
    const h = Math.max(1, Math.round(r.height));
    this.canvas.width = Math.round(w * dpr);
    this.canvas.height = Math.round(h * dpr);
    this.ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
    const s = Math.max(CFG.scaleMin, Math.min(CFG.scaleMax, w / CFG.refWidth));
    this.game.resize(w, h, s);
    this.input.setBounds((CFG.paddle.w * s) / 2, w);
  }

  // ── flow ──────────────────────────────────────────────────────────────────

  newGame() {
    this.resetMetaGame();
    this.ui.showBrief(this.run, this.upgrades);
  }

  beginRun() {
    this.ui.hideAll();
    this.game.startRun(this.run, this.upgrades);
    this._sizeCanvas();
  }

  nextRun() {
    this.run += 1;
    this.ui.showBrief(this.run, this.upgrades);
  }

  startPlayground(type) {
    this.ui.hideAll();
    this.game.startPlayground(type);
    this._sizeCanvas();
  }

  onFinish(result) {
    // How deep you got is the record. A points total is not — points are
    // measured against one run's target and mean nothing outside it, so adding
    // them up across runs would be adding up unrelated numbers.
    this.dug += result.gold;
    const depth = this.runsCleared + (result.cleared ? 1 : 0);
    if (depth > this.meta.bestRun || this.dug > this.meta.bestGold) {
      this.meta.bestRun = Math.max(this.meta.bestRun, depth);
      this.meta.bestGold = Math.max(this.meta.bestGold, this.dug);
      saveMeta(this.meta);
    }

    if (result.cleared) {
      this.runsCleared += 1;
      // Gold, and only gold. It is the one thing the shop takes.
      this.wallet += result.gold;
      this.ui.showShop(this, result);
    } else {
      this.ui.showResult(result, this.meta, { runsCleared: this.runsCleared, dug: this.dug });
    }
    this.ui.refreshTitle(this.meta);
  }

  buy(id, cost) {
    if (this.wallet < cost) return;
    this.wallet -= cost;
    this.upgrades[id] += 1;
    audio.sfx.collect(3);
    this.ui.renderShopList(this);
  }

  pause() {
    if (!this.game.active) return;
    this.game.paused = true;
    this.input.enabled = false;
    this.input.clearTouches();
    this.ui.showPause(this.game);
  }

  resume() {
    this.game.paused = false;
    this.input.clearTouches();
    this.input.enabled = true;
    this.ui.hideAll();
    this.last = performance.now();
  }

  toMenu() {
    this.game.stop();
    this.ui.refreshTitle(this.meta);
    this.ui.show('title');
  }

  toggleMute() {
    this.meta.muted = !this.meta.muted;
    audio.setMuted(this.meta.muted);
    saveMeta(this.meta);
    this.ui.refreshTitle(this.meta);
  }

  // ── loop ──────────────────────────────────────────────────────────────────

  _frame = (now) => {
    const dt = Math.min(0.05, (now - this.last) / 1000) || 0;
    this.last = now;
    this.game.update(dt);
    render(this.ctx, this.game);
    requestAnimationFrame(this._frame);
  };
}

// Kill iOS double-tap zoom without swallowing the buttons.
document.addEventListener('gesturestart', (e) => e.preventDefault());

new App();
