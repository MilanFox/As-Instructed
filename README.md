# BOOTSTRAP

*or: How I Learned to Stop Worrying and Automate the Regolith.*

A puzzle-programming game. You are Contractor #4471 at Kessler & Daughters Terraforming Ltd. You
never go to the planets — you write the TypeScript that the planets' robots run, and then you watch
the recording of what they did with it.

Forty work orders across eight worlds, from "drive East four times" to a fleet of a hundred bots
sharing a schedule. Everything runs in the browser. There is no server and no account.

## Running it

```bash
npm install
npm run dev        # http://localhost:5173
```

Other scripts: `npm run build` (typecheck + production build), `npm run preview`,
`npm run test:run` (Vitest, ~1175 tests), `npm run typecheck`, `npm run lint`, `npm run format`.

Requires Node 20+. Chrome, Firefox or Safari — anything with Web Workers, Canvas2D and ES2022.

## Playing it

The site map lists the work orders; one opens as you close the one before it. In a work order:

- **Left** — the program. Real TypeScript, checked as you type by the same compiler that transpiles
  it. Your API is **synchronous**: `move(Dir.East)`, never `await`.
- **Right** — the site view. Your program runs to completion in a Web Worker and hands back a
  *trace*; the site view is a recording of that trace, so scrubbing, stepping and 0.25x–64x speed
  are all free.
- **Below** — the brief, the console, and the API reference for the hardware you have installed.

**Run** is the button, or `Ctrl`/`Cmd`+`Enter`. Space plays and pauses, `,`/`.` step a tick,
`Home`/`End` jump, `F1` opens the reference, `Esc` goes back to the site map.

You are scored on **ticks**: gold at or under par, silver within 25%, bronze for a pass. Source
length is not scored - write it as readably as you like. Some work orders carry a bonus objective
worth a star. From World 2 onward
every work order runs on several random layouts and all of them have to pass, so a hardcoded route
will not survive.

Progress lives in `localStorage`. **export** writes it to a JSON file and **import** merges one
back, which is also how you move a save between machines.

## Architecture

Vite 6 + TypeScript 5 (strict) + React 19 + zustand. Plain CSS with design tokens — no Tailwind.
The one hard rule everything else follows from: **the simulation produces a trace, and the renderer
draws the trace.** The renderer never talks to the simulation.

| Directory | What lives there |
|---|---|
| `src/engine/` | The simulation. Pure data and pure functions — no DOM, no canvas, no React. Worlds, bots, per-bot clocks, the cost model, the trace format, objectives and verdicts. It runs unchanged in Node under Vitest, which is why it is the most heavily tested thing in the repo. |
| `src/runtime/` | The sandbox. Compiles your TypeScript with Monaco's own TS worker on the main thread, then runs the emitted JS inside a Web Worker with the player API bound to a `Sim`. Three independent stops for runaway code: a tick budget, an op budget, and a main-thread watchdog that terminates the worker. Errors are mapped back through the source map to the line you are looking at. |
| `src/render/` | The Canvas2D trace player. 48px tiles from the Kenney sheets, camera, interpolated movement, a particle system, and the bots themselves drawn in code. Owns the frame loop and reports its playback position outward. |
| `src/levels/` | The forty work orders: world builders, objectives, briefs, par, starter code, hints. Each ships a reference solution under `__solutions__/` that Vitest asserts is solvable on every seed. Those are test fixtures — `vite.config.ts` fails the build if one ever becomes reachable from the client bundle. |
| `src/ui/` | The React shell: workspace layout, Monaco panel, site map, timeline, results, Performance Review, and the adapters that wire the runtime, renderer, audio and Repository into the store. |
| `src/game/` | Save file (versioned, migrating, and never allowed to lose your source), scoring, and the one zustand store the shell reads from. |
| `src/audio/` | WebAudio, synthesized in code — there are no audio files. Because playback is a trace being scrubbed rather than a game being played, the audio is a cursor over `trace.events` driven by the renderer's clock, with rate limiting so 64x becomes texture rather than a machine gun. Ambience ships off; the toggle is in the sound settings. |
| `src/meta/` | The Library — a shared `lib.ts` you can publish subroutines into, unlocked at the end of World 3. Library calls cost real ticks, so making one faster improves every work order that calls it, and editing it re-runs every closed work order that imports from it. Entirely optional: a player who never opens it finishes with the same medals. |

Monaco is about nine tenths of the build, so it is loaded on demand: the site map paints first and
the editor arrives with the workspace.

## Documentation

`docs/` is the source of truth, in this order:

- `DESIGN.md` — the binding contract. Read §3 (execution model) and §11 (amendments) first.
- `NARRATIVE.md` — voice, cast, and every stock player-facing line.
- `CURRICULUM.md` — all forty work orders, what each teaches, and why par is where it is.
- `ENGINE.md`, `AUDIO.md`, `LIBRARY.md`, `ASSETS.md` — one per subsystem, written by whoever built it.

## Licences

Third-party assets are committed under `public/`. Full detail, verbatim licence text and per-pack
attribution are in [`public/assets/LICENSES.md`](public/assets/LICENSES.md).

- **Tiles and UI sprites** — nine [Kenney.nl](https://kenney.nl) packs, **CC0 1.0**. Credit is not
  required; it is given anyway. `tiles/bootstrap_tiles_48.*` is our own derivative sheet, cropped
  and resampled from six of them, with every frame recording where it came from.
- **Fonts** — [Inter](https://github.com/rsms/inter) and
  [JetBrains Mono](https://github.com/JetBrains/JetBrainsMono), both **SIL Open Font License 1.1**,
  self-hosted as Latin-subset variable fonts. Licence texts sit beside them in `public/fonts/`.

The game's own code and content have no licence declared yet.
