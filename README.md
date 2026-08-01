# Podracer

A browser pod-racing game. Real corner physics, a field of rival AI racers that run a
precomputed racing line, drift-charged boost, and a post-race engineer that reads your
telemetry back to you.

**▶ Play: https://kelleyblackmore.github.io/podracer/**

No install, no account, no API key. Everything runs client-side.

## Racing

| Input | Action |
| --- | --- |
| `W` / `↑` | Throttle |
| `S` / `↓` | Brake and reverse |
| `A` `D` / `←` `→` | Steer |
| `Shift` / `Space` | Drift — release to fire the boost |
| `C` | Cycle camera (chase / top-down / cockpit) |
| `P` / `Esc` | Pause |
| `R` | Restart |
| `M` | Mute |

Touchscreens get on-screen controls; gamepads are read through the Gamepad API.

**The boost is the whole game.** Hold drift through a corner to build charge. Release above
28% for a boost, above 85% for a double-strength one. Drifting costs you grip, so the fast
lap is the one where you commit to the slide early and let go at the exit — dumping the
boost onto the straight instead of into the next braking zone.

### Circuits

| Circuit | Difficulty | Notes |
| --- | --- | --- |
| Mos Espa Circuit | Easy | Wide sweepers, nearly flat out |
| Dune Sea Loop | Medium | Figure-eight with a blind crossover |
| Beggar's Canyon | Hard | Tight walls, double apex |
| Boonta Eve Classic | Hard | Long, constantly changing radii |

Three pods trade top speed against grip. Personal bests are stored per circuit in your
browser.

## The Crew Chief

After every race you get a debrief covering pace, consistency and discipline, plus three
coaching points drawn from your actual lap data.

It runs **offline by default** — the analysis is computed locally from your telemetry, so
it works with no key, no network and no cost. If you want Gemini to write it instead,
click **Use Gemini** on the results screen and paste your own API key. That key is stored
only in your browser's `localStorage` and sent directly to Google; it is never bundled
into the site or sent anywhere else. If a Gemini request fails, the local debrief is shown
instead.

> Because this is a public static site, no API key can be baked into the build without
> exposing it to everyone who loads the page. That is why the key is supplied at runtime.

## Development

```bash
npm install
npm run dev
```

Other scripts:

```bash
npm run type-check
npm run build
npm run preview
```

Append `?debug` to the URL to expose `window.__PODRACER`, a deterministic test harness:

```js
__PODRACER.pause();            // stop the render-driven loop
__PODRACER.setAutopilot(true); // let the AI drive your pod
__PODRACER.step(15);           // advance exactly 15s in fixed 1/60s ticks
__PODRACER.state();            // lap times, positions, collisions, track info
```

This is how the physics is tested — it makes a full race reproducible without a human at
the keyboard, and works even when `requestAnimationFrame` is throttled.

## How it works

```
src/
  game/
    track.ts      Resamples the centre line to uniform arc length; per-sample
                  curvature and a corner-speed profile with lookahead braking.
    engine.ts     Pure simulation — physics, drift/boost, barriers, laps,
                  standings, rival AI. No React, no rendering.
    trackMesh.ts  Builds road/runoff/barrier geometry from the same samples the
                  physics uses, so visuals and collision always agree.
    input.ts      Keyboard, gamepad and touch collapsed into one Controls struct.
    audio.ts      Synthesised engine and effects — no audio assets.
    storage.ts    Personal bests and preferences in localStorage.
  components/     React shell, HUD, minimap and results screens.
```

The simulation is deliberately decoupled from React. Nothing in the race loop sets state
per frame — pods, sparks and skid marks are written straight to `three` objects through
refs, effects share two instanced meshes, and the HUD samples the world at 12 Hz.

Locating a racer on the track searches a window around its *previous* position rather than
the whole loop. That keeps it O(window) and, more importantly, makes self-crossing
circuits unambiguous: at the figure-eight's crossover a racer stays on the branch it was
already travelling.

## Deployment

Pushing to `main` builds and publishes to GitHub Pages via
[`.github/workflows/deploy.yml`](.github/workflows/deploy.yml). The Pages source must be
set to **GitHub Actions** in repository settings.

The base path defaults to `/podracer/` (the repository name). For a custom domain or a
user/org root site, set `BASE_PATH=/` — locally or in the workflow.
