# DESIGN — the binding contract

> Every rule here is currently true and stated once. Nothing may contradict it. If a rule looks
> wrong, report it rather than deviating silently. Sections are cited from source comments by
> number (`DESIGN.md §7`), so renumber one only by repointing every citation to it.

## 1. The Game

**BOOTSTRAP.** The player is Contractor #4471 at **Kessler & Daughters Terraforming Ltd.** They
never go to the planets; they write the code the planets' robots run. Puzzle-programming: grid
worlds, real TypeScript, deterministic simulation, replayable traces, optimization scoring.

Tone is dry, corporate-dystopian, affectionate, never mean-spirited. **Jokes live in mission
briefs, management e-mail and failure messages. API docs stay clean and factual.** Voice is
specified in `docs/NARRATIVE.md`.

## 2. Settled Technical Decisions (do not re-litigate)

Versions live in `package.json`. What is not discoverable there is the prohibitions:

- **No Tailwind and no CSS framework.** Plain CSS, design tokens in `src/ui/styles/tokens.css`.
- **Canvas2D only** — no WebGL, no Pixi. Units and FX are drawn in code, not sprites; tiles are
  Kenney.nl CC0 packs committed under `public/assets/`.
- **No audio asset files.** WebAudio, synthesized in code.
- **The player writes real TypeScript**, transpiled in-browser by Monaco's TS worker.
- **The sim runs inside the Web Worker.** Deterministic, seeded, integer-tick.
- **i18n is out of scope permanently.** English only, strings inline.
- Persistence is `localStorage` plus JSON export/import.

## 3. Execution Model

**Trace-based replay.** Everything else depends on it.

- **The player's API is synchronous.** `move(Dir.North)` — no `await`, ever. Deliberate
  accessibility decision.
- The program runs to completion in the worker *before* a frame is drawn. The renderer never talks
  to the sim; it consumes a `Trace`.
- **Scrubbing, rewind, step, and speed control are required features** and are free.
- A main-thread watchdog terminates the worker after `WORKER_TIMEOUT_MS`. It is the only guard that
  catches a tight `while(true){}` with no API call in it; the budgets that catch the rest are in
  `docs/ENGINE.md` §7.
- Runtime errors map back to the **user's** line and column: the transpiled JS is wrapped, so
  subtract the wrapper offset before displaying, and show the failing line inline in Monaco.

## 4. Engine Contract

`src/engine/` is pure logic. **It must not import React, DOM, canvas, or anything
browser-specific.** It runs in Node under Vitest unchanged.

### 4.1 Primitives

Grid: `x` grows East, `y` grows **South** (screen coordinates); North is `y - 1`. Tiles are
row-major, indexed `y * w + x`.

`Dir`, `Terrain`, `ItemKind`, `MachineKind`, `FailureCode` and `Medal` are **frozen objects plus a
union type, never TypeScript enums** — a `const enum` erases at build time and the player's
transpiled program needs `Dir` as a real runtime value.

### 4.2 World

`World` is the whole simulated site and **everything in it is data** — no methods, no classes with
behaviour. `Sim` operates on it. `World.vars` is a scratch record for level-specific state.

### 4.3 Bots and virtual clocks

Every bot has `bot.clock: number`. A blocking action advances **that bot's** clock by the action's
cost. In single-bot worlds this is indistinguishable from a global clock.

Multi-bot worlds (World 7+):

- Bots act independently; `b1.move()` then `b2.move()` means both move in parallel.
- `sync()` advances every bot's clock to `max(clock)`.
- If bot A would enter a tile occupied by bot B over an overlapping interval, A's move **fails and
  returns false**, costing `BLOCKED_COST` ticks. Contention resolves by issue order
  (`docs/ENGINE.md` §3).
- The level's tick score is `max(bot.clock)` (makespan), which is what makes World 7 about
  parallelism.

### 4.4 Commands and cost model

Sensing is **free** (0 ticks) and acting costs ticks. The default table is `src/engine/costs.ts`,
overridable per level via `LevelDef.costs`.

**A blocked move is priced once, in ticks, and nothing may charge for it again.** `move` returning
`false` is a sensing channel the game teaches deliberately, and the tick cost is the whole price. A
reward for the *non-occurrence* of an error signal is jointly satisfiable with an information
budget only by already knowing the layout, which is hardcoding, which is what multi-seed levels
exist to prevent.

**Fuel is a real mechanic**, opt-in per bot and defaulting to `Infinity` so most levels are
unaffected. Acting consumes fuel equal to the action's tick cost; sensing is free. `refuel()`
restores to max, burns nothing, and only succeeds on a fuel-depot tile. The UI shows a fuel gauge
only where a level uses it. Mechanics in `docs/ENGINE.md` §3a.

### 4.5 Trace

A trace is `initialWorld` (a deep snapshot), `events` sorted by `t` with a stable sort, `keyframes`
every ~500 ticks, and `endTick`.

**Replay must be reconstructible purely from `initialWorld` + `events`. The renderer never guesses,
and keyframes are an optimisation only.**

### 4.6 Verdict

**`stats.spend` is generic resource accounting** — cable used, and anything a later level meters the
same way. Commands and levels populate it via `Sim.spend`; it is merged worst-case per resource
across seeds.

**`FailureCode.BLOCKED_LIVELOCK` exists and must be used.** When every bot in a multi-bot level has
its move blocked for N consecutive resolution rounds, fail with that code and a message naming
livelock explicitly. Silent livelock reads as an engine bug and makes players quit.

Failure codes are spelled in `SCREAMING_CASE`.

## 5. Level Contract

`LevelDef` is declared in `src/levels/types.ts`. `id` is stable forever — it is the save key.
Rules for level authors:

- `seeds.length >= 3` from World 2 onward, and **all** of them must pass. Randomized worlds kill
  hardcoded solutions.
- Every level ships a reference solution in `src/levels/**/__solutions__/<id>.ts`. These are test
  fixtures only, excluded from the production bundle by `vite.config.ts` and unreachable from the
  UI.
- `hints` are progressive nudges ("What happens if the field is empty when you arrive?"), never
  code, never a full solution.
- `brief` is two or three sentences of roleplay and then the ask. **Every number, unit, budget,
  reach, dimension and wire format belongs in `facts`, in an objective label, or on the requisition
  card** — somewhere it stays on screen while the player writes code. Players are frequently
  reading in a second language; prose is read once, a row can be re-read.
- **A new objective whose progress counts anything must declare its `meter`.** Parsing the unit back
  out of the label survives only as a fallback so that an objective which forgot to declare reads
  out approximately right instead of silently not scoring; nothing that ships may depend on it.
- **Omit `progress()` rather than ship a bar pointed at the wrong meter.** Where the honest quantity
  is not a run-wide total — `w7-02`'s heaviest single bot's share, for instance — a bar the readout
  attributes to a run-wide meter is worse than no bar.

**The docs panel states plainly that ordinary JavaScript values — objects, `Map`, `Set`, closures —
persist for the whole run, and that only `mark` / `readMark` persist *in the world*.** Several
World 4 levels are unsolvable until the player believes this, so the Memory page is always
rendered and never behind a filter.

**State never reads as "nothing happening" for a reason the player cannot see.** A timer, delayed
start, or staged mechanic must be named and exposed through both the API and the render — never
left to look identical to zero progress or bare ground until someone happens to hover it. The one
exception is where withholding the information *is* the puzzle (not revealing the other seeds'
ripening order up front, for instance) — that is a design choice about the puzzle's question. An
implementation detail leaking through as unexplained silence is a bug. `w2-04`'s `sproutsIn` is the
worked example: a crop can sit at `growth: 0` for dozens of ticks before its clock starts, and both
`scan()` and the tile render say so.

## 6. Progression — 8 Worlds

Progression is driven by **hardware unlocks**: the player does not have `scan()` until the level
that installs the sensor. World names, themes and accents are `WORLDS` in `src/levels/index.ts`;
what each world teaches and unlocks is `docs/CURRICULUM.md` §3–§10.

The campaign is 33 work orders. A world is not five levels and `index` is ascending rather than
contiguous. World 8 is four large orders plus one monster. Each world's finale is a bigger
multi-objective level.

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
evidence of a thing done over one that requires the absence of a thing done. A bonus with an exact
acceptance string (`weak <id> <n>`, `bad <packet> <byte>`) is reliably earned; one phrased as a
comparison ("best order", "fewest trips") is reliably missed and gives the player no feedback.

**The vacuously-true predicate is the defect class to watch for.** A predicate that measures a
maximum, an absence or an exclusion is true of a program that never attempts the level, unless it
also checks the level's required objective. A predicate that measures a produced artefact — a
report, a trail, an ordering — cannot be. **Test a candidate by running `print('.')` and nothing
else against it.** `w6-02`'s `name-the-fault` is vacuously true on seed 2 by design, because `build`
sets the corruption rate to zero there; it is harmless because a failed run banks no star.

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
  first-try commendation, no flawless one, no streak — a reward for never being wrong teaches a
  player to hesitate before dispatching, and dispatching is the entire activity.
- **The bar for a commendation is whether a real person, reading the line at the moment it
  appeared, would smile or feel seen.** Merely being accurate does not clear it. Attendance is
  allowed and so is completion in small quantities — no more than about a fifth of the list may be
  "do all of X". **Restating something already on the screen is prohibited**: if the certificate
  says GOLD, a commendation saying "you got gold" is noise.
- **An aspirational commendation states its requirement before it is met; a retrospective one may
  stay hidden until it fires.** Something a player could aim at and miss must be public.
  `Achievement.hidden` marks the second kind, `CommendationShelf` keeps them off the shelf until
  they fire, and they are where the jokes live.
- **`RunFacts` carries no medal.** A medal is already on the screen. Its `parTicks` is nullable
  because an ungraded order has no ladder; the entries that read it decline on `null` rather than
  dividing by it.
- **Retired commendation ids are never reissued.** `rescueAchievements` in `save.ts` drops them on
  read, so a reissued id would be awarded on the run and dropped on the next load. An id this build
  does not recognise is *kept*: it belongs to a newer build, and a downgrade must not eat a
  player's record.
- **Failure costs nothing but time.** No penalty, no lost progress, no downgraded medal, no
  commendation taken back. A failed run increments a counter that exists only to reward
  persistence. A program that did not compile was never dispatched and does not even do that.
- **Hardware unlocks are a ceremony.** `Requisition` shows each new command once, ever.
- **Everything that plays on completion is skippable**, by reduced-motion, by a permanent setting,
  and by a click.

**The Performance Review is a memo, not a screen.** It is delivered on the site map, once per
grade, through the same ceremony as `Requisition` and `RepositoryIssue`. Delivery is keyed to the
grade reached, not to a change of grade: under the medals-only denominator a player's first gold
reads 100%, so "on change" oscillates across the top boundary and re-issues the same memo. Nothing
may rebuild it as a screen.

**The review is four grades, numbered 2 to 5, and renumbering them 1-4 is a bug.**
`save.reviewedRanks` persists which memos have been sent, so renumbering re-points every existing
save at the wrong memo and withholds one the player has never read. There is no tier 1 because
there cannot be: `reportFor` divides by three points per graded work order and the cheapest close
is a bronze at one of three, so **33.3% is the exact floor** of any graded record.

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
- **A crop tile whose growth clock has not started yet, distinct from bare soil and from stage 0.**
  Otherwise `w2-04`'s staggered ripening reads as "nothing planted here," which §5's information
  rule forbids.
- **All bots simultaneously with per-bot clocks in the trace viewer**, and a *blocked* move
  visibly different from a successful one. Required by `w7-01` and `w7-03`.
- **How often each tile has been stood on, not merely that it has.** `w4-02`'s designed failure is
  a naive walker riding a loop until the shift ends, and a trail that saturates on the first visit
  draws the failing run and the passing one identically.

## 9. Directory Ownership

Agents own directories exclusively. Do not write outside your assigned paths.

## 10. Non-Negotiables

1. `npm run build` and `npx tsc --noEmit` must be clean at every handoff. Zero TS errors.
2. No `any` in public interfaces. `unknown` + narrowing is fine.
3. The engine stays pure and testable in Node.
4. Solutions never ship to the client bundle and never appear in the UI, hint text, or console.
5. The game must be fully playable with keyboard; Run = `Ctrl/Cmd+Enter`.
6. It must not be possible to soft-lock the UI. A hung program is always recoverable.
7. Nothing may block the main thread for more than a frame.

---

## 11. Perfect Information

This is a puzzle game about writing code. The puzzle is always *how do I make this work*, never
*what is that even*. A player who reads the brief, the fact cards and the API docs has been told
everything the level grades. Difficulty comes from the problem being hard to solve, never from
the problem being hard to see.

1. **Every graded thing is stated.** If an objective or a bonus checks it, the player-facing text
   names it. A mechanic that only surfaces on failure is a bug in the level, not a difficulty
   knob.
2. **Explain it or cut it.** A rule that is hidden and load-bearing gets stated in the brief or
   facts. A rule that is hidden and carries no weight gets deleted. Nothing stays hidden merely
   because it is small.
3. **Hints are not the premise.** A hint sharpens an idea the player already has the pieces for.
   If the *only* statement of a graded rule lives in a hint, the fact cards are incomplete.
4. **Seeds catch laziness, not the player.** Later seeds exist to refuse hardcoded answers — a
   memorised constant, a fixed path, an assumption read off seed 1. That is fair: the run was
   lazy and got caught. What is never fair is a later seed introducing a *rule* seed 1 gave no
   reason to expect. Seeds may differ in their numbers and in which case they exercise; they may
   not differ in what the level is about.
5. **Seed 1 is representative, not degenerate.** Per CURRICULUM §15 seed 1 is the friendliest
   instance, and friendly means *the honest general solution works*. A seed 1 on which a wrong
   general rule also happens to pass teaches the wrong rule to every player who starts there.
   Degenerate cases (§2 rule 3) belong later in the list. Generators must reject a seed-1 draw
   that a lazy answer would satisfy — see `w3-01`'s `rowsMatch` redraw.
6. **The divergence says what, not why.** Naming the tile, the value or the missing line is
   information the player is owed. The *reason* it is wrong is the puzzle and stays theirs.
7. **A mechanic ships on three legs, or it does not ship.** Anything the player is expected to
   discover and work with needs all three:
   - **A reason in the fiction.** It is a thing in the world with a name, not an implementation
     detail leaking through.
   - **A form on the board.** The renderer is player-facing text exactly as the brief is. The
     player never reads a tile that draws as plain floor while carrying state that matters, and
     never has to `print()` a value to find out what the level contains. If a mechanic exists and
     the preview cannot show it, that is a missing sprite, not a puzzle. §8 Visual Language owns
     the vocabulary any new state has to join.
   - **A way to reach it in code.** If solving the level requires knowing a value, the API returns
     that value. A player cannot write software against state they can only see.

   The precedent is `w2-04`: the sim planted crops in the future, the board drew `0/8` for several
   ticks, and `0/8` is indistinguishable from nothing happening — the level expected the player to
   find plants that had not been planted yet. The fix was all three legs at once. The delay got an
   in-lore name, `sproutsIn`; it was drawn on the tile; and it was exposed in the API.

   None of this makes a level easy. Levels are meant to be hard, and the puzzle is not given away
   — a player still has to work out what to *do* with `sproutsIn`. What may never be missing is
   direct information the solution depends on.
9. **A limit is a mechanic, not a secret.** Constraining what a bot can sense — a scan that
   reaches one tile, an information budget, a sensor that reads only the tile underneath — is
   level design, and good level design. The player knows the limit exists, knows its shape, and
   plans around it; that is the puzzle. What §11 forbids is different: state the player has no way
   to learn *and* no way to know is there. "You may only see one tile ahead" is fair. "There was a
   rule here you were never told about" is not. State the limit, draw its edge (§11.8), and the
   restriction is honest.
8. **Hidden state is drawn as hidden.** Where a level withholds information on purpose — the
   exception below, or a later gimmick — the preview shows a *known unknown*: a fogged tile, an
   unread packet, a sensor edge. "I cannot know what is here, and the level means me not to" is
   perfect information. A blank the player cannot tell from empty floor is not.

The single exception: withholding information is allowed when uncovering it **is** the level's
stated question — `w5-02`, where sensing is the mechanic, and `w8-01`, where re-sensing replaces
remembering. In both the brief says so. "The player has to discover the rule by failing" is not
an instance of this exception, and neither is "the player can find it with `print()`" — a console
the player drives themselves is a debugger, not the game telling them anything. What a level is
*about* is legible from the board and the brief before a single line is written.
