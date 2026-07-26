/**
 * generator.js
 * ---------------------------------------------------------------------------
 * Pure, dependency-free challenge generation.
 *
 * Design goals
 *   1. Deterministic — the same seed always produces the same challenge.
 *      This is what makes the Daily Challenge identical for every user
 *      without a server.
 *   2. Coherent — a genre pulls the rest of the draw towards musically
 *      sensible neighbours (affinity boosting) so the result reads as a
 *      creative direction, not a slot machine.
 *   3. Extensible — every category is resolved through the same small set
 *      of helpers, so adding a new parameter is a few lines, not a refactor.
 *
 * Nothing in this module touches the DOM or storage. It can be unit tested
 * or reused as-is.
 */

/* ==========================================================================
   Seeded pseudo-random number generation
   ========================================================================== */

/**
 * xmur3 string hash — turns any string into a well-distributed 32-bit seed.
 * @param {string} str
 * @returns {() => number} generator of successive 32-bit seeds
 */
export function xmur3(str) {
  let h = 1779033703 ^ str.length;
  for (let i = 0; i < str.length; i += 1) {
    h = Math.imul(h ^ str.charCodeAt(i), 3432918353);
    h = (h << 13) | (h >>> 19);
  }
  return function next() {
    h = Math.imul(h ^ (h >>> 16), 2246822507);
    h = Math.imul(h ^ (h >>> 13), 3266489909);
    h ^= h >>> 16;
    return h >>> 0;
  };
}

/**
 * mulberry32 — small, fast, statistically solid 32-bit PRNG.
 * @param {number} seed
 * @returns {() => number} float in [0, 1)
 */
export function mulberry32(seed) {
  let a = seed >>> 0;
  return function next() {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/**
 * Builds the small RNG facade used throughout this module.
 * @param {string|number} seedInput
 */
export function createRng(seedInput) {
  const numericSeed =
    typeof seedInput === 'number'
      ? seedInput >>> 0
      : xmur3(String(seedInput))();

  const float = mulberry32(numericSeed);

  const api = {
    seed: numericSeed,
    float,
    /** Integer in [min, max] inclusive. */
    int: (min, max) => Math.floor(float() * (max - min + 1)) + min,
    /** Uniform pick from an array. */
    pick: (arr) => arr[Math.floor(float() * arr.length)],
    /** True with the given probability (0..1). */
    chance: (p) => float() < p,
    /** Non-mutating Fisher-Yates shuffle. */
    shuffle: (arr) => {
      const out = arr.slice();
      for (let i = out.length - 1; i > 0; i -= 1) {
        const j = Math.floor(float() * (i + 1));
        [out[i], out[j]] = [out[j], out[i]];
      }
      return out;
    },
  };

  return api;
}

/* ==========================================================================
   Selection helpers
   ========================================================================== */

/**
 * Weighted pick with optional affinity boosting.
 *
 * `boostIds` normally comes from the chosen genre's affinity list: those
 * entries stay in the same pool (so surprises are still possible) but become
 * far more likely, which is what keeps results musically believable.
 *
 * @param {ReturnType<createRng>} rng
 * @param {Array<Object>} items
 * @param {{ boostIds?: Set<string>, boostFactor?: number, weightKey?: string }} [opts]
 */
export function weightedPick(rng, items, opts = {}) {
  const { boostIds = null, boostFactor = 6, weightKey = 'weight' } = opts;
  if (!items || items.length === 0) return null;

  const weights = new Array(items.length);
  let total = 0;

  for (let i = 0; i < items.length; i += 1) {
    const item = items[i];
    let w = typeof item[weightKey] === 'number' ? item[weightKey] : 1;
    if (boostIds && boostIds.has(item.id)) w *= boostFactor;
    weights[i] = w;
    total += w;
  }

  let r = rng.float() * total;
  for (let i = 0; i < items.length; i += 1) {
    r -= weights[i];
    if (r <= 0) return items[i];
  }
  return items[items.length - 1];
}

/** Picks `count` distinct items using weightedPick semantics. */
export function weightedPickMany(rng, items, count, opts = {}) {
  const pool = items.slice();
  const out = [];
  while (out.length < count && pool.length > 0) {
    const chosen = weightedPick(rng, pool, opts);
    out.push(chosen);
    pool.splice(pool.indexOf(chosen), 1);
  }
  return out;
}

/** Finds an entry by id, falling back to a weighted pick when absent. */
function byIdOr(rng, items, id) {
  return items.find((i) => i.id === id) || weightedPick(rng, items);
}

/* ==========================================================================
   Difficulty
   ========================================================================== */

/** Which rule difficulties are allowed for each challenge difficulty level. */
const RULE_LEVELS_BY_DIFFICULTY = {
  1: [1],
  2: [1, 2],
  3: [2, 3],
  4: [3],
};

const DIFFICULTY_WEIGHTS = { easy: 32, medium: 40, hard: 22, insane: 6 };

/* ==========================================================================
   Main entry point
   ========================================================================== */

/**
 * Generates one complete challenge.
 *
 * @param {Object}   params
 * @param {Object}   params.data     Loaded JSON database (see loadDatabase).
 * @param {string|number} params.seed
 * @param {'free'|'daily'} [params.mode]
 * @param {string}   [params.dateKey] Present for daily challenges.
 * @returns {Object} challenge
 */
export function generateChallenge({ data, seed, mode = 'free', dateKey = null }) {
  const rng = createRng(seed);
  const { genres, moods, bpms, samples, drums, challenges } = data;

  /* --- 1. Genre sets the gravity for everything else ------------------- */
  const genre = weightedPick(rng, genres.items);
  const aff = genre.affinity || {};
  const boost = (list) => new Set(list || []);

  /* --- 2. Tempo --------------------------------------------------------- */
  const bpm = rng.int(genre.bpm.min, genre.bpm.max);
  const bpmZone =
    bpms.zones.find((z) => bpm >= z.min && bpm <= z.max) || bpms.zones[0];

  /* --- 3. Groove: swing amount is nudged by the genre's swingBias ------- */
  const groove = weightedPick(rng, bpms.grooveFeels);
  const [swingMin, swingMax] = groove.swing;
  const bias = typeof genre.swingBias === 'number' ? genre.swingBias : 0.5;
  // Blend a random position in the feel's window with the genre's tendency.
  const swingT = Math.min(1, Math.max(0, rng.float() * 0.55 + bias * 0.45));
  const swing = Math.round(swingMin + (swingMax - swingMin) * swingT);
  const timeSignature = weightedPick(rng, bpms.timeSignatures);
  const quantize = rng.pick(bpms.quantizeModes);

  /* --- 4. Mood ---------------------------------------------------------- */
  const mood = weightedPick(rng, moods.items, { boostIds: boost(aff.moods) });

  /* --- 5. Sampling ------------------------------------------------------ */
  const sampleSource = weightedPick(rng, samples.sources, {
    boostIds: boost(aff.samples),
  });
  const sampleFlavor = rng.pick(sampleSource.flavors || ['a record nobody remembers']);
  const chopStyle = rng.pick(samples.chopStyles);
  const processing = rng.pick(samples.processing);

  /* --- 6. Rhythm section ------------------------------------------------ */
  const drumStyle = weightedPick(rng, drums.styles, { boostIds: boost(aff.drums) });
  const kit = rng.pick(drums.kits);
  const percussion = rng.pick(drums.percussion);
  const bass = rng.pick(drums.bass);

  /* --- 7. Harmony & instrumentation ------------------------------------ */
  const era = byIdOr(rng, challenges.eras, rng.pick(aff.eras || []));
  const chordStyle = rng.pick(challenges.chordStyles);

  const mainPool = challenges.instruments.filter((i) => i.roles.includes('main'));
  const mainInstrument = weightedPick(rng, mainPool, {
    boostIds: boost(aff.instruments),
  });

  const secondaryPool = challenges.instruments.filter(
    (i) => i.roles.includes('secondary') && i.id !== mainInstrument.id,
  );
  const secondaryInstrument = weightedPick(rng, secondaryPool, {
    boostIds: boost(aff.instruments),
    boostFactor: 3,
  });

  const arrangement = rng.pick(challenges.arrangements);

  /* --- 8. Constraints --------------------------------------------------- */
  const difficulty = weightedPick(
    rng,
    challenges.difficulties.map((d) => ({ ...d, weight: DIFFICULTY_WEIGHTS[d.id] || 10 })),
  );

  const allowedLevels = RULE_LEVELS_BY_DIFFICULTY[difficulty.level] || [1, 2, 3];
  const rulePool = challenges.creativeRules.filter((r) =>
    allowedLevels.includes(r.difficulty),
  );
  const rules = weightedPickMany(
    rng,
    rulePool.length ? rulePool : challenges.creativeRules,
    difficulty.level >= 4 ? 2 : 1,
  );

  const extraPool = challenges.extraChallenges.filter(
    (e) => e.difficulty <= Math.max(2, difficulty.level),
  );
  const extraChallenge = rng.pick(extraPool.length ? extraPool : challenges.extraChallenges);

  const mixNote = rng.pick(challenges.mixNotes);

  /* --- 9. Title --------------------------------------------------------- */
  const title = `${rng.pick(challenges.titleWords.adjectives)} ${rng.pick(
    challenges.titleWords.nouns,
  )}`;

  return {
    schema: 1,
    id: `bc_${mode}_${rng.seed.toString(36)}`,
    seed: rng.seed,
    mode,
    dateKey,
    createdAt: new Date().toISOString(),
    title,

    genre,
    bpm,
    bpmZone,
    groove,
    swing,
    timeSignature,
    quantize,
    mood,

    sample: {
      source: sampleSource,
      flavor: sampleFlavor,
      chop: chopStyle,
      processing,
    },

    drums: { style: drumStyle, kit, percussion },
    bass,

    era,
    chordStyle,
    mainInstrument,
    secondaryInstrument,
    arrangement,

    difficulty,
    creativeRule: rules[0],
    bonusRule: rules[1] || null,
    extraChallenge,
    mixNote,
  };
}

/* ==========================================================================
   Presentation helpers (kept here so the shape stays close to the data)
   ========================================================================== */

/**
 * Ordered list of display rows. `ui.js` renders directly from this, so adding
 * a parameter to the interface only means adding an entry here.
 * @param {Object} c challenge
 */
export function toRows(c) {
  const rows = [
    { key: 'genre',      label: 'Genre',       value: c.genre.name,          note: c.genre.note,          variant: 'hero',  icon: 'disc' },
    { key: 'bpm',        label: 'Tempo',       value: `${c.bpm}`,            note: c.bpmZone.note,        variant: 'bpm',   icon: 'gauge', unit: 'BPM' },
    { key: 'mood',       label: 'Mood',        value: c.mood.name,           note: c.mood.note,           variant: '',      icon: 'sparkle' },
    { key: 'sample',     label: 'Sample Source', value: c.sample.source.name, note: `Look for ${c.sample.flavor}.`, variant: 'wide', icon: 'wave' },
    { key: 'chop',       label: 'Chop Style',  value: c.sample.chop.name,    note: c.sample.chop.note,    variant: '',      icon: 'scissors' },
    { key: 'processing', label: 'Treatment',   value: c.sample.processing.name, note: c.sample.processing.note, variant: '', icon: 'sliders' },
    { key: 'drums',      label: 'Drum Style',  value: c.drums.style.name,    note: c.drums.style.note,    variant: '',      icon: 'drum' },
    { key: 'kit',        label: 'Kit',         value: c.drums.kit.name,      note: c.drums.kit.note,      variant: '',      icon: 'grid' },
    { key: 'percussion', label: 'Percussion',  value: c.drums.percussion.name, note: '',                  variant: '',      icon: 'dots' },
    { key: 'bass',       label: 'Bass',        value: c.bass.name,           note: c.bass.note,           variant: '',      icon: 'bass' },
    { key: 'groove',     label: 'Groove',      value: c.groove.name,         note: `${c.swing}% swing · ${c.timeSignature.name} · ${c.quantize.name}`, variant: 'wide', icon: 'metronome' },
    { key: 'chords',     label: 'Chord Style', value: c.chordStyle.name,     note: c.chordStyle.note,     variant: '',      icon: 'keys' },
    { key: 'main',       label: 'Main Instrument',      value: c.mainInstrument.name,      note: '', variant: '', icon: 'star' },
    { key: 'secondary',  label: 'Secondary Instrument', value: c.secondaryInstrument.name, note: '', variant: '', icon: 'layers' },
    { key: 'era',        label: 'Era',         value: c.era.name,            note: '',                    variant: '',      icon: 'clock' },
    { key: 'arrangement',label: 'Arrangement', value: c.arrangement.name,    note: c.arrangement.note,    variant: 'wide',  icon: 'timeline' },
    { key: 'rule',       label: 'Creative Rule', value: c.creativeRule.text, note: '',                    variant: 'rule',  icon: 'lock' },
  ];

  if (c.bonusRule) {
    rows.push({ key: 'bonusRule', label: 'Second Rule', value: c.bonusRule.text, note: '', variant: 'rule', icon: 'lock' });
  }

  rows.push(
    { key: 'extra', label: 'Extra Challenge', value: c.extraChallenge.text, note: '', variant: 'rule', icon: 'flag' },
    // Spans are tuned so every grid row adds up exactly: with a bonus rule the
    // mix note pairs with the extra challenge, without one it runs full width.
    { key: 'mix', label: 'Mix Note', value: c.mixNote, note: '', variant: c.bonusRule ? 'wide' : 'full', icon: 'sliders' },
  );

  return rows;
}

/** Plain-text version used by Copy and Share. */
export function toText(c, { url = '' } = {}) {
  const lines = [
    `BEAT CHALLENGE — ${c.title}`,
    c.mode === 'daily' && c.dateKey ? `Daily Challenge · ${c.dateKey}` : 'Free Challenge',
    '',
    `Genre           ${c.genre.name}`,
    `BPM             ${c.bpm}`,
    `Mood            ${c.mood.name}`,
    `Sample Source   ${c.sample.source.name} (${c.sample.flavor})`,
    `Chop Style      ${c.sample.chop.name}`,
    `Treatment       ${c.sample.processing.name}`,
    `Drum Style      ${c.drums.style.name}`,
    `Kit             ${c.drums.kit.name}`,
    `Percussion      ${c.drums.percussion.name}`,
    `Bass            ${c.bass.name}`,
    `Groove          ${c.groove.name} · ${c.swing}% swing · ${c.timeSignature.name}`,
    `Chord Style     ${c.chordStyle.name}`,
    `Main Instr.     ${c.mainInstrument.name}`,
    `Secondary       ${c.secondaryInstrument.name}`,
    `Era             ${c.era.name}`,
    `Arrangement     ${c.arrangement.name}`,
    `Difficulty      ${c.difficulty.name}`,
    '',
    `CREATIVE RULE   ${c.creativeRule.text}`,
  ];

  if (c.bonusRule) lines.push(`SECOND RULE     ${c.bonusRule.text}`);

  lines.push(`EXTRA           ${c.extraChallenge.text}`, '');
  if (url) lines.push(url);

  return lines.join('\n');
}
