# FIX-BONUSES-3-5 — the bonus star in Worlds 3, 4 and 5

Follows `docs/FIX-BONUSES.md`, which did Worlds 1–2 (and `w3-01`, `w3-02`, `w3-04` in part). Same
standard, same test, applied to every bonus objective in Worlds 3–5:

> **Does this ask a question the required objective does not ask?**

The bar is `w6-02`'s `name-the-fault` — *report which byte was altered*. This document was
commissioned with `w4-02`'s mark budget alongside it as a second exemplar, on the strength of both
playtesters naming it. **That premise was false and the level is in scope**; the argument is in
`docs/FIX-BONUSES.md` and the write-up is below.

Two acceptance tests were added to the first while the pass was running, and every bonus here has
to survive all three:

> **Is it earned by the cheapest correct program?**
>
> **Is it satisfied by a program that does nothing?**

No par, tick budget, threshold, required objective, cost override or medal weight was changed.
Nothing here counts characters.

---

## Verdicts

| Level | Bonus | Verdict | One line |
|---|---|---|---|
| `w3-01` | `clean-run` | **REPLACED** → `straight-runs` | Was `endTick <= par && failedPickups === 0`: par restated with a no-error conjunct. Now a report — how many of this shift's trips run flat. `from-the-lane` was designed, measured and **overruled**; see below. |
| `w3-02` | `one-depot-at-a-time` | **KEEP** | Batching structure, not a tighter number. Reference misses it on all four seeds. |
| `w3-04` | `aisle-discipline` | **KEEP** | A resource the required objective never mentions. Reference misses it on all four seeds. |
| `w4-01` | `single-pass` | **REPLACED** → `within-60-look` | Was free: the tunnel does not fork, so any program that reaches the pad has already made one pass. Now a `look` budget — use the ray as a ray. |
| `w4-02` | `mark-budget` | **REPLACED** → `breadcrumb-trail` | ~~KEEP, untouched — the exemplar.~~ **Overturned.** `docs/FIX-BONUSES.md` "The exemplar was broken" proves the old budget paid a star for leaving the marks in the crate: zero marks satisfied it, and `PLAYTEST-VETERAN.md` §122 recorded gold + star on run 1 with *"I placed zero marks"*. Now: leave a trail a bot at the vein could follow home. |
| `w4-04` | `best-order` | **KEEP** | Six permutations against true shortest-route costs. The required objective asks for *all three*, never for the *order*. |
| `w4-05` | `fuel-reserve` | **REPLACED** → `filed-return` | Was `burned <= 0.8 × tank`, met on all five seeds with 27–59% to spare, and fuel is the same axis as the clock here. Now: state the price of the trip home before you commit to it. |
| `w5-01` | `one-pass` | **KEEP** | Asks whether the chain was read before the bot drove. The required objective is met by a bot that walks the wrong way first. |
| `w5-02` | `eight-probes` | **KEEP (weakest)** | Same axis as the required 10-probe budget. Kept because 8 = `ceil(log2 200)` is the information floor rather than an arbitrary shave. Argued below. |
| `w5-03` | `tight-order` | **KEEP** | Not a tightening: travel distance appears in no required objective. Argued below. |
| `w5-03` | `within-20-probe` | **KEEP** | An information budget on a level whose required objectives count no reads at all. |
| `w5-04` | `largest-idle` | **KEEP** | Identify-then-exclude. A genuinely different question. |
| `w5-05` | `tight` | **REPLACED** → `name-the-weak-link` | Was the required `budget` at 102% instead of 108%, and the level's own hints hand you Prim, so the reference met it on every seed. Now: name the substation the district most hangs off. |

**Objective ids for whoever reconciles `src/game/__tests__/budget-declarations.test.ts`:**

| Change | Level | Id |
|---|---|---|
| deleted | `w3-01` | `clean-run` (this is the pinned row that shrinks) |
| deleted | `w4-01` | `single-pass` |
| deleted | `w4-02` | `mark-budget` |
| deleted | `w4-05` | `fuel-reserve` |
| deleted | `w5-05` | `tight` |
| added | `w3-01` | `straight-runs` (no `progress()`, no meter word in the label) |
| added | `w4-01` | `within-60-look` |
| added | `w4-02` | `breadcrumb-trail` |
| added | `w4-05` | `filed-return` |
| added | `w5-05` | `name-the-weak-link` |

No label was changed on any kept objective.

**Every star is worth 1 point** (`BONUS_STAR_POINTS`, `src/game/score.ts:13`), against gold's 3
(`MEDAL_WEIGHT`). Nothing in this pass changes what a star is worth; it changes what one is *for*.
Deleting an id is safe for existing saves without a migration: `starsFor` counts only star ids the
level still offers, so a retired id in a save scores zero rather than a phantom point.

---

## Two rulings that landed mid-pass, and what they changed here

**1. Bonuses are now graded on the worst seed, not on seed one.** Every calibration below is
therefore stated per seed and every claim is a conjunction over the whole seed list. The
seed-grading agent's own finding is worth repeating because it is an argument for the mould this
document is written in: **three existing bonuses lost their star under the new rule and all three
were budget bonuses. Not one predicate bonus moved.** A threshold's margin is a property of the
layout and moves with the seed; "report the fact" and "leave the artefact" are properties of the
program and do not.

**2. A third acceptance test: is the bonus satisfied by a program that does nothing?** From the
finale, where an idle `print()` program satisfies two of `w8-05`'s three bonuses — both of which
measure the *absence* of something, and a run that never moves is inside any deadline and is never
blocked. Severity, stated precisely: `src/game/store.ts:552` is
`stars: verdict.passed ? [...] : previous.stars`, so a failed run banks no star and no player
collects points this way. **The defect is in the predicates, not in scoring** — but a predicate
that is true of a program that did not play the level is not asking a question, and the only thing
saving it is a gate outside itself.

The general rule this pass ended on, arrived at twice from opposite directions:

> **Prefer a bonus that requires evidence of a thing done over one that requires the absence of a
> thing done.**

`w4-02`'s `breadcrumb-trail` is robust to all three tests for exactly that reason: it demands a
positive artefact — a trail that actually leads somewhere — and no artefact appears by accident.
The old mark budget was killed for the mirror-image reason: it rewarded a *low count*, and the
lowest count is zero, which is what a program that ignores the mechanic produces.

**The do-nothing sweep, run against every bonus in Worlds 3–5** (`probe/idle.test.ts`). Driver:
`print('.')` and nothing else, on every declared seed. The run's verdict is `passed = false` on
every row — the idle program completes no level in Worlds 3–5 — so nothing here is exploitable
today. The column that matters is whether the **predicate** is true of a program that did not play
the level.

| Level | Bonus | Shape | Idle run satisfies the predicate? |
|---|---|---|---|
| `w3-01` | ~~`clean-run`~~ → `straight-runs` | report | **no** — nothing filed |
| `w3-02` | `one-depot-at-a-time` (KEEP) | "never …" | **YES**, all 4 seeds |
| `w3-04` | `aisle-discipline` (KEEP) | budget | **YES**, all 4 seeds |
| `w4-01` | ~~`single-pass`~~ → `within-60-look` | budget + arrival | old: **YES** ×3 · new: **no** |
| `w4-02` | `breadcrumb-trail` | artefact | **no** — no crumbs, no trail |
| `w4-04` | `best-order` (KEEP) | artefact | **no**, all 4 seeds |
| `w4-05` | ~~`fuel-reserve`~~ → `filed-return` | budget → report | old: **YES** ×5 · new: **no** |
| `w5-01` | `one-pass` (KEEP) | ordering | **YES**, all 3 seeds |
| `w5-02` | `eight-probes` (KEEP) | budget | **YES**, all 5 seeds |
| `w5-03` | `tight-order` (KEEP) | budget | **YES**, all 4 seeds |
| `w5-03` | `within-20-probe` (KEEP) | budget | **YES**, all 4 seeds |
| `w5-04` | `largest-idle` (KEEP) | "exclude …" | **YES**, all 5 seeds |
| `w5-05` | ~~`tight`~~ → `name-the-weak-link` | budget → report | old: **YES** ×5 · new: **no** |

**Eight of the twelve bonuses this pass inherited are satisfied by a program that does nothing** —
`w3-02`, `w3-04`, `w4-01`, `w4-05`, `w5-01`, `w5-02`, `w5-03` (both), `w5-04`, `w5-05`. That is not
two instances, it is the majority, and the pattern is exact: **every one of them measures a
maximum, an absence or an exclusion.** The four that refuse the idle run are the four that demand
something be *produced* — a report, a trail, an ordering of work actually done.

All five bonuses this pass authored or reworked refuse the idle program on their own predicate.
Every remaining "YES" is on a level the brief marked KEEP and is left standing, but the finding is
now a class rather than a curiosity and should be closed as one. **The fix is one conjunct in each
case — require the level's own required objective inside the bonus predicate** — which is exactly
what was applied to `w4-01` below, costs nothing, and changes no calibration. Recommended as a
follow-up pass; deliberately not bundled into a brief that said "do not change the KEEP levels".

---

## `w3-01` Pick and Place — `clean-run` → `straight-runs`

**Old, and why it failed the test.** `clean-run`, *"Finish inside 157 ticks with no grab that comes
up empty"*: `endTick <= PAR_TICKS && failedPickups === 0`. The first conjunct **is gold** — the
medal on this level is `ticks <= par` and par is 157 — so the star was the medal with a no-error
rider. `docs/FIX-INCENTIVES.md` §198 already classified it as "a par restatement with a no-error
conjunct". It also fails the third test in its second conjunct: a run that never picks anything up
has no failed pickup. **Fails.**

**`from-the-lane` was designed, measured, and overruled.** The plan in the verdict table was a
footprint budget: `scan` reads the bot's own tile and both neighbouring rows, the yard interior is
only three rows deep, so the whole shed can be surveyed from the middle lane and the reference
walks two lanes instead. It is a pretty idea and it is **the wrong axis**, for a reason the
measurement makes flat:

> `docs/FIX-PAR-3-8.md` §6.1: the row-by-row surveyor — *"one survey, but walked row by row
> instead of read three rows from one"* — costs **176, 157, 112** against a par of **157**. Its
> worst seed already **loses gold**.

So a footprint budget calibrated to refuse the row-by-row surveyor refuses exactly the runs the
medal already refuses. It is `clean-run`'s defect in a new unit. It would also have required
speeding the reference up from 157 to ~143 (the veteran's recorded figure,
`PLAYTEST-VETERAN.md` §112), which pushes par's headroom from 0% to 9% on a level the par pass
explicitly ruled should not move. **Not shipped.** Recorded here because the negative result is the
useful part: *a budget is only a second question when it is not a proxy for the first one.*

**New.** `straight-runs` — *"Report how many trips need no change of row"*. One line,
`straight <n>`, where `n = Σ over rows min(crates in that row, pads in that row)`: the number of
this shift's trips that could be run flat, straight east from crate to pad.

**What second question it asks.** *Which rows did the yard put things in, and how do the two
sidings line up?* The required objective is `pads-loaded` — leave a crate on every pad — and it is
completely indifferent to rows: a run that fetches and carries in any order passes. The medal is
the clock. Neither ever asks the run to hold both sidings *as rows* and match them, which is the
one structural fact about a shift on this board. It is a fact about **the yard**, not about the
route, so it cannot be produced as a side effect of driving well, and the level's own fact table
has always advertised the variation it depends on (*"Which rows the crates sit in, and which rows
the pads sit in, both change"*) without anything grading it.

**It costs nothing, by construction.** `print` is free (`src/engine/sim.ts:773`, *"Free."*), so the
reference's tick counts are **identical** before and after — 157 / 138 / 91, gold on every seed,
par untouched at 157. This is the check `docs/FIX-PAR-3-8.md` §10 asks for, and a report bonus
passes it trivially: the star cannot be a tax on the medal when the star costs zero ticks. Worth
generalising — **the report mould is the only bonus shape that is free of the `w1-03`/`w6-04`
class by construction.**

**Calibration** (measured, `probe/w345.test.ts`, all three declared seeds):

| seed | crates | crates per row (y=1,2,3) | pads per row | answer |
|---|---:|---|---|---:|
| 1 | 6 | 2, 2, 2 | 2, 2, 2 | **6** |
| 2 | 5 | 2, 2, 1 | 1, 2, 2 | **4** |
| 3 | 3 | 2, 0, 1 | 0, 1, 2 | **1** |

Three different answers on three seeds, and none of them is the crate count except on seed 1 —
where the sidings are full, every trip really is flat, and 6 is the honest answer. Under worst-seed
grading a memorised 6 now scores nothing, which the missability test pins.

**Legibility.** A `facts` row states the line format and defines "flat"; a fifth hint gives the
row-by-row `min` without giving any seed's number. Label carries no meter word (`tick`, `op`,
`pickup`, `drop`, `scan`, `move`) and there is **no `progress()`** — the quantity is one line,
right or wrong, not a total, so a bar would have to be pointed at some run-wide meter and would be
the `6 / 1 pickups` bug over again (DESIGN.md §11 A13). `world-3.test.ts`'s old
"metered in ticks, not in pickups" test is now "names no meter and offers no bar to point at the
wrong one", and asserts both directions.

**Divergence, and what it does not hand over.** Three cases, none of which contains the figure: no
line at all → `the shift report / a line saying how many trips run flat / (nothing)`; a wrong
figure → `the shift report / a different figure / straight 0`, the run's own line back; and more
than one line → `one line about the shift / 7 of them`, which closes the "print every candidate"
answer explicitly. `world-3/__tests__/divergence.test.ts` pins all three and asserts the `expected`
string contains no digit.

**Proof** (`src/levels/world-3/__tests__/bonus.test.ts`):
- *the reference earns it on every seed, still inside par* — both halves of the solution updated
  (`run` and the `source` string), 157 / 138 / 91, gold ×3, star ×3.
- **Missability** — *the same run without its report line*: the shipped reference, tick for tick,
  with only its `straight` line dropped from the trace. Loads every pad, takes gold on all three
  seeds, and is refused the star on all three. This isolates the single variable the star grades.
- **Not memorisable** — `straight 6` is right on seed 1 and refused on seeds 2 and 3.
- **Not free to a do-nothing program** — an idle `print` run fails the level and is refused.
- The pre-existing *"a round that re-surveys before every trip is correct and misses the star"*
  (323 ticks, no failed pickup) still misses, now for a better reason: it files nothing.

**Worth:** 1 point, unchanged. `w3-01`'s maximum is still gold 3 + 1 star = 4.

---

## `w4-01` Headlamp — `single-pass` → `within-60-look`

**Old, and why it failed the test.** `single-pass`, *"Reach the pad without entering a tile
twice"*. **Measured free.** The tunnel bends and does not fork, so any program that arrives at the
pad has walked the corridor once and nothing else; the reference took the star on all three seeds,
and so does every correct program in `docs/FIX-PAR-3-8.md` §6.1 — which records this as the one
board in Worlds 3–8 where *"the route is forced"* and two programs sharing none of the level's idea
produce **tick-for-tick identical runs**. A star nothing can fail is confetti. It also failed the
do-nothing test: a bot that never moves has entered no tile twice.

**Why this level cannot carry a tick star at all.** Every correct program costs 48 / 52 / 50. Par
is 52. There is no number to tighten, which is what makes an **information** budget the only honest
second axis here: ticks are identical across programs, rays are not.

**New.** `within-60-look` — *"Reach the pad on 60 rays or fewer"*.

**What second question it asks.** *Did you read the ray as a ray?* `look(dir)` returns the whole
straight stretch of corridor in one free call — the level's own fact table says so — and the
required objective, the medal and the old star were all completely indifferent to whether the
player used that or poked one tile ahead before every step. This is the level's entire subject
(`hardware: ['look']`, `title: 'Headlamp'`) and nothing graded it.

**Calibration** (measured, `probe/w345.test.ts` and `probe/lazy45.test.ts`, all three seeds):

| seed | ticks (both programs) | rays: ray-walker | rays: one-tile feeler | allowance |
|---|---:|---:|---:|---:|
| 1 | 48 | **35** | 85 | 60 |
| 2 | 52 | **41** | 108 | 60 |
| 3 | 50 | **34** | 101 | 60 |

Worst seed 41 against 60 — 32% of headroom, so the star is not a knife-edge — and the cheapest
program *without* the idea is 42% over the line on its best seed. Sixty was picked to sit between
the two families with room on both sides: it admits a bot that checks all four directions at each
bend instead of stopping at the first opening (~3 rays a bend, ≈50), and refuses anything that
treats the ray as a feeler.

**The tick-tax check** (`docs/FIX-PAR-3-8.md` §10). Passed trivially: `look` is free and the
reference's route is unchanged. **The tick counts are identical before and after this change** —
48 / 52 / 50 against par 52, gold on every seed. Attempting this star costs nothing.

**The do-nothing conjunct, and why it is in the predicate rather than outside it.** A budget alone
is satisfied by a program that never runs: nought rays is inside any allowance, and the old
`single-pass` and every other `<=` bonus in Worlds 3–5 has the same hole. So the predicate is
`botEndsOn(pad) && rays <= 60`, and the divergence branches on which half failed — a run that never
arrived is told **where it stopped**, not how many rays it had spare, because that is the more
useful sentence. This is the one-conjunct fix recommended above for the four World 5 budgets.

**Legibility and the meter.** The id is minted in the engine's own `within-<n>-<meter>` shape, so
`meterFor` takes the meter from the **id** and never consults the label (`src/game/budgets.ts:132`)
— second in A13's order of preference, and the objective genuinely counts the whole of the `look`
meter, so the bar is honest: `35 / 60 rays`. `budget-declarations.test.ts` skips minted ids, so this
adds nothing to the list pinned there. The label says "rays" rather than "looks" so the readout's
noun is a word about the world instead of a word about the API. A fact row states the allowance and
a fifth hint says what a ray is worth, neither naming a seed's figure.

**Proof** (`src/levels/world-4/__tests__/bonus.test.ts`):
- Both halves of the reference rewritten — `run` and the `source` string — to look down the
  corridor and drive the stretch it sees. Same algorithm in both, checked against both.
- *the reference earns it on every seed* — 48 / 52 / 50, gold ×3, star ×3, 35 / 41 / 34 rays.
- **Missability** — `feltAhead` (`__tests__/lazy.ts`), the level's shipped reference before this
  change: passes, **and the test asserts its tick count equals the reference's on every seed**, so
  the medal cannot tell the two apart. Refused the star on all three seeds.
- **Not free to a do-nothing program** — idle run refused on all three seeds.
- `divergence.test.ts` pins both branches: over-budget gives `look() / 60 rays / <n> rays`, and a
  run that never arrives gets the pad's coordinates.

**Worth:** 1 point, unchanged.

---

## `w4-02` The Cave — `mark-budget` → `breadcrumb-trail`

**The verdict table row that said "KEEP, untouched — the exemplar" is stale and is corrected
above.** The premise this pass was briefed on — both playtesters named `w4-02`'s mark budget as
the one bonus that worked — is false, and `docs/FIX-BONUSES.md` ("The exemplar was broken") holds
the argument. The level file was reworked by the previous agent; this section is its write-up, its
per-seed verification and its missability proof.

**Old, and why it failed.** `mark-budget`, *"Reach the vein having placed fewer than 180 marks"*.
It poses a real-sounding question and is satisfied for free by the cheapest correct program, which
is the failure mode this pass's second acceptance test exists to catch:

- `mark()` costs a tick and the reference paid one per newly-entered tile. DESIGN.md §11 A3 makes
  an ordinary JavaScript `Set` explicitly legitimate — it is taught, not smuggled — and a `Set`
  does the same job for nothing. **The level's own issued hardware is strictly dominated.**
- The budget rewarded a *low* count, and the lowest count is zero. So the star paid out for
  declining to use the mechanic the level exists to teach.
- `docs/PLAYTEST-VETERAN.md` §122, recorded a week earlier and never connected to it:
  *"gold 236/391 + star, 1st run… **I placed zero marks**."*

**Reproduced here, to the tick.** `rememberedVisited` in `src/levels/world-4/__tests__/lazy.ts` is
that run — the identical DFS with the visited set in a `Set` instead of on the tiles. Measured
**112 / 204 / 236 / 178** against par 391: gold on every seed, and **236 on seed 3 is the veteran's
recorded figure exactly**. A constructed program that reproduces a human playtest to the tick is
the strongest evidence in either document, and it is now a standing test.

**New.** `breadcrumb-trail` — *"Leave breadcrumbs a bot at the vein could follow home"*. Every mark
names the tile the bot arrived from, as `"x,y"`, and the grader walks the chain from a **neighbour
of the vein** back to the start: each crumb must name an orthogonal, walkable, not-yet-passed
neighbour, or the trail has stopped leading anywhere.

**What second question it asks.** *What could somebody who did not write your program reconstruct
from what you left behind?* The required objective is *reach the vein*; the medal is the clock;
neither has any opinion about the tiles the bot leaves behind it. And the question is precisely the
half of `mark` a `Set` cannot answer: a closure goes home with the bot, a mark stays in the cave
and can be read by something that did not write it. **The dominated mechanic becomes the only way
to earn the star**, which is the inversion the old budget had backwards.

**It costs nothing extra.** The same one mark per newly-entered tile — the crumb is a longer
string, not an extra call — so the reference's ticks are unchanged and the star cannot tax the
medal. The grader deliberately starts one tile *out* from the vein rather than on it, so that the
star never demands a crumb under the bot's own feet on the seed the reference runs at par.

**Calibration** (measured, `probe/measure.test.ts`, all four declared seeds):

| seed | reference ticks / par | medal | star |
|---|---:|---|---|
| 1 | 214 / 391 | gold | yes |
| 2 | 359 / 391 | gold | yes |
| 3 | 391 / 391 | gold | yes |
| 4 | 304 / 391 | gold | yes |

**Proof** (`src/levels/world-4/__tests__/bonus.test.ts`), three assertions rather than two:
- *the reference earns it on every seed* — passes, inside par, star on 1, 2, 3 and 4.
- **Missability, the recorded run** — `rememberedVisited`: places zero marks, reaches the vein,
  takes gold on all four seeds (112 / 204 / 236 / 178), **refused the star on all four**. The exact
  run that used to collect it.
- **Missability, the honest-but-shallow run** — `markedVisited`, the level's own shipped reference
  before the change, marking a bare `"v"`: uses the hardware, turns the cave's loops into a tree
  exactly as well, passes, takes gold (214 / 359 / 391 / 304), **and is still refused**. Using the
  mechanic is not enough; the trail has to say something.
- **Not free to a do-nothing program** — idle run refused on all four seeds.
- `divergence.test.ts` pins two shapes, neither of which hands the answer over: no crumb near the
  vein → `(x, y) / a breadcrumb beside it / (nothing)`; a bare visited flag →
  `(x, y) / the tile the bot arrived from / v`. The run gets its **own** crumb back and the tile it
  wrote it on, never the tile it should have named.

**Why this one is the model, and the general rule it produced.** `breadcrumb-trail` is the only
bonus in Worlds 3–5 that survives all three acceptance tests without a conjunct bolted on, and the
reason is structural: **it demands a positive artefact rather than the absence of one.** A trail
that leads home does not appear by accident, cannot be produced by doing nothing, and cannot be
produced more cheaply by skipping the mechanic. The old budget failed for the mirror-image reason —
it rewarded a low count, and zero is a low count. Same lesson, from both ends.

**Worth:** 1 point, unchanged.

---

## `w4-05` The Deep Shaft — `fuel-reserve` → `filed-return`

**Old, and why it failed the test.** `fuel-reserve`, *"Finish the job on one tank with a fifth of
it unused"*: `fuelBurned <= 0.8 × tank`. Three separate failures, any one of which is fatal:

- **It is not a second axis.** The level's own fact table says *"Acting spends fuel equal to the
  ticks it costs"*. So fuel and the clock are the same number twice, and the star was the medal in
  a different unit — the exact defect this pass exists to remove.
- **The reference met it on all five seeds with 27–59% of the allowance still to spare**, which is
  not a challenge, it is a receipt.
- **A bot that never starts satisfies it.** A fifth of the tank is trivially unused if none of it
  is used, so the predicate was true of a program that did not play the level.

**New.** `filed-return` — *"File what the trip home will cost before driving it"*. The moment the
fifth ore is cut, and **before the bot moves again**, the run files one line `home <n>`; `n` must
equal the number of moves it then actually spends getting back to the lift.

**What second question it asks.** *Do you know what the way back costs before you commit to it, or
are you driving home and hoping?* The three required objectives are *carry five ore*, *end on the
lift* and *bring the bot back alive* — all of them verdicts on the final state, none of them with
any opinion about whether the route home was ever a number in the program. The level's fourth hint
has always been exactly this question — *"Before each step, ask what it would take to get home from
where that step lands you"* — and nothing graded it. A reactive walker that steps towards the lift
until it arrives cannot file the figure, because it does not have it until afterwards.

**The order is the predicate.** A price filed *after* the first move home is a description of a
trip already underway, so that case is separated in the grader and given its own sentence rather
than being lumped in with filing nothing. This is what stops the star from degenerating into
"report your own tick count at the end".

**Calibration** (measured, `probe/w405.test.ts`, all five declared seeds — the trip is instrumented
at the tick the quota completes, not inferred):

| seed | ticks / par | tile the 5th ore was cut on | the trip home, in moves |
|---|---:|---|---:|
| 1 | 478 / 700 | (17, 23) | **208** |
| 2 | 544 / 700 | (1, 37) | **62** |
| 3 | 566 / 700 | (25, 33) | **30** |
| 4 | 428 / 700 | (7, 33) | **52** |
| 5 | 348 / 700 | (1, 29) | **46** |

Five different answers on five seeds, none of them guessable and none of them a constant. Seed 1 is
the instructive one: the true shortest route from (17, 23) to the lift is **24** moves, and the
reference pays **208**, because the shortcut runs through cave the rays never covered. That is
deliberate and it is why the star grades *the price you filed against the price you paid* rather
than against a globally shortest path — **an honest surveying program cannot know a route it has
not seen, and a star it cannot earn without omniscience is not a star.** The claim the level asks
for is the one the player can actually make.

**The tick-tax check** (`docs/FIX-PAR-3-8.md` §10). Passed: `print` is free, the route is unchanged,
and the reference's tick counts are **identical before and after** — 478 / 544 / 566 / 428 / 348
against par 700, gold on every seed.

**Legibility.** A fact row states the line format and the ordering rule; a fifth hint says work the
route out, count it, say it, then drive it — in that order. Label carries no meter word and there
is **no `progress()`** (DESIGN.md §11 A13): the quantity is one line, and a bar would have to be
pointed at some run-wide meter — `move`, most likely — which is the `6 / 1 pickups` bug again.

**Divergence, four branches, none of them the number.** Quota never made →
`the last vein / 5 ore cut / the quota was never made`. Drove off first →
`the trip home / a price filed before the first move back / the bot drove off first`. Nothing filed
→ `… / a line saying what the way back costs / (nothing)`. Wrong figure →
`… / a different figure / home 61`, the run's own line handed back.

**Proof** (`src/levels/world-4/__tests__/bonus.test.ts`):
- Both halves of the reference updated — `run` and the `source` string — to cost the route, print
  it, then drive it. Star earned on **all five seeds**, ticks unchanged, gold ×5.
- **Missability** — the shipped reference tick for tick and vein for vein with only its `home` line
  dropped from the trace: brings the ore home, ends on the lift, takes gold on all five seeds,
  refused the star on all five.
- **Not approximable** — the same run with the figure moved by one is refused on all five seeds.
- **Order matters** — the same run with the same figure relocated to the end of the trace is
  refused on all five, and told `the bot drove off first`.
- **Not free to a do-nothing program** — idle run refused on all five, and told the quota was never
  made rather than being handed a star for burning no fuel.

**Dead code removed with the old bonus:** `tankSize` (local to the level) and `fuelBurned`
(exported from `world-4/objectives.ts`; the deleted objective was its only consumer). `markCount`
went with `w4-02`'s old mark budget for the same reason. Both deletions are required by the
`unused-exports` ratchet, not optional tidying.

**Worth:** 1 point, unchanged.

---

## `w5-05` Blackout — `tight` → `name-the-weak-link`

**Old, and why it failed the test.** `tight`, *"Finish within 2% of the shortest possible run"*:
`cableSpent <= ceil(mstWeight × 1.02)`. The required objective `budget` is
`cableSpent <= ceil(mstWeight × 1.08)`. **The star was the required objective with a smaller
number on it — the same predicate, the same meter, 102% instead of 108%** — which is the defect in
its purest form. Worse, the level's own third hint hands the player Prim in as many words
(*"at each step there is a cheapest cable that reaches something not yet on the network"*), and
Prim lands on the exact minimum here, so any player who read the hint cleared 102% for free: the
reference met it on all five seeds. And it was true of a bot that laid no cable at all — nothing
spent is inside any allowance.

**New.** `name-the-weak-link` — *"Report which substation the district most hangs off"*. One line,
`weak <id> <n>`: a substation whose loss would cut the most of the district off from the reactor,
and how many stations go dark with it, itself included.

**What second question it asks.** *You reconnected the district — now what happens when one of
these goes down?* The three required objectives are `connected` (is every station joined),
`budget` (did the drum stretch) and `energised` (did the switch-on order hold). All three are
about the grid **existing**; none of them has any opinion about its **shape**. A chain and a star
of equal weight satisfy every one of them identically and are completely different districts to
lose a substation in. That is a genuinely new question on a level whose whole subject is topology,
and it is the question anybody re-cabling after a blackout would actually be asked.

**Graded against the run's own grid, not against the MST.** `darkWithout` removes the node and asks
what the reactor can still reach, rather than reading a subtree size, because the run's grid is
whatever the run laid: a tree on the intended answer, but a player with drum left over is free to
close a loop — and a loop is exactly the thing that makes a station *not* load-bearing. Cutting the
node is the definition that survives both. Ties are accepted in either direction: any station that
achieves the maximum counts, so a district with two equal halves has two right answers and neither
is a trick.

**Calibration** (measured, `probe/w345.test.ts`, all five declared seeds, over the reference's own
tree):

| seed | point set | stations | the weak link | stations it carries | second-worst |
|---|---|---:|---|---:|---:|
| 1 | uniform | 10 | `sub-10` | **5** | 4 |
| 2 | clustered | 12 | `sub-6` | **8** | 6 |
| 3 | uniform | 14 | `sub-8` | **6** | 5 |
| 4 | clustered | 11 | `sub-2` | **11** | 6 |
| 5 | mixed | 13 | `sub-1` | **9** | 6 |

A unique winner on every seed, five different figures, and the answer tracks the point set exactly
as the level's own design intends: the two clustered seeds produce the most lopsided grids, and
seed 4 is the dramatic one — `sub-2` is the reactor's only neighbour, so **the entire district of
eleven hangs off one station**. Nothing here is memorisable and nothing is guessable from the
station count.

**The tick-tax check** (`docs/FIX-PAR-3-8.md` §10). Passed: `print` is free, the tree and the
switch-on order are unchanged, and the reference's tick counts are **identical before and after** —
40 / 48 / 56 / 44 / 52 against par 56, gold on every seed.

**Legibility.** A fact row states the line format and defines the load ("counting itself"); a fifth
hint points at the record the run is already keeping — which station each newcomer was cabled on to
— without doing the count. Label carries no meter word (`tick`, `op`, `probe`, `cable`, `link`,
`power`) and there is **no `progress()`**: the quantity is one line, and a bar would be pointed at
some run-wide meter, which is the `6 / 1 pickups` bug (DESIGN.md §11 A13).

**Divergence, four branches, none of them the answer.** Nothing filed →
`the outage report / a line naming what the district hangs off / (nothing)`. More than one line →
`one line about the district / 3 of them`, which closes "print every station". Wrong station →
`the outage report / a different station / weak sub-1 99` — the run's own line back, and **no hint
at which station is right**. Right station, wrong count → `sub-6 / a different figure / 1`, which
confirms the station and nothing else. That is the same trade `w6-02`'s fault report makes: one
fact back, the arithmetic still the player's.

**Proof** (`src/levels/world-5/__tests__/bonus.test.ts`):
- Both halves of the reference updated — `run` and the `source` string — to keep a `feeds` map
  while laying the tree and walk it back once at the end. Star earned on **all five seeds**, ticks
  unchanged, gold ×5.
- **Missability** — the shipped reference cable for cable and tick for tick with only its `weak`
  line dropped: lights the whole district inside the drum, takes gold on all five seeds, refused
  the star on all five. Every correct program for this board is Prim, so this is the only honest
  missability test: hold the tree fixed and vary just the sentence.
- **Both halves of the answer are load-bearing** — the right station under a figure off by one is
  refused on all five seeds, and the right figure under `sub-99` is refused on all five.
- **Not free to a do-nothing program** — idle run refused on all five.
- `divergence.test.ts` pins the "nothing filed", "wrong station" and "right station, wrong figure"
  branches, the last two driven by a deliberately chained grid so that the maximiser is known.

**Dead value removed with the old bonus:** `world.vars.tightBudget`, which the deleted objective
was the only reader of. `mstWeight` and `cableBudget` stay — the required `budget` still uses them.

**Worth:** 1 point, unchanged.

---

## Closing — the whole seed sweep, and what is owed to other owners

**Every reworked star, every declared seed, after the change** (`probe/measure.test.ts`). No par,
tick budget, threshold, required objective, cost override, seed list or medal weight moved, and
**not one reference solution's tick count changed** — every new star is filed with `print`, which
is free, or measured on a meter the route does not touch.

| Level | Star | Ticks / par, per seed | Medal | Star, per seed |
|---|---|---|---|---|
| `w3-01` | `straight-runs` | 157, 138, 91 / 157 | gold ×3 | ✔ ✔ ✔ |
| `w4-01` | `within-60-look` | 48, 52, 50 / 52 | gold ×3 | ✔ ✔ ✔ (35, 41, 34 rays of 60) |
| `w4-02` | `breadcrumb-trail` | 214, 359, 391, 304 / 391 | gold ×4 | ✔ ✔ ✔ ✔ |
| `w4-05` | `filed-return` | 478, 544, 566, 428, 348 / 700 | gold ×5 | ✔ ✔ ✔ ✔ ✔ |
| `w5-05` | `name-the-weak-link` | 40, 48, 56, 44, 52 / 56 | gold ×5 | ✔ ✔ ✔ ✔ ✔ |

The six KEEP levels are untouched and their references score exactly as before: `w3-02` and `w3-04`
still **miss** their stars on all four seeds — which is what a bonus a competent run has to reach
for looks like — and `w4-04`, `w5-01`, `w5-02`, `w5-03`, `w5-04` still earn theirs.

### What the pass is actually claiming

Four of the five replacements are **reports**, and that is a conclusion rather than a habit. Three
independent constraints all point at the same mould:

1. **A report cannot tax the medal.** `print` costs no tick, so `docs/FIX-PAR-3-8.md` §10's
   named failure class — a bonus that spends ticks inside a par calibrated without them, found
   twice in `w1-03` and `w6-04` — is structurally impossible for it.
2. **A report is stable under worst-seed grading.** The seed agent measured three bonuses losing
   their star to the new rule and all three were budgets, because a threshold's margin belongs to
   the layout. A fact about the shift is right or wrong on every layout equally.
3. **A report cannot be satisfied by a program that does nothing**, because a line that was never
   printed is not a line.

The one non-report, `w4-01`'s `within-60-look`, is a budget only because that board has no other
axis at all — every correct program costs the same ticks — and it needed an explicit arrival
conjunct to pass test 3, which is the cost of the shape.

### Owed to `src/game/__tests__/budget-declarations.test.ts` (not ours)

`INFERRED_FROM_LABEL` holds six rows and one of them is
`{ level: 'w3-01', objective: 'clean-run', kind: 'ticks', unit: null }`. `clean-run` is gone, so
**delete that row and the list becomes the five that remain** — the direction the file's own
docstring says is the only one allowed. Nothing this pass added joins it: `straight-runs`,
`filed-return` and `name-the-weak-link` declare no meter and infer none (their labels contain no
tick word, op word, sense name or trace event kind), and `within-60-look` is skipped by the file's
own `MINTED` test because its id is in the `within-<n>-<meter>` shape.

**This is the only currently-red assertion caused by an id change, and it is a deliberate handoff.**

### Owed to `src/__tests__/confessed-invariants.test.ts` (not ours)

Line 106 registers
`{ file: 'src/levels/world-4/objectives.ts', says: 'Mirrors the ledger \`Sim.charge\` keeps' }`,
which is `fuelBurned`'s docstring. `fuelBurned` was `w4-05` `fuel-reserve`'s only consumer and went
with it, so the registration is now stale and the guard is red. **Delete line 106's entry.** Note
which direction this is: the registration existed because `fuelBurned` was a second copy of a fact
the engine already owned (`docs/FIX-INVARIANTS.md` §42 lists it as
`fuelBurned` ↔ the ledger `Sim.charge` keeps). Deleting the objective **closed a confessed
invariant**, and the index should shrink by one.

`markCount` in the same file went with `w4-02`'s mark budget for the same reason. It carried no
confession, so nothing else moves.

`src/__tests__/unused-exports.test.ts` is **green** and was kept that way deliberately: World 4's
three lazy-route drivers live as file-local functions inside `world-4/__tests__/bonus.test.ts`
rather than in a shared `__tests__/lazy.ts`, because exporting them would have moved
`KNOWN_TEST_ONLY` from 68 to 71 and that pin is somebody else's to move.

### Not done, and deliberately

- **The four World 5 budgets that a do-nothing program satisfies** (`w5-01` `one-pass`, `w5-02`
  `eight-probes`, `w5-03` `tight-order` and `within-20-probe`), plus `w3-02` `one-depot-at-a-time`
  and `w3-04` `aisle-discipline`. All six are on levels the brief marked KEEP. Each is one conjunct
  away from being closed — require the level's own required objective inside the bonus predicate,
  exactly as `w4-01` now does — and none of them is exploitable today because `store.ts:552` banks
  no star from a failed run. Recommended as a short follow-up.
- **`w5-02` `eight-probes` remains the weakest star in these worlds** and this pass did not change
  that judgement: it is the same axis as the required 10-probe budget, kept only because
  8 = `ceil(log2 200)` is the information floor rather than an arbitrary shave.
- **`w3-01` remains a thin level.** The star is now a real question, but the measurement in
  `docs/FIX-BONUSES.md` still stands: greedy pairing is within two ticks of optimal on every seed,
  so there is no route-quality challenge on this board and there was never going to be one.
