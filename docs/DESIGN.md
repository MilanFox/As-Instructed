# DESIGN — the binding contract

> Every rule here is currently true and stated once. Nothing may contradict it. If a rule looks
> wrong, report it rather than deviating silently.

## 1. The Game

**BOOTSTRAP** — *or: How I Learned to Stop Worrying and Automate the Regolith.*

The player is Contractor #4471 at **Kessler & Daughters Terraforming Ltd.** They never go to the
planets; they write the code the planets' robots run. Puzzle-programming: grid worlds, real
TypeScript, deterministic simulation, replayable traces, optimization scoring.

Tone is dry, corporate-dystopian, affectionate, never mean-spirited. **Jokes live in mission
briefs, management e-mail and failure messages. API docs stay clean and factual.** Voice is
specified in `docs/NARRATIVE.md`.

## 2. Hard Technical Decisions (settled — do not re-litigate)

| Thing | Decision |
|---|---|
| Build | Vite 6 + TypeScript 5 (strict) |
| UI | React 19 + zustand. **No Tailwind.** Plain CSS with design tokens in `src/ui/styles/tokens.css` |
| Editor | `monaco-editor` + `@monaco-editor/react` |
| Player language | Real TypeScript, transpiled in-browser by Monaco's TS worker |
| Rendering | Canvas2D, no WebGL, no Pixi |
| Audio | WebAudio, synthesized in code. No audio asset files |
| Tiles | Kenney.nl CC0 sprite packs, committed under `public/assets/` |
| Units/FX | Drawn in code (Canvas2D paths), not sprites |
| Sim | Deterministic, seeded, integer-tick. Runs **inside the Web Worker** |
| Persistence | `localStorage`, plus JSON export/import |
| Tests | Vitest for engine + level solvability |
| Package manager | npm |
| i18n | Out of scope, permanently. English only, strings inline |

## 3. Execution Model

**Trace-based replay.** Everything else depends on it.

```
main thread                          worker
-----------                          ------
 user hits Run
 monaco TS worker -> emit JS  ---->  new Function(js) with API bound
                                     runs to completion, SYNCHRONOUSLY
                                     every API call mutates the Sim and
                                     appends timestamped events to a Trace
   <---- { trace, verdict, stats }
 replay/scrub/step the trace
```

- **The player's API is synchronous.** `move(Dir.North)` — no `await`, ever. Deliberate
  accessibility decision.
- The program runs to completion *before* a frame is drawn. The renderer never talks to the sim;
  it consumes a `Trace`.
- **Scrubbing, rewind, step, and speed control are required features** and are free.
- Runaway code is stopped three ways: the `maxTicks` budget (every API call checks it and throws
  `HaltError`), the `maxOps` budget for loops that call the API without advancing ticks, and a
  main-thread watchdog that terminates the worker after `WORKER_TIMEOUT_MS` (default 5000). A
  tight `while(true){}` with no API call is only catchable by the third.
- Runtime errors map back to the **user's** line and column: the transpiled JS is wrapped, so
  subtract the wrapper offset before displaying, and show the failing line inline in Monaco.

## 4. Engine Contract

`src/engine/` is pure logic. **It must not import React, DOM, canvas, or anything
browser-specific.** It runs in Node under Vitest unchanged.

### 4.1 Primitives

`Vec` is `{ x, y }`. Grid: `x` grows East, `y` grows **South** (screen coordinates); North is
`y - 1`. `Dir`, `Terrain`, `ItemKind`, `MachineKind`, `FailureCode` and `Medal` are **frozen objects
plus a union type, never TypeScript enums** — a `const enum` erases at build time and the player's
transpiled program needs `Dir` as a real runtime value.

### 4.2 World

`World` (`src/engine/types.ts`) is the whole simulated site: dimensions, a row-major `tiles` array
indexed `y * w + x`, `bots`, loose `items`, `machines`, an integer `tick`, a seeded `rng`, and a
`vars` scratch record for level-specific state. `Tile` carries `terrain`, optional `growth`, optional
`occupant`. **Everything is data** — no methods, no classes with behaviour. `Sim` operates on it.

### 4.3 Bots and virtual clocks

Every bot has `bot.clock: number`. A blocking action advances **that bot's** clock by the action's
cost. In single-bot worlds this is indistinguishable from a global clock.

Multi-bot worlds (World 7+):

- Bots act independently; `b1.move()` then `b2.move()` means both move in parallel.
- `sync()` advances every bot's clock to `max(clock)`.
- If bot A would enter a tile occupied by bot B over an overlapping interval, A's move **fails and
  returns false**, costing `BLOCKED_COST` ticks. Resolution order is ascending `(clock, botId)`.
- The level's tick score is `max(bot.clock)` (makespan), which is what makes World 7 about
  parallelism.

### 4.4 Commands and cost model

Sensing is **free** (0 ticks). Acting costs ticks. Defaults, overridable per level:

| Action | Ticks |
|---|---|
| `move` (success) | 1 |
| `move` (blocked) | 1 |
| `harvest` / `mine` / `plant` | 2 |
| `pickup` / `drop` | 1 |
| `use` | 2 |
| `wait(n)` | n |
| `send` | 1 |
| any sensing (`scan`, `pos`, `canMove`, `look`, `inventory`, `carrying`) | 0 |

**A blocked move is priced once, in ticks, and nothing may charge for it again.** `move` returning
`false` is a sensing channel the game teaches deliberately — `w1-01`'s own hint sells
bump-and-turn as a real, slightly expensive strategy — and the tick cost is the whole price. A
reward for the *non-occurrence* of an error signal is jointly satisfiable with an information
budget only by already knowing the layout, which is hardcoding, which is what multi-seed levels
exist to prevent.

**Fuel is a real mechanic.** Every bot has `fuel: number`, default `Infinity`, so most levels are
unaffected. Acting consumes fuel equal to the action's tick cost; sensing is free. At zero fuel an
action throws `OutOfFuelError` (`FailureCode.OUT_OF_FUEL`). `refuel()` on a fuel-depot tile
restores to max and burns nothing. Levels opt in via `World.bots[i].fuel` / `fuelMax`. The UI shows
a fuel gauge only where a level uses it. Used by `w4-05` and `w8-05`.

### 4.5 Trace

`Trace` and `TraceEvent` are declared in `src/engine/trace.ts`. A trace is `initialWorld` (a deep
snapshot), `events` sorted by `t` with a stable sort, `keyframes` every ~500 ticks, and `endTick`.

**Replay must be reconstructible purely from `initialWorld` + `events`. The renderer never guesses,
and keyframes are an optimisation only.**

### 4.6 Verdict

`Verdict` (`src/engine/verdict.ts`) reports `passed`, the `objectives` with their labels and
optional `[done, total]` progress, an optional `failure` carrying a `FailureCode` and a message, and
`stats`.

**`stats.spend` is generic resource accounting** — cable used, and anything a later level meters the
same way. Commands and levels populate it via `Sim.spend`; it is merged worst-case per resource
across seeds. Required by `w5-05`.

**`FailureCode.BLOCKED_LIVELOCK` exists and must be used.** When every bot in a multi-bot level has
its move blocked for N consecutive resolution rounds, fail with that code and a message naming
livelock explicitly. Silent livelock reads as an engine bug and makes players quit.

Failure codes are spelled in `SCREAMING_CASE`.

## 5. Level Contract

`LevelDef` is declared in `src/levels/types.ts`. The fields that carry rules rather than data: `id`
(`'w1-03'`, stable forever, the save key), `build(seed)` (pure and deterministic), `objectives`,
`seeds` (**all** must pass; more than one means generalization is required), `par: { ticks }` (the
medal axis and the only par a level has, §7), `graded` (default `true`, §7), `hardware` (the API
names this order unlocks, cumulative), `hints` (progressive, never a full solution), and `bonus`.

Rules for level authors:

- `seeds.length >= 3` from World 2 onward. Randomized worlds kill hardcoded solutions.
- Every level ships a reference solution in `src/levels/**/__solutions__/<id>.ts`. These are test
  fixtures only, excluded from the production bundle by `vite.config.ts` and unreachable from the
  UI. Vitest asserts every level is solvable on every seed and that the reference's tick count is
  `<= par.ticks`.
- `par.ticks` is *achievable but tight*: reference solution ticks minus roughly 10%.
- `hints` are nudges ("What happens if the field is empty when you arrive?"), never code.
- `brief` is two or three sentences of roleplay and then the ask, capped at 110 words and tested.
  **Every number, unit, budget, reach, dimension and wire format belongs in `facts`, in an
  objective label, or on the requisition card** — somewhere it stays on screen while the player
  writes code. Players are frequently reading in a second language; prose is read once, a row can
  be re-read.
- **A new objective whose progress counts anything must declare its meter.** `Objective.meter` and
  `Objective.unit` are declared in `src/engine/objectives.ts`; `BudgetMeter` is declared there once
  and aliased by `src/game/budgets.ts`; `meterFor` / `budgetFor` prefer a declaration over the
  label. `Objectives.custom` can declare one too, via `CustomReport.meter` / `.unit`. Parsing the
  unit back out of the label survives only as a fallback so that an objective which forgot to
  declare reads out approximately right instead of silently not scoring; nothing that ships may
  depend on it, and `src/game/__tests__/budget-declarations.test.ts` pins the set that still infers
  at empty.
- **Omit `progress()` rather than ship a bar pointed at the wrong meter.** Where the honest quantity
  is not a run-wide total — `w7-02`'s heaviest single bot's share, for instance — a bar the readout
  attributes to a run-wide meter is worse than no bar.

**The docs panel states plainly that ordinary JavaScript values — objects, `Map`, `Set`, closures —
persist for the whole run, and that only `mark` / `readMark` persist *in the world*.** Several
World 4 levels are unsolvable until the player believes this, so the Memory page is always
rendered and never behind a filter.

## 6. Progression — 8 Worlds

Progression is driven by **hardware unlocks**: the player does not have `scan()` until the level
that installs the sensor. Each world's finale is a bigger multi-objective level.

| # | World | Theme | Teaches | Unlocks |
|---|---|---|---|---|
| 1 | **Boot Sector** | A dusty test hangar | loops, conditionals, coordinates | `move` `pos` `canMove` `print` `wait` |
| 2 | **Regolith Fields** | Agriculture on a hostile rock | state machines, resource cycles | `scan` `harvest` `plant` `inventory` |
| 3 | **The Sorting Yards** | Logistics depot | data structures, filtering, maps | `pickup` `drop` `carrying` |
| 4 | **Cave Systems** | Unmapped tunnels | search, BFS/DFS, memory of unknown maps | `look` `mark` `readMark` |
| 5 | **The Grid** | Power infrastructure | constraint solving, ordering, graphs | `probe` `use` `power` `link` |
| 6 | **Deep Signal** | A listening post | string/number crunching, parsing, checksums | `receive` `transmit` `decode` |
| 7 | **Swarm** | A hundred cheap robots | parallelism, scheduling, makespan | `bots` `spawn` `sync` `send`/`recv` |
| 8 | **The Kessler Contract** | The finale | everything, under budget | — (capstone levels) |

The campaign is 33 work orders. A world is not five levels and `index` is ascending rather than
contiguous. World 8 is four large orders plus one monster.

**Closing a work order opens the next two, and closing a world opens the whole of the next world.**
`isLevelUnlocked` in `src/game/store.ts` is the one place that decides it. **Not yet succeeding must
never be able to close a door** — strictly N−1 makes all 33 joins single points of failure, and the
hint ladder is the only other escape and it ends. The teaching order survives because the
entitlement is bought with closes: reaching World 5 still means closing most of World 4.

The requisition ceremony is cumulative for the same reason: `openLevel` offers every unsigned
command in the order's API surface, not only the ones that order adds, so a player who skipped the
level granting `scan` still gets the card.

## 7. Scoring

**Medals are ticks-only.** `max(bot.clock)` against `par.ticks`: `<= par` gold,
`<= max(par + 1, par * 1.25)` silver, a pass is bronze. Nothing else moves a medal. The `par + 1`
floor exists because ticks are integers, so a par under four otherwise has an empty silver band —
`floor(3 * 1.25)` is 3. One rung is always reachable.

- **Ticks** (the medal axis): `max(bot.clock)`.
- **The information budget**: `Objectives.withinSenses(name, n)`. Sensing stays free in ticks; a
  level may make it *countable*. Rewards understanding, not typing.
- **Points are fixed: gold 3, silver 2, bronze 1, bonus star +1.** The Performance Review tiers in
  `docs/NARRATIVE.md` §7 assume exactly these weights.

**A level may be ungraded.** `LevelDef.graded` defaults to `true`. An ungraded level shows `CLOSED`
on a pass, has no medal ladder, and is still worth 3 points. The criterion is measured, not
editorial: **can any correct program cost fewer ticks than another correct program?** Where it
cannot, the route is forced and a medal ladder teaches the player the grade is noise, exactly where
the grade is about to start carrying information. The set, measured by driving a *lazy* and a
*smart* program through the harness on every seed: **`w1-01`, `w1-03`, `w5-02`, `w6-01`, `w6-03`,
`w6-05`.**

**"The clock cannot see the lesson" is not "the clock cannot grade", and only the second ungrades a
level.** On `w2-04` ticks cannot tell lapping from waiting, and it still grades usefully.

**The bar a bonus objective must clear.** It asks a question the level's required objectives do not
ask. It is not satisfiable by a program that does nothing. Where a level has no second axis at all —
every correct program costs identical ticks — its predicate must also require the level's own
required objective, or an idle program takes the star for free. Prefer a bonus that requires
evidence of a thing done over one that requires the absence of a thing done.

**The vacuously-true predicate is the defect class to watch for.** A predicate that measures a
maximum, an absence or an exclusion is true of a program that never attempts the level, unless it
also checks the level's required objective. A predicate that measures a produced artefact — a
report, a trail, an ordering — cannot be. **Test a candidate by running `print('.')` and nothing
else against it.** `w6-02`'s `name-the-fault` is vacuously true on seed 2 by design, because `build`
sets the corruption rate to zero there; it is harmless because a failed run banks no star, and the
suite asserts the whole seed map so it cannot resurface as a surprise.

**Character count does not exist**, and nothing may measure, score, rank, store or display the
length of a player's program — not as a target, not as a personal best, not as a neutral readout.
Code golf is not a skill this game rewards: a verbose readable solution and a terse one costing the
same ticks get the same medal, deliberately.

### 7.1 Rewards

The reward systems are `src/game/achievements.ts` (commendations) and the `stats` block in
`src/game/save.ts` (runs, passes, fails).

**There is no streak** — no counter, no best, no field in `CampaignStats`, nothing anywhere that
resets on a failed run. **Nothing in this game may reward a player for not pressing Run.**

- **Nothing is gated behind a commendation**, ever. No level, hint, doc page, or hardware.
- **Nothing may be lost by playing badly, and nothing may be earned by refusing to play.** No
  first-try commendation, no flawless one, no streak, and nothing a player can permanently spoil
  for themselves by experimenting. A reward for never being wrong teaches a player to hesitate
  before dispatching, and dispatching is the entire activity.
- **The bar for a commendation is whether a real person, reading the line at the moment it
  appeared, would smile or feel seen.** Merely being accurate does not clear it. Attendance is
  allowed and so is completion in small quantities — no more than about a fifth of the list may be
  "do all of X". **Restating something already on the screen is prohibited**: if the certificate
  says GOLD, a commendation saying "you got gold" is noise.
- **An aspirational commendation states its requirement before it is met; a retrospective one may
  stay hidden until it fires.** Something a player could aim at and miss must be public.
  `Achievement.hidden` marks the second kind, `CommendationShelf` keeps them off the shelf until
  they fire, and they are where the jokes live.
- **`RunFacts` carries `ticks`, `ops` and `parTicks: number | null`, and no medal.** A medal is
  already on the screen. `parTicks` is nullable because an ungraded order has no ladder; the
  entries that read it decline on `null` rather than dividing by it.
- **Retired commendation ids are never reissued.** `rescueAchievements` in `save.ts` drops them on
  read, so a reissued id would be awarded on the run and dropped on the next load. An id this build
  does not recognise is *kept*: it belongs to a newer build, and a downgrade must not eat a
  player's record.
- **Failure costs nothing but time.** No penalty, no lost progress, no downgraded medal, no
  commendation taken back. A failed run increments a counter that exists only to reward
  persistence. A program that did not compile was never dispatched and does not even do that.
- **Hardware unlocks are a ceremony.** `Requisition` shows each new command once, ever.
- **Everything that plays on completion is skippable**: `prefers-reduced-motion` collapses it,
  `settings.celebrations` turns it off permanently, and a click finishes it immediately.

**The Performance Review is a memo, not a screen.** It is delivered on the site map, once per
grade, through the same ceremony as `Requisition` and `RepositoryIssue`. Delivery is keyed to the
grade reached, not to a change of grade: under the medals-only denominator a player's first gold
reads 100%, so "on change" oscillates across the top boundary and re-issues the same memo. Nothing
may rebuild it as a screen.

**The review is four grades, numbered 2 to 5, and renumbering them 1-4 is a bug.**
`save.reviewedRanks` persists which memos have been sent, so renumbering re-points every existing
save at the wrong memo and withholds one the player has never read. `rescueRanks` accepts any
integer >= 1, so no migration is needed. There is no tier 1 because there cannot be: `reportFor`
divides by three points per graded work order and the cheapest close is a bronze at one of three,
so **33.3% is the exact floor** of any graded record.

**An optional new save field needs no `SAVE_VERSION` bump** — every earlier save already satisfies
the shape, so there is nothing for a migration step to do. A bump is for *required* fields.

## 8. Visual Language

- Top-down grid. **Tile size 48px**, integer scaling, `imageSmoothingEnabled = false`.
- Palette (define in `tokens.css`, use everywhere):
  - `--bg-void: #0a0e14`  `--bg-panel: #121820`  `--bg-raised: #1b2430`
  - `--ink: #c9d5e3`  `--ink-dim: #6a7a8c`
  - `--accent: #35e0c8` (cyan — player/active)  `--accent-2: #ffb020` (amber — warnings/goals)
  - `--danger: #ff5d5d`  `--ok: #7ee06a`
  - `--gold: #ffd166`  `--silver: #c0cbd8`  `--bronze: #cd8b52`
- UI chrome is a corporate terminal: thin 1px borders, monospace for anything numeric, a very
  subtle scanline overlay that must not hurt to read, no bloom, no CRT curvature.
- Fonts: `JetBrains Mono` for code/data, `Inter` for prose. Self-hosted in `public/fonts/`.
- Bots animate: smooth interpolated movement between tiles, a squash on stop, a bobbing antenna, a
  directional headlight cone, tread marks, a sparkle when harvesting.
- Every action emits an FX event; the renderer owns a small particle system.

**One lamp, due north-west, and it never moves.** Board and desk chrome obey the same one. The
numbers are in `src/render/art/deepsite.ts`; copy a neighbouring drawable rather than re-deriving
them. Six rules are not visible from that file and are the ones to know:

- **`SHADE` (0.34, the bot's shadow) and `UMBRA` (0.32, terrain) are deliberately within a hair of
  each other.** Two visibly different shadow densities read as two lamps. Do not tidy them into one
  value and do not spread them apart.
- **A south face keys off the material's darkest tone, not its mid.** Keyed off the mid it comes
  out lighter than the top it belongs to on cave stone, which reads as a surface folding the wrong
  way.
- **The three obstacle classes are told apart by height, not hue** — wall and void rise `1.0`, rock
  and ore `0.85`, rubble `0.42`, against `SOLID_RISE = 0.20`. The distinction survives greyscale.
  Do not re-solve it with colour.
- **Nothing that carries a distinction may be drawn into the cached terrain layer**, because a cast
  shadow can fall on anything in that cache and on nothing above it. That is what keeps `w2-02`'s
  ripe, unripe and bare tiles tellable apart, and it is a level that is unsolvable otherwise.
- **A moving thing breaks that at runtime rather than at draw time.** A bot animating between cells
  really is on top of its neighbours mid-step, and can cover a crop at the moment a player is
  reading ripeness. Draw order does not help; anything that moves has to be designed against it.
- **Do not compute a shadow offset from the lamp's elevation.** "≈34°" is a gloss:
  `atan(0.20 / 0.28)` is 35.5° along one axis and 26.8° along the true diagonal. The usable form is
  `dx = dy = 1.4 × height`, equal on both axes — in CSS, a `box-shadow` whose x and y are the same
  number. 135°, not 148°.

Off the board, the edge and face depths in `deepsite.ts` are fractions of a 16-48 device-pixel tile
and read as ratios only while an element is small; past roughly a tile's size, switch to a fixed
1-3 device-pixel rule. **The alphas and colours carry over unchanged, and they are what makes it
read as the same lamp.** An arris is one hard rule plus a row of falloff, never a gradient.

Three things RENDER must draw, because a level's lesson is unreadable otherwise:

- **Plant growth stages as distinct overlays**, so maturity is readable at a glance. `w2-02` is a
  field of ripe, unripe and bare tiles and is unsolvable if a player cannot tell them apart.
- **All bots simultaneously with per-bot clocks in the trace viewer**, and a *blocked* move
  visibly different from a successful one. Required by `w7-01` and `w7-03`.
- **How often each tile has been stood on, not merely that it has.** `w4-02`'s designed failure is
  a naive walker riding a loop until the shift ends, and a trail that saturates on the first visit
  draws the failing run and the passing one identically.

## 9. Directory Ownership

Agents own directories exclusively. Do not write outside your assigned paths.

```
src/engine/      sim, world, trace, rng, cost model            [FOUNDATION]
src/levels/      level defs, objectives, solutions, worlds      [CONTENT]
src/runtime/     worker, api surface, transpile, protocol       [RUNTIME]
src/render/      canvas renderer, sprites, camera, fx, tiles    [RENDER]
src/ui/          react app, panels, monaco, styles              [UI]
src/audio/       webaudio synth + sfx bus                       [POLISH]
src/game/        save, progress, scoring, glue store            [UI]
public/assets/   kenney tilesets                                [RENDER]
public/fonts/    self-hosted fonts                              [UI]
docs/            this file, plus notes                          [ORCHESTRATOR]
```

## 10. Non-Negotiables

1. `npm run build` and `npx tsc --noEmit` must be clean at every handoff. Zero TS errors.
2. No `any` in public interfaces. `unknown` + narrowing is fine.
3. The engine stays pure and testable in Node.
4. Solutions never ship to the client bundle and never appear in the UI, hint text, or console.
5. The game must be fully playable with keyboard; Run = `Ctrl/Cmd+Enter`.
6. It must not be possible to soft-lock the UI. A hung program is always recoverable.
7. Nothing may block the main thread for more than a frame.
