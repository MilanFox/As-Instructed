# FIX-BONUSES — making the early star failable

Worlds 1–3. The defect: a playtester earned eight bonus stars through `w2-05` and attempted zero
of them, because every early bonus is satisfied automatically by any solution that passes the
level. The target shape is `w4-02`'s mark budget: a constrained *resource* that forces a smarter
algorithm rather than a fiddlier one.

Scope narrowed by the orchestrator after the second playtest. Levels slated for cut or merge are
untouched: `w1-01`, `w1-02`, `w1-04`, `w2-02`, `w2-03`, `w3-03`, `w3-05`. Eight levels were
reworked: `w1-03`, `w1-05`, `w2-01`, `w2-04`, `w2-05`, `w3-01`, `w3-02`, `w3-04`.

Character count is not scored, measured, or mentioned by any bonus here. No par value, medal
threshold or medal weight was changed.

---

## w1-03 — Length Unknown: ration the sensor, cap the waste

**Before.** `noBlockedMoves` — "Reach the pad without one blocked move". The intended solution
(`while (canMove(Dir.East)) move(Dir.East)`) never bumps anything, so the star was awarded for
solving the level. Free on all three seeds.

**Now.** One objective, one star: `Use canMove at most 7 times and waste at most 5 steps`
(`rationedSurvey(7, 5, …)` in `src/levels/world-1/shared.ts`). Two clauses:

1. `canMove` is read at most **7** times over the run (counted from the trace with `senseTotals`).
2. `trace.endTick` is at most **5** ticks over the shortest route, which is `manhattan(start, pad)`
   derived from `initialWorld` — no length is hardcoded.

**Why it is a different idea.** The per-tile loop asks the sensor once per tile: 19 / 25 / 8 reads
on seeds 1 / 4 / 7, so it blows clause 1 on every shift. The blind counted loop asks nothing and
lets the far wall collect every tile the corridor turned out not to have: 7 / 1 / 18 wasted ticks
for a 25-step run, so it blows clause 2 on the reported seed and on the short one. The star sits
between them, on the stride: check once, then take *k* steps on that one reading. That is a trade
of information against time and the seed of galloping search — not a tighter version of the loop.

**Calibration** (measured with a throwaway driver over the declared seeds `[1, 4, 7]`; shortest
route `d` = 18 / 24 / 7, corridor lengths 19 / 25 / 8):

| stride k | reads (s1/s4/s7) | wasted (s1/s4/s7) | inside 7 reads / 5 waste |
|---|---|---|---|
| 1 (naive) | 19 / 25 / 8 | 0 / 0 / 0 | no |
| 4 | 6 / 7 / 3 | 2 / 0 / 1 | yes |
| 5 | 5 / 6 / 3 | 2 / 1 / 3 | yes |
| 6 | 4 / 5 / 3 | 0 / 0 / 5 | yes |
| 7 | 4 / 5 / 2 | 3 / 4 / 0 | yes |
| 8 | 4 / 4 / 2 | 6 / 0 / 1 | no (waste) |
| blind 24/25/26 | 0 | 6/0/17, 7/1/18, 8/2/19 | no |

Four strides work; two of them (5 and 6) are *derivable before running* from the brief's new
guarantee that the bay is thirty tiles end to end: `ceil(29 / k) + 1 <= 7` gives `k >= 5`, and
`k - 1 <= 5` gives `k <= 6`. 7 and 5 were chosen so that the per-tile loop fails on all three
seeds, every blind constant that passes all three seeds (>= 24) fails on the reported seed, and no
single magic stride is being demanded.

**Low end.** A zero-`canMove` run does not get the star for free: clause 2 costs it. Proved.

**Brief.** Two paragraphs added: the log holds seven readings and lists every step that went
nowhere (five allowed), and — in Halloran's voice — "the bay is thirty tiles end to end and the
corridor has never run the whole of it. that much i will sign." A fourth hint says seven readings
have to cover up to twenty-nine tiles of driving. The tick par (24) is untouched.

**Proofs** (all in `src/levels/world-1/__tests__/world-1.test.ts`, `describe('bonus stars are
missable')`):
- earns it: `w1-03: striding earns the star on every seed, at either stride the brief allows` —
  driver `stride(k)` for k = 5 and 6, on every declared seed.
- misses it: `w1-03: asking before every tile passes the level and misses the star` — the shipped
  reference solution, which is the obvious answer, passes and is denied on every seed.
- low end: `w1-03: spending no readings at all does not buy the star either` — `blindRun(25)`
  passes the level with zero `canMove` reads and misses the star on the reported seed and the short
  one.
- documented second answer: `w1-03: reading the wall by driving into it is the other way through` —
  `while (move(Dir.East))` uses no readings and wastes exactly one tick, so it earns the star. It
  cannot be excluded: it is better than any stride on *both* axes, so any budget that admits a
  stride admits it. It costs a tick over the shortest route (25 on seed 4, i.e. silver rather than
  gold), and it is the same insight from the other side — a failed move is itself a reading. Left
  in on purpose and asserted, so it cannot regress silently.

**Residual hole, not fixable here.** `src/runtime/aggregate.ts` reports the *first* seed's
objectives when all seeds pass, so the star is scored on seed 1 alone (playtest §10 item 4). A
player who works out that seed 1's corridor is 19 tiles can write 18 blind moves and then one
`canMove` and take the star without striding. Every seed-1-reported bonus in the game has this
shape; nothing in this level can close it.

**Untouched:** par (24 ticks / 60 chars), medal thresholds, the reference solution, `w1-01`,
`w1-02`, `w1-04`, and `noBlockedMoves` / `shortestRoute`, which those levels still use.

## w1-05 — Floor Inspection: one move per floor tile

**Before.** `noBlockedMoves` — "Sweep the whole bay without one blocked move". A serpentine that
turns on `canMove` never bumps anything, so the star came with the pass on all four seeds.

**Now.** `Inspect the bay in no more than one move per floor tile` (`oneMovePerFloorTile` in
`src/levels/world-1/shared.ts`). The budget is `walkableTiles(initialWorld).length`, derived per
seed; the spend is every `move` event the run issued, blocked ones included. A sweep that enters
each tile once spends `tiles - 1`, so the budget leaves exactly one move spare — enough for the one
re-entry that a west half with an even number of rows *and* columns cannot avoid, and nowhere near
enough to drive back along a row that has already been inspected.

**Why it is a different idea.** The main objective is coverage; this is coverage *geometry*. The
sweep has to finish at the tile west of the doorway, which is the corner diagonally opposite the
start. A row serpentine ends there only when the bay has an odd number of rows; a column serpentine
ends there only when the west half has an odd number of columns. Which way you snake is decided by
the parity of the bay, and getting it wrong costs a walk back along the bottom row. That is a
second idea, not a tighter version of the first: the medal and the star ask different questions
(on the reported bay, the naive answer takes gold at 44 ticks against par 50 and still misses the
star by one move).

**Calibration.** Minimum re-entries per bay: 0 unless the west half is even × even, in which case
the colour argument on the grid makes 1 the floor. None of the declared bays is even × even, so
every one of them can be swept with no re-entry at all; the budget is set at one, per the rule that
a resource budget must not be zero where zero is sometimes impossible. Measured, in moves:

| seed | bay (w × h, partition) | west half (cols × rows) | tiles | budget | row serpentine | matched sweep |
|---|---|---|---|---|---|---|
| 21 | 8 × 6, col 4 | 3 × 6 | 43 | 43 | **44** ✗ | 42 ✓ |
| 1 | 9 × 5, col 5 | 4 × 5 | 41 | 41 | 40 ✓ | 40 ✓ |
| 2 | 9 × 6, col 4 | 3 × 6 | 49 | 49 | **50** ✗ | 48 ✓ |
| 6 | 8 × 5, col 5 | 4 × 5 | 36 | 36 | 35 ✓ | 35 ✓ |
| 8 | 6 × 7, col 3 | 2 × 7 | 36 | 36 | 35 ✓ | 35 ✓ |

**Seed list changed — flagging it.** Seed `21` was **added at the front**; nothing was removed, so
the list is now `[21, 1, 2, 6, 8]`. This was forced by measurement. `withBonus` in
`src/game/store.ts` scores the bonus against the trace `aggregate.ts` reports, which for a passing
run is the *first* seed's. Seeds 1, 6 and 8 all have an odd number of rows, so on all three the
naive row serpentine already sweeps with no re-entry — leaving the star free in the live game no
matter what the other seeds do. Seed 21 (8 × 6, partition at column 4) is the smallest bay in the
generator's range that makes the naive answer backtrack while keeping the reference solution inside
par (44 ≤ 50). Seed 2 backtracks too, but its reference run is *exactly* par at 50, which would
have made the star and the gold one tick apart. Every previously declared layout is still tested.

**Brief.** One Vance paragraph: the inspection is filed by tile-entries, not by tiles, and Head
Office has asked in writing why Bay 7 returns more entries than it has floor. A fifth hint says a
sweep that ends at the wrong wall has to drive back along a row it already inspected.

**Readout check** (`budgetFor`, verified by hand against a passing and a failing run): the label
carries the word "move", the count *is* the `move` event total rather than a subset of it, so the
rail reads `44 / 43 moves` and `over by 1 moves` on the failing bay and `35 / 36 moves` on a
passing one. No clamped or borrowed figure, and no `w3-01`-style mismatch.

**Proofs** (`src/levels/world-1/__tests__/world-1.test.ts`, `describe('bonus stars are missable')`):
- earns it: `w1-05: a sweep that matches the bay earns the star on every seed` — driver
  `combedSweep`, which sweeps row one (free either way) to learn how many columns the west half
  has, then either finishes the row serpentine (even count) or combs the half by columns (odd
  count). Uses nothing but `canMove`, `move` and `pos`. Spends exactly `tiles - 1` moves on all
  five seeds.
- misses it: `w1-05: the row serpentine passes and misses the star on the bay the game reports` —
  the shipped reference solution on seed 21: passes, takes gold, is denied the star. Plus
  `w1-05: the row serpentine only fits the bays with an odd number of rows`, which pins down
  exactly which seeds it does and does not earn.

**Honest caveat.** A single seed-independent program that never re-enters a tile needs a real
construction (`combedSweep` above), which is past World 1. What a *player* needs is smaller: on the
bay the game reports, swap the serpentine's axis. That is the second-or-third-attempt move the
brief asks for, and the meter names the cost in moves either way. The seed-1 reporting issue
(playtest §10 item 4) is what makes the reported bay the only one that matters for the star; it is
also why the seed order had to change.

**Untouched:** par (50 ticks / 420 chars), medal thresholds, the reference solution, `build()`,
`bayLayout`, and the required objective.

## w2-01 — The Sensor Package: stop when you already have the answer

**Was:** `shortestSurvey` — "Survey the row without a wasted move". Satisfied by walking out to the
far end and straight back, which is exactly what the obvious solution does. Free.

**Now:** `parkedWithoutOvershoot` — *"Park on the ripest crop without driving one move past it."*
The run's `endTick` must be no more than the distance from the bot's start tile to the target,
both derived from `initialWorld`.

**Why it is different thinking.** The main objective teaches "sensing is free, so read before you
act", and its answer reads the whole row, remembers the best, then walks back. The bonus asks a
different question: *when do you already know enough to stop?* A reading cannot exceed `maxGrowth`,
so a tile at its `maxGrowth` cannot be beaten and the search is over the moment the sensor reports
one. Early termination on a sufficient condition, rather than exhaustive maximum-finding.

**Legibility.** One line added to the brief in Halloran's voice states the fact and nothing else —
"`growth` never reads higher than `maxGrowth`. the sensor has no number for riper than finished".
Hint 2 previously asserted the opposite ("you cannot know which reading is the highest until you
have seen the last one") and was reworded. The readout is denominated in moves: the label contains
the word "move", so `budgetFor` resolves the meter to the `move` event kind and reports the real,
unclamped figure — `15 / 3 moves` on the naive run.

**Calibration** (from `world-2.test.ts`, all four seeds): distance to target 3, 9, 0, 5; the
reference solution spends 15, 9, 18, 13. It earns the star only on seed 2, where the target happens
to sit at the far end of the row. Seed 8 puts the target under the bot at tick 0, an allowance of
zero, and the objective is correct there rather than impossible. Seed 1 — the seed the report shows
— misses by 12.

**Proofs** (`src/levels/world-2/__tests__/world-2.test.ts`):
- earns it: `stopOnTheUnbeatableReading`, all four seeds.
- misses it: the level's own reference solution (`__solutions__/w2-01.ts`), seeds 1, 8 and 13.
- degenerate: a bot that never moves fails the level on seed 1.

## w3-04 — First In, First Out

**Was:** `no-staging` — *"Never set a crate down anywhere but the bay"*. Free. The obvious
survey-then-ferry answer never stages anything, so the star was awarded for the shape of the
solution the level already forces.

**Now:** `aisle-discipline` — *"Tread no more than 18 slots that started the shift empty"*.
Every successful move that lands on a rack-row tile which held no crate at the opening of the
shift is counted; the meter reads `used / 18 slots`.

**Why it is a different question.** The level's objective is *order*: hold a queue and service it
in arrival order. The bonus is about how the yard is *read*. Every rack row runs beside an aisle,
so a bot standing in an aisle can `scan(Dir.North)` and `scan(Dir.South)` and take both flanking
rack rows' stencils without entering them, and a slot only ever has to be entered to lift the
crate standing in it. This is the "read from the aisle" idea `w3-03` was carrying, and `w3-03` is
being cut. A budget of 0 is impossible: rows 4 and 5 are adjacent, but row 1 and row 8 are each
sealed off by two rack rows, so the racks must be crossed — unless a column happens to be stocked
in both crossed rows, which is exactly the thing worth looking for.

**Calibration** (measured, `src/levels/world-3/__tests__/world-3.test.ts`):

| seed | crates | best aisle round | aisle survey + straight-line ferry | reference (rack-walking survey) |
|---|---|---|---|---|
| 1 | 15 | **2** | 108 | 119 |
| 2 | 8 | **1** | 41 | 55 |
| 3 | 15 | **15** | 103 | 114 |
| 4 | 1 | **7** | 12 | 28 |

Budget **18** — three above seed 3, the binding seed, and far below anything that walks a rack row
to read it. Seeds 1 and 2 each hold a column stocked in both rows of a barrier (x=16 and x=13 on
seed 1, x=11 and x=12 on seed 2), which is why their minimum is near zero; seed 3 has no such
column in either barrier and pays 1 per crossing.

**Proofs** (`w3-04 — read the racks from the aisle`):
- `an aisle round ships the yard inside the slot budget on every seed` — `aisleRound`, which
  surveys the four aisle rows and routes every ferry leg by cheapest-in-slots-then-shortest.
- `the rack-walking survey ships the yard and blows the slot budget on every seed` — the shipped
  reference solution, which passes the level on all four seeds and misses the star on all four.
- `never reaching the outer aisles is cheap in slots and cannot ship the yard` — the degenerate
  low-count answer walks only rows 4 and 5, never reads rack rows 2 and 7, and fails `bay-cleared`
  on seeds 1–3. Stars are only banked on a passing run (`src/game/store.ts`), so it earns nothing.

**Meter check.** The label names no trace event kind and no sense, so `budgetFor` leaves the meter
unattributed and shows the objective's own figure; `unitFor` takes "slots" from the word after the
18. Verified by hand against `src/game/budgets.ts`: `3 / 18 slots` and `0 / 18 slots` under
budget, `119/18` when overrun. The label deliberately avoids "move", which would have made the
readout report the run's total moves.

## w2-04 — Capacity: the depot's freshness ledger

**Was:** `noFailedHarvests` — "Never swing at a hopper with no room in it". The reference solution
guards every swing anyway, so it was free.

**Now:** `withinSpoilage(18, …)` — *"Come back with no more than 18 spoilage on the sheet."* One
unit of spoilage for every tick a crop stood mature and unpicked, summed over the crops the seed
sowed; a crop never taken is charged to the end of the run, and the star also requires every crop
to have been taken at all.

**Why it is different thinking.** The main objective is interrupt-and-resume: break out of a sweep
when the hopper is full, come back later. The bonus is *scheduling* — be standing on the tile when
it comes ready, because the clock runs whether the bot drives or not and a lap of the plot arrives
late. The resume-sweep is 5–8 ticks late on nearly every crop; a run that watches the plot and
parks on whatever ripens next is 0 late on most of them.

**Why a total and not a worst case — measured, and the assigned design had to be adapted.** The
hopper leaves the depot full, so nothing can be harvested until something has been planted, and
that opening debt is fixed by the layout, not by the program. On seed 3 the only bare tile is two
moves from the start and the first crop is three moves from that, so the earliest possible first
harvest is tick 7 against a crop ripe at tick 0 — a floor of 7 that no program can beat. The
reference solution's worst lateness on that seed is 8. A *worst-case* threshold therefore has to
sit at exactly the optimum on seed 3 to separate at all, which violates CURRICULUM.md §2 rule 5
("never require optimality"). A total absorbs the opening debt and still separates.

A second measured limit: `Sim.harvest` refuses an unripe tile (`src/engine/sim.ts`, the `ready`
check), so early harvests are impossible and only lateness exists. And the plot does *not*
broadcast a full timetable — `maturity` clamps at zero, so a tile that has not started growing
reads 0 of 8 and stays there. The timetable arrives eight ticks at a time, which is why the star
driver re-reads and re-plans rather than sorting once. That also rules out a `withinSenses('scan')`
budget here: re-sensing is the level's method (CURRICULUM.md §2.1).

**Calibration** (`world-2.test.ts`, seeds 1–4). Total spoilage:

| | seed 1 | seed 2 | seed 3 | seed 4 |
|---|---|---|---|---|
| best reachable (exhaustive over service orders, free knowledge) | 5 | 4 | 15 | 5 |
| star driver `standOnEachCropAsItRipens` | 5 | 4 | 15 | 5 |
| reference resume-sweep | 24 | 30 | 29 | 14 |
| blind "wait 45 on everything" | ≫18 | ≫18 | ≫18 | ≫18 |

Threshold **18**. The star driver is under it on every seed and still takes gold on ticks
(42/34/40/36 against par 52). The resume-sweep is over on seeds 1, 2 and 3 — including seed 1,
which is the only seed the live game scores a bonus against (`src/runtime/aggregate.ts` reports the
first seed's objectives when all seeds pass). **Known leak:** on seed 4 the resume-sweep lands on
14 and would earn the star. Seed 4 has four crops on a wide ripening ladder, so a lap always
arrives in time; no threshold separates there, because seed 3's floor of 15 is above seed 4's
naive result of 14. It costs nothing in the live game and is recorded here rather than papered over.

**Legibility.** A line added to the brief in Vance's voice defines the unit: "The depot docks the
sheet for spoilage: one against the shift for every tick a crop stands ripe in the ground with
nobody on it." The label names the number and the unit, so the readout is `5 / 18 spoilage`. The
label deliberately avoids the words "tick", "harvest", "plant" and "move", each of which would make
`budgetFor` denominate the readout in the wrong meter (the `w3-01` defect, playtest §10 item 3);
the test asserts the resolved meter is `null` and the used figure is the spoilage, not the clock.

**Proofs** (`src/levels/world-2/__tests__/world-2.test.ts`):
- earns it: `standOnEachCropAsItRipens`, all four seeds, gold on ticks.
- misses it: the reference resume-sweep (`__solutions__/w2-04.ts`), seeds 1, 2, 3.
- second miss: `waitLongEnoughOnEverything`, a correct answer that never reads the plot, misses on
  all four seeds — so the star cannot be had by declining to use the sensor.

## w3-02 — Sorted by Colour

**Was:** `tight-round` — `withinTicks(298)`, *"Beat par by ten percent"*. A stopwatch on the medal
axis, and the source of PLAYTEST-BEGINNER.md §10 item 4: the results card showed `TICKS 402 · par
332` above *"Bonus met"*, because the medal takes the worst seed and the bonus is scored on the
reported one.

**Now:** `one-depot-at-a-time` — *"Finish each depot before you start the next"*. The delivery
sequence must be grouped by depot: the number of times the round leaves one depot for another may
not exceed (depots with stock) − 1. The meter reads `switches used / switches allowed`.

**Why it is a different question.** The level's objective is the lookup table — map a class to a
destination. The star asks the player to use the same table as a *route plan*: collect and deliver
one class at a time. It is a clustering decision, and it pulls against the clock, because grabbing
the nearest crate is cheaper per leg and interleaves classes constantly.

**Calibration** (measured, all four seeds, `budget.maxTicks` 4000, par 332):

| seed | classes | crates | switches allowed | grouped round | nearest-crate-first | reference |
|---|---|---|---|---|---|---|
| 1 | 4 | 8 | 3 | **3** (209 ticks) | 6 (201) | 6 (219) |
| 2 | 4 | 11 | 3 | **3** (327) | 9 (308) | 8 (332) |
| 3 | 5 | 9 | 4 | **4** (225) | 5 (222) | 8 (245) |
| 4 | 5 | 11 | 4 | **4** (291) | 7 (256) | 10 (300) |

The grouped round is gold on every seed (327 ≤ 332 on the worst), so the star and the medal are
compatible — but it gives up 8–35 ticks against the nearest-crate round, which is the tension the
bonus is for. Nothing here reads the clock, so the two-numbers-from-two-seeds contradiction is
gone.

**Proofs** (`w3-02 — one depot at a time`):
- `working the yard one class at a time earns the star on every seed` — `oneClassAtATime`, which
  orders the classes by depot proximity and empties one class before starting the next; passes,
  earns the star, and stays inside par on all four seeds.
- `taking the nearest crate every time is correct and misses the star on every seed` —
  `nearestCrateFirst`, the obvious spatial answer: passes the level, misses the star everywhere.
- `the reference delivers in the order it found the crates and misses the star` — the shipped
  reference, which now misses its own bonus on every seed, seed 1 included.

**Meter check.** Counting *switches* rather than *runs* is deliberate: a run count can equal the
run's `drop` count over the early samples, and `budgetFor`'s numeric corroboration would then
attribute the meter to `drop` and print the wrong total. A switch count can never equal the drop
count, so the meter stays unattributed and the objective's own figure is shown. Verified against
`src/game/budgets.ts`: `3/3` met, `6/3` missed. The label names no event kind, no sense and no
tick.

## w2-05 — Harvest Quota: a footprint budget

**Was:** `Objectives.withinTicks(71)` — "Finish with a sixth of the shift unspent". A plain tick
target the reference sweep already hits on every seed (58–68 ticks).

**Now:** `withinFootprint(32, …)` — *"Fill the hopper having set foot on at most 32 tiles."* The
count is distinct tiles the bot ever stood on, its start tile included.

**Why it is different thinking.** The main objective is prioritisation under a deadline. The bonus
asks the player to spend the sensor's *reach* instead of the wheels: `scan(Dir.North)` and
`scan(Dir.South)` mean a bot walking one row reads three, so walking rows 2 and 5 surveys the whole
12×6 interior from a quarter of it, and the bot then steps off the lane only for crop the survey
already picked out. The serpentine sweep that passes the level enters every tile it reads. This is
a *movement* budget, not a sensing budget — it rewards scanning more, which is the right direction
for a level whose sensor is short-ranged (CURRICULUM.md §2.1 correctly rules `withinSenses` out
here).

**Calibration** (`world-2.test.ts`, seeds 1–5):

| | seed 1 | seed 2 | seed 3 | seed 4 | seed 5 |
|---|---|---|---|---|---|
| survey-then-strike footprint | 23 | 25 | 26 | 27 | 22 |
| survey-then-strike ticks (shift is 84) | 43 | 49 | 49 | 51 | 45 |
| reference serpentine footprint | 41 | 45 | 49 | 42 | 44 |

Threshold **32**: five clear of the worst survey route and nine under the best serpentine, and the
survey route never comes near the 84-tick shift, so the footprint-minimal answer is not bought with
an overrun. `budget.maxTicks` is untouched.

**Legibility.** The brief is owned elsewhere and was not edited. The label names the number and the
noun, so `unitFor` denominates the readout in tiles — `23 / 32 tiles` on a clean run, `41/32` on
the sweep. The label avoids the word "move": a footprint is a subset of the `move` events and
matching that meter would report every move instead of the distinct tiles.

**Proofs** (`src/levels/world-2/__tests__/world-2.test.ts`):
- earns it: `surveyTwoLanesThenStrike`, all five seeds, inside the shift.
- misses it: the reference serpentine (`__solutions__/w2-05.ts`), all five seeds.
- degenerate: a bot that never moves has a footprint of 1 and fails the shift, so it takes no star.

**One suggested brief line, for whoever owns w2-05's prose** (not applied): after the `scan().crop`
paragraph — *"`scan(Dir.North)` and `scan(Dir.South)` read the rows either side of the bot. The
sensor covers three rows from one; the wheels cover one."*

**Note for whoever owns `src/levels/__tests__/levels.test.ts`.** Its "most of them are within reach
of an honest solution" assertion counts levels whose *reference solution* earns the bonus on some
seed. After this change `w2-05` no longer does. `w2-01` (seed 2) and `w2-04` (seed 4) still do.

## w3-01 — Pick and Place

**Verdict: this level is thin, and its bonus cannot be made interesting without changing the
level.** No new challenge was invented for it. The ask is unchanged; the broken meter is fixed.

**The measurement.** With one clamp, `n` crates at fixed columns west and `n` pads at fixed
columns east, the only freedom is which crate is paired with which pad and in what order. That is
small enough to solve exactly (`n <= 6`), so it was: brute force over every crate order × every
crate→pad assignment, against greedy (fetch the nearest crate, deliver to the nearest free pad).

| seed | crates | best pairing | greedy | gap |
|---|---|---|---|---|
| 1 | 6 | 128 | 130 | 2 |
| 2 | 5 | 109 | 109 | **0** |
| 3 | 3 | 64 | 64 | **0** |

Greedy *is* the optimum on two of the three declared seeds and is 1.6% off on the third. A move
budget calibrated between 128 and 130 is not a challenge, it is a coin toss. The only other slack
in the level is the survey sweep (~29 ticks of the reference's 157), and a budget that squeezed
that would be forcing a shorter scan route — the tax on walking CURRICULUM.md §2.1 rules out for
all of World 3. This is direct evidence for the cut decision on `w3-01`; it is kept as measurement
`greedy pairing is within two ticks of the best pairing on every declared seed`.

**The meter bug, diagnosed** (PLAYTEST-BEGINNER.md §10 item 3: `6 / 1 pickups`). Nothing in the UI
is wrong. `budgetFor` in `src/game/budgets.ts` re-derives the used figure from the trace, and when
an objective's id is not engine-minted it picks the meter by matching *words in the label* against
the sense names and trace event kinds the run produced. The old label was *"Finish within par with
no failed pickup"*: "pickup" is a trace event kind, so the readout counted **every** pickup in the
run (6), while the limit came from the objective's own 0-or-1 flag (1). The label collided with a
meter that the progress was not counting. It is a wording-and-`progress()` defect, not a UI one.

**The fix.** Same evaluate — finish inside par, with no pickup that comes up empty — relabelled
*"Finish inside 157 ticks with no grab that comes up empty"* and metered against the only real
number in it: `progress()` now returns `[min(ticks, par), par]`. `TICK_WORDS` matches first in
`meterFor`, so the meter is the clock, and `unitFor` takes "ticks" from the word after the 157.
Verified by hand: `138 / 157 ticks` on a passing run, `157/157` at exactly par, `323 / 157 ticks`
(over by 166) on a failing one. Never `6 / 1 pickups` again.

**Proofs** (`w3-01 — one clamp`):
- `the star is metered in ticks, not in pickups` — asserts the label and the `[min(ticks, par),
  par]` progress shape on every seed.
- `a round that re-surveys before every trip is correct and misses the star` — `resurveyEveryTrip`,
  the no-memory answer: passes the level with no failed pickup and takes 323 ticks against a par
  of 157.
- `the reference finishes inside par with nothing grabbed twice` keeps the earning direction.

**Caveat carried forward.** The star still asks exactly what gold asks (`ticks <= par`), so it
remains a duplicate of the medal axis. Fixing that needs either a second axis this level does not
have or the cut.

---

## Closing — what could not be made interesting, and what is owed to other owners

### Levels whose bonus could not be made a real challenge

- **`w3-01` Pick and Place — thin, and the measurements say so.** One clamp, `n` crates at one end
  of a corridor and `n` pads at the other. The only freedom is the crate-to-pad assignment and the
  order, and a brute force over every order and every assignment beats greedy-nearest by **two
  ticks on seed 1 and by nothing at all on seeds 2 and 3** (128 vs 130, 109 vs 109, 64 vs 64). A
  budget calibrated in that gap would be a coin toss, not a challenge. The only other slack is the
  survey sweep, and a sensing tax is ruled out for the whole of World 3 by CURRICULUM §2.1 — `scan`
  reads the bot's own tile and its four neighbours, so rationing it only taxes walking. The star
  was left asking what it asked (inside par, no empty grab) and only its **meter** was repaired.
  This is direct evidence for the cut decision, which is not ours.

- **Out of scope by orchestrator ruling, untouched:** `w1-01`, `w1-02`, `w1-04` (cut), `w3-03`,
  `w3-05` (cut), `w2-02` + `w2-03` (merge, survivor keeps its own bonus). Their bonuses are still
  confetti and are still worth fixing if any of them survives.

### The `6 / 1 pickups` meter bug (playtest §10 item 3) — diagnosed, and it is not a UI bug

`src/game/budgets.ts` does not render an objective's own `progress()[0]` when it can identify a
meter: `budgetFor` re-derives the used figure from the trace via `spentOn(meter)`, and picks the
meter from an engine-minted `within-<n>-<name>` id, or failing that by matching **words in the
label** against the sense names and trace event kinds the run produced. `w3-01`'s label said "no
failed **pickup**", which matched the `pickup` event kind, so the readout counted all six pickups
against a limit of 1 that came from the objective's own 0-or-1 flag. The bug is a label colliding
with a meter while the progress counts something else — a level-side fix, not a UI one. Every label
written here was checked against `meterFor`/`unitFor` in both directions, and the rule was applied
throughout: a label may only name a meter when the objective counts the whole of that meter.

### Changes owed to other owners — please apply, we did not

1. **`w2-05` brief prose (owned elsewhere).** The footprint budget is legible only if the player
   knows the sensor reaches beyond the tile under the bot. Requested addition, after the
   `scan().crop` paragraph:

   > `scan(Dir.North)` and `scan(Dir.South)` read the rows either side of the bot. The sensor
   > covers three rows from one; the wheels cover one.

2. **`docs/CURRICULUM.md` `bonus:` lines are now stale** for all eight reworked levels (they still
   describe the retired free stars). `docs/` is orchestrator-owned, so they were left alone. The
   replacements are the "asks now" line of each section above.

3. **`src/runtime/aggregate.ts` reports the first seed's objectives when every seed passes**, so the
   star a player actually sees is scored against **seed 1 alone** (this is the other half of
   playtest §10 item 4, where a medal from the worst seed and a bonus from the best sat on one
   card). Every bonus here was calibrated to bite on seed 1 as well as on the rest, so nothing
   depends on that being fixed — but until it is, the multi-seed achievability numbers are
   insurance rather than what the player is graded on.

### Verification of the whole change

`npx tsc --noEmit` clean. `npx vitest run` — **45 files, 1432 tests, all passing**, against a
recorded baseline of 44 files / 1402 tests all passing, so the 30 added tests are the two-direction
proofs and nothing regressed. `npx eslint src` reports two errors, both pre-existing and both in
files untouched by this work (`src/levels/world-5/__solutions__/w5-01.ts` and
`src/levels/world-8/w8-05.ts`, where `use(...)` and `useLog(...)` trip `react-hooks/rules-of-hooks`
in a non-React file). Every reference solution still passes its level on every seed inside par and
still takes gold; none was modified. No par value, medal threshold or medal weight was changed, and
nothing anywhere counts characters for score.

---

# 2026-09-06 — the second pass: does the bonus ask a second question?

The rework above made the early star *failable*. It did not make it *interesting*, and the two
playtests say so independently: the beginner called the stars "confetti", the veteran wrote "Dead
bonus: most of them". Both named the same single exception, `w4-02`'s mark budget.

**The diagnosis, and it is the binding test from here on:** most bonuses restate the required
solution with a tighter number. They ask no question the level did not already ask. A star for
doing the same thing slightly harder is not a second idea; it is the first idea with a smaller
tolerance.

> **The test:** does this bonus ask a question the required objective does not ask?

The bar is World 6. `w6-02`'s `name-the-fault` asks the player to *report which byte was altered*,
which the required objective never asks. `print` is available from World 1, so that mould
generalises to any level in the campaign — a bonus can always ask the run to say out loud something
it necessarily knew.

Worlds 3–5 are covered in `docs/FIX-BONUSES-3-5.md`, Worlds 7–8 in `docs/FIX-BONUSES-7-8.md`.

## Worlds 1, 2 and 6 — judged against the test, nothing moves

Re-read against the test rather than against the failability criterion the first pass used. All
eight surviving Worlds 1–2 bonuses pass, which is the first pass's rework doing its job: every one
of them changed the *metric*, not the *tolerance*.

| level | bonus | second question it asks | verdict |
|---|---|---|---|
| `w1-01` | — | — | no bonus, correctly |
| `w1-03` | `rationedSurvey(7, 5)` | trade information against time — stride instead of per-tile sensing | KEEP |
| `w1-05` | `oneMovePerFloorTile` | snake the sweep so no row is re-walked | KEEP |
| `w2-01` | `parkedWithoutOvershoot` | commit on a reading instead of surveying then walking back | KEEP |
| `w2-02` | `noWastedFieldwork` | scan before you swing — the metric is swings and seed, not ticks | KEEP |
| `w2-04` | `withinSpoilage` | spoilage, a metric the clock cannot see at all | KEEP |
| `w2-05` | `withinFootprint` | tiles stood on, not ticks spent | KEEP |
| `w6-01` | — | — | no bonus, correctly |
| `w6-02` | `name-the-fault` | *report which byte was altered* | KEEP — this is the bar |
| `w6-03` | `shorter-encoding` | re-encode the route more compactly than the sender did | KEEP |
| `w6-04` | `straggler` | recover the packet the protocol gave you no header for | KEEP |
| `w6-05` | `repair-blocks` | repair the corruption instead of discarding it | KEEP |

Not one of these is a tick tightening, and that is the whole finding: the worlds that were
deliberately authored against a second-idea standard have no dead bonuses, and the worlds that were
not are where every "finish in fewer ticks" bonus lives.

## Handbacks taken in this pass, and two corrections owed to `docs/FIX-INVARIANTS.md`

Two tidying items arrived from the invariants agent mid-pass. Both are recorded here because they
are not bonus work and would otherwise be lost between reports.

**Taken: `docs/DESIGN.md` §7 said "five grades". It is four.** Fixed, and written up as §11 **A12**
so the next reader does not restore it — including the part that is not obvious from the code, that
**the surviving ranks keep the numbers 2–5 and renumbering them 1–4 is a bug**: `save.reviewedRanks`
is persisted, so renumbering re-points existing saves at the wrong memo and withholds one the player
has never read.

**Taken: a budget declares its unit.** Written up as §11 **A13**. The conversion of the six
objectives that still infer is sequenced *after* the bonus rework rather than alongside it, because
three of the six pinned rows — `w3-01 clean-run`, `w8-01 audit-tight`, `w8-03 tight-shift` — are
objectives this very pass deletes or replaces. Converting them first would have been work thrown
away and a race on the same lines in the same files.

### Correction 1 — the campaign is 34 levels, not 40

`docs/FIX-INVARIANTS.md` says "forty levels" at §214 and §505. `LEVELS.length` is 34, there are 34
files matching `src/levels/world-*/w*.ts`, and both `SOLUTIONS` maps hold the same 34 ids. Forty is
the pre-compression size, 8 worlds × 5. The six withdrawn work orders are `w1-02`, `w1-04`, `w2-03`,
`w3-03`, `w3-05` and `w4-03` (`docs/FIX-COMPRESSION.md`), and `levels.test.ts` already guards it with
`nothing still points at a withdrawn work order`.

### Correction 2 — the difficulty evidence does not cover what it claims

This is the one that matters. `docs/FIX-INVARIANTS.md` §505, under *Difficulty — unchanged, and
checked rather than asserted*, reads:

> `reference-solutions.test.ts` runs all forty levels through the real runtime against their pars:
> 86 tests, unchanged.

`par` appears in that file exactly once:

```ts
expect(response.verdict.stats.ticks, id).toBeLessThanOrEqual(level.par.ticks);
```

and that loop iterates `MULTI_BOT` — `LEVELS.filter((l) => l.world === 7 || l.build(l.seeds[0]).bots.length > 1)`.
The per-level test that *does* cover all 34, `` `${level.id} passes every seed through the runtime` ``,
asserts `failure`, `unmet` and `passed`. It never reads `ticks` and never reads `par`.

**So the harness guards solvability campaign-wide and par on World 7 plus the other multi-bot levels
only — about 6 of 34.** The claim is true for solvability and unsupported for par on the remaining
~28. That is a documentation defect, not a code defect: the harness is genuinely valuable, because it
drives `ReferenceSolution.source` — the player-facing TypeScript — through `runSeed`, which is a
different program from the `.run` Sim driver everything else measures.

It is recorded here rather than fixed in place because `docs/FIX-INVARIANTS.md` is another agent's
report. The measurement behind it is in `docs/FIX-PAR-3-8.md`.

Corrected once more by measurement rather than estimate: `MULTI_BOT` is `w7-01`, `w7-02`, `w7-03`,
`w7-04`, `w7-05`, `w8-03`, `w8-05` — **7 of 34**, not the 6 I estimated and not the 40 the doc says.

### Correction 3 — a `ReferenceSolution` is two hand-maintained programs, and on two levels they are different programs

Found while cross-checking the par table. Every `ReferenceSolution` carries `run(sim, botId)`,
TypeScript driving `Sim` directly, *and* `source`, a separate string of player-facing TypeScript.
`levels.test.ts` and the bonus test execute `run`; `reference-solutions.test.ts` transpiles `source`
and drives it through `runSeed`. **Nothing asserts the two cost the same, or implement the same
algorithm.** They are edited independently, in the same file, by hand.

32 of 34 levels agree tick for tick across 120 (level, seed) pairs. Two do not:

| Level | Seed | `run` | `source` | Par |
|---|---:|---:|---:|---:|
| `w8-01` | 1 | 115 | 117 | 165 |
| `w8-01` | 2 | 142 | 148 | 165 |
| `w8-01` | 3 | 160 | 162 | 165 |
| `w8-01` | 4 | 151 | 155 | 165 |
| `w8-05` | 1 | 560 | 648 | 1050 |
| `w8-05` | 4 | 806 | **739** | 1050 |
| `w8-05` | 7 | 917 | 977 | 1050 |

`w8-05` seed 4 is *cheaper* on `source` and dearer on the other two, so this is two algorithms, not
drift or rounding.

**Nothing is broken today** — both paths take gold on both levels. The damage is to the evidence.
Headroom depends on which program you call the reference: `w8-01` is 3.0% on `run` and 1.8% on
`source`; `w8-05` is 12.7% on `run` and 7.0% on `source`. And the sharp edge, which belongs in any
future par work: **`w8-05` is in `MULTI_BOT`, so `reference-solutions.test.ts` asserts
`stats.ticks <= par` against 977, while `FIX-PAR.md` §1 records 917.** Anyone tuning that par off
the recorded table has 60 fewer ticks of room than they believe.

This is the same bug class as the `BudgetMeter` duplicate the invariants branch closed: two copies
of one fact in two layers with nothing comparing them, invisible because each half is only ever
checked against the level and never against the other. The fix is a guard in `src/levels/__tests__/`
asserting cost equality with `w8-01` and `w8-05` pinned as named exceptions — the `CLOCK_CANNOT_VARY`
idiom, where the exception set is explicit and the only direction it may move is down. Reconciling
the two implementations is content work and is deliberately not bundled with the bonus rework.

## The exemplar was broken: `w4-02`'s mark budget pays a star for not using the mechanic

This pass was briefed on the premise that `w4-02`'s `mark-budget` is the model of a good bonus —
both playtesters named it independently as the one that worked. **The premise is false, and the
evidence was already in the playtest that praised it.**

`mark()` costs 1 tick, and the reference pays one per newly-entered tile. Measured move counts are
*identical* between the reference route and a lazy route on every seed (112 / 204 / 236 / 178), so
the entire 391-vs-236 tick gap is breadcrumb cost. DESIGN.md §11 A3 makes an ordinary JavaScript
`Set` explicitly legitimate — it is taught, not smuggled — and a `Set` does the same job for free.
**The level's own hardware is strictly dominated.**

Then the bonus pays a star for placing *fewer than* `MARK_BUDGET` marks, which zero satisfies. So
the medal ladder and the star both reward declining to use the mechanic the level exists to teach.

`docs/PLAYTEST-VETERAN.md` §122 recorded it a week ago and nobody connected it:

> gold 236/391 + star, 1st run… **I placed zero marks.**

The constructed lazy route lands on 236 — the same number. A prediction that reproduces a recorded
playtest to the tick is the strongest evidence in either document.

**Ruling: `w4-02` is back in scope and the "exemplar, do not touch" instruction is withdrawn.** The
replacement must ask for the half of the mechanic a `Set` cannot replace: a mark is *in the world*,
so it survives what a closure does not and can be read by something that did not write it.
`readMark` is the verb with no local-memory equivalent, and a bonus about what a second reader can
reconstruct from the trail asks a question a `Set` cannot answer. Par, `mark`'s tick cost and the
required objective are not changed here — the free par is a separate proposal in
`docs/FIX-PAR-3-8.md`.

The general lesson, which is the one worth keeping: **a bonus must be checked against the cheapest
correct program, not against the reference.** Every bonus in this document was judged by asking
whether it poses a second question; `w4-02` passes that test and still fails, because the question
it poses is answered by refusing the level.

### The sibling defect: a bonus that costs ticks inside a par that does not include them

`w6-04` par is 14, the reference's cost *including* the bonus straggler transmit, and a lazy route
costs 13. **Attempting the bonus costs gold-margin.** Found twice now, with `w1-03`, so it is a
class rather than an incident: any bonus that spends ticks inside a par calibrated without it sets
the star against the medal, and a player who notices is right to skip the star. Both bonus agents
were told to check any new tick-spending bonus against worst-seed par before shipping it.

### A third instance of the same bug class, from the par measurement

`levels.test.ts` selects its A7 ungrade evidence with `CLOCK_CANNOT_VARY` — "the reference costs the
same on every seed". That is **sufficient but not necessary** for A7's actual written criterion, *no
correct program costs fewer ticks than another on the same seed*. `w4-01`, `w5-04` and `w6-02`
satisfy the criterion and fail the proxy, because their cost varies with the **seed** and not with
the **program** — so the proxy cannot see them, which is why a green test found nothing in Worlds
3–8. A proxy standing in for a criterion with nothing recording that it is only a proxy is the same
shape as the label-parsed budget and the two-copy reference solution. **Three instances this pass.**

## The three tests a bonus must now pass

The brief supplied one test. Two more were forced by measurement, each after a bonus passed the
existing tests and still failed in play. All three are cheap and all three have caught something.

1. **Does it ask a question the required objective does not ask?** Kills the tightenings — the whole
   `w7-02` / `w7-04` / `w8-01` / `w8-03` family.
2. **Is it earned by the cheapest correct program?** Kills `w4-02`'s mark budget, `w4-01`'s
   `single-pass` and `w8-04`'s `no-resurvey`. A bonus judged against the *reference* rather than
   against the cheapest correct program is judged against the wrong opponent.
3. **Is it satisfied by a program that does nothing?** Kills `w8-05`'s `under-budget` and
   `no-blocked-moves`.

Test 3 needs its severity stated exactly, because it is easy to overstate. `src/game/store.ts:552`
is `stars: verdict.passed ? [...previous.stars, ...earned] : previous.stars`, so **a failed run banks
no stars** and no player ever collects points from a do-nothing program. **The defect is in the
predicates, not in scoring.** Both are *absence* predicates and therefore vacuously true; the only
thing between them and a program that never moves is a `passed` gate outside the objective. A bonus
that is true of a program which does not play the level is not asking a question, whatever scoring
does about it.

**The design rule the three tests converge on:** *prefer a bonus that requires evidence of a thing
done over one that requires the absence of a thing done.* A positive artefact — a trail that leads
home, a byte named, a line reported — cannot be satisfied by inaction, cannot be satisfied by the
lazy route, and cannot be satisfied by a smaller tolerance on the first idea.

**Independent corroboration, from a direction none of this came from.** Bonus grading moved from
seed one to a worst-seed conjunction while this pass was running. Three bonuses lost their star:
`w7-02 within-ten-percent`, `w7-04 within-bound`, `w8-01 audit-tight`. **All three are budget
bonuses, whose margin varies seed to seed; not one predicate bonus moved.** Those are three of the
exact objectives already condemned here as pure tightenings, reached by an unrelated route.

## `w8-04` is a second `w4-02`, and larger

Ruled after the par measurement, reversing an earlier "looks real, keep". A program that never calls
`receive()`, never cracks the 95-key cipher and never reads the filed plan finds the locker in
**5–65 ticks** (9–117 with the walk home), against par 223 — **gold on every seed with 106–158 ticks
of room.** The level's entire apparatus is optional.

The bonus then makes it worse rather than catching it. `no-resurvey` counts tiles *off* the plan, and
the short way is a **subsequence of the plan's own tiles**, so it strays **less** than the intended
solution: **0 / 0 / 0 / 4 / 11 against the reference's 17 / 19 / 37 / 14.** The lazy route takes the
star on all five seeds, more comfortably than the reference does. As with `w4-02`, the star pays for
declining to use the level's idea.

The replacement must demand a positive artefact only the decoded plan can produce — name the locker
before reaching it, report the plan's leg count, state the key. Par, the required objectives and the
cipher are untouched here; the free par is a separate content repair.

## The engine fact underneath several of these

`look`, `scan`, `probe`, `recv` and `print` are **absent from `DEFAULT_COSTS`: sensing and reporting
are free.** Par therefore cannot rank a program for sensing less or planning better — which is why
`w8-04` is free, and it is one fact wearing three hats across `w5-01`, `w8-03` and `w8-04`.

Two consequences for bonus design, and both point the way this pass was already going:

- An **information budget** (`Objectives.withinSenses`) is the only instrument in the game that can
  price sensing at all. That is the argument for keeping `w8-01`'s and `w8-03`'s survey budgets when
  their tick-tightening siblings are deleted, and for reaching for that shape again.
- A **report-shaped bonus costs the player nothing in ticks**, so it can never trip the
  "tick-spending bonus inside a par calibrated without it" class of `docs/FIX-PAR-3-8.md` §10. The
  `w6-02` mould is structurally safe in a way a threshold bonus is not.

## What changed, in one table

Nine bonuses authored or deleted across five worlds. Detail in `docs/FIX-BONUSES-3-5.md` and
`docs/FIX-BONUSES-7-8.md`; par evidence in `docs/FIX-PAR-3-8.md`.

| Level | Was | Now | The second question |
|---|---|---|---|
| `w3-01` | `clean-run` | **`straight-runs`** | how do the two sidings line up by row? |
| `w4-01` | `single-pass` (free) | **`within-60-look`** | did you read the ray as a ray? |
| `w4-02` | `mark-budget` (paid for not using marks) | **`breadcrumb-trail`** | what could a bot that did not run your program reconstruct? |
| `w4-05` | `fuel-reserve` | **`filed-return`** | do you know the way home before you drive it? |
| `w5-05` | `tight` | **`name-the-weak-link`** | what happens when one substation goes down? |
| `w7-01` | `no-slack` | **`name-the-idle`** | how long did each bot stand still? |
| `w7-02` | `within-ten-percent` | **`even-share`** | did you split the work, or split the map? |
| `w7-04` | `within-bound` | **`name-the-decider`** | which job was the critical path? |
| `w8-01` | `audit-tight` | **`name-the-row`** | which row held the most ripe crop *at the open*? |
| `w8-04` | `no-resurvey` (paid for ignoring the plan) | **`read-the-plan`** | what was the cipher, and how many legs? |
| `w8-05` | `under-budget`, `no-blocked-moves`, `fleet-utilisation` | **`name-the-hold`** | which station waited longest on its feeders? |

Kept, verified against all three tests: `w3-02`, `w3-04`, `w4-04`, `w5-01`, `w5-02`, `w5-03` (both),
`w5-04`, `w7-03`, `w7-05`, `w8-02`, `w8-03`'s probe budget, `w8-01`'s look budget. Worlds 1, 2 and 6
unchanged.

**Star maximum: Worlds 7–8 fall 14 → 11.** `w8-05` loses two of three, one of which
(`fleet-utilisation`) was **unreachable rather than hard** — World 8's `idleTicks` charges `sync`,
so the predicate paid for *not coordinating* on the coordination finale, and the reference sat at
85–90% against a 35% bar. Worlds 3–5 are unchanged at one star per level: every deletion there was
matched by a replacement.

**`w7-05 workers-busy` is kept but unproved** — 15–29% against a `<10%` bar. World 7's `idleTicks`
counts only `wait` and `sync`, so it *is* reachable by a dispatcher that walks workers
speculatively, but proving it needs a new reference solution and that is par-affecting. It is now
the campaign's only never-earned bonus, which is the one `levels.test.ts` licenses by name.

## Handover — two diffs I could not apply, and one I did

**Applied: `src/game/__tests__/budget-declarations.test.ts`.** `INFERRED_FROM_LABEL` goes from six
rows to two. Four of the six were the bonuses this pass deleted, so the pinned set shrank for the
best possible reason — the objectives stopped existing. Only the set and its prose changed.

**The remaining two cannot be converted, and this is the answer to that handback.** `w8-03
within-shift` and `w8-05 deadline` are both required objectives built with `Objectives.custom`, and
**`CustomReport` is `{ progress?, divergence }` with no path for a meter to reach the objective.**
So the six-objective conversion is 4 done-by-deletion and 2 blocked on the engine. The unblocking
diff, wanted verbatim in `src/engine/objectives.ts`:

```diff
 export interface CustomReport {
   progress?(ctx: ObjectiveContext): [number, number];
   divergence(ctx: ObjectiveContext): Divergence | undefined;
+  /** What `progress` counts, where it counts against a limit. DESIGN.md §11 A13. */
+  meter?: BudgetMeter;
+  unit?: string;
 }
```

with `custom()` forwarding both onto the options it already passes to `define`. Nearly every bonus
in the campaign is a `custom`, so until this lands A13 binds only the engine-minted objectives.

**Not applied, and the one red test on this branch:
`src/__tests__/confessed-invariants.test.ts:106`.** I was told not to edit `src/__tests__/**`
because another agent is reconciling those guards against the art branch, and to say so rather than
work around it. The entry is now stale:

```diff
-  {
-    file: 'src/levels/world-4/objectives.ts',
-    says: 'Mirrors the ledger `Sim.charge` keeps',
-    guard: 'a constant that claims to be the only copy is the only copy',
-  },
```

`fuelBurned` was `fuel-reserve`'s only consumer and went with the objective, so the comment it
confessed no longer exists. **There is no fix on my side:** restoring the symbol to satisfy the
guard would immediately fail `unused-exports.test.ts`, which is the same ratchet pointing the other
way. Deleting those four lines makes the suite green.

Worth recording as a property rather than an incident: **the ratchet caught a deletion, not an
addition.** A guard that is exact in both directions notices when the *evidence* for an invariant
disappears, not only when a new claim appears — which is exactly what you want and exactly what
makes it fail on a branch that removes code.
