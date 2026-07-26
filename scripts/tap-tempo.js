/**
 * tap-tempo.js — tap a tempo, get a BPM.
 *
 * Averages the gaps between taps (last 8) and feeds the result straight into
 * the BPM calculator, so there is nothing to confirm or copy across.
 */

const RESET_AFTER = 2600;  // ms of silence before the sequence starts over
const MAX_TAPS = 8;

let taps = [];
let resetTimer = null;
let btn = null;
let readoutEl = null;
let countEl = null;
let onTempo = () => {};

function estimate() {
  if (taps.length < 2) return null;
  let sum = 0;
  for (let i = 1; i < taps.length; i++) sum += taps[i] - taps[i - 1];
  const avg = sum / (taps.length - 1);
  if (avg <= 0) return null;
  const bpm = 60000 / avg;
  if (bpm < 20 || bpm > 999) return null;
  return Math.round(bpm);
}

function pulse() {
  btn.classList.add('pulse');
  setTimeout(() => btn.classList.remove('pulse'), 110);
}

function tap() {
  const now = performance.now();
  if (taps.length && now - taps[taps.length - 1] > RESET_AFTER) taps = [];
  taps.push(now);
  if (taps.length > MAX_TAPS) taps.shift();

  pulse();

  const bpm = estimate();
  if (bpm !== null) {
    readoutEl.textContent = `${bpm} bpm`;
    onTempo(bpm);
  } else {
    readoutEl.textContent = '—';
  }
  countEl.textContent = taps.length < 2 ? 'keep tapping' : `${taps.length} taps`;

  clearTimeout(resetTimer);
  resetTimer = setTimeout(() => {
    taps = [];
    countEl.textContent = 'tap in time';
  }, RESET_AFTER);
}

export function mount({ button, readout, count, onBpm }) {
  btn = button;
  readoutEl = readout;
  countEl = count;
  onTempo = onBpm || (() => {});

  // pointerdown, not click — the tap should register the instant you hit it.
  btn.addEventListener('pointerdown', e => { e.preventDefault(); tap(); });
  btn.addEventListener('keydown', e => {
    if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); tap(); }
  });
  btn.addEventListener('contextmenu', e => e.preventDefault());
}

export function reset() {
  taps = [];
  clearTimeout(resetTimer);
  if (countEl) countEl.textContent = 'tap in time';
  if (readoutEl) readoutEl.textContent = '—';
}
