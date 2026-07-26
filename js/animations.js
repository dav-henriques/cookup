/**
 * animations.js
 * ---------------------------------------------------------------------------
 * The living background and a few shared motion helpers.
 *
 * The background is a field of translucent ribbons — slow, wide sine curves
 * that drift across a black canvas. It is deliberately quiet: it should read
 * as depth, never as decoration competing with the content.
 *
 * Performance notes
 *   · Time-based phases, so speed is identical at 60Hz and 120Hz.
 *   · Device pixel ratio capped at 2 — beyond that the cost is invisible.
 *   · The loop pauses when the tab is hidden or the element is off-screen.
 *   · Honours `prefers-reduced-motion` by rendering a single static frame.
 */

/* ==========================================================================
   Colour helpers
   ========================================================================== */

/** `#8ec9ff` -> `{ r, g, b }` */
function hexToRgb(hex) {
  const clean = String(hex).replace('#', '').trim();
  const full = clean.length === 3
    ? clean.split('').map((c) => c + c).join('')
    : clean;
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return { r: 142, g: 201, b: 255 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

/** Mixes two rgb objects. `t` = 0 returns a, 1 returns b. */
function mixRgb(a, b, t) {
  return {
    r: Math.round(a.r + (b.r - a.r) * t),
    g: Math.round(a.g + (b.g - a.g) * t),
    b: Math.round(a.b + (b.b - a.b) * t),
  };
}

const rgba = ({ r, g, b }, a) => `rgba(${r},${g},${b},${a})`;

/* ==========================================================================
   WaveField
   ========================================================================== */

/**
 * Ribbon definitions. Each entry is one translucent band.
 *   base      vertical anchor as a fraction of height
 *   amp       amplitude as a fraction of height
 *   freq      how many full waves fit across the viewport
 *   speed     horizontal drift, radians per second
 *   drift     slow vertical bob, fraction of height
 *   alpha     peak opacity of the fill
 *   tintMix   0 = neutral white-blue, 1 = full mood tint
 */
const RIBBONS = [
  { base: 0.30, amp: 0.062, freq: 1.15, speed: 0.052, drift: 0.030, alpha: 0.042, tintMix: 0.15, line: 0.26 },
  { base: 0.44, amp: 0.050, freq: 1.70, speed: -0.041, drift: 0.024, alpha: 0.036, tintMix: 0.45, line: 0.22 },
  { base: 0.57, amp: 0.078, freq: 0.85, speed: 0.033, drift: 0.038, alpha: 0.048, tintMix: 0.75, line: 0.30 },
  { base: 0.71, amp: 0.044, freq: 2.20, speed: -0.061, drift: 0.020, alpha: 0.028, tintMix: 1.00, line: 0.19 },
  { base: 0.86, amp: 0.092, freq: 0.70, speed: 0.026, drift: 0.030, alpha: 0.040, tintMix: 0.60, line: 0.16 },
];

/** Horizontal sampling step in CSS pixels. Lower = smoother, more work. */
const STEP = 14;

/**
 * The ribbons are soft gradients, so they do not need device-pixel fidelity.
 * The backing store is capped at ~1.1 megapixels and upscaled by the browser,
 * which is invisible on this kind of content and is the single biggest win
 * for frame time on high-DPI displays and low-end GPUs.
 */
const MAX_BACKING_PIXELS = 1_100_000;
const MAX_SCALE = 1.5;
const MIN_SCALE = 0.45;

/** How far below its crest each ribbon is filled, as a multiple of amplitude. */
const FILL_DEPTH = 2.6;

export class WaveField {
  /**
   * @param {HTMLCanvasElement} canvas
   * @param {{ tint?: string, neutral?: string }} [options]
   */
  constructor(canvas, options = {}) {
    this.canvas = canvas;
    this.ctx = canvas.getContext('2d', { alpha: true });

    this.neutral = hexToRgb(options.neutral || '#cfe8ff');
    this.tint = hexToRgb(options.tint || '#8ec9ff');
    this.targetTint = { ...this.tint };

    this.width = 0;
    this.height = 0;
    this.dpr = 1;
    this.lineWidth = 1;
    /** Reused crest buffer — avoids allocating an array every frame. */
    this.points = new Float32Array(1024);
    this.running = false;
    this.rafId = 0;
    this.startedAt = 0;
    this.pausedElapsed = 0;

    this.reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

    this._onResize = this._onResize.bind(this);
    this._onVisibility = this._onVisibility.bind(this);
    this._frame = this._frame.bind(this);

    this._resize();
  }

  /* --- Public API ------------------------------------------------------- */

  start() {
    if (this.running) return;
    this.running = true;
    this.startedAt = performance.now() - this.pausedElapsed;

    window.addEventListener('resize', this._onResize, { passive: true });
    document.addEventListener('visibilitychange', this._onVisibility);

    if (this.reduced) {
      this._draw(0);          // one static, beautiful frame
      this.running = false;
      return;
    }
    this.rafId = requestAnimationFrame(this._frame);
  }

  stop() {
    if (!this.running) return;
    this.running = false;
    this.pausedElapsed = performance.now() - this.startedAt;
    cancelAnimationFrame(this.rafId);
  }

  destroy() {
    this.stop();
    window.removeEventListener('resize', this._onResize);
    document.removeEventListener('visibilitychange', this._onVisibility);
  }

  /**
   * Eases the ribbon colour towards a new mood tint.
   * @param {string} hex
   */
  setTint(hex) {
    this.targetTint = hexToRgb(hex);
    if (this.reduced) {
      this.tint = { ...this.targetTint };
      this._draw(this.pausedElapsed / 1000);
    }
  }

  /* --- Internals -------------------------------------------------------- */

  _onVisibility() {
    if (document.hidden) this.stop();
    else this.start();
  }

  _onResize() {
    clearTimeout(this._resizeTimer);
    this._resizeTimer = setTimeout(() => {
      this._resize();
      if (!this.running) this._draw(this.pausedElapsed / 1000);
    }, 120);
  }

  _resize() {
    const rect = this.canvas.getBoundingClientRect();
    this.width = Math.max(1, Math.floor(rect.width));
    this.height = Math.max(1, Math.floor(rect.height));

    let scale = Math.min(window.devicePixelRatio || 1, MAX_SCALE);
    const area = this.width * this.height;
    if (area * scale * scale > MAX_BACKING_PIXELS) {
      scale = Math.sqrt(MAX_BACKING_PIXELS / area);
    }
    this.dpr = Math.max(MIN_SCALE, Math.min(scale, MAX_SCALE));

    this.canvas.width = Math.round(this.width * this.dpr);
    this.canvas.height = Math.round(this.height * this.dpr);
    this.ctx.setTransform(this.dpr, 0, 0, this.dpr, 0, 0);
    // Keep the crest filament at least one physical pixel wide.
    this.lineWidth = Math.max(1, 1 / this.dpr);

    const needed = Math.ceil((this.width + STEP) / STEP) + 2;
    if (this.points.length < needed) this.points = new Float32Array(needed);
  }

  _frame(now) {
    if (!this.running) return;
    const t = (now - this.startedAt) / 1000;

    // Ease the current tint towards the target — colour changes never snap.
    this.tint = mixRgb(this.tint, this.targetTint, 0.035);

    this._draw(t);
    this.rafId = requestAnimationFrame(this._frame);
  }

  _draw(t) {
    const { ctx, width: w, height: h } = this;
    ctx.clearRect(0, 0, w, h);
    ctx.globalCompositeOperation = 'lighter';

    for (let r = 0; r < RIBBONS.length; r += 1) {
      const cfg = RIBBONS[r];
      const colour = mixRgb(this.neutral, this.tint, cfg.tintMix);

      const baseY = h * cfg.base + Math.sin(t * 0.18 + r) * h * cfg.drift;
      const amp = h * cfg.amp;
      const k = (Math.PI * 2 * cfg.freq) / w;
      const phase = t * cfg.speed * Math.PI * 2;

      // Sample the crest once and reuse it for both the fill and the filament.
      const points = this.points;
      let n = 0;
      for (let x = 0; x <= w + STEP; x += STEP) {
        points[n] =
          baseY +
          Math.sin(x * k + phase) * amp +
          Math.sin(x * k * 2.3 - phase * 1.7) * amp * 0.28 +
          Math.sin(x * k * 0.45 + phase * 0.6) * amp * 0.42;
        n += 1;
      }

      // Fill only the band the gradient is actually visible in. Extending the
      // path to the bottom of the canvas would rasterise millions of fully
      // transparent pixels for nothing.
      const bandBottom = baseY + amp * FILL_DEPTH;

      ctx.beginPath();
      ctx.moveTo(0, bandBottom);
      for (let i = 0; i < n; i += 1) ctx.lineTo(i * STEP, points[i]);
      ctx.lineTo((n - 1) * STEP, bandBottom);
      ctx.closePath();

      const grad = ctx.createLinearGradient(0, baseY - amp, 0, bandBottom);
      grad.addColorStop(0, rgba(colour, cfg.alpha));
      grad.addColorStop(0.55, rgba(colour, cfg.alpha * 0.30));
      grad.addColorStop(1, rgba(colour, 0));
      ctx.fillStyle = grad;
      ctx.fill();

      // Bright filament along the crest — this is what reads as "XMB".
      ctx.beginPath();
      ctx.moveTo(0, points[0]);
      for (let i = 1; i < n; i += 1) ctx.lineTo(i * STEP, points[i]);
      ctx.strokeStyle = rgba(colour, cfg.line);
      ctx.lineWidth = this.lineWidth;
      ctx.stroke();
    }

    ctx.globalCompositeOperation = 'source-over';
  }
}

/* ==========================================================================
   Shared motion helpers
   ========================================================================== */

/**
 * Cycles a element's text through a list of phrases — used by the loader so
 * the wait feels intentional rather than empty.
 * @param {HTMLElement} el
 * @param {string[]} phrases
 * @param {number} interval ms
 * @returns {() => void} stop function
 */
export function cycleText(el, phrases, interval = 520) {
  let i = 0;
  el.textContent = phrases[0];
  const id = setInterval(() => {
    i = (i + 1) % phrases.length;
    el.textContent = phrases[i];
  }, interval);
  return () => clearInterval(id);
}

/**
 * Re-triggers a CSS animation on an element (used for the "pop" feedback).
 * @param {HTMLElement} el
 * @param {string} className
 */
export function replay(el, className) {
  el.classList.remove(className);
  // Force a reflow so the animation restarts from frame 0.
  void el.offsetWidth;
  el.classList.add(className);
}

/**
 * Promise that resolves after `ms`. Keeps the cinematic sequencing readable.
 * @param {number} ms
 */
export const wait = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

/**
 * Counts a number up to its final value. Used for the stats view.
 * @param {HTMLElement} el
 * @param {number} to
 * @param {{ duration?: number, decimals?: number }} [opts]
 */
export function countUp(el, to, opts = {}) {
  const { duration = 900, decimals = 0 } = opts;
  if (window.matchMedia('(prefers-reduced-motion: reduce)').matches) {
    el.textContent = to.toFixed(decimals);
    return;
  }
  const start = performance.now();
  const from = 0;
  const tick = (now) => {
    const p = Math.min(1, (now - start) / duration);
    // easeOutExpo
    const eased = p === 1 ? 1 : 1 - Math.pow(2, -10 * p);
    el.textContent = (from + (to - from) * eased).toFixed(decimals);
    if (p < 1) requestAnimationFrame(tick);
  };
  requestAnimationFrame(tick);
}
