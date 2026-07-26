/**
 * share.js
 * ---------------------------------------------------------------------------
 * Poster export and native sharing.
 *
 * The image is painted with the Canvas 2D API rather than an HTML-to-image
 * library: it keeps the app dependency-free, renders identically on every
 * browser, and gives pixel control over a layout that has to look good at
 * 1080x1920 in someone's Story.
 *
 * Two formats are supported and both are described declaratively in
 * `FORMATS`, so adding e.g. a 1920x1080 banner is a single object.
 */

import { toText } from './generator.js';
import { formatDateKey } from './daily.js';

/* ==========================================================================
   Format definitions
   ========================================================================== */

export const FORMATS = {
  story: {
    id: 'story',
    name: 'Story',
    width: 1080,
    height: 1920,
    pad: 84,
    cols: 2,
    cardH: 172,
    minCardH: 132,
    maxCardH: 200,
    gap: 24,
    itemCount: 10,
    brandSize: 30,
    titleSize: 92,
    chipSize: 30,
    labelSize: 22,
    valueSize: 44,
    ruleLabelSize: 24,
    ruleSize: 46,
    footerSize: 26,
  },
  square: {
    id: 'square',
    name: 'Square',
    width: 1080,
    height: 1080,
    pad: 68,
    cols: 3,
    cardH: 132,
    minCardH: 104,
    maxCardH: 156,
    gap: 18,
    itemCount: 6,
    brandSize: 26,
    titleSize: 62,
    chipSize: 24,
    labelSize: 18,
    valueSize: 32,
    ruleLabelSize: 20,
    ruleSize: 34,
    footerSize: 22,
  },
};

const FONT_STACK =
  'Inter, -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif';

const font = (weight, size) => `${weight} ${size}px ${FONT_STACK}`;

/* ==========================================================================
   Canvas primitives
   ========================================================================== */

function roundRect(ctx, x, y, w, h, r) {
  if (typeof ctx.roundRect === 'function') {
    ctx.beginPath();
    ctx.roundRect(x, y, w, h, r);
    return;
  }
  const radius = Math.min(r, w / 2, h / 2);
  ctx.beginPath();
  ctx.moveTo(x + radius, y);
  ctx.arcTo(x + w, y, x + w, y + h, radius);
  ctx.arcTo(x + w, y + h, x, y + h, radius);
  ctx.arcTo(x, y + h, x, y, radius);
  ctx.arcTo(x, y, x + w, y, radius);
  ctx.closePath();
}

/** Wraps `text` into lines that fit `maxWidth` at the current font. */
function wrapText(ctx, text, maxWidth) {
  const words = String(text).split(/\s+/);
  const lines = [];
  let line = '';

  words.forEach((word) => {
    const candidate = line ? `${line} ${word}` : word;
    if (ctx.measureText(candidate).width <= maxWidth || !line) {
      line = candidate;
    } else {
      lines.push(line);
      line = word;
    }
  });
  if (line) lines.push(line);
  return lines;
}

/**
 * Shrinks the font until the text fits within `maxLines`, then draws it.
 * @returns {number} the y coordinate just below the block
 */
function drawWrapped(ctx, text, x, y, maxWidth, {
  size, weight = 600, lineHeight = 1.16, maxLines = 3, color = '#ffffff', minSize = 20,
}) {
  let fontSize = size;
  let lines = [];

  for (;;) {
    ctx.font = font(weight, fontSize);
    lines = wrapText(ctx, text, maxWidth);
    if (lines.length <= maxLines || fontSize <= minSize) break;
    fontSize -= 2;
  }

  if (lines.length > maxLines) {
    lines = lines.slice(0, maxLines);
    lines[maxLines - 1] = `${lines[maxLines - 1].replace(/[.,;:]?$/, '')}…`;
  }

  ctx.fillStyle = color;
  ctx.textBaseline = 'top';
  lines.forEach((l, i) => ctx.fillText(l, x, y + i * fontSize * lineHeight));

  return y + lines.length * fontSize * lineHeight;
}

/** Letter-spaced small caps label. Falls back to manual spacing. */
function drawLabel(ctx, text, x, y, { size, color, spacing = 3 }) {
  ctx.font = font(650, size);
  ctx.fillStyle = color;
  ctx.textBaseline = 'top';

  if ('letterSpacing' in ctx) {
    ctx.letterSpacing = `${spacing}px`;
    ctx.fillText(text.toUpperCase(), x, y);
    ctx.letterSpacing = '0px';
    return;
  }

  let cursor = x;
  for (const ch of text.toUpperCase()) {
    ctx.fillText(ch, cursor, y);
    cursor += ctx.measureText(ch).width + spacing;
  }
}

function hexToRgb(hex) {
  const clean = String(hex).replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = parseInt(full, 16);
  if (Number.isNaN(int)) return { r: 142, g: 201, b: 255 };
  return { r: (int >> 16) & 255, g: (int >> 8) & 255, b: int & 255 };
}

const rgba = (hex, a) => {
  const { r, g, b } = hexToRgb(hex);
  return `rgba(${r},${g},${b},${a})`;
};

/* ==========================================================================
   Background
   ========================================================================== */

function paintBackground(ctx, cfg, tint) {
  const { width: w, height: h } = cfg;

  ctx.fillStyle = '#060606';
  ctx.fillRect(0, 0, w, h);

  // Coloured bloom behind the header.
  const bloom = ctx.createRadialGradient(w * 0.5, h * 0.06, 0, w * 0.5, h * 0.06, w * 0.95);
  bloom.addColorStop(0, rgba(tint, 0.30));
  bloom.addColorStop(0.45, rgba(tint, 0.07));
  bloom.addColorStop(1, 'rgba(6,6,6,0)');
  ctx.fillStyle = bloom;
  ctx.fillRect(0, 0, w, h);

  // Ribbons across the lower third — same language as the app background.
  ctx.globalCompositeOperation = 'lighter';
  const ribbons = [
    { base: 0.74, amp: 0.045, freq: 1.1, phase: 0.0, alpha: 0.16 },
    { base: 0.82, amp: 0.032, freq: 1.8, phase: 2.1, alpha: 0.12 },
    { base: 0.90, amp: 0.055, freq: 0.8, phase: 4.2, alpha: 0.10 },
  ];

  ribbons.forEach((rb) => {
    const baseY = h * rb.base;
    const amp = h * rb.amp;
    const k = (Math.PI * 2 * rb.freq) / w;

    ctx.beginPath();
    ctx.moveTo(0, h);
    for (let x = 0; x <= w; x += 10) {
      const y = baseY + Math.sin(x * k + rb.phase) * amp + Math.sin(x * k * 2.2 + rb.phase * 1.6) * amp * 0.3;
      ctx.lineTo(x, y);
    }
    ctx.lineTo(w, h);
    ctx.closePath();

    const grad = ctx.createLinearGradient(0, baseY - amp, 0, h);
    grad.addColorStop(0, rgba(tint, rb.alpha));
    grad.addColorStop(1, 'rgba(6,6,6,0)');
    ctx.fillStyle = grad;
    ctx.fill();
  });
  ctx.globalCompositeOperation = 'source-over';

  // Bottom vignette so the footer text always stays readable.
  const vig = ctx.createLinearGradient(0, h * 0.7, 0, h);
  vig.addColorStop(0, 'rgba(6,6,6,0)');
  vig.addColorStop(1, 'rgba(6,6,6,0.85)');
  ctx.fillStyle = vig;
  ctx.fillRect(0, h * 0.7, w, h * 0.3);
}

/* ==========================================================================
   Poster
   ========================================================================== */

/** The parameters shown on the poster, in order. */
function posterItems(c) {
  return [
    ['Genre', c.genre.name],
    ['BPM', String(c.bpm)],
    ['Mood', c.mood.name],
    ['Sample Source', c.sample.source.name],
    ['Drum Style', c.drums.style.name],
    ['Bass', c.bass.name],
    ['Main Instrument', c.mainInstrument.name],
    ['Era', c.era.name],
    ['Chord Style', c.chordStyle.name],
    ['Arrangement', c.arrangement.name],
  ];
}

/**
 * Paints the challenge poster.
 * @param {Object} challenge
 * @param {'story'|'square'} formatId
 * @returns {Promise<HTMLCanvasElement>}
 */
export async function renderPoster(challenge, formatId = 'story') {
  const cfg = FORMATS[formatId] || FORMATS.story;
  const tint = challenge.mood?.tint || '#8ec9ff';

  // Make sure webfonts are ready, otherwise the first export uses fallbacks.
  if (document.fonts?.ready) {
    try { await document.fonts.ready; } catch { /* non-fatal */ }
  }

  const canvas = document.createElement('canvas');
  canvas.width = cfg.width;
  canvas.height = cfg.height;
  const ctx = canvas.getContext('2d');

  paintBackground(ctx, cfg, tint);

  const x = cfg.pad;
  const contentW = cfg.width - cfg.pad * 2;
  let y = cfg.pad;

  /* --- Brand ----------------------------------------------------------- */
  const markSize = cfg.brandSize * 1.6;
  roundRect(ctx, x, y, markSize, markSize, markSize * 0.3);
  ctx.fillStyle = rgba('#ffffff', 0.10);
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.18);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  // Four bars inside the mark.
  const barW = markSize * 0.075;
  const heights = [0.30, 0.55, 0.42, 0.20];
  ctx.fillStyle = tint;
  heights.forEach((hh, i) => {
    const bx = x + markSize * 0.26 + i * markSize * 0.16;
    const bh = markSize * hh;
    roundRect(ctx, bx, y + markSize / 2 - bh / 2, barW, bh, barW / 2);
    ctx.fill();
  });

  drawLabel(ctx, 'Beat Challenge', x + markSize + 20, y + markSize * 0.28, {
    size: cfg.brandSize,
    color: rgba('#ffffff', 0.9),
    spacing: 3.5,
  });

  y += markSize + cfg.pad * 0.55;

  /* --- Mode line -------------------------------------------------------- */
  const modeText = challenge.mode === 'daily' && challenge.dateKey
    ? `Daily Challenge · ${formatDateKey(challenge.dateKey, 'en-GB')}`
    : 'Free Challenge';
  drawLabel(ctx, modeText, x, y, { size: cfg.chipSize * 0.78, color: tint, spacing: 2.5 });
  y += cfg.chipSize * 1.5;

  /* --- Title ------------------------------------------------------------ */
  y = drawWrapped(ctx, challenge.title, x, y, contentW, {
    size: cfg.titleSize,
    weight: 680,
    maxLines: 2,
    lineHeight: 1.04,
  });
  y += cfg.pad * 0.42;

  /* --- Chips ------------------------------------------------------------ */
  const chips = [
    `${challenge.genre.name}`,
    `${challenge.bpm} BPM`,
    `${challenge.mood.name}`,
    `${challenge.difficulty.name}`,
  ];
  let chipX = x;
  const chipH = cfg.chipSize * 1.9;
  ctx.font = font(560, cfg.chipSize);

  chips.forEach((label) => {
    const textW = ctx.measureText(label).width;
    const chipW = textW + cfg.chipSize * 1.5;
    if (chipX + chipW > x + contentW) return;

    roundRect(ctx, chipX, y, chipW, chipH, chipH / 2);
    ctx.fillStyle = rgba('#ffffff', 0.07);
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.13);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    ctx.fillStyle = rgba('#ffffff', 0.82);
    ctx.textBaseline = 'middle';
    ctx.fillText(label, chipX + cfg.chipSize * 0.75, y + chipH / 2 + 1);
    chipX += chipW + cfg.gap * 0.5;
  });
  ctx.textBaseline = 'top';
  y += chipH + cfg.pad * 0.55;

  /* --- Vertical budget ---------------------------------------------------
     The rule and extra blocks are anchored to the bottom and measured first;
     the parameter grid then expands to fill exactly what is left. This keeps
     Story and Square equally well balanced without hand-tuned constants. */
  const blockPad = cfg.pad * 0.5;
  const contentTop = y;

  ctx.font = font(620, cfg.ruleSize);
  const ruleLines = wrapText(ctx, challenge.creativeRule.text, contentW - blockPad * 2)
    .slice(0, 3).length;
  const ruleBlockH = blockPad * 2 + cfg.ruleLabelSize * 2 + ruleLines * cfg.ruleSize * 1.2;

  ctx.font = font(560, cfg.ruleSize * 0.76);
  const extraLines = wrapText(ctx, challenge.extraChallenge.text, contentW - blockPad * 2)
    .slice(0, 2).length;
  const extraBlockH = blockPad * 1.7 + cfg.ruleLabelSize * 1.8 + extraLines * cfg.ruleSize * 0.92;

  const footerH = cfg.footerSize * 2.2;
  const extraTop = cfg.height - cfg.pad - footerH - extraBlockH;
  const ruleTop = extraTop - cfg.gap - ruleBlockH;

  /* --- Parameter grid ----------------------------------------------------
     Drop a row (and its items) if the cards would end up shorter than the
     format's minimum — better to show fewer parameters than to squash them. */
  let items = posterItems(challenge).slice(0, cfg.itemCount);
  let rows = Math.ceil(items.length / cfg.cols);
  const available = ruleTop - cfg.pad * 0.5 - contentTop;

  let cardH = (available - cfg.gap * (rows - 1)) / rows;
  while (cardH < cfg.minCardH && rows > 1) {
    rows -= 1;
    items = items.slice(0, rows * cfg.cols);
    cardH = (available - cfg.gap * (rows - 1)) / rows;
  }
  cardH = Math.min(cardH, cfg.maxCardH);

  const gridH = rows * cardH + cfg.gap * (rows - 1);
  // Centre the grid in its lane if it came out shorter than the space.
  const gridTop = contentTop + Math.max(0, (available - gridH) / 2);
  const cardW = (contentW - cfg.gap * (cfg.cols - 1)) / cfg.cols;
  const radius = Math.min(cardH * 0.19, 34);

  items.forEach(([label, value], i) => {
    const col = i % cfg.cols;
    const row = Math.floor(i / cfg.cols);
    const cx = x + col * (cardW + cfg.gap);
    const cy = gridTop + row * (cardH + cfg.gap);

    roundRect(ctx, cx, cy, cardW, cardH, radius);
    ctx.fillStyle = rgba('#ffffff', 0.055);
    ctx.fill();
    ctx.strokeStyle = rgba('#ffffff', 0.10);
    ctx.lineWidth = 1.5;
    ctx.stroke();

    const inset = Math.min(cardH * 0.19, 30);
    drawLabel(ctx, label, cx + inset, cy + inset, {
      size: cfg.labelSize,
      color: rgba('#ffffff', 0.38),
      spacing: 2.2,
    });

    drawWrapped(ctx, value, cx + inset, cy + inset + cfg.labelSize * 2, cardW - inset * 2, {
      size: cfg.valueSize,
      weight: 620,
      maxLines: 2,
      lineHeight: 1.1,
      minSize: cfg.valueSize * 0.58,
    });
  });

  /* --- Creative rule ---------------------------------------------------- */
  roundRect(ctx, x, ruleTop, contentW, ruleBlockH, radius);
  const ruleGrad = ctx.createLinearGradient(x, ruleTop, x + contentW, ruleTop + ruleBlockH);
  ruleGrad.addColorStop(0, rgba(tint, 0.20));
  ruleGrad.addColorStop(1, rgba('#ffffff', 0.05));
  ctx.fillStyle = ruleGrad;
  ctx.fill();
  ctx.strokeStyle = rgba(tint, 0.36);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  drawLabel(ctx, 'Creative Rule', x + blockPad, ruleTop + blockPad, {
    size: cfg.ruleLabelSize,
    color: tint,
    spacing: 2.4,
  });

  drawWrapped(
    ctx,
    challenge.creativeRule.text,
    x + blockPad,
    ruleTop + blockPad + cfg.ruleLabelSize * 2,
    contentW - blockPad * 2,
    { size: cfg.ruleSize, weight: 620, maxLines: 3, lineHeight: 1.2, minSize: cfg.ruleSize * 0.62 },
  );

  /* --- Extra challenge -------------------------------------------------- */
  roundRect(ctx, x, extraTop, contentW, extraBlockH, radius);
  ctx.fillStyle = rgba('#ffffff', 0.05);
  ctx.fill();
  ctx.strokeStyle = rgba('#ffffff', 0.10);
  ctx.lineWidth = 1.5;
  ctx.stroke();

  drawLabel(ctx, 'Extra Challenge', x + blockPad, extraTop + blockPad * 0.85, {
    size: cfg.ruleLabelSize,
    color: rgba('#ffffff', 0.4),
    spacing: 2.4,
  });

  drawWrapped(
    ctx,
    challenge.extraChallenge.text,
    x + blockPad,
    extraTop + blockPad * 0.85 + cfg.ruleLabelSize * 1.8,
    contentW - blockPad * 2,
    {
      size: cfg.ruleSize * 0.76,
      weight: 560,
      maxLines: 2,
      lineHeight: 1.2,
      color: rgba('#ffffff', 0.86),
      minSize: cfg.ruleSize * 0.5,
    },
  );

  /* --- Footer ----------------------------------------------------------- */
  drawLabel(ctx, 'Random inspiration for music producers',
    x, cfg.height - cfg.pad - cfg.footerSize, {
      size: cfg.footerSize,
      color: rgba('#ffffff', 0.30),
      spacing: 2,
    });

  return canvas;
}

/* ==========================================================================
   Export helpers
   ========================================================================== */

/** @returns {Promise<Blob>} */
export function canvasToBlob(canvas, type = 'image/png', quality = 0.95) {
  return new Promise((resolve, reject) => {
    canvas.toBlob(
      (blob) => (blob ? resolve(blob) : reject(new Error('Could not encode image'))),
      type,
      quality,
    );
  });
}

export function slugify(text) {
  return String(text)
    .toLowerCase()
    .normalize('NFD')
    .replace(/[\u0300-\u036f]/g, '')
    .replace(/[^a-z0-9]+/g, '-')
    .replace(/^-+|-+$/g, '')
    .slice(0, 48) || 'challenge';
}

/** Triggers a browser download for a blob. */
export function downloadBlob(blob, filename) {
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  // Revoke on the next tick so Safari has time to start the download.
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

/**
 * Copies the challenge as plain text. Uses the async clipboard API with a
 * legacy fallback for browsers that block it outside a secure context.
 * @returns {Promise<boolean>}
 */
export async function copyChallenge(challenge, url = '') {
  const text = toText(challenge, { url });
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    try {
      const ta = document.createElement('textarea');
      ta.value = text;
      ta.setAttribute('readonly', '');
      ta.style.position = 'fixed';
      ta.style.opacity = '0';
      document.body.appendChild(ta);
      ta.select();
      const ok = document.execCommand('copy');
      ta.remove();
      return ok;
    } catch {
      return false;
    }
  }
}

/**
 * Shares the challenge natively when available.
 * @returns {Promise<'shared'|'copied'|'failed'>}
 */
export async function shareChallenge(challenge, { url = '', includeImage = false } = {}) {
  const text = toText(challenge, { url: '' });
  const title = `Beat Challenge — ${challenge.title}`;

  if (includeImage && navigator.canShare) {
    try {
      const canvas = await renderPoster(challenge, 'story');
      const blob = await canvasToBlob(canvas);
      const file = new File([blob], `${slugify(challenge.title)}.png`, { type: 'image/png' });
      if (navigator.canShare({ files: [file] })) {
        await navigator.share({ files: [file], title, text: `${title}\n${url}`.trim() });
        return 'shared';
      }
    } catch (err) {
      if (err?.name === 'AbortError') return 'failed';
    }
  }

  if (navigator.share) {
    try {
      await navigator.share({ title, text, url: url || undefined });
      return 'shared';
    } catch (err) {
      if (err?.name === 'AbortError') return 'failed';
    }
  }

  return (await copyChallenge(challenge, url)) ? 'copied' : 'failed';
}
