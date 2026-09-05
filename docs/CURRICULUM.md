# BOOTSTRAP — Curriculum

> Companion to `docs/DESIGN.md` §5 and §6. **DESIGN.md wins every conflict.**
> 34 levels across 8 worlds. This document specifies *what each level teaches and why it is
> hard*. It contains **no solutions and no solution code**, deliberately and permanently.
> Reference solutions live in `src/levels/**/__solutions__/` and are test fixtures only.
>
> **Six work orders were withdrawn** after the playtests in `docs/PLAYTEST-BEGINNER.md` and
> `docs/PLAYTEST-VETERAN.md`: `w1-02`, `w1-04`, `w2-03`, `w3-03`, `w3-05` and `w4-03`. The
> survivors kept their ids, so `index` inside a world is ascending but no longer contiguous —
> `w1-05` is the third work order in World 1. What each cut level introduced, and where that
> introduction now lives, is recorded in `docs/FIX-COMPRESSION.md`.

---

## 0. How to read a level block

Every level uses the same fields, in the same order. Content agents fill `LevelDef`
(DESIGN.md §5) from these.

| Field | Meaning |
|---|---|
| `premise` | The one-line ask, in plain language. Becomes the non-joke half of `brief`. |
| `teaches` | **The single concept.** If you can't say it in one sentence, the level is two levels. |
| `assumes` | What the player must already have from earlier levels. |
| `hardware` | New API unlocked *by* this level (DESIGN.md §6). Blank = no new hardware. |
| `heritage` | The classic algorithm this is lifted from, named plainly. `—` = original. **Never appears in player-facing text.** |
| `world` | Grid size and contents. |
| `varies` | What changes across seeds. |
| `anti-hardcode` | The specific randomization that defeats a memorized path. Mandatory field. |
| `naive-fails` | Why the obvious approach fails or is expensive. If this is empty, the level is a chore. |
| `generalize` | What the multi-seed rule is actually enforcing. |
| `seeds` | Seed list. `>= 3` from World 2 onward (DESIGN.md §5). |
| `size` | Rough reference-solution length in lines. A planning figure, not a target. |
| `difficulty` | 1–10, honest. See §1. |
| `bonus` | Optional objective worth a star, or `—`. |

---

## 1. The Difficulty Curve

**The curve is the product.** Levels 1–5 are solvable by someone who has written a `for` loop
and nothing else. w8-05 should be a real evening's work for an Advent of Code veteran.

```
10 |          |          |          |          |          |          |          |        ##
 9 |          |          |          |          |          |          |        ##|    ######
 8 |          |          |          |      ##  |        ##|        ##|      ####|  ########
 7 |          |      ##  |          |    ####  |      ####|      ####|    ######|  ########
 6 |          |    ####  |    ##    |    ####  |    ######|      ####|    ######|  ########
 5 |          |    ####  |    ##    |  ######  |    ######|    ######|  ########|##########
 4 |    ##    |    ####  |  ####    |  ######  |  ########|  ########|  ########|##########
 3 |    ##    |  ######  |  ####    |########  |##########|  ########|##########|##########
 2 |  ####    |########  |######    |########  |##########|##########|##########|##########
 1 |######    |########  |######    |########  |##########|##########|##########|##########
   +----------+----------+----------+----------+----------+----------+----------+----------
    1 2 3     1 2 3 4   1 2 3     1 2 3 4   1 2 3 4 5  1 2 3 4 5  1 2 3 4 5  1 2 3 4 5
       W1         W2         W3         W4         W5         W6         W7         W8
```

The number under a column is the work order's **position** in its world, not its id: World 1's
third column is `w1-05`.

```
W1  1  2  4              W5  3  4  6  7  8
W2  2  3  6  7           W6  2  4  5  7  8
W3  2  4  6              W7  3  5  7  8  9
W4  3  5  7  8           W8  5  8  9  9 10
```

Mean 5.5. Per-world means: 2.3, 4.5, 4.0, 5.8, 5.6, 5.2, 6.4, 8.2. The first four worlds moved
up because what came out of them was the flat part: the veteran took gold on the first honest run
on nine of the first ten levels, and six of those landed on *exact* par.

### 1.1 The sawtooth, and why

The curve is **not** monotonic and must not be flattened into one. Every world resets down at
its opener and climbs to its finale. That produces seven drops, and every one of them is
load-bearing: a new world's opener is where a new piece of hardware is taught in isolation, and
a player fighting a hard puzzle *and* an unfamiliar API at the same time learns neither.

| Drop | From → to | Justification |
|---|---|---|
| w2-05 → w3-01 | 7 → 2 | Biggest early relief. W2's finale is a genuine planning problem; W3 opens by handing you a new verb and a trivial errand. |
| w3-04 → w4-01 | 6 → 3 | `look()` changes the player's mental model from "I know the map" to "I don't". That deserves an easy level to itself. |
| w4-05 → w5-01 | 8 → 3 | After online exploration, a level that is a straight line, on purpose. |
| **w5-05 → w6-01** | **8 → 2** | **The single biggest drop in the game, and the most important.** W5 ends on a minimum spanning tree; W6 opens with a ten-line echo loop that has no movement in it at all. This is the game's rest beat. Content agents must not make w6-01 clever. |
| w6-05 → w7-01 | 8 → 3 | Parallel clocks are a genuinely disorienting model change. Teach them on two corridors. |
| w7-05 → w8-01 | 9 → 5 | A breather with teeth: familiar puzzle, brutal budgets. |

### 1.2 Plateaus, and why

Plateaus are as deliberate as spikes. One explicit one is left:

- **w8-01 at 5.** A dip inside the finale world. Without it, W8 reads as 8-9-9-10 and the
  player arrives at the monster already tired.

Two former plateaus were **cut rather than kept**, because both playtests read them as the
runway rather than as rest:

- **w4-02 / w4-03 at 5 / 5** was authored as a diptych — state stored *in the world* (marks)
  against state stored *in the algorithm* (a wall-following invariant). In play it was one level
  printed twice: the veteran pasted `w4-02`'s file into `w4-03` unedited and took gold 34% under
  par. `w4-02` keeps the contrast as a *seed* instead — one of its four seeds has no loop in it
  anywhere, so the rule from `w4-01` is still enough on that one shift, and the brief says so.
- **w2-01 → w2-03 at 2 / 2 / 2** was three consecutive first-run golds doing the same activity
  with one predicate changed. Both testers named this as where they would have put the game down.
  `w2-02` now carries the predicate *and* the replant cycle *and* the moving start corner.

### 1.3 Spikes, and why

| Spike | Jump | Justification |
|---|---|---|
| w2-04 (6) | +3 | First level requiring the player to save and resume their own traversal state. This is a real conceptual step and it should feel like one. It is also the first level in the game a good player fails once, which is what makes the `RECORD n ~~was m~~` card fire — the single best moment in the veteran's first ninety minutes, and it used to be unreachable before level 10. |
| w4-04 (7) | +2 | First "build a data structure, *then* act" level. The hardest single step in the first half of the game. Heavily scaffolded — see §11. |
| w5-05 (8) | +1 from an already-high 7 | MST with union-find is the hardest pure-algorithm ask in the game. Justified because it is immediately followed by the largest drop. |
| w7-03 (7) | +2 | Concurrency bugs. Justified: this is the one level where the player must reason about *time*, and no amount of easing avoids that. |
| w8-05 (10) | +1 | It is the monster. Bronze must remain reachable — see the level block. |

### 1.4 Rough hour budget

W1 ≈ 20 min · W2 ≈ 1.2 h · W3 ≈ 1.2 h · W4 ≈ 2.5 h · W5 ≈ 3 h · W6 ≈ 2.5 h · W7 ≈ 4 h ·
W8 ≈ 6 h. Total ≈ 20 h to bronze-complete, considerably more to gold everything. These are
planning figures for pacing, not promises.

The W1 figure is the measured one, not an estimate: the beginner ran the old five-level World 1
in 18 minutes against a 40-minute budget, which was the problem rather than the achievement.
Three levels at 20 minutes is the same wall clock spent on levels that ask something.

---

## 2. Global rules for level authors

1. **One concept per level.** The `teaches` field is one sentence. Two sentences means split it.
2. **`anti-hardcode` is mandatory and specific.** "The world is random" is not an answer.
   Name the axis. Exception: `w1-01` only (see §3).
3. **Seeds must include the awkward cases.** Empty sets, single-element sets, the target at
   index 0 and at index n-1, the degenerate layout. A seed list of five pleasant middles
   teaches the player that edge cases don't happen here.
4. **Par comes from the reference solution minus ~10%** (DESIGN.md §5), and the reference
   solution uses the *intended technique*, not an optimal solver. Where a level's heritage is
   an NP-hard problem (`w5-04`, `w5-05`, `w7-04`), par **must** be derived from the named
   heuristic. Setting par from an optimal solver turns a teaching level into a research project.
   The opposite failure is the one the playtests found: par set at the *worst seed's* cost of the
   obvious solution means every honest answer lands on par exactly, six times in nine levels, and
   the medal stops measuring anything. Derive par from the median seed.
5. **Never require optimality.** Require "good enough that the naive thing fails".
6. **Failure must be legible.** If the player cannot tell from the trace *why* they failed,
   the level is broken regardless of how elegant it is.
7. **The brief never names the algorithm.** `heritage:` is for us. See NARRATIVE.md §1.5.
8. **Every level's bonus should absorb ambition**, not add grind. A good bonus is "do the same
   thing but properly"; a bad bonus is "now do it 50 times".

### 2.1 Where the information budget belongs

`Objectives.withinSenses(name, n)` is the second scoring axis (DESIGN.md §7). It does not make
sensing cost ticks; it makes it *countable*, so a level can ration the instrument rather than the
clock. It is **not** a general-purpose second number and must not be added to a level just to have
one.

It has teeth in exactly two shapes:

- **Sensing is the search.** `w5-02` — two hundred segments, ten probes. Scanning the space costs
  nothing in ticks, so without a read budget there is no reason to binary-search.
- **Re-sensing substitutes for remembering.** `w8-01` — one ray reports a whole row, and the
  rating forces the player to hold the survey instead of casting it again. The two budgets pull
  opposite ways: the answer that never looks has to walk.

It is **noise**, and has been deliberately left out, wherever:

- **The sensor is not remote.** `scan` reads the bot's own tile and its four neighbours, so in all
  of World 3 an information budget is just a tax on ticks that the tick par already collects.
- **Re-sensing is the level's method.** `w4-02` already carries a resource budget in this slot
  (marks placed) and it is the first bonus in the game either tester could have failed. `w4-01`
  is `look`'s isolation level and its brief promises the beam is free "as often as it likes".
- **The level is on the Frustration Watch (§11).** `w4-04`, `w5-05`, `w6-04`, `w7-03`. Each is
  already one number away from opaque.
- **Rationing would punish the better answer.** On `w5-03` and `w8-03` a player who reads state
  instead of tracking it is *saving* ticks, so the read budget is a bonus star on both and never
  a gate.
- **The brief tells the player the opposite.** `w8-02`'s hints end on "that is a reason to keep
  looking, not a reason to stop carrying."

---

## 3. World 1 — Boot Sector

Theme: a dusty test hangar. Unlocks `move` `pos` `canMove` `print` `wait`.
Constraint: **must be completable by someone who has written a `for` loop and nothing else.**

> **Note on `print`.** `print` is introduced as a debugging tool, in `w1-01`'s hardware and in
> the docs panel. It is a level objective in exactly one place in the campaign (`w6-01`, where
> the transcript *is* the answer); nowhere in Worlds 1–5 is an objective satisfied by printing.

> **The one declared hardcoding exception.** `w1-01` is single-seed and *is* solvable by a
> memorized path. This is intentional: the first two minutes of the game must be about "the
> button works", not about generalization. `w1-03` is where the multi-seed rule bites for the
> first time, and it must bite visibly — which is why the exception stops at one level rather
> than two, and why `w1-01` must never be given a second seed.

---

### w1-01 — Cold Start
- `premise` The bot is at the west end of the hangar. There is a pillar in front of it and a service route behind that. Drive to the pad at the far end.
- `teaches` Issuing an action, the coordinate model (x grows East, **y grows South**, North is `y-1`), and bounded repetition — a counted `for` loop instead of repeated statements.
- `assumes` Nothing.
- `hardware` `move` `pos` `print` `wait`
- `heritage` —
- `world` 25×14. A pillar at (3,2) with a three-tile bypass above it, then legs of 19 East, 5 South, 22 West, 5 South, 22 East. 78 moves, par 78.
- `varies` Nothing.
- `anti-hardcode` **None — declared exception.** The level is a hardcoded path by design.
- `gate` A **hard 90-tick booking**, plus the length of the route. Nothing in a trace distinguishes five loops from seventy-eight typed-out `move` calls — the events are identical — so the level cannot fail longhand and does not pretend to. What it can do is make longhand absurd to type, and fail the one answer that skips the counting: firing 30 moves per leg and letting the walls stop them costs 155 ticks against a 90-tick booking.
- `naive-fails` Confusing North and South walks into the pillar, which is the coordinate lesson. Move-at-the-wall-until-it-stops overruns the booking and fails. Writing all seventy-eight out passes, and is its own punishment.
- `generalize` —
- `seeds` `[1]`
- `size` ~7 lines · `difficulty` **1/10**
- `bonus` — (the first level offers no optional goal; do not add one)
- `note` This is `w1-01` and the withdrawn `w1-02` in one work order. `w1-02` stated bounded repetition and enforced nothing: 45 literal `move()` calls scored gold, the star, both objectives and two commendations, and the starter shipped the loop for the player to delete. Length is the only lever left once character count is off the table (DESIGN.md §7) and multi-seed is reserved for `w1-03`, so the route is 78 tiles and the starter ships one bare `move`.

### w1-03 — Length Unknown
- `premise` A corridor of unknown length. Reach the end of it.
- `teaches` Conditional repetition — loop on a sensed condition (`while (canMove(...))`) rather than a count.
- `assumes` `for` loops.
- `hardware` `canMove`
- `heritage` —
- `world` 30×3. One straight leg, pad at the end.
- `varies` Corridor length, 8–27.
- `anti-hardcode` Length is drawn per seed; no integer constant satisfies all three seeds.
- `naive-fails` A counted loop passes seed 1 and fails seeds 2 and 3. **This is the game's first multi-seed failure and the UI must show it clearly** — seed 1 green, seed 2 red, side by side.
- `generalize` Over corridor length.
- `seeds` `[1,2,3]`
- `size` ~4 lines · `difficulty` **2/10**
- `bonus` Zero blocked moves (a blocked move still costs a tick — DESIGN.md §4.4).

### w1-05 — Floor Inspection  *(synthesis)*
- `premise` Inspect every floor tile in the bay. There is a door in the middle and it is on a timer.
- `teaches` Nested iteration over a 2-D area (systematic coverage), plus a timing loop against a cycling obstacle.
- `assumes` All of World 1.
- `hardware` — (`wait` is fitted at `w1-01`)
- `heritage` — (boustrophedon/serpentine coverage)
- `world` A rectangular bay split by an interior wall with one airlock door. Bot starts in the west half. Every floor tile in both halves must be entered.
- `varies` Bay width 6–10, height 5–8, door row, door **phase**. The door cycle is always 9 ticks.
- `anti-hardcode` Dimensions vary, so serpentine leg lengths cannot be constants; the door phase varies, so a fixed `wait(n)` fails.
- `naive-fails` Hardcoded sweep widths fail on other seeds. Hammering the shut door costs one tick per attempt and blows the tick par; the player must either `wait` for the phase or do useful work while the door is shut.
- `generalize` Over room dimensions and door phase.
- `seeds` `[1,2,3,4]`
- `size` ~20 lines · `difficulty` **4/10**
- `bonus` Complete the sweep with zero blocked moves.
- `defuse` Dot's brief states the cycle length outright ("nine ticks, always has been"). The puzzle is *phase*, not *period*. Discovering an unknown period by experiment is a World 5 skill and does not belong here.

---

## 4. World 2 — Regolith Fields

Theme: agriculture on a hostile rock. Unlocks `scan` `harvest` `plant` `inventory`.
From here on, `seeds.length >= 3` is mandatory (DESIGN.md §5).

---

### w2-01 — The Sensor Package  *(hardware in isolation)*
- `premise` One planted row. Harvest what is ripe and nothing else.
- `teaches` `scan()` — sensing is **free** (0 ticks) and acting is not, so look before you act.
- `assumes` W1 loops and traversal.
- `hardware` `scan` `harvest`
- `heritage` —
- `world` 12×3, single planted row of 10 tiles, each ripe / unripe / empty.
- `varies` Which tiles are ripe (4–8 of them).
- `anti-hardcode` Ripe positions are redrawn per seed; a fixed index list fails.
- `naive-fails` Harvesting every tile costs 2 ticks each and misses par by ~2×. Harvesting a memorized set fails other seeds.
- `generalize` Over the ripeness distribution, including a seed with a ripe tile at each end of the row.
- `seeds` `[1,2,8,13]`
- `size` ~8 lines · `difficulty` **2/10**
- `bonus` Exactly as many `harvest` calls as there are ripe tiles.

### w2-02 — Rotation
- `premise` Work every tile of the field: take what is ready, put a seed in every hole. The mule drops you at a different corner each quarter.
- `teaches` A two-phase per-cell cycle where **the world changes underneath you** — the state you sensed is stale the instant you act — guarded by a ripeness predicate the tile has to be asked about first.
- `assumes` Scan-guarded action, serpentine coverage.
- `hardware` `harvest` `plant`
- `heritage` —
- `world` 5×5 field, mixed ripeness with 4–6 bare tiles. The mule parks in one of the four corners.
- `varies` Ripeness map, how many tiles are bare, **which corner** the mule parks in.
- `anti-hardcode` The corner moves, so the sweep's start and direction cannot be constants; ripeness varies, so the action per tile cannot be.
- `naive-fails` Swinging the arm on every tile costs two ticks a swing on bare soil and on the second sowing, and misses par. Scanning the whole field once, building a plan, then executing it: the plan replants tiles it hasn't harvested and harvests tiles it just planted. Order *within* a cell matters and only re-scanning catches it.
- `generalize` Over ripeness, bare count and corner.
- `seeds` `[1,2,3,4]`
- `size` ~14 lines · `difficulty` **3/10**
- `bonus` Waste no swing and no seed.
- `defuse` Requires the renderer growth-stage overlay (DESIGN.md §11 A5) to be readable at all. That amendment names the withdrawn `w2-03`; **this is the level it now protects.**
- `note` This is `w2-02` and the withdrawn `w2-03` in one work order. Both testers reported them as one level printed twice — *"w2-02 is w2-03 minus a predicate"*, *"two lines different"* — and both proposed exactly this merge. The version that demands the predicate is the one that survived.

### w2-04 — Capacity
- `premise` The bot holds a limited load. The field holds more than that.
- `teaches` Interrupt and resume: check a resource *before* acting, break out of a traversal, and re-enter it where you left off.
- `assumes` Sweeps, the harvest/plant cycle.
- `hardware` `inventory`
- `heritage` —
- `world` 12×8 field, silo on one edge, yield well above one load.
- `varies` Capacity 6–10 (readable only via `inventory()`), silo edge, ripeness map.
- `anti-hardcode` Capacity is not a constant the player may write down; it must be read from the world each run.
- `naive-fails` A blind sweep silently drops units once full (`harvest` returns false and the tick is still spent). Returning to the silo after every harvest is correct and 4–5× over par. Batching is the only route to gold.
- `generalize` Over capacity, which is the point of the level.
- `seeds` `[1,2,3,4]`
- `size` ~28 lines · `difficulty` **6/10**
- `bonus` Zero failed harvests due to a full inventory.

### w2-05 — Harvest Quota  *(synthesis)*
- `premise` Two crops, one quota, one shift. Only one of them counts.
- `teaches` Prioritisation under a hard deadline — you cannot visit everything, so choose.
- `assumes` All of World 2.
- `hardware` —
- `heritage` Orienteering / prize-collecting route under a budget. **A greedy nearest-ripe heuristic must suffice**; par is set from one.
- `world` 14×10, two crop types interleaved, capacity limit, ripening active, silo in a corner. `maxTicks` allows roughly 70% of the field to be reached.
- `varies` Crop layout, ripeness, capacity, and the quota itself (±20%).
- `anti-hardcode` The quota varies, so even the *amount* of work cannot be assumed; the crop layout varies, so no route is reusable.
- `naive-fails` Any fixed route. Any solution that treats both crops as harvestable wastes half its budget. Any solution that ignores capacity strands units in a full hopper.
- `generalize` Over layout, quota, capacity and ripening simultaneously — the first four-axis level.
- `seeds` `[1,2,3,4,5]`
- `size` ~40 lines · `difficulty` **7/10**
- `bonus` Hit quota with 15% of the tick budget unspent.

---

## 5. World 3 — The Sorting Yards

Theme: logistics depot. Unlocks `pickup` `drop` `carrying` `use`.

---

### w3-01 — Pick and Place  *(hardware in isolation)*
- `premise` Crates on the west siding, pads on the east. Move each crate to a pad.
- `teaches` `pickup` / `drop` / `carrying` — **the bot has one carry slot**, and picking up while full fails.
- `assumes` W1/W2 traversal.
- `hardware` `pickup` `drop` `carrying`
- `heritage` —
- `world` 14×5. 3–6 crates west, the same number of pads east.
- `varies` Crate count, crate rows, pad rows.
- `anti-hardcode` Counts and rows vary; no fixed sequence of trips works.
- `naive-fails` "Collect everything, then deliver everything" — there is exactly one slot. This failure should happen within the first thirty seconds and be completely legible in the trace.
- `generalize` Over count and placement, including a seed with a single crate.
- `seeds` `[1,2,3]`
- `size` ~14 lines · `difficulty` **2/10**  *(deliberate plateau after w2-05)*
- `bonus` Par ticks with no failed `pickup`.

### w3-02 — Sorted by Colour
- `premise` Crates come in classes. Each class has a depot. The depots move between shifts.
- `teaches` A **lookup table** — map a datum to a destination, instead of a chain of `if`s with baked-in coordinates.
- `assumes` `pickup`/`drop`.
- `hardware` —
- `heritage` Dispatch table / associative array.
- `world` 16×12 yard, 8–14 crates of 4–5 classes scattered, one depot per class.
- `varies` Crate classes and positions, depot positions, **and the class→depot assignment itself**, plus how many classes exist (4 or 5).
- `anti-hardcode` The mapping is the randomized axis. Coordinates baked into an `if` chain die on seed 2; a 4-branch chain dies on a 5-class seed.
- `naive-fails` Everything about the hardcoded approach works perfectly on seed 1, which is what makes the lesson land.
- `generalize` Over the mapping — the player must *read* it from the world rather than know it.
- `seeds` `[1,2,3,4]`
- `size` ~25 lines · `difficulty` **4/10**
- `bonus` Beat par by 10% (achieved by batching deliveries by proximity, not by moving faster).

### w3-04 — First In, First Out  *(world finale)*
- `premise` The conveyor doesn't care which crate is nearest. It cares which arrived first.
- `teaches` Order-preserving processing — the next correct action is determined by arrival order, not proximity.
- `assumes` Lookup tables, routing.
- `hardware` `use`
- `hardware note` **`use` has no job in this work order.** It belonged to the withdrawn `w3-03`, and DESIGN.md §6 pins it to World 3; this is the last World 3 slot, and the first level that actually operates a machine is `w5-01`. The requisition ceremony therefore fires one shift early and hands over a verb nothing here needs. Flagged in `docs/FIX-COMPRESSION.md`: either give `w3-04`'s outbound bay a terminal to `use`, or move the unlock to `w5-01` and amend DESIGN.md §6.
- `heritage` FIFO queue discipline; producer/consumer.
- `world` 18×10. An inbound conveyor deposits crates at a mouth tile on a schedule; each crate carries an arrival index. An outbound bay rejects a crate if any lower index is still unshipped. The mouth blocks if it is not cleared.
- `varies` Arrival order, arrival timing, destinations, crate count 8–16.
- `anti-hardcode` Arrival schedule and order are both drawn per seed; there is no fixed correct sequence of trips.
- `naive-fails` Greedy nearest-crate ordering gets the drop rejected. Clearing the mouth eagerly means idling; clearing it lazily means it backs up and blocks. The player must hold a queue and service it.
- `generalize` Over the arrival schedule, including a seed where all crates arrive at tick 0 and one where they trickle in slowly enough to force idling.
- `seeds` `[1,2,3,4]`
- `size` ~35 lines · `difficulty` **6/10**
- `bonus` Zero rejected drops.

---

## 6. World 4 — Cave Systems

Theme: unmapped tunnels. Unlocks `look` `mark` `readMark`.
This world's whole subject is **acting without knowing the map** — the largest mental shift in
the first half of the game.

---

### w4-01 — Headlamp  *(hardware in isolation)*
- `premise` A single tunnel. No map, no branches. Find the far end.
- `teaches` `look()` — local sensing of the four neighbours, and the difference between *seeing a tile* and *knowing the map*.
- `assumes` W1 traversal.
- `hardware` `look`
- `heritage` —
- `world` A single winding tunnel, no branches, no cycles, length 30–60, exit at the far end.
- `varies` The turn sequence.
- `anti-hardcode` The tunnel shape is generated per seed; no direction list works twice.
- `naive-fails` Any fixed sequence. `canMove` alone almost suffices, which is intentional — the level's job is to make `look()` feel like a strictly better `canMove` and to establish the "don't go back the way you came" rule that w4-02 then breaks.
- `generalize` Over tunnel shape, including one seed that starts with a turn on the first tile.
- `seeds` `[1,2,3]`
- `size` ~15 lines · `difficulty` **3/10**
- `bonus` Reach the exit without ever re-entering a tile.

### w4-02 — Breadcrumbs
- `premise` The tunnels loop back on themselves now. Reach the ore vein anyway.
- `teaches` **External memory** — `mark`/`readMark` as a visited set, because the world is the only place to keep state that survives a wrong turn.
- `assumes` `look`, tunnel following.
- `hardware` `mark` `readMark`
- `heritage` Visited-set graph traversal (DFS with an explicit visited marker).
- `world` 20×20 cave with 2–4 cycles and one ore vein.
- `varies` Topology, cycle placement, vein position.
- `anti-hardcode` The topology is generated per seed; the cycle positions are what break the memorized route.
- `naive-fails` The w4-01 rule loops forever and hits the tick budget. **The teaching moment is the failure**, so the trace must make the loop visible — the replay should show the bot going round and round.
- `generalize` Over topology, **including one acyclic seed**: on that shift the cave is a tree, w4-01's rule still works, and the player learns that marks are insurance rather than ceremony. That seed is what is left of the withdrawn `w4-03`, and the brief says out loud that not every cut has a loop in it.
- `seeds` `[1,2,3,4]`
- `size` ~30 lines · `difficulty` **5/10**
- `bonus` Solve it having placed fewer than *N* marks (forces thinking about *what* needs marking).
- `note` `w4-03` was authored as this level's mirror — a wall-following invariant, state in the algorithm rather than in the map — and shipped as this level's twin: the veteran pasted `w4-02`'s file into it unedited and took gold 34% under par. Nothing was transplanted because there was nothing here it did not already do; the acyclic seed is where its world went. **A wall-follower level can come back** if it is authored so a visited-set sweep genuinely fails it, which the 25×25 simply-connected maze was not.

### w4-04 — Map First, Move Second
- `premise` Three collection points, one lift, and a budget that only allows you to get lost once.
- `teaches` Separating **exploration from execution**: build an internal representation of what you have seen, then compute a route over the *known* graph and walk it once.
- `assumes` Visited sets, traversal, arrays/objects as data.
- `hardware` —
- `heritage` DFS exploration followed by BFS shortest path over the discovered adjacency.
- `world` 30×30 cave, 3 collection points, one Lift. Tick budget ≈ one full exploration pass plus one efficient circuit — not two circuits.
- `varies` Topology, collection-point positions, Lift position.
- `anti-hardcode` Topology and all four points of interest are drawn per seed.
- `naive-fails` Wandering to each collection point in turn costs 3–4× par because the same corridors get re-walked. The player has to pay for exploration once, keep what they learned, and then move deliberately.
- `generalize` Over topology and point placement, including a seed where two points are adjacent and one where all three are maximally spread.
- `seeds` `[1,2,3,4]`
- `size` ~70 lines · `difficulty` **7/10**
- `bonus` Visit the three points in the optimal order — a 3-point tour, brute-forceable in six permutations. **The bonus is cheap on purpose**: it absorbs ambition without adding a second hard problem.
- `frustration` **HIGH RISK — see §11.**

### w4-05 — The Deep Shaft  *(synthesis)*
- `premise` Five veins, one lift, and enough fuel to get back if you stop looking in time.
- `teaches` Online exploration under a budget — deciding **when to stop exploring**, because the same fuel pays for finding things and for coming home.
- `assumes` All of World 4.
- `hardware` —
- `heritage` Online graph exploration; the explore-vs-exploit "cow path" family.
- `world` 40×40 cave, 6–10 veins, one Lift. Quota 5 veins. Fuel ≈ 55% of a full exploration. Running dry away from the Lift fails the run.
- `varies` Topology, vein count and placement, fuel budget.
- `anti-hardcode` The fuel budget itself varies, so no fixed "explore for N ticks then turn around" constant survives.
- `naive-fails` Exhaustive mapping runs dry. Pure greedy nearest-unknown strands the bot at maximum depth with an empty cell. A reserved return budget is the only shape that works, and computing it requires knowing the path home — which requires having kept the map.
- `generalize` Over topology and budget.
- `seeds` `[1,2,3,4,5]`
- `size` ~90 lines · `difficulty` **8/10**
- `bonus` Return to the Lift with 20% of fuel unspent.

---

## 7. World 5 — The Grid

Theme: power infrastructure. Unlocks `power` `probe` `link`.
This is the game's most algorithmically classical world; three of its five levels have a named
textbook heritage and should be authored as honest, well-scaffolded versions of them.

---

### w5-01 — Mains  *(hardware in isolation)*
- `premise` A line of substations and one reactor. Energise all of them.
- `teaches` `power()` and **preconditions** — a node only energises if its upstream is already live.
- `assumes` Traversal.
- `hardware` `power`
- `heritage` —
- `world` 20×5, 6–9 substations in a line, reactor at one end.
- `varies` Chain length, station spacing, **and which end the reactor is on**.
- `anti-hardcode` The reactor end flips between seeds, so a fixed West-to-East loop fails half of them.
- `naive-fails` Powering in index order when the reactor is at the far end: every call fails, every failed call costs ticks, and nothing is energised. Small, but it establishes "read the direction from the world".
- `generalize` Over chain length and reactor end.
- `seeds` `[1,2,3]`
- `size` ~12 lines · `difficulty` **3/10**
- `bonus` Zero failed `power()` calls.

### w5-02 — Continuity Test
- `premise` Two hundred segments of feeder. One break. Ten probes.
- `teaches` **Binary search** — halving a search space instead of scanning it.
- `assumes` `power`, loops with computed indices.
- `hardware` `probe`
- `heritage` Binary search.
- `world` A 200-segment feeder run laid out as a long corridor. `probe(a,b)` reports whether the span between two points is continuous, at a tick cost. Probe budget: 10 (log₂200 ≈ 7.6).
- `varies` Break position.
- `anti-hardcode` The break position is the only variable and it is uniformly drawn; there is nothing else to memorize.
- `naive-fails` Probing every segment needs 200 probes against a budget of 10. There is no middle ground and no partial credit, which is exactly right for this idea.
- `generalize` Over break position. **Seeds must include position 0 and position n−1** — off-by-one is the entire difficulty of binary search and the level should say so through its seeds.
- `seeds` `[1,2,3,4,5]`
- `size` ~15 lines · `difficulty` **4/10**
- `bonus` Locate it in ≤ 8 probes on every seed.

### w5-03 — Order of Operations
- `premise` Sixteen substations, each with prerequisites. Energise all of them, once each.
- `teaches` **Topological sort** — turning a dependency graph into a valid linear order.
- `assumes` Preconditions, reading structured data from the world.
- `hardware` —
- `heritage` Topological sort (Kahn's algorithm, or DFS post-order).
- `world` 24×18, 10–16 substations with 1–3 prerequisites each, dependencies readable at zero tick cost.
- `varies` The DAG (shape, depth, fan-out) and station positions.
- `anti-hardcode` The graph itself is regenerated per seed; no static order exists across seeds.
- `naive-fails` Any static order. The "retry the whole list until nothing changes" loop **passes but sits far over par**, because every failed `power()` costs ticks — a deliberately tempting near-miss that teaches the difference between correct and good.
- `generalize` Over graph shape. Seeds must include: one deep chain, one wide shallow graph, one node with three prerequisites, and one graph with two disconnected components.
- `seeds` `[1,2,3,4]`
- `size` ~35 lines · `difficulty` **6/10**
- `bonus` Two stars: choose a valid topological order that also minimises travel between stations, and bring the district up on 20 `probe` reads or fewer. The retry-until-stable loop above is deliberately still allowed through — it is priced in ticks, and failing it on reads as well would be scoring it twice.

### w5-04 — Load Balance
- `premise` Every consumer needs a feeder. Every feeder has a ceiling. There is not much slack.
- `teaches` **Assignment under capacity constraints** — and that the *order you consider items in* determines whether a greedy method works.
- `assumes` Structured data, sorting.
- `hardware` —
- `heritage` Bin packing, first-fit-decreasing. **Par derives from an FFD reference solution. Optimality is never required.**
- `world` 26×20. 5–8 feeders with capacities, 12–20 consumers with draws. Total slack ≈ 8%.
- `varies` Capacities, draws, both counts.
- `anti-hardcode` All the numbers are drawn per seed; there is no assignment to memorize, only a rule.
- `naive-fails` First-fit in world order overflows on most seeds. Sorting descending first fixes it. The level exists to make that one line matter.
- `generalize` Over the numbers. **One seed must be constructed so that plain first-fit fails and first-fit-decreasing succeeds. One seed must have comfortable slack**, so the player's first honest attempt is rewarded before it is broken.
- `seeds` `[1,2,3,4,5]`
- `size` ~40 lines · `difficulty` **7/10**
- `bonus` Complete the assignment leaving the single largest feeder entirely unused.
- `narrative` This is where the Appendix C payoff lands (NARRATIVE.md §3.2).

### w5-05 — Blackout  *(synthesis)*
- `premise` The cabling is gone. Reconnect every substation to the reactor, then bring it all up in order.
- `teaches` **Network construction under a budget** — `link(a,b)` costs cable proportional to distance, and connecting everything cheaply is a different problem from connecting everything.
- `assumes` Topological sort, graphs, budgets.
- `hardware` `link`
- `heritage` Minimum spanning tree (Prim, or Kruskal + union-find). The union-find requirement is why this is an 8 rather than a 7.
- `world` 30×24, 10–14 substations at randomized positions, fixed reactor. Cable budget ≈ **108% of the MST weight** for that seed.
- `varies` Node positions, node count, budget.
- `anti-hardcode` Positions are drawn per seed, so the tree shape is different every time; the budget is computed *from* the seed's MST, so no absolute cable figure is meaningful.
- `naive-fails` A star topology (everything direct to the reactor) overshoots the budget by 50–100%. Nearest-neighbour chaining overshoots by 10–30% on most seeds. The 8% slack means a genuinely MST-shaped answer is needed, but a slightly imperfect one still passes.
- `generalize` Over point sets, including one clustered set and one near-uniform set.
- `seeds` `[1,2,3,4,5]`
- `size` ~70 lines · `difficulty` **8/10**
- `bonus` Come in within 2% of the true MST weight.
- `frustration` **HIGH RISK — see §11.**

---

## 8. World 6 — Deep Signal

Theme: a listening post. Unlocks `receive` `transmit` `decode`.
This world is mostly **data, not movement**. That contrast is the reason it sits after World 5:
it reads as a holiday even though its finale is an 8.

---

### w6-01 — Carrier Wave  *(hardware in isolation)*
- `premise` Packets are queued on the band. Read each one and send it back.
- `teaches` The receive/transmit loop: drain a queue until it is empty, and handle "empty" without crashing.
- `assumes` `while` loops.
- `hardware` `receive` `transmit`
- `heritage` —
- `world` 10×6 listening post. No traversal at all. 5–15 packets queued.
- `varies` Packet count and contents.
- `anti-hardcode` The packet count varies, so a counted loop fails; the contents vary, so nothing can be echoed from a literal.
- `naive-fails` A fixed-count loop; and assuming `receive()` never returns null, which it does the moment the queue empties.
- `generalize` Over queue length, including an **empty queue seed** — the level should be passable by a program that does nothing but must not crash.
- `seeds` `[1,2,3]`
- `size` ~8 lines · `difficulty` **2/10**
- `bonus` — (none. This one is a rest. Do not add a bonus.)
- `note` **This is the biggest deliberate difficulty drop in the game** (8 → 2), placed directly after `w5-05`. Content agents must not make it clever. If it takes more than five minutes, it is wrong.

### w6-02 — Checksum
- `premise` Some of the traffic is corrupt. Acting on corrupt traffic is how the south field harvested itself in 2207.
- `teaches` Validation — compute a checksum over a payload, compare, and **reject** rather than act.
- `assumes` Arrays, arithmetic, loops.
- `hardware` —
- `heritage` Additive mod-256 checksum and parity. (Deliberately **not** CRC — too much machinery for the payoff.)
- `world` Listening post. 20–40 packets, 10–30% corrupt. Acting on a corrupt packet commands the field bot to do something visibly, comically destructive in the replay.
- `varies` Corruption rate, which packets are corrupt, the checksum constant.
- `anti-hardcode` Which packets are corrupt is drawn per seed; an index list of "bad ones" fails immediately.
- `naive-fails` Acting on everything fails loudly. Rejecting everything fails the quota. The level requires an actual test.
- `generalize` Over the corruption pattern. **One seed must have zero corrupt packets; one must have the first packet corrupt.**
- `seeds` `[1,2,3,4]`
- `size` ~20 lines · `difficulty` **4/10**
- `bonus` Report *which byte* is wrong in each corrupt packet.

### w6-03 — Compression
- `premise` The route comes in compressed. The field either side of it is not survivable.
- `teaches` Decoding a compressed instruction stream and executing it — the encoded form is much shorter than the thing it describes.
- `assumes` Parsing loops, string/array handling.
- `hardware` `decode`
- `heritage` Run-length encoding.
- `world` 20×20 obstacle field plus an inbound RLE stream describing a safe route through it. Off-route tiles fail the run.
- `varies` The route, the obstacle field, **and the run-length magnitudes** — including runs of 1 and runs above 9.
- `anti-hardcode` The stream differs per seed and describes a different field; nothing is reusable.
- `naive-fails` Parsing one character per count breaks the moment a run has two digits — a bug that passes seed 1 and fails seed 3. Ignoring the stream and pathing independently fails because the field is not fully sensable from the route.
- `generalize` Over stream content and run magnitude.
- `seeds` `[1,2,3,4]`
- `size` ~25 lines · `difficulty` **5/10**
- `bonus` Transmit an RLE encoding of your own route back, shorter than the one you received.

### w6-04 — The Cipher
- `premise` The payload is enciphered. Nobody has the key. Every packet starts with the same four bytes.
- `teaches` **Key search against a checkable property** — generate candidates, test each with something you can verify, keep the one that passes.
- `assumes` `decode`, checksums, loops over a candidate space.
- `hardware` —
- `heritage` Brute-force key search + known-plaintext attack. (Frequency analysis is the *bonus*, never the requirement.)
- `world` Listening post. Keyspace ≤ 256 (single-byte XOR or Caesar shift), payload 40–200 bytes, with a known 4-byte magic header **always at offset 0**.
- `varies` Key, payload contents, payload length.
- `anti-hardcode` The key is drawn per seed. A hardcoded key fails on the second seed, immediately and unambiguously.
- `naive-fails` There is no key anywhere in the level. The player must accept that trying all 256 is not cheating — it is the answer. That reframe is the whole lesson.
- `generalize` Over key and payload. **Include a seed where the key is 0** (the payload is already plaintext), which breaks any solution that assumes the answer must be "interesting".
- `seeds` `[1,2,3,4]`
- `size` ~25 lines · `difficulty` **7/10**
- `bonus` Recover a key from a 2¹⁶ keyspace using letter-frequency scoring rather than the magic header.
- `frustration` **HIGH RISK — see §11.**

### w6-05 — Telemetry  *(synthesis)*
- `premise` The old station format nests. Some of it is corrupt. One block is still enciphered.
- `teaches` Parsing a **nested grammar** into a plan — a structure a flat loop cannot handle.
- `assumes` RLE decoding, checksums, key recovery.
- `hardware` —
- `heritage` Recursive descent parsing.
- `world` Obstacle field plus a stream of nested command groups with repeat counts, nestable to depth 4. Each group is independently checksummed; some are corrupt; one is enciphered.
- `varies` Grammar instance, nesting depth 2–4, which groups are corrupt, the key.
- `anti-hardcode` The grammar instance is generated per seed and its depth varies, so no fixed unrolling works.
- `naive-fails` A flat RLE-style parser succeeds at depth 1 and fails at depth 2. Recursion, or an explicit stack, becomes necessary and the level is built so the player discovers that from a failing seed rather than from the brief.
- `generalize` Over grammar shape and depth. Include a **depth-1 seed** so the flat parser passes once first.
- `seeds` `[1,2,3,4,5]`
- `size` ~60 lines · `difficulty` **8/10**
- `bonus` Repair one corrupt group using redundancy in the surrounding stream rather than discarding it.

---

## 9. World 7 — Swarm

Theme: a hundred cheap robots. Unlocks `bots` `spawn` `sync` `send`/`recv`.
Score is `max(bot.clock)` — **makespan** (DESIGN.md §4.3). Every level in this world is about
that number and nothing else.

---

### w7-01 — Two Bots  *(hardware in isolation)*
- `premise` Two corridors, two pads, two bots. Both pads by end of shift.
- `teaches` The virtual-clock model: issuing `b1.move()` then `b2.move()` moves them **in parallel**, and the score is the maximum clock, not the sum.
- `assumes` W1 traversal.
- `hardware` `bots` `sync`
- `heritage` —
- `world` Two separate corridors of different lengths, one bot and one pad in each. Physically trivial.
- `varies` The two corridor lengths.
- `anti-hardcode` Lengths vary, so each bot's loop must be condition-driven; but the real content of the level is *ordering*, which no memorization helps with.
- `naive-fails` Driving bot 1 all the way, then bot 2, produces a makespan of `len1 + len2` and misses par. Par sits just above `max(len1, len2)`, so only interleaving reaches gold.
- `generalize` Over lengths. Include a seed where both lengths are equal and one where they differ by 3×.
- `seeds` `[1,2,3]`
- `size` ~12 lines · `difficulty` **3/10**
- `bonus` Reach gold with a single loop body shared by both bots.
- `dependency` **The trace viewer must visibly show both bots moving at once.** If the replay serialises them, this level teaches the wrong model. Flagged to RENDER as a blocking dependency.

### w7-02 — Divide the Field
- `premise` The depot will spawn you as many bots as the requisition allows. The requisition changes weekly.
- `teaches` Static partitioning by **work**, not by area, when the number of workers is unknown until runtime.
- `assumes` Parallel clocks.
- `hardware` `spawn`
- `heritage` Static load balancing / partitioning.
- `world` 24×16 field, 3–8 spawnable bots, harvestable tiles distributed in **clusters**, not uniformly.
- `varies` Bot count, cluster positions and sizes, total work.
- `anti-hardcode` The bot count varies per seed, so no fixed number of partitions can be written down; the clustering varies, so no fixed partition boundary works.
- `naive-fails` Splitting the field into N equal *rectangles* hands one bot 50–60% of the crops, and makespan is set by the slowest bot. Equal area is the trap; equal work is the answer.
- `generalize` Over N and over cluster layout. Include a seed with one bot (the partition logic must degrade gracefully) and one where the work is genuinely uniform (where equal-area is fine, so the player learns the *condition*).
- `seeds` `[1,2,3,4]`
- `size` ~35 lines · `difficulty` **5/10**
- `bonus` Makespan within 10% of `total_work / N`.

### w7-03 — Right of Way
- `premise` One tunnel, one bot wide, and everybody needs to be on the other side.
- `teaches` Mutual exclusion — a shared resource that fits one user, where "try again if blocked" produces a livelock rather than a delay.
- `assumes` Partitioning, `sync`.
- `hardware` `send` `recv`
- `heritage` Mutual exclusion; token / turnstile discipline; livelock avoidance.
- `world` Two work areas joined by a single-width tunnel of length 6–12. 4–6 bots, each needing to cross at least twice.
- `varies` Tunnel length, bot count, work placement on each side.
- `anti-hardcode` Bot count and tunnel length both vary, so no fixed crossing schedule can be written; the work placement decides who needs to cross when.
- `naive-fails` "Move, and retry on false" produces sustained mutual blocking, each retry costing `BLOCKED_COST`, for a makespan 3–5× par. A global `sync()` before every crossing is correct but serialises the entire fleet and misses gold by a wide margin. The answer lives between the two.
- `generalize` Over fleet size and tunnel length. Include a **two-bot seed**, which is small enough to reason about by hand and should be the seed the player debugs on.
- `seeds` `[1,2,3,4]`
- `size` ~45 lines · `difficulty` **7/10**
- `bonus` Zero blocked moves across the entire run.
- `frustration` **HIGH RISK — see §11.**

### w7-04 — Dispatch
- `premise` Thirty jobs, eight bots, and jobs that take anywhere from one tick to twenty.
- `teaches` **Dynamic scheduling** — assign the next job to whichever bot becomes free first, rather than dealing all the jobs out in advance.
- `assumes` Partitioning, clocks, per-bot state.
- `hardware` —
- `heritage` List scheduling; LPT (longest-processing-time-first); job-shop scheduling.
- `world` 28×20 run out to Depot 0. 15–30 jobs with costs of 1–20 ticks, 4–8 bots.
- `varies` Job costs, job positions, bot count, **and the cost distribution's shape**.
- `anti-hardcode` Costs and positions are drawn per seed, and the distribution shape changes between seeds, so a strategy tuned to one shape is visibly punished on another.
- `naive-fails` Round-robin dealing is fine on a uniform cost distribution and terrible on a skewed one — one bot ends up holding three twenty-tick jobs. Dealing in world order is worse. Longest-job-first to the earliest-free bot is dramatically better and is the intended shape.
- `generalize` Over cost distributions. **One seed must be near-uniform (round-robin is fine) and one heavily skewed (round-robin is 2× par)**, so the player learns the condition rather than the rule.
- `seeds` `[1,2,3,4,5]`
- `size` ~50 lines · `difficulty` **8/10**
- `bonus` Makespan within 4/3 of the load lower bound. (Label the bonus with the ratio, never with "LPT".)

### w7-05 — Chain of Command  *(synthesis)*
- `premise` The targets are invisible until somebody stands next to them. You have scouts and you have workers.
- `teaches` **Message passing** — `send`/`recv` so that a bot which discovers something can inform bots that never saw it.
- `assumes` All of World 7, plus World 4's exploration.
- `hardware` —
- `heritage` Scout/worker (master–worker) with a shared work queue.
- `world` 36×28 partially-unknown hybrid of cave and field. 1–2 scouts, 4–8 workers. Targets invisible until adjacent.
- `varies` Topology, target placement, fleet composition (scout/worker split).
- `anti-hardcode` Topology and targets are drawn per seed and are unknowable at program-write time by construction — this level cannot be hardcoded even in principle.
- `naive-fails` Every bot exploring independently duplicates coverage and blows makespan. One scout followed by idle workers wastes the fleet. The scout must publish findings *as it goes* and workers must consume them without waiting for exploration to finish.
- `generalize` Over topology and fleet composition, including a seed with two scouts (so the publish channel must tolerate two producers).
- `seeds` `[1,2,3,4,5]`
- `size` ~90 lines · `difficulty` **9/10**
- `bonus` Workers idle for under 10% of the makespan.

---

## 10. World 8 — The Kessler Contract

Theme: the finale. Unlocks nothing (DESIGN.md §6). Four large levels plus one monster.

> **The opener rule still applies.** World 8 has no new hardware, so `w8-01` teaches World 8's
> genuinely new *mechanic* — the dual budget — in isolation, on a task the player already knows.

---

### w8-01 — Efficiency Audit  *(new mechanic in isolation)*
- `premise` A field job you could already do. Finance have halved what you may spend doing it.
- `teaches` **Optimisation as a skill separate from problem-solving** — ticks *and* the information budget are both hard gates now, not a primary and a secondary.
- `assumes` Worlds 1–3.
- `hardware` —
- `heritage` — (the second scoring axis, DESIGN.md §7: `Objectives.withinSenses`)
- `world` A compact 14×10 field-and-silo task, deliberately familiar and deliberately small. Shift budget 215 ticks (par 165); survey budget 16 `look` beams, against the 10 a one-ray-per-row sweep needs.
- `varies` Layout, ripeness, capacity.
- `anti-hardcode` Standard layout randomization, but the level's teeth are the budgets, not the seeds.
- `naive-fails` A perfectly correct World 2-style solution — sweep every row, harvest what is underfoot — spends no beams at all and still costs 220–252 ticks against a 215-tick shift. Asserted in `levels.test.ts` against the `fieldSweep` fixture. The two pressures pull opposite ways: the answer that never looks has to walk, and the answer that looks whenever it wants runs out of rating.
- `generalize` Over layout.
- `seeds` `[1,2,3,4]`
- `size` reference **under 15 lines** — smallness is the point · `difficulty` **5/10**
- `bonus` Two stars, one per axis: close the shift in 136 ticks, and survey the field on 10 beams — one a row. A player who cannot route well can still be excellent at looking.
- `note` **Deliberate plateau** after `w7-05` (9). Without it, World 8 reads 8-9-9-10 and the player reaches the monster already spent.

### w8-02 — Full Stack
- `premise` A subsurface depot nobody has inventoried. Find it, sort it, ship it.
- `teaches` **Pipeline composition** — sequencing your own subsystems (explore → route → deliver) without letting the seams leak. Nothing new is taught; the skill is integration.
- `assumes` Worlds 3 and 4.
- `hardware` —
- `heritage` — (composition level)
- `world` 34×26 subsurface depot. Unknown topology, 10–16 crates of 4–6 classes, depots discoverable only by exploring.
- `varies` Topology, crate and depot placement, the class→depot mapping.
- `anti-hardcode` The map is unknown at write time; the mapping is drawn per seed.
- `naive-fails` Explore-fully-then-route is correct and misses par: the tick budget is set so that delivering opportunistically *during* exploration is required. The clean phase separation the player learned in `w4-04` is the thing this level asks them to give up.
- `generalize` Over topology and mapping.
- `seeds` `[1,2,3,4,5]`
- `size` ~120 lines · `difficulty` **8/10**
- `bonus` Deliver at least half the crates before exploration is complete.

### w8-03 — The Grid Goes Down
- `premise` Twenty substations, a dependency graph, a fleet, and a deadline a single bot cannot meet.
- `teaches` That a topological order is a **partial** order — independent branches can be energised simultaneously by different bots.
- `assumes` World 5 (topological sort, capacity) and World 7 (fleets, makespan).
- `hardware` —
- `heritage` Parallel scheduling under precedence constraints; critical path; list scheduling on a DAG.
- `world` 32×24 grid. 14–20 substations in a DAG, 4–8 bots, feeder capacity limits still active, hard tick deadline.
- `varies` DAG shape, station positions, bot count, feeder capacities.
- `anti-hardcode` The DAG and the fleet size both vary; the correct parallel schedule is a function of both.
- `naive-fails` A single-bot topological walk is correct and misses the deadline by 2–3×. A naive even split across bots violates dependencies and burns ticks on failed `power()` calls. The player must extract levels from the graph rather than a line.
- `generalize` Over DAG shape and fleet size. Include a seed whose DAG is a single chain (where parallelism buys nothing and the player must recognise that) and one that is fully parallel.
- `seeds` `[1,2,3,4,5]`
- `size` ~110 lines · `difficulty` **9/10**
- `bonus` Two stars: achieve a makespan equal to the DAG's critical path length, and plan the restart on 26 `probe` reads or fewer. The second is a consolation, not a fifth way to fail a 9/10 — a player who cannot hit the critical path can still hit the read budget.

### w8-04 — Signal from 4470
- `premise` An eleven-month-old route description. Most of it is still true.
- `teaches` **Reconciling a decoded plan against observed reality** — decode and execution interleave, because some of the plan's landmarks have moved and you only find out by standing where they used to be.
- `assumes` World 6 (parsing, checksums, key recovery) and World 4 (unknown maps).
- `hardware` —
- `heritage` — (nearest cousin: map-matching / localisation against a stale map)
- `world` 30×30 subsurface. An enciphered, checksummed route description in the World 6 format. 15–30% of its landmarks have collapsed, moved, or been re-marked.
- `varies` Which landmarks are stale, the drift pattern, the key, the underlying topology.
- `anti-hardcode` The drift set is drawn per seed, so trusting the plan and distrusting the plan both fail on some seed; the key varies, so the plan is not even readable without World 6's technique.
- `naive-fails` Following the decoded plan literally walks into a collapsed section and fails. Discarding it and exploring from scratch blows the budget by ~2×. The shape required is *trust, verify, and re-plan locally on mismatch*.
- `generalize` Over drift pattern. Include a **zero-drift seed** (the plan is perfect) and a **heavy-drift seed** (over a third stale), so neither blind trust nor blind distrust survives.
- `seeds` `[1,2,3,4,5]`
- `size` ~110 lines · `difficulty` **9/10**
- `bonus` Complete without re-exploring any section the plan already described correctly.
- `narrative` This is World 8's story beat: the locker, the unsigned form, the Charter. See NARRATIVE.md §3.1–3.2. The level must be authored *with* the narrative agent's copy, not around it.

### w8-05 — The Kessler Contract  *(the monster)*
- `premise` Everything. Tonight. Under budget.
- `teaches` Nothing new. It is an integration exam and it should feel like one.
- `assumes` All thirty-nine previous levels.
- `hardware` —
- `heritage` Every heritage in this document, once: MST, topological sort, list scheduling, recursive-descent parsing, online exploration, capacitated routing.
- `world` 48×40. 6–12 bots. An unknown subsurface region. An infrastructure DAG to energise. A quota of material to route to depots by class. An inbound enciphered, partly-corrupt signal stream revealing part of the map and part of the graph. A hard deadline, a fuel budget and a character budget.
- `varies` Every axis above, independently drawn.
- `anti-hardcode` Seven seeds across six independent axes. The brief states the reason in-fiction: *"the Yards run this every night."*
- `naive-fails` Any solution that solves one subproblem well and the rest naively misses the deadline. The only shape that reaches gold is a fleet with **roles** — scouts, haulers, electricians — coordinated over `send`/`recv`.
- `generalize` Over everything at once. This is the only level in the game where that sentence is allowed.
- `seeds` `[1,2,3,4,5,6,7]` — the highest count in the game.
- `size` ~500 lines · `difficulty` **10/10** — the shipped reference source is 500 lines exactly.
  The ~250 this document carried until now was a planning figure from before the level existed;
  it was never true of anything that passes seven seeds. A player who has published the §18
  ladder writes considerably less of it here, which is the whole argument for the Repository.
- `bonus` **Three separate stars:** (a) beat the deadline by 20%; (b) come in a third under the character budget; (c) zero blocked moves across a 12-bot fleet.
- `note` **This level must be beatable at bronze by a patient player with a slow, ugly solution.** Bronze's deadline is generous; gold is where it bites. Gating the ending behind gold ends the game for most players one level before the payoff, and the payoff (NARRATIVE.md §3.3) is the reason the other 39 levels exist.

---

## 11. Frustration Watch

Four levels are at genuine risk of being **frustrating rather than hard** — where the player is
stuck on something that isn't the lesson. Each gets a named mitigation. Content agents must
implement the mitigation, not just note it.

### w4-04 — Map First, Move Second *(the biggest risk in the game)*
**Why it's risky.** It is the first level requiring a data structure the player invents
themselves. A player who has never represented a graph in code has to invent adjacency
representation, exploration, *and* shortest-path in one sitting, and the failure mode is a blank
editor — the worst kind, because there is nothing to debug.

**Defuse:**
1. **Starter code ships an empty `Map<string, string[]>` and a `key(x,y)` helper**, already
   typed, with a `// NOTE(4470)` above it saying he kept his the same way. This removes the
   representation question entirely and leaves the actual lesson intact.
2. Hint 1 separates the two halves explicitly: *"You are being asked to do two different things.
   Doing them at the same time is what is expensive."*
3. The bonus (optimal 3-point order) is deliberately trivial to brute-force — six permutations —
   so an ambitious player has somewhere to put their energy that isn't "rewrite the exploration".
4. The tick budget allows one wasteful exploration pass. A player who explores clumsily but
   routes well still passes.

### w5-05 — Blackout
**Why it's risky.** MST is the most textbook-shaped ask in the game and the fail state is
numerically opaque: you are 9% over a budget and the run says no, with no indication of *which*
cable was the mistake.

**Defuse:**
1. **The verdict must report cable spent vs. budget vs. the best possible**, and the replay must
   draw the laid cable so an overshoot is visible as a shape, not a number. Without this the
   level is guesswork. Flagged to RENDER and RUNTIME.
2. The 8% slack is generous on purpose — a correct-but-imperfect Prim passes comfortably.
3. Hint 2 points at the invariant without naming it: *"Every cable you lay either connects
   something new, or it doesn't."*
4. The 2%-of-optimal bonus is where perfectionism goes, so the pass bar can stay soft.

### w6-04 — The Cipher
**Why it's risky.** It's the only level where the player might reasonably conclude that the
game has not given them enough information. A player who does not think of brute force will sit
there hunting for a key that does not exist anywhere in the level, which feels like a bug rather
than a puzzle.

**Defuse:**
1. **The brief states the keyspace size outright**: "single-byte key" is in Vance's memo as a
   procurement complaint about cheap radios. Knowing the space is 256 wide is what makes brute
   force thinkable, and it costs the puzzle nothing.
2. The magic header is stated in the brief too — the player is told *what* they are looking
   for, and must work out *how*.
3. Hint 1: *"There are not many keys. There is exactly one way to know when you have the right
   one."*
4. Frequency analysis, which genuinely is a leap, is moved entirely into the bonus.

### w7-03 — Right of Way
**Why it's risky.** Concurrency failures look like the *engine* misbehaving rather than the
program. A player watching two bots politely bounce off each other forever will suspect a bug in
the game before they suspect a livelock in their code — and they will be wrong, which is a
uniquely bad place to leave someone.

**Defuse:**
1. **A dedicated failure code and message for sustained mutual blocking**, not a generic
   timeout — the game must name what happened. NARRATIVE.md §5 line 21 exists for this, and
   memo KD-2704 sets it up one level in advance — it is circulated in **`w7-02`'s brief**, where
   the apron is open ground and none of it bites — so the player has heard the words "sustained
   mutual courtesy" before it happens to them. `w7-03`'s brief cites it by number.
2. **A two-bot seed is the first seed**, small enough to trace by hand.
3. The replay must render blocked moves distinctly (a bump, a spark) so the player *sees* the
   collisions rather than inferring them from a tick count. Flagged to RENDER.
4. Hint 2: *"Both bots are being polite. Politeness is symmetric. Something here needs to not
   be."*

**Honourable mention — w2-02 Rotation.** Not high risk, but it fails silently in a boring way:
you arrive, the crop isn't ready, nothing visible happens. Mitigation is a renderer growth-stage
overlay (already listed as a dependency in the level block). Without it the level is opaque; with
it, it is a 3.

**The one this list missed.** `w3-03` Manifest was rated 5/10 here and cost the beginner
**fifty-five minutes, eleven runs and all four hints** — the exact profile this section exists to
catch. It is withdrawn. Three things put it there and each is a rule now: an objective that
grades text must **diff** rather than report `0 of 5 — 5 short` (shipped, `Objectives.printedSequence`);
a level must never require a bot to identify a machine by a property the machine does not carry
(`terrain`, `mark` and `machineId` were all silent, so the only method was standing on every pad);
and **a four-hint budget that spends three hints on one idea is a one-hint budget** — those three
restated the intended insight while nothing addressed the actual blocker, which was the geometry.

---

## 12. Duplicate Concepts Caught and Replaced

The bar is **one distinct idea per level**. Recorded here so nobody re-introduces them.

Three were caught in draft and replaced:

| Level | Rejected draft | Duplicated | Replacement | New concept |
|---|---|---|---|---|
| `w5-02` | "Power a longer, branching chain" | `w5-01` (preconditions again) | **Continuity Test** | Binary search; the only halving-a-space idea in the game |
| `w7-02` | "Spawn more bots and do `w7-01` again" | `w7-01` (parallel clocks, scaled) | **Divide the Field** | Partitioning by work when the worker count is unknown at write time |
| `w8-01` | "A medium mixed level" | Everything and nothing | **Efficiency Audit** | Optimisation under a dual budget — ticks and the information budget — as a skill in its own right |

Three more were caught **in play**, and shipping them was the mistake this section was supposed
to prevent. The tell in every case is the same one: an experienced player passes on the first
honest run without thinking, and can say in one sentence what the previous level's file needed
changed. Recorded so the argument does not have to be had twice:

| Withdrawn | Duplicated | The tell |
|---|---|---|
| `w1-02` Forty-Five Metres | `w1-01` (a longer straight route) | Both testers passed first run. 45 literal `move` calls took gold, the star and both objectives. |
| `w2-03` Rotation | `w2-02` (the same serpentine, one predicate on) | *"Two lines different from w2-02."* Folded together; the merged level is `w2-02`. |
| `w4-03` Left Hand on the Wall | `w4-02` (the same visited-set sweep) | `w4-02`'s file pasted in unedited took gold 34% under par. |

`w1-04` Grid Reference and `w3-05` The Night Shift were withdrawn for a different reason: not
duplication but thinness. `w1-04`'s brief contained its own formula (*"x becomes 10 - x"*), so
the level was transcription; `w3-05` is `w3-02` plus "you can now carry several", and the
beginner passed it first run at 680 against a par of 439 and reported feeling nothing.

**Near-duplicates that were kept, with the distinction stated:**

- `w2-04` (capacity → return to silo) vs `w5-04` (bin packing). Adjacent but distinct:
  w2-04 is *one* resource consumed over time and resumed; w5-04 is *many* containers filled
  simultaneously with an ordering decision. Keep both; never let their briefs use the same
  vocabulary.
- `w4-04` (shortest path over a discovered graph) vs `w1-01` (walk a route somebody dictated).
  Distinct: a stated route vs. a graph you had to build first.
- `w3-02` (spatial routing) vs `w7-04` (temporal scheduling). Both look like "assign work
  well"; one optimises distance for one agent, the other optimises finish time across many.

---

## 13. Concept Ledger — the 34 distinct ideas

| # | Level | Concept |
|---|---|---|
| 1 | w1-01 | Issuing an action; the coordinate model; bounded repetition |
| 2 | w1-03 | Conditional repetition on a sensed predicate |
| 3 | w1-05 | Nested iteration for systematic coverage |
| 4 | w2-01 | Free sensing vs. costly action; conditional action |
| 5 | w2-02 | Multi-phase per-cell cycle; stale state after acting |
| 6 | w2-04 | Resource cap; interrupt and resume a traversal |
| 7 | w2-05 | Prioritisation under a deadline you cannot beat exhaustively |
| 8 | w3-01 | Carry semantics; a single-slot resource |
| 9 | w3-02 | Dispatch table keyed by data read from the world |
| 10 | w3-04 | Order-preserving processing; a queue |
| 11 | w4-01 | Local sensing in an unknown map |
| 12 | w4-02 | External memory as a visited set |
| 13 | w4-04 | Build a graph, then plan over it |
| 14 | w4-05 | Explore vs. exploit under a shared budget |
| 15 | w5-01 | Preconditions; direction read from the world |
| 16 | w5-02 | Binary search |
| 17 | w5-03 | Topological sort |
| 18 | w5-04 | Assignment under capacity; order of consideration matters |
| 19 | w5-05 | Minimum-cost network construction |
| 20 | w6-01 | Drain a queue; handle the empty case |
| 21 | w6-02 | Validation; rejecting untrusted input |
| 22 | w6-03 | Decoding a compressed instruction stream |
| 23 | w6-04 | Candidate search against a checkable property |
| 24 | w6-05 | Parsing a recursive grammar |
| 25 | w7-01 | Parallel clocks; makespan as the metric |
| 26 | w7-02 | Partitioning by work with an unknown worker count |
| 27 | w7-03 | Mutual exclusion; livelock |
| 28 | w7-04 | Dynamic scheduling by earliest-free worker |
| 29 | w7-05 | Message passing; scout/worker |
| 30 | w8-01 | Optimisation under a dual budget (ticks *and* information) |
| 31 | w8-02 | Pipeline composition with interleaved phases |
| 32 | w8-03 | Precedence constraints executed in parallel |
| 33 | w8-04 | Reconciling a stale plan against observation |
| 34 | w8-05 | Integration under simultaneous constraints |

**Six ideas left with the six withdrawn work orders**, and only two of them are losses worth
recording. *Coordinate arithmetic and signed deltas* (`w1-04`) was never a puzzle — the brief
printed the formula — and the skill reappears inside every later `goTo`. *Capacitated multi-stop
routing* (`w3-05`) survives as `w7-04`'s temporal cousin. *Time-dependent world state* (`w2-03`
as drafted) never shipped in that form at all. The two genuine losses:

- **Aggregation into a frequency map, and the "sensing is free, so do not move" insight.** The
  best mechanic idea in World 3 by the beginner's reading, and it deserves a level with a legible
  map and an identifiable terminal. It is not in the campaign now.
- **Constant-memory invariant traversal** (a wall follower). Worth having, but only in a world
  where the visited-set answer genuinely loses, which `w4-03`'s maze never made it do.

---

## 14. Anti-Hardcode Audit

DESIGN.md §5: *"Randomized worlds kill hardcoded solutions."* Every level must name the
randomization that does the killing. The one declared exception is `w1-01` (§3), where the
tutorial matters more than the rule.

| Randomized axis | Levels |
|---|---|
| Distance / length | w1-03, w4-01, w5-02, w7-01, w7-03 |
| Endpoint positions | w1-05, w2-02, w3-01, w5-01 |
| Object distribution | w2-01, w2-02, w3-01, w3-02, w7-02, w8-01 |
| **A mapping the player must read, not know** | w3-02, w8-02 |
| Set membership / which classes exist | w3-02, w6-02 |
| Arrival or event schedule | w3-04, w1-05 (door phase) |
| Topology of an unknown map | w4-02, w4-04, w4-05, w7-05, w8-02, w8-04 |
| Graph shape (DAG) | w5-03, w8-03 |
| Numeric parameters (capacity, budget, quota, key) | w2-04, w2-05, w4-05, w5-04, w5-05, w6-04 |
| Worker count | w7-02, w7-04, w7-05, w8-03, w8-05 |
| Distribution *shape* (not just values) | w7-04, w8-04 |
| Grammar instance and depth | w6-03, w6-05 |

**The strongest anti-hardcode guarantee in the game** is `w7-05`, where the targets are
invisible until a bot stands next to them. That level cannot be hardcoded even in principle,
and it is worth having one such level as an existence proof.

---

## 15. Seed Policy

1. `seeds.length >= 3` from World 2 (DESIGN.md §5). World 1 uses 1, 3, 4.
2. **Seed 1 is the teaching seed.** It should be the friendliest instance: the layout where the
   player's first honest idea works or nearly works. Every other seed is there to break it.
3. **Every level's seed list must contain at least one degenerate case.** Empty set, single
   element, index 0, index n−1, depth 1, one bot, zero corrupt packets, key = 0. These are
   named in the individual level blocks and are not optional.
4. **Seed order matters in the UI.** Run seed 1 first and stop on first failure, so the player
   gets the most legible failure rather than the last one.
5. Never author a seed whose only distinction is different numbers. If a seed does not test a
   different *decision*, it is padding and should be removed.

---

## 16. Authoring Checklist

Before a level is considered done:

- [ ] `teaches` is one sentence and does not duplicate any row in §13.
- [ ] `anti-hardcode` names a specific axis, not "it's random".
- [ ] `naive-fails` describes a real approach a real player would try first.
- [ ] The seed list contains the degenerate case named in the level block.
- [ ] Reference solution exists in `src/levels/**/__solutions__/` and passes **every** seed.
- [ ] `par.ticks` = reference ticks − ~10%, and the reference uses the *intended heuristic*,
      not an optimal solver (§2 rule 4).
- [ ] `brief` is readable by someone who skipped the flavour; no requirement is hidden in a joke.
- [ ] `hints` are nudges. No hint contains code. No hint names the algorithm.
- [ ] `heritage` does not appear anywhere in player-facing text.
- [ ] Nothing in the brief, hints, docs, or starter reveals the solution shape beyond the
      scaffolding explicitly authorised in §11.
- [ ] The failure a player is most likely to hit produces a legible message from
      NARRATIVE.md §5, not a generic one.
- [ ] `bonus` absorbs ambition rather than adding grind.

---

## 17. Open Questions for the Orchestrator

Not changes — flags. DESIGN.md is the contract and this document does not amend it.

1. **DESIGN.md §6, World 4 hardware.** `mark`/`readMark` is a great fit for `w4-02`, but
   `w4-04` and `w4-05` need the player to keep a **map in program memory**, which the current
   hardware list doesn't gate or teach. Consider whether the docs should explicitly state that
   ordinary JS objects persist for the run's duration. This is a documentation gap, not a
   mechanic gap.
2. **DESIGN.md §6, World 5 `link`.** `link` is listed as a World 5 unlock but is only used by
   `w5-05`. That is a lot of engine surface for one level. Either accept it as a finale-only
   verb, or give `w5-04` a link-based variant.
3. **DESIGN.md §6, World 7 fuel.** `w4-05` and `w8-05` both depend on a **fuel budget** that
   DESIGN.md's cost model (§4.4) does not define. It could be expressed as a per-bot `maxTicks`,
   which would need no new mechanic. Orchestrator's call.
4. **DESIGN.md §7, medal points.** The Performance Review tiers in NARRATIVE.md §7 assume
   gold = 3, silver = 2, bronze = 1, bonus star = +1. If scoring picks different weights, the
   tier thresholds need updating with them.

---

## 18. The Brick Ladder

The Repository (`docs/LIBRARY.md`) is optional and stays optional: **every level on this ladder
is solvable by writing the same routine inside the level**, and a player who never opens the
second editor tab finishes the campaign with the same medals. What the ladder specifies is
something else — which routines are worth *owning*, where each one is earned, and which later
work orders are authored on the assumption that it exists.

The rule that decides membership: **a routine with one caller is not a brick.** A level is added
to the reuse column only when its brief could honestly name the routine — when the natural
solution really does want that shape, not when a caller could be forced.

### 18.1 The six bricks

| Routine | Earned in | Named by | Costs ticks? |
|---|---|---|---|
| `survey(b?)` — look every way from where a bot stands, record what it saw | w4-04 | w4-05, w7-05, w8-02 | no |
| `pathTo(x, y, b?)` — walk a bot to a tile the record already knows | w4-04 | w4-05, w7-02, w7-05, w8-01, w8-02, w8-03 | **yes** |
| `waves(deps)` — group a dependency graph into startable-at-once sets | w5-03 | w5-05, w8-03 | no |
| `unpack(route)` — a run-length route into the moves it stands for | w6-03 | w6-05, w8-04 | no |
| `findKey(packets)` — the shift a band was sent with | w6-04 | w6-05, w8-04, w8-05 | no |
| `deal(costs, fleet)` — heaviest job to the least-loaded worker | w7-04 | w7-05, w8-03 | no |

`pathTo` is the only one with weight, which makes it the one the Cost tab has something to say
about: walking costs ticks, so a cheaper `pathTo` measurably improves six work orders at once.
The other five are free at the tick level and earn their place on reuse alone.

**Earned means earned.** The five levels in the first column import nothing. Their briefs close
with a paragraph saying the routine is worth keeping and naming it, so that the name the later
brief uses is a name the player has already read. A brief must never make the earning level
*sound* like it is missing something.

### 18.2 The two composites

| Routine | Built from | Earned in | Named by |
|---|---|---|---|
| `reach(x, y, b?)` — route to a tile, surveying first when the record does not know it yet | `survey` + `pathTo` | w8-02 | w8-04, w8-05 |
| `dispatch(deps, costs, fleet)` — group the work into waves, deal each wave across the fleet | `waves` + `deal` | w8-03 | w8-05 |

These exist because the best thing this system can show a player is a routine of theirs calling
two other routines of theirs, and the tick cost flowing up through the chain into the work order
that called the outermost one (`meterExport`, `docs/LIBRARY.md` §2). w8-02 and w8-03 are the two
levels whose brief says so outright: *"they are two routines and this depot wants one."*

`w8-05` then imports `findKey`, `reach` and `dispatch` — one brick and two composites — which is
the joke and the payoff at the same time. The whole site runs on Contractor #4471's code.

### 18.3 The refactor beat

`survey` and `pathTo` are written in World 4 against the single-bot binding, and World 7 hands
the player a fleet. `w7-02`'s brief says plainly that the filed `pathTo` will not work here and
that the fix is a trailing `b?: Bot` argument. Because the argument is optional, the four earlier
work orders that already import it keep passing untouched — which is what the regression suite is
for, and the cheapest possible demonstration that it works.

Do not "fix" this by shipping the bot argument from `w4-05`. World 4 has no `bot()`; the growth
is the lesson.

### 18.4 Deliberate absences

- **`w4-04`, `w5-03`, `w6-03`, `w6-04`, `w7-04`** — these are the earning levels. Handing a player
  the routine the level exists to teach is the one thing this system must never do.
- **`w6-02`'s checksum** — reused by `w6-05` and by nothing else. World 8's band uses a different
  check (unsalted, mod 1000), so it has exactly one caller and is therefore not a brick. Do not
  add it to §18.1 without first unifying the two packet formats, which is a level change and
  needs re-proving on every seed of `w8-04` and `w8-05`.
- **A fleet-wide router separate from `pathTo`** — rejected as padding. One routine that grew an
  argument is better content than two routines that do the same thing.
