/**
 * clock.js — the wall clock.
 *
 * Producers lose track of the hour. This is deliberately the biggest thing
 * on the screen. Tap it to switch between 12- and 24-hour; the choice sticks.
 */

import { getSetting, setSetting } from './storage.js';

let timeEl = null;
let dateEl = null;
let ticker = null;

function render() {
  if (!timeEl) return;
  const now = new Date();
  const use24 = !!getSetting('clock24');

  let hours = now.getHours();
  let suffix = '';
  if (!use24) {
    suffix = hours >= 12 ? 'PM' : 'AM';
    hours = hours % 12 || 12;
  }
  const hh = use24 ? String(hours).padStart(2, '0') : String(hours).padStart(2, '0');
  const mm = String(now.getMinutes()).padStart(2, '0');

  timeEl.innerHTML = suffix
    ? `${hh}:${mm}<span class="ampm">${suffix}</span>`
    : `${hh}:${mm}`;

  if (dateEl) {
    dateEl.textContent = now.toLocaleDateString(undefined, {
      weekday: 'long', month: 'long', day: 'numeric'
    });
  }
}

/** Line up the next tick with the top of the minute so the clock never lags. */
function schedule() {
  clearTimeout(ticker);
  const ms = 60000 - (Date.now() % 60000);
  ticker = setTimeout(() => { render(); schedule(); }, ms + 40);
}

export function mount({ time, date, toggle }) {
  timeEl = time;
  dateEl = date;

  if (toggle) {
    toggle.addEventListener('click', () => {
      setSetting('clock24', !getSetting('clock24'));
      render();
    });
  }

  render();
  schedule();

  // Coming back from sleep or a background tab: re-sync immediately.
  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) { render(); schedule(); }
  });
}

export function refresh() {
  render();
}
