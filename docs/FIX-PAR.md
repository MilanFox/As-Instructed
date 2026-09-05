# Par is default-gold through World 2

Working file for the OPEN-ITEMS entry "Par is default-gold through World 2. Deliberately frozen
until the above lands, because the fix is either 'raise par' or 'par is not the axis' and that
depends on the new bonuses." Appended to per unit of work, in order.

## 1. Measurement — par vs the reference solution, all 34 levels

Method: every level's reference solution under `src/levels/world-*/__solutions__/` driven against
every shipped seed through `runReference`, recording `trace.endTick`. The registry moved out of
`levels.test.ts` into `src/levels/__tests__/solutions.ts` so the par work and the solvability work
measure the same 34 programs. Headroom is `(par − worst seed) / par`: how much slack a player has
over the reference on the seed that costs the most.

Silver cut-off is `floor(par × 1.25)` (DESIGN.md §7).

| Level | Par | Ref worst | Ref best | Headroom | Silver cut | Bonuses | Per-seed ticks |
|---|---:|---:|---:|---:|---:|---:|---|
| w1-01 | 78 | 78 | 78 | **0.0%** | 97 | 0 | 78 |
| w1-03 | 24 | 24 | 7 | **0.0%** | 30 | 1 | 18, 24, 7 |
| w1-05 | 50 | 50 | 35 | **0.0%** | 62 | 1 | 44, 40, 50, 35, 35 |
| w2-01 | 18 | 18 | 9 | **0.0%** | 22 | 1 | 15, 9, 18, 13 |
| w2-02 | 76 | 72 | 68 | 5.3% | 95 | 1 | 72, 68, 72, 68 |
| w2-04 | 52 | 46 | 38 | 11.5% | 65 | 1 | 46, 38, 46, 38 |
| w2-05 | 74 | 68 | 58 | 8.1% | 92 | 1 | 58, 64, 68, 61, 63 |
| w3-01 | 157 | 157 | 91 | **0.0%** | 196 | 1 | 157, 138, 91 |
| w3-02 | 332 | 332 | 219 | **0.0%** | 415 | 1 | 219, 332, 245, 300 |
| w3-04 | 365 | 365 | 88 | **0.0%** | 456 | 1 | 357, 179, 365, 88 |
| w4-01 | 52 | 52 | 48 | **0.0%** | 65 | 1 | 48, 52, 50 |
| w4-02 | 391 | 391 | 214 | **0.0%** | 488 | 1 | 214, 359, 391, 304 |
| w4-04 | 970 | 970 | 826 | **0.0%** | 1212 | 1 | 826, 916, 970, 920 |
| w4-05 | 700 | 566 | 348 | 19.1% | 875 | 1 | 478, 544, 566, 428, 348 |
| w5-01 | 37 | 32 | 22 | 13.5% | 46 | 1 | 22, 32, 27 |
| w5-02 | 2 | 2 | 2 | **0.0%** | 2 | 1 | 2, 2, 2, 2, 2 |
| w5-03 | 76 | 76 | 48 | **0.0%** | 95 | 2 | 48, 48, 70, 76 |
| w5-04 | 40 | 38 | 24 | 5.0% | 50 | 1 | 34, 38, 24, 36, 34 |
| w5-05 | 56 | 56 | 40 | **0.0%** | 70 | 1 | 40, 48, 56, 44, 52 |
| w6-01 | 1 | 0 | 0 | 100.0% | 1 | 0 | 0, 0, 0 |
| w6-02 | 37 | 37 | 18 | **0.0%** | 46 | 1 | 25, 37, 18, 29 |
| w6-03 | 38 | 38 | 38 | **0.0%** | 47 | 1 | 38, 38, 38, 38 |
| w6-04 | 14 | 14 | 9 | **0.0%** | 17 | 1 | 9, 12, 10, 14 |
| w6-05 | 60 | 60 | 60 | **0.0%** | 75 | 1 | 60, 60, 60, 60, 60 |
| w7-01 | 10 | 10 | 7 | **0.0%** | 12 | 1 | 7, 10, 9 |
| w7-02 | 55 | 52 | 32 | 5.5% | 68 | 1 | 32, 35, 45, 52 |
| w7-03 | 200 | 165 | 117 | 17.5% | 250 | 1 | 117, 149, 165, 151 |
| w7-04 | 79 | 79 | 53 | **0.0%** | 98 | 1 | 54, 73, 74, 53, 79 |
| w7-05 | 100 | 100 | 67 | **0.0%** | 125 | 1 | 68, 67, 92, 71, 100 |
| w8-01 | 165 | 160 | 115 | 3.0% | 206 | 2 | 115, 142, 160, 151 |
| w8-02 | 700 | 632 | 319 | 9.7% | 875 | 1 | 319, 518, 632, 465, 450 |
| w8-03 | 128 | 84 | 49 | 34.4% | 160 | 2 | 63, 84, 49, 57, 71 |
| w8-04 | 223 | 223 | 101 | **0.0%** | 278 | 1 | 101, 121, 205, 223, 123 |
| w8-05 | 1050 | 917 | 560 | 12.7% | 1312 | 3 | 560, 806, 917 |

### The headline the table produces, which is not the one the item assumed

**Par is not loose. On 21 of 34 levels par is set to exactly the reference solution's worst seed —
zero headroom.** Across World 1 it is 0.0% on all three levels; across World 2 it is 0.0%, 5.3%,
11.5%, 8.1%. The mean headroom over the whole campaign is 8.8%; the median is 0.0%.

So the framing recorded in OPEN-ITEMS — "the numbers are simply too loose, tighten them" — is
contradicted by the data at the first level it would be applied to. There is nothing to tighten.
Par on `w1-01` is 78 and the reference costs 78; a par of 70 would make gold unreachable by the
only program the level admits.

The two options were therefore never symmetric. **"Raise par" is not available in World 1 at all**,
and in World 2 it is available only in a 4–11% band that would not move a medal for anybody. The
generosity the playtesters felt is not slack in the number — it is that the *solution space is a
single point*, so the number has nothing to discriminate between. That is the "par is not the axis"
finding, reached by measurement rather than by preference.

The rest of this file has to establish that it holds for the right reason before anything moves:
the claim "one sensible solution" has to be tested, not asserted.

## 2. Second measurement — what the lazy route and the good route actually cost

The first table compares par against *one* program per level, so it cannot tell "par is at the
floor because the level is tight" apart from "par is at the floor because the level admits one
answer". That needs a second program per level: the answer a player writes without the level's
idea, and the answer they write with it, driven through the same harness.

Ticks per seed; `[*]` marks the level's bonus met on that seed.

| Level | Route | Per-seed ticks | Worst | Par | Medal on the worst seed |
|---|---|---|---:|---:|---|
| w1-03 | poll before every step (no idea) | 18, 24, 7 | 24 | 24 | gold, no star |
| w1-03 | stride on one reading (the idea) | 20, 24, 8 | 24 | 24 | gold, star on 2 of 3 |
| w2-01 | sweep the row, drive back to the best | 15, 9, 18, 13 | 18 | 18 | gold, no star |
| w2-01 | stop at the top of the scale | 3, 9, 0, 5 | **9** | 18 | gold, star on all 4 |
| w2-02 | swing on every tile, read nothing | 124 ×4 | 124 | 76 | **bronze** |
| w2-02 | read, then swing (reference) | 72, 68, 72, 68 | 72 | 76 | gold |
| w2-04 | lap the plot, never stand still | 46, 38, 46, 38 | 46 | 52 | gold |
| w2-04 | lap, then stand and wait (reference) | 46, 38, 46, 38 | 46 | 52 | gold |
| w2-05 | serpentine the field (reference) | 58, 64, 68, 61, 63 | 68 | 74 | gold, no star |
| w2-05 | two lanes, reading the rows either side | 46, 52, 51, 54, 48 | **54** | 74 | gold, star on all 5 |

Four separations fall out of that, and they are different from each other:

1. **w1-03: the idea costs ticks rather than saving them.** Polling `canMove` before every step is
   *tick-optimal* — 18/24/7, identical to the reference — because sensing is free. The stride the
   bonus asks for spends up to five ticks on tiles the corridor turned out not to have, so it comes
   in at 20/24/8. Par and the lesson point in opposite directions here. No par can reward the
   stride without also rewarding the poll, and lowering par below 24 makes the tick-optimal answer
   miss gold. This is the cleanest possible instance of "par is not the axis".
2. **w2-02: par already does its job.** Swinging blind costs 124 against a par of 76 — over the
   silver line at 95, so bronze. The level's idea (read before you swing) is worth 48 ticks and par
   is priced to notice.
3. **w2-04: ticks cannot see this level's idea.** Lapping the plot and standing on a tile until it
   ripens produce *the same tick count on every seed*, because the ripening ladder — not the route
   — owns the clock. What separates them is spoilage, which is what the bonus counts. Par cannot
   separate them and does not try to.
4. **w2-01 and w2-05: par is set at the cost of ignoring the level's own hardware.** The reading
   that stops the row early halves w2-01 (9 against 18). The sensor reach that reads three rows
   from one saves a fifth of w2-05 (54 against 68). In both, par sits at or above the route that
   ignores the instrument the level exists to teach, and pays gold for it.

### Why the bonus cannot carry this on its own

The bonus rework worked. The reference solution now *fails* five of the six World 1–2 bonuses, and
the two lazy routes above fail every one of them. The confetti the playtest found — "I attempted
none of them and was awarded eight" — is gone.

But the playtest also measured which instrument a player will act on, and it is not the star. On
`w1-05` the beginner finished ten ticks over par, knew exactly which ten, and wrote: *"I did not go
back. The reward for doing so is 4 points instead of 3."* On `w2-04` the veteran silvered, rewrote
his solution, went 63 → 47 and silver → gold, and called it *"the single best moment in my first
ninety minutes"*. Same size of improvement, same player-hours; the one attached to a medal got done
and the one attached to a star did not.

So a level whose single idea sits behind the star has that idea priced at one point, on the
instrument two independent testers ignored, while par pays three points for not having it. That is
the defect, and making the star harder does not fix it.

## 3. Verdict

**The answer differs by world, and the axis question resolves differently in each.**

### World 1 — par is not the axis. Nothing moves.

Measured rather than asserted: on all three levels the tick-optimal route is the first route a
player writes.

- `w1-01` has one route. The gap round the pillar rejoins the run on exactly one tile, so every
  correct program costs 78 ticks; the only alternative shape — drive until the wall stops you —
  overruns the 90-tick bay booking and *fails*. Par cannot rank a set with one member. A free gold
  on the first work order of the game is also the right onboarding, and it is one level, not ten.
- `w1-03` is the case above: the lazy answer is tick-optimal and the star-earning answer is
  strictly *more* expensive. Par is at the floor and the floor is where the lazy answer lives.
- `w1-05` already bites. The beginner came in at 60 against a par of 50 on a wasteful sweep and
  took silver; the veteran's serpentine took gold at exactly 50. That is par working.

World 1 teaches that a program can drive a bot. There is no second-best way to drive down a
corridor, so a tick budget has nothing to rank, and tightening these numbers would only make the
one existing answer mandatory — the narrower-funnel failure. The star carries World 1, and after
the rework it carries it honestly.

**`w1-01` is also the only level in the campaign with no bonus, and it should stay that way.** The
one thing it could reward is writing a loop rather than 78 `move` calls, and nothing in a trace can
tell those apart — the level's own source says so. With character count deleted, and it must stay
deleted, no honest bonus exists here. Recorded so it is not re-litigated.

### World 2 — raise par, on the two levels where par pays gold for ignoring the instrument.

Not a trim. A transfer: par moves off the cost of the route that ignores the level's hardware and
onto the cost of the route that uses it.

- **`w2-01` par 18 → 16.** Sweeping the row and driving back to the best reading is 18 on the worst
  seed and now lands on silver. Stopping the moment a reading is at the top of the scale is at most
  9 and lands on gold with seven ticks to spare. Both are correct programs; one of them used the
  sensor for what it is for.
- **`w2-05` par 74 → 60.** The serpentine is 68 on the worst seed and now lands on silver. Walking
  two lanes and reading the rows either side — which is what the *Sensor reach* fact row has
  described since `b566142` — is 54 and lands on gold with six ticks to spare.

Left alone, with reasons:

- **`w2-02`, par 76.** Already the axis and already working: blind swinging is 124 and gets bronze.
- **`w2-04`, par 52.** Ticks cannot see this level's idea (measured identical on every seed), and
  par at 52 already silvers a first honest attempt — both testers came in at 63. It is the level
  the veteran rewrote for the game's best moment, and both keep-lists say "fix first: nothing".

### Worlds 3–8 — measured, and the table says leave them

World 3 already bites for a beginner: 176/157, 402/332, 449/365, three silvers. The 0.0%-headroom
entries in Worlds 5–8 are mostly levels whose tick count is fixed by the work rather than by the
route — `w6-03` and `w6-05` cost 38 and 60 on *every* seed — which is the World 1 shape again, and
it is fine there, because those levels are hard for reasons a clock cannot see. Nothing in Worlds
3–8 is touched.

### What happens to the two bonuses

Both retuned levels keep their bonus at its existing threshold and neither becomes confetti,
because confetti is *a bonus any correct solution earns*. Under the new pars the lazy route on
`w2-01` (18 ticks against an allowance of the direct distance) and on `w2-05` (41–49 tiles of
footprint against 32) still misses the star. Gold and the star now correlate on these two levels,
and that is the honest consequence of a level having one idea: it is priced twice, at two
strengths — gold for having the idea, the star for executing it without waste.

## 4. What changed

### `w2-01` — par 18 → 16

- `par` is now the named constant `PAR_TICKS`, with the two routes and their costs written beside
  it, so the next person to look at the number finds the measurement rather than a bare 16.
- **Reference solution rewritten** to break out of the row on a reading at `maxGrowth`. It still
  carries the argmax, so removing four characters turns it back into the sweep — the two answers
  are one line apart, which is the point. Costs 3 / 9 / 0 / 5 across the four seeds against a worst
  of 18 before.
- **Fact row changed with the par, as required.** *The highest* said "Exactly one tile has it" and
  now says "Exactly one tile has it, and it reads **at `maxGrowth`**". Gold now depends on that
  guarantee, so the level has to state it rather than let a player infer it from the `maxGrowth`
  row two lines down.
- **A hint was deleted because the par change made it false.** *"You cannot name the highest
  reading until you have seen every tile in the row"* is not true of this row and was the one thing
  standing between a player and gold. The remaining hints still walk to the sweep — which passes,
  at silver — and two new ones name the walk back as the cost and the ceiling as the way out of it.
- Brief prose untouched. Bonus untouched.

### `w2-05` — par 74 → 60

- `par` is now `PAR_TICKS` with the same treatment.
- **Reference solution rewritten** as the two-lane survey: drop onto the middle of the first three
  rows, run the lane reading North and South, drop onto the middle of the last three, run it back,
  and leave the lane only for a tile the sensor has already called ripe crop. 47 / 52 / 52 / 55 / 48
  against the serpentine's 58 / 64 / 68 / 61 / 63.
- **The `FOOTPRINT` comment was stale and is corrected** — it claimed the lane route fills the
  hopper "on 22–27 tiles and inside 51 ticks"; measured, it is 22–28 tiles and 47–55 ticks.
- **Two hints added** naming the reach and the rule for leaving the lane. Nothing removed: the
  existing five all still hold, and they lead to the serpentine, which passes at silver.
- Facts untouched — the *Sensor reach* row has described this route since `b566142`, which is most
  of why this level was the right one to move. Bonus untouched at 32 tiles.

### Tests

- `src/levels/__tests__/solutions.ts` is new: the 34-entry reference registry moved out of
  `levels.test.ts` so the par work and the solvability work drive the same programs. `levels.test.ts`
  imports it and lost 34 import lines.
- `src/levels/__tests__/naive.ts` gains three fixtures and an amended docblock. The file used to
  hold only *wrong* answers; `rowSweep`, `serpentineHarvest` and `corridorPoll` are **correct**
  answers that did not use the level's hardware, which is a different instrument and is labelled as
  one.
- **New `par calibration` block in `levels.test.ts`, +3 tests (1369 → 1372).** It asserts medals,
  not numbers — a test that repeats `expect(par.ticks).toBe(16)` only proves the constant was typed
  twice. `w2-01` and `w2-05` each assert that the lazy route passes every seed and takes *silver*;
  `w1-03` asserts that the answer with no idea in it ties the reference exactly, which is the
  standing reason its par cannot be lowered.
- Four tests in `src/levels/world-2/__tests__/world-2.test.ts` used each level's *reference* as
  their stand-in for "the obvious correct answer that misses the star". Since the reference is now
  the good answer, they point at `rowSweep` / `serpentineHarvest` instead. Same assertions, same
  intent; the file's docblock says why.
- `docs/CURRICULUM.md` gains one `par` line on each of the two levels.

### Verification

`npx tsc --noEmit` clean · `npx vitest run` 1372 passed (baseline 1369, +3 accounted above) ·
`npm run build` clean · `npx eslint src` reports exactly the one pre-existing `rules-of-hooks`
false positive at `src/levels/world-5/__solutions__/w5-01.ts:32`.

## 5. Left alone, deliberately

- **Every par in Worlds 1 and 3–8.** Reasons in §3. World 1 cannot be tightened without making the
  only existing answer mandatory; Worlds 3–8 were measured and are not this item.
- **`w2-02` and `w2-04`.** Both measured, both already doing the right thing, both on both
  playtesters' keep-lists with "fix first: nothing".
- **`w1-01`'s missing bonus.** It is the only level in the campaign without one, and it should stay
  that way — see §3.
- **The medal formula.** DESIGN.md §7 is binding and ticks-only, and §11 A4 fixes the weights. The
  fix here works entirely inside that: no new axis, no bonus that moves a medal, and nothing that
  measures the length of a program.
- **The stale rows in `docs/CURRICULUM.md` for `w2-01` and `w2-05`** — `premise`, `hardware`,
  `world` and `bonus` describe pre-compression versions of both levels (w2-01's entry still says
  "Harvest what is ripe", w2-05's still describes a 14×10 field with a silo). That drift predates
  this work and rewriting it here would bury a par change inside a content edit. Flagged, not
  fixed.

## 6. Ruling on `docs/AUDIT-INCENTIVES.md` §8

The incentive audit reached this question independently and proposed a third answer: **`graded:
false`** on levels where the route is forced, so a pass shows `CLOSED` with no medal ladder, and
par stays tuned only where the route is a genuine choice.

**I agree with its principle and reject its scope, and the scope is where the measurement matters.**

### Where it is right, and my numbers make its case better than it could

The arithmetic finding is real and I have pinned it with a test. Ticks are integers and silver is
`(par, par × 1.25]`, so the band contains no integer below a par of four — `floor(3 × 1.25)` is 3.
**Exactly two levels are there: `w6-01` (par 1) and `w5-02` (par 2)**, and on both the ladder shows
three rungs with two reachable outcomes, gold or a bronze cliff one tick wide.

Neither par is a design figure, and `w6-01` says so in its own file: *"`par.ticks` is 1 because the
registry test requires a positive par"* — the reference costs 0. A placeholder is standing where a
medal axis is displayed. That is the audit's thesis stated by the level's author, and it is not
fixable by moving a number: no par below 4 has a non-empty silver band.

My table also hands the audit a level it did not have. **`w2-04` is the cleanest proof of its
thesis in the campaign**: lapping the plot and standing on tiles until they ripen are structurally
different programs and cost *identical* ticks on all four seeds, because the ripening ladder owns
the clock. The clock genuinely cannot see that level's idea.

### Where it is wrong, and by how much

The audit picked its ungrade set by **par magnitude** — "`w7-01` par 10, `w6-04` par 14, `w2-01`
par 18" — and by world ("everything through World 2"). A small par is not evidence that ticks
cannot vary; it is evidence that the level is short. The measured criterion is different and I have
it for all 34 levels: **can any correct program cost fewer ticks than another on the same seed?**

Scored against §1 and §2, the audit's eleven proposed ungrades come out 4 right, 7 wrong:

| Level | Audit says | Measured | Verdict |
|---|---|---|---|
| w1-01 | ungrade | one route, 78 on its one seed, the alternative shape *fails* | **agree** |
| w1-03 | ungrade | `corridorPoll` ties the reference exactly: 18/24/7 both | **agree** |
| w1-05 | ungrade | the beginner spent 60 where 50 was available and took silver | **wrong** |
| w2-01 | ungrade | 9 against 18 — two correct programs, 2× apart | **wrong** |
| w2-02 | ungrade | blind swinging 124 against 72; par 76 sends it to bronze | **wrong** |
| w2-04 | ungrade | ticks identical across programs, *but* both testers came in at 63 against par 52 and the veteran's rewrite to 47 was the game's best moment | **wrong** |
| w2-05 | ungrade | 55 against 68 | **wrong** |
| w5-02 | ungrade | 2 ticks on every seed; empty silver band | **agree** |
| w6-01 | ungrade | 0 ticks on every seed; par is an admitted placeholder | **agree** |
| w6-04 | ungrade | 9, 12, 10, 14 — the clock moves 55% across seeds | **wrong** |
| w7-01 | ungrade | 7, 10, 9 | **wrong** |

And it misses two that the measurement finds outright: **`w6-03` costs 38 on every seed and `w6-05`
costs 60 on every seed.** A reference whose tick count does not move when the world does is the
strongest available evidence that the clock is reporting the work rather than the route.

`w2-04` is the one that deserves its own sentence, because it is the case that separates the two
criteria. **"The clock cannot see the lesson" is not the same as "the clock cannot grade."** Ticks
cannot tell lapping from waiting on w2-04 — but they can tell either from what a player actually
writes on their first attempt, which both testers measured at 63 against a par of 52. Ungrading it
would delete the single most valuable medal event in two playtests.

### The measured ungrade set, if the orchestrator adopts `graded`

**`w1-01`, `w1-03`, `w5-02`, `w6-01`, `w6-03`, `w6-05`.** Six levels: two in World 1, four spread
across Worlds 5–6. Note what that leaves: **World 2 stays graded in full**, which is the opposite
of both the item's framing and the audit's proposal, and §2 is why — four of its levels separate
two correct programs by a measurable number of ticks.

Two tests in `levels.test.ts` now maintain the evidence rather than leaving it in a document:
`the silver band holds an integer everywhere except the two known placeholders`, and `the levels
whose reference costs the same on every seed are the ones on record`. A third level joining either
set fails the suite.

### Why I have not implemented it

Three reasons, in order of weight.

1. **It is a DESIGN §7 amendment, not a recalibration.** §7 says "Medals are ticks-only… Nothing
   else moves a medal," and an ungraded pass is a fourth outcome the sentence does not admit.
   §11 says amendments are orchestrator rulings. This is one.
2. **It reaches files I do not own, including one that is off limits.** `src/ui/panels/ObjectiveRail.tsx`
   draws the `ticks / par` line and is held by the viewport agent. Beyond that it needs
   `src/game/store.ts`, `src/game/achievements.ts`, `src/meta/types.ts` and `save.ts`, and the
   Performance Review.
3. **Its scope is wrong by measurement**, per the table above, and a scope error here is expensive
   in one direction only: ungrading `w1-05`, `w2-02` or `w2-04` deletes a signal two playtesters
   demonstrably responded to, and it is very hard to add a grade back to a level a player has
   already been told is ungraded.

The par changes in §4 stand. They are on the two levels where the measurement says a tick budget
*does* separate two correct programs, so they are not the "gold for correct becomes silver for
correct" failure the audit warns about — the headroom on `w2-01` is 9 measured ticks and on
`w2-05` it is 13, and both levels now state on the facts table how to get it.

## 7. Changes for the orchestrator to apply

Two, both outside `src/levels/**`, `score.ts` and `budgets.ts`.

### A. The silver band, if `graded` is not adopted

Both degenerate levels are in the §6 ungrade set, so adopting `graded` fixes this as a side effect
and nothing below is needed. If it is not adopted, the band has to be widened to hold an integer.
One line, in `src/engine/verdict.ts`:

```diff
 export function medalFor(passed: boolean, ticks: number, parTicks: number): Medal {
   if (!passed) return Medal.None;
   if (ticks <= parTicks) return Medal.Gold;
-  if (ticks <= parTicks * 1.25) return Medal.Silver;
+  // Ticks are integers, so a par under four has an empty silver band: floor(3 * 1.25) is 3.
+  // One rung is always reachable. docs/FIX-PAR.md §6.
+  if (ticks <= Math.max(parTicks + 1, parTicks * 1.25)) return Medal.Silver;
   return Medal.Bronze;
 }
```

This is behaviour-preserving for every par of 4 or more, which is 32 of the 34 levels, so it cannot
move a medal anywhere except the two levels it is for.

### B. `SILVER_FACTOR` is a decorative duplicate

`src/game/score.ts` exports `SILVER_FACTOR = 1.25` and *nothing read it* — the authoritative 1.25
is written inline in `medalFor`. Two copies of a scoring constant with only one of them live is the
same shape as the two tick counters `docs/FIX-CHARCOUNT.md` found. I have corrected the comment to
say which copy is authoritative rather than delete the export, because the assertion in §6 needs a
name for the number. The real fix is for the engine to import it, which is an engine change:

```diff
--- a/src/engine/verdict.ts
+++ b/src/engine/verdict.ts
+/** Silver is everything up to this multiple of par. DESIGN.md §7. */
+export const SILVER_FACTOR = 1.25;
+
 export function medalFor(passed: boolean, ticks: number, parTicks: number): Medal {
```

…re-exported through `src/engine/index.ts` and imported by `score.ts` in place of its own copy.
Deferred rather than done because `src/engine/**` is not mine and the change is cosmetic until (A)
lands, at which point the two should be done together.
