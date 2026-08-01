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

Touchscreens get on-screen controls; gamepads are read through the Gamepad API. Phones
play in **landscape** — portrait prompts you to rotate, because there is not enough room
for the road and the control pads at once.

On a phone the game starts in **Fast** graphics (no shadows or antialiasing, a capped
pixel ratio and a lighter scenery field). Switch to High in the paddock if your device can
take it; the choice is remembered.

**The boost is the whole game.** Hold drift through a corner to build charge. Release above
28% for a boost, above 85% for a double-strength one. Drifting costs you grip, so the fast
lap is the one where you commit to the slide early and let go at the exit — dumping the
boost onto the straight instead of into the next braking zone.

### Circuits

Eleven circuits across five worlds, each with its own shape, elevation profile,
jumps and art direction.

| Circuit | World | Difficulty | Notes |
| --- | --- | --- | --- |
| Mos Espa Circuit | Tatooine | Easy | Wide banked sweepers, one long jump |
| Dune Sea Loop | Tatooine | Medium | Figure-eight over the dunes, a jump per loop |
| Mos Espa Grand Arena | Tatooine | Medium | Huge straights, banked hairpins, packed stands |
| Coruscant Skyway | Coruscant | Medium | Elevated ribbon through the towers |
| Mon Gazza Speedway | Malastare | Medium | Mining country — fast, filthy, built for slipstreaming |
| Beggar's Canyon | Tatooine | Hard | Sheer walls and a double apex |
| Boonta Eve Classic | Tatooine | Hard | The long one; constantly changing radii |
| Baroonda Rainforest | Baroonda | Hard | Blind, close and green |
| Jundland Knot | Tatooine | Hard | Crosses itself three times |
| Ilum Ice Run | Ilum | Hard | Six near-identical corners; pure rhythm |
| Oovo IV Ravine | Oovo IV | Hard | An asteroid quarry with three big jumps |

Three pods trade top speed against grip. Personal bests are stored per circuit in your
browser.

Circuits carry elevation and corner banking, both **purely cosmetic** — the simulation
runs in the XZ plane, so how a track looks can never change how it drives. Jumps are the
exception: a ramp's lip is load-bearing, and how far you fly depends on how fast you
arrive. Corner speeds come from the centre line's curvature, which is why the generators
in `constants.ts` keep a minimum corner radius: fold the centre line tighter than a pod
can turn and the AI simply crawls through the corner.

### Racecraft

- **Slipstream.** Sit close behind another pod, roughly in line and pointed the same way,
  and the tow is worth up to 14% top speed. The HUD tells you when you have it.
- **Contact.** Pods collide properly — separation, a restitution impulse, tangential
  scrub so rubbing alongside costs you both, and a yaw kick that knocks your nose off
  line. Square hits push; glancing blows spin you.
- **Jumps.** Land straight and you barely lose anything. Land sideways or heavily and you
  scrub speed.

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
    trackMesh.ts  Builds road/curb/runoff/barrier geometry from the same samples
                  the physics uses, so visuals and collision always agree.
    textures.ts   Road, curb, chequer, runoff and barrier textures drawn into
                  canvases at load time — no image files to fetch.
    input.ts      Keyboard, gamepad and touch collapsed into one Controls struct.
    audio.ts      Synthesised engine, rival engines, tyre scrub, wind and
                  impacts — no audio assets.
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
