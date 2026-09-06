# FIX-BONUSES-7-8 — the second question, Worlds 7 and 8

Companion to `docs/FIX-BONUSES.md`, which did the same job for Worlds 1–3. The defect is stated in
`docs/FIX-INCENTIVES.md` §4 and confirmed by both playtests: **most bonus stars restate the
required solution with a tighter number.** Five of the ten bonuses in Worlds 7 and 8 were
"finish in fewer ticks than the tick budget you already have".

Three tests decide whether a star is worth having. The first was the brief; the second and third
were learned during the pass and each one caught bonuses the first had passed.

> 1. **Does this ask a question the required objective does not ask?**
> 2. **Is it earned by the cheapest correct program?** — not by the reference, by the laziest
>    program that still passes.
> 3. **Is it satisfied by a program that does nothing?**

The bar is `w6-02`'s `name-the-fault` (report *which byte was altered*) and `w4-02`'s mark budget.

No par, tick budget, threshold, cost override, required objective or seed list was changed.
Nothing here counts characters. Every figure below is measured, not estimated.

## Verdicts

| level | bonus | verdict | reason |
|---|---|---|---|
| `w7-01` | `no-slack` → **`name-the-idle`** | replaced | tick tightening; replacement reports per-bot idleness |
| `w7-02` | `within-ten-percent` → **`even-share`** | replaced | tick tightening; replacement grades the split |
| `w7-03` | **`no-bumps`** | kept, ruled | on a one-lane tunnel the count reads "did you schedule it" |
| `w7-04` | `within-bound` → **`name-the-decider`** | replaced | tick tightening; replacement names the critical job |
| `w7-05` | **`workers-busy`** | kept, flagged | real second question, never earned by the reference |
| `w8-01` | `audit-tight` → **`name-the-row`** | replaced | tick tightening; replacement reports the survey |
| `w8-01` | **`within-10-look`** | kept | a real information budget, and the only instrument that prices sensing |
| `w8-02` | **`ship-while-you-look`** | kept | the best bonus in World 8; pipelining, not makespan |
| `w8-03` | `tight-shift` | **deleted** | tick tightening, no honest replacement available |
| `w8-03` | **`within-26-probe`** | kept | a real information budget |
| `w8-04` | `no-resurvey` → **`read-the-plan`** | replaced | it paid a star for *ignoring* the plan |
| `w8-05` | `under-budget` → **`name-the-hold`** | replaced | tick tightening, and satisfied by a do-nothing program |
| `w8-05` | `no-blocked-moves` | **deleted** | A10 double-pricing, and satisfied by a do-nothing program |
| `w8-05` | `fleet-utilisation` | **deleted** | unreachable: it charges `sync` as idleness on a level built on `sync` |

Points, at `BONUS_STAR_POINTS = 1` each: World 7 keeps its five stars, one per level. World 8 goes
from nine to six — `w8-01` 2, `w8-02` 1, `w8-03` 1, `w8-04` 1, `w8-05` 1. **The maximum available
in Worlds 7–8 falls from 14 to 11**, and every one of the three that went was satisfied by a
program that did not play the level.

---

## The `w7-01` `floorTicks` measurement — the answer, and a correction

**The question** (`docs/FIX-INCENTIVES.md` §4, ruling 3): `no-slack` was
`ctx.trace.endTick <= floorTicks(ctx) && blockedMoves(ctx.trace.events) === 0`. Is there any
program that hits `floorTicks` **with** a blocked move in it? If no, the second conjunct is dead
weight and deleting it changes nothing.

**The answer is YES, and the conjunct was live.** Measured with a throwaway driver: the reference
walk, then the *short* corridor's bot driven into its own dead end `k` times before the `send`.

| seed | corridors | `floorTicks` | clean | 1 bump | 2 | 3 | 4 | 5 | 6 |
|---|---|---|---|---|---|---|---|---|---|
| 1 | 6, 6 | 7 | **7** | 8 | 9 | 10 | 11 | 12 | 13 |
| 2 | 3, 9 | 10 | **10** | **10** | **10** | **10** | **10** | **10** | **10** |
| 3 | 8, 4 | 9 | **9** | **9** | **9** | **9** | **9** | 10 | 11 |

Bold is "at or under `floorTicks`". On seed 2, six blocked moves cost the run **nothing**; on
seed 3, four do. In every one of those cells the first conjunct passed and only `blockedMoves === 0`
refused the star. Deleting it would have made the bonus strictly easier on two of three seeds.

**But `floorTicks` is not the bug, and it is not wrong.** It computes
`max over bots(distance to own pad) + 1`, which is the genuine theoretical minimum *makespan*, and
the reference hits it exactly on all three seeds. The defective step is in §4's reasoning, not in
the function:

> *"a blocked move costs a tick, so any bump already puts `endTick` over the floor"*

That is true of a **single bot**. It is false of a **fleet**, because the makespan is
`max(bot.clock)` and only the critical-path bot's ticks reach it. A bot on the short corridor
carries `lenLong − lenShort` ticks of private slack, and every tick it wastes — bumping, waiting,
anything — is invisible to the score. **That is the whole subject of World 7.** The one place the
inference does hold is seed 1, where the corridors are equal and there is no slack to hide in.

**The conclusion, stated flatly.** `floorTicks` is correct and is not a bug. The *inference about
it* was wrong. `&& blockedMoves === 0` was therefore **load-bearing, not dead weight**, and
applying §G2's "pure simplification with no difficulty change at all" would have made that bonus
strictly easier on two of three seeds — a difficulty change shipped disguised as a tidy-up, with no
test anywhere to catch it. This is the strongest argument in the whole exercise for measuring
before deleting: the reasoning was careful, plausible, correct for one bot, and wrong.

None of it changes the disposition. `no-slack` was replaced whole for a separate reason (below),
which sidesteps the conjunct question entirely. No A10 exception is created: a blocked move was
still priced only once here, in ticks. What the second conjunct was actually charging for was
*idleness off the critical path* — a different quantity the level had no other way to name. The
replacement names it directly, and as a number rather than as a gate.

---

## `w7-01` Two Bots — `no-slack` → `name-the-idle`

**Old, and why it failed the test.** `no-slack`, *"Finish at the theoretical minimum with no
blocked moves"*. The first conjunct is `endTick <= floor`: a tick tightening with the tightest
number there is. The required objectives are *park both bots* and *have each hear the other*, and
the medal already asks "did you run them at the same time" — a serial walk costs `len1 + len2 + 1`,
13 on seed 1 against a par of 10, which does not even take silver. The star was the medal one notch
tighter and asked nothing new. **Fails the test.**

**New.** `name-the-idle` — *"Report how long each bot stood idle"*. One line per bot, in id order:
`idle <bot> <n>`, `n` being the ticks that bot spent in `wait` plus whatever a `sync()` cost it,
read from the trace (`idleTicks` in `world-7/shared.ts`) rather than from the corridor lengths.

**What second question it asks.** *How much of the shift did your fleet spend standing still, and
which bot was doing it?* The required objectives are indifferent to time entirely, and the medal
reads one number, `max(bot.clock)`, which cannot see the slack underneath it. This is precisely the
number the measurement above proves the score is blind to — six wasted ticks on seed 2 that cost
nothing. It is a fact about *the schedule the player wrote*, not about the site, so it cannot be
looked up or hardcoded from the layout. The intended route is the level's own new hardware: ask
`clock()`, call `sync()`, subtract. It also sets up `w7-05`: report idleness here, spend against a
budget of it there.

**Calibration** (measured, reference solution): idle per bot is `(0, 0)` on seed 1, `(6, 0)` on
seed 2, `(0, 4)` on seed 3 — the short corridor's private slack, exactly. Seed 1 is the balanced
pair and answers zero, which is the honest answer and reads as "this pair was matched".

**Legibility.** A `facts` row states the line format; a fourth hint says `sync()` hands back the
tick it aligned to. The label carries no meter word (`tick`, `op`), so
`src/game/__tests__/budget-declarations.test.ts` still infers nothing from it. The `divergence`
follows `w6-02`'s rule and never hands over a figure: a wrong line comes back as
`bot #0 / a different figure / idle 0 0`, a missing one as `bot #0 / a line saying how long it
stood still / (nothing)`.

**Proof.** `__solutions__/w7-01.ts` now reads each clock before the `sync()` and prints the
difference. Measured earning the star on **all three seeds**, still passing, still 7 / 10 / 9 ticks
against par 10 — gold on every seed, unchanged. Two divergence tests added in
`world-7/__tests__/divergence.test.ts` (missing report, wrong figure); the old `no-slack` bump test
was removed, and `w7-03`'s equivalent bump test — always the better one — still stands.

**Missability, proved** (`world-7/__tests__/bonus.test.ts`): the *old* reference solution — correct,
tick-optimal, gold on every seed — passes and is refused the star on all three seeds. And printing
`idle <id> 0` for both bots is right only on seed 1, the balanced pair; seeds 2 and 3 refuse it, so
`0` is not a memorisable answer.

**Third test, run after the fact.** An idle `print()` program is refused it on all three seeds, and
that is now asserted (`bonus.test.ts`, *"a program that does nothing earns neither report"*).

---

## `w7-02` Divide the Field — `within-ten-percent` → `even-share`

**Old, and why it failed the test.** `within-ten-percent`, *"Finish within 10% of the shared-work
floor for this field"*: `endTick <= ceil(lowerBound * 1.1)`. A tick tightening, and the level's only
bonus. The required objective is *harvest every crop*, and the medal is already a clock — the star
was the same clock with a smaller number on it. **Fails.**

**New.** `even-share` — *"Split the crop evenly across the requisitioned fleet"*. No bot may pull
more than `ceil(crops / n)` of the field, where `n` is the number of bots the run actually raised,
counted never below `vars.requisition`.

**What second question it asks.** *Did you split the work, or did you split the map?* The required
objective is completely indifferent to who did what — one bot can clear the whole field and pass.
This is the question the level's own hints are entirely about ("On one of these fields, equal area
and equal work are the same split. On the others they are not") and that nothing in the level
previously graded.

**Why one number does two jobs.** The divisor is `max(requisition, bots raised)`, which closes both
ends without a second clause:

- **Raise too few** and the share is arithmetically impossible: two bots on seed 1 can cover at
  most 16 of 32 crops inside a cap of 8. So the star requires raising the fleet at all — which the
  required objective never does.
- **Raise too many** and the cap tightens with you: 32 bots on seed 1 means a cap of 1 crop each.
  The over-spawn cheese pays for itself. Nothing in the level otherwise enforces the requisition,
  which the fact table has always presented as a rule.

**Calibration** (measured over the declared seeds `[1, 2, 3, 4]`):

| seed | crops | requisition | cap | reference's heaviest bot | star |
|---|---|---|---|---|---|
| 1 | 32 | 4 | 8 | 8 | yes |
| 2 | 10 | 1 | 10 | 10 | yes |
| 3 | 44 | 6 | 8 | 8 | yes |
| 4 | 80 | 8 | 10 | 10 | yes |

Every seed is tight — the reference is *at* the cap on all four, never under it — so the cap is not
slack the player can ignore. Seed 2 is the one-bot requisition and the cap correctly degenerates to
"take the field", which is right rather than impossible.

**Missability, proved** (`world-7/__tests__/bonus.test.ts`): a correct one-bot run clears the field
and is refused the star on seeds 1, 3 and 4 (and legitimately earns it on seed 2, the one-bot
shift). The equal-*area* band split — the level's designed wrong answer — raises all four bots on
seed 1, clears the field, passes, and is refused: the whole crop sits inside band 0, so one bot
pulls 32 against a cap of 8.

**Legibility.** A `facts` row states the cap as arithmetic over two numbers the depot already
publishes (`vars.crops`, `vars.requisition`), so nothing new is hidden. The divergence names the
heaviest bot and both figures — `bot #0 / 8 crops or fewer / 32 crops` — and says nothing about
which crops should have gone to whom. Label carries no meter word.

**No `progress()`, deliberately.** The number this counts is *the heaviest single bot's share*,
which is not any run-wide total, so `budgetFor` would have had to guess a meter and would have
found `harvest` — reporting the run's 32 total harvests against a limit of 8. That is exactly the
`w3-01` `6 / 1 pickups` bug `docs/FIX-BONUSES.md` diagnosed. `Objectives.custom` cannot declare a
meter today (diff at the end of this document), so the honest choice is no bar and a divergence
that carries both numbers.

**Proof.** Reference unchanged and unchangeable-in-cost: it already shares out by crop count rather
than by column width, and it earns the star on **all four seeds** at 32 / 35 / 45 / 52 ticks
against par 55 — identical to before this change, so gold on every seed is untouched. Dead code
removed with the old bonus: `lowerBound` (exported, and its only consumer was the deleted
objective) and `overFloor`.

**Third test, and the one blemish on this section.** An idle `print()` program **satisfies**
`even-share`: it harvests nothing, so no bot exceeds the cap. This is the general shape of a
*distribution* predicate — "nobody took more than their share" is trivially true of nobody taking
anything — and its only guard is `verdict.passed`, which is outside the objective. It is not the
`w8-05` defect, because the star is not paying for the run being short; but it is the same family,
and the honest statement is that `even-share` passes tests 1 and 2 and fails test 3. Fixing it
would mean conjoining the required objective into the bonus, which is worse. See the table below:
**every non-report bonus in Worlds 7–8 fails test 3**, including two engine-minted ones, so the
test is a smell to be read alongside the other two rather than a gate on its own.

---

## `w7-03` Right of Way — `no-bumps` **kept**, and the argument written down

**The rule it sits against.** DESIGN.md §11 **A10**: a blocked move is priced once, in ticks. A
bonus of the shape `blockedMoves === 0` charges for it a second time and is normally the exact
thing this pass exists to delete.

**Why this one survives, and why it is not a precedent.** On `w7-03` the site is a **one-lane
tunnel** that every crate must cross, and the fleet is polite by default — the brief says so in as
many words ("two bots that each stand aside for the other stand aside all shift"). On that board
the blocked-move count is not a second price on a tick. It is **the only reading anywhere on the
level of whether the tunnel was scheduled**, because the required objective (`crates-in-silo`) is
completely indifferent to how the crates got there and the medal reads one number the tunnel does
not dominate. A run that never decided whose turn it was still delivers everything.

**Missability, proved** (`world-7/__tests__/bonus.test.ts`, `everyBotForItself`). A correct program
with no schedule in it — the shape the starter hands the player, one errand written once and given
to every bot — delivers every crate on **all four seeds** and is refused the star on all four. It
is not a straw man: it is what the level's own brief predicts a player will write first. The
engine's `LivelockError` fires on the round-robin version of it before it can even finish, which is
its own commentary; the version in the test drives one bot's errand at a time and still bumps,
because bots hold ground in *virtual* time and a second bot re-treading the aisle walks into where
the first one was standing at that tick.

**Calibration.** The reference earns it on all four seeds at 117 / 149 / 165 / 151 ticks against
par 200.

**Test 3.** An idle program satisfies `no-bumps` on every seed. This was checked because it was
asked for specifically, and the answer changes nothing: an absence predicate is vacuously true of a
run that never moved, and the guard is `verdict.passed`. The reason it does not condemn this one is
test 2 — a *correct* program fails it, which is exactly what a do-nothing program cannot tell you.
Nothing changed on this level.

---

## `w7-04` Dispatch — `within-bound` → `name-the-decider`

**Old, and why it failed the test.** `within-bound`, *"Finish within a third of the load bound"*:
`endTick <= floor(loadBound * 4 / 3)`. The level already publishes `vars.bound` as a fact and the
medal is a clock; the star was the same clock against a number derived from the same fact.
**Fails.** It is also one of the three the seed-grading agent independently found losing its star
under worst-seed grading — see the note at the end of this section.

**New.** `name-the-decider` — *"Report the job that decided the shift"*. One line,
`last <job> <tick>`: the job whose final `use()` landed latest, and the clock reading of the bot
that closed it, straight after that use.

**What second question it asks.** *Which job was your critical path?* `board-clear` asks only that
every job reaches `done`; it does not care in what order, by whom, or when. The makespan the medal
reads is one number with no name on it, and the interesting fact — *which* piece of work the
schedule ended up hanging off — is nowhere in the verdict. The level's own third hint is about
exactly this ("The last job to be started decides when the shift ends"), and until now nothing
graded whether the player could say which one it was.

**It is not the last job dispatched.** The reference works the board longest-first, so the job that
closes the shift is almost never the last one handed out. A player has to keep the bookkeeping —
read the clock after each `use`, keep the maximum — which is the same instrument `w7-01` taught.

**Calibration** (measured, reference solution, seeds `[1, 2, 3, 4, 5]`): the star is earned on
**all five**, at 54 / 73 / 74 / 53 / 79 ticks against par 79 — identical to the ticks before this
change, because `print()` and `clock()` are free (they are absent from `DEFAULT_COSTS`). Seed 5 sits
exactly on par and did so before; **the bonus costs nothing, so the `docs/FIX-PAR-3-8.md` §10
"tick-spending bonus inside a par that does not include it" class cannot apply to it.** This is
true of every report-shaped bonus in this document and is the strongest structural argument for the
shape.

**Missability, proved** (`world-7/__tests__/bonus.test.ts`). Every correct program for this board
is a scheduler, so the honest test is *this* scheduler with only the sentence it files changed:

- the same run with its report line dropped passes and is refused on all five seeds;
- the right tick under the wrong job (`last job-0 <tick>`) is refused on all five — the makespan is
  the easy half, the job is the hard one;
- the right job under a tick one off is refused on all five.

**Test 3.** An idle program is refused it on all five seeds, asserted.

**Legibility.** A `facts` row states the line format. The divergence never names the job: a wrong
guess comes back as `job-7 / a job that closed at tick 74 / closed at tick 51`, which rules that
job out and hands over the makespan the player can already read off their own clock. Label carries
no meter word; **no `progress()`**, for the same reason as `even-share` — the number is one job's
closing tick, not a run-wide total, and `budgetFor` would have drawn a tick bar.

---

## `w7-05` Chain of Command — `workers-busy` **kept, and flagged**

**Why it passes test 1.** `workers-busy` is *"keep the workers waiting for under a tenth of the
shift"*: `idleTicks(workers) < endTick * workers * 0.1`. That is **utilisation**, and the medal is
**makespan**. They are different questions and they can disagree in both directions — a fleet that
finishes fast with three of six workers parked all shift takes gold and misses the star. The
required objectives (`sites-up`, `told-where-to-go`) say nothing about time at all. It is a real
second question and the level's own fifth hint is about it.

**The problem.** The reference solution has never earned it, on any seed:

| seed | end | workers | worker-ticks | idle | share | needs |
|---|---|---|---|---|---|---|
| 1 | 68 | 4 | 272 | 40 | 15% | < 27 |
| 2 | 67 | 6 | 402 | 88 | 22% | < 40 |
| 3 | 92 | 5 | 460 | 134 | 29% | < 46 |
| 4 | 71 | 8 | 568 | 122 | 21% | < 56 |
| 5 | 100 | 4 | 400 | 89 | 22% | < 40 |

Between 1.5× and 3× over. `levels.test.ts` licenses exactly one bonus of this kind and names this
one in its comment, so it is not an accident — but "hard" and "unreachable" are different things
and the difference had to be established rather than assumed.

**It is reachable in principle, and I did not prove it.** World 7's `idleTicks` counts only `wait`
and the cost of a `sync` — it does *not* charge a bot for stopping early, unlike World 8's
same-named function. So idleness here is entirely a property of the program: a dispatcher that
walks its workers *speculatively* toward the field instead of parking them at the muster accrues no
idle at all, and only pays on the syncs it needs to read an order. A program that keeps every
worker moving from tick 0 and syncs each of them exactly once can plausibly come in under 10%.
**Verdict: keep.** But no such program exists today, and writing one means rewriting the reference
solution, which is a par-affecting change and is not mine. This is the one open item in Worlds 7–8.

**Test 3.** An idle program is refused it on all five seeds — the span is zero, the predicate
requires `span > 0`. It is the only budget-shaped bonus in the two worlds that survives test 3, and
it survives it by accident of that guard.

---

## `w8-01` Efficiency Audit — `audit-tight` → `name-the-row`

**Old, and why it failed the test.** `audit-tight`, *"Close the shift in 136 ticks or fewer"*:
`floor(par * 0.83)`, against a level that already has a *failing* tick budget (`shift-budget`, 215)
and a par (165). Three numbers on one axis. **Fails.** The seed-grading agent found this one losing
its star under worst-seed grading too: the reference met it on seed 1 at 115 and missed it on 2, 3
and 4 (142 / 160 / 151). A budget bonus whose margin varies seed to seed is exactly the family that
broke.

**New.** `name-the-row` — *"Name the row that held the most ripe crop"*. One line, `row <y> <n>`:
the row that carried the most ripe crop **when the shift opened**, and how much that was.

**What second question it asks.** *What did the survey actually tell you?* The required objectives
are `ripe-to-silo`, `shift-budget` and `within-16-look`; none of them cares where anything was, only
that it arrived. And the fact asked for is about the field **as the shift opened** — a program that
tries to compute it at the end sees a field it has just emptied. So the star cannot be bolted on
afterwards; the survey has to be *kept*, which is precisely what the level's fifth hint asks for
("Keep what a beam told you") and what the sibling star `within-10-look` — one beam a row, kept —
rewards. The two now say the same thing from two directions.

**Calibration** (measured, reference solution, seeds `[1, 2, 3, 4]`):

| seed | ripe per row (y = 0…9) | heaviest | answer filed | star |
|---|---|---|---|---|
| 1 | 1,1,1,2,2,1,0,0,1,**3** | 3 | `row 9 3` | yes |
| 2 | 1,0,**4**,1,1,2,2,0,0,2 | 4 | `row 2 4` | yes |
| 3 | 1,1,1,1,**2**,1,0,**2**,1,1 | 2 | `row 7 2` | yes |
| 4 | 2,**4**,**4**,0,1,0,0,0,0,0 | 4 | `row 2 4` | yes |

Four seeds, three different rows and three different counts. Seeds 3 and 4 have ties for the
heaviest row and **every tied row is accepted**, which is the only fair reading of "the row that
held the most". No single line is right on all four, which is what matters now that a star is graded
on the worst seed: `row 2 4` is right on 2 and 4 and wrong on 1 and 3.

**Missability, proved** (`world-8/__tests__/bonus.test.ts`): the same reference run with its audit
note dropped passes and is refused on all four seeds; the right count under row 0 is refused; and
none of `row 2 4`, `row 9 3`, `row 0 1` carries all four seeds.

**Test 3.** An idle program is refused it on all four seeds, asserted. A *survey-only* program —
one that beams the field, files the line and harvests nothing — would satisfy the predicate, and
that is the honest limit of a report bonus: it certifies that the information work was done, not
that the haulage was. The haulage is what the three required objectives are for.

**Legibility.** A `facts` row states the line format and says outright that the field will not still
answer the question once it has been worked; a sixth hint says the same thing in the player's
voice. The divergence prices a wrong claim against itself — `row 6 / 1 ripe / 3 claimed`, or
`row 6 / the heaviest row on the field / a lighter row` — and never names the right row. **No
`progress()`**: one row's share is not a run-wide total.

**Reference.** Both halves updated. The `run` half buckets the `ripe` list it already builds during
the survey and prints before the first `harvest`; the `source` half does the same with a `Map`.
Ticks unchanged on every seed (115 / 142 / 160 / 151, par 165) because `print` is free. Dead code
removed with the old bonus: `deliveredBy`, `TIGHT_TICKS`.

**`within-10-look` kept.** It is an information budget, and `look`, `scan`, `probe`, `recv` and
`print` are all absent from `DEFAULT_COSTS` — **sensing and reporting are free**, so a tick budget
can never rank a program for sensing less. `Objectives.withinSenses` is the only instrument in the
engine that prices it at all. The reference sits exactly on 10 of 10 on every seed.

---

## `w8-02` Sorting Floor — `ship-while-you-look` **kept**

**Why it passes.** *"Deliver half the crates before the last crate or bay is sighted"*. The
required objective is `depot-sorted` — every crate on its own class bay — and it says nothing about
*when*. This star asks whether the run **pipelined**: did you start shipping while the survey was
still running, or did you survey the whole floor and then start? Two correct programs with the same
final world and very different traces get different answers. It is the best bonus in either world
and nothing about it needed changing.

**Calibration.** Earned on all five seeds, at 319 / 518 / 632 / 465 / 450 ticks against par 700, with
the half at 6, 5, 8, 7 and 8 crates respectively. The progress bar is clamped to the half, so it
reads full on every seed and the margin above it is not visible from the reading.

**Test 3.** An idle program is refused it on every seed — it sights nothing and ships nothing, so
`sightingTick` is infinite and the predicate fails. Asserted in `world-8/__tests__/bonus.test.ts`.
It is the only pre-existing bonus in the two worlds that passes all three tests unmodified.

---

## `w8-03` Cold Start — `tight-shift` **deleted**, not replaced

**Old, and why it failed the test.** `tight-shift`, *"Beat the shift's theoretical minimum plus
travel, in ticks"*: `endTick <= criticalChain * USE_COST + (lanes + 2) * meanHop`. The level already
carries `within-shift`, a *required* tick objective against `deadlineFor`. The star was the same
clock against a smaller number computed from the same three quantities. **Fails**, as plainly as
any in this pass.

**Deleted rather than replaced, and why.** `w8-03` already asks two hard questions the tick clock
does not — `precedence-held` (start no station before its feeders have finished) is a required
objective, and `within-26-probe` is a real information budget. The level's remaining unasked
questions are all about the precedence graph, and `w8-05` — the finale, built on the same
`sub-` prefix and the same `criticalChain` helper — is where that question belongs and is where it
now lives (`name-the-hold`, below). Putting a near-identical report on both would be the same
mechanic twice in two levels of the same world. `w8-03` keeps one star instead of two.

**What it costs.** One point. `within-26-probe` is earned by the reference on all five seeds at
15 / 15 / 19 / 21 / 17 of 26 reads, a budget with real slack in it and real teeth on seed 4.

Dead code removed: `targetFor`.

---

## `w8-04` Signal from 4470 — `no-resurvey` → `read-the-plan`

**Old, and why it failed — the worst bonus in the campaign.** `no-resurvey`, *"Stay inside the
allowance for ground the plan already described, in tiles"*. It passes test 1 easily; it fails test
2 catastrophically. The par agent's measurement: a program that never calls `receive()`, never
cracks the cipher and never reads the plan finds the locker in **5–65 ticks** against a par of 223,
and — because the short way to the locker is a **subsequence of the plan's own tiles** — it strays
**less** than the reference does. Off-plan tiles: **0 / 0 / 0 / 4 / 11** for the lazy route against
**17 / 19 / 37 / 14** for the intended one. **The star was paid for ignoring the plan, and paid more
comfortably than it paid the solution the level exists to teach.** This is `w4-02`'s mark budget
again, with the bonus half worse.

**New.** `read-the-plan` — *"Report the shift the plan was filed under, and how many legs it
describes"*. One line, `plan <cipher> <legs>`.

**What second question it asks.** *Did you actually read the plan?* Neither figure exists anywhere
in the workings. The cipher shift is recoverable only by trying all ninety-five candidates against
the checksum — the level's central puzzle, and one the required objectives leave entirely optional.
The leg count is recoverable only by decoding, throwing away the decoy packets whose checksums do
not add up, ordering the surviving sections and parsing every run. That is the level's whole
apparatus, end to end, demanded as a positive artefact rather than as the absence of straying.
It is the `w6-02 name-the-fault` shape and, being a report, it is immune to the vacuity that any
"no more than N off-plan tiles" phrasing carries by construction.

**Calibration** (measured, reference solution, seeds `[1, 2, 3, 4, 5]`):

| seed | cipher shift | legs | decoys | star |
|---|---|---|---|---|
| 1 | 0 | 13 | 2 | yes |
| 2 | 41 | 14 | 3 | yes |
| 3 | 77 | 15 | 3 | yes |
| 4 | 13 | 16 | 4 | yes |
| 5 | 94 | 14 | 3 | yes |

Seed 1's shift is 0 — the teaching instance, where the plan is in clear and everything else is
still true — and seeds 2–5 are not. Both figures move on every seed and neither is guessable across
five of them.

**Missability, proved** (`world-8/__tests__/bonus.test.ts`): the same reference run with its reading
dropped passes and is refused on all five seeds; none of the five shifts guessed as a constant
carries all five seeds; and the right shift under a leg count one out is refused on all five.

**Test 3.** An idle program is refused it on all five seeds, asserted.

**Legibility.** A `facts` row states the line format and says outright that neither figure is
anywhere in the workings; a sixth hint says the same in the contractor's voice and points at the
ninety-five. The divergence never returns either number: a wrong shift comes back as
`the cipher / the shift every filed packet adds up under / shift 48 of the ninety-five`, and a wrong
count as `the plan / the legs the filed sections describe / 15 legs`. The second is asserted not to
contain the true count and not to contain any of `N`, `E`, `S`, `W` — a leg of the plan must never
leak out of a report about the plan. **No `progress()`**: neither figure is a running total.

**Reference.** Both halves updated with one line each, placed immediately after the plan is
assembled and before a step is taken. Ticks unchanged on every seed (101 / 121 / 205 / 223 / 123,
par 223).

**What this does not fix.** The level is still free: the required objectives can be met in 9–117
ticks by a route that never touches the band, and gold is still available with 106–158 ticks of
room. That is a content repair on the *required* half — the par agent's proposal is to re-baseline
the reference rather than move par — and it is not this document's. What has changed is that the
star no longer *rewards* the free route; it is now the one thing on the level that cannot be had
without the cipher.

Dead code removed with the old bonus: `plannedTiles`, `offPlan`, `strayAllowance`, `strayTrail`.

---

## `w8-05` The Kessler Contract — `under-budget` → `name-the-hold`; two more deleted

The finale carried three stars. **Two of them were satisfied by a program that does nothing**, and
the third was unreachable by any program at all.

### `under-budget` and `no-blocked-moves` — deleted, and why the argument is about predicates

`under-budget` was `endTick <= floor(deadlineFor * 0.8)` — a tick tightening against a *required*
tick objective (`deadline`) on the same axis, which is the ordinary complaint. `no-blocked-moves`
was `blockedMoves === 0` on a level that already asks four other hard questions, which is A10
double-pricing with none of `w7-03`'s excuse.

The measurement that settles both: an **idle `print()` program** satisfies both, on all three seeds.
Of course it does — `endTick` is ~0, so it is inside any deadline, and a run that never moves is
never blocked. Both predicates measure the **absence** of something and are therefore vacuously
true of a program that did not play the level.

The severity is worth stating precisely, because it is easy to overstate. `src/game/store.ts:552`
reads `stars: verdict.passed ? [...] : previous.stars`, so **a failed run banks no stars** and no
player collects points this way. The defect is not in scoring. It is that **the only thing standing
between those two predicates and a do-nothing program is `verdict.passed`, a gate outside the
objective** — so neither predicate was asking a question. Two of the finale's three stars were
carried entirely by the level's required objectives.

### `fleet-utilisation` — deleted, because it is unreachable and points the wrong way

*"Keep every bot working for at least two thirds of the shift"*: `worstIdleFraction <= 0.35`. The
reference has never earned it, and not narrowly:

| seed | end | bots | worst bot | idle share | needs |
|---|---|---|---|---|---|
| 1 | 560 | 6 | KD-81 | **89%** | ≤ 35% |
| 4 | 806 | 7 | KD-81 | **90%** | ≤ 35% |
| 7 | 917 | 6 | KD-81 | **85%** | ≤ 35% |

That is not a hard bonus, it is a different order of magnitude, and the reason is structural. World
8's `idleTicks` charges a bot for three things: `wait`, **`sync`**, and the tail it spends finished
while the rest of the fleet is still out. So the predicate says, in effect, *never synchronise and
have every bot stop at the same instant* — on a level whose reference solution syncs the fleet every
third pass and twice per grid rank, with a comment explaining that it has to (a bot behind in
virtual time cannot walk through ground the crew was standing on). **The star pays for not
coordinating, on the campaign's coordination finale.** And the fleet is role-specialised by design —
one electrician, one clerk, the rest on crates — so the clerk, whose whole shift is one errand, is
idle by construction. `KD-81` is the same bot on all three seeds.

Deleted rather than recalibrated. A threshold that does not charge `sync` would be a real bonus, but
choosing that number is a difficulty decision on the finale and belongs to the orchestrator, not to
a bonus rewrite. It is recorded here as a proposal.

### The replacement: `name-the-hold`

*"Name the substation your order left standing longest"*. One line, `held <station> <n>`: the
substation with the longest gap between the last of its feeders going quiet and its own first
`use()`, and how many ticks that gap was.

**What second question it asks.** *Where did your schedule leak?* `precedence` grades one side of
every edge in the graph — nobody may start **early** — and **nothing on the level has ever looked at
the other side**, which is where the time actually goes. A grid that came up in a legal order and a
grid that came up in a legal order with sixty ticks of dead air under it are the same `met` on every
required objective. It is the quantity `fleet-utilisation` was groping at, asked honestly: not "was
a bot idle", which the level's own architecture forces, but "was a piece of *work* idle", which is
the player's decision alone. And it is a fact about the schedule the player wrote, not about the
site: it does not exist until a run produces it.

**Calibration** (measured, reference solution, seeds `[1, 4, 7]`):

| seed | holds, per fed station | longest | answer filed |
|---|---|---|---|
| 1 | `sub-1` 48, `sub-2` **60**, `sub-3` 51, `sub-6` 38 | 60 | `held sub-2 60` |
| 4 | 40, 28, 38, 29, 51, 18, 41, 22, **61** | 61 | `held sub-9 61` |
| 7 | 50, 40, 45, 36, 46, **95**, 45, 53, 61 | 95 | `held sub-6 95` |

A unique winner on every seed, three different stations, three different figures, and no seed
answers zero. Ties would be accepted if they occurred. Root stations — the ones with no feeder —
are excluded, because a station with nothing to wait for cannot have waited.

**Missability, proved** (`world-8/__tests__/bonus.test.ts`): the same reference run with its
hand-over note dropped passes and is refused on all three seeds; the right figure under `sub-0` is
refused on all three; the right station under a figure one out is refused on all three.

**Test 3.** An idle program is refused it on all three seeds, asserted — it energises nothing, so
there is no hold to name. That is the whole point of the replacement.

**Legibility.** A `facts` row states the line format; a sixth hint says that nothing in the grid
records when a station *could* have started, only when it did, so the clock has to be read as each
one is thrown. The divergence prices a wrong claim against itself and never names the right
station. **No `progress()`**: one edge's slack is not a run-wide total.

**Reference.** Both halves updated: `light()` now records the thrower's clock before the `use` that
lights each station, and the report is computed from that map at the end. Ticks unchanged on every
seed (560 / 806 / 917, par 1050) because `print` and `clock` are free. Confirmed tick-neutral
independently by the par agent.

**One star on the finale, deliberately.** The instruction was not to cut two and leave the level
with one. Measurement then showed the third was unreachable as well, and the honest choices were a
second report bonus (the airlock toll: *who paid it and when it came open* — a real question, but
the same mechanic twice on one level) or a recalibrated utilisation threshold (a difficulty
decision, not mine). The finale carries **five required objectives**, more than any other level in
the campaign, so its ambition budget is not thin. One star that asks something is worth more than
three that do not.

Dead code removed with the three deletions: `blockedBy` (in `w8-05.ts`), and `blockedMoves`,
`firstBlockedMove`, `idleTicks`, `worstIdleFraction`, `worstIdler` (in `world-8/shared.ts`).

---

## The third test, as a table

An idle program — one `print()` and nothing else — driven against every bonus in Worlds 7 and 8, on
every declared seed. `MET` means the star was awarded to a program that did not play the level.

| level | bonus | shape | idle program |
|---|---|---|---|
| `w7-01` | `name-the-idle` | report | refused |
| `w7-02` | `even-share` | distribution | **MET** |
| `w7-03` | `no-bumps` | absence | **MET** |
| `w7-04` | `name-the-decider` | report | refused |
| `w7-05` | `workers-busy` | budget | refused (guarded by `span > 0`) |
| `w8-01` | `name-the-row` | report | refused |
| `w8-01` | `within-10-look` | sense budget | **MET** |
| `w8-02` | `ship-while-you-look` | timing | refused |
| `w8-03` | `within-26-probe` | sense budget | **MET** |
| `w8-04` | `read-the-plan` | report | refused |
| `w8-05` | `name-the-hold` | report | refused |
| — | *`w8-04` `no-resurvey` (deleted)* | absence | **MET** |
| — | *`w8-05` `under-budget` (deleted)* | budget | **MET** |
| — | *`w8-05` `no-blocked-moves` (deleted)* | absence | **MET** |
| — | *`w8-05` `fleet-utilisation` (deleted)* | budget | **MET** |

**Every report-shaped bonus passes. Every absence- or budget-shaped one fails, including the two
engine-minted `withinSenses` budgets.** That is the finding: the test cleanly separates *positive*
predicates, which require the run to produce a fact, from *negative* ones, which are satisfied by
the run not happening. It is decisive where it also coincides with test 1 or test 2 — which is how
it condemned `w8-05`'s two — and it is a smell rather than a verdict where the bonus survives the
other two, because a sense budget cannot be phrased any other way and is the only instrument the
engine has for pricing information.

## What the worst-seed grading change did, in one paragraph

Grading moved from seed one to a conjunction over every seed while this pass was running. The
seed-grading agent's own finding is the useful part: **three bonuses lost their star under the new
rule — `w7-02 within-ten-percent`, `w7-04 within-bound`, `w8-01 audit-tight` — and all three were
budget bonuses, whose margin varies seed to seed. Not one predicate bonus moved.** Those are three
of the objectives this document deletes, arrived at by a completely independent route, and it is the
strongest confirmation available that the tick-tightening family was the weak half of the layer.
`docs/FIX-BONUS-SEEDS.md` §6 is stale wherever a bonus was rewritten here; this document is the one
that counts. Every calibration table above is a per-seed measurement taken after the merge, and
every new star is earned by the reference on **every** declared seed.

## Files, and what is left

Changed: `w7-01`, `w7-02`, `w7-04`, `world-7/shared.ts`, `world-7/__tests__/divergence.test.ts`,
`world-7/__tests__/bonus.test.ts` (new), `w8-01`, `w8-03`, `w8-04`, `w8-05`,
`world-8/shared.ts`, `world-8/__tests__/divergence.test.ts`, `world-8/__tests__/bonus.test.ts`
(new), and the reference solutions for `w7-01`, `w7-04`, `w8-01`, `w8-04`, `w8-05` — **both halves
of each**, including the two levels whose halves have drifted into different algorithms.

Left undone, deliberately:

1. **`w7-05 workers-busy` is still never earned.** Argued reachable, not proved. Proving it means a
   better reference solution, which is a par-affecting change.
2. **`w8-04` is still free on its required half.** The star no longer rewards the free route, but
   the route is still free. Routed separately.
3. **`w8-05` could take a second star** — the airlock toll report, or a utilisation threshold that
   does not charge `sync`. Both are proposals above; neither is a bonus rewrite.
4. **`src/game/__tests__/budget-declarations.test.ts` is red**, by design: `w8-01/audit-tight`,
   `w8-03/tight-shift` and `w8-05/under-budget` are pinned rows there and all three are gone. That
   file is the orchestrator's to reconcile.
