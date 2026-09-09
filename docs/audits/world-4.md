# World 4 — Cave Systems · perfect-information audit

Audited against `DESIGN.md` §11, `CURRICULUM.md` §2 / §11 / §15. Levels: `w4-01`, `w4-02`,
`w4-04`, `w4-05`, plus `caves.ts` and `objectives.ts`.

## w4-01 — Headlamp
**Verdict:** fixed (one wording tightening; no structural defect)

**Findings:**

1. *(fixed)* The fact card said `Looking — Free, and as often as you like.` two rows above the
   card that caps the star at 60 rays. Both rows are on screen, so nothing was hidden, but the
   two contradict each other in as many words and the first one reads as a licence. A player who
   takes the first row at face value writes the one-tile-feeler loop the bonus test
   (`feltAhead`) exists to refuse, and only finds out from the star.
2. *(clean)* The graded budget itself is stated up front — `The lamp` names the number, the
   "whole shift" scope and the ray-is-a-corridor fact. The `look` doc page (`docs: ['look', …]`)
   states the default range of 8, the stop-on-first-opaque rule and that the stopping tile counts
   against `range`, so nothing about the primitive lives only in the starter comment.
3. *(clean)* Seed 1 is not degenerate. Measured: seeds 1/2/3 build tunnels of 49/53/51 floor
   tiles, all trees (`cycles: 0`), reference ticks 48/52/50 and rays 35/41/34. No seed is a
   straight run, so no direction-hardcode or fixed turn sequence passes seed 1. The two ray
   families the budget separates (85/108/101 vs 35/41/34) sit either side of 60 on *every* seed,
   not just on seed 1 — the star cannot be won by a seed-1 accident.
4. *(clean)* Divergences name the tile. `endedOn` gives the pad's coordinate against where the bot
   actually stopped; the budget divergence gives `60 rays` against the rays actually cast, and
   falls back to `endedOn` when the bot never arrived. Both say *what*, not *why*.
5. *(observation, no change)* A straight stretch longer than 8 tiles is possible on an 11-cell
   grid, so `look(dir)` can return 8 walkable views with no wall at the end. This is not a trap:
   the honest loop ("walk the walkable prefix, then look again") is still correct, it just spends
   one more ray, and the range is documented. The reference's own comment ("a ray cannot outrun
   the widest tunnel this level builds") is slightly optimistic but is not player-facing.

**Changed:**
- `src/levels/world-4/w4-01.ts:99` — `Looking` fact reworded to
  `Costs no ticks. The star below is the only thing that counts rays.` Removes the contradiction
  with `The lamp` without changing what is graded.

**For the user:**
- **Seed list has no degenerate case** (`CURRICULUM.md` §2 rule 3, §15 rule 3). The three seeds
  draw 25, 27 and 26 tunnel cells out of a declared `rng.int(16, 30)` range — they differ in
  shape but none of them is the degenerate instance the rules ask for (a minimum-length tunnel, a
  start already adjacent to the pad, a tunnel with no bend). §15 rule 4 would call at least one of
  the three padding. I did not change it: reseeding moves `par.ticks` (52 is seed 2's exact
  reference cost), which is out of scope for this audit. Recommendation: swap seed 3 for a seed
  drawing near 16 cells and re-derive par, or add a fourth short seed. Low urgency — it does not
  breach §11, only §2/§15.

## w4-02 — Breadcrumbs
**Verdict:** fixed

**Findings:**

1. **The premise was stated only in the starter's flavour comment and in hint 1.** The level
   exists because the `w4-01` rule ("never step back the way you came") becomes a closed circuit
   in a branching cave. Brief and facts said nothing about the cave's shape: brief was two lines
   of flavour plus "Reach the ore vein", and the facts table covered the vein, `mark`, `readMark`
   and the star. The two places that named the shape were `// NOTE(4470): the tunnel joins back
   onto itself. more than once` in the starter and hint 1 (*"two junctions look identical from
   inside"*). That is the `w3-01` shape exactly — a graded premise whose only statement is a hint
   — and DESIGN §11.3 forbids it. A player who reads brief + facts and writes the `w4-01` loop
   discovers the fork/loop structure by watching the bot ride a circuit into the tick budget.
   Fixed by putting the fork-and-rejoin structure in the brief.
2. *(clean)* The star's graded rule is fully stated. `A trail home` names the crumb format
   (`"x,y"`), what the crumb has to contain (the tile the bot arrived from), the starting point of
   the walk (*beside* the vein, not on it — which is exactly what `trailHome` does) and the
   end condition (arrives back at the start). Nothing in `followTrail` grades anything that card
   does not name; the "no tile twice" clause it enforces is implied by "arrives back at the start"
   and cannot refuse an honest parent-pointer trail.
3. *(clean)* Seed 1 is not degenerate for the thing the level teaches. Measured cycle counts:
   seed 1 → 3, seed 2 → 4, seed 3 → 3, seed 4 → 0. The tree case is seed 4, as `CYCLE_CHOICES`
   claims, so a player who generalises from seed 1 has already had to handle loops. Reference
   ticks 214/359/391/304 against par 391 — seed 1 is comfortably the friendliest (§15 rule 1).
4. *(clean)* Divergences name the tile and quote the run its own crumb (`trailBroke`), and the
   two shapes are distinguished: "nothing beside the vein" vs "this tile's crumb does not lead
   anywhere". Neither hands over the tile the bot actually arrived from.
5. *(clean, and deliberately so)* `bonus.test.ts` does *not* encode a defect: both refusal tests
   (`rememberedVisited`, `markedVisited`) refuse programs that are correct and gold-taking, which
   is the fair kind of refusal — the star asks for a second idea and says which one.

**Changed:**
- `src/levels/world-4/w4-02.ts:185-189` — new `The cave` fact card, first in the table:
  *"It forks. On most shifts some of the forks rejoin further in, so a passage can hand the bot
  back to a junction it has already stood at."* Hedged deliberately — seed 4 is a plain tree, so an
  unqualified "it loops" would be a per-seed lie.

  I first wrote this into the brief and moved it to the facts table, for two reasons. The facts
  table is where `types.ts` says mechanical facts belong (*"Prose is read once; a row stays on
  screen"*), and `levels.test.ts` enforces a shared campaign-wide average of ≤ 60 brief words per
  level — a budget three other worlds are also spending right now (see Verification).

**For the user:**
- **`budget.maxTicks: 1600` is not stated anywhere player-facing.** Strictly, a run that loops
  forever is failed by a limit the player was never told. I did not touch it, for two reasons:
  `CURRICULUM.md` §6 says the replay going round and round *is* the lesson here, so the ceiling is
  the delivery mechanism rather than a difficulty knob; and it sits 4× above par (391), so no
  honest program can reach it. The report sheet also names the cause ("Stopped at the tick
  budget"). Same pattern in `w3-01`/`w3-02`/`w3-04`. Recommendation: leave as is, or make it a
  cross-world convention in one pass rather than a World 4 exception.
- The starter comment `// NOTE(4470): the tunnel joins back onto itself. more than once` is false
  on seed 4. It reads as an in-fiction note from a previous engineer, so I left it; the brief line
  I added is the hedged version. Say the word if you want the NOTE hedged too.

## w4-04 — Map First, Move Second
**Verdict:** fixed (one real §11.1 defect), plus one decision for you

**Findings:**

1. **The bonus grades *first* visit, and nothing player-facing said so.** `tookBestOrder` builds the
   run's order from `firstVisitOrder`, i.e. the first tick the bot ever stood on each pad — across
   the *whole* run, survey included. The reference solution avoids the trap deliberately
   (`unfinished` excludes landings, and its own comment says *"recorded by sight and never entered
   during the survey — which is also what keeps the visit order in phase three equal to the planned
   order"*), but that sentence lives in `__solutions__/w4-04.ts`, which no player reads.

   Measured, not argued. I wrote the obvious first attempt — a DFS walk of the entire cave, then a
   perfectly optimal planned circuit — and ran it on all four seeds:

   | seed | ticks | objectives | `best-order` | divergence |
   |---|---|---|---|---|
   | 1 | 1008 | pass | **refused** | `(25, 3) → (13, 21) → (7, 21)` · 224 vs 348 steps |
   | 2 | 1072 | pass | **refused** | `(23, 9) → (11, 21) → (21, 9)` · 286 vs 326 steps |
   | 3 | 1124 | pass | **refused** | `(15, 23) → (9, 25) → (5, 5)` · 342 vs 506 steps |
   | 4 | 1100 | pass | earned | — |

   Every one of those runs drove the mathematically best order in phase three. Three of the four
   were refused for tiles they stepped on while mapping. This is the exact §11.1 shape: a mechanic
   that surfaces only on failure. Worse, the two things that push a player into it are the level's
   own scaffolding — `budget.maxTicks: 1350` is set to fund "one wasteful exploration pass"
   (`CURRICULUM.md` §11), and the starter's `// TODO(4470): the side chambers are easy to walk
   straight past` warns about *missing* the chambers, which is the opposite failure.

   Fixed by stating it: a new `The order` fact card, in the same `For the star:` voice `w4-01` and
   `w4-02` use.
2. *(clean)* The divergence is already good and already correct for this case — `orderTaken` hands
   back the run's own first-visit order as coordinates, prices it against the best order's cost,
   and never names the best order itself. With finding 1's card in place it now reads as a fair
   report rather than a riddle: a player who sees an order they did not drive knows why.
3. *(clean)* `collect-all` names the first point never stood on; `end-on-lift` names the lift and
   where the bot actually stopped. Both say *what*, not *why*.
4. *(clean)* The lift is a `Depot` and the points are `Pad`s specifically so the four landmarks are
   distinguishable by sight — `CURRICULUM.md` §2 rule 10 satisfied.
5. *(clean)* The `divergence.test.ts` assertions for `best-order` encode intent, not a defect: they
   pin that the worst order is priced and that the best order is never named.
6. **Frustration Watch, as asked.** I did **not** touch the starter scaffolding or
   `budget.maxTicks`. My read is that the §11 entry does **not** conflict with DESIGN §11: the
   loose budget is legitimate slack, and the starter `Map`/`key` helper is legitimate scaffolding.
   The defect was never the budget — it was that the budget funds an exploration pass whose side
   effect silently forfeits the star, with nothing on screen saying so. The fact card closes that
   without touching either protected constant.

**Changed:**
- `src/levels/world-4/w4-04.ts:249-253` — new `The order` fact:
  *"For the star: counted from the **first** time the bot stands on each point. A survey that walks
  into a side chamber has already spent that point — read the chamber off a ray down the passage
  instead."*

**For the user:**

- **Decision — is first-visit the rule you want, or is it an implementation accident?** I only
  stated the existing rule; I did not change it, per the brief. Two alternatives, if you want the
  bonus to grade the *plan* rather than the whole trace:
  1. Grade the **last** three visits instead of the first. A walking survey then costs nothing, and
     the star measures the circuit the player actually planned. Cheapest change, one line in
     `firstVisitOrder`'s caller, and it removes the trap outright.
  2. Keep first-visit and lean into it — it does teach something real ("sensing is free, walking is
     not; map by ray"). This is what my fact card assumes.

  My recommendation is **(1)**, and keep the fact card reworded to match. The level's stated lesson
  is *separate exploration from execution*; grading the exploration pass as if it were the execution
  pass argues against the lesson it teaches. But it is a mechanic change, so it is yours.
- **The bonus does not actually require the work it asks for.** Nearest-neighbour greedy from the
  start is optimal on **all four** declared seeds (costs 224 / 286 / 342 / 318 — identical to the
  best of the six permutations). Hint 4 tells the player to try all six orders, and a player who
  does is right; but a player who writes three lines of greedy also takes the star every time. That
  is not unfair — nobody is caught — but the star is toothless, and `CURRICULUM.md` §2 rule 5
  ("good enough that the naive approach fails") is not met. Seed 1 additionally has **two** tied-best
  orders. Recommendation: draw one seed where greedy is strictly worse than optimal (with three
  stops and a fixed finish it takes a deliberate draw — reject the layout in `build` until
  `greedyCost > bestCost`, the same shape as `w3-01`'s `rowsMatch`). Report-only because it moves
  the seed list and therefore par.
- **`MODES` never draws `mixed`.** The comment on `MODES` says *"Every mode is drawn per seed, and
  the shipped seed list covers all three"*. Measured, the four seeds draw `clustered`, `spread`,
  `spread`, `spread` — `mixed` appears on no shipped seed, and `'clustered'` is listed twice in a
  4-element array so `rng.pick` is biased against it too. Either the comment is wrong or the seed
  list is. Not player-facing, so no §11 breach, but §15 rule 4 ("a seed differing only in its
  numbers is padding") has three seeds in the same mode. I left both alone — fixing it means either
  editing a comment I was told not to rewrite, or changing seeds. Recommendation: change the seed
  list so `mixed` is covered, and re-derive par.

## w4-05 — The Deep Shaft
**Verdict:** fixed (two unstated rules), plus two decisions for you

**Findings:**

1. **The tank's failure mode was stated nowhere.** Fuel is the whole level — the brief's phrase is
   "the same fuel pays for finding a vein and for getting home" — and the facts said how fuel is
   *spent* (`Acting spends fuel equal to the ticks it costs`) and how it is *restored*
   (`refuel()` on the depot) but never what happens when it runs out. Measured: an action the tank
   cannot pay for throws `OutOfFuelError` (`sim.ts:1205`), which aborts the program mid-run — the
   shift is over where the bot stands, no recovery, no partial credit. Neither the `fuel` nor the
   `refuel` API doc page says this either (`api-spec.ts:477`, `:490`); the only statement of it is
   the error message the player sees *after* it has happened. Textbook §11.1. Fixed by extending
   the `Fuel` fact.
2. **`Ordinary rock cannot be cut` names a terrain the player never sees.** The cave is walled with
   `Terrain.Wall` (deliberately — the file's own comment explains that `Terrain.Rock` is mineable
   and would let a player tunnel straight to a vein). So `scan` and `look` report `wall`, while the
   fact card warns them off `rock` — and a player arriving from World 2, where `rock` *was*
   mineable, has been taught that the two words mean different things. The cost of guessing wrong
   is a wasted tick and a wasted unit of fuel on a level where fuel is the constraint. Fixed by
   naming the tile the player actually sees.
3. **`bot-recovered` is an objective that cannot fail.** `Bring the bot back in one piece` checks
   `ctx.world.bots[0]?.alive`. The only thing in the engine that kills a bot is stepping onto a
   lethal terrain (`sim.ts:371`), and the only lethal terrain is `Pit` (`world.ts:102`). Measured:
   no shipped seed of `w4-05` contains a `Pit`, or any `Rock`, or any lethal tile at all — the
   terrain set is `Wall`, `Floor`, `Ore`, `Depot`. Running dry throws rather than killing, so
   `alive` is still `true` in the world a stranded run leaves behind. The objective is therefore
   always met, and `died()` in `objectives.ts:88` is reachable from nowhere else in the game.
   Reported, not changed — removing an objective is out of scope per the brief.
4. *(clean)* The star's rule is completely stated. `The return note` names the trigger (the moment
   the 5th ore is cut), the deadline (before the bot moves again), the exact format (`home <n>`),
   the unit (moves) and the follow-through (take exactly that many). `tripHome` grades exactly
   those four things and nothing else.
5. *(clean)* The four ways of missing the star are separated rather than collapsed into "no star":
   quota never made / drove off first / filed nothing / filed a different figure. That separation
   is the important half of §11.6 and it is done well.
6. *(clean)* Seed 1 is not degenerate and no fixed constant survives. Measured across seeds
   1–5: tanks 743 / 798 / 771 / 798 / 842 against a full-survey cost of ~1452–1456, i.e. 51%–58%
   of an exhaustive walk, so "explore for N ticks then turn back" cannot be tuned on seed 1 and
   carried. Veins 10 / 8 / 9 / 8 / 9 with a quota of 5; each ore tile yields exactly one ore and
   clears to floor (`sim.ts:504-507`), so five *distinct* veins are always required — no standing
   at one face and cutting it five times. Reference ticks 478 / 544 / 566 / 428 / 348 against par
   700, passing on all five.
7. *(clean)* `bonus.test.ts` does not encode a defect. Its `filedAs` helper rewrites only the filed
   line on an otherwise byte-identical reference run, which isolates the one variable the star
   grades — that is the right way to pin a star.

**Changed:**
- `src/levels/world-4/w4-05.ts:230` — `The veins` fact now says *"The plain `wall` tiles around
  them cannot be cut — only an ore face can."*
- `src/levels/world-4/w4-05.ts:235` — `Fuel` fact gains *"An action the tank cannot pay for does
  not happen: the shift ends where the bot is standing."*
- `src/levels/world-4/w4-05.ts:315` — `docs` gains `'fuel'`. The level unlocks `fuel` as hardware
  and the level is *about* the tank, but its manual page was not among the ones the work order
  puts in front of the player.

**For the user:**

- **Decision — `bot-recovered` (finding 3).** It cannot fail on this level. Three options:
  1. **Delete it.** Two objectives (`ore-quota`, `end-on-lift`) already describe the job, and the
     brief's own sentence is "Bring back 5 ore and end the run standing on the lift" — the third
     objective is not in the brief at all.
  2. **Make it mean something**: fail it when the run ended with an `out-of-fuel` failure. That
     matches the words on the card ("in one piece") and turns the level's real failure mode into a
     reported objective instead of a bare runtime error. It needs an objective that can see the
     run's failure code, which `ObjectiveContext` does not currently carry.
  3. Leave it as narrative dressing.

  My recommendation is **(1)**. It is currently a green tick that says the bot came back safe on a
  level where a stranded bot produces a runtime error and no verdict at all — a tick that is
  reassuring and untrue is worse than no tick. If you take (1), `died()` in `objectives.ts` becomes
  unreferenced and should go with it.
- **Decision — the star's divergence withholds the true figure.** `unfiled` returns
  `expected: 'a different figure'` for a mispriced trip, and the comment above it says the figure
  is the whole star. §11.6 ("naming the value is information the player is owed") argues for
  showing it. Against showing it: with five seeds and a divergence that names the target each run,
  a player could in principle assemble a lookup table (though tanks 798 and 798 collide on seeds 2
  and 4, so `fuel()` alone is not a usable key). My recommendation is to **leave it**, because the
  four failure modes *are* already separated and that is where the real legibility win is — but
  note the asymmetry with `w4-04`, which refuses to name the best order yet does report its cost.
  If you want symmetry, report the true move count and rely on the seed list to refuse a table.
- **Observation, no action needed.** Seed 1 draws the *tightest* tank of the five as a fraction of
  a full survey (51%, vs 58% on seed 5), so §15 rule 1's "seed 1 is the friendliest instance" is
  inverted on the level's own scarce resource. In practice it does not bite — the reference lands
  seed 1 with 36% of the tank unspent — so I did not touch the draw. Worth knowing if you ever
  tighten par.

---

## Verification

- `npx vitest run src/levels/world-4` — **22 passed, 0 failed** (`bonus.test.ts` 13,
  `divergence.test.ts` 9). No World 4 test needed changing: none of them encoded a defect.
- `npx eslint src/levels/world-4/w4-0{1,2,4,5}.ts` — clean.
- `npx tsc --noEmit` — clean.
- `npx prettier --check` on the four files — clean. Note `caves.ts`, `objectives.ts` and one
  pre-existing line in `w4-05.ts` (`:197`, untouched by me) fail Prettier and did so before this
  audit; left alone.

**Pre-existing / not mine, in the wider suite:**

- `src/levels/world-5/__tests__/divergence.test.ts` › *"in-order names which upstream was still
  off, and when"* fails (`sub-1` vs `sub-12`). World 5, untouched by this audit.
- `src/levels/__tests__/levels.test.ts` › *"briefs stay short enough that a second-language reader
  finishes them"* fails at an average of **60.88** brief words per level against a cap of 60. This
  is a **campaign-wide shared budget**, and it is not World 4's: with my changes in place, World 4's
  four briefs are byte-identical to `main`. The overage comes from brief edits landing concurrently
  in World 5 and World 8. Whoever finishes last will have to trim ~30 words from somewhere, or the
  cap needs raising — flagging it because it will read as "the last agent broke it".
