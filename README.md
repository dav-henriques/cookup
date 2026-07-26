# CookUp

A production session companion. Not a DAW, not a notes app, not a productivity tool —
a quiet second screen that sits beside FL Studio, Ableton, Logic or Cubase while you work.

Everything on the session screen is designed to be read in under two seconds so you can
go straight back to the music.

- **Clock** — the current time, large. Click it to switch 12 / 24 hour.
- **Session timer** — elapsed time that survives refreshes, sleep and browser restarts.
- **BPM calculator** — beat and bar lengths in seconds, from 1 beat to 32 bars, 4/4.
- **Tap tempo** — tap in time; the estimate feeds the calculator automatically.
- **Water** — tap to add a glass, hold to reset.
- **Break reminder** — 30 / 45 / 60 / 90 minutes, a small silent pill in the corner.
- **History** — every session is kept locally with duration, breaks and water count.

No backend, no frameworks, no build step, no accounts, no analytics. All data lives in
LocalStorage on the device it was created on.

---

## Running it

Because the app uses ES modules and a service worker, it needs to be served over HTTP —
opening `index.html` from the filesystem will not work.

```bash
# any static server will do
python3 -m http.server 8000
# then open http://localhost:8000
```

## Deploying to GitHub Pages

1. Create an empty repository on GitHub.
2. Push this folder to it:

   ```bash
   git remote add origin git@github.com:<you>/cookup.git
   git branch -M main
   git push -u origin main
   ```

3. In the repository, go to **Settings → Pages**, set **Source** to *Deploy from a branch*,
   pick `main` and the `/ (root)` folder, and save.
4. The app appears at `https://<you>.github.io/cookup/` after a minute or so.

Every path in the project is relative, so it works from a repository subdirectory,
a custom domain or a local folder without any configuration.

`.nojekyll` is included so GitHub Pages serves the files as-is.

## Installing it

Once loaded over HTTPS, the browser offers CookUp as an installable app
(Chrome: the install icon in the address bar; iOS Safari: Share → Add to Home Screen).
After the first load it works with no connection at all.

---

## Project structure

```
index.html              markup for both screens
manifest.json           PWA manifest
service-worker.js       offline cache (bump CACHE when files change)
.nojekyll               tells GitHub Pages not to run Jekyll

styles/
  style.css             tokens, components, responsive layout

scripts/
  ui.js                 entry point: routing, screen wiring
  storage.js            the only module that touches LocalStorage
  sessions.js           session model, timing maths, formatting
  clock.js              wall clock
  timer.js              elapsed time
  bpm.js                bar-length calculator
  tap-tempo.js          tap tempo
  water.js              water counter
  breaks.js             break reminder

components/
  session-card.js       a row in the history list
  modal.js              single-field prompt
  toast.js              corner notification

fonts/                  Inter (variable, latin subset), self-hosted for offline use
icons/                  app icons, generated from icon.svg
```

### How the timer survives everything

A session stores `accumulatedMs` plus `runningSince`, a wall-clock timestamp of the moment
it last started. Elapsed time is always *derived*:

```js
accumulatedMs + (status === 'running' ? Date.now() - runningSince : 0)
```

Nothing counts, nothing writes on a tick, and closing the browser mid-session changes
nothing. Pausing folds the live segment into `accumulatedMs` and clears `runningSince`.

Only one session runs at a time — opening or resuming a session pauses any other, so old
sessions never accumulate phantom hours.

### Adding a widget

1. Write `scripts/my-widget.js` exporting `mount(opts)` and, if it shows session data,
   `refresh()`.
2. Add the markup to `index.html` with a `grid-area`, and the area name to `.grid` in
   `style.css` (base, tablet, mobile and landscape).
3. Mount it in `mountWidgets()` in `ui.js`, and call its `refresh()` from
   `refreshWidgets()` if needed.
4. Add the file to `ASSETS` in `service-worker.js` and bump `CACHE`.

### Data shape

```jsonc
{
  "version": 1,
  "activeSessionId": "…",
  "settings": { "clock24": false, "bpm": 84, "breakIntervalMin": 60 },
  "sessions": [{
    "id": "…",
    "name": "Late Night",
    "status": "running",        // running | paused | completed
    "createdAt": 1753500000000, // start date + time
    "endedAt": null,            // end time, set by End Session
    "accumulatedMs": 8280000,
    "runningSince": 1753500000000,
    "water": 4,
    "breaks": 2,
    "breakIntervalMin": 60,
    "nextBreakAtMs": 10800000
  }]
}
```

Stored under the LocalStorage key `cookup.state.v1`.

---

## Licence

The code is yours to do whatever you like with.

Inter is bundled under the SIL Open Font License 1.1 — see `fonts/Inter-LICENSE.txt`.
