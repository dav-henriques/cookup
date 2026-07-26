/**
 * ui.js — entry point. Wires the screens together and keeps them in sync.
 *
 * There are only two screens: the list, and the session. Widgets are mounted
 * once at boot and read from whichever session is currently open, so opening
 * and closing sessions never re-binds anything.
 */

import { getState } from './storage.js';
import * as Sessions from './sessions.js';
import * as Clock from './clock.js';
import * as Timer from './timer.js';
import * as Bpm from './bpm.js';
import * as Tap from './tap-tempo.js';
import * as Water from './water.js';
import * as Breaks from './breaks.js';
import { createSessionCard } from '../components/session-card.js';
import { promptName } from '../components/modal.js';

const $ = id => document.getElementById(id);

const el = {
  home: $('screen-home'),
  session: $('screen-session'),
  list: $('session-list'),
  empty: $('empty-state'),
  newBtn: $('btn-new'),
  back: $('btn-back'),
  name: $('session-name'),
  status: $('session-status'),
  toggle: $('btn-toggle'),
  end: $('btn-end'),
  clockBlock: $('clock-block'),
  clockTime: $('clock-time'),
  clockDate: $('clock-date'),
  hero: null,
  elapsed: $('elapsed'),
  elapsedLabel: $('elapsed-label'),
  bpmInput: $('bpm-input'),
  bpmList: $('bpm-list'),
  tapBtn: $('tap-btn'),
  tapReadout: $('tap-readout'),
  tapCount: $('tap-count'),
  waterBtn: $('water-btn'),
  waterCount: $('water-count'),
  breakSeg: $('break-seg'),
  breakNext: $('break-next')
};
el.hero = el.elapsed.closest('.hero');

let currentId = null;
const current = () => (currentId ? Sessions.byId(currentId) : null);

/** The session a background task should care about, even from the list screen. */
function currentOrActive() {
  const open = current();
  if (open) return open;
  const activeId = getState().activeSessionId;
  const active = activeId ? Sessions.byId(activeId) : null;
  return active && active.status === Sessions.STATUS.RUNNING ? active : null;
}

/* ------------------------------------------------------------------ routing */

function go(hash, { replace = false } = {}) {
  if (location.hash === hash) { route(); return; }
  if (replace) history.replaceState(null, '', hash);
  else location.hash = hash;
  if (replace) route();
}

function route() {
  const match = /^#\/s\/(.+)$/.exec(location.hash);
  if (match) {
    const session = Sessions.byId(match[1]);
    if (session) { showSession(session.id); return; }
  }
  showHome();
}

/* --------------------------------------------------------------------- home */

let listTicker = null;

function renderHome() {
  const sessions = Sessions.all();
  el.list.innerHTML = '';
  el.empty.hidden = sessions.length > 0;
  el.list.hidden = sessions.length === 0;

  sessions.forEach((session, i) => {
    const card = createSessionCard(session, {
      index: i,
      onOpen: s => go(`#/s/${s.id}`),
      onDelete: s => { Sessions.remove(s.id); renderHome(); }
    });
    card.dataset.id = session.id;
    el.list.append(card);
  });
}

/** Keep running durations honest without re-rendering the list. */
function tickHomeDurations() {
  for (const card of el.list.querySelectorAll('.session-card')) {
    const session = Sessions.byId(card.dataset.id);
    if (!session || session.status !== Sessions.STATUS.RUNNING) continue;
    const target = card.querySelector('.sc-duration');
    const next = Sessions.formatDuration(Sessions.elapsed(session));
    if (target.textContent !== next) target.textContent = next;
  }
}

function showHome() {
  currentId = null;
  el.session.hidden = true;
  el.home.hidden = false;
  document.title = 'CookUp';
  renderHome();

  clearInterval(listTicker);
  listTicker = setInterval(tickHomeDurations, 15000);
}

async function newSession() {
  const name = await promptName({ title: 'New Session', placeholder: 'Late Night' });
  if (!name) return;
  const session = Sessions.create(name);
  go(`#/s/${session.id}`);
}

/* ------------------------------------------------------------------ session */

function renderSessionChrome() {
  const session = current();
  if (!session) return;

  el.name.textContent = session.name;
  document.title = `${session.name} · CookUp`;

  el.status.className = `status status-${session.status}`;
  el.status.querySelector('.status-text').textContent = Sessions.statusLabel(session.status);

  const running = session.status === Sessions.STATUS.RUNNING;
  const completed = session.status === Sessions.STATUS.COMPLETED;

  el.toggle.textContent = running ? 'Pause' : 'Resume';
  el.end.hidden = completed;
}

function refreshWidgets() {
  Timer.refresh();
  Water.refresh();
  Breaks.refresh();
}

function showSession(id) {
  currentId = id;
  clearInterval(listTicker);
  el.home.hidden = true;
  el.session.hidden = false;
  Tap.reset();
  renderSessionChrome();
  refreshWidgets();
}

function toggleRun() {
  const session = current();
  if (!session) return;
  if (session.status === Sessions.STATUS.RUNNING) Sessions.pause(session.id);
  else Sessions.resume(session.id);
  renderSessionChrome();
  refreshWidgets();
}

function endSession() {
  const session = current();
  if (!session) return;
  Sessions.end(session.id);
  go('#/');
}

/* --------------------------------------------------------------------- boot */

function mountWidgets() {
  Clock.mount({ time: el.clockTime, date: el.clockDate, toggle: el.clockBlock });

  Timer.mount({
    value: el.elapsed,
    label: el.elapsedLabel,
    hero: el.hero,
    getSession: current
  });

  Bpm.mount({ input: el.bpmInput, list: el.bpmList });

  Tap.mount({
    button: el.tapBtn,
    readout: el.tapReadout,
    count: el.tapCount,
    onBpm: Bpm.setBpm
  });

  Water.mount({ button: el.waterBtn, count: el.waterCount, getSession: current });
  Breaks.mount({ seg: el.breakSeg, next: el.breakNext, getSession: currentOrActive });
}

function wireChrome() {
  el.newBtn.addEventListener('click', newSession);
  el.back.addEventListener('click', () => go('#/'));
  el.toggle.addEventListener('click', toggleRun);
  el.end.addEventListener('click', endSession);
  window.addEventListener('hashchange', route);

  // Another tab changed the data. Pick it up the next time this one is looked at,
  // rather than reloading the page out from under someone.
  let stale = false;
  window.addEventListener('storage', e => {
    if (e.key && !e.key.startsWith('cookup')) return;
    stale = true;
  });
  document.addEventListener('visibilitychange', () => {
    if (stale && !document.hidden) location.reload();
  });
}

function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  if (location.protocol === 'file:') return;   // needs http(s)
  window.addEventListener('load', () => {
    navigator.serviceWorker.register('./service-worker.js', { scope: './' })
      .catch(err => console.warn('[cookup] service worker not registered', err));
  });
}

function boot() {
  mountWidgets();
  wireChrome();

  // Land straight back in a session that is still running.
  if (!location.hash || location.hash === '#/' || location.hash === '#') {
    const active = getState().activeSessionId;
    const session = active ? Sessions.byId(active) : null;
    if (session && session.status === Sessions.STATUS.RUNNING) {
      go(`#/s/${session.id}`, { replace: true });
      return registerServiceWorker();
    }
  }
  route();
  registerServiceWorker();
}

boot();
