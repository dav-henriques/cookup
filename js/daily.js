/**
 * daily.js
 * ---------------------------------------------------------------------------
 * The Daily Challenge.
 *
 * There is no server, so "the same challenge for everybody" is achieved by
 * deriving the seed from the calendar date itself:
 *
 *     2026-07-25  ->  hash  ->  seed  ->  challenge
 *
 * The date key is computed in UTC so that the rollover happens at the same
 * instant worldwide. Two people in different time zones opening the app at
 * the same moment always see the same challenge.
 */

import { generateChallenge, xmur3 } from './generator.js';

/** Namespace mixed into the hash so a future v2 can re-roll the calendar. */
const DAILY_SALT = 'beat-challenge/daily/v1';

/**
 * Formats a Date as a UTC `YYYY-MM-DD` key.
 * @param {Date} [date]
 * @returns {string}
 */
export function getDateKey(date = new Date()) {
  const y = date.getUTCFullYear();
  const m = String(date.getUTCMonth() + 1).padStart(2, '0');
  const d = String(date.getUTCDate()).padStart(2, '0');
  return `${y}-${m}-${d}`;
}

/**
 * Turns a date key into a stable 32-bit seed.
 * @param {string} dateKey
 * @returns {number}
 */
export function getDailySeed(dateKey) {
  return xmur3(`${DAILY_SALT}:${dateKey}`)();
}

/**
 * Builds the challenge for a given day.
 * @param {Object} data     loaded database
 * @param {Date|string} [when] a Date, or a `YYYY-MM-DD` key
 */
export function getDailyChallenge(data, when = new Date()) {
  const dateKey = typeof when === 'string' ? when : getDateKey(when);
  return generateChallenge({
    data,
    seed: getDailySeed(dateKey),
    mode: 'daily',
    dateKey,
  });
}

/**
 * Milliseconds remaining until the next daily rollover (UTC midnight).
 * @param {Date} [now]
 * @returns {number}
 */
export function msUntilNextDaily(now = new Date()) {
  const next = Date.UTC(
    now.getUTCFullYear(),
    now.getUTCMonth(),
    now.getUTCDate() + 1,
    0, 0, 0, 0,
  );
  return Math.max(0, next - now.getTime());
}

/**
 * Formats a millisecond duration as `HH:MM:SS`.
 * @param {number} ms
 */
export function formatCountdown(ms) {
  const total = Math.floor(ms / 1000);
  const h = String(Math.floor(total / 3600)).padStart(2, '0');
  const m = String(Math.floor((total % 3600) / 60)).padStart(2, '0');
  const s = String(total % 60).padStart(2, '0');
  return `${h}:${m}:${s}`;
}

/**
 * Human-readable label for a date key, e.g. "Saturday, 25 July 2026".
 * Rendered from the UTC components so it always matches the key.
 * @param {string} dateKey
 * @param {string} [locale]
 */
export function formatDateKey(dateKey, locale = undefined) {
  const [y, m, d] = dateKey.split('-').map(Number);
  const date = new Date(Date.UTC(y, m - 1, d));
  return date.toLocaleDateString(locale, {
    weekday: 'long',
    day: 'numeric',
    month: 'long',
    year: 'numeric',
    timeZone: 'UTC',
  });
}

/**
 * Short label, e.g. "25 Jul".
 * @param {string} dateKey
 * @param {string} [locale]
 */
export function formatDateKeyShort(dateKey, locale = undefined) {
  const [y, m, d] = dateKey.split('-').map(Number);
  return new Date(Date.UTC(y, m - 1, d)).toLocaleDateString(locale, {
    day: 'numeric',
    month: 'short',
    timeZone: 'UTC',
  });
}

/**
 * Difference in whole days between two date keys (b - a).
 * Used by the streak calculation.
 */
export function daysBetween(aKey, bKey) {
  const toUtc = (k) => {
    const [y, m, d] = k.split('-').map(Number);
    return Date.UTC(y, m - 1, d);
  };
  return Math.round((toUtc(bKey) - toUtc(aKey)) / 86400000);
}
