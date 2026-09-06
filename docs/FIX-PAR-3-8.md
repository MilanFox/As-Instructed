# Par in Worlds 3–8 — measured

Companion to `docs/FIX-PAR.md`, which measured Worlds 1–2 in full (§1 reference-vs-par on all 34
levels, §2 lazy-vs-smart on Worlds 1–2 only) and then wrote, at §181:

> ### Worlds 3–8 — measured, and the table says leave them

This file exists because that sentence is **half true and the half that is missing is the half the
criterion is made of**. See §0.

## 0. Is the §181 claim backed by a measurement?

**Partly. It is backed by §1 and not by §2, and §2 is the one that answers the question.**

- `docs/FIX-PAR.md` §1 *is* a real measurement of Worlds 3–8. Its table has all 27 levels of
  Worlds 3–8 with per-seed reference ticks, and every number in it **reproduces exactly** when the
  same registry is driven again today (§2 below). Nothing in it is asserted.
- `docs/FIX-PAR.md` §2 — "what the lazy route and the good route actually cost" — has **ten rows
  and every one of them is a World 1 or World 2 level**. There is no second program for any level
  in Worlds 3–8, anywhere in the repo, other than the five fixtures in
  `src/levels/__tests__/naive.ts`, and four of those five are *incorrect* answers registered under
  `randomization defeats hardcoding`, not lazy-but-correct ones.
- §1 alone cannot settle par, and §1 says so itself: *"The first table compares par against **one**
  program per level, so it cannot tell 'par is at the floor because the level is tight' apart from
  'par is at the floor because the level admits one answer'."* That sentence is the reason §2
  exists. It was never run for Worlds 3–8.
- The §181 paragraph's own supporting evidence is three playtest numbers for World 3
  ("176/157, 402/332, 449/365, three silvers") and an observation that `w6-03`/`w6-05` have a fixed
  clock. That is evidence about **two** of the six worlds. Worlds 4, 7 and 8 are covered by the
  word "measured" and nothing else.

So: the reference table for Worlds 3–8 is sound and is reproduced here. **The verdict "leave them"
was not measured** — it was extrapolated from a table that its own author says cannot carry it.
§3 below runs the missing half.

## 1. Method

Reproduces `docs/FIX-PAR.md` §1 and §2 exactly, on the same machinery the level suite uses.

- Driver: a throwaway `vite-node` script that imports `LEVELS` from `src/levels/index.ts`,
  `runReference` from `src/levels/harness.ts`, `SOLUTIONS` from `src/levels/__tests__/solutions.ts`
  and `medalFor` from `src/engine/index.ts` — i.e. the same three modules `levels.test.ts` drives
  `runOnce` with. No engine, level or scoring code was modified. The driver was deleted after the
  run.
- For every level with `world >= 3`, for every declared seed: `runReference(level, seed, solution)`,
  recording `result.ticks` (= `trace.endTick`), `verdict.passed`, unmet required objectives, and
  `medalFor(passed, ticks, par)`.
- **Worst seed is the graded seed.** All seeds are a conjunction (DESIGN.md §5) and
  `src/runtime/aggregate.ts` scores the run off the worst one, which is also what
  `par calibration` in `levels.test.ts` does.
- Headroom = `(par − worst-seed reference ticks) / par`, to one decimal.
- Silver cut = `max(par + 1, floor(par × 1.25))`, per DESIGN.md §7 as amended.
- Lazy routes (§3) are written to the same `ReferenceSolution` shape and driven through the same
  `runReference`, so a lazy row and a reference row are directly comparable.
- Snapshot: measured against this worktree's checkout of `HEAD`. Two agents are editing *bonus*
  objectives in `world-3..5` and `world-7..8` concurrently in other trees; bonus objectives are not
  read by `medalFor` and do not appear in any number below. Required objectives and `par` were
  re-read at the end of the run and were unchanged.

## 2. The table — reference solution vs par, Worlds 3–8

`Fixed` marks a level whose reference costs the *same* ticks on every seed (the A7 evidence).
`Medal` is the medal the reference earns on its worst seed; it is `gold` everywhere, by
construction — `levels.test.ts` asserts it.

| Level | Graded | Par | Ref worst | Ref best | Headroom | Silver cut | Medal (worst seed) | Fixed | Per-seed ticks |
|---|---|---:|---:|---:|---:|---:|---|---|---|
| w3-01 | yes | 157 | 157 | 91 | **0.0%** | 196 | gold | | 157, 138, 91 |
| w3-02 | yes | 332 | 332 | 219 | **0.0%** | 415 | gold | | 219, 332, 245, 300 |
| w3-04 | yes | 365 | 365 | 88 | **0.0%** | 456 | gold | | 357, 179, 365, 88 |
| w4-01 | yes | 52 | 52 | 48 | **0.0%** | 65 | gold | | 48, 52, 50 |
| w4-02 | yes | 391 | 391 | 214 | **0.0%** | 488 | gold | | 214, 359, 391, 304 |
| w4-04 | yes | 970 | 970 | 826 | **0.0%** | 1212 | gold | | 826, 916, 970, 920 |
| w4-05 | yes | 700 | 566 | 348 | 19.1% | 875 | gold | | 478, 544, 566, 428, 348 |
| w5-01 | yes | 37 | 32 | 22 | 13.5% | 46 | gold | | 22, 32, 27 |
| w5-02 | **no** | 2 | 2 | 2 | 0.0% | 3 | — | FIXED | 2, 2, 2, 2, 2 |
| w5-03 | yes | 76 | 76 | 48 | **0.0%** | 95 | gold | | 48, 48, 70, 76 |
| w5-04 | yes | 40 | 38 | 24 | 5.0% | 50 | gold | | 34, 38, 24, 36, 34 |
| w5-05 | yes | 56 | 56 | 40 | **0.0%** | 70 | gold | | 40, 48, 56, 44, 52 |
| w6-01 | **no** | 1 | 0 | 0 | 100.0% | 2 | — | FIXED | 0, 0, 0 |
| w6-02 | yes | 37 | 37 | 18 | **0.0%** | 46 | gold | | 25, 37, 18, 29 |
| w6-03 | **no** | 38 | 38 | 38 | 0.0% | 47 | — | FIXED | 38, 38, 38, 38 |
| w6-04 | yes | 14 | 14 | 9 | **0.0%** | 17 | gold | | 9, 12, 10, 14 |
| w6-05 | **no** | 60 | 60 | 60 | 0.0% | 75 | — | FIXED | 60, 60, 60, 60, 60 |
| w7-01 | yes | 10 | 10 | 7 | **0.0%** | 12 | gold | | 7, 10, 9 |
| w7-02 | yes | 55 | 52 | 32 | 5.5% | 68 | gold | | 32, 35, 45, 52 |
| w7-03 | yes | 200 | 165 | 117 | 17.5% | 250 | gold | | 117, 149, 165, 151 |
| w7-04 | yes | 79 | 79 | 53 | **0.0%** | 98 | gold | | 54, 73, 74, 53, 79 |
| w7-05 | yes | 100 | 100 | 67 | **0.0%** | 125 | gold | | 68, 67, 92, 71, 100 |
| w8-01 | yes | 165 | 160 | 115 | 3.0% | 206 | gold | | 115, 142, 160, 151 |
| w8-02 | yes | 700 | 632 | 319 | 9.7% | 875 | gold | | 319, 518, 632, 465, 450 |
| w8-03 | yes | 128 | 84 | 49 | 34.4% | 160 | gold | | 63, 84, 49, 57, 71 |
| w8-04 | yes | 223 | 223 | 101 | **0.0%** | 278 | gold | | 101, 121, 205, 223, 123 |
| w8-05 | yes | 1050 | 917 | 560 | 12.7% | 1312 | gold | | 560, 806, 917 |

27 levels; 4 are already `graded: false` (A7 is implemented in `src/levels/**` — `w5-02`, `w6-01`,
`w6-03`, `w6-05` all carry the flag). Of the 23 graded ones, **14 sit at exactly 0.0% headroom**,
mean headroom 5.3%, median 0.0%. Every one of the 27 numbers matches `docs/FIX-PAR.md` §1 to the
tick, so §1 is reproducible and is not in question.

**No par in Worlds 3–8 is impossible.** Every reference run passes every seed inside par, on both
the `run` path and the `source` path. See §8.

> **Caveat on two rows.** The `Ref worst` column above is the `ReferenceSolution.run` driver, which
> is what `docs/FIX-PAR.md` §1 measured. On `w8-01` and `w8-05` the level's *other* reference
> implementation — `ReferenceSolution.source`, the player TypeScript that the runtime suite
> actually executes — costs different ticks: `w8-01` worst becomes **162** (headroom 1.8%, not
> 3.0%) and `w8-05` worst becomes **977** (headroom 7.0%, not 12.7%). §5.3.

## 3. Independent corroboration — what par did to two real players

Before the lazy routes, the two playtests are worth pulling out, because they are the only
evidence in the repo about Worlds 3–8 that was not produced by a reference solution. Both stop
early, and where they stop is itself the finding.

`docs/PLAYTEST-BEGINNER.md` §67–73 — first honest attempt, ticks against par:

| Level | Result | Ticks / par |
|---|---|---|
| w3-01 | silver | 176 / 157 |
| w3-02 | silver ★ | 402 / 332 |
| w3-04 | silver ★ | 449 / 365 |
| w4-01 | **gold** ★ | 52 / 52 |
| w4-02 | **bronze** ★ | 832 / 391 |

`docs/PLAYTEST-VETERAN.md` §112–123 — same column, a strong player:

| Level | Result | Ticks / par |
|---|---|---|
| w3-01 | **gold** ★ | 143 / 157 |
| w4-01 | **gold** ★ | 52 / 52, first run |
| w4-02 | **gold** ★ | 236 / 391, first run |
| w4-04 | **silver**, bonus missed | 1124 / 970 |

Three things fall out, and none of them is "leave them":

1. **Par bites hard in World 3 and on `w4-02`/`w4-04` for the player it should bite.** The
   beginner silvered three World 3 levels and bronzed `w4-02` at 2.1× par. That is a working
   ladder, and it is the evidence §181 was actually leaning on.
2. **`w4-02`'s par is loose for a competent player by 39.6%** — 236 against 391, on the *first
   run*, with the level's own mechanic (`mark`) unused: the veteran records *"I placed zero
   marks"*. A par a player clears by 155 ticks while ignoring the hardware the level exists to
   teach is the `w2-01` shape that got par moved in Worlds 1–2.
3. **Worlds 5, 6, 7 and 8 were played by nobody.** The veteran's own header says `w4-05`, all of
   World 5, 6, 7 and `w8-01`–`w8-04` were **seeded, not played**; the beginner stopped at `w4-02`.
   So for 15 of the 27 levels in scope there is not a single human tick count in the repo, and
   §181's "measured" cannot mean anything but §1.

## 4. The other tick gates — where par is not the only clock on the level

Six levels in Worlds 3–8 carry a **second** tick threshold that par knows nothing about: either
`budget.maxTicks` (a hard crash) or a required objective keyed to `trace.endTick` (a hard fail).
Measured by dumping every required objective's `progress` pair alongside the reference run.

| Level | Par | The other clock | Value | Reference worst | Relation |
|---|---:|---|---|---:|---|
| w3-01 | 157 | `budget.maxTicks` | 2500 | 157 | 15.9× par — a safety valve, not a ladder |
| w3-02 | 332 | `budget.maxTicks` | 4000 | 332 | 12.0× par — safety valve |
| w3-04 | 365 | `budget.maxTicks` | 5000 | 365 | 13.7× par — safety valve |
| w4-02 | 391 | `budget.maxTicks` | 1600 | 391 | 4.1× par — safety valve |
| w4-04 | 970 | `budget.maxTicks` | 1350 | 970 | **1.39× par** — the bronze band is only 1213–1350 |
| w4-05 | 700 | `budget.maxTicks` | 2600 | 566 | 3.7× par — safety valve |
| w7-04 | 79 | `budget.maxTicks` | 4000 | 79 | 50× par — safety valve |
| w7-05 | 100 | `budget.maxTicks` | 6000 | 100 | 60× par — safety valve |
| w8-01 | 165 | required `shift-budget` | **215** | 160 | deliberate and documented; see below |
| w8-03 | 128 | required `within-shift` | **98 / 359 / 160 / 150 / 207 per seed** | 84 | **incoherent; see §7** |
| w8-04 | 223 | `budget.maxTicks` | 3000 | 223 | 13.5× par — safety valve |
| w8-05 | 1050 | required `deadline` + `budget.maxTicks` | 3000 / 16000 | 917 | 2.9× par |

Two of these matter.

**`w8-01` is the campaign's best-built tick ladder and should be the model.** Its own source says
why: `PAR_TICKS = 165`, `SHIFT_TICKS = 215`, and the comment reads *"`SHIFT_TICKS` is the hard one
and `PAR_TICKS` is where gold sits, so the medal band underneath it — silver to 206, bronze to 215
— survives having a failing condition on the same axis. The shift is set just under the honest
World 2 answer: sweeping every row of the field and harvesting what is underfoot costs 220 ticks
on the kindest seed."* That is par set *by measuring the lazy route* — §2 of `FIX-PAR.md` done in
advance, by the level's author, for one level.

**`w8-03`'s par does not agree with `w8-03`'s own required objective.** `within-shift` is computed
per seed from the grid (`deadlineFor`): 98, 359, 160, 150, 207 across seeds 3, 2, 1, 4, 5. Par is a
**flat 128**. So on seed 3 the level *fails* a run at 99 ticks that the medal ladder would call
gold at 128; and on seed 2 the ladder calls a run bronze at 400 that the level itself would have
signed off up to 359. The level scales its budget to the work and its par does not. §7.

Also worth recording, because it is the same shape as `w2-04`: **`w5-05`'s real discriminator is
cable, not ticks.** Its required `budget` objective runs at 66/72, 50/54, 79/86, 53/58, 60/65 —
92–93% of the allowance on every seed — while ticks sit at 40–56 against a par of 56. The clock is
the loose axis on that level and the spend is the tight one.

## 5. Reconciliation with `reference-solutions.test.ts` — and two corrections to `FIX-INVARIANTS.md`

`main` was merged into this worktree mid-measurement, bringing `src/runtime/__tests__/reference-solutions.test.ts`.
`docs/FIX-INVARIANTS.md` §505 describes it, under the heading **Difficulty — unchanged, and checked
rather than asserted**, as:

> `reference-solutions.test.ts` runs all forty levels through the real runtime **against their
> pars**: 86 tests, unchanged.

**Both halves of that sentence are wrong, and the second one matters.**

### 5.1 The campaign is 34 levels, not 40

`LEVELS` has 34 entries. `EXPECTED_INDICES` in `levels.test.ts` enumerates them —
3 + 4 + 3 + 4 + 5 + 5 + 5 + 5 — and a `nothing still points at a withdrawn work order` test names
the six that are gone: `w1-02`, `w1-04`, `w2-03`, `w3-03`, `w3-05`, `w4-03`, withdrawn in
`docs/FIX-COMPRESSION.md`. There are 34 files matching `src/levels/world-*/w*.ts`, 34 keys in
`src/levels/__tests__/solutions.ts`, and **34 keys in `reference-solutions.test.ts`'s own
`SOLUTIONS` map**. Forty is the pre-compression campaign size (8 × 5) and it is stale in two places
in `FIX-INVARIANTS.md` (§214 and §505). **There are no six extra levels with a par. The table in §2
is complete.**

### 5.2 The harness does not check par on most levels

Read the file. Par appears in it exactly once:

```ts
// describe('through Runner, the worker protocol and the bindings')
for (const id of MULTI_BOT) {
  test(`${id} comes back passed`, ... async () => {
    ...
    expect(response.verdict.stats.ticks, id).toBeLessThanOrEqual(level.par.ticks);
```

and `MULTI_BOT` is `LEVELS.filter((level) => level.world === 7 || level.build(seeds[0]).bots.length > 1)`.
The per-level test that *does* cover all 34 — `` `${level.id} passes every seed through the runtime` `` —
asserts `failure`, `unmet` and `passed`. **It never reads `ticks` and never reads `par`.**

`MULTI_BOT` was evaluated rather than estimated. It is exactly seven ids:
**`w7-01`, `w7-02`, `w7-03`, `w7-04`, `w7-05`, `w8-03`, `w8-05`.**

So the harness checks par on **7 of 34 levels** and checks *solvability* on the other 27. It is a
real and valuable harness — it runs `ReferenceSolution.source`, the player
TypeScript, through `runSeed`, which is a genuinely different program from the
`ReferenceSolution.run` driver that `levels.test.ts` and this measurement use — but the claim that
it guards difficulty campaign-wide does not survive reading it.

**This is the disagreement, stated plainly rather than resolved in favour of either side:** my
numbers and that harness do not conflict, because on 27 of 34 levels *that harness produces no
number to conflict with*. Where it does produce one (World 7), §5.3 reports the comparison.

### 5.3 `run` vs `source` — two programs per level, one par, and they disagree on two levels

Every level's `ReferenceSolution` carries **two** implementations: `run(sim, botId)`, which drives
`Sim` directly and is what `levels.test.ts`, `docs/FIX-PAR.md` §1 and §2 of this file measure; and
`source`, the same answer written as **player TypeScript**, which is what
`reference-solutions.test.ts` transpiles and feeds to `runSeed`. Nothing in the repo asserts that
the two cost the same, and **on two levels they do not**.

Driven side by side on the same seed, all 34 levels:

| Level | Seed | `run` ticks | `source` ticks | Par |
|---|---:|---:|---:|---:|
| w8-01 | 1 | 115 | **117** | 165 |
| w8-01 | 2 | 142 | **148** | 165 |
| w8-01 | 3 | 160 | **162** | 165 |
| w8-01 | 4 | 151 | **155** | 165 |
| w8-05 | 1 | 560 | **648** | 1050 |
| w8-05 | 4 | 806 | **739** | 1050 |
| w8-05 | 7 | 917 | **977** | 1050 |

Every other level and seed in the campaign — 32 levels, 120 (level, seed) pairs — is **identical**
tick for tick, and the medal is the same on all 34. So this is not systematic drift; it is two
levels whose two reference implementations are genuinely different algorithms. `w8-05` is the
clearest: `source` is *cheaper* on seed 4 (739 against 806) and *dearer* on seeds 1 and 7 (648
against 560, 977 against 917). A rounding difference cannot do that.

**Consequence for this audit, and it is not cosmetic.** The headroom figure in §2 depends on which
program you call "the reference":

| Level | Par | Headroom on `run` | Headroom on `source` |
|---|---:|---:|---:|
| w8-01 | 165 | 3.0% | **1.8%** |
| w8-05 | 1050 | 12.7% | **7.0%** |

Both are gold on both paths, so nothing is broken today, and no par change is proposed on either
level. What follows is the trap.

> **`w8-05` is in `MULTI_BOT`, so `reference-solutions.test.ts` asserts `stats.ticks <= par` for it
> against 977 — while `docs/FIX-PAR.md` §1 records 917. Anyone moving that par off the recorded
> number has 60 fewer ticks of room than the table tells them.**

That is the most dangerous line in the par documentation as it stands, because the two numbers are
both correct and neither says which program it measured.

**Never quote a headroom figure without naming the path.** Wherever the two disagree, both:
`w8-01` **3.0% (`run`) / 1.8% (`source`)**; `w8-05` **12.7% (`run`) / 7.0% (`source`)**. A headroom
figure that does not say which implementation produced it is exactly what let this sit unnoticed.

Root cause, for the record: `run` and `source` are **two hand-maintained implementations of one
fact**, in two layers, with no assertion between them. Each is checked against the level; neither
is ever checked against the other, so both pass and the drift is invisible. Reconciling them, and
adding the guard that keeps them reconciled, is content/test work in files held by other agents and
is deliberately **not** done here.

### 5.4 Where the cross-check produced no second number

Per the standing point that "the cross-check could not run" and "the cross-check agreed" are
different results: the `run`-vs-`source` comparison above was performed by this measurement on all
34 levels and agreed on 32. That is separate from what the *shipped test suite* guards. The suite's
par assertion iterates `MULTI_BOT`, measured to be exactly:

`w7-01, w7-02, w7-03, w7-04, w7-05, w8-03, w8-05` — **7 levels of 34**.

On the other 27, `reference-solutions.test.ts` produces no tick number at all, so there is nothing
for it to agree or disagree with. It is not that it agrees. It does not look.

### 5.5 Files moved under this measurement

Confirmed and logged, per the brief:

- `src/levels/world-7/w7-01.ts` and `src/levels/world-7/shared.ts` were edited by the bonus agent
  **while this measurement was running**, and for a period `w7-01.ts` did not even evaluate
  (`ReferenceError: slack is not defined` at `w7-01.ts:232`, thrown at import of
  `src/levels/world-7/index.ts`, which takes the entire level registry down with it). `par: { ticks: 10 }`
  was unchanged throughout — the edit removed the old `slack` divergence helper before its
  replacement landed, and added a new `name-the-idle` bonus.
- **World 7 was fully re-measured after the file became importable again**, on both paths.
  `w7-01` still costs **7, 10, 9** against par 10 on `run` *and* on `source`, and every other World
  7 row in §2 is unchanged. The bonus edit did not move par or any required objective's cost.

### 5.6 …and again, during the World 7–8 half

The same thing happened twice more while §6.3 was being measured, and the same rule was applied:
**a measurement that could not run is not a result — it is re-run.**

- `w7-02.ts` and `w7-04.ts` (and their `__solutions__` counterparts) landed after the World 7
  reference numbers were first taken. Both were re-driven afterwards on both paths. `w7-02` still
  costs **32, 35, 45, 52** against par 55; `w7-04` still costs **54, 73, 74, 53, 79** against par
  79. No par, required objective or tick cost moved.
- `w8-01.ts` and `w8-03.ts` landed **mid-run**, between the first pass of the lazy routes and the
  write-up. Every World 8 row — reference *and* lazy — was re-driven against the new files and
  reproduced to the tick: `w8-01` 115/142/160/151 on `run` and 117/148/162/155 on `source`;
  `w8-03` 63/84/49/57/71 on both. The two new bonuses (`within-10-look`, `within-26-probe`) cost no
  ticks and are reported in §10.1.
- `w8-05.ts` landed last, replacing `under-budget` and `no-blocked-moves` with one
  `name-the-hold`. Re-driven afterwards: reference **560, 806, 917** on `run` and **648, 739, 977**
  on `source`, lazy **712, 1001, 1465**, par still 1050. Not one tick moved, and the two bonuses
  that could be satisfied by a program that does nothing are gone. All bonus columns in this
  document are post-rewrite.
- Every level file under `src/levels/world-7/**` and `src/levels/world-8/**` was re-read at the end
  of the run. No par value in Worlds 3–8 differs from the one recorded in §2.
- **Nothing under `src/` was modified by this measurement.** The two throwaway drivers
  (`.par-driver.tmp.ts`, `.par-lazy-78.tmp.ts`) were deleted on completion.

## 6. The missing half — what a lazy but correct route actually costs

`docs/FIX-PAR.md` §2, run for Worlds 3–8 for the first time. Each row is a **second correct
program** for the level: the answer a player writes without the level's central idea, driven
through the same `runReference` on every declared seed. A route only counts if it passes every
required objective on every seed — an answer that fails a seed is a hardcoding fixture, not a lazy
route, and is reported as such.

### 6.1 Worlds 3 and 4

| Level | The lazy route | Per-seed ticks | Worst | Par | Correct on every seed? | Medal (worst seed) | Reference worst | Par discriminates? |
|---|---|---|---:|---:|---|---|---:|---|
| w3-01 | search the shed from scratch for a crate, then again for a bare pad, once per trip | 340, 291, 196 | 340 | 157 | yes | **bronze** | 157 | **YES** |
| w3-01 (mild) | one survey, but walked row by row instead of read three rows from one | 176, 157, 112 | 176 | 157 | yes | silver | 157 | **YES** |
| w3-02 | carry-and-search: sweep, lift a crate, keep sweeping until its stencil turns up — no class→depot table | 1628, 1928, 1589, 1967 | 1967 | 332 | yes | **bronze** | 332 | **YES** |
| w3-02 (mild) | build the table, but from a survey that walks every row | 281, 402, 337, 370 | 402 | 332 | yes | silver | 332 | **YES** |
| w3-04 | read the yard into a numbered list by walking every row, racks included | 421, 255, 449, 152 | 449 | 365 | yes | **silver** | 365 | **YES** |
| w3-04 (dumber) | no list: sweep the yard afresh looking for arrival 1, then 2, then 3 … | 1487, 896, 1406, 257 | 1487 | 365 | yes | bronze | 365 | **YES** |
| w4-01 | *none exists — the route is forced* | 48, 52, 50 for **every** correct program | 52 | 52 | yes | gold, unavoidably | 52 | **NO — forced** |
| w4-02 | the reference DFS with the visited set held in **program memory** instead of on the tiles | 112, 204, 236, 178 | **236** | 391 | yes | **GOLD, 155 ticks under the reference** | 391 | **NO — worse than free** |
| w4-02 (alt) | right hand on the wall | 152, halt, halt, 142 | — | 391 | **no** — seeds 2 and 3 blow the 1600-tick allowance | — | — |
| w4-04 | DFS-walk the entire cave, then walk to the lift — no survey/plan/run split, no ordering | 876, 920, 1032, 964 | 1032 | 970 | yes | **silver** (gold on 3 of 4 seeds) | 970 | **YES, by 6%** |
| w4-05 | walk every corridor to its end instead of looking down it; drive home and `refuel()` when the tank runs low | 434, 1158, 650, 700, 382 | 1158 | 700 | yes | **bronze** | 566 | **YES** |

**Verdict, World 3. Par works on all three levels, and it is the strongest world in the campaign
for this.** Every level separates the answer with the idea from the answer without it by a medal,
and the mild lazy variants — the ones a competent player actually writes — land on silver rather
than falling off a cliff, which is the shape a ladder is supposed to have. The beginner playtest
agrees to the tick: **176/157 measured here, 176/157 recorded in `PLAYTEST-BEGINNER.md`**, and
402/332 and 449/365 likewise. The lazy route this measurement constructed for `w3-01`, `w3-02` and
`w3-04` reproduces a real human's first attempt exactly. **Nothing in World 3 should move.**

**Verdict, World 4. One level forced, one level actively backwards, two working.**

- **`w4-01` — the route is forced.** One tunnel, no branches, start at one end and the pad at the
  other. Two independent programs that use *none* of the level's "hold the direction you came from"
  idea — a visited-tile set, and right-hand wall-following with no memory at all — produce
  **tick-for-tick identical runs**: 48, 52, 50. Par cannot rank a set with one member. Clean A7
  candidate; §9.
- **`w4-02` — LOUD: par is worse than free, it is *anti*-taught.** `mark()` costs 1 tick
  (`DEFAULT_COSTS.mark`) and the reference pays one per newly-entered tile. Move counts are
  **identical** between the two routes on every seed — 112/204/236/178 — so the whole 391-vs-236
  gap is breadcrumb ticks: the reference is 112 moves + 102 marks = 214, 204 + 155 = 359,
  236 + 155 = 391, 178 + 126 = 304. **A player who ignores the issued hardware entirely and keeps a
  JavaScript `Set` of coordinates walks the same route, golds with 155 ticks of headroom, and beats
  the reference on every seed.** This is not a hypothesis: `PLAYTEST-VETERAN.md` §122 records
  exactly this run — *"gold 236/391 + star, 1st run… **I placed zero marks**"* — and my constructed
  lazy route reproduces his 236 to the tick. §8.
- **`w4-04` — par works, on a 6% margin.** Blind DFS over the whole cave is only +50/+4/+62/+44
  ticks against the reference and exceeds par on **exactly one of four seeds** (1032 against 970),
  golding on the other three. It is discriminating, but only just, and only because the worst seed
  sets the score. The veteran's 1124 silvered, so the ladder did fire on a real player.
- **`w4-05` — par works.** Walking every corridor instead of casting free rays down it costs 1158
  on the worst seed against par 700 (silver line 875): bronze. Note that the lazy route survives at
  all only because it goes home and `refuel()`s; without that it strands itself on seed 2.

### 6.2 Worlds 5 and 6

The four already-ungraded levels (`w5-02`, `w6-01`, `w6-03`, `w6-05`) are out of scope; par does
not display on them.

| Level | The lazy route | Per-seed ticks | Worst | Par | Correct on every seed? | Medal (worst seed) | Reference worst | Par discriminates? |
|---|---|---|---:|---:|---|---|---:|---|
| w5-01 | never `probe` — walk the one open direction and `use()` whatever the free tile scan reports underfoot | 31, 37, 33 | 37 | 37 | yes | **gold** | 32 | **NO — free** |
| w5-01 (dumber) | no sensing at all; mash `use()` on all 20 corridor tiles | 59, 59, 59 | 59 | 37 | yes | bronze | 32 | — |
| w5-03 | cable every listed prerequisite, then `power` `sub-1 … sub-n` in plain id order | 48, 48, 70, 76 | 76 | 76 | yes | **gold** | 76 | **NO — free, tick-identical** |
| w5-03 (dumber) | hammer the whole id list `n` times | 228, 312, 434, 556 | 556 | 76 | yes | bronze | 76 | — |
| w5-04 | *none exists — the route is forced* | 34, 38, 24, 36, 34 for **every** correct program | 38 | 40 | — | gold, unavoidably | 38 | **NO — forced** |
| w5-05 | lay the Prim tree (correctness forces it), then ignore switch-on order and hammer `power` over the id list | 220, 312, 420, 264, 364 | 420 | 56 | yes | **bronze** | 56 | **YES** |
| w6-02 | verify only the additive sum `S`, never the weighted `W` | 25, 37, 18, 29 | 37 | 37 | yes | **gold** | 37 | **NO — free, tick-identical** |
| w6-04 | crack the header per packet, relay the headed ones, skip the straggler | 8, 11, 9, 13 | 13 | 14 | yes | **gold** | 14 | **NO — free, and *cheaper* than the reference** |

**Verdict, World 5.** Par discriminates on exactly one of the four graded levels.

- **`w5-01` — par is priced at the lazy route, to the tick.** The scan-and-walk answer that never
  touches `probe` — the one verb the level exists to unlock — costs 31/37/33 and lands on **37,
  which is par exactly**. The reference, which uses `probe`, costs 22/32/27. This is the `w2-01`
  shape precisely: par sits on the cost of ignoring the instrument. The level's own par comment
  says so without meaning to — it justifies 37 as *"37 ticks on the longest seed"* of the
  **full-corridor walk**, not of the reference, which never exceeds 32. Verbatim, at
  `src/levels/world-5/w5-01.ts:155`:

  > *"Par: the reference walks the line once and uses every substation, so its cost is fixed by the
  > layout — 37 ticks on the longest seed (18 moves plus nine 2-tick uses). **There is no shorter
  > route**, so par is that number rather than that number minus a shave."*

  Measured, the shipped reference costs **22, 32, 27**. There is a shorter route, it is the one the
  level ships, and par was set from a program that is not it.
- **`w5-03` — par is free, and the level's own generator is why.** `dependencies()` only ever draws
  a station's prerequisites from `reactor` plus *earlier* ids, so **plain id order is a valid
  topological order on every seed**. Powering `sub-1 … sub-n` blind costs `2 × (edges + stations)`,
  which is the reference's number on all four seeds. The only thing separating the two answers is
  the `tight-order` star.
- **`w5-04` — the route is forced.** `link` costs 2 ticks, cable is permanent, and every consumer
  ends on exactly one feeder, so **every correct program costs `2 × consumers`**; planning is free
  and there is nothing else to spend a tick on. The two genuinely lazy shapes are *incorrect*, not
  slow: first-fit in listed order fails seed 3's constructed anti-first-fit layout (`assigned`),
  and everything-on-the-biggest-feeder fails `within-capacity` on all five. First-fit-*decreasing*
  passes and costs the reference's exact numbers. This is a clean A7 candidate — see §9.
- **`w5-05` — par works, on the second idea.** The first idea (the MST) is enforced by
  *correctness*: the reactor-star topology costs the identical 40/48/56/44/52 and fails the `budget`
  objective on every seed. The second idea (the tree is also the switch-on order) is where par
  earns its keep — a single id-order or distance-order pass fails `energised` on all five, so the
  cheapest *correct* lazy answer is the repeated hammer at 220–420 against par 56: **deep bronze.**

**Verdict, World 6.** Par discriminates on neither graded level, and on `w6-04` it runs backwards.

- **`w6-02` — ticks cannot see this level.** Every correct program relays exactly the clean packets
  at one tick each, so the tick count is a property of the *seed*, not the program. Dropping half
  the machinery — checking only `S`, which still catches every corruption because the altered byte
  moves by an odd delta — costs 25/37/18/29, the reference's numbers to the tick. The weighted sum
  earns its keep on the `name-the-fault` star and nowhere else. The genuinely lazy relay-everything
  answer fails `relay-clean` on 3 of 4 seeds, i.e. it is *wrong*, not slow.
- **`w6-04` — par rewards laziness outright.** The required objective needs one `transmit` per
  headed packet, so the floor is 8/11/9/13 and every correct program sits on it. **Par 14 is the
  reference's cost *including* the bonus straggler transmit**, so the lazy answer that skips the
  star is **one tick cheaper than the reference** and golds with room. The key search — the thing
  the level is named for — is free in ticks. Par ranks nothing here at all.

### 6.3 Worlds 7 and 8

Measured on the same driver, the same `runReference`, the same worst-seed rule. Two extra columns
this time, because a lazy route that also takes the star is a different defect from one that only
takes the medal: `Star` is the bonus objective's verdict on the **lazy** run, evaluated with
`evaluateObjectives` on the same trace.

**State measured.** World 7's bonus rewrite (`w7-01 name-the-idle`, `w7-02 even-share`,
`w7-04 name-the-decider`, plus `world-7/shared.ts`) had **landed** — every number below is post-edit,
and the reference table in §2 was re-driven afterwards and did not move by a tick on either path.
World 8's rewrite landed **mid-run** on `w8-01` (`name-the-row` + a new `within-10-look`) and
`w8-03` (`within-26-probe`); every World 8 row below was re-measured after those two files settled
and reproduced exactly. `w8-05`'s rewrite (`under-budget` and `no-blocked-moves` replaced by a
single `name-the-hold`) landed last of all and its rows were re-driven again afterwards: reference
560/806/917 on `run` and 648/739/977 on `source`, lazy 712/1001/1465, all unchanged. Every bonus
column below is the **post-rewrite** set.

| Level | The lazy route | Per-seed ticks | Worst | Par | Correct on every seed? | Medal (worst seed) | Star? | Reference worst | Par discriminates? |
|---|---|---|---:|---:|---|---|---|---:|---|
| w7-01 | serial shift: walk RIG-07's corridor out, `sync()`, then start RIG-08 | 13, 13, 13 | 13 | 10 | yes | **bronze** | no | 10 | **YES** |
| w7-01 (lockstep) | step both bots together and `sync()` after every tick | 7, 10, 9 | 10 | 10 | yes | gold | no | 10 | no — but it is not slower either; see below |
| w7-02 | never `spawn`. FIELD-01 walks the whole crop list on its own | 119, 39, 158, 311 | 311 | 55 | yes | **bronze** | seed 2 only | 52 | **YES** |
| w7-03 | one hauler in the tunnel at a time, a `sync()` between them | 235, 527, 560, 589 | 589 | 200 | yes | **bronze** | **STAR on all 4** | 165 | **YES** |
| w7-04 | deal the board out round-robin before anybody moves; never re-decide | 65, 104, 101, 88, 86 | 104 | 79 | yes | **bronze** | no | 79 | **YES** |
| w7-05 | survey the whole field first, dispatch only when everything is sighted | 116, 87, 140, 107, 220 | 220 | 100 | yes | **bronze** | no | 100 | **YES** |
| w8-01 (a) | the honest World 2 answer: sweep every row, harvest what is underfoot | 220, 252, 242, 247 | — | 165 | **no** — `shift-budget` (215) fails on all four | — | — | 160 | — |
| w8-01 (b) | beam-survey, then one crop per trip | 290, 313, 323, 439 | — | 165 | **no** — `shift-budget` fails on all four | — | — | 160 | — |
| w8-01 (c) | beam-survey, then the ripe list in reading order, batched to capacity | 141, 170, 178, 161 | 178 | 165 | yes | **silver** | `within-10-look` | 160 (`run`) / 162 (`source`) | **YES** |
| w8-02 | survey the whole depot, then run the deliveries — two passes over one floor | 561, 633, 751, 607, 577 | 751 | 700 | yes | **silver** (gold on 4 of 5 seeds) | no | 632 | **YES, by 51 ticks on one seed** |
| w8-03 (a) | topological waves, dealt round-robin, one `sync()` per layer | 102, 250, 76, 153, 179 | — | 128 | **no** — 153 breaks seed 4's own 150-tick `within-shift` | — | — | 84 | — |
| w8-03 (b) | same layer barrier, but each station goes to the nearest idle bot | 80, 175, 81, 81, 103 | 175 | 128 | yes | **bronze** | **STAR on all 5** | 84 | **YES** |
| w8-04 (a) | ignore the plan: frontier-search the workings until the locker is in view, lift the form | 59, 43, 5, 17, 65 | **65** | 223 | yes | **GOLD + STAR, 158 ticks under the reference** | **STAR on all 5** | 223 | **NO — free** |
| w8-04 (b) | the same, plus the walk back to the lift the brief asks for | 117, 85, 9, 33, 91 | **117** | 223 | yes | **GOLD + STAR** | **STAR on all 5** | 223 | **NO — free by 106 ticks** |
| w8-05 | one bot does the whole shift, on one clock, one crate at a time | 712, 1001, 1465 | 1465 | 1050 | yes | **bronze** | no — misses both | 917 (`run`) / 977 (`source`) | **YES** |

**Verdict, World 7. Par works on all five levels — it is the second-strongest world in the campaign
after World 3, and the three levels sitting at 0.0% headroom are sitting there correctly.**

- **`w7-01` — par works, on one shape.** The clock does vary by program, so this is not an A7
  forced route: serialising the fleet (`sync()` between the two corridors) costs a flat **13** on
  every seed and lands on bronze, which is exactly the mistake the brief warns about — *"the total
  is a much larger number that nobody upstairs has ever asked for"*. But it is the **only** shape
  par catches. The naive lockstep answer — step both bots and `sync()` after every tick, which
  understands nothing about separate clocks — costs **7, 10, 9**, the reference's numbers to the
  tick, because `sync()` raises to the *highest* clock and two bots stepping together are already
  level. So par 10 separates "one bot at a time" from everything else, and nothing finer. That is a
  narrow but real ladder and 0.0% headroom is the right number for it.
- **`w7-02` — par works, by a factor of 5.7.** Never calling `spawn` — the one verb the level
  exists to issue — costs 311 against par 55 on the worst seed. Note the shape: the solo route
  *golds* on seed 2 (39 ticks, the one-bot requisition) and bronzes on the other three, so the
  worst-seed rule is doing the whole job. On a per-seed ladder this level would be broken.
- **`w7-03` — par works, by a factor of 2.9, and the star runs the other way.** One hauler in the
  tunnel at a time bronzes at 589 against par 200 — and takes `no-bumps` on **all four seeds**,
  because a fleet that never shares the tunnel never bumps. The medal punishes the answer the star
  rewards. Not a par defect, but it belongs in §10's family and is recorded there.
- **`w7-04` — par works, on a 32% margin.** Dealing the unsorted board out in advance costs
  65/104/101/88/86 against par 79: bronze on the worst seed, gold on the lightest. The reference's
  longest-job-first list scheduling wins by 25 ticks on the seed that grades. This is a clean,
  well-calibrated ladder and the 0.0% headroom is again correct — par *is* the reference's worst
  seed, which is what a conjunction over seeds requires.
- **`w7-05` — par works, by a factor of 2.2.** Refusing to overlap the survey with the work — the
  level's whole idea — costs 220 against par 100. Note the reference **misses its own bonus**
  (`workers-busy`, on all five seeds); that is a bonus defect for the content agents, not a par
  one, and it is not folded into any number here.

**Verdict, World 8. Four of five work; `w8-04` is the campaign's worst free par and is worse than
`w4-02`.**

- **`w8-01` — the model, confirmed by measurement rather than by its own comment.** The level's
  source claims the honest World 2 answer *"costs 220 ticks on the kindest seed"* against a
  `shift-budget` of 215. Driven: **220, 252, 242, 247, failing `shift-budget` on all four seeds.**
  The comment is right to the tick on the seed it names. The cheapest *correct* lazy route — survey
  with beams, then take the ripe list in reading order in capacity batches — costs 178 and lands on
  **silver**, 18 ticks over par. Gold requires ordering the trips; silver is what you get for not.
  That is a ladder built the way §2 of `FIX-PAR.md` says to build one, by its own author, before
  anyone asked. **Quote its headroom both ways: 3.0% (`run`) / 1.8% (`source`).**
- **`w8-02` — par works, but the whole margin is one seed and 51 ticks.** Survey-then-ship costs
  561/633/751/607/577; it **golds on four seeds of five** and only silvers on seed 3, where 751
  clears par 700. Worst-seed grading is the only thing separating the two answers. Structurally
  this cannot be tightened: the reference's worst seed (632) is *dearer* than the lazy route's best
  seed (561), so no flat par ranks them per-seed. Same fragility as `w4-04`; recorded, not moved.
- **`w8-03` — par works on ticks and disagrees with the level's own deadline.** The layer-barrier
  answer that dispatches to the nearest idle bot bronzes at 175 against par 128, so the ladder
  fires. The round-robin variant is not a lazy route at all — at 153 ticks on seed 4 it **breaks
  the level's own 150-tick `within-shift`**, i.e. it is wrong, not slow. But the flat par is
  incoherent with the per-seed deadline, and the arithmetic is in §7.
- **`w8-04` — LOUD: par is free by 106 ticks, and the star is free with it.** Reported in full in
  §8b.
- **`w8-05` — par works, by a factor of 1.4.** One bot doing the whole shift on one clock costs
  712/1001/1465 against par 1050: bronze on the worst seed, gold on the two lighter ones. The
  fleet, the roles and the interleaving are all worth 415 ticks on the seed that grades. **Quote
  its headroom both ways: 12.7% (`run`) / 7.0% (`source`)**, and see §5.3 before moving it.

### 6.4 The engine fact underneath three of these findings

`DEFAULT_COSTS` prices `move`, `moveBlocked`, `turn` (0), `harvest`, `mine`, `plant`, `pickup`,
`drop`, `use`, `wait`, `send`, `spawn`, `mark`, `link`, `power`, `transmit` and `refuel`.

**It does not price `look`, `scan`, `probe`, `recv` or `print`. Sensing and reporting are free.**

That is a design choice, not a bug, but it has a consequence nobody has written down: **par can
never rank a program for sensing less or planning better, only for moving and acting less.** Three
separate findings in this document are the same fact wearing different hats — `w5-01`'s par priced
at the corridor walk, `w8-03`'s `within-26-probe` bonus capping a resource that costs nothing, and
`w8-04`'s frontier search buying the whole map for zero ticks. Any level whose central idea is
"survey cleverly" has to defend that idea with a required objective or a bonus, because the clock
will not do it.

## 7. Proposals — with the measurement each one rests on

**Nothing here is applied.** Par is difficulty (DESIGN.md §7) and difficulty must not drop, so every
row below is a proposal with its evidence and, where the evidence says "do not move it", it says so.

| Level | Par today | Proposal | Evidence |
|---|---:|---|---|
| w3-01, w3-02, w3-04 | 157 / 332 / 365 | **leave** | §6.1: every lazy route separates by a medal; the constructed routes reproduce `PLAYTEST-BEGINNER.md`'s 176/402/449 to the tick |
| w4-01, w5-04 | 52 / 40 | **leave, and consider `graded: false`** | §9: every correct program costs the same; par ranks a set with one member |
| w4-02 | 391 | **leave par; repair content** | §8 — the lazy route golds 155 ticks under the reference and takes the star |
| w4-04 | 970 | **leave** | §6.1: blind DFS exceeds par on 1 seed of 4; margin is 6% and fragile, but real |
| w4-05, w5-05 | 700 / 56 | **leave** | §6.1/§6.2: lazy routes bronze at 1158 and 420 |
| w5-01 | 37 | **lower to 32** | §6.2: the scan-and-walk route that never calls `probe` costs exactly **37** — par sits on the lazy answer. The reference costs 22/32/27, so par 32 keeps the reference on gold on every seed and puts the probe-free answer on silver. The level's own par comment justifies 37 from a program that is not the reference. **Difficulty rises.** |
| w5-03 | 76 | **leave par; repair content** | §6.2: id order is a valid topological order on every seed, so the lazy answer is *tick-identical* to the reference. No par can separate two programs with the same cost. |
| w6-02 | 37 | **leave par; consider `graded: false`** | §9: every correct program costs one tick per clean packet |
| w6-04 | 14 | **leave par; repair content** | §10: par includes the bonus transmit, so skipping the star is one tick cheaper |
| w7-01 | 10 | **leave** | §6.3: the serial answer bronzes at 13; par 10 is the reference's worst seed and the ladder fires on the one shape that is genuinely slower |
| w7-02 | 55 | **leave** | §6.3: the never-`spawn` answer bronzes at 311 |
| w7-03 | 200 | **leave** | §6.3: the one-at-a-time answer bronzes at 589. 17.5% headroom looks loose next to the campaign median of 0.0%, but tightening it buys nothing — the lazy route is already 2.9× par — and would be a difficulty change with no measurement asking for it |
| w7-04 | 79 | **leave** | §6.3: round-robin dealing bronzes at 104 |
| w7-05 | 100 | **leave** | §6.3: survey-then-dispatch bronzes at 220 |
| w8-01 | 165 | **leave** | §6.3: the honest sweep fails `shift-budget` outright; the cheapest correct lazy route silvers at 178. Best-calibrated level in the campaign |
| w8-02 | 700 | **leave, flagged fragile** | §6.3: the lazy route golds on 4 seeds of 5 and clears par only on seed 3, by 51 ticks. No flat par can do better — the reference's worst seed (632) is dearer than the lazy route's best (561) |
| w8-03 | 128 | **par must stop being a scalar, or `deadlineFor` must stop varying** | §7.1 — the arithmetic below |
| w8-04 | 223 | **no par change is possible; the level must change** | §7.2 — the arithmetic below |
| w8-05 | 1050 | **leave; and if anyone ever tightens it, the floor is 977, not 917** | §5.3: `reference-solutions.test.ts` asserts `ticks <= par` for `w8-05` against the `source` path, which costs 977 on seed 7 |

### 7.1 `w8-03` — no flat par can give this level a complete medal ladder

`within-shift` is a **required** objective computed per seed from the grid. Driven, it is:

| seed | `within-shift` deadline | Par | Silver cut (1.25 × par) | Reference | What the ladder can actually award |
|---|---:|---:|---:|---:|---|
| 1 | 160 | 128 | 160 | 63 | gold, silver; bronze band is 161–160, i.e. empty |
| 2 | 359 | 128 | 160 | 84 | gold, silver, bronze 161–359 |
| 3 | **98** | 128 | 160 | 49 | **gold only** — par is 30 ticks past the point the level fails |
| 4 | 150 | 128 | 160 | 57 | gold, silver 129–150; bronze empty |
| 5 | 207 | 128 | 160 | 71 | gold, silver, bronze 161–207 |

Two things are wrong and they are not the same thing:

1. **On seed 3 the level fails a run at 99 ticks that the medal ladder calls gold up to 128.** The
   grade and the verdict are computed on the same axis from two different numbers.
2. **The bronze band is empty on 2 of 5 seeds and the silver band is truncated on a third.**

And the fix is not a different scalar. For the silver cut to sit inside seed 3's deadline you need
`floor(par × 1.25) ≤ 98`, i.e. **par ≤ 78** — but the reference costs **84** on seed 2, so par 78
puts the shipped answer on silver and `levels.test.ts` (which asserts the reference golds every
seed) goes red. **There is no value of `par.ticks` that is both above the reference and below seed
3's deadline.** The proposal is therefore structural, and either half of it works:

- **(a)** give `par` the same per-seed shape `deadlineFor` already has — par becomes a function of
  the seed, as the deadline is; or
- **(b)** flatten `deadlineFor` to a constant at or above 160, so the ladder's own bands fit inside
  it on every seed.

(b) is the smaller change and **lowers** difficulty on seeds 3 and 4, so (a) is the one that
preserves it. Either way this is a level-content ruling, not a number to nudge.

### 7.2 `w8-04` — the reference is the thing that is expensive, not the level

Par 223 is the reference's worst seed. The reference is expensive because it **drives the filed
plan literally**, and the filed plan is eleven months old and wanders. A program that ignores the
plan entirely walks to the locker in **5–65 ticks**, or **9–117** if it also pays the walk home
that the brief asks for and the objective does not.

There is no par that separates them, for the same reason as `w8-02` but far worse: the lazy route's
*worst* seed (117) is cheaper than the reference's *best* (101 — and 223 on the seed that grades).
Any par above 223 keeps the reference gold and leaves the lazy route 106 ticks of free room; any par
below 223 puts the shipped answer off gold and turns `levels.test.ts` red.

**The proposal is to re-baseline the reference, not the par.** The reference should use the plan for
what a plan is worth — it discloses where the locker is without walking there — and then take the
shortest route it knows, rather than re-walking a stale itinerary tile by tile. Measure *that*, and
set par from it. On the numbers above it would land near **117**, and a par of ~130 would then put
the frontier search on gold and the plan-reader on gold too, which is still not a ladder — so the
re-baseline has to be paired with the content repair in §8b. Both are difficulty **increases**.

## 8. `w4-02` — the headline, and it is not a par problem

Reported separately from the rest because it is not a loose number. **It is a level whose medal and
whose star both reward declining to use the mechanic the level exists to teach.**

The chain, each link measured or quoted:

1. `mark()` costs **1 tick** (`DEFAULT_COSTS.mark`). The reference places one per newly-entered tile.
2. DESIGN.md §11 **A3** makes ordinary JavaScript memory explicitly legitimate: *"the docs panel must
   state plainly that ordinary JavaScript values (objects, `Map`, `Set`, closures) persist for the
   whole run… Several World 4 levels are unsolvable until the player believes this."* A `Set` of
   coordinates does `mark`'s job for **zero ticks**, by design and by documentation.
3. So `mark` is **strictly dominated** on this level. Measured: move counts are *identical* between
   the two routes on every seed — 112, 204, 236, 178 — and the whole 391-vs-236 gap is breadcrumbs.
   Reference: 112 + 102 = 214, 204 + 155 = 359, 236 + 155 = 391, 178 + 126 = 304.
4. The lazy route therefore **golds with 155 ticks of headroom and beats the reference on every
   seed.**
5. And the bonus does not defend the mechanic either. It is `mark-budget`:
   `` `Reach the vein having placed fewer than ${MARK_BUDGET} marks` ``, `markCount(ctx) < 180`.
   **Zero marks satisfies it.** The star is paid for using less of the hardware, so the answer that
   uses none of it takes the star as well as the gold.

**This is not a hypothesis.** `docs/PLAYTEST-VETERAN.md` §122 recorded a human doing exactly this on
his first run: *"gold 236/391 + star, 1st run… **I placed zero marks**"* — and the lazy route
constructed for this measurement, with no knowledge of that line, lands on **236**. The same number.
A prediction that reproduces a recorded playtest to the tick is the strongest evidence either
document contains.

**Par cannot fix it, and moving par alone makes it worse in both directions.** Lowering par below
391 makes the *reference solution* miss gold — `levels.test.ts` asserts the reference golds every
seed, so the suite goes red and, more importantly, the answer that used the hardware would be
punished for using it. Raising par widens an already-free gold. The repair is content: either a
required objective that needs `readMark` — the half a `Set` genuinely cannot replace, because a
mark is *in the world* and can be read by something that did not write it — or a reference solution
that does not pay for breadcrumbs it does not need. **No par change is proposed for `w4-02`. The
par is a symptom.**

## 8b. `w8-04` — the second `w4-02`, and it is bigger

Reported separately for the same reason `w4-02` is: **par is not the defect, it is the symptom, and
the level rewards declining to use the mechanic it exists to teach.**

The chain, each link measured:

1. The level's central idea is a World 6 callback — ninety-five candidate cipher keys, a checksum
   that says which one landed, and a run-length-encoded route to drive. The reference spends its
   ticks driving it: **101, 121, 205, 223, 123**, par 223.
2. The required objectives are **`form-recovered`** (`inventoryCount(bot, ItemKind.Chip) > 0`) and
   **`bot-intact`**. Neither reads the antenna, the cipher, the plan, or the bot's position.
3. `look`, `scan` and `probe` cost **zero ticks** (§6.4). So a frontier search buys the whole map
   for free and needs no plan to find anything.
4. Measured: a program that **never calls `receive()`**, never cracks the key and never parses a
   `SEC` record — it walks the frontier of what it has seen until the locker is in view, then goes
   and lifts the form — costs **59, 43, 5, 17, 65**. Worst seed **65** against par 223: **gold with
   158 ticks to spare, on every seed.**
5. The brief says *"Bring the form back up. The run ends with the form in the bot."* The objective
   only checks the second sentence. Paying the first — walking back to the lift at (4, 4) — costs
   **117, 85, 9, 33, 91**. Worst seed **117**: still **gold, 106 ticks under par, on every seed.**
6. **And the bonus does not defend the mechanic either.** `no-resurvey` allows
   `collapsed.length × 10 + 4` tiles of ground *the plan does not describe*. Measured strays against
   allowance — reference: **0/4, 17/24, 19/34, 37/64, 14/44**; plan-ignoring route: **0/4, 0/24,
   0/34, 4/64, 11/44**. The short way to the locker is a *subsequence of the plan's own tiles*, so
   the program that never read the plan strays **less than the one that followed it** and takes the
   star on all five seeds — on seeds 1, 2 and 3 with a stray count of **zero**.

So the answer that skips the antenna, the cipher and the plan takes **the gold and the star**, on
every seed, by margins of 106–218 ticks. `w4-02`'s lazy route beat the reference by 155 ticks on
one axis; this one beats it by 158 and is cheaper on all five seeds.

**What par can and cannot do here** is in §7.2: nothing. The repairs are content, and there are
three, any of which helps:

- **`form-recovered` should mean what its label says.** It reads *"Come back up holding KD-0001-T"*
  and does not check that the bot came back up. That alone costs the lazy route 52 ticks and is the
  cheapest fix in the document.
- **`no-resurvey` counts the wrong thing.** An allowance for tiles *off* the plan cannot tell a
  plan-follower from a short-cutter whose short cut lies on the plan. Counting **tiles entered**
  against a budget derived from the plan's own length would.
- **Make the plan load-bearing.** A hazard, a locked section, or a locker whose tile is not visible
  from any frontier the search can reach without the plan's `SEC` records — the equivalent of
  `w4-02`'s missing `readMark` requirement: something in the world that only the disclosed
  information can get you past.

**No par change is proposed for `w8-04`.**

## 8c. The two bug lists

### Impossible pars — pars no reference run reaches

**None. In Worlds 3–8, on either implementation path, on every declared seed.**

All 27 levels' references pass inside par on the `run` driver, and the 34-level `run`-vs-`source`
cross-check (§5.3) agrees on the medal everywhere, including the two levels where the tick counts
differ. The nearest thing to an impossible par in the campaign is **`w8-03`, and it is not one**:
its par is reachable (84 against 128), but on seed 3 par sits 30 ticks *past* the level's own
required deadline, so the ladder promises a medal in a band where the verdict has already failed.
That is a coherence defect, not an impossibility, and it is §7.1.

### Free pars — a lazy but correct program takes gold

Seven, across Worlds 3–8. Ordered by how much room the lazy answer has.

| Level | Par | Lazy route (worst seed) | Lazy medal | Room | Also takes the star? |
|---|---:|---:|---|---:|---|
| **w8-04** | 223 | **65** (objectives as coded) / **117** (brief as written) | **gold** | **158 / 106 ticks** | **yes, all 5 seeds** |
| w4-02 | 391 | **236** | **gold** | 155 ticks | **yes** — `mark-budget` is satisfied by zero marks |
| w6-04 | 14 | **13** | **gold** | 1 tick, and *cheaper than the reference* | n/a — skipping the star is the whole route |
| w5-01 | 37 | **37** | **gold** | 0 ticks — par is priced *at* the lazy route | no |
| w5-03 | 76 | **76** | **gold** | 0 ticks — tick-identical to the reference | no — `tight-order` is the only separator |
| w6-02 | 37 | **37** | **gold** | 0 ticks — tick-identical to the reference | no — `name-the-fault` is the only separator |
| w7-01 (lockstep) | 10 | **10** | gold | 0 ticks — tick-identical to the reference | no |

Two of the seven are par defects that par can fix (`w5-01`: lower to 32, §7). Three are levels where
**every correct program costs the same** and par has nothing to rank (`w5-03`, `w6-02`, and
`w7-01`'s lockstep case, which is only free against one of the two lazy shapes — the serial one
bronzes). Two are content defects that par cannot touch (`w4-02`, `w8-04`), and one is the §10 class
(`w6-04`).

**And where par is working, plainly:** 19 of the 23 graded levels in Worlds 3–8 separate the answer
that uses the level's idea from the answer that does not, by at least one medal, on the seed that
grades. **World 3 (3 of 3) and World 7 (5 of 5) are clean.** World 8 is 4 of 5. The three lazy
routes constructed for World 3 with no knowledge of the playtest reproduced
`PLAYTEST-BEGINNER.md`'s first honest attempt at **176/157, 402/332 and 449/365** — the same three
silvers at the same three numbers. A method that only ever finds faults is not a method, and this
one did not.

## 9. A7 candidates the shipped proxy cannot see

DESIGN.md §11 **A7** states the criterion in words: *"can any correct program cost fewer ticks than
another correct program? Where it cannot, the route is forced."*

`levels.test.ts` operationalises it as `CLOCK_CANNOT_VARY` — *"the reference costs the same on every
seed"* — and pins the set `['w1-01', 'w5-02', 'w6-01', 'w6-03', 'w6-05']`.

**That proxy is sufficient but not necessary, and nothing in the repo records that it is a proxy.**
A level whose cost varies with the **seed** but not with the **program** satisfies A7's written
criterion and fails the test's filter completely. Measured, Worlds 3–8 contain at least three:

| Level | Par | Reference | Every correct program costs | Passes the proxy? | Satisfies A7 as written? |
|---|---:|---|---|---|---|
| w4-01 | 52 | 48, 52, 50 | the tunnel — 48, 52, 50, whatever shape you write | no (varies by seed) | **yes** |
| w5-04 | 40 | 34, 38, 24, 36, 34 | `2 × consumers` — 34, 38, 24, 36, 34 | no (varies by seed) | **yes** |
| w6-02 | 37 | 25, 37, 18, 29 | one tick per clean packet — 25, 37, 18, 29 | no (varies by seed) | **yes** |

Evidence per level:

- **`w4-01`** — two independent programs that use *none* of the level's "hold the direction you came
  from" idea (a visited-tile `Set`; right-hand wall-following with no memory at all) produce
  tick-for-tick identical runs.
- **`w5-04`** — `link` costs 2, cable is permanent, every consumer ends on exactly one feeder.
  Planning is free and there is nothing else to spend a tick on. The two lazy shapes that *would*
  have been cheaper are simply incorrect: first-fit in listed order fails seed 3's constructed
  anti-first-fit layout, and all-on-the-biggest-feeder fails `within-capacity` on all five.
- **`w6-02`** — every correct program relays exactly the clean packets at one tick each. Checking
  only the additive sum instead of both sums costs the reference's numbers to the tick.

**`w6-04` is a related but distinct case** and is in §10, not here: its ticks *do* vary by program,
but in the wrong direction.

**This is why a green test found nothing in Worlds 3–8.** Nothing is broken in `levels.test.ts`; it
asserts what it says it asserts. What is missing is any record that the thing it asserts is a
*stand-in* for the criterion in DESIGN.md, and is strictly narrower than it. That is the third
instance of the same bug class on this branch — a proxy standing in for a criterion, a label parsed
in place of a declaration, and two hand-maintained copies of one reference solution — and the
pattern is worth naming rather than fixing three times.

**No `graded: false` is proposed here.** Ungrading is a difficulty-shaped ruling and A7 says so;
these are reported as candidates with their evidence.

### 9.1 Worlds 7 and 8 — swept, and there are none

Checked the same way: for each level, a second correct program of a deliberately different shape,
driven on every seed, compared tick for tick against the reference.

**Every graded level in Worlds 7 and 8 has a clock that varies by program**, so none of them is a
forced route and none is an A7 candidate. The pairs that prove it:

| Level | Reference (worst seed) | A second correct program (worst seed) | Varies by program? |
|---|---:|---:|---|
| w7-01 | 10 | 13 (serial shift) | yes |
| w7-02 | 52 | 311 (never `spawn`) | yes |
| w7-03 | 165 | 589 (one hauler at a time) | yes |
| w7-04 | 79 | 104 (round-robin deal) | yes |
| w7-05 | 100 | 220 (survey, then dispatch) | yes |
| w8-01 | 160 | 178 (reading-order batches) | yes |
| w8-02 | 632 | 751 (survey, then ship) | yes |
| w8-03 | 84 | 175 (layer barrier) | yes |
| w8-04 | 223 | **65** (ignore the plan) | yes — in the wrong direction |
| w8-05 | 917 | 1465 (one bot, one clock) | yes |

So the A7 list from this measurement stands at exactly the three levels already named — `w4-01`,
`w5-04`, `w6-02` — plus the five the shipped proxy already pins. That the sweep of ten more levels
added none is worth recording: it is what makes the three that *did* turn up credible.

`w7-01` deserves a footnote because it looks like a candidate and is not. Two of its three lazy
shapes cost the reference's exact numbers (7, 10, 9), because `sync()` raises every bot to the
highest clock and therefore costs nothing to a fleet that is already level. Only deliberate
serialisation is dearer. A7 asks whether *any* correct program can cost less than another, and here
one can, so the route is not forced — but the set of programs par can distinguish has exactly two
elements.

## 10. A named class: a tick-spending bonus inside a par calibrated without it

Found twice now, and it is a class rather than two accidents.

**When a bonus objective costs ticks, and par was set from a run that does not attempt it, the star
and the medal are set against each other.** The player who reaches for the star pays for it in
gold-margin.

| Level | Required floor (worst seed) | Reference, bonus attempted | Par | Effect |
|---|---:|---:|---:|---|
| w1-03 | 24 (`corridorPoll`, tick-optimal) | 24 | 24 | the stride the bonus asks for costs *more*; recorded in `FIX-PAR.md` §2 |
| w6-04 | **13** (headed packets only) | **14** (+ the straggler transmit) | 14 | attempting the bonus costs exactly the gold-margin |

On `w6-04` the required objective needs one `transmit` per headed packet, so the floor is
8/11/9/13 and **every** correct program sits on it. Par 14 is the reference's cost *including* the
bonus straggler. So the answer that skips the star is one tick cheaper than the reference, golds
with room, and the key search the level is named for is free in ticks and ranks nothing.

**The check any new tick-spending bonus must pass:** its cost, added to the worst-seed cost of a
correct program that does not attempt it, must still be inside par. Otherwise the star is a tax on
the medal.

### 10.1 Worlds 7 and 8 — swept, and the class has a mirror

Every bonus objective in Worlds 7 and 8 was checked for tick cost, against the reference and
against the lazy route, on every seed.

| Level | Bonus | Costs ticks? | Inside par? | Note |
|---|---|---|---|---|
| w7-01 | `name-the-idle` | **no** — `print` is not in `DEFAULT_COSTS` | n/a | reference with the report and a route without it both cost 7, 10, 9 |
| w7-02 | `even-share` | no | yes | reference takes it on all 4 seeds at 32/35/45/52, unchanged by the rewrite |
| w7-03 | `no-bumps` | **negative** — a blocked move costs 1 tick | yes | see below |
| w7-04 | `name-the-decider` | no — `print` | n/a | |
| w7-05 | `workers-busy` | negative — idle ticks are ticks | — | **the reference misses this star on all 5 seeds**; a bonus defect, not a par one |
| w8-01 | `name-the-row`, `within-10-look` | no | yes | reference takes both on all 4 seeds |
| w8-02 | `ship-while-you-look` | **negative** | yes | the bonus *is* the anti-lazy discriminator — the survey-then-ship route misses it on all 5 seeds |
| w8-03 | `within-26-probe` | no — `probe` is free (§6.4) | yes | free to the lazy routes too: STAR on all 5 seeds for both |
| w8-04 | `no-resurvey` | **the mirror case** | see below | |
| w8-05 | `name-the-hold`, `fleet-utilisation` | no — `print` / negative | yes | post-rewrite set; reference takes `name-the-hold` on all 3 seeds and **misses `fleet-utilisation` on all 3** |

**No new instance of §10 as originally stated** — no World 7 or 8 bonus costs ticks that par was
calibrated without. But two adjacent shapes turned up and both belong in this section.

**The mirror: a par calibrated *with* a tick-spending obligation that nothing required pays for.**
`w6-04` was the first instance and was read as the class itself; it is really the reflection of it.
Par 14 is the reference's cost *including* the bonus transmit, so the answer that skips the star is
one tick cheaper and golds. `w8-04` is the same shape at 158 times the size: par 223 is the cost of
driving the filed plan, and nothing required asks for the plan to be driven, so the answer that
ignores it golds by 106–158 ticks **and takes the star anyway**.

| Level | Required floor (worst seed) | Reference, obligation honoured | Par | Free room for the answer that skips it |
|---|---:|---:|---:|---:|
| w6-04 | 13 | 14 | 14 | 1 tick |
| w8-04 | **65** (objectives as coded) / **117** (brief as written) | 223 | 223 | **158 / 106 ticks** |

**The check any par must pass, restated to cover both directions:**

- *(§10, original)* A tick-spending **bonus** must fit: its cost, added to the worst-seed cost of a
  correct program that does not attempt it, must still be inside par — **checked on the worst seed,
  not on seed one**. Bonus grading now takes the worst result across every seed, and the three
  bonuses that lost their star under that rule were all threshold bonuses whose margin varies seed
  to seed, which is exactly the kind whose interaction with par is seed-dependent.
- *(§10.1, the mirror)* Par must not be calibrated from work that **no required objective demands**.
  If the reference pays for something optional, par inherits that cost and hands it to every player
  who declines to pay it. Par should be the worst-seed cost of the cheapest program that satisfies
  the **required** objectives well.

**And a third shape, seen once, which is not a par defect but sits next to one.** On `w7-03` the
lazy route takes `no-bumps` on all four seeds *because* it is lazy — a fleet that never puts two
bots in the tunnel never bumps — while par bronzes it at 589 against 200. The medal and the star
point in opposite directions on the same program. That is legible and arguably fine (the star is
"be careful", the medal is "be quick", and the level is about buying one with the other), but it
should be a deliberate design statement somewhere, because on `w4-02` and `w8-04` the identical
shape is a defect.

---

**Scope closed.** §7 and the World 7–8 rows are measured and written. What is deliberately *not*
done here, because it is content or test work in files held by other agents: the `w4-02` and
`w8-04` repairs (§8, §8b), the `w8-03` par/deadline reconciliation (§7.1), the `w5-01` par change
(§7), reconciling `ReferenceSolution.run` with `ReferenceSolution.source` and adding the guard that
keeps them reconciled (§5.3), and the `graded: false` rulings the A7 candidates in §9 would need.
