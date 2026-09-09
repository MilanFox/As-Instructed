# Decisions taken off the perfect-information audit

The five open decisions the audit left for the user, taken. Every number below was re-measured
against the shipped generators and reference solutions rather than copied out of the audit; where
a figure is quoted from `docs/audits/*.md` it is said so.

Two of the five landed on a different number than the audit recommended, and both for the same
reason, which is stated once here: **the medal is taken from the worst seed of the run**
(`src/runtime/aggregate.ts` — "the worst seed sets the score"), and `src/levels/__tests__/levels.test.ts:169`
holds the reference solution to gold on every seed for all 33 work orders. CURRICULUM §2 rule 4's
"from the *median* seed" cannot be read literally under those two facts: a par at the median puts
gold out of reach of the level's own reference, and on `w5-04` out of reach of *any* correct
program. Measured across the campaign, the shipped convention is `par = the heuristic's worst
seed` (par/worst is 1.00 on 19 of 33 levels and never above 1.24). Rule 4 is applied here as "the
heuristic, never an optimal solver, on the seed that costs it the most".

---

## 1. `w5-04` par: 40 → **36**, not 32

**Measured.** The reference costs 32 / 36 / 24 / 32 / 28 ticks on seeds 1-5, which confirms the
audit's post-fix figures. The seeds draw 16 / 18 / 12 / 16 / 14 consumers and `link` costs 2 ticks,
so the clock is exactly `2 × consumers` — the reference never moves and lays one cable per
consumer.

**Why not 32.** On this level the tick axis does not separate programs at all: FFD, a perfect
packing and a lucky guess all cost `2 × consumers` on a given seed. What varies is whether the yard
packs, not what it costs. A par of 32 would therefore not tighten the ladder — it would delete the
top rung, since seed 2 costs 36 whatever the player writes and the medal comes off the worst seed.
36 is the worst seed, which is the tightest par under which gold is attainable at all.

**Stale comment fixed.** The old comment's "40 ticks on the twenty-consumer seed" named a draw no
seed makes; 40 was the ceiling of `rng.int(14, 20)`. The derivation, the five measured costs and
the reason the median is the wrong statistic here are now in the comment above `par`.

Changed: `src/levels/world-5/w5-04.ts` — par comment, `par: { ticks: 36 }`.

## 2. `w8-02` par: 700 → **632**, not ~420

**Measured.** The reference costs 319 / 518 / 632 / 465 / 450 and takes the star on every seed.

**Why not 420.** 420 is `median − 10%`, and no par below 632 leaves the reference at gold — the
brief's own acceptance condition ("confirm the reference still takes gold"). It would not rank the
programs it looks like it ranks either: the full-survey-then-deliver program the audit measured at
448 / 555 / 581 / 449 / 519 is *cheaper than the reference on the worst seed*, so no par can
separate the two. The tick axis on this level ranks quality-of-execution and nothing else; what
separates surveying-first from interleaving is `ship-while-you-look`, and the fact cards the audit
rewrote now say so.

632 is the tightest par that keeps the reference at gold, and it closes the audit's actual finding:
at 700 a run 10% worse than the reference everywhere still golded, so the ladder carried no
information.

Also corrected, in the same file, two code comments that had gone false and that the audit had
flagged as player-facing-adjacent: the level's head docstring no longer claims par is set below a
survey plus a delivery round (it is not — that program golds), and no longer claims the
class-to-bay mapping is discoverable only by looking (six free `probe` calls disprove it).

Changed: `src/levels/world-8/w8-02.ts` — `PAR_TICKS = 632` and its derivation, head docstring.

## 3. `w8-05` `gateSlack` going negative — the alternative taken

`gateSlack` is `gateMovedAt − feederThrownAt`, one bot's clock minus another's, and `Sim.unfed`
tests the shared world rather than the two clocks: a carrier parked at the handle while the
electrician waits out the grid turns it at a *lower* tick than the throw. The audit measured −648
on seed 1 and `readClaim` accepted the negative, so `gate sub-6 -648` was the graded-correct answer
to a bonus titled "how long it stood powered and shut".

**Taken: the alternative recorded at `docs/audits/world-8.md:614`.** `gateSlack` returns `undefined`
when the gate moved first, so that shift has no interval to file rather than a number below zero.
Consequences, all checked:

- The reference still earns `mind-the-gate` on all three seeds (`world-8/__tests__/bonus.test.ts`).
- `misreadGate` gained the third branch the change needs. It names both ticks — "moved at tick 41,
  thrown at tick 689" — which is §11.6 *what, not why*: the two ticks are facts about the run the
  player owns, and why the fleet's clocks disagree is the puzzle.
- The `Gate note` fact card states the rule outright: a fleet that never squares its clocks can
  turn the handle at a lower tick than the throw, and that shift cannot file the note.
- New test: `world-8/__tests__/divergence.test.ts` — "a gate opened before its substation was
  thrown has no interval to file", driven off a written use log because provoking it for real means
  driving a two-bot shift to make one subtraction come out backwards.

The audit's *recommended* option — leave the arithmetic, let the wording carry it — was refused on
the brief's own grounds: the bonus asks the player to report a duration, and a duration of −648 is
not one.

Changed: `src/levels/world-8/w8-05.ts` — `gateSlack`, `misreadGate`, `Gate note` fact.

## 4. The station-index hole, `w8-03` and `w8-05`

Both generators only ever draw a feeder from a lower-numbered station, so station index order was
always a topological order and `for (i = 0; i < n; i++) use("sub-" + i)` satisfied the precedence
objective on every seed of both levels without reading `vars.deps` — on the two levels whose whole
subject is the dependency graph.

Closed the way `w5-03` closed it: a `relabel` that deals the ids out again, redrawing until
ascending id order breaks somewhere. **Only the names move.** In both levels a site keeps the slot
it was dealt into, so the tiles, the cable, the edges and the critical chain are the board the draw
already made.

- **`w8-05`** — free, as the audit said. Reference ticks moved 514 / 779 / 894 → 535 / 779 / 921
  purely through the reference's tie-breaks; par is 1050 and untouched (the audit's item 5 leaves it
  as an open orchestrator decision, and it stays open).
- **`w8-03`** — re-measured properly rather than assumed. The posted shift is unchanged on every
  seed (160 / 359 / 138 / 150 / 207, identical to the audit's pre-change measurement), which is the
  evidence that the geometry did not move: `deadlineFor` reads `meanHop` over every station tile,
  `criticalChain` over the DAG and `lanes` over the crew. List scheduling now costs
  63 / 84 / 48 / 51 / 71 against 63 / 84 / 55 / 57 / 71 before. The worst seed is unmoved at 84, so
  **par stays 84**, and the silver cut of 105 still sits under the shortest shift (138), which is
  what `w8-03 grades and fails on one axis` requires.

**Tests added**, one per level, that a bare ascending loop is refused:

- `src/levels/__tests__/divergence.test.ts` — w8-03: a single bot walks the ids in numeric order and
  uses each. `grid-live` is met (it is a correct-looking program, not an idle one) and
  `precedence-held` fails, on every seed.
- `src/levels/__tests__/divergence.test.ts` — w8-05: the same order written straight into the use
  log, which is all `precedence` reads; refused on all three seeds.
- `src/levels/world-5/__tests__/divergence.test.ts` — w5-03 had the guard but no test. Now it has
  one, in the same shape, so the three levels are held by the same assertion.

Two existing tests had to stop assuming a name rather than a property, and both were assumptions the
old generator happened to satisfy rather than things the levels promise:

- `pickChain` (`src/levels/__tests__/divergence.test.ts`) now picks a station hanging off exactly one
  *root*. A two-feeder station is in breach the moment a test energises it having driven only the
  first feeder, and a feeder that is itself fed is in breach on its own account — either way the
  report is about a station those cases never meant to name.
- `world-8/__tests__/bonus.test.ts` used `sub-0` as "the wrong station" for both w8-05 stars.
  `sub-0` is no longer reliably a root. `name-the-hold` now names an actual root (a station with no
  feeder never carries a hold, so ties can never include it) and `mind-the-gate` names any station
  other than the one the reference filed.

Changed: `src/levels/world-8/w8-03.ts` (`relabel`, `build`, par comment),
`src/levels/world-8/w8-05.ts` (`relabel`, `build`, `feederIndex` comment — the seed-7 root it names
is `sub-6` now), and the three test files above.

## 5. `w4-01`'s seed list: seeds `[1, 2, 3]` → `[1, 2, 46]`

`tunnelCells` declares `rng.int(16, 30)` and the shipped list drew 25 / 27 / 26 — three middling
tunnels, so the shortest instance the generator can produce had never been played (CURRICULUM §2
rule 3, §15 rule 3). Swapped rather than extended, so the seed count stays at the 3 that
`docs/CURRICULUM.md` §6 publishes; §15 rule 3 puts the degenerate case anywhere but seed 1, and this
is seed 3 of 3.

**How the seed was chosen, because the obvious candidates break the star.** The bonus separates two
programs by rays: a one-tile feeler casts far more than a run that looks down each corridor, and
`LOOK_BUDGET` is 60. On a shortest tunnel the feeler casts *fewer* rays, so most minimum draws hand
it the star. Measured over seeds 1-60, the minimum-length draws (31 floor tiles, 16 cells) are seeds
7, 19, 35, 45, 46 and 53, on which the feeler casts 52 / 62 / 55 / 55 / 69 / 63. Seed 46 has the
margin: the feeler overspends at 69 and the honest run costs 19.

The two ray families are now 85 / 108 / 69 (feeler) against 35 / 41 / 19 (reference), still either
side of 60 on every seed, which is the property `world-4/__tests__/bonus.test.ts` asserts.

**Par is unchanged at 52.** It is seed 2's exact reference cost and a shorter tunnel cannot raise
the longest one; the reference costs 48 / 52 / 30 on the new list. The `The tunnel` fact card now
says the length varies as well as the shape, since the list no longer hides that.

Changed: `src/levels/world-4/w4-01.ts` — `seeds`, `LOOK_BUDGET` comment (measured figures and why
seed 46 rather than 7/35/45), head docstring (the derivation), `The tunnel` fact.

---

## Verification

`npx vitest run` — 102 files, 2193 tests, all passing. `npx tsc --noEmit` clean. `npx eslint` clean
on every file touched (and on `src/levels` as a whole — the pre-existing `react-hooks` false
positive in `world-5/__solutions__/w5-01.ts` no longer reports, so another agent has closed it).

`npx prettier --check` now passes on every file touched. Four of them were already prettier-dirty at
HEAD and running the repo's own formatter over them reformatted a few pre-existing lines as well;
that churn is cosmetic and confined to files in this batch.

No scratch files remain. Nothing committed, nothing staged, and no git command other than
`status`/`diff`/`log`/`show` was run.
