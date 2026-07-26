/**
 * breaks.js — a quiet nudge to stand up.
 *
 * No sound, no modal, no blocking. A small pill appears in the corner and
 * fades out on its own. If it is missed, nothing happens.
 */

import { setBreakInterval, consumeDueBreak, msUntilBreak, STATUS } from './sessions.js';
import { showToast } from '../components/toast.js';

const INTERVALS = [30, 45, 60, 90];

let segEl = null;
let nextEl = null;
let getSession = () => null;
let ticker = null;

function renderSegments() {
  const session = getSession();
  if (!session || !segEl) return;
  segEl.querySelectorAll('.seg-btn').forEach(b => {
    b.classList.toggle('active', Number(b.dataset.min) === session.breakIntervalMin);
    b.setAttribute('aria-pressed', String(Number(b.dataset.min) === session.breakIntervalMin));
  });
}

function renderCountdown() {
  const session = getSession();
  if (!session || !nextEl) return;

  if (session.status !== STATUS.RUNNING) {
    nextEl.textContent = session.breaks ? `${session.breaks} taken` : 'paused';
    return;
  }
  const ms = msUntilBreak(session);
  if (ms === null) { nextEl.textContent = '—'; return; }
  const mins = Math.ceil(ms / 60000);
  nextEl.textContent = mins <= 1 ? 'in <1m' : `in ${mins}m`;
}

function check() {
  const session = getSession();
  if (!session) return;
  if (consumeDueBreak(session.id)) {
    showToast('Time for a short break.');
  }
  renderCountdown();
}

export function mount(opts) {
  segEl = opts.seg;
  nextEl = opts.next;
  getSession = opts.getSession;

  segEl.addEventListener('click', e => {
    const btn = e.target.closest('.seg-btn');
    if (!btn) return;
    const minutes = Number(btn.dataset.min);
    if (!INTERVALS.includes(minutes)) return;
    const session = getSession();
    if (!session) return;
    setBreakInterval(session.id, minutes);
    renderSegments();
    renderCountdown();
  });

  refresh();
  clearInterval(ticker);
  ticker = setInterval(check, 1000);

  document.addEventListener('visibilitychange', () => {
    if (!document.hidden) check();
  });
}

export function refresh() {
  renderSegments();
  renderCountdown();
}
