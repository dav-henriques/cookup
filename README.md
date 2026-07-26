# Beat Challenge

**Random inspiration for music producers.**

A static web app that generates complete beat production challenges — genre, BPM, mood,
sample source, drums, groove, instrumentation, and the constraints that actually make the
session interesting. Two modes: a **Daily Challenge** that is identical for everyone in the
world, and a **Free Challenge** that rerolls infinitely.

No backend. No database. No build step. No Node.js at runtime.
HTML, CSS and vanilla JavaScript only — drop it on GitHub Pages and it works.

---

## Deploying to GitHub Pages

1. Push this folder to a repository.
2. **Settings → Pages → Source: Deploy from a branch**, pick `main` and `/ (root)`.
3. Done. The app is fully relative-path based, so it works from
   `user.github.io/repo/` as well as from a custom domain.

`.nojekyll` is included so Pages serves every file untouched.

### Running locally

The app fetches its database from `data/*.json`, which browsers block on `file://`.
Serve the folder over http:

```bash
python3 -m http.server 8000
# then open http://localhost:8000
```

Opening `index.html` by double-clicking will show a friendly error explaining exactly this.

---

## Project structure

```
index.html                 Single page: shell, XMB nav, all five views, share sheet
manifest.webmanifest       Add-to-Home-Screen metadata

/css
    variables.css          Design tokens + self-hosted @font-face  (edit colours here)
    animations.css         Every @keyframes and motion utility
    style.css              Structure and components (18 numbered sections)

/js
    app.js                 Application shell: boot, state, routing, events
    generator.js           Pure seeded generation + display row mapping
    daily.js               date -> seed -> daily challenge, countdown helpers
    ui.js                  Rendering, icon set, toasts, mood tint
    animations.js          Canvas wave background + motion helpers
    storage.js             LocalStorage: history, favourites, stats, prefs
    share.js               Poster export (Canvas), copy, native share

/data
    genres.json            34 genres, each with BPM window and affinities
    moods.json             40 moods with colour tints and production notes
    bpms.json              Tempo zones, groove feels, time signatures, quantize
    samples.json           50 sample sources with record "flavours", chops, treatments
    drums.json             30 drum styles, kits, percussion, bass approaches
    challenges.json        228 creative rules, 120 extras, instruments, eras, chords

/assets
    fonts/                 Inter variable subset (SIL OFL, license included)
    icon-*.png             App icons for Add to Home Screen
```

> The `js/` folder adds two modules beyond the original brief — `storage.js` and
> `share.js`. Persistence and the 1080×1920 poster renderer are each substantial
> enough that folding them into `app.js` or `ui.js` would have made those files
> the wrong shape. Everything else follows the requested layout exactly.

---

## How generation works

### Deterministic by design

```
seed ──▶ xmur3 hash ──▶ mulberry32 PRNG ──▶ challenge
```

Every draw comes from one seeded PRNG, so a seed always reproduces the same challenge.
That single property gives three features for free:

- **Daily Challenge** — the seed is the UTC date (`2026-07-25`), so every user on earth
  gets the same challenge, with no server involved. It rolls over at UTC midnight and the
  page updates itself without a reload.
- **Shareable links** — a generated challenge lives at `#s=<seed>`. Send the URL, the
  other person sees the exact same brief.
- **History** — reopening a saved challenge is exact, not approximate.

### Coherent, not random

A pure random draw produces nonsense like *Drill at 74 BPM with bossa nova drums*.
Instead, the genre is drawn first and carries its own gravity:

```jsonc
{
  "id": "boom-bap",
  "bpm": { "min": 82, "max": 96 },   // BPM is drawn inside this window
  "swingBias": 0.7,                  // nudges the swing percentage
  "affinity": {                      // these entries stay in the pool but
    "moods":   ["dusty", "dark"],    // become ~6x more likely to be drawn
    "samples": ["soul", "jazz"],
    "drums":   ["dusty", "crunchy"],
    "eras":    ["1994-nyc"],
    "instruments": ["rhodes"]
  }
}
```

Affinities *bias* rather than *restrict*, so surprises still happen — they just happen
on purpose. Difficulty is chosen before the creative rule, and the rule pool is filtered
to match: an `Easy` challenge never draws *"No EQ on any channel"*, and an `Insane` one
draws two hard rules at once.

### Adding content

Everything is data. To add a genre, append an object to `data/genres.json` — no code
changes. Same for moods, samples, drums, rules and extras. To add a whole new *parameter*
(say, "Reference Track"), add the pool to a JSON file, resolve it in
`generateChallenge()`, and add one row to `toRows()` in `generator.js`. The card grid,
the poster export and the copy/share text all pick it up automatically.

---

## Interface

Two references, mixed rather than copied:

- **PS3 XMB** — black canvas, horizontal icon flow, huge negative space, and slow
  translucent ribbons drifting behind everything (Canvas 2D, time-based so the speed is
  identical at 60 Hz and 120 Hz, paused when the tab is hidden).
- **iOS App Library** — frosted rounded cards, soft glow, a strict grid, generous
  spacing.

The whole interface takes on the **tint of the current mood** — cards, glow, nav marker,
background ribbons and the exported poster all drift towards it over ~700 ms.

On desktop the navigation is a horizontal XMB rail near the top. Below 860 px it becomes
a floating frosted tab bar, and the card grid drops to two columns. Both breakpoints use
spans that always add up to a full row, so there are no ragged edges at any width.

### Cinematic reveal

Generating fades the cards out, runs a loader whose caption cycles through the steps of
the draw, then brings the parameters back **one by one** — each card rises, un-blurs and
settles 58 ms after the one before it.

---

## Features

| | |
|---|---|
| **Daily Challenge** | Same for everyone worldwide, rolls over at UTC midnight with a live countdown |
| **Free Challenge** | Infinite rerolls, each one linkable via `#s=<seed>` |
| **Save as Image** | 1080×1920 Story and 1080×1080 Square posters, painted with Canvas — no libraries, no server |
| **Copy / Share** | Plain-text brief, plus the native share sheet (including the image) where supported |
| **History** | Last 60 challenges, stored automatically |
| **Favourites** | Up to 200 saved challenges |
| **Statistics** | Total generated, average BPM, most drawn genre / mood / sample source, consecutive-day streak |

Keyboard: `G` or `Space` generates, `←` `→` move along the nav rail, `Esc` closes the
share sheet.

Everything is stored in LocalStorage on the user's own device. Nothing is uploaded,
and the app degrades to an in-memory store if storage is blocked.

---

## Accessibility & performance

- Semantic tabs (`role="tablist"` / `tabpanel"`), labelled controls, visible focus rings.
- `prefers-reduced-motion` disables the reveal cascade and freezes the background on a
  single static frame.
- All text is written with `textContent`, never string-interpolated HTML.
- One font file (48 KB) preloaded, zero third-party requests, no runtime dependencies —
  the whole app is roughly 350 KB including fonts, icons and the entire database.

---

## Ideas the architecture is already ready for

Themes (swap `variables.css` tokens), challenge collections (filter `creativeRules` by
`tags`), achievements (read from `storage.getStats()`), weekly challenges (reuse
`daily.js` with a week key), and difficulty selection (constrain the pool passed to
`generateChallenge`).

---

## Credits

Typeface: [Inter](https://rsms.me/inter/) by Rasmus Andersson, SIL Open Font License 1.1
(`assets/fonts/Inter-OFL.txt`).
