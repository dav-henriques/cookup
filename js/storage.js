/**
 * storage.js
 * ---------------------------------------------------------------------------
 * Everything that survives a refresh: history, favourites, statistics and
 * preferences. LocalStorage only — no server, no cookies, no tracking.
 *
 * All access goes through this module so the persistence format can change
 * in one place. If LocalStorage is unavailable (private browsing, disabled
 * storage) the app degrades to an in-memory store instead of throwing.
 */

const NS = 'beat-challenge:v1';

const KEYS = {
  history: `${NS}:history`,
  favorites: `${NS}:favorites`,
  stats: `${NS}:stats`,
  prefs: `${NS}:prefs`,
};

const LIMITS = {
  history: 60,
  favorites: 200,
};

/* ==========================================================================
   Low-level driver (with graceful fallback)
   ========================================================================== */

const memory = new Map();

const driver = (() => {
  try {
    const probe = `${NS}:probe`;
    window.localStorage.setItem(probe, '1');
    window.localStorage.removeItem(probe);
    return {
      available: true,
      get: (k) => window.localStorage.getItem(k),
      set: (k, v) => window.localStorage.setItem(k, v),
      remove: (k) => window.localStorage.removeItem(k),
    };
  } catch {
    return {
      available: false,
      get: (k) => (memory.has(k) ? memory.get(k) : null),
      set: (k, v) => memory.set(k, v),
      remove: (k) => memory.delete(k),
    };
  }
})();

export const isPersistent = driver.available;

function read(key, fallback) {
  try {
    const raw = driver.get(key);
    if (!raw) return fallback;
    const parsed = JSON.parse(raw);
    return parsed ?? fallback;
  } catch {
    return fallback;
  }
}

function write(key, value) {
  try {
    driver.set(key, JSON.stringify(value));
    return true;
  } catch {
    // Quota exceeded — drop the oldest history and retry once.
    if (key === KEYS.history && Array.isArray(value) && value.length > 10) {
      try {
        driver.set(key, JSON.stringify(value.slice(0, Math.floor(value.length / 2))));
        return true;
      } catch { /* give up silently */ }
    }
    return false;
  }
}

/* ==========================================================================
   History
   ========================================================================== */

/** @returns {Array<Object>} newest first */
export function getHistory() {
  const list = read(KEYS.history, []);
  return Array.isArray(list) ? list : [];
}

/**
 * Adds a challenge to the top of the history, de-duplicating by id.
 * @param {Object} challenge
 */
export function addToHistory(challenge) {
  const list = getHistory().filter((c) => c.id !== challenge.id);
  list.unshift(challenge);
  const trimmed = list.slice(0, LIMITS.history);
  write(KEYS.history, trimmed);
  return trimmed;
}

export function clearHistory() {
  write(KEYS.history, []);
  return [];
}

/* ==========================================================================
   Favourites
   ========================================================================== */

export function getFavorites() {
  const list = read(KEYS.favorites, []);
  return Array.isArray(list) ? list : [];
}

export function isFavorite(id) {
  return getFavorites().some((c) => c.id === id);
}

/**
 * Toggles a challenge's favourite state.
 * @returns {{ favorites: Array<Object>, active: boolean }}
 */
export function toggleFavorite(challenge) {
  const list = getFavorites();
  const index = list.findIndex((c) => c.id === challenge.id);

  if (index >= 0) {
    list.splice(index, 1);
    write(KEYS.favorites, list);
    return { favorites: list, active: false };
  }

  list.unshift({ ...challenge, favoritedAt: new Date().toISOString() });
  const trimmed = list.slice(0, LIMITS.favorites);
  write(KEYS.favorites, trimmed);
  return { favorites: trimmed, active: true };
}

export function removeFavorite(id) {
  const list = getFavorites().filter((c) => c.id !== id);
  write(KEYS.favorites, list);
  return list;
}

export function clearFavorites() {
  write(KEYS.favorites, []);
  return [];
}

/* ==========================================================================
   Statistics
   ========================================================================== */

/** Shape of the stats record. Kept flat so it stays cheap to serialise. */
function emptyStats() {
  return {
    total: 0,
    bpmSum: 0,
    bpmCount: 0,
    genres: {},      // id -> { name, count }
    moods: {},       // id -> { name, count }
    samples: {},     // id -> { name, count }
    difficulties: {},// id -> { name, count }
    days: [],        // sorted list of `YYYY-MM-DD` keys the app was used
    streak: 0,
    bestStreak: 0,
    firstUse: null,
    lastDay: null,
    dailiesCompleted: [],
  };
}

export function getStats() {
  const s = read(KEYS.stats, null);
  return s && typeof s === 'object' ? { ...emptyStats(), ...s } : emptyStats();
}

function bump(map, id, name) {
  if (!id) return;
  if (!map[id]) map[id] = { name: name || id, count: 0 };
  map[id].count += 1;
}

/**
 * Records a generated challenge in the aggregate statistics.
 * @param {Object} challenge
 * @param {string} todayKey UTC date key, supplied by the caller (daily.js)
 */
export function recordChallenge(challenge, todayKey) {
  const stats = getStats();

  stats.total += 1;
  stats.bpmSum += challenge.bpm;
  stats.bpmCount += 1;

  bump(stats.genres, challenge.genre.id, challenge.genre.name);
  bump(stats.moods, challenge.mood.id, challenge.mood.name);
  bump(stats.samples, challenge.sample.source.id, challenge.sample.source.name);
  bump(stats.difficulties, challenge.difficulty.id, challenge.difficulty.name);

  if (!stats.firstUse) stats.firstUse = todayKey;

  if (challenge.mode === 'daily' && challenge.dateKey &&
      !stats.dailiesCompleted.includes(challenge.dateKey)) {
    stats.dailiesCompleted.push(challenge.dateKey);
    if (stats.dailiesCompleted.length > 400) stats.dailiesCompleted.shift();
  }

  write(KEYS.stats, stats);
  return stats;
}

/**
 * Registers "the app was opened today" and recomputes the consecutive-day
 * streak. Safe to call on every boot.
 * @param {string} todayKey
 * @param {(a: string, b: string) => number} daysBetween helper from daily.js
 */
export function touchDay(todayKey, daysBetween) {
  const stats = getStats();

  if (stats.lastDay === todayKey) return stats;

  if (!stats.lastDay) {
    stats.streak = 1;
  } else {
    const gap = daysBetween(stats.lastDay, todayKey);
    if (gap === 1) stats.streak += 1;
    else if (gap > 1) stats.streak = 1;
    // gap <= 0 means the clock moved backwards: leave the streak untouched.
  }

  stats.lastDay = todayKey;
  if (!stats.firstUse) stats.firstUse = todayKey;
  stats.bestStreak = Math.max(stats.bestStreak || 0, stats.streak);

  if (!stats.days.includes(todayKey)) {
    stats.days.push(todayKey);
    if (stats.days.length > 400) stats.days.shift();
  }

  write(KEYS.stats, stats);
  return stats;
}

export function clearStats() {
  const fresh = emptyStats();
  write(KEYS.stats, fresh);
  return fresh;
}

/** Sorted [{ id, name, count }] for a counter map, highest first. */
export function topOf(map, limit = 5) {
  return Object.entries(map || {})
    .map(([id, v]) => ({ id, name: v.name, count: v.count }))
    .sort((a, b) => b.count - a.count || a.name.localeCompare(b.name))
    .slice(0, limit);
}

/* ==========================================================================
   Preferences
   ========================================================================== */

const DEFAULT_PREFS = {
  lastView: 'home',
  shareFormat: 'story',
};

export function getPrefs() {
  return { ...DEFAULT_PREFS, ...read(KEYS.prefs, {}) };
}

export function setPref(key, value) {
  const prefs = getPrefs();
  prefs[key] = value;
  write(KEYS.prefs, prefs);
  return prefs;
}

/** Wipes every namespaced key. Used by "Reset all data". */
export function resetAll() {
  Object.values(KEYS).forEach((k) => driver.remove(k));
}
