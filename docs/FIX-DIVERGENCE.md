# FIX-DIVERGENCE — every objective can say where the run went wrong

`docs/AUDIT-INCENTIVES.md` finding 1: 31 of 34 work orders could report only the string `not met`,
so the *read* step of run → fail → read → revise was empty and the loop degraded to guessing.
Written as the work happened; each section was appended when its unit finished.

---

## 1. The mechanism

Three pieces, all in `src/engine/objectives.ts`.

### `Objectives.custom` gains a required report

```ts
export interface CustomReport {
  progress?(ctx: ObjectiveContext): [number, number];
  divergence(ctx: ObjectiveContext): Divergence | undefined;
}
```

`custom(id, label, fn, report)` is the shape every call site converts to. `divergence` is
required; `progress` is not. **The asymmetry is the whole change.** A count answers "how far off";
only a divergence answers "off where", and a level that ran the comparison already holds the answer
to the second. `divergence` may still return `undefined` at runtime for a failure with no single
point — what it may not do is not exist.

The old positional form (`custom(id, label, fn, progress?, divergence?)`) survives as a second
overload while the campaign converts, so the tree stays green and each world lands as its own
commit. It is deleted once the list in §2 empties, at which point the type system asks the question
at every call site on its own.

### `Objectives.checkbox(id, label, fn)`

Sets `binary: true` on the objective and nothing else — no `progress`, no `divergence`. It is a
*positive statement* that the objective asks a question whose only two answers are yes and no, and
whose label already says which one the run gave. It is deliberately not the default, and the test
below caps how many of them the campaign may hold.

### The builders that only counted now name a point

`allTilesAre` (first tile off spec), `tileCount`, `inventoryAtLeast`, `itemsDelivered`,
`machinesAllIn` (the first machine still in the wrong state), `withinTicks`, `withinSenses` and
`withinOps` all gained a `divergence`. `botAt`, `machineState` and `printedSequence` already had
one. So the invariant needs no builder-shaped exemption: **binary, or a divergence. No third
option.**

A progress tuple is explicitly *not* a third option. `0 of 5 — 5 short` is the exact readout
`docs/PLAYTEST-BEGINNER.md` §3 lost fifty-five minutes to.

## 2. The test that keeps it

`src/levels/__tests__/legibility.test.ts`, 38 tests. Two instruments:

**Static, four tests.** Every objective in every level's `objectives` and `bonus` is either
`binary` or carries a `divergence` function; none is both; a binary objective carries no progress
tuple either; and no more than `MAX_BINARY` objectives in the whole campaign are binary.

**Empirical, one test per level.** The empty program is driven through each level's first seed and
every objective it misses must come back with a filled-in `{where, expected, received}` whose
fields are non-empty and inside `DIVERGENCE_VALUE_CHARS`. This is the half that catches a
`divergence` that exists and returns `undefined` on the commonest failure there is — and the empty
program is precisely the run the audit measured `not met` on.

`AWAITING_A_DIFF` lists the objectives not yet converted. The assertion is a **subset** check, not
an equality one: an id may leave the list the moment its level converts, but nothing new may ever
join it. That is what makes the guard safe to land before the conversion finishes, and what makes
a partial conversion mergeable.

**Starting inventory, measured rather than estimated** — 98 objectives across 34 levels
(61 required, 37 bonus):

| | count |
|---|---|
| reported a real `Divergence` | 9 |
| progress tuple only | 55 |
| **nothing at all — `not met`** | **34** |

The audit's "only three levels can produce a Divergence" was true when it was written; `w8-03` and
`w8-05` gained theirs from `docs/FIX-POWER.md` the same day. The 55 progress-only ones are the
larger problem by count: they are not silent, but `2 of 3 — 1 short` on a level that knows *which*
one is the same defect wearing a number.

## 3. The two bundled fixes from `docs/FIX-PAR.md` §7

**A — the silver band.** `medalFor` in `src/engine/verdict.ts` now reads
`ticks <= Math.max(parTicks + 1, parTicks * SILVER_FACTOR)`. Behaviour-preserving for every par of
four or more, which is 32 of the 34 levels, so it can only move a medal on `w5-02` and `w6-01` —
which is what it is for. `graded` (DESIGN.md §11 A7) has not been adopted in the code, so the
widening was needed rather than optional.

`src/levels/__tests__/levels.test.ts` kept its list of the two small pars, because the arithmetic
that made the widening necessary is still worth naming and a third arrival is worth knowing about.
What it no longer claims is an unreachable rung: a new test grades the ladder directly instead,
walking every integer from 0 to `2 * par + 4` on every level and asserting all three medals are
awarded somewhere. All 34 pass.

**B — `SILVER_FACTOR`.** It now lives once, `export const SILVER_FACTOR = 1.25` in
`src/engine/verdict.ts`, is re-exported through `src/engine/index.ts`, and `src/game/score.ts`
re-exports the engine's copy rather than declaring its own. `medalFor` reads the constant instead
of an inline literal, so the live number and the named number are the same number. The assertion in
`levels.test.ts` that needed a name for it still has one.

## 4. The content deletions

Three rows of prose the game now says out loud, all of them the "told me" half of
`docs/PLAYTEST-BEGINNER.md` §9.

- **`w8-03.ts` and `w8-05.ts`** — the `power()` fact rows deleted rather than corrected, per the
  orchestrator's ruling. `power()` throws an explained `IllegalActionError` naming the machine and
  its tile, so a fact row explaining what an error message already says is a third telling.
- **`w4-02`'s brief** — Dot's *"what i can tell you is that the tunnels join up"* cut.
  `docs/FIX-PROSE.md` finding 4 made this conditional on a path trail landing; it has landed, and
  `docs/shots/w4-02/naive-tick1601-halted.jpg` shows the naive tunnel-follower painting the closed
  circuit as a solid red ring against bare rock.

  **What the player is left with.** The cut answers the counter-argument that the trail only speaks
  *after* a run, because the warning was never the only pre-run telling. The starter still opens
  with `// NOTE(4470): the tunnel joins back onto itself. more than once` and
  `// NOTE(4470): the junctions all look the same from inside`, in 4470's voice, at the exact place
  the player starts typing. Dot's line was the *third* statement of the same fact and the only one
  the player had no reason to act on yet. What remains of her line — survey's map is a photograph
  of a wiped whiteboard — still says the useful half: there is no map, so make one. The brief drops
  from 44 words to 28.

## 5. World 4 — converted, and the worked example

All 11 objectives across `w4-01`, `w4-02`, `w4-04` and `w4-05`. Two helpers added to
`src/levels/world-4/objectives.ts` because four levels needed the same two shapes: `endedOn`
(the goal tile against where the bot actually stopped) and `died` (the tick, tile and reason).

### `w4-04`'s bonus — what the player now reads

The failing bonus row reads, driving the worst of the six orders on seed 1:

> `(7, 21) → (25, 3) → (13, 21)`  **want** `224 steps`  **got** `448 steps`

`where` is the order the run actually took, recovered from the trace — the player's own output.
`expected` is the cost of the best of the six orders. `received` is the cost of theirs. Both are
*shortest-route* costs, so the comparison isolates the ordering: a player who took the right order
badly is not told they took the wrong one.

**It does not report the best order, and that is deliberate.** The audit proposed reporting both
the order taken and the best order. Six permutations of three stops is the entire content of the
bonus — hint 4 says so outright, *"There are six ways to order three stops. Six is a small enough
number to simply try all of them."* Printing the winning permutation is the answer key, and
`docs/FIX-POWER.md` set the standard that feedback is a diff, not an oracle. The cost is the diff:
it is a number the player could have computed and did not, it proves a better order exists, and it
says by how much. A test asserts `expected` and `received` contain no coordinate at all.

A run that never stood on all three gets a different point, because the ordering question does not
apply yet: `the collection points / want all 3, in some order / got 0 of 3`.

### The rest of World 4

| Objective | `where` | `want` / `got` |
|---|---|---|
| `w4-01/reach-tunnel-end` | `end of run` | the pad's coordinates / where the bot stopped |
| `w4-01/single-pass` | `tick 34 · (9, 7)` | `a tile the bot has not been on` / `stood here at tick 12` |
| `w4-02/reach-vein` | `end of run` | the vein / where the bot stopped |
| `w4-02/mark-budget` | `marks placed` | `fewer than 180` / `412` |
| `w4-04/collect-all` | the first point never reached | `stood on` / `never reached` |
| `w4-04/end-on-lift` | `end of run` | the lift / where the bot stopped |
| `w4-05/end-on-lift` | `end of run` | the lift / where the bot stopped |
| `w4-05/bot-recovered` | `tick 210 · (14, 9)` | `the bot still running` / the `die` event's own reason |
| `w4-05/fuel-reserve` | `fuel burned` | `96 of 120` / `118 of 120` |

`w4-05/ore-quota` already reports one: it is `Objectives.inventoryAtLeast`, which gained a
divergence with the other builders.

**Every goal in World 4 is randomized per seed**, which is why the coordinate pair matters more
here than anywhere: `not met` hid two different mistakes that look identical in the editor — a
route that stopped short, and a route that went to the wrong chamber. `w4-01/single-pass` reports
real ticks off the `move` events rather than a visit index, because a `where` that says "tick" and
means "the fourth tile" is worse than no `where`.

`src/levels/world-4/__tests__/divergence.test.ts`, 8 tests. Nothing in `w4-*` changed *what* an
objective checks — only what it says when it fails — and the four reference solutions pass
unedited.

## 6. `docs/FIX-REWARDS.md` §3 — tier 5's threshold

`min: 93 → 100` applied in `src/game/score.ts`. **FIX-REWARDS was wrong that no test depends on
it**: it checked `src/ui/screens/__tests__/review.test.ts` and missed
`src/game/__tests__/score.test.ts`, whose boundary test asserted `reviewTier(93).grade` is
`RETAINED`. That assertion now reads `99.9 → EXCEPTIONAL`, `100 → RETAINED`.

**The paired text change was not made.** Tier 5's body in `score.ts` is annotated *"verbatim from
NARRATIVE.md §7"*, and `docs/NARRATIVE.md` belongs to another agent, so changing the string here
would break the one invariant that keeps the two in step. `'Every work order on this site'` still
needs to become `'issued to you'` in **both** files, together.

## Worlds 1 and 2

All 15 `AWAITING_A_DIFF` entries for `w1-01`, `w1-03`, `w1-05`, `w2-01`, `w2-02`, `w2-04` and
`w2-05` — 13 distinct helpers, all of them in `src/levels/world-1/shared.ts` and
`src/levels/world-2/shared.ts`, because both worlds draw their layout per seed and so declare
every objective through a builder rather than a coordinate. No `Objectives.checkbox` was used:
each of the 13 turned out to be holding a tick, a tile, a swing or a reading it was throwing away.

Nothing changed *what* an objective checks. The seven reference solutions pass unedited, and
`world-1.test.ts` and `world-2.test.ts` (55 tests, including both directions of every bonus star)
pass unedited too.

| Objective | `where` | `want` / `got` |
|---|---|---|
| `w1-01/reach-pad` | `end of run` | the pad / where the bot stopped |
| `w1-03/reach-pad` | `end of run` | the pad *this seed* drew / where the bot stopped |
| `w1-03/within-7-canMove` | `canMove()` | `at most 7 readings` / `19 readings` |
| `w1-03/within-7-canMove` | `ticks beyond the shortest route` | `at most 5` / `11` |
| `w1-05/inspect-all` | `(2, 1)` | `entered at least once` / `never entered` |
| `w1-05/one-move-per-tile` | `tick 43 · (2, 1)` | `43 moves, one per floor tile` / `move 44 of 200` |
| `w2-01/park-ripest` | `(10, 1), where the run parked` | `growth 8 of 8` / `growth 1 of 8` |
| `w2-01/no-overshoot` | `end of run` | `parked on the ripest crop` / `(10, 1), growth 1 of 8` |
| `w2-01/no-overshoot` | `the drive` | `3 ticks, straight there` / `5 ticks` |
| `w2-02/harvested-ripe` | `(4, 1)` | `harvested` / `never harvested` |
| `w2-02/all-planted` | `(4, 1)` | `planted` / `1 swing, nothing sown` |
| `w2-02/no-wasted-fieldwork` | `tick 0 · (1, 1)` | `a swing that finds something` / `harvest took nothing, 2 wasted in all` |
| `w2-04/harvested-crops` | `(1, 1)` | `harvested` / `1 swing, nothing taken` |
| `w2-04/all-planted` | `(1, 1)` | `planted` / `5 swings, nothing sown` |
| `w2-04/crop-spoilage` | `(3, 2), the tile that stood longest` | `18 spoilage in all` / `383, and 100 of it here` |
| `w2-05/hopper-full-crop` | `the hopper at the end of the run` | `8 crop` / `3 crop, 3 ice, 2 spare` |
| `w2-05/tile-footprint` | `tick 31 · (9, 3)` | `32 tiles` / `tile 33 of 37` |

Two objectives report two different points depending on which of their two clauses failed, which
is why they appear twice.

### `w2-01` — the level whose answer is a coordinate

Bay 9 is one row of ten tiles and the work order is *park on the highest reading*, so the ripest
tile's coordinate **is** the answer and does not appear in either objective. What the run gets
back is the reading under its own wheels against the reading it was hunting — and the reading it
was hunting is already on the facts table, twice: *"Exactly one tile has it, and it reads at
`maxGrowth`"*. `expected: growth 8 of 8` therefore tells the player nothing the brief did not,
while `received: growth 1 of 8` tells them the thing they could not otherwise know, which is that
the tile they stopped on is not close. A test asserts that neither `expected` nor `received` ever
contains a bracket, and that no field anywhere in the report contains the ripest tile's own
coordinate.

`no-overshoot` is the same problem one step further on, because its allowance *is* the distance to
the answer: on a single row, `expected: 9 ticks` names the column. So it splits. A run that did
not park on the ripest crop is not asked about ticks at all — the ordering question does not apply
yet, exactly as in `w4-04` — and is told `parked on the ripest crop` against the tile and reading
it chose. Only a run that **already found the tile** is quoted the allowance, and by then the
allowance is a distance to a tile it has in hand. Two branches, and the leak closes.

### `w2-04/crop-spoilage` — the row, not the schedule

The bonus grades a total, and a total is the readout `docs/PLAYTEST-BEGINNER.md` §3 lost the
afternoon to: `24 of 18` says how far off and never says which tile carried it. The ledger is now
computed per crop, so the miss names the tile that stood ripe longest and splits the sum —
`383, and 100 of it here`. It says which tile to think about; it does not say when to be standing
on it, which is the whole content of hints 4 and 5.

### `w1-03` — naming the pad is safe, and the ration had a silent half

The corridor length is drawn per seed and the pad's coordinate is the level's answer, so reporting
it looks like handing it over. It is not, for the reason `w4` already relies on: **every declared
seed has to pass**, and `w1-03` declares three that draw three different lengths. A memorized
`(19, 1)` fails seeds 4 and 7 — which `world-1.test.ts` has asserted since before this change.

The more interesting fix on that level is `within-7-canMove`. It grades two things — readings used
*and* ticks wasted past the shortest route — and its progress tuple only ever counted the first.
A run that spent no readings at all and drove eleven ticks into the far wall read `0 / 7` and
`not met` in the same breath, which is worse than silence: the number on screen was the half the
run got right. The divergence now reports whichever clause actually failed, and the wasted-ticks
branch is measured against the seed's own pad rather than a declared constant.

### `w2-02` and `w2-04` — "never went" is not "went and found nothing"

Every fieldwork objective in World 2 now separates the two, because the trace can and the fraction
could not. `harvested` / `never harvested` is a route problem; `harvested` / `1 swing, nothing
taken` is a *timing* problem — the bot was standing on the tile with the arm down and the crop was
not ready, or the hopper was full. Those are different bugs with different fixes and they used to
print the same character. The same split runs on `all-planted`: `still bare` against
`1 swing, nothing sown`, which is precisely hint 3's mistake — planting before harvesting, so the
plant is refused and the harvest leaves the tile empty.

`w2-05/hopper-full-crop` is the same instinct applied to the hopper. `5 / 8` cannot say why, and
`3 crop, 3 ice, 2 spare` can: the slots the ice took are the entire lesson of the level and the one
reading the player has no way to take once the shift is over.

### Tests

`src/levels/world-1/__tests__/divergence.test.ts` (15) and
`src/levels/world-2/__tests__/divergence.test.ts` (31). Each drives a program wrong in one specific
way and asserts the exact `{where, expected, received}` — the plant-before-harvest sweep, the
blind overrun, the ping-pong that spends two moves on two tiles, the run that picks the plot forty
ticks late, the hopper filled with ice first. `w2-01` gets the withholding test that `w4-04`
established: the report may not contain a bracket, and may not contain the answer's coordinate.

Both files close with a world-scoped copy of `legibility.test.ts`'s empirical half, run against
**every declared seed** rather than only the first, so the 15 `AWAITING_A_DIFF` entries can be
struck off against a green tree rather than against the first shift of each level.

## World 8 — the finale, converted

The 13 objectives across `w8-01`..`w8-05` that still reported a bare bit or a bare count. The five
that already reported a real diff — `w8-03/grid-live`, `w8-03/precedence-held`, `w8-05/grid-online`,
`w8-05/precedence` and `w8-05/file-form`, landed by `docs/FIX-POWER.md` — are untouched and produce
exactly what they produced before.

**No `Objectives.checkbox` was added.** The two that look binary from the label are the two the
level knows most about. `w8-04/bot-intact` has a `die` event carrying a tick, a tile and a reason
string; `w8-05/no-blocked-moves` knows the tick, the bot, the tile and *why* the sim refused —
which is the whole content of the objective, because a move into rock, a move into a bot that had
not moved yet and a move at a door nobody has paid the toll on cost the identical tick and are
three different programs. `MAX_BINARY` is where it was.

### What each one now reads

| Objective | `where` | `want` | `got` |
|---|---|---|---|
| `w8-01/ripe-to-silo` | `(10, 0)` | `harvested and taken to the silo` | `still standing; it was ripe at the start` |
| — when the field is clear | `the silo at (13, 9)` | `12 crops` | `0 crops, 3 still in the arms` |
| `w8-01/audit-tight` | `tick 136` | `every ripe crop already in the silo` | `8 of 12 in; the run ended at 220` |
| `w8-02/depot-sorted` | `(12, 9)` | `this bay takes ice` | `1 ore lying on it` |
| — when nothing is misfiled | `depot-ore` | `2 ore on the bay` | `no ore there, 3 still in the arms` |
| `w8-02/ship-while-you-look` | `tick 412, the last sighting` | `6 crates already on their bays` | `0 were` |
| — when the floor was never seen | `the last crate or bay` | `in view at some point in the shift` | `never came into view` |
| `w8-03/within-shift` | `RIG-830, the last to stop` | `tick 218` | `tick 600` |
| `w8-03/tight-shift` | `RIG-830, the last to stop` | `tick 154` | `tick 600` |
| `w8-04/form-recovered` | `KD-0001-T at the end of the run` | `in the bot` | `still in the locker; the bot stood on it` |
| `w8-04/bot-intact` | `tick 88 · (9, 4)` | `the bot still running` | the `die` event's own reason |
| `w8-04/no-resurvey` | `tick 612 · (19, 22)` | `inside 4 tiles off the plan` | `tile 5 of 23 off it` |
| `w8-05/quota` | `depot-ice at (19, 11)` | `4 ice on the tile` | `no ice there` |
| `w8-05/deadline` | `KD-80, the last to stop` | `tick 3000` | `tick 3200` |
| `w8-05/under-budget` | `KD-80, the last to stop` | `tick 2400` | `tick 3200` |
| `w8-05/fleet-utilisation` | `KD-80` | `idle for 35% of the shift at most` | `idle for 100% of it` |
| `w8-05/no-blocked-moves` | `tick 214 · KD-82` | `(41, 20) open to step into` | `the airlock had not been opened yet` |

Three shapes recur, so they live once in `src/levels/world-8/shared.ts` rather than five times:
`overranBy` (a tick budget pinned to the bot whose own clock set the end tick), `worstIdler` (the
idlest bot by name and its share) and `firstBlockedMove`. `worstIdleFraction` was split so the two
readings come off one map and cannot drift; the number it returns is unchanged.

**Four objectives are two objectives wearing one label**, and the branch is the point. A crop left
in the ground and a crop left in the arms are a route that missed a tile and a last trip nobody
made. A crate on the wrong bay and a class that is short are a mapping error and a haul that never
happened. A form still in the locker with a footprint on the tile and one without is a `pickup` in
the wrong place and a route that never arrived. The count these pairs share cannot tell them apart,
which is why the count on its own was the defect.

### The two that hold a plan

`w8-04/no-resurvey` was the one worth thinking about, because the bonus *is* the plan. The level
holds the filed route, which sections of it have come down, and where each bypass runs; the whole
work order is reconstructing enough of that to walk it. So the report names **one of the run's own
footprints and nothing else**: the tile that spent the allowance, dated with the tick the bot stood
on it. Never a leg of the filed route, never a fallen stretch, never a count of either.

The allowance itself is repeated in `expected` (`inside 4 tiles off the plan`) and that is not a
leak — it has always been the denominator on the progress bar, so `strayAllowance`, and with it the
number of sections that have come down, was already on screen. What is new is the *point*: `44 / 34`
said a budget was missed, and the tile says which step of the wander was the one that could not be
afforded. Two tests hold the line — the named tile is asserted to be off-plan, and `expected` and
`received` are asserted to contain no `N`, `E`, `S` or `W` and no mention of a section.

`w8-02/ship-while-you-look` gets the same treatment for the same reason: the class-to-bay mapping
and the crate census are what the shift is for. Its divergence is **ticks and counts only** — the
tick the last crate or bay came into view, how many crates the objective wanted delivered by then,
and how many were. It names no crate and no bay. A run that never saw the whole floor is told that
in words rather than given `tick Infinity`.

`w8-04/form-recovered` never gives the locker's coordinates: a form still in it is *described*, not
located, because the locker's tile is the last thing the filed plan resolves to. What it does add is
whether anybody stood there, which is free — it is a fact about the run, not about the map. Driving
`literalPlanFollower` (`src/levels/__tests__/naive.ts`) across the five seeds produces both halves:
seed 5's drift throws it off before it arrives, seed 3's carries it over the locker tile and out the
far side, so it reaches for the form standing somewhere else.

`w8-05/quota` is the opposite case and is deliberately more generous. Every crate and every bay is
broadcast on the antenna as a `CRATE` or `DEPOT` line, so the tile costs the level nothing, and the
in-hold count is the useful half: it separates crates never fetched from crates fetched and still
aboard when the shift ended.

### Tests

`src/levels/world-8/__tests__/divergence.test.ts`, 23 tests. Eighteen drive a program that is wrong
in one nameable way and assert the point that comes back; five are the per-seed sweep, because the
campaign-wide guard in `legibility.test.ts` drives the empty program through each level's *first*
seed and World 8 randomises more per seed than any other world — the silo's corner, the class-to-bay
mapping, how much of the plan has come down.

The finale's tests are deliberately cheap. Nothing here drives a reference shift: `w8-05/deadline`
is provoked with one `wait`, `w8-05/no-blocked-moves` by walking to the airlock stand and pushing
east into a door nobody has paid for, and `w8-04/bot-intact` by building the `die` event, since
nothing on that level kills a bot. Two objectives whose failing state costs a hundred and sixty
ticks of sweeping to reproduce — `w8-01/ripe-to-silo`'s second branch and `w8-04/bot-intact` — are
tested against a hand-built `ObjectiveContext`, the shape `src/levels/__tests__/divergence.test.ts`
already uses for `w8-05/precedence`. The two naive programs that already existed, `fieldSweep` and
`literalPlanFollower`, are reused rather than reinvented: a naive program is exactly the run whose
failure has to be legible.

Nothing in `w8-*` changed *what* an objective checks. No `par`, medal threshold, `budget` or `costs`
value moved, no brief, facts row, hint, starter or label was touched, and the five reference
solutions pass unedited.

## Worlds 6 and 7

All twenty objectives across `w6-01`..`w6-05` and `w7-01`..`w7-05`. `stayOnRoute` in
`src/levels/world-6/signal.ts` moved to the options form too — it already reported a divergence and
still reports exactly the same one, so the shared `src/levels/__tests__/divergence.test.ts` is
untouched. **No objective in either world became a `checkbox`.** Every one of them turned out to be
holding a tick, a tile, a bot id or a packet index that the run could not see for itself; `no-bumps`
and `no-slack`, which read as the two most binary things in the campaign, both know the bot, the
tick, the tile and the engine's own reason for the refusal.

Two helpers were added because pairs of levels wanted the same shape: `point` in
`world-6/signal.ts` (a coordinate, for `w6-05/reach-pad` alongside `w6-03`'s `Objectives.botAt`),
and `at` plus `firstBump` in `world-7/shared.ts` (`w7-01/no-slack` and `w7-03/no-bumps` grade the
same rule and now say the same thing about it).

| Objective | `where` | `want` / `got` |
|---|---|---|
| `w6-01/log-the-band` | `line 1` | the packet that line should hold / what was printed |
| `w6-02/relay-clean` | `packet 2 on the band` | `held back` / `relayed` |
| `w6-02/name-the-fault` | `packet 2 on the band` | `a different byte` / `byte 5` |
| `w6-03/shorter-encoding` | `characters on the wire` | `fewer than 36` / `36` |
| `w6-04/relay-plain` | `packet 0` | `plain text opening "KD//"` / the line as it went out |
| `w6-04/straggler` | `the straggler` | `a different shift` / `shift 37` |
| `w6-05/reach-pad` | `end of run` | the pad / where the bot stopped |
| `w6-05/repair-blocks` | `block 1 on the band` | `a different repair` / the run's own `fix` line |
| `w7-01/both-parked` | `bot #0` | `(7, 1)` / `(1, 1)` |
| `w7-01/both-heard` | `bot #0` | `a message from the other bot` / `3 empty recv() calls` |
| `w7-01/no-slack` | `bot #0 · tick 6` | `a clear tile at (8, 1)` / `a wall` |
| `w7-02/field-cleared` | `(3, 3)` | `harvested` / `still standing, 32 left` |
| `w7-02/within-ten-percent` | `the whole run` | the allowance / the clock the last bot stopped on |
| `w7-03/crates-in-silo` | `(15, 2)` | `column 1` / `column 15` |
| `w7-03/no-bumps` | `bot #0 · tick 1` | `a clear tile at (0, 1)` / `a wall` |
| `w7-04/board-clear` | `job-17` | `done` / `4 of 12 uses` |
| `w7-04/within-bound` | `the whole run` | `69 ticks` / `279 ticks` |
| `w7-05/sites-up` | `site-0` | `on` / `cold, never reached` |
| `w7-05/told-where-to-go` | `bot #2 · tick 12` | `an order read before this` / `no order all shift` |
| `w7-05/workers-busy` | `bot #1 waited longest` | `under 2 idle ticks in all` / `20 in all, 5 on this bot` |

### `w6-02/name-the-fault` — how much of the corrupt packet you may show

The bonus asks which of a packet's four to ten payload bytes was altered. The level knows: it holds
both check differences, and hint 5 of `w6-05` states the same arithmetic outright — one difference
is the size of the change, the other is that size times where it happened. So the byte index is
sitting one line from being printed, and printing it is the whole bonus.

What goes out instead is `packet 2 on the band` / **want** `a different byte` / **got** `byte 5`.
The number in `received` is the run's own answer. It rules out exactly one of that packet's bytes
and says nothing about the other nine, and the modular arithmetic that finds the right one is
untouched. The packet index is not withheld, because it is not the bonus's secret: which packets
fail their checks is the *required* objective on the same level, published in the fact table as the
shape of a fault line, and unreachable-without on the way here.

The same line is drawn three more times in these two worlds:

- **`w6-04/straggler`.** The straggler has no header, so its plain text is the one thing on that
  band a program cannot confirm — which makes it the answer. The report never contains a character
  of it. It gives back the shift the run actually used, recovered from what went on the wire:
  `the straggler` / `a different shift` / `shift 37`. One of ninety-five candidates is eliminated,
  the number doing the eliminating is the player's own, and ninety-four are left to sift. A test
  asserts the divergence for the do-nothing run contains no word of the straggler's text.
  `relay-plain`, by contrast, may say `plain text opening "KD//"` — the header is published in the
  facts and is the level's own intended test, so a report that repeats it gives nothing away.
- **`w6-05/repair-blocks`.** *Where* the altered character sits is the arithmetic the bonus exists
  for, and the character falls straight out of the position, so neither appears. The block is named
  by the slot it arrived in — the player's own copy of the band — and the run's own line comes back
  beside it: `block 1 on the band` / `a different repair` / `fix main|1E`.
- **`w7-05/sites-up`.** The relay sites are on no plan and `probe()` with no argument is the only
  thing on that level that finds one. A coordinate in the report would not be a diff, it would be
  the search. What it says instead is the one thing the program genuinely could not observe:
  whether anybody ever stood there. `cold, never reached`, `cold, reached but not switched on`, and
  `cold, switched on and off again` are three different mistakes that `4 of 9` was hiding — the
  last one being a fleet that used the site twice and wrapped it back off. A test asserts no field
  of that divergence contains a coordinate.

### `w6-03/shorter-encoding` — kept, and why it is not the deleted metric

**Ruling: keep it, and report the character counts.** The deleted program-character metric scored
the length of the *player's source*. `shorter-encoding` scores the length of a *message the bot
sends over the band*, which the level's brief makes diegetic — *"the band is metered by the
character. finance reads the invoice and nothing else"* — and which is the entire content of the
bonus. Nothing about it is a second axis on the program: two players who write the same
`transmit()` line score identically however long their programs are.

So `characters on the wire` / `fewer than 36` / `36` is a legitimate diff. The inbound length is not
new information — the packet is in the player's hands — but the comparison is, and which two groups
can be merged into one is still all the work. The three failures ahead of it get their own points
first: the wrong number of lines, a stream that does not parse (`a count then N, E, S or W`), and a
faithful-looking route that turns at the wrong place (`move 2 of the route` / `S` / `E`). That last
one quotes the route back, which is fine — the player has already decoded it to walk it.

### The tests

`src/levels/world-6/__tests__/divergence.test.ts`, 16 tests, and
`src/levels/world-7/__tests__/divergence.test.ts`, 17 tests. Both drive programs that are wrong in
one specific way through `runLevel`. `flatReader` (`w6-05`) and `roundRobinDispatch` (`w7-04`) come
straight from `src/levels/__tests__/naive.ts`; `rawRelay` was not reusable as a divergence fixture
because it never calls `transmit`, so `w6-04` gets an equivalent relay-it-untouched driver built on
`__solutions__/_api.ts` instead. `w7-05`'s order rule reads only the `use` and `recv` log, so those
three cases write the log directly rather than driving thirty ticks of pathfinding to provoke one
event — the same instrument `w8-05` uses in `src/levels/__tests__/divergence.test.ts`.

Nothing in either world changed *what* an objective checks. No par, medal threshold, budget or cost
moved, and the ten reference solutions pass unedited. Every objective in both worlds produces a
filled, in-bounds `{where, expected, received}` for the empty program **on every shipped seed**, not
just the first — which is what the entries below are safe to strike from `AWAITING_A_DIFF`.

## Worlds 3 and 5

All 17 objectives across `w3-01`, `w3-02`, `w3-04` and `w5-01`…`w5-05`, converted from the
positional form to `CustomReport`. No `checkbox` was declared in either world: every one of the
seventeen turned out to have run a comparison it was throwing away. Two helper modules added,
`src/levels/world-3/objectives.ts` (`at`, `crates`, `ordinal`) and
`src/levels/world-5/objectives.ts` (`at`, `firstNotIn`, `cableLegs`), because the same three
shapes recur across eight levels.

Nothing here changed *what* an objective checks — only what it says when it misses. No `par`,
threshold, `budget` or `costs` value moved, and the six reference solutions pass unedited.

### What the player now reads

Real values, driven on each level's first seed unless noted.

| Objective | `where` | `want` | `got` |
|---|---|---|---|
| `w3-01/pads-loaded` | `(11, 1)` | `a crate` | `(nothing)` |
| `w3-01/clean-run` | `tick 0 · (6, 1)` | `a grab that takes a crate` | `took nothing, and cost a tick` |
| `w3-01/clean-run` (no empty grab) | `the whole run` | `157 ticks` | `400 ticks` |
| `w3-02/crates-sorted` | `the depot at (14, 4)` | `2 crates` | `0 crates` |
| `w3-02/one-depot-at-a-time` | `tick 77 · (9, 6)` | `a depot not used yet` | `last used at tick 9, then left` |
| `w3-04/bay-cleared` | `arrival 1, from (3, 2)` | `on the outbound bay` | `still in the yard` |
| `w3-04/bay-in-order` | `1st crate onto the bay` | `arrival 1` | `arrival 2` |
| `w3-04/aisle-discipline` | `tick 33 · (9, 3)` | `18 empty slots at most` | `the 19th, of 26 in the run` |
| `w5-01/energised` | `sub-1 · (4, 2)` | `on` | `off` |
| `w5-01/in-order` | `tick 4 · sub-2` | `sub-1 already on` | `sub-1 was still off` |
| `w5-01/in-order` (never latched) | `sub-1 · (4, 2)` | `switched on after reactor` | `never switched on` |
| `w5-01/one-pass` | `tick 1 · (1, 2)` | `east, the way the run started` | `west` |
| `w5-02/patched` (several) | `relays patched` | `exactly 1` | `2: relay-0, relay-1` |
| `w5-02/patched` (one, wrong) | `relay-0` | `the segment the run goes dead at` | `patched, and it is not that one` |
| `w5-03/cabled` | `reactor → sub-1` | `a cable` | `(nothing)` |
| `w5-03/energised` | `sub-1 · (9, 5)` | `on` | `off` |
| `w5-03/in-order` | `tick 0 · sub-2` | `sub-1 already on` | `sub-1 was still off` |
| `w5-03/tight-order` | `sub-8 → sub-2` | `104 steps in all` | `122 steps by this leg` |
| `w5-04/assigned` | `consumer-1` | `exactly 1 feeder` | `feeder-1, feeder-2` |
| `w5-04/within-capacity` | `feeder-1` | `at most 19` | `102, from 17 consumers` |
| `w5-04/largest-idle` | `feeder-4, the largest at 26` | `no consumers on it` | `1, drawing 8` |
| `w5-05/connected` | `sub-1 · (2, 7)` | `a cable back to the reactor` | `cabled to sub-2` |
| `w5-05/budget` | `reactor → sub-6` | `72 of cable in all` | `79 spent by this one` |
| `w5-05/energised` | `tick 0 · sub-1` | `a live cable already reaching it` | `nothing live was joined to it` |
| `w5-05/tight` | `the whole run` | `68 of cable` | `133 of cable` |

`w5-02`'s two remaining objectives are `Objectives.withinSenses`, which gained a divergence with
the other builders.

### The ordering objectives — the audit's own example, four times over

`w5-01/in-order`, `w5-03/in-order` and `w5-05/energised` each already replayed the trace to decide
whether a station came up before the thing feeding it. Each held the offending pair and the tick
and reported the bit. They now say `tick 4 · sub-2 / sub-1 already on / sub-1 was still off` — the
run's own decision, at the moment it was made. Nothing is given away: the chain is `probe`-able for
nothing on all three levels, and every one of them has a fact row saying so.

The same shape covers the two "never happened" cases separately, because a station that was latched
at the wrong moment and a station that was never latched at all are different mistakes that looked
identical: `sub-1 · (4, 2) / switched on after reactor / never switched on`.

### `w5-04/largest-idle`, and the diff that was one line away

The star's whole predicate is `loadOn(largest) === 0`. Both sides of that comparison were already
computed and neither was printed. It now reports `feeder-4, the largest at 26 / no consumers on it
/ 1, drawing 8`. Every capacity in the yard is a free `probe`, so naming the largest feeder costs
the level nothing; what it does not name is *which* consumer to move instead, because deciding that
is the packing and the packing is the level. A test asserts the report contains no `consumer-` id.

### What these deliberately do not say

**`w5-02/patched` is the one where the interesting decision was the withholding.** The level knows
`breakAt`. It also knows which relay the run patched, so a report of the form "the break is further
along than `relay-88`" was available and would have been genuinely useful — and would have cost the
level its subject. Two hundred segments and ten readings is a bisection exercise; a direction handed
back after every run is worth exactly one reading, and a player who took one per run would close the
run in eight attempts having bisected nothing, and would still pass the probe budget, because they
never spent a probe. That is a difficulty change wearing a legibility change's clothes. So a wrong
single patch is told only that it is wrong, and a test asserts no digit and no directional word
appears in the pair.

What the report *does* add is the case the level really does hide: a search that tests with `power`
instead of `probe` leaves three or four relays patched and cannot see that from its own source.
`relays patched / exactly 1 / 2: relay-0, relay-1`.

**`w3-02/crates-sorted` names the short depot by tile and never by class.** Which stencil takes
which class is the table the level exists to make the player build, and it is repainted between
shifts. The tile is one free `scan` away, so the coordinate costs the player a look and leaks
nothing; printing `the chip depot` would have handed back a row of the answer. A test asserts the
`where` does not contain the depot's class.

**`w5-05/tight` prices the run and never draws it**, which is the trade `w4-04`'s bonus makes and
the reason that section is the house style. The tight allowance is the one number in the district
the reactor does not report, and it is one the player could have worked out from positions that are
free to read; the tree that achieves it is the star. A test asserts the whole report contains no
station id, no `reactor` and no coordinate.

**`w5-03/tight-order` and `w5-05/budget` name a leg, not an order.** Both used to report a running
total against an allowance, which says how far over without saying where. They now name the pair of
stations the crew was walking between, or the cable that was being laid, when the allowance ran out
— the run's own route, cut at the point it stopped fitting. Neither names a better route.

### The tests

`src/levels/world-3/__tests__/divergence.test.ts`, 9 tests, and
`src/levels/world-5/__tests__/divergence.test.ts`, 21 tests. Each drives a program that is wrong in
one specific way — a shift that returns to a finished depot, a crate shipped second-first, a station
latched with its feeder cold, a yard cabled entirely onto `feeder-1`, a star topology laid out of a
drum sized for a tree — and asserts the exact `{where, expected, received}` that comes back. Four of
them assert a withholding rather than a value.

`npx tsc --noEmit`, `npx vitest run src/levels/world-3 src/levels/world-5`,
`npx eslint src/levels/world-3 src/levels/world-5` (the known `w5-01` solution error excepted) and
`src/levels/__tests__/legibility.test.ts` are all clean.

---

## 12. Closing the mechanism

With every world converted, three things were finished off.

**The positional overload of `Objectives.custom` is deleted.** `custom(id, label, fn, report)` is
now the only signature and `report.divergence` is required, so the type system asks the question at
every call site and there is no shorter call to fall back to. Writing a silent objective now takes
a deliberate `Objectives.checkbox`.

Deleting it surfaced **eleven call sites the campaign-wide guard could not see**, because the guard
walks `LEVELS` and these are not reachable from one:

| Where | What |
|---|---|
| `world-1/shared.ts` ×2, `world-2/shared.ts` ×4 | exported objective builders no shipped level uses **yet** |
| `world-8/w8-03.ts` ×2, `world-8/w8-05.ts` ×3 | already had divergences, passed positionally |
| `engine/__tests__/divergence.test.ts` ×2, `senses.test.ts`, `game/__tests__/playback.test.ts` | fixtures |

The six unused builders were given real divergences rather than left as `checkbox`: the first
blocked move with the engine's own reason, the drive against its shortest possible length, the
first ripe tile still standing, the first unripe one taken, the first swing that came back empty,
and the swing count against the crop count. A dormant builder is exactly where the defect would
have grown back — the next level to reach for one would have inherited the silence.

`engine/__tests__/divergence.test.ts`'s *"an objective that reports nothing stays exactly as it
was"* became *"a checkbox reports the bit and nothing else"*, which is the same assertion about a
shape that now has to be asked for.

**`AWAITING_A_DIFF` is deleted.** The guard asserts an empty list outright.

**`BINARY_BY_DESIGN` is empty, and that is the finding.** Not one objective in the campaign needed
`checkbox`. Four agents worked the eight worlds independently and none of them found a genuinely
binary objective — every one of the 98 held a tick, a tile, a count or a pair of values it had
already computed in order to answer, and was throwing away. The ones that looked most binary
(`w2-01/park-ripest`, `w7-03/no-bumps`, `w8-04/bot-intact`, `w4-05/bot-recovered`) were among the
richest. `checkbox` stays in the API: the rule needs a legal exit or people route around it, and
the empty list is a cheaper artifact than a rule nobody can satisfy.

### Final state

| | |
|---|---|
| objectives in the campaign | **98** (61 required, 37 bonus) across 34 levels |
| reporting a divergence | **98** |
| reporting a bare bit | **0** — was 34 |
| declared `checkbox` | **0** |

**Tests: 1619 passing, 64 files.** Baseline when this change started was 1389, and 1440 after the
merges that landed mid-flight, so **+179**. They break down as: 38 campaign-wide guard, 1 medal
ladder, and 140 world-level assertions in seven new `world-N/__tests__/divergence.test.ts` files
(8 + 46 + 30 + 33 + 23). Four of the world suites re-run the empirical guard over **every** shipped
seed rather than the first, which is stricter than the campaign guard itself.

`npx tsc --noEmit` silent · `npm run build` clean · `npx eslint src` reports only the one known
pre-existing `w5-01.ts:32` `rules-of-hooks` false positive.

**Difficulty is unmoved.** No `par`, medal threshold, `budget` or `costs` value was touched, no
objective's `evaluate` changed what it checks, no objective `id` was renamed (they are save keys),
and no `brief`, `facts`, `hints` or `starter` text was edited beyond the three deliberate deletions
in §4. All 86 reference-solution tests pass unedited.

### What was refused, and why it is the same rule

Three objectives could have been made more legible only by handing over the answer, and were not:

- **`w5-02/patched`** — the level knows where the break is. "It lies further along" would have been
  worth one free reading per run, and a player could then close 200 segments in eight runs having
  bisected nothing while still passing the probe budget, because they never probed. That is a
  difficulty change, so a wrong single patch is told only that it is wrong. What it *does* now
  report is the case the level genuinely hid: a search that tests with `power()` instead of
  `probe()` leaves several relays patched.
- **`w4-04/best-order`** — reports what the best order costs, never which order it is.
- **`w6-02/name-the-fault`** — returns the run's own guess and the fact it is wrong, ruling out one
  byte of four to ten, and never the right one.

The audit asked for `best-order` to "report the order taken and the best order". Half of that is a
diff and half is an answer key, and `docs/FIX-POWER.md` already ruled which half the game ships.
