/**
 * bpm.js — bar-length calculator.
 *
 * The thing every producer ends up googling mid-session. Assumes 4/4,
 * which is what the question almost always means.
 */

import { getSetting, setSetting } from './storage.js';

const BEATS_PER_BAR = 4;

const ROWS = [
  { label: '1 Beat',  beats: 1 },
  { label: '1 Bar',   beats: 1  * BEATS_PER_BAR },
  { label: '2 Bars',  beats: 2  * BEATS_PER_BAR },
  { label: '4 Bars',  beats: 4  * BEATS_PER_BAR },
  { label: '8 Bars',  beats: 8  * BEATS_PER_BAR },
  { label: '16 Bars', beats: 16 * BEATS_PER_BAR },
  { label: '32 Bars', beats: 32 * BEATS_PER_BAR }
];

const MIN_BPM = 20;
const MAX_BPM = 999;

let inputEl = null;
let listEl = null;
let rowEls = [];

function parse(raw) {
  const value = parseFloat(String(raw).replace(',', '.'));
  if (!isFinite(value) || value < MIN_BPM || value > MAX_BPM) return null;
  return value;
}

function build() {
  listEl.innerHTML = '';
  rowEls = ROWS.map(row => {
    const wrap = document.createElement('div');
    wrap.className = 'bpm-row';

    const dt = document.createElement('dt');
    dt.textContent = row.label;

    const dd = document.createElement('dd');
    dd.innerHTML = '—';

    wrap.append(dt, dd);
    listEl.append(wrap);
    return dd;
  });
}

function render() {
  const bpm = parse(inputEl.value);
  inputEl.classList.toggle('invalid', inputEl.value.trim() !== '' && bpm === null);

  // Keep "84" and "bpm" visually paired, whatever the number.
  inputEl.style.width = `${Math.max(2, inputEl.value.length) + 0.15}ch`;

  ROWS.forEach((row, i) => {
    if (bpm === null) { rowEls[i].innerHTML = '—'; return; }
    const seconds = (60 / bpm) * row.beats;
    rowEls[i].innerHTML = `${seconds.toFixed(3)}<span class="u">s</span>`;
  });

  if (bpm !== null) setSetting('bpm', bpm);
}

export function mount({ input, list }) {
  inputEl = input;
  listEl = list;

  build();
  inputEl.value = String(getSetting('bpm') ?? 120);
  render();

  inputEl.addEventListener('input', render);
  inputEl.addEventListener('focus', () => inputEl.select());

  // The whole row is a target — no need to hit the digits exactly.
  const row = inputEl.closest('.bpm-input-row');
  if (row) row.addEventListener('click', e => {
    if (e.target !== inputEl) inputEl.focus();
  });

  // Nudge with the arrow keys, like a tempo field should behave.
  inputEl.addEventListener('keydown', e => {
    if (e.key !== 'ArrowUp' && e.key !== 'ArrowDown') return;
    e.preventDefault();
    const step = e.shiftKey ? 10 : 1;
    const current = parse(inputEl.value) ?? 120;
    const next = Math.min(MAX_BPM, Math.max(MIN_BPM,
      current + (e.key === 'ArrowUp' ? step : -step)));
    inputEl.value = String(Math.round(next * 1000) / 1000);
    render();
  });
}

/** Used by tap tempo to push a value in. */
export function setBpm(value) {
  if (!inputEl) return;
  if (document.activeElement === inputEl) inputEl.blur();
  inputEl.value = String(value);
  render();
}
