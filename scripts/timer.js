/**
 * timer.js — elapsed session time.
 *
 * Reads from the session model rather than counting, so pausing, refreshing
 * and closing the browser all behave correctly with no extra bookkeeping.
 */

import { elapsed, formatDuration, STATUS } from './sessions.js';

let valueEl = null;
let labelEl = null;
let heroEl = null;
let getSession = () => null;
let ticker = null;

function render() {
  const session = getSession();
  if (!session || !valueEl) return;

  valueEl.textContent = formatDuration(elapsed(session));

  if (labelEl) {
    labelEl.textContent =
      session.status === STATUS.RUNNING   ? 'Elapsed'
      : session.status === STATUS.PAUSED  ? 'Paused'
      :                                     'Total';
  }
  if (heroEl) {
    heroEl.classList.toggle('is-paused', session.status !== STATUS.RUNNING);
  }
}

export function mount(opts) {
  valueEl = opts.value;
  labelEl = opts.label;
  heroEl = opts.hero;
  getSession = opts.getSession;

  render();
  clearInterval(ticker);
  ticker = setInterval(render, 1000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) render();
  });
}

export function refresh() {
  render();
}

export { formatDuration };
