/**
 * sessions.js — the session model.
 *
 * A session stores accumulated milliseconds plus the wall-clock timestamp of
 * the moment it last started running. Elapsed time is therefore always derived,
 * never counted — which is what lets it survive refreshes, sleep and restarts.
 */

import { getState, update, getSetting } from './storage.js';

export const STATUS = { RUNNING: 'running', PAUSED: 'paused', COMPLETED: 'completed' };

const MIN = 60 * 1000;

function uid() {
  return Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
}

/* ---------------------------------------------------------------- reading */

export function all() {
  return getState().sessions;
}

export function byId(id) {
  return getState().sessions.find(s => s.id === id) || null;
}

export function activeId() {
  return getState().activeSessionId;
}

/** Milliseconds elapsed for a session, right now. */
export function elapsed(session) {
  if (!session) return 0;
  const live = session.status === STATUS.RUNNING && session.runningSince
    ? Date.now() - session.runningSince
    : 0;
  return Math.max(0, session.accumulatedMs + live);
}

/* -------------------------------------------------------------- mutating */

function stop(session) {
  if (session.status === STATUS.RUNNING && session.runningSince) {
    session.accumulatedMs += Date.now() - session.runningSince;
  }
  session.runningSince = null;
}

/** Only one session runs at a time, so history never accumulates phantom hours. */
function pauseOthers(state, keepId) {
  for (const s of state.sessions) {
    if (s.id !== keepId && s.status === STATUS.RUNNING) {
      stop(s);
      s.status = STATUS.PAUSED;
    }
  }
}

export function create(name) {
  const now = Date.now();
  const interval = getSetting('breakIntervalMin') || 60;
  const session = {
    id: uid(),
    name: (name || '').trim() || 'Untitled Session',
    status: STATUS.RUNNING,
    createdAt: now,
    endedAt: null,
    accumulatedMs: 0,
    runningSince: now,
    water: 0,
    breaks: 0,
    breakIntervalMin: interval,
    nextBreakAtMs: interval * MIN
  };
  update(state => {
    pauseOthers(state, session.id);
    state.sessions.unshift(session);
    state.activeSessionId = session.id;
  });
  return session;
}

export function open(id) {
  update(state => { state.activeSessionId = id; });
  return byId(id);
}

export function pause(id) {
  return update(state => {
    const s = state.sessions.find(x => x.id === id);
    if (!s || s.status !== STATUS.RUNNING) return;
    stop(s);
    s.status = STATUS.PAUSED;
  }) && byId(id);
}

export function resume(id) {
  return update(state => {
    const s = state.sessions.find(x => x.id === id);
    if (!s || s.status === STATUS.RUNNING) return;
    pauseOthers(state, id);
    s.status = STATUS.RUNNING;
    s.runningSince = Date.now();
    s.endedAt = null;
    // Re-arm the break reminder from this moment forward.
    s.nextBreakAtMs = elapsed(s) + s.breakIntervalMin * MIN;
    state.activeSessionId = id;
  }) && byId(id);
}

export function end(id) {
  return update(state => {
    const s = state.sessions.find(x => x.id === id);
    if (!s) return;
    stop(s);
    s.status = STATUS.COMPLETED;
    s.endedAt = Date.now();
    if (state.activeSessionId === id) state.activeSessionId = null;
  }) && byId(id);
}

export function remove(id) {
  update(state => {
    state.sessions = state.sessions.filter(s => s.id !== id);
    if (state.activeSessionId === id) state.activeSessionId = null;
  });
}

/* ------------------------------------------------------------- widget state */

export function addWater(id, delta = 1) {
  return update(state => {
    const s = state.sessions.find(x => x.id === id);
    if (s) s.water = Math.max(0, s.water + delta);
  }) && byId(id);
}

export function resetWater(id) {
  return update(state => {
    const s = state.sessions.find(x => x.id === id);
    if (s) s.water = 0;
  }) && byId(id);
}

export function setBreakInterval(id, minutes) {
  return update(state => {
    const s = state.sessions.find(x => x.id === id);
    if (!s) return;
    s.breakIntervalMin = minutes;
    s.nextBreakAtMs = elapsed(s) + minutes * MIN;
    state.settings.breakIntervalMin = minutes;
  }) && byId(id);
}

/**
 * Returns true if a break reminder is due, advancing the schedule past now.
 * If the tab was closed across several intervals we still only remind once.
 */
export function consumeDueBreak(id) {
  let due = false;
  update(state => {
    const s = state.sessions.find(x => x.id === id);
    if (!s || s.status !== STATUS.RUNNING) return;
    const ms = elapsed(s);
    if (ms < s.nextBreakAtMs) return;
    due = true;
    s.breaks += 1;
    const step = s.breakIntervalMin * MIN;
    while (s.nextBreakAtMs <= ms) s.nextBreakAtMs += step;
  });
  return due;
}

export function msUntilBreak(session) {
  if (!session || session.status !== STATUS.RUNNING) return null;
  return Math.max(0, session.nextBreakAtMs - elapsed(session));
}

/* -------------------------------------------------------------- formatting */

/** 1h 42m · 58m · 0m */
export function formatDuration(ms) {
  const total = Math.max(0, Math.floor(ms / 1000));
  const h = Math.floor(total / 3600);
  const m = Math.floor((total % 3600) / 60);
  return h > 0 ? `${h}h ${String(m).padStart(2, '0')}m` : `${m}m`;
}

/** Today · Yesterday · Jul 24 · Jul 24, 2025 */
export function formatDay(ts) {
  const d = new Date(ts);
  const today = new Date();
  const startOf = x => new Date(x.getFullYear(), x.getMonth(), x.getDate()).getTime();
  const diffDays = Math.round((startOf(today) - startOf(d)) / 86400000);
  if (diffDays === 0) return 'Today';
  if (diffDays === 1) return 'Yesterday';
  const sameYear = d.getFullYear() === today.getFullYear();
  return d.toLocaleDateString(undefined, sameYear
    ? { month: 'short', day: 'numeric' }
    : { month: 'short', day: 'numeric', year: 'numeric' });
}

export function statusLabel(status) {
  return { running: 'Running', paused: 'Paused', completed: 'Completed' }[status] || status;
}
