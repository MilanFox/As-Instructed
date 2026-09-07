# BOOTSTRAP — Design Contract

> **This document is the single source of truth.** Every agent reads it before touching code
> and must not contradict it. If you believe something here is wrong, report it to the
> orchestrator instead of silently deviating.

## 1. The Game

**Title:** `BOOTSTRAP`
**Tagline:** *or: How I Learned to Stop Worrying and Automate the Regolith.*

You are Contractor #4471, freshly hired by **Kessler & Daughters Terraforming Ltd.**, a company
whose safety record is described internally as "statistically interesting". You do not go to the
planets. You write the code that the planets' robots run. The robots are cheap. You are cheaper.

Tone: dry, tongue-in-cheek, corporate-dystopian-but-affectionate. Think *Portal* meets an
under-funded municipal works department. Never mean-spirited, never try-hard. Jokes live in
mission briefs, e-mails from management, and failure messages — **never** in API docs, which
stay clean and factual.

Genre: puzzle-programming game. Grid worlds, real TypeScript, deterministic simulation,
replayable traces, optimization scoring.

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

## 3. Execution Model (the core of the whole thing)

**Trace-based replay.** This is not negotiable and everything else depends on it.

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
 at whatever speed the player wants
```

Consequences you must respect:

- **The player's API is synchronous.** `move(Dir.North)` — no `await`, ever. This is a
  deliberate accessibility decision.
- The program runs to completion *before* a single frame is drawn. The renderer never talks to
  the sim; it consumes a `Trace`.
- **Scrubbing, rewind, step-forward/back, and speed control are free** and are required features.
- Runaway code is stopped three ways:
  1. `maxTicks` budget in the sim — every API call checks it and throws `HaltError` when exceeded.
  2. An op-count budget (`maxOps`) for loops that call the API but never advance ticks.
  3. A main-thread watchdog: if the worker does not report within `WORKER_TIMEOUT_MS` (default
     5000), `worker.terminate()` and surface "Your program did not halt." A tight `while(true){}`
     with no API call can only be caught this way.
- Runtime errors must be mapped back to the **user's** line/column. The transpiled JS is wrapped;
  subtract the wrapper offset before displaying. Show the failing line inline in Monaco.

## 4. Engine Contract

Directory `src/engine/` is pure logic. **It must not import React, DOM, canvas, or anything
browser-specific.** It runs in Node under Vitest unchanged.

### 4.1 Primitives

```ts
export type Vec = { x: number; y: number };
export const enum Dir { North = 0, East = 1, South = 2, West = 3 }
```

Grid: `x` grows East, `y` grows **South** (screen coordinates). North = `y-1`.

### 4.2 World

```ts
interface World {
  readonly w: number;
  readonly h: number;
  tiles: Tile[];            // row-major, index = y * w + x
  bots: Bot[];
  items: ItemStack[];       // loose items on the ground
  machines: Machine[];
  tick: number;             // global clock, integer
  rng: Rng;                 // seeded, deterministic
  vars: Record<string, number>;  // level-specific scratch state
}
```

`Tile` carries `terrain: Terrain`, optional `growth` state, optional `occupant`.
Everything is data — no methods, no classes with behaviour. The `Sim` operates on `World`.

### 4.3 Bots and virtual clocks

Every bot has its own clock: `bot.clock: number`. A blocking action advances **that bot's**
clock by the action's cost. In single-bot worlds this is indistinguishable from a global clock.

In multi-bot worlds (World 7+):
- Bots act independently; issuing `b1.move()` then `b2.move()` means both move in parallel.
- `sync()` advances every bot's clock to `max(clock)`.
- Collision rule: if bot A would enter a tile occupied by bot B at an overlapping time interval,
  A's move **fails and returns false**, costing `BLOCKED_COST` ticks. Resolution order is by
  ascending `(clock, botId)` — fully deterministic.
- The level's tick score is `max(bot.clock)` (makespan), which makes World 7 about parallelism.

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

### 4.5 Trace

```ts
type TraceEvent =
  | { t: number; botId: number; kind: 'move'; from: Vec; to: Vec; ok: boolean }
  | { t: number; botId: number; kind: 'turn' | 'harvest' | 'plant' | 'mine' | 'pickup'
      | 'drop' | 'use' | 'wait' | 'spawn' | 'die' | 'send'; ... }
  | { t: number; kind: 'print'; text: string; line?: number }
  | { t: number; kind: 'tileChange'; at: Vec; before: Tile; after: Tile }
  | { t: number; kind: 'objective'; id: string; state: 'met' | 'lost' }
  | { t: number; kind: 'fx'; at: Vec; fx: string };

interface Trace {
  initialWorld: World;      // deep snapshot, for replay from t=0
  events: TraceEvent[];     // sorted by t, stable
  keyframes: { t: number; world: World }[];  // every ~500 ticks, for fast scrubbing
  endTick: number;
}
```

Replay must be reconstructible purely from `initialWorld` + `events`. The renderer never
guesses. Keyframes are an optimization only.

### 4.6 Verdict

```ts
interface Verdict {
  passed: boolean;
  objectives: { id: string; label: string; met: boolean; progress?: [number, number] }[];
  failure?: { code: FailureCode; message: string; at?: Vec; line?: number };
  stats: { ticks: number; ops: number; seeds: number };
}
```

## 5. Level Contract

```ts
interface LevelDef {
  id: string;                    // 'w1-03', stable forever, used as save key
  world: number;                 // 1..8
  index: number;                 // order within world
  title: string;
  brief: string;                 // markdown, 2-3 lines of flavour + the actual ask
  facts?: { label: string; value: string }[];  // the numbers, drawn as a table
  hardware: string[];            // API names unlocked BY this level (cumulative)
  build(seed: number): World;    // must be pure & deterministic given seed
  objectives: Objective[];       // evaluated against final world + trace
  seeds: number[];               // ALL must pass. length > 1 => generalization required
  par: { ticks: number };        // the medal axis, and the only par there is — see §7
  starter: string;               // pre-filled editor content
  hints: string[];               // progressive, NEVER a full solution
  docs?: string[];               // extra doc page ids to surface
  bonus?: Objective[];           // optional challenge objectives -> extra medals
}
```

Rules for level authors:
- `seeds.length >= 3` from World 2 onward. Randomized worlds kill hardcoded solutions.
- Every level ships with a reference solution in `src/levels/**/__solutions__/<id>.ts`.
  These are **test fixtures only**, excluded from the production bundle by
  `vite.config.ts` and never reachable from the UI. Vitest asserts every level is solvable
  on every seed and that the reference solution's tick count is `<= par.ticks`.
- `par.ticks` must be *achievable but tight*: aim for reference solution ticks, then subtract
  ~10% so that a clever player is rewarded. It is the only par a level has (§7).
- `hints` are nudges ("What happens if the field is empty when you arrive?"), never code.
- `brief` is two or three sentences of roleplay and then the ask, capped at 110 words and tested.
  Every number, unit, budget, reach, dimension and wire format belongs in `facts`, in an objective
  label, or on the requisition card — somewhere it stays on screen while the player writes code.
  Players are frequently reading in a second language; prose is read once, a row can be re-read.

## 6. Progression — 8 Worlds

Progression is driven by **hardware unlocks**: you literally do not have `scan()` until the
level where you install the sensor. Each world's finale is a bigger multi-objective level.

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

33 work orders. Seven of the planned forty were withdrawn (docs/FIX-COMPRESSION.md,
docs/FIX-CONTENT.md), so a world is no longer five levels and `index` is ascending rather than
contiguous. World 8 has 4 large ones plus one true monster.

## 7. Scoring

**Medals are ticks-only.** `max(bot.clock)` against `par.ticks`: `<= par` gold,
`<= max(par + 1, par * 1.25)` silver, a pass is bronze. Nothing else moves a medal. The
`par + 1` floor exists because ticks are integers, so a par under four otherwise has an empty
silver band — `floor(3 * 1.25)` is 3. One rung is always reachable. See `docs/FIX-PAR.md` §7.

- **Ticks** (the medal axis): `max(bot.clock)`.
- **The information budget**: `Objectives.withinSenses(name, n)`. Sensing stays free in ticks;
  a level may make it *countable*. Rewards understanding, not typing.
- **Bonus objectives**: extra star. Weights unchanged (§11 A4): gold 3, silver 2, bronze 1,
  star +1, so the Performance Review tiers in `NARRATIVE.md` §7 are unaffected.

**Character count does not exist.** There is no char par, no char stat on a `Verdict`, no
`bestChars` in the save, and no function anywhere that measures the length of a player's program.
It is not scored, not ranked, not stored, and not displayed — not as a target, not as a personal
best, not as a neutral readout. A save written by a build that had one still loads; the retired
field is dropped on read and everything beside it survives.

Code golf is not a skill this game rewards. A verbose readable solution and a terse one that take
the same number of ticks get the same medal, deliberately.

### 7.1 Rewards

The reward systems are `src/game/achievements.ts` (commendations) and the `stats` block in
`src/game/save.ts` (runs, passes, fails).

**There is no streak.** There is no streak counter, no best streak, no field for either in
`CampaignStats`, and nothing anywhere that resets on a failed run. It is not scored, not ranked,
not stored, and not displayed. A reward whose only route is to stop pressing Run is a tax on the
loop this game is made of, and it is not coming back — see §11 A9. A save written by a build that
had one still loads; the retired field is dropped on read and everything beside it survives.

- **Nothing is gated behind a commendation**, ever. No level, hint, doc page, or hardware.
- **An aspirational commendation states its requirement before it is met. A retrospective one may
  stay hidden until it fires** (§11 A14). Something a player could aim at and miss has to be
  public; something that only notices what they already did cannot be failed.
- **Nothing may be lost by playing badly, and nothing may be earned by refusing to play** (§11
  A14). No first-try commendation, no flawless one, no streak, and nothing a player can lock
  themselves out of by experimenting.
- **The bar is whether a real person would smile or feel seen** (§11 A14). Attendance and
  completion are allowed; restating a medal already on the screen is not.
- **Failure costs nothing but time.** No penalty, no lost progress, no downgraded medal, no
  commendation taken back. A failed run increments a counter that exists only to reward
  persistence. A program that did not compile was never dispatched and does not even do that.
- **Hardware unlocks are a ceremony.** `Requisition` shows each new command once, with what it
  does and what it opens up. `seenRequisitions` in the save makes it once, ever.
- **Everything that plays on completion is skippable**: `prefers-reduced-motion` collapses it,
  `settings.celebrations` turns it off permanently, and a click finishes it immediately.

Medal totals earn a memo from management, escalating in passive aggression across four grades
and delivered once per grade on the site map. It had a whole screen until 2026-09-05; the screen
restated the site map and neither playtester opened it, so only the memo survives (§11 A8). The
grades are numbered 2–5 because the first was deleted once it was measured as unreachable and the
numbers are persisted (§11 A12).

## 8. Visual Language

- Top-down grid. **Tile size 48px**, integer scaling, `imageSmoothingEnabled = false`.
- Palette (define in `tokens.css`, use everywhere):
  - `--bg-void: #0a0e14`  `--bg-panel: #121820`  `--bg-raised: #1b2430`
  - `--ink: #c9d5e3`  `--ink-dim: #6a7a8c`
  - `--accent: #35e0c8` (cyan — player/active)  `--accent-2: #ffb020` (amber — warnings/goals)
  - `--danger: #ff5d5d`  `--ok: #7ee06a`
  - `--gold: #ffd166`  `--silver: #c0cbd8`  `--bronze: #cd8b52`
- UI chrome is a corporate terminal: thin 1px borders, monospace for anything numeric,
  subtle scanline overlay (very subtle — it must not hurt to read), no bloom, no CRT curvature.
- Fonts: `JetBrains Mono` for code/data, `Inter` for prose. Self-host in `public/fonts/`.
- Bots are drawn in code and must **animate**: smooth interpolated movement between tiles,
  a squash on stop, a little antenna that bobs, a directional headlight cone, tread marks,
  a sparkle when harvesting. Juice matters. This is the difference between a demo and a product.
- Every action emits an FX event; the renderer owns a small particle system.

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

---

## 11. Amendments (orchestrator rulings — these override §1–§10 where they conflict)

**A1 — Fuel is a real mechanic.** Every bot has `fuel: number` (default `Infinity`, so most levels
are unaffected). Acting consumes fuel equal to the action's tick cost; sensing is free. At zero
fuel an action throws `OutOfFuelError` (`FailureCode.OUT_OF_FUEL`). `refuel()` at a fuel depot
tile restores to max. Levels opt in via `World.bots[i].fuel` / `fuelMax`. The UI shows a fuel
gauge only when a level uses it. Required by w4-05 and w8-05.

**A2 — `link` gets a second home.** World 5's `link` hardware must be used by both `w5-04` and
`w5-05`, not the finale alone.

**A3 — Memory is explicitly documented.** The docs panel must state plainly that ordinary
JavaScript values (objects, `Map`, `Set`, closures) persist for the whole run, and that only
`mark`/`readMark` persist *in the world*. Several World 4 levels are unsolvable until the player
believes this.

**A4 — Medal weights are fixed:** gold 3, silver 2, bronze 1, bonus star +1. The Performance
Review tiers in `docs/NARRATIVE.md` §7 assume exactly this.

**A5 — Four cross-cutting requirements, owned as stated:**
- RENDER must draw plant growth stages as distinct overlays (needed by w2-02's `defuse`;
  originally written for the withdrawn w2-03, which w2-02 absorbed in the compression cut).
- RENDER must draw all bots simultaneously with per-bot clocks in the trace viewer, and must draw
  a *blocked* move visibly differently from a successful one (needed by w7-01 and w7-03).
- RENDER must show *how often* each tile has been stood on, not merely that it has. `w4-02`'s
  designed failure is a naive walker riding a loop until the shift ends, and a trail that
  saturates on the first visit draws the failing run and the passing one identically.
- ENGINE/RUNTIME must report resource spend (e.g. cable used) in `Verdict.stats` as a generic
  `spend: Record<string, number>` (needed by w5-05).

**A6 — `FailureCode.BLOCKED_LIVELOCK`.** When every bot in a multi-bot level has its move blocked
for N consecutive resolution rounds, fail with a dedicated code and a message that names livelock
explicitly. Silent livelock reads as an engine bug and will make players quit.

**A8 — The Performance Review is a memo, not a screen.** Deleted 2026-09-05. Its medal wall
restated the site map, which already shows points, closed count, medal counts, per-world totals
and `ALL AT PAR`; it was the second place in the game a completion fraction rendered; and neither
playtester opened it once. The memo survives and is delivered on the site map, once per grade,
through the same ceremony as `Requisition` and `RepositoryIssue`. Delivery is keyed to the grade
reached, not to a change of grade: under the medals-only denominator a player's first gold reads
100%, so "on change" oscillates across the top boundary and re-issues the same memo. This
overrides §7's description of a review screen.

**A7 — A level may be ungraded.** `LevelDef` gains `graded?: boolean`, default `true`. An ungraded
level shows `CLOSED` on a pass, has no medal ladder, and is still worth 3 points. This overrides §7,
which assumes every level carries a medal.

The criterion is measured, not editorial: **can any correct program cost fewer ticks than another
correct program?** Where it cannot, the route is forced, and par is not a budget — it is the cost of
the only solution the level admits. A medal ladder there teaches the player the grade is noise, and
they learn that exactly where the grade is about to start carrying information.

The set, measured by driving a *lazy* and a *smart* program through the harness on every seed:
**`w1-01`, `w1-03`, `w5-02`, `w6-01`, `w6-03`, `w6-05`.** World 2 stays graded in full — on
`w2-05` a lazy route genuinely costs more than a smart one, which is why its par moved instead.
`w2-01` was measured the same way and reached the same answer; it has since been withdrawn
(docs/FIX-CONTENT.md).

`w2-04` is the case that fixes the criterion's wording. Ticks there cannot tell lapping from
waiting, so the clock cannot see the lesson — but it still graded both testers at 63 against par
52, and the veteran's silver-to-gold rewrite was the best moment of his first ninety minutes.
**"The clock cannot see the lesson" is not "the clock cannot grade."** Only the second ungrades a
level.

**A9 — The streak is deleted, and the commendation list is five.** Ruled 2026-09-06. **The second
half is superseded by A14; the streak half stands and is not up for revisiting.**

The streak was removed earlier and §7.1 went on describing it, which left the binding document
instructing the next agent to rebuild the anti-feature. This amendment is the record, because §11
is what agents are told overrides everything: **there is no streak, and nothing in this game may
reward a player for not pressing Run.**

The commendation list was fifteen and is now five: `second-look`, `raised-again`,
`came-back-for-it`, `minimal-observation`, `repository`. Both playtesters reported the layer
changed their behaviour zero times, and a reward nobody responds to is a list with a maintenance
cost. The test each survivor passes, and any proposed sixth must pass:

> **Does it name a specific thing the player did, that they would be pleased to have noticed?**

Attendance ("close your first work order"), completion ("close every order in a world") and any
restatement of something already on the screen (a gold, a star, a personal best) fail it. Two of
the five pay for the loop the game is made of — run, fail, read, revise — and that is deliberate:
they replaced the streak and they point the other way.

**No commendation reads a medal.** `RunFacts` carries no medal, no ticks and no par, so an ungraded
work order (A7) cannot break one. Reintroducing a medal-keyed commendation reintroduces that bug.

**Retired commendation ids are dropped on read** by `rescueAchievements` in `save.ts`, the same
whitelist pattern that drops a medal from a level that no longer carries one. An id this build does
not recognise is *kept*, not dropped — it belongs to a newer build, and a downgrade must not eat a
player's record.

**A11 — The campaign is not a single file.** Ruled 2026-09-06. Closing a work order opens the
**next two**, and closing a world opens the whole of the next world. `isLevelUnlocked` in
`src/game/store.ts` is the one place that decides it.

Strictly N−1 made all 33 joins single points of failure. A stuck player's only legal action was to
keep grinding the same order; the hint ladder is the only other escape and it ends. Both playtests
land on this from opposite directions — the veteran asked for a skip door, the beginner spent 55
minutes and 11 runs on one order and stopped. **Not yet succeeding must never be able to close a
door.**

The teaching order survives because the entitlement is bought with closes: reaching World 5 still
means closing most of World 4. What the gate is *not* allowed to do is be the campaign's only
failure mode.

The requisition ceremony is delivered cumulatively for this reason — `openLevel` offers every
unsigned command in the order's API surface, not only the ones the order itself adds. A player who
skipped the level that granted `scan` still gets the card, because the scope they run against was
cumulative all along.

**A10 — A blocked move is priced once, in ticks.** Ruled 2026-09-06. `move` returning `false` is a
free sensing channel the game teaches deliberately (`w1-01`'s own hint sells bump-and-turn as a
real, slightly-expensive strategy), and the blocked move's tick cost is the correct, proportional
price for it. Nothing else may charge for it a second time. The `NO CONTACT REPORTED` commendation
did, and is gone; the remaining bonus objectives that pay a star for zero blocked moves are on
notice and are named in `docs/FIX-INCENTIVES.md` §4. A binary all-or-nothing reward for the
*non-occurrence* of an error signal is jointly satisfiable with an information budget only by
already knowing the layout, which is hardcoding — the exact behaviour multi-seed levels exist to
prevent.

**A12 — The Performance Review is four grades, numbered 2 to 5.** Ruled 2026-09-06. Tier 1
`DEVELOPING` (0–24%) was deleted because it was measured unreachable: `reportFor` divides by three
points per graded work order and the cheapest close is a bronze at one of three, so **33.3% is the
exact floor** of any graded record and nothing could ever land below 25. Tier 2 was checked as well
and is *not* unreachable — all-bronze is 33.3%, inside its band, and it is where every player who
scrapes a pass begins — so the honest ladder is four, not three. `CONSISTENT WITH EXPECTATION`'s
`min` went 25 → 0 and **no band moved for any reachable percentage**.

**The surviving ranks keep the numbers 2, 3, 4, 5, and renumbering them 1–4 is a bug, not a
tidy-up.** `save.reviewedRanks` persists which memos have been sent. Renumbering re-points every
existing save at the wrong memo and withholds one the player has never read, which is a worse
outcome than a gap in a sequence no player ever sees. `rescueRanks` accepts any integer ≥ 1, so no
save shape changes and no migration is needed.

**A13 — A budget declares its unit; it is not parsed back out of its own prose.** Ruled 2026-09-06.
`Objective.meter` and `Objective.unit` exist in `src/engine/objectives.ts`, `BudgetMeter` is
declared there once and aliased by `src/game/budgets.ts`, and `meterFor` / `budgetFor` prefer a
declaration over the label. Label parsing survives only as a fallback for objectives that have not
declared. **A new objective whose progress counts anything must declare its meter**, so that its
label is free to say whatever reads best; `src/game/__tests__/budget-declarations.test.ts` pins the
set that still infers, and the correct direction for that set is down.

**`Objectives.custom` can declare one, as of 2026-09-06.** `CustomReport` carries `meter?` /
`unit?` and `custom()` forwards them onto the options it already passes to `define`, which closes
the gap this amendment was originally written around. **The rule above now binds every objective in
the campaign, not only the engine-minted ones**, and `budget-declarations.test.ts` pins the set that
still infers at **empty** — the correct direction for that set was down and it reached the floor.
`docs/FIX-PAR-REPAIRS.md` §4.

The fallback parse stays. It is what makes an objective that forgot to declare read out
approximately right instead of silently not scoring, and deleting it would trade a loud guess for a
quiet nothing. What it may not be again is load-bearing for anything that ships.

One interim rule survives the unblocking, because it was never about the parser:

- **Omit `progress()` rather than ship a bar pointed at the wrong meter.** Where the honest quantity
  is not a run-wide total — `w7-02`'s heaviest single bot's share, for instance — a progress bar the
  readout attributes to a run-wide meter is the `6 / 1 pickups` bug, and no bar beats a wrong bar.
  A declared meter answers "which total", not "is there one".

**A14 — A commendation is a fist-bump, not a lever. The list is twenty-eight.** Ruled 2026-09-07.
Supersedes A9's second half.

A9 cut the list to five on the ground that fifteen changed both playtesters' behaviour zero times.
The measurement was right and the criterion was wrong. **"Did it change the player's behaviour" is
not the test for an achievement**, because behaviour modification was never the job: a commendation
is the one place the developer speaks directly to the player. Judged as a lever every entry fails,
including the five that survived, and the five that survived read as placeholders for a mechanic —
structurally sound and emotionally inert. The bar is now:

> **Would a real person, reading this line at the moment it appeared, smile or feel seen?**

Merely being accurate does not clear it. Attendance is allowed, and so is completion in small
quantities — no more than about a fifth of the list may be "do all of X". The one prohibition kept
from A9 is **restating something already on the screen**: if the certificate says GOLD, a
commendation saying "you got gold" is noise.

**A9's public-requirement rule splits.** It holds for *aspirational* commendations — anything a
player could set out to do and miss — because a secret one of those is a thing you find out you
failed at. It does not hold for *retrospective* ones, which notice something already done and
therefore cannot be failed: either it fires, or the player never learns it existed and loses
nothing. `Achievement.hidden` marks the second kind, `CommendationShelf` keeps them off the shelf
until they fire, and they are where the jokes live.

**The polarity rule is new and it outranks the categories.** *Nothing may be lost by playing badly,
and nothing may be earned by refusing to play.* No first-try commendation, no flawless one, no
streak, and nothing a player can permanently spoil for themselves by experimenting. A reward for
never being wrong teaches a player to hesitate before dispatching, and dispatching is the entire
activity — this is A9's streak finding generalised, and it is why `AS PER THE BRIEF` is not coming
back under another name. `second-look` and `raised-again` pay for persistence through failure and
set the polarity for everything added beside them.

**`RunFacts` regains `ticks`, `ops` and a nullable `parTicks`, and still carries no medal.** A7's
hazard was never par as such; it was a commendation that assumed every work order has a ladder.
`parTicks: number | null` is that assumption made checkable, and the two entries that read it
decline on `null` rather than dividing by it. A medal stays out because A9's surviving prohibition
puts it out: it is already on the screen.

**Two things A9's neighbours forbid, and they still forbid them.** Nothing may score, rank or
remark on the length of a player's program (§7, `docs/FIX-CHARCOUNT.md`) — a commendation for a
short solution is code golf with a seal on it. And nothing may pay a second time for a move that
was not blocked (A10) — the tick cost is the whole price.

**Retired ids are never reissued.** `sector-nominal` and `sector-gold` both read a medal and stay
retired; the sector entries in the new list are keyed to closes and stars under new ids, because
`rescueAchievements` would award a retired id on the run and drop it on the next load.

**The two save fields the list needed arrived without a `SAVE_VERSION` bump**, which is the version
rule holding rather than bending: `firstRunAt` and `routineOrders` are both optional, so a save
written by any earlier build already satisfies the shape and there is no step for a migration to
perform. Version 2 added three *required* fields, which is what a step is for.
