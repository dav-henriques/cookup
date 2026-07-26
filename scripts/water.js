/**
 * water.js — a glass counter. Tap to add one, hold to reset.
 * That is the entire feature and it should stay that way.
 */

import { addWater, resetWater } from './sessions.js';

const HOLD_MS = 650;

let btn = null;
let countEl = null;
let getSession = () => null;
let holdTimer = null;
let didHold = false;

function render() {
  const session = getSession();
  if (session && countEl) countEl.textContent = session.water;
}

function bump() {
  countEl.classList.remove('bump');
  void countEl.offsetWidth;   // restart the animation
  countEl.classList.add('bump');
}

function startHold() {
  didHold = false;
  btn.classList.add('holding');
  clearTimeout(holdTimer);
  holdTimer = setTimeout(() => {
    const session = getSession();
    if (!session) return;
    didHold = true;
    resetWater(session.id);
    render();
    bump();
    btn.classList.remove('holding');
    if (navigator.vibrate) navigator.vibrate(12);
  }, HOLD_MS);
}

function endHold(commit) {
  clearTimeout(holdTimer);
  btn.classList.remove('holding');
  if (!commit || didHold) { didHold = false; return; }
  const session = getSession();
  if (!session) return;
  addWater(session.id, 1);
  render();
  bump();
}

export function mount(opts) {
  btn = opts.button;
  countEl = opts.count;
  getSession = opts.getSession;

  btn.addEventListener('pointerdown', e => { e.preventDefault(); startHold(); });
  btn.addEventListener('pointerup', () => endHold(true));
  btn.addEventListener('pointerleave', () => endHold(false));
  btn.addEventListener('pointercancel', () => endHold(false));
  btn.addEventListener('contextmenu', e => e.preventDefault());

  btn.addEventListener('keydown', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    e.preventDefault();
    if (e.repeat) return;
    startHold();
  });
  btn.addEventListener('keyup', e => {
    if (e.key !== ' ' && e.key !== 'Enter') return;
    endHold(true);
  });

  render();
}

export function refresh() {
  render();
}
