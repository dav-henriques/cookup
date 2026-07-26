/**
 * app.js
 * ---------------------------------------------------------------------------
 * Application shell: boots the database, owns the state, wires every event.
 *
 * Module map
 *   generator.js   pure challenge generation (seeded, deterministic)
 *   daily.js       date -> seed -> daily challenge, countdown helpers
 *   storage.js     LocalStorage: history, favourites, stats, preferences
 *   ui.js          all rendering, icons, toasts, mood tint
 *   animations.js  canvas wave background + motion helpers
 *   share.js       poster export (canvas), copy, native share
 *
 * Routing is hash-based so views are linkable and the back button works:
 *   #home #daily #history #favorites #stats   and   #s=<seed36>
 */

import { generateChallenge } from './generator.js';
import {
  getDateKey, getDailyChallenge, msUntilNextDaily,
  formatCountdown, formatDateKey, daysBetween,
} from './daily.js';
import * as store from './storage.js';
import {
  $, $$, h, mount, toast, setMoodTint, renderChallenge,
  renderEntries, renderStats, openSheet, closeSheet, pulse,
} from './ui.js';
import { WaveField, cycleText, wait } from './animations.js';
import {
  FORMATS, renderPoster, canvasToBlob, downloadBlob,
  copyChallenge, shareChallenge, slugify,
} from './share.js';

/* ==========================================================================
   Constants
   ========================================================================== */

const DATA_FILES = ['genres', 'moods', 'bpms', 'samples', 'drums', 'challenges'];

const VIEWS = ['home', 'daily', 'history', 'favorites', 'stats'];

const LOADING_PHRASES = [
  'Digging through crates',
  'Choosing a tempo',
  'Setting the mood',
  'Loading the sampler',
  'Tuning the drums',
  'Writing the rule',
];

/** How long the cinematic loading sequence lasts. */
const GENERATE_DELAY = 1050;

const REDUCED_MOTION = window.matchMedia('(prefers-reduced-motion: reduce)').matches;

/* ==========================================================================
   State
   ========================================================================== */

const state = {
  data: null,
  waves: null,
  /** The challenge currently displayed in each scope. */
  current: { home: null, daily: null },
  activeView: 'home',
  favoriteIds: new Set(),
  shareFormat: 'story',
  /** Challenge targeted by the share sheet. */
  sheetChallenge: null,
  countdownTimer: 0,
  busy: false,
};

/** Cached element references, filled once on boot. */
const el = {};

/* ==========================================================================
   Boot
   ========================================================================== */

document.addEventListener('DOMContentLoaded', () => {
  cacheElements();
  bootstrap().catch(showFatalError);
});

function cacheElements() {
  el.app = $('#app');
  el.waves = $('#waves');
  el.streak = $('#streak-value');
  el.rail = $('#xmb-rail');

  el.homeHero = $('#home-hero');
  el.homeLoader = $('#home-loader');
  el.homeLoaderText = $('#home-loader-text');
  el.homeResult = $('#home-result');
  el.homeHead = $('#home-head');
  el.homeCards = $('#home-cards');

  el.dailyHead = $('#daily-head');
  el.dailyCards = $('#daily-cards');
  el.dailyDate = $('#daily-date');
  el.dailyCountdown = $('#daily-countdown');

  el.historyList = $('#history-list');
  el.favoritesList = $('#favorites-list');
  el.statsBody = $('#stats-body');

  el.badgeHistory = $('#badge-history');
  el.badgeFavorites = $('#badge-favorites');

  el.sheet = $('#share-sheet');
  el.sheetPreview = $('#sheet-preview');

  el.heroTotal = $('#hero-total');
  el.heroRules = $('#hero-rules');
  el.heroCombos = $('#hero-combos');

  el.fatal = $('#fatal');
}

async function bootstrap() {
  state.data = await loadDatabase();

  // Background comes up first so the app never appears on a flat black page.
  state.waves = new WaveField(el.waves, { tint: '#8ec9ff' });
  state.waves.start();

  const prefs = store.getPrefs();
  state.shareFormat = prefs.shareFormat || 'story';
  syncFormatButtons();

  // Register today's visit and refresh the streak pill.
  const today = getDateKey();
  const stats = store.touchDay(today, daysBetween);
  renderStreak(stats);

  state.favoriteIds = new Set(store.getFavorites().map((c) => c.id));
  refreshBadges();
  renderHeroMeta();

  wireNavigation();
  wireActions();
  wireSheet();
  wireKeyboard();

  prepareDaily();

  // Restore the view from the URL, falling back to the last used one.
  applyRoute(location.hash || `#${prefs.lastView || 'home'}`);
  window.addEventListener('hashchange', () => applyRoute(location.hash));

  document.body.classList.add('is-ready');
}

/**
 * Loads every JSON file in parallel.
 * @returns {Promise<Object>} keyed by file name
 */
async function loadDatabase() {
  const responses = await Promise.all(
    DATA_FILES.map(async (name) => {
      const res = await fetch(`data/${name}.json`, { cache: 'no-cache' });
      if (!res.ok) throw new Error(`Could not load data/${name}.json (${res.status})`);
      return [name, await res.json()];
    }),
  );
  return Object.fromEntries(responses);
}

function showFatalError(error) {
  console.error(error);
  document.body.classList.add('has-error');
  if (!el.fatal) return;
  el.fatal.hidden = false;
  const detail = $('#fatal-detail');
  if (detail) {
    detail.textContent = String(error?.message || error);
  }
}

/* ==========================================================================
   Routing & views
   ========================================================================== */

function applyRoute(hash) {
  const clean = (hash || '').replace(/^#/, '');

  // Deep link to a specific generated challenge: #s=<seed base36>
  if (clean.startsWith('s=')) {
    const seed = parseInt(clean.slice(2), 36);
    if (Number.isFinite(seed)) {
      const challenge = generateChallenge({ data: state.data, seed, mode: 'free' });
      showView('home');
      presentChallenge(challenge, 'home', { record: false });
      return;
    }
  }

  showView(VIEWS.includes(clean) ? clean : 'home');
}

function showView(view) {
  state.activeView = view;
  store.setPref('lastView', view);

  $$('.view').forEach((section) => {
    section.classList.toggle('is-active', section.id === `view-${view}`);
  });

  $$('.xmb__item').forEach((tab) => {
    tab.setAttribute('aria-selected', String(tab.dataset.view === view));
  });

  // Views that read from storage are rendered lazily, on entry.
  if (view === 'history') renderHistoryView();
  if (view === 'favorites') renderFavoritesView();
  if (view === 'stats') renderStatsView();

  // The interface takes on the tint of whichever challenge is on screen.
  const scoped = view === 'daily' ? state.current.daily : state.current.home;
  if (scoped) setMoodTint(scoped.mood.tint, (hex) => state.waves?.setTint(hex));

  window.scrollTo({ top: 0, behavior: REDUCED_MOTION ? 'auto' : 'smooth' });
}

function navigate(view) {
  if (location.hash.replace(/^#/, '') === view) applyRoute(`#${view}`);
  else location.hash = `#${view}`;
}

function wireNavigation() {
  el.rail.addEventListener('click', (event) => {
    const tab = event.target.closest('.xmb__item');
    if (tab) navigate(tab.dataset.view);
  });

  // PS3-style left/right traversal of the rail.
  el.rail.addEventListener('keydown', (event) => {
    if (event.key !== 'ArrowRight' && event.key !== 'ArrowLeft') return;
    const tabs = $$('.xmb__item', el.rail);
    const index = tabs.indexOf(document.activeElement.closest('.xmb__item'));
    if (index < 0) return;
    event.preventDefault();
    const next = (index + (event.key === 'ArrowRight' ? 1 : -1) + tabs.length) % tabs.length;
    tabs[next].focus();
    navigate(tabs[next].dataset.view);
  });
}

/* ==========================================================================
   Challenge presentation
   ========================================================================== */

/**
 * Renders a challenge into a scope and updates everything that depends on it.
 * @param {Object} challenge
 * @param {'home'|'daily'} scope
 * @param {{ record?: boolean }} [opts]
 */
function presentChallenge(challenge, scope, opts = {}) {
  const { record = true } = opts;
  state.current[scope] = challenge;

  setMoodTint(challenge.mood.tint, (hex) => state.waves?.setTint(hex));

  const refs = scope === 'home'
    ? { head: el.homeHead, cards: el.homeCards }
    : { head: el.dailyHead, cards: el.dailyCards };

  renderChallenge(challenge, refs);

  if (scope === 'home') {
    el.homeHero.hidden = true;
    el.homeLoader.classList.remove('is-active');
    el.homeResult.classList.add('is-active');
  }

  syncFavoriteButtons(scope);

  if (record) {
    store.addToHistory(challenge);
    const stats = store.recordChallenge(challenge, getDateKey());
    renderStreak(stats);
    refreshBadges();
  }
}

/**
 * The cinematic generate sequence: cards leave, loader runs, cards return.
 */
async function runGenerate() {
  if (state.busy) return;
  state.busy = true;

  el.homeHero.hidden = true;
  el.homeResult.classList.remove('is-active');
  el.homeLoader.classList.add('is-active');

  const stopCycle = cycleText(el.homeLoaderText, LOADING_PHRASES, 190);

  // A fresh seed every time: time + a cryptographic-quality random word.
  const seed = (Date.now() ^ (randomUint32() * 0x9e3779b1)) >>> 0;
  const challenge = generateChallenge({ data: state.data, seed, mode: 'free' });

  await wait(REDUCED_MOTION ? 120 : GENERATE_DELAY);
  stopCycle();

  presentChallenge(challenge, 'home');
  history.replaceState(null, '', `#s=${challenge.seed.toString(36)}`);

  state.busy = false;
}

function randomUint32() {
  if (window.crypto?.getRandomValues) {
    return window.crypto.getRandomValues(new Uint32Array(1))[0];
  }
  return Math.floor(Math.random() * 0xffffffff);
}

/* ==========================================================================
   Daily challenge
   ========================================================================== */

function prepareDaily() {
  const challenge = getDailyChallenge(state.data);
  state.current.daily = challenge;

  el.dailyDate.textContent = formatDateKey(challenge.dateKey);
  renderChallenge(challenge, { head: el.dailyHead, cards: el.dailyCards });
  syncFavoriteButtons('daily');

  // Record the daily exactly once per day.
  const stats = store.getStats();
  if (!stats.dailiesCompleted?.includes(challenge.dateKey)) {
    store.addToHistory(challenge);
    renderStreak(store.recordChallenge(challenge, getDateKey()));
    refreshBadges();
  }

  startCountdown();
}

function startCountdown() {
  clearInterval(state.countdownTimer);

  const tick = () => {
    const remaining = msUntilNextDaily();
    el.dailyCountdown.textContent = formatCountdown(remaining);
    if (remaining <= 1000) {
      clearInterval(state.countdownTimer);
      // Roll over to the new day's challenge without a reload.
      setTimeout(prepareDaily, 1500);
    }
  };

  tick();
  state.countdownTimer = setInterval(tick, 1000);
}

/* ==========================================================================
   Actions (event delegation on [data-action])
   ========================================================================== */

function wireActions() {
  document.addEventListener('click', async (event) => {
    const trigger = event.target.closest('[data-action]');
    if (!trigger) return;

    const { action, scope = 'home' } = trigger.dataset;
    const challenge = state.current[scope];

    switch (action) {
      case 'generate':
        await runGenerate();
        break;

      case 'daily':
        navigate('daily');
        break;

      case 'stats-shortcut':
        navigate('stats');
        break;

      case 'favorite': {
        if (!challenge) break;
        const { active } = store.toggleFavorite(challenge);
        if (active) state.favoriteIds.add(challenge.id);
        else state.favoriteIds.delete(challenge.id);
        syncFavoriteButtons(scope);
        pulse(trigger);
        refreshBadges();
        toast(active ? 'Saved to favourites' : 'Removed from favourites', 'heart');
        break;
      }

      case 'copy': {
        if (!challenge) break;
        const ok = await copyChallenge(challenge, shareUrlFor(challenge));
        toast(ok ? 'Challenge copied' : 'Could not copy', ok ? 'copy' : 'close');
        break;
      }

      case 'share': {
        if (!challenge) break;
        const result = await shareChallenge(challenge, {
          url: shareUrlFor(challenge),
          includeImage: false,
        });
        if (result === 'copied') toast('Link copied to clipboard', 'copy');
        break;
      }

      case 'save-image':
        if (!challenge) break;
        state.sheetChallenge = challenge;
        openSheet(el.sheet);
        await refreshPreview();
        break;

      case 'set-format':
        state.shareFormat = trigger.dataset.format;
        store.setPref('shareFormat', state.shareFormat);
        syncFormatButtons();
        await refreshPreview();
        break;

      case 'download':
        await downloadPoster();
        break;

      case 'share-image':
        await shareImage();
        break;

      case 'close-sheet':
        closeSheet(el.sheet);
        break;

      case 'clear-history':
        store.clearHistory();
        renderHistoryView();
        refreshBadges();
        toast('History cleared', 'trash');
        break;

      case 'clear-favorites':
        store.clearFavorites();
        state.favoriteIds.clear();
        renderFavoritesView();
        syncFavoriteButtons('home');
        syncFavoriteButtons('daily');
        refreshBadges();
        toast('Favourites cleared', 'trash');
        break;

      case 'reset-stats':
        store.clearStats();
        renderStatsView();
        renderStreak(store.getStats());
        toast('Statistics reset', 'trash');
        break;

      default:
        break;
    }
  });
}

function shareUrlFor(challenge) {
  const base = `${location.origin}${location.pathname}`;
  return challenge.mode === 'daily'
    ? `${base}#daily`
    : `${base}#s=${challenge.seed.toString(36)}`;
}

/* ==========================================================================
   Share sheet
   ========================================================================== */

function wireSheet() {
  el.sheet.addEventListener('click', (event) => {
    if (event.target.classList.contains('sheet__backdrop')) closeSheet(el.sheet);
  });
}

function syncFormatButtons() {
  $$('[data-action="set-format"]').forEach((btn) => {
    btn.setAttribute('aria-pressed', String(btn.dataset.format === state.shareFormat));
  });
}

async function refreshPreview() {
  if (!state.sheetChallenge) return;
  mount(el.sheetPreview, h('div', { class: 'skeleton', style: { width: '160px', height: '160px' } }));

  const canvas = await renderPoster(state.sheetChallenge, state.shareFormat);
  const img = h('img', {
    alt: `${state.sheetChallenge.title} poster preview`,
    src: canvas.toDataURL('image/png'),
  });
  mount(el.sheetPreview, img);
}

async function downloadPoster() {
  if (!state.sheetChallenge) return;
  const cfg = FORMATS[state.shareFormat];
  const canvas = await renderPoster(state.sheetChallenge, state.shareFormat);
  const blob = await canvasToBlob(canvas);
  downloadBlob(blob, `beat-challenge-${slugify(state.sheetChallenge.title)}-${cfg.width}x${cfg.height}.png`);
  toast('Image saved', 'image');
}

async function shareImage() {
  if (!state.sheetChallenge) return;
  const result = await shareChallenge(state.sheetChallenge, {
    url: shareUrlFor(state.sheetChallenge),
    includeImage: true,
  });
  if (result === 'copied') toast('Challenge copied instead', 'copy');
  if (result === 'failed') toast('Sharing is not available here', 'close');
}

/* ==========================================================================
   Views that read from storage
   ========================================================================== */

function renderHistoryView() {
  renderEntries(el.historyList, store.getHistory(), {
    emptyTitle: 'Nothing here yet',
    emptyText: 'Every challenge you generate is stored on this device automatically.',
    emptyIcon: 'history',
    favoriteIds: state.favoriteIds,
    onOpen: (challenge) => openStoredChallenge(challenge),
    onToggleFavorite: (challenge, btn) => toggleFromList(challenge, btn, renderHistoryView),
  });
}

function renderFavoritesView() {
  renderEntries(el.favoritesList, store.getFavorites(), {
    emptyTitle: 'No favourites yet',
    emptyText: 'Tap the heart on any challenge to keep it here.',
    emptyIcon: 'heart',
    favoriteIds: state.favoriteIds,
    onOpen: (challenge) => openStoredChallenge(challenge),
    onToggleFavorite: (challenge, btn) => toggleFromList(challenge, btn, renderFavoritesView),
  });
}

function renderStatsView() {
  renderStats(el.statsBody, store.getStats(), {
    topOf: store.topOf,
    historyCount: store.getHistory().length,
  });
}

function toggleFromList(challenge, btn, rerender) {
  const { active } = store.toggleFavorite(challenge);
  if (active) state.favoriteIds.add(challenge.id);
  else state.favoriteIds.delete(challenge.id);

  btn.classList.toggle('is-on', active);
  btn.setAttribute('aria-pressed', String(active));
  refreshBadges();
  syncFavoriteButtons('home');
  syncFavoriteButtons('daily');

  if (state.activeView === 'favorites') rerender();
  toast(active ? 'Saved to favourites' : 'Removed from favourites', 'heart');
}

/** Re-opens a stored challenge in the home scope without re-recording it. */
function openStoredChallenge(challenge) {
  navigate('home');
  presentChallenge(challenge, 'home', { record: false });
  if (challenge.mode !== 'daily') {
    history.replaceState(null, '', `#s=${Number(challenge.seed).toString(36)}`);
  }
}

/* ==========================================================================
   Small UI syncs
   ========================================================================== */

function syncFavoriteButtons(scope) {
  const challenge = state.current[scope];
  const btn = $(`[data-action="favorite"][data-scope="${scope}"]`);
  if (!btn) return;

  const active = challenge ? state.favoriteIds.has(challenge.id) : false;
  btn.classList.toggle('is-on', active);
  btn.setAttribute('aria-pressed', String(active));
  btn.setAttribute('aria-label', active ? 'Remove from favourites' : 'Save to favourites');
}

function refreshBadges() {
  const historyCount = store.getHistory().length;
  const favCount = store.getFavorites().length;

  setBadge(el.badgeHistory, historyCount);
  setBadge(el.badgeFavorites, favCount);
}

function setBadge(node, count) {
  if (!node) return;
  node.hidden = count === 0;
  node.textContent = count > 99 ? '99+' : String(count);
}

function renderStreak(stats) {
  if (!el.streak) return;
  el.streak.textContent = String(stats.streak || 0);
}

/** The three small numbers under the hero. */
function renderHeroMeta() {
  const { genres, moods, samples, drums, challenges, bpms } = state.data;

  const combos =
    genres.items.length *
    moods.items.length *
    samples.sources.length *
    drums.styles.length *
    challenges.creativeRules.length *
    challenges.extraChallenges.length *
    bpms.grooveFeels.length;

  if (el.heroTotal) el.heroTotal.textContent = String(genres.items.length);
  if (el.heroRules) el.heroRules.textContent = String(challenges.creativeRules.length);
  if (el.heroCombos) el.heroCombos.textContent = formatBig(combos);
}

/** 1.2e15 -> "1.2 quadrillion"-ish short form. */
function formatBig(n) {
  const units = [
    [1e12, 'T'], [1e9, 'B'], [1e6, 'M'], [1e3, 'K'],
  ];
  for (const [size, suffix] of units) {
    if (n >= size) return `${(n / size).toFixed(n / size >= 100 ? 0 : 1)}${suffix}+`;
  }
  return String(n);
}

/* ==========================================================================
   Keyboard
   ========================================================================== */

function wireKeyboard() {
  document.addEventListener('keydown', (event) => {
    // Never hijack typing.
    const tag = event.target.tagName;
    if (tag === 'INPUT' || tag === 'TEXTAREA' || event.target.isContentEditable) return;

    if (event.key === 'Escape' && el.sheet.classList.contains('is-open')) {
      closeSheet(el.sheet);
      return;
    }

    if (event.metaKey || event.ctrlKey || event.altKey) return;
    if (state.activeView !== 'home') return;

    // Space must never steal activation from a focused control.
    const onControl = document.activeElement?.closest('button, a, [role="button"]');
    const isSpace = event.code === 'Space';
    const isG = (event.key || '').toLowerCase() === 'g';

    if ((isSpace && !onControl) || isG) {
      event.preventDefault();
      runGenerate();
    }
  });
}
