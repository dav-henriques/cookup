/**
 * ui.js
 * ---------------------------------------------------------------------------
 * Everything that draws. No generation logic, no persistence logic.
 *
 * The module exposes:
 *   · a tiny DOM builder (`h`) and an icon registry, so components stay
 *     declarative and safe (text always goes through textContent);
 *   · one render function per view;
 *   · small interface services: toasts, the bottom sheet, the mood tint.
 *
 * Adding a new parameter card means adding a row in generator.js `toRows()`
 * and, if it needs a new glyph, one entry in `ICONS`. Nothing else changes.
 */

import { toRows } from './generator.js';
import { formatDateKeyShort } from './daily.js';
import { countUp, replay } from './animations.js';

/* ==========================================================================
   DOM helpers
   ========================================================================== */

export const $ = (sel, root = document) => root.querySelector(sel);
export const $$ = (sel, root = document) => Array.from(root.querySelectorAll(sel));

/**
 * Minimal hyperscript. Text is assigned with textContent, so user-visible
 * strings can never be interpreted as markup.
 *
 * @param {string} tag
 * @param {Object} [props] class | text | html | style | data-* | on<Event> | attrs
 * @param {...(Node|string|null|undefined|Array)} children
 */
export function h(tag, props = {}, ...children) {
  const node = document.createElement(tag);

  for (const [key, value] of Object.entries(props || {})) {
    if (value == null || value === false) continue;

    if (key === 'class') node.className = value;
    else if (key === 'text') node.textContent = value;
    else if (key === 'html') node.innerHTML = value;
    else if (key === 'style' && typeof value === 'object') Object.assign(node.style, value);
    else if (key.startsWith('on') && typeof value === 'function') {
      node.addEventListener(key.slice(2).toLowerCase(), value);
    } else if (key === 'dataset') Object.assign(node.dataset, value);
    else node.setAttribute(key, value === true ? '' : String(value));
  }

  const append = (child) => {
    if (child == null || child === false) return;
    if (Array.isArray(child)) { child.forEach(append); return; }
    node.appendChild(child instanceof Node ? child : document.createTextNode(String(child)));
  };
  children.forEach(append);

  return node;
}

/** Replaces all children of `parent` with `nodes`. */
export function mount(parent, nodes) {
  parent.replaceChildren(...(Array.isArray(nodes) ? nodes : [nodes]));
}

/* ==========================================================================
   Icons — single 24x24 stroke system, drawn with currentColor
   ========================================================================== */

const ICONS = {
  /* Navigation */
  home:      '<path d="M4 10.5 12 4l8 6.5V19a1 1 0 0 1-1 1h-4v-5h-6v5H5a1 1 0 0 1-1-1z"/>',
  calendar:  '<rect x="3.5" y="5" width="17" height="15" rx="3"/><path d="M3.5 10h17M8 3v4M16 3v4"/>',
  history:   '<path d="M3.5 12a8.5 8.5 0 1 0 2.6-6.1"/><path d="M3 4v4h4"/><path d="M12 8v4.2l2.8 1.8"/>',
  heart:     '<path d="M12 19.5s-6.8-4.2-8.3-8A4.6 4.6 0 0 1 12 7.2a4.6 4.6 0 0 1 8.3 4.3c-1.5 3.8-8.3 8-8.3 8z"/>',
  chart:     '<path d="M4 20V9M10 20V4M16 20v-7M22 20H2"/>',

  /* Parameters */
  disc:      '<circle cx="12" cy="12" r="8.2"/><circle cx="12" cy="12" r="2.4"/><path d="M12 3.8v2.6M12 17.6v2.6"/>',
  gauge:     '<path d="M4 17a8.5 8.5 0 1 1 16 0"/><path d="M12 17l4-5"/><circle cx="12" cy="17" r="1.2"/>',
  sparkle:   '<path d="M12 3.5 13.7 9 19 10.7 13.7 12.4 12 18l-1.7-5.6L5 10.7 10.3 9z"/><path d="M18.5 16.5l.7 2.1 2.1.7-2.1.7-.7 2.1-.7-2.1-2.1-.7 2.1-.7z"/>',
  wave:      '<path d="M2 12c2.2-6 4.4-6 6.6 0s4.4 6 6.6 0 4.4-6 6.6 0"/>',
  scissors:  '<circle cx="6.5" cy="6.5" r="2.5"/><circle cx="6.5" cy="17.5" r="2.5"/><path d="M8.6 8.3 20 19M20 5 8.6 15.7"/>',
  sliders:   '<path d="M5 20v-6M5 10V4M12 20v-9M12 7V4M19 20v-4M19 12V4"/><path d="M2.5 14h5M9.5 7h5M16.5 16h5"/>',
  drum:      '<ellipse cx="12" cy="8" rx="8" ry="3.4"/><path d="M4 8v7c0 1.9 3.6 3.4 8 3.4s8-1.5 8-3.4V8"/><path d="m7 11 3.5 4M17 11l-3.5 4"/>',
  grid:      '<rect x="4" y="4" width="7" height="7" rx="2"/><rect x="13" y="4" width="7" height="7" rx="2"/><rect x="4" y="13" width="7" height="7" rx="2"/><rect x="13" y="13" width="7" height="7" rx="2"/>',
  dots:      '<circle cx="6" cy="12" r="1.7"/><circle cx="12" cy="12" r="1.7"/><circle cx="18" cy="12" r="1.7"/>',
  bass:      '<path d="M3 12h2M8 7v10M13 4v16M18 9v6M21 11.5v1"/>',
  metronome: '<path d="M9.6 3.5h4.8L19 20.5H5z"/><path d="m15.5 8-6.8 8"/><path d="M7.5 15.5h9"/>',
  keys:      '<rect x="3" y="5" width="18" height="14" rx="2.5"/><path d="M8 5v9M12 5v9M16 5v9"/>',
  star:      '<path d="m12 4 2.5 5.1 5.6.8-4 3.9 1 5.6-5.1-2.7L7.4 19.4l1-5.6-4-3.9 5.6-.8z"/>',
  layers:    '<path d="m12 3.5 8.5 4.6L12 12.7 3.5 8.1z"/><path d="m3.5 12.6 8.5 4.6 8.5-4.6"/>',
  clock:     '<circle cx="12" cy="12" r="8.4"/><path d="M12 7.2v5.1l3.4 2"/>',
  timeline:  '<path d="M3 6h11M3 12h18M3 18h8"/><circle cx="17.5" cy="6" r="2"/><circle cx="14" cy="18" r="2"/>',
  lock:      '<rect x="4.5" y="10" width="15" height="10" rx="3"/><path d="M8 10V7.5a4 4 0 0 1 8 0V10"/>',
  flag:      '<path d="M5.5 21V4"/><path d="M5.5 5h11l-2 3.5 2 3.5h-11"/>',

  /* Actions */
  shuffle:   '<path d="M17 4l3 3-3 3"/><path d="M17 14l3 3-3 3"/><path d="M3.5 7h3.2c1.6 0 2.5.8 3.4 2.2l3.8 5.6c.9 1.4 1.8 2.2 3.4 2.2H20"/><path d="M3.5 17h3.2c1.6 0 2.5-.8 3.4-2.2l.7-1M20 7h-2.7c-1.6 0-2.5.8-3.4 2.2l-.6 1"/>',
  image:     '<rect x="3.5" y="4.5" width="17" height="15" rx="3"/><circle cx="9" cy="10" r="1.8"/><path d="m4.5 17.5 4.6-4.3c.8-.7 1.9-.7 2.7 0l3.1 2.9c.8.7 1.9.7 2.7 0l2-1.8"/>',
  copy:      '<rect x="8.5" y="8.5" width="11" height="11" rx="3"/><path d="M15.5 5.5h-8a3 3 0 0 0-3 3v8"/>',
  share:     '<path d="M12 15.5V4"/><path d="m8 7.5 4-3.5 4 3.5"/><path d="M5 13v5.5a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2V13"/>',
  check:     '<path d="m5 12.5 4.5 4.5L19 7"/>',
  trash:     '<path d="M4.5 7h15M9.5 7V5.2a1.2 1.2 0 0 1 1.2-1.2h2.6a1.2 1.2 0 0 1 1.2 1.2V7"/><path d="M6.5 7 7.6 19a1.6 1.6 0 0 0 1.6 1.5h5.6A1.6 1.6 0 0 0 16.4 19L17.5 7"/>',
  flame:     '<path d="M12 3.5s5.2 4 5.2 8.6a5.2 5.2 0 1 1-10.4 0c0-1.6.7-3 1.6-4.2.3 1.2 1 2 1.9 2.2 0-2.8 1.7-5.6 1.7-6.6z"/>',
  bolt:      '<path d="M13.5 3 6 13.2h5L10.5 21 18 10.8h-5z"/>',
  close:     '<path d="m6 6 12 12M18 6 6 18"/>',
  inbox:     '<path d="M3.5 13h4l1.5 3h6l1.5-3h4"/><path d="M5.6 5h12.8l2.1 8v4.5a2.5 2.5 0 0 1-2.5 2.5H6a2.5 2.5 0 0 1-2.5-2.5V13z"/>',
  logo:      '<path d="M5 14.5V9.5M9.5 18V6M14 15.5v-7M18.5 13v-2"/>',
};

/**
 * Builds an inline SVG icon.
 * @param {keyof ICONS} name
 * @param {{ size?: number, cls?: string }} [opts]
 */
export function icon(name, opts = {}) {
  const { size, cls } = opts;
  const svg = document.createElementNS('http://www.w3.org/2000/svg', 'svg');
  svg.setAttribute('viewBox', '0 0 24 24');
  svg.setAttribute('fill', 'none');
  svg.setAttribute('stroke', 'currentColor');
  svg.setAttribute('stroke-width', '1.6');
  svg.setAttribute('stroke-linecap', 'round');
  svg.setAttribute('stroke-linejoin', 'round');
  svg.setAttribute('aria-hidden', 'true');
  if (size) { svg.style.width = `${size}px`; svg.style.height = `${size}px`; }
  if (cls) svg.setAttribute('class', cls);
  svg.innerHTML = ICONS[name] || ICONS.disc;
  return svg;
}

/* ==========================================================================
   Theme — the whole interface drifts towards the current mood's tint
   ========================================================================== */

let currentTint = '#8ec9ff';

/**
 * @param {string} hex
 * @param {(hex: string) => void} [onChange] e.g. the WaveField's setTint
 */
export function setMoodTint(hex, onChange) {
  if (!hex || hex === currentTint) {
    if (hex) onChange?.(hex);
    return;
  }
  currentTint = hex;
  const root = document.documentElement;
  root.style.setProperty('--mood-tint', hex);
  root.style.setProperty('--mood-tint-soft', hexToRgba(hex, 0.16));
  root.style.setProperty('--glow', hexToRgba(hex, 0.22));
  root.style.setProperty('--glow-soft', hexToRgba(hex, 0.10));

  const meta = $('meta[name="theme-color"]');
  if (meta) meta.setAttribute('content', '#060606');

  onChange?.(hex);
}

function hexToRgba(hex, alpha) {
  const clean = hex.replace('#', '');
  const full = clean.length === 3 ? clean.split('').map((c) => c + c).join('') : clean;
  const int = parseInt(full, 16);
  return `rgba(${(int >> 16) & 255},${(int >> 8) & 255},${int & 255},${alpha})`;
}

/* ==========================================================================
   Toasts
   ========================================================================== */

let toastHost = null;

export function toast(message, iconName = 'check', duration = 2200) {
  if (!toastHost) toastHost = $('#toasts');
  if (!toastHost) return;

  const node = h('div', { class: 'toast', role: 'status' }, icon(iconName), h('span', { text: message }));
  toastHost.appendChild(node);

  setTimeout(() => {
    node.classList.add('is-leaving');
    node.addEventListener('animationend', () => node.remove(), { once: true });
  }, duration);
}

/* ==========================================================================
   Challenge rendering
   ========================================================================== */

/**
 * Renders the full challenge into the result container.
 * @param {Object} challenge
 * @param {{ head: HTMLElement, cards: HTMLElement, isFavorite: boolean }} refs
 */
export function renderChallenge(challenge, refs) {
  const { head, cards } = refs;

  /* --- Header ---------------------------------------------------------- */
  const eyebrowText = challenge.mode === 'daily'
    ? `Daily Challenge · ${formatDateKeyShort(challenge.dateKey)}`
    : 'Free Challenge';

  const difficultyMeter = h(
    'span',
    { class: 'difficulty', 'aria-label': `Difficulty: ${challenge.difficulty.name}` },
    [1, 2, 3, 4].map((n) =>
      h('i', { class: n <= challenge.difficulty.level ? 'is-on' : '' }),
    ),
  );

  mount(head, [
    h('div', {},
      h('p', { class: 'result__eyebrow', text: eyebrowText }),
      h('h2', { class: 'result__title', text: challenge.title }),
      h('div', { class: 'result__tags' },
        h('span', { class: 'tag tag--accent' },
          h('i', { class: 'tag__dot' }),
          challenge.mood.name),
        h('span', { class: 'tag' }, `${challenge.genre.name} · ${challenge.bpm} BPM`),
        h('span', { class: 'tag' }, difficultyMeter, challenge.difficulty.name),
        h('span', { class: 'tag' }, challenge.era.name),
      ),
    ),
  ]);

  /* --- Cards ----------------------------------------------------------- */
  const rows = toRows(challenge);
  const nodes = rows.map((row, i) => {
    const variantClass = row.variant ? ` param--${row.variant}` : '';
    const value = row.unit
      ? h('p', { class: 'param__value' }, String(row.value), h('span', { text: row.unit }))
      : h('p', { class: 'param__value', text: String(row.value) });

    return h(
      'article',
      {
        class: `card param${variantClass}`,
        style: { '--i': String(i) },
        dataset: { key: row.key },
      },
      h('p', { class: 'param__label' }, icon(row.icon), row.label),
      value,
      row.note ? h('p', { class: 'param__note', text: row.note }) : null,
    );
  });

  // Inline styles set via Object.assign don't accept custom properties,
  // so apply the stagger index explicitly.
  nodes.forEach((node, i) => node.style.setProperty('--i', String(i)));

  mount(cards, nodes);
}

/* ==========================================================================
   History & favourites
   ========================================================================== */

/** "3 min ago" style label, locale aware, no dependencies. */
export function relativeTime(iso, locale = undefined) {
  const then = new Date(iso).getTime();
  if (Number.isNaN(then)) return '';
  const diff = Date.now() - then;
  if (diff < 45_000) return 'just now';

  const rtf = new Intl.RelativeTimeFormat(locale, { numeric: 'auto' });
  if (diff < 3_600_000) return rtf.format(-Math.round(diff / 60_000), 'minute');
  if (diff < 86_400_000) return rtf.format(-Math.round(diff / 3_600_000), 'hour');
  if (diff < 604_800_000) return rtf.format(-Math.round(diff / 86_400_000), 'day');
  return new Date(then).toLocaleDateString(locale, { day: 'numeric', month: 'short' });
}

/**
 * Renders a list of saved challenges.
 * @param {HTMLElement} container
 * @param {Array<Object>} items
 * @param {{
 *   emptyTitle: string, emptyText: string, emptyIcon?: string,
 *   favoriteIds: Set<string>,
 *   onOpen: (challenge: Object) => void,
 *   onToggleFavorite: (challenge: Object, btn: HTMLElement) => void
 * }} opts
 */
export function renderEntries(container, items, opts) {
  if (!items.length) {
    mount(container, h('div', { class: 'empty' },
      icon(opts.emptyIcon || 'inbox'),
      h('p', { class: 'empty__title', text: opts.emptyTitle }),
      h('p', { class: 'empty__text', text: opts.emptyText }),
    ));
    return;
  }

  const nodes = items.map((c, i) => {
    const isFav = opts.favoriteIds.has(c.id);

    const favBtn = h('button', {
      class: `entry__fav${isFav ? ' is-on' : ''}`,
      type: 'button',
      'aria-pressed': String(isFav),
      'aria-label': isFav ? 'Remove from favourites' : 'Add to favourites',
      onClick: (event) => {
        event.stopPropagation();
        opts.onToggleFavorite(c, favBtn);
      },
    }, icon('heart'));

    const row = h('div', {
      class: 'card entry',
      role: 'button',
      tabindex: '0',
      onClick: () => opts.onOpen(c),
      onKeydown: (e) => {
        if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); opts.onOpen(c); }
      },
    },
      h('span', {
        class: 'entry__swatch',
        style: { background: c.mood?.tint || '#8ec9ff', color: c.mood?.tint || '#8ec9ff' },
        'aria-hidden': 'true',
      }, h('span', { style: { color: '#06080b' }, text: String(c.bpm) })),
      h('div', { class: 'entry__body' },
        h('p', { class: 'entry__title', text: c.title }),
        h('p', {
          class: 'entry__meta',
          text: `${c.genre.name} · ${c.mood.name} · ${c.sample.source.name}`,
        }),
      ),
      h('div', { class: 'entry__side' },
        h('span', { text: c.mode === 'daily' && c.dateKey ? formatDateKeyShort(c.dateKey) : relativeTime(c.createdAt) }),
        favBtn,
      ),
    );

    row.style.setProperty('--i', String(Math.min(i, 12)));
    return row;
  });

  mount(container, nodes);
}

/* ==========================================================================
   Statistics
   ========================================================================== */

/**
 * @param {HTMLElement} container
 * @param {Object} stats
 * @param {{ topOf: Function, historyCount: number }} helpers
 */
export function renderStats(container, stats, helpers) {
  const { topOf } = helpers;

  if (!stats.total) {
    mount(container, h('div', { class: 'empty' },
      icon('chart'),
      h('p', { class: 'empty__title', text: 'No numbers yet' }),
      h('p', { class: 'empty__text', text: 'Generate a few challenges and your habits will show up here.' }),
    ));
    return;
  }

  const avgBpm = stats.bpmCount ? Math.round(stats.bpmSum / stats.bpmCount) : 0;
  const topGenre = topOf(stats.genres, 1)[0];
  const topMood = topOf(stats.moods, 1)[0];
  const topSample = topOf(stats.samples, 1)[0];

  const statCard = (label, value, sub, { text = false, counter = false } = {}) => {
    const valueEl = h('p', {
      class: `stat__value${text ? ' is-text' : ''}`,
      text: counter ? '0' : String(value),
    });
    const card = h('article', { class: 'card stat' },
      h('p', { class: 'stat__label', text: label }),
      valueEl,
      sub ? h('p', { class: 'stat__sub', text: sub }) : null,
    );
    if (counter) requestAnimationFrame(() => countUp(valueEl, Number(value)));
    return card;
  };

  const times = (n) => `${n} ${n === 1 ? 'time' : 'times'}`;
  const days = (n) => `${n} ${n === 1 ? 'day' : 'days'}`;

  const cards = [
    statCard('Challenges', stats.total, 'generated in total', { counter: true }),
    statCard('Average BPM', avgBpm, 'across every draw', { counter: true }),
    statCard('Streak', stats.streak, `best: ${days(stats.bestStreak)}`, { counter: true }),
    statCard('Dailies', stats.dailiesCompleted?.length || 0, 'daily challenges opened', { counter: true }),
    statCard('Top Genre', topGenre ? topGenre.name : '—', topGenre ? times(topGenre.count) : '', { text: true }),
    statCard('Top Mood', topMood ? topMood.name : '—', topMood ? times(topMood.count) : '', { text: true }),
    statCard('Top Sample Source', topSample ? topSample.name : '—', topSample ? times(topSample.count) : '', { text: true }),
    statCard('In History', String(helpers.historyCount), 'challenges kept on this device', { text: true }),
  ];

  cards.forEach((c, i) => c.style.setProperty('--i', String(i)));

  const barBlock = (title, entries) => {
    if (!entries.length) return null;
    const max = entries[0].count || 1;
    return h('section', { class: 'card bars' },
      h('p', { class: 'stat__label', text: title }),
      ...entries.map((e, i) => {
        const fill = h('div', { class: 'bar__fill', style: { width: `${Math.max(6, (e.count / max) * 100)}%` } });
        fill.style.animationDelay = `${i * 60}ms`;
        return h('div', { class: 'bar' },
          h('div', { class: 'bar__top' },
            h('span', { class: 'bar__name', text: e.name }),
            h('span', { class: 'bar__count', text: String(e.count) }),
          ),
          h('div', { class: 'bar__track' }, fill),
        );
      }),
    );
  };

  const grid = h('div', { class: 'stats' }, cards);
  const charts = h('div', { class: 'charts' },
    barBlock('Most drawn genres', topOf(stats.genres, 6)),
    barBlock('Most drawn moods', topOf(stats.moods, 6)),
  );

  mount(container, [grid, charts]);
}

/* ==========================================================================
   Bottom sheet
   ========================================================================== */

export function openSheet(sheet) {
  sheet.classList.add('is-open');
  sheet.setAttribute('aria-hidden', 'false');
  document.body.style.overflow = 'hidden';
  const focusable = sheet.querySelector('button, [tabindex]');
  focusable?.focus({ preventScroll: true });
}

export function closeSheet(sheet) {
  sheet.classList.remove('is-open');
  sheet.setAttribute('aria-hidden', 'true');
  document.body.style.overflow = '';
}

/* ==========================================================================
   Misc
   ========================================================================== */

/** Flashes a button to confirm an action happened. */
export function pulse(el) {
  replay(el, 'anim-pop');
}

export { ICONS };
