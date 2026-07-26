/**
 * storage.js — the only thing that touches LocalStorage.
 *
 * The whole app state lives in one JSON blob. State is held in memory and
 * flushed on every mutation, so a refresh (or a browser restart) restores
 * exactly what was there.
 *
 * Nothing here writes on a timer: elapsed time is derived from wall-clock
 * timestamps, so the clock keeps running correctly even while the tab is shut.
 */

const KEY = 'cookup.state.v1';

const DEFAULTS = () => ({
  version: 1,
  sessions: [],
  activeSessionId: null,
  settings: {
    clock24: false,          // 12-hour by default, tap the clock to switch
    bpm: 120,                // last tempo used, restored per app (not per session)
    breakIntervalMin: 60     // default for newly created sessions
  }
});

let state = null;
let available = true;

function read() {
  try {
    const raw = localStorage.getItem(KEY);
    if (!raw) return DEFAULTS();
    const parsed = JSON.parse(raw);
    const base = DEFAULTS();
    return {
      ...base,
      ...parsed,
      settings: { ...base.settings, ...(parsed.settings || {}) },
      sessions: Array.isArray(parsed.sessions) ? parsed.sessions : []
    };
  } catch (err) {
    console.warn('[cookup] could not read storage, starting fresh', err);
    return DEFAULTS();
  }
}

/** Load (once) and return the live state object. */
export function getState() {
  if (!state) state = read();
  return state;
}

/** Flush the in-memory state to LocalStorage. */
export function save() {
  if (!available) return;
  try {
    localStorage.setItem(KEY, JSON.stringify(getState()));
  } catch (err) {
    // Private mode / quota. The app keeps working for this session only.
    available = false;
    console.warn('[cookup] storage unavailable — this session will not persist', err);
  }
}

/** Mutate state through a function, then persist. */
export function update(mutator) {
  const s = getState();
  mutator(s);
  save();
  return s;
}

export function getSetting(key) {
  return getState().settings[key];
}

export function setSetting(key, value) {
  update(s => { s.settings[key] = value; });
}

export function isPersistent() {
  return available;
}
