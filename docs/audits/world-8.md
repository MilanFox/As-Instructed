# Perfect-information audit — World 8 (The Kessler Contract)

Consolidated report for `w8-01` … `w8-05`, audited against `docs/DESIGN.md` §11 (all nine clauses,
including the late additions §11.7 three legs, §11.8 hidden-drawn-as-hidden and §11.9 a stated
limit is a mechanic) and `docs/CURRICULUM.md` §2 / §10 / §11 / §15, per `docs/audits/BRIEF.md`.

Three agent batches produced this: `w8-01`/`w8-02` (also written up in `world-8a.md`), `w8-04`
(originally `world-8b.w8-04.part.md`, now folded in and that file deleted) and `w8-03`/`w8-05`.

Baseline at `f4c1972`: `npx vitest run src/levels/world-8` 48/48 pass, `npx tsc --noEmit` clean,
`npx eslint src/levels/world-8` clean.

---


## w8-01 — Efficiency Audit

**Verdict:** fixed

**Findings**

1. **`scan()`'s fact card priced it wrong.** The card read "Costs ticks, not beams." `scan` costs
   neither: `DEFAULT_COSTS` has no `scan` entry (engine/costs.ts — "Sensing is free"), and
   `Sim.scan` records its sense under the name `scan`, which the level's
   `withinSenses('look', 16)` does not count. The intended meaning — the ticks are in walking to
   the five tiles it can reach — was not what it said. On a level whose entire difficulty is
   trading ticks against beams, a fact card that overprices the free alternative is a
   player-facing lie about a graded axis. Reworded.
2. **The carry limit surfaced only on a failed harvest.** The card said "Carries a fixed number of
   crops. The number changes between shifts" — and nothing said how to learn the number. There is
   no `capacity()` in `api-spec.ts`; the campaign states the rule in the `pickup` doc ("nothing on
   the bot reports its own limit"), which this level does not list in `docs`. Its own `harvest` doc
   does cover the full-arms case, so the information was reachable, but the mechanic a player meets
   first is a harvest that silently returns null and bills 2 ticks. §11.1. Card extended to name it.
   Cost check: paying for that discovery instead of reading `sim.capacity()` (which the reference
   does, and which no player can call) costs 2–6 ticks — measured 117/148/162/155 against the
   reference's 115/142/160/151, all far inside the 215-tick shift. Not a feasibility problem.

**Checked and clean**

- **The §11 exception holds.** DESIGN §11 allows `w8-01` to ration re-sensing "because the brief
  says so", and it does: "Sensor readings are now costed too. Both budgets are hard, and missing
  either one is a fail." The numbers appear on the objective labels (16 beams, 215 ticks) and in
  the starter comment. Nothing about the field is withheld — every tile is readable by a beam — so
  the level leans on the exception only for the ration itself, which is stated. Mechanic untouched.
- **Seed 1 is not degenerate for the bonus.** Ripe-per-row by seed: `[1,1,1,2,2,1,0,0,1,3]`,
  `[1,0,4,1,1,2,2,0,0,2]`, `[1,1,1,1,2,1,0,2,1,1]`, `[2,4,4,0,1,0,0,0,0,0]`. Seed 1's answer is a
  unique row 9 at 3; nothing about it also satisfies a lazy rule (not row 0, not the silo's row,
  not the crop count, not a tie). Seeds 3 and 4 exercise ties, which `heaviestRows` accepts.
- **The `far` draw on seed 4 is a number, not a rule.** It only pulls the crops to the far corner;
  the level is about the same thing. Reference clears it at 151/215.
- **Tests encode no defect.** `bonus.test.ts` already refuses a memorised line and a right count
  under a guessed row; `divergence.test.ts` asserts the "wrong row is priced against that row"
  behaviour, which is §11.6-correct (names the value, withholds the reason).

**Changed**

- `src/levels/world-8/w8-01.ts:298` — `scan()` fact card reworded: free, off the beam budget, five
  tiles, the price is the walk.
- `src/levels/world-8/w8-01.ts:304` — "The bot" fact card extended: nothing reports the limit, a
  harvest into full arms comes back empty and still costs its ticks.

**For the user**

- The reference solution calls `sim.capacity(botId)`, an engine method with no player-facing
  binding, while its published `source` finds the limit with a failed harvest. The two therefore
  cost different numbers of ticks, and par is derived from the cheaper one. It does not bite here
  (50+ ticks of headroom on every seed), but if par is ever tightened, the reference is measuring
  a program no player can write. Recommend aligning `run` with `source`; not done, because it
  moves the number par is read from and that is out of scope per the brief.
- `look`'s default range is 8 and the field is 12 plantable columns wide, so a player who casts
  `look(Dir.East)` without a range under-counts every row and fails the bonus with a divergence
  that reads as an arithmetic slip. It is stated in the `look` doc the level ships, so it is not a
  §11 violation — but it is the one place here where the right idea fails for a reason the fact
  cards do not repeat. Would take one clause on the "One beam" card if you want it closed.

## w8-02 — Full Stack

**Verdict:** fixed, with one decision left for you (par)

**Findings**

1. **"Sighted" is graded off the movement trace, not off looking.** `ship-while-you-look` deadlines
   on `sightingTick(ctx, landmarks)` (shared.ts:626), which reconstructs line of sight from every
   tile the bot *stood on*, four rays, range 64, stopping at opaque rock — regardless of whether
   the run cast a single beam. So the star's clock is set by where the bot walked, and a run that
   sensed less than the reference is graded as though it had sensed everything. No player-facing
   text defined the word. A player who hits it reads "tick 376, the last sighting — expected 8
   crates already on their bays, received 3" and cannot reproduce the 376. §11.1. Added a `Sighted`
   fact card stating the rule outright, including the "beam or no beam" half.
2. **`probe(id)` was described as needing a prior sighting; it does not.** The card read "`probe(id)`
   reports it from anywhere *after that*". `Sim.probe` (sim.ts:318) resolves any id in the world,
   free, ungated — and `api-bindings.ts:184` calls probing ids you have not seen "the idiom the
   World 5 briefs already teach". Since bay ids are `depot-<class>` over a six-class pool the facts
   name, six free probes hand a player every bay coordinate at tick 0. The card told an honest
   player the opposite. Reworded to say what is true, and to say what it is still not worth
   (a coordinate is not a route through unmapped rock).
3. **Two player-facing claims about the tick budget are false.** The fact card said "Par does not
   allow a full survey and then a delivery round" and hint 3 repeated it. Measured: a full-survey-
   then-deliver program built on the same `KnownMap`/`follow` machinery as the reference costs
   **448 / 555 / 581 / 449 / 519** ticks against par **700** — gold on every seed, and on seed 3 it
   beats the interleaved reference (581 vs 632). The strategy the level tells the player is
   unaffordable is in fact the cheaper one on some seeds. What actually enforces the lesson is the
   star, which that program does lose. Both statements rewritten to point at the star, which is the
   thing that really grades it.
4. **The brief advertised a manifest the player never receives.** "Shipping hold a manifest for it.
   It lists quantities" — the player gets no copy and no count, which the starter's own TODO says
   ("the crates down here are not on any list"). The bonus grades "half the crates", so the total
   is load-bearing and its unknowability is the reason the star has to be played greedily. Brief
   extended to say the copy is not coming and the floor has to be counted on site.

**Checked and clean**

- Reference: 319 / 518 / 632 / 465 / 450 ticks, passes and earns the star on all five seeds.
- `depot-sorted`'s divergence names a wrong-bay drop before a short class, and both name a tile or
  a bay the run already touched. §11.6-correct.
- The `clustered` seed (2) changes the layout, not the rules. Fair under §11.4.
- The arms' capacity is already stated properly here ("no gauge. A `pickup` that takes fewer than
  the tile offered means full") — this is the card `w8-01` was missing, and I matched its wording.

**Changed**

- `src/levels/world-8/w8-02.ts:227` — brief: no manifest copy, count it on site.
- `src/levels/world-8/w8-02.ts:241` — `A bay` fact: `probe` is ungated.
- `src/levels/world-8/w8-02.ts:255` — new `Sighted` fact defining the star's clock.
- `src/levels/world-8/w8-02.ts:262` — `The budget` fact: false par claim replaced by the star's
  actual condition.
- `src/levels/world-8/w8-02.ts:326` — hint 3: same correction.

**For the user**

1. **Par is 700 and it should probably be ~420.** CURRICULUM §2 rule 4 wants par at reference −10%
   from the *median* seed; the reference's median is 465, so rule 4 gives ≈419. At 700 both the
   reference (worst 632) and the naive survey-first program (worst 581) take gold on every seed, so
   the medal ladder on this level currently carries no information. Recommend dropping par to ~470
   (which keeps the reference at gold on its median and makes seed 3 fight for it) or to 419 per the
   letter of rule 4. Out of scope for me — it moves par. If you do move it, finding 3's original
   wording becomes true again and the fact card should go back.
2. **The class-to-bay mapping is not really "discoverable only by looking".** The level's own head
   comment (w8-02.ts:212–214) claims it is, and six free probes disprove it. I left the comment
   alone. If you want the claim to hold, that is an engine change (gate `probe` on discovery), which
   would ripple through World 5's taught idiom — I would not do it. The alternative is to accept
   that bays are free and crates are not, which is what the level actually plays like and what the
   reworded card now says.

---

## w8-03 — The Grid Goes Down

**Verdict:** fixed

**Findings**

1. **The shift was a graded budget the player could not read.** `within-shift` fails the work
   order on `ctx.trace.endTick > deadlineFor(ctx.initialWorld)`, and `deadlineFor` is a function of
   the layout — `(criticalChain + lanes) * (USE_COST + meanHop) + meanHop`. It varies enormously
   across the seed table (measured **160 / 359 / 138 / 150 / 207** ticks), so it is not a constant
   a player can learn once. Nothing published it. The brief said only "Finance have allocated one
   shift"; the number itself existed nowhere in the fiction, nowhere on the board and nowhere in
   the API. A player met it by overrunning — DESIGN §11.1 and §11.7 leg 3 at once, and precisely
   the trap `MANUAL_ONLY`'s own doc comment in `engine/types.ts:130` argues against ("a rule the
   player cannot read before they break it is not a rule, it is a trap"). **Fixed** — the desk now
   publishes `vars.shift`, and a new `The shift` fact names it and says what sets it. Verified the
   posted number equals the graded one on every seed (build posts `deadlineFor(world)` before the
   desk exists; `criticalChain`, `meanHop` and `lanes` all filter on the `sub-` prefix or read
   `world.bots`, so the desk's own presence cannot change it — checked 160/359/138/150/207 posted
   against 160/359/138/150/207 graded).

2. **The survey bonus counts `probe` calls while a fact card called probing free.** The bonus is
   `withinSenses('probe', 26)`. The `A station` card read "`probe(id)` reads any machine from
   anywhere, **for nothing**." That is true in ticks and false in the currency the bonus is scored
   in, and the only place the campaign said so was **hint 4** ("Reading a station to find out
   whether it came up yet tells you nothing you did not already know") — a graded rule whose sole
   statement is a hint, DESIGN §11.3. A player who takes "for nothing" at face value polls the grid
   and loses the star with no idea which sentence lied. **Fixed** — the card now says probing costs
   no ticks *and* that the calls are counted, fleet-wide rather than per bot — worth saying on a
   level that fields four to eight bots and gives them 26 calls between them. §11.9 is otherwise
   satisfied: the limit itself was already stated, in the bonus label.

3. **The bonus label did not name the thing it counts.** "Plan the restart on 26 **reads** or
   fewer" — "reads" is not an API word, and `look`/`scan` are also reads (they are simply not
   counted here, and not in `docs`). **Fixed** — now "26 `probe()` calls or fewer".

4. **Nothing said the grid was static.** The whole point of the level is that the schedule can be
   computed once, before anybody moves; the only statement of it was hint 4 again. **Fixed** — the
   `The plain` card now says the layout and the feeder lists are fixed before the shift starts and
   the only thing that changes while you run is a station state.

**Checked and clean**

- Seed 1 is representative, not degenerate (§11.5). 14 stations / 4 bots / 4 layers sits between
  seed 2's single 14-long chain and seed 3's three flat bands. The two lazy answers both fail it:
  one bot in index order needs ~250 ticks against a 160-tick shift, and ignoring precedence
  breaches `precedence-held` on a 4-layer grid. Seed 3's old `layers: 1` degeneracy (a fan with no
  edges, on which `precedence-held` was *vacuously true* and `deadlineFor` handed out the tightest
  shift in the set) was already caught and fixed before this audit — the reasoning is preserved in
  the `LAYOUTS` comment.
- All three divergences name a thing, not a verdict (§11.6): `grid-live` gives the station id, its
  tile and why (`never used; no bot stood on it` vs `off — used an even number of times`);
  `precedence-held` gives `sub-N · feeder sub-M` with the legal tick and the tick taken;
  `within-shift` names the last bot to stop and both ticks.
- Every mechanic has all three legs (§11.7). The dependency graph is *painted on the board* in
  `Terrain.Cable` — `build` carves a line from each feeder tile to each station tile, and
  `render/art/deepsite.ts:1280` and `render/art/signal.ts:529` both draw `Terrain.Cable` — as well
  as being published in `vars.deps`/`dep0…`. `USE_COST` is 2, matches `DEFAULT_COSTS.use` in
  `engine/costs.ts:38`, and the `Energising` card says "Two ticks".
- `MANUAL_ONLY` is set on every substation, and the level is honest about it without needing a
  card: `power` is not in `docs`, the `Energising` card says stand on the tile and `use()`, and if
  a player tries `power()` anyway the engine throws a message that names the tile and points at
  `probe(id).vars.manual`.
- The `w8-03 grades and fails on one axis` test in `divergence.test.ts:260` already pins the thing
  that made the shift dangerous — the silver cut has to sit under the shift on every seed. It does
  (par 84, silver cut 85, shifts 138–359).
- The reference (`__solutions__/w8-03.ts`) reads the desk for the count and every station once,
  never polls, and never reads anything the facts do not publish. It does not read `vars.shift` —
  correctly, since the shift is a wall to stay under, not an input to the schedule.
- Not on the Frustration Watch (CURRICULUM §11 lists `w4-04`, `w5-05`, `w6-04`, `w7-03` only).

**Changed**

- `src/levels/world-8/w8-03.ts` `build` — the crew is now added *before* the desk, and the desk's
  `vars` gained `shift: deadlineFor(world)`; a comment records why the order matters.
- `src/levels/world-8/w8-03.ts` facts — `The desk` names `vars.shift`; new `The shift` card; `A
  station` corrects "for nothing"; `The plain` states that the layout is fixed.
- `src/levels/world-8/w8-03.ts` `within-shift` label — "Finish the whole grid inside the shift's
  deadline" → "…inside the shift the desk posts", so the label says where to read it.
- `src/levels/world-8/w8-03.ts` bonus label — "26 reads or fewer" → "26 `probe()` calls or fewer".
- `src/levels/world-8/w8-03.ts` starter comment — now mentions the shift alongside the count.

**For the user**

1. **Station index order is already a topological order, and nothing intends that.** `build`
   assigns indices band by band (`bands[band]` takes the next consecutive block) and a station's
   feeders are only ever drawn from the band above it, so `sub-i`'s feeders always have index
   `< i` on **every** seed. A run that energises strictly `sub-0, sub-1, … sub-n` therefore never
   breaches `precedence-held` without reading `vars.deps` at all. It does not break the level — the
   shift still refuses a single-file walk, so the player still has to read the graph to know what
   may run *in parallel*, which is what the level teaches (CURRICULUM §10: "a topological order is
   a partial order"). But it is a free half-answer, and it is an accident of the generator rather
   than a decision. Closing it means shuffling the id-to-site assignment after the bands are built,
   which reshuffles every board and therefore re-measures par — out of scope for an audit.
   Recommend closing it if par is ever revisited.
2. **Machine `vars` have no visual form anywhere.** `grep -rn vars src/render/ src/ui/` finds
   nothing outside `render/__dev__/scenes.ts`. For w8-03 this is survivable — the dependency edges
   are drawn as cable, and the shift has a form as the `within-shift` progress meter — but the
   *numbers* (`deps`, `shift`, `stations`) are `probe`-only. Reported per the brief, not fixed;
   `src/render/` and `src/ui/` belong to another agent, whose own write-up
   (`docs/audits/renderer.md`, the `vars` section) reaches the same conclusion from the other side
   and names `w8-03:335,372` explicitly. The two reports agree; no action needed from me.

---

## w8-04 — Signal from 4470

**Verdict:** fixed (seven defects, including the seed-1 degeneracy the first pass left open; two
latent items and one deletion candidate reported, not done)

**Findings:**

1. **The `What changed` fact was false on two of the five seeds.** It read "Between a sixth and a
   third of the sections cross tunnel that has since come down." Collapses are counted in *legs*,
   not sections (`DRIFTS[n].stale`; `layout` lines 210–221), and the shipped spread is 0/11, 2/12,
   3/12, 5/12, 3/11 — **none** on seed 1 and **five in twelve (42%)** on seed 4, both outside the
   stated band. CURRICULUM §10 *requires* the heavy-drift seed to exceed a third, so the card
   contradicted the curriculum as well as the build. A player hits it on seed 1 by hunting for a
   fall that is not there, and on seed 4 by budgeting for at most a third and meeting two more.
   **Fixed.**

2. **Seed 1 shipped `cipherKey: 0`, so its packets arrived in clear.** `encodeCaesar` with shift 0
   is the identity (`shared.ts:250–262`). A run that never searched for a key reads the traffic
   straight off the band, sees `KD4470|SEC|0|7E6S|123`, and files `plan 0 11` — the bonus's entire
   premise skipped, on the friendliest seed. DESIGN §11.5 exactly: a wrong general rule ("the
   traffic is plain, the shift is 0") passing seed 1 and failing 2–5. **Fixed** — seed 1 now ships
   shift 58. The change is inert for ticks (`decode` costs 0) and for geometry (`cipherKey` reaches
   only `encodeCaesar`; neither rng chain reads it), so par is untouched. Verified: the reference,
   which scores all 95 candidates, still earns the star on every seed.

3. **A test asserted that degeneracy as acceptable.** `bonus.test.ts` `'a guessed shift is refused,
   and no one shift is right on every layout'` iterated the guess list `[0, 13, 41, 77, 94]` —
   exactly the five shipped keys — and asserted only that no guess wins on *every* seed. It
   therefore quietly encoded that a memorised `plan 0 11` earns the star outright on seed 1. Same
   shape as `w3-01`'s "a memorised figure is right on the full siding". **Fixed** — guess list
   updated, plus a new test pinning shift 0 as refused on all five seeds.

4. **The six-move detour cost was a hidden constant.** `build` asserts at lines 412–420 that a way
   round is exactly six moves dearer than the leg it replaces, and par 116 leans on it — but
   nothing player-facing said so. The nearest statement was hint 4 ("a short local problem"), i.e.
   a premise living in a hint (§11.3). **Fixed** — now named in the `What changed` fact.

5. **The brief asked for a return trip that is not graded.** "Bring the form back up" against a
   predicate (`holdsForm`) that only reads `inventoryCount(bots[0], Chip)`. The reference ends on
   the `pickup` at the locker, so par 116 contains no walk back; a player who takes the memo
   literally roughly doubles their ticks and loses the medal for reading carefully. `bot-intact`
   had the same problem in its label ("Bring the bot **back** in one piece"; the predicate is only
   `alive === true`). **Fixed** — brief reworded (word-neutral, see verification), and the
   condition stated where DESIGN §5 wants it, in the objective label: "Finish the shift holding
   KD-0001-T, wherever the bot is standing".

6. **`probe` was named in a fact but absent from `docs`.** The `The lockers` fact tells the player
   to use `probe(id)`; the docs panel listed `decode/receive/look/canMove/pickup`. **Fixed.**

7. **Seed 1 was the zero-drift seed and the lazy answer passed it. This is the signature defect of
   the whole audit and it is now fixed.** `DRIFTS[1].stale === 0`, so "decode the plan, follow it
   literally, never check" recovered the form on seed 1 — the honest general solution and a lazy
   one both clearing the seed every player starts on. `src/levels/__tests__/levels.test.ts`
   asserted it outright, `expect(outcomes[0]).toBe(true)` for `literalPlanFollower`: a test pinning
   the defect as intended, exactly `w3-01`'s "a memorised figure is right on the full siding".
   CURRICULUM §15.3 is explicit — the degenerate case "is never seed 1".

   **Fixed by swapping the `DRIFTS` rows for seeds 1 and 2**, which was cheaper than the earlier
   agent's `stale: 1` proposal and turned out not to be a par change at all. The seed *set* is
   unchanged, so seed 4 is still the slowest instance and par is still measured off it. Measured
   before: reference **83 / 97 / 104 / 116 / 100**, par 116. Measured after: **102 / 86 / 104 /
   116 / 100** — worst seed still 116, all objectives met on all five seeds, gold on all five.
   `literalPlanFollower` before: passes 1, fails 2–5. After: **fails seed 1, clears only seed 2**
   (the zero-drift instance), which keeps it a naive *reconciler* rather than a broken program.
   The `DRIFTS` doc comment was updated to say which seed is zero-drift and why it is not first,
   and `levels.test.ts` was rewritten to assert the new shape — modelled on the identical fix
   another agent made to `w6-05` in the same file. w8-04 is **not** on the Frustration Watch
   (§11 lists `w4-04`, `w5-05`, `w6-04`, `w7-03` only).

8. **`bot-intact` cannot fail (deletion candidate; reported, not done).** The only lethal terrain
   in the engine is `Terrain.Pit` (`engine/world.ts:102`, `sim.ts:371`), and this level lays only
   Rock, Floor and Depot — the `A move into rock` fact confirms a bad move merely costs a tick. So
   the objective always passes: hidden weight of zero, DESIGN §11.2. Its `died()` divergence is
   reachable only via the synthetic `die` event in `divergence.test.ts:328–354`.

9. **Latent, low: decoy checksums are never checked for collision.** `w8-04.ts:392–397` writes a
   decoy trailer as `(rng.int(1, 999) + 1) % 1000` with no assertion that it differs from the
   decoy body's true checksum. A collision would make a decoy validate, inflate a wrong key's
   score, and — because the reference does last-write-wins `sections.set` on a decoy index drawn
   from the real range — overwrite a real section and corrupt the leg count. Safe on the five
   frozen seeds only. `driftFor`'s fallback for an unlisted seed is the single constant
   `cipherKey: 29`.

10. **Latent, low: `holdsForm` reads `bots[0]` while `formStanding` scans every bot.** With one bot
    on the site they cannot diverge; they would if the level ever gained a second.

**Changed:**

- `src/levels/world-8/w8-04.ts:90` — seed 1 `cipherKey: 0` → `58`.
- `src/levels/world-8/w8-04.ts:83–93` — extended the existing `DRIFTS` comment to record why no
  seed ships shift 0.
- `src/levels/world-8/w8-04.ts` brief — "Bring the form back up. The run ends with the form in the
  bot." → "Bring the form up. The run ends once it is in the bot." (deliberately the same word
  count, see verification).
- `src/levels/world-8/w8-04.ts` `What changed` fact — the false sixth-to-a-third range replaced by
  the real spread ("none of it on a good one, five groups of moves in twelve on the worst") and the
  six-move detour cost named.
- `src/levels/world-8/w8-04.ts` `form-recovered` label — now "Finish the shift holding KD-0001-T,
  wherever the bot is standing" (call reflowed to multi-line for the longer label).
- `src/levels/world-8/w8-04.ts` `bot-intact` label — "Bring the bot back in one piece" → "Finish
  the shift with the bot in one piece".
- `src/levels/world-8/w8-04.ts` `docs` — gained `probe`.
- `src/levels/world-8/__tests__/bonus.test.ts:159` — guess list `[0, 13, 41, 77, 94]` →
  `[13, 41, 58, 77, 94]`.
- `src/levels/world-8/__tests__/bonus.test.ts` — new test `'the shift a run that never decoded
  would file is refused on every seed'`, with a comment recording why.
- *(second pass, finding 7)* `src/levels/world-8/w8-04.ts` `DRIFTS` — seeds 1 and 2 swapped rows,
  so seed 1 is now `{ legs: 12, stale: 2, cipherKey: 41, … }` and seed 2 is the zero-drift
  `{ legs: 11, stale: 0, cipherKey: 58, … }`. The doc comment above the table was extended to say
  which seed is zero-drift, why it is not first, and that the seed set is unchanged so par is not.
- *(second pass)* `src/levels/__tests__/levels.test.ts` — `'w8-04: following the filed plan
  literally fails on a drifted seed'` → `'…fails first and clears only the zero-drift seed'`,
  `expect(outcomes[0]).toBe(true)` → `toBe(false)` plus `expect(outcomes.filter(Boolean)).toEqual
  ([true])`, with a comment citing §11.5/§15.3. This is the test that pinned the defect as
  intended.

Nothing changed in `__solutions__/w8-04.ts` (it derives the key by scoring all 95 candidates, so it
is indifferent to which key a seed ships) or in `divergence.test.ts`.

**Verification:**

- `npx vitest run src/levels/world-8` — **4 files, 51 tests, all passing.** (Two of those files,
  `zz-probe.test.ts` and `zz-w805-scratch.test.ts`, are another agent's scratch tests, not mine.)
- `npx eslint src/levels/world-8/w8-04.ts src/levels/world-8/__tests__/bonus.test.ts` — clean.
- `npx tsc --noEmit` — clean.
- `npx vitest run src/runtime/__tests__/reference-solutions.test.ts` — 84 passing.
- `npx vitest run src/levels/__tests__/levels.test.ts` — one failure, **not mine**:
  `'briefs stay short enough that a second-language reader finishes them'` asserts
  `total / LEVELS.length <= 60`. Measured on a clean `git archive HEAD` copy the campaign sits at
  **exactly 60.0** (1980 words over 33 levels) — the budget has no headroom at all, so *any* audit
  that adds a word to any brief breaks it collectively. w8-04's brief is 100 words both before and
  after my edit, so it contributes nothing to the overage. **This needs coordinating across the
  audit: whoever assembles the final report should either trim briefs elsewhere or move the limit.**

*Second-pass verification (after the `DRIFTS` swap):* `npx vitest run src/levels/world-8
src/levels/__tests__/levels.test.ts` — **3 files, 279 tests, all passing**, including the brief
word-budget assertion, which some other batch has since brought back inside its limit. The two
`zz-*` scratch test files are gone from `src/levels/world-8/__tests__/`.

**For the user:**

- **Seed 1's zero drift (finding 7) is closed, not open.** The first pass left it as a decision on
  the grounds that it would move par. It does not: swapping the two `DRIFTS` rows leaves the seed
  set identical, and the worst seed (4, at 116 ticks) is untouched, so par 116 still holds and the
  reference still takes gold on all five. Nothing here needs your sign-off; it is recorded because
  it changes which instance a player meets first, and that is a design-visible change.
- **`bot-intact` (finding 8):** I would keep it. It costs nothing, reads as a sensible shift rule,
  and its divergence would be the only thing explaining a death if a future edit put a hazard on
  the site. But by the letter of §11.2 it is hidden weight of zero, so it is flagged.
- **Finding 9:** a one-line rejection in `build` (redraw the decoy trailer while it equals the
  body's real checksum) would make the level safe for seeds outside the frozen five. Cheap, but it
  touches the generator's rng draw order and would reshuffle every seed's board — hence not done.

**Incident (not a w8-04 finding):** at ~10:07 something ran `git reset` (reflog: `f4c1972 HEAD@{0}:
reset: moving to HEAD`) and wiped the whole working tree, including this audit's edits and every
other concurrent agent's changes to w3-01, w4-*, w5-03, w5-04, w6-*, w7-* and w8-01/w8-02. I
re-applied my own w8-04 and `bonus.test.ts` edits; the other worlds' work is gone and needs redoing.

---

## w8-05 — The Kessler Contract

**Verdict:** fixed (with two decisions left for the user, below)

### Findings

**1. `feederIndex` head comment said "2, 9 and 4 feeders"; the real ancestry is 2, 9 and 5.**
Not player-facing, but it is the comment that justifies the airlock's coupling. Measured by
building each seed and walking the DAG upward from the `fed:` station: seed 1 `sub-6` (2
ancestors), seed 4 `sub-9` (9), seed 7 `sub-7` (5). Already corrected by the previous agent at
`src/levels/world-8/w8-05.ts:126`; **verified correct**.

**2. The shift was an unstated graded limit.** `deadline` grades `trace.endTick <=
deadlineFor(initialWorld)`, and nothing in the brief or facts named a number. Already closed by
the previous agent with the `The shift` fact (`src/levels/world-8/w8-05.ts:990-994`). **Verified
correct and exact**: `deadlineFor` returns `Math.max(SHIFT_FLOOR, …)` and the formula lands at
1928 + chain·20 / 2478 / 2808 + chain·20 on seeds 1/4/7, i.e. below the 3000 floor on all three,
so 3000 *is* the shift on every seed the level ships. The comparison is `<=`, so "fails if the
last bot stops **after** tick 3000" is the precise reading. It also correctly matches
`overranBy`'s divergence, which reports `tick 3200` against `tick 3000`.

**3. §11.7 second leg — the feeder DAG has no form on the board.** REPORT ONLY (`src/render` is
another agent's). `precedence` is the objective this level is built around, and `vars.deps` /
`dep0` / `dep1` exist only in `probe()`. `drawMachines` (`src/render/renderer.ts:1408-1444`)
passes only `kind`, `state`, `powered`, `facing` to the paint layer — no renderer code reads
machine `vars`, so every `sub-N` is the identical pylon and which station feeds which is
invisible. Same for the `fed:sub-N` key that couples the airlock to the grid: `grep FED_BY
src/render` finds nothing, so the single most load-bearing edge on the board is undrawn.
*Recommended:* a feeder-link overlay driven by `vars.deps`/`dep0`/`dep1` and `FED_BY`.

**4. §11.7 — the airlock's stage is not drawn.** The airlock cycles `sealed,1..8,open`, but every
art direction collapses machine state to one boolean (`powered = state==='on'||'open'||'busy'`,
`src/render/renderer.ts:1421-1422`; atlas fallback `machineTileName` returns `feature.door` for
all nine non-open states, `src/render/tiles.ts:513-514`). Stage `8` and `sealed` draw identically.
The *code* leg is fine — `probe("airlock").state` and `vars.stages` are both live, and the fact
card now tells the player to read the state rather than count — so this is a legibility gap, not a
solvability one. *Recommended:* a stage readout on any machine whose `cycle.length > 2`.

**5. §11.7 — `vars.manual` has no form on the board.** A hand-operated `sub-N` is drawn with the
same `MachineKind.Node` sprite World 5 uses for the `power()`-able ones. Closed on the text side
(the `Energising` fact now names `probe(id).vars.manual`), open on the board side. REPORT ONLY.

**6. §11.7 — every `Sink` on the board is the same hopper.** `depot-ore`, `depot-ice`,
`depot-scrap`, `depot-part`, `depot-cell`, `slot-charter` and `slot-renewals` are all
`MachineKind.Sink` and all paint as one silo (`src/render/art/deepsite.ts:2606-2650`;
`src/render/tiles.ts:522-523`). `vars.lane` is never read by the renderer. Crate *items* do have
distinct silhouettes, so the player can see the crate but not which hopper wants it — and cannot
tell the Charter registry from the renewals tray, which is the one *choice* the ending offers.
REPORT ONLY. *Recommended:* sink identity from `machine.id`/`vars.lane`, not from `kind`.

**7. §11.8 — the radio queue is the design doc's own example of a known unknown, and it is not
drawn.** The band lives in `tile.meta.rx` / `rxNext` (`src/levels/world-8/shared.ts:322`); the
only `tile.meta` reads in `src/render` are conveyor facing and cable bend. The mast is drawn, "how
many lines are left on it" is not. REPORT ONLY.

**8. w8-05 is the only board large enough to fall through the renderer's detail thresholds.**
48x40 fits to roughly 8 CSS px/tile at the default zoom (`src/render/camera.ts:148-172` against
the monitor geometry in `src/ui/desk/monitor/geometry.ts:31`). `drawMark` bails below `20*dpr`
(`src/render/overlays.ts:283-291`), `MACHINE_DETAIL_TILE_PX = 20` and `ITEM_DETAIL_TILE_PX = 16`
(`src/render/art/deepsite.ts:2273`, `:3264-3266`). So on first load the `KD-0001-T`,
`charter registry` and `renewals tray` marks are not drawn *at all*, and item stacks lose their
count badges. Next-largest board in the game is 36x28, so this is w8-05's alone. And when marks do
draw they truncate to three characters plus an ellipsis (`overlays.ts:294`), so the two slots read
`cha…` / `ren…`. REPORT ONLY.

**9. The hover readout drops everything except the coordinate.** `describeTile` builds
`machine {id,kind,state}`, `mark` and `items` (`src/render/overlays.ts:404-467`), but its only
consumer prints `x, y · terrain` (`src/ui/desk/monitor/feed.ts:36-45`). There is no inspector
panel and no legend anywhere in `src/ui`, so hover is not a fallback for findings 3-7 — it does
not even surface machine state. REPORT ONLY.

**10. The campaign's closing *choice* is the least legible thing on the board.** The brief makes
`slot-charter` and `slot-renewals` mean two different endings ("the engagement concludes" vs "the
Contract runs on, with you as signatory"). On the board they are two identical `MachineKind.Sink`
hoppers three tiles apart (finding 6), distinguished only by a tile `mark` that (a) is not drawn
at all at the default fit zoom for a 48x40 board and (b) truncates to `cha…` / `ren…` when it is
(finding 8). A player pathing to "the slot" cannot tell which ending they are walking to without
`probe()`. FIXED on the text side already — the `The form` fact tells the player `probe` gives
both positions — but the board leg is missing. REPORT ONLY.

**11. FIXED — "depot" named two different things in adjacent fact cards.** `Terrain.Depot` is the
fuel pump `refuel()` wants; `depot-<class>` is a crate sink machine. The `Fuel` and `The quota`
cards used the same word for both, and the renderer draws them completely differently (a floor
stencil vs a hopper), so a player who tried `refuel()` on `depot-ore` would learn the difference
by burning two ticks. Also folded in the two things `quotaTally` grades that were nowhere stated:
that delivery means *dropping on the sink's own tile*, and that a crate on the wrong class's tile
does not count (`quotaTally` takes `itemsOnTile(sink.at, thatSink'sKind)` only).
**Changed:** `src/levels/world-8/w8-05.ts:985` (`The quota`) and `:1000` (`Fuel`).

**12. FIXED — the `name-the-hold` bonus title graded more than it named.** Title read "Name the
substation your order left standing longest"; `longestHoldFiled` requires the line to carry the
station **and** the tick count, and refuses a right station under a wrong figure (there is a test
for exactly that, `__tests__/bonus.test.ts:229`). Its sibling `mind-the-gate` already named both
halves in its title. **Changed:** `src/levels/world-8/w8-05.ts:1154`.

**13. FIXED — `docs` did not list the API the facts and hints tell the player to use.** The list
was `['fuel','refuel','power','use','receive','probe']`, but the `Fuel` fact sends the player to
`scan()`/`look()` and hint 7 tells them to "read the clock as you throw each one" — and both
bonuses are unanswerable without `clock()`. `docs` only orders the Manual's jump list (it does not
restrict the API surface, `src/ui/desk/furniture/Manual.tsx:219-232`), so this is a signposting
fix, not a mechanic change. **Changed:** `src/levels/world-8/w8-05.ts:1187`.

**14. `precedence` can be satisfied without ever reading `vars.deps` — on every seed.** REPORT
ONLY (this is a generator change that moves the level's difficulty). `build` only ever draws a
feeder with a *lower index* than the station it feeds: chain seeds use `deps.push([i - 1])`
(`src/levels/world-8/w8-05.ts:333`), and the wide shape draws `rng.int(0, i - 1)` and, for the
two-feeder case, clamps the second with `(first + 1) % i` (`:339-345`). Station index order is
therefore *always* a topological order. `for (const i of range(stations)) use(sub-i)` passes both
`grid-online` and `precedence` on seeds 1, 4 and 7 without a single `probe` of `deps`/`dep0`/
`dep1`, and the 3000-tick shift is generous enough for one bot to walk them in order.
This is not a perfect-information defect — nothing is hidden, and CURRICULUM §10 explicitly wants
bronze reachable by a slow honest program. It is a *teaching* defect: the finale's headline
mechanic is optional. **Recommendation:** shuffle the station ids after the DAG is drawn (a
permutation applied to the `sub-N` labels and to `dep0`/`dep1`) so index order stops being a
topological order. That is a one-function change with no effect on par, budget or unlock order,
but it makes the level materially harder and so is the orchestrator's call, not mine.

**15. Checked and clean: the two engine budgets are not hidden constraints.**
`budget: { maxTicks: 16000, maxOps: 8_000_000 }` (`:1069`) *raises* `DEFAULT_MAX_OPS` (2,000,000)
and sits at 5x the 3000-tick shift, so neither can bite before the stated `deadline` does. They
are a harness net, not a rule the player has to be told.

**16. Checked and clean: bot capacity (6) is not exposed, and does not need to be.** `pickup`'s
API doc states the limit outright — "nothing on the bot reports its own limit, so a return smaller
than `count` is how that limit is found" (`src/runtime/api-spec.ts:348`) — which makes it a stated
limit under DESIGN §11.9 rather than hidden state. It is also not load-bearing here: no class ever
holds more than 5 crates on any shipped seed (4/4/4 on seed 1, 4/4/4/3 on seed 4, 5/5/5/5 on seed
7), so a program that assumes a capacity of 1 still closes the quota.

**17. FIXED — the biggest "learn only by failing" on the level: `precedence` is graded against
per-bot clocks, and no fact said so.** `breachesIn` (`:631-651`), `holdsIn` (`:695-719`) and
`gateSlack` (`:827-833`) all read `UseRecord.t`/`.done`, which `shared.ts:543-556` lifts from the
trace, which `sim.ts:635-636` stamps with **the acting bot's own `bot.clock`**. Bots run on
independent clocks (`clock()`'s own doc says so; `endTick = max(bot.clock)`). So on a fleet that
has not squared its clocks, bot A throwing `sub-0` at *its* tick 400 and bot B throwing `sub-1` at
*its* tick 120 is a `precedence` breach even though the program issued them in that order and the
world was correct at each `use`. The reference has to fence every DAG rank with `sync()`
(`__solutions__/w8-05.ts:380-382`, `:522-527`) and says so in its own comments; the player was
told none of it. A player who dispatches the grid across the fleet — the entire point of a
6-7 bot finale — fails for a reason no fact predicts.
**Changed:** `src/levels/world-8/w8-05.ts:975`, `The order rule` now ends "Every record in that
log carries the clock of the bot that made it, and each bot keeps its own — **before** here means
a lower tick, not an earlier line of your program." It states the rule without naming `sync()`;
working out the fence stays the puzzle (DESIGN §11.7's "the puzzle is not given away").

**18. FIXED — the two notes measure from opposite ends of the same event and the level never
priced the event.** `holdsIn` measures from the feeder's `record.done` (`t + dt` = throw + 1,
`:706-713`); `feederThrownAt` measures from `record.t` (throw + 0, `:808-815`). The reference
encodes exactly that asymmetry — `at + 1` for the hold, bare `poweredAt` for the gate
(`__solutions__/w8-05.ts:656`, `:665-667`). The facts distinguished them only by the verbs
"finishing" vs "thrown", and *nothing on the level said a station `use()` occupies a tick*. Worse,
`api-spec.ts:417` prices `use` at **2**, and only the level's `costs: { use: 1 }` override brings
it to 1 — a player reading the campaign doc rather than the per-level Manual entry computes `+2`
and misses the star, with `misreadGate` deliberately withholding the true number.
**Changed:** `src/levels/world-8/w8-05.ts:980` (`Energising` now states "A `use()` costs one tick
here, so a station **finishes** one tick after it is thrown"), `:1025` (`Hand-over note` bolds
**finishing** and adds that roots have no stand and that ties are both accepted), `:1030`
(`Gate note` pins "thrown" to the tick of the `use()`, not the tick it finished).

**19. FIXED — running out of fuel ends the run for the whole fleet, and the `Fuel` fact did not
say so.** `Sim.requireFuel` throws `OutOfFuelError` (`src/engine/sim.ts:1204-1207`), which
propagates out of the player's program: one dry bot fails the shift. Seed 7 is CURRICULUM §10's
"squeeze — fuel and not scheduling is what runs out", so this is that seed's whole subject.
**Changed:** `src/levels/world-8/w8-05.ts:1000` — "A bot that reaches zero does not stop on its
own — it ends the shift for the whole fleet."

**20. FIXED — `darkStation`'s divergence stated a rule that is not the rule.** It read "never
used; no bot stood on it", but `Sim.use(botId, dir?)` also works from the adjacent tile, which
`use`'s own API doc states. **Changed:** `src/levels/world-8/w8-05.ts:562` to "never used; no bot
worked this tile", and the `Energising` fact now reads "stand on it, or beside it and pass the
direction".

**21. NEEDS A DECISION — `gateSlack` is not a duration and I measured it going negative.** REPORT
ONLY (changing it changes what the bonus grades). `gateSlack` (`:827-833`) is
`gateMovedAt - feederThrownAt`, i.e. one bot's clock minus a *different* bot's clock.
`Sim.unfed` (`src/engine/sim.ts:676-681`) tests the **shared world**, not clocks, so a carrier
whose clock is behind the electrician's opens the gate at a lower tick number than the throw.

I drove this on seed 1 (probe written, run and deleted in one step): carrier walks to the airlock
first and parks at its tick 41; electrician then waits 600 and lights `sub-0 → sub-1 → sub-6`,
finishing at its tick 690; carrier then turns the handle nine times and the door opens.

```
carrier at (40,22) clock 41
sub-0 -> on at 629   sub-1 -> on at 657   sub-6 -> on at 690
first airlock use ok: true, carrier clock 42
airlock state open
feeder sub-6 thrownAt 689  gateMovedAt 41  slack -648
```

`readClaim` accepts a negative integer, so `gate sub-6 -648` is the graded-correct answer on that
run — while the bonus title says "how long it stood powered and shut" and the fact says "the ticks
between that substation being thrown and the gate first moving". Both describe a non-negative
wall-clock interval that this level does not have.

I closed the *information* half (finding 18: the `Gate note` fact now says both ticks are read off
the clock of whichever bot did it). The mechanic half is yours:
- **Recommended:** leave the arithmetic exactly as it is and let the wording carry it. The
  negative case only happens on a fleet that never squares its clocks, which is also a fleet that
  is about to fail `precedence`, so it self-corrects for anyone doing the level properly. Zero
  risk to par, the reference or the tests.
- **Alternative** (one line, but it changes the star): make `gateSlack` return `undefined` when
  `moved < powered`, so an unsynced fleet is told "there is no such interval" rather than handed a
  negative one. This is the honest reading of the bonus title, but it converts a passing exotic
  run into a failing one, so it is a mechanic change and I did not take it.

**22. REPORT — `shared.ts`'s own header is untrue of `drainAntenna`.** `shared.ts:36-37` promises
"Nothing in this group touches `sim.world`", but `drainAntenna` (`shared.ts:294-306`) reads
`tileAt(sim.world, antenna.at)`, `tile.meta['rx']` and `tile.meta['rxNext']` and calls
`sim.applyTileChange`. Information-wise it is clean — `Sim` has no `receive`, and the shim is
logic-identical to the real binding at `src/runtime/api-bindings.ts:98-115`, same zero price, same
return — so the *sentence* is what is wrong, not the code. Left alone because `shared.ts` is used
by every World 8 level and other agents are in this tree.

**23. REPORT — latent parity bug between the two halves of the reference (not a PI issue).** The
player-facing source's last sweep (`__solutions__/w8-05.ts:1128-1144`) calls `bot(id).use()` on
every station in the rank with **no** `probe(s.id).state === 'on'` guard and never records
`thrown`, where the `Sim` driver's equivalent (`:600-612`) goes through `light()`, which does
both. If that branch ever fires it can toggle a lit station back **off** (failing `grid-online`)
and lose the tick `held`/`gate` need. Verified it does not fire on seeds 1, 4 or 7, so nothing is
red today. Flagging rather than fixing: it is reference-solution logic, not level copy.

### Verdict

**fixed**, with two items left as decisions (findings 14 and 21).

### Changed

All in `src/levels/world-8/w8-05.ts`; nothing in `src/render/`, `src/ui/`, `shared.ts`, the
reference or the tests needed a change, and no test encoded a defect as intended.

| line | what |
|---|---|
| `:562` | `darkStation` divergence: "no bot stood on it" → "no bot worked this tile" (finding 20) |
| `:975` | `The order rule` fact: names the per-bot clock stamping on the use log (finding 17) |
| `:980` | `Energising` fact: `use(dir)` from beside the tile; a station `use()` costs one tick, so a station finishes one tick after it is thrown (findings 18, 20) |
| `:985` | `The quota` fact: drop on the sink's own tile, wrong-class tiles do not count, only the classes the desk counts are on site, these sinks are not the fuel-depot terrain (finding 11) |
| `:1000` | `Fuel` fact: "depot **tile** — the terrain, not a `depot-<class>` sink"; a dry bot ends the shift for the fleet (findings 11, 19) |
| `:1025` | `Hand-over note` fact: bolds **finishing**, states roots have no stand, states ties are both accepted (finding 18) |
| `:1030` | `Gate note` fact: pins "thrown" to the tick of the `use()`, and states both ticks are the clock of whichever bot did it (findings 18, 21) |
| `:1154` | `name-the-hold` bonus title now names the figure it grades as well as the station (finding 12) |
| `:1187` | `docs` gains `clock`, `scan`, `look` — the API the facts and hint 7 send the player to (finding 13) |

No words were added to `brief` (the level's brief is untouched by me), so w8-05 contributes nothing
to the campaign-wide brief word-budget assertion in `src/levels/__tests__/levels.test.ts:131`. That
assertion **passes** as of this run, as does the rest of that file (228/228) and all of
`src/levels/world-8` (51/51). `npx eslint src/levels/world-8/w8-05.ts` and `npx tsc --noEmit` are
both clean. No pre-existing failure was observed in anything I ran.

### For the user

1. **Finding 14 — the finale's headline mechanic is optional.** Station index order is always a
   topological order because `build` only ever draws a lower-indexed feeder. `for i in 0..N:
   use(sub-i)` passes both `grid-online` and `precedence` on all three seeds without probing
   `deps` once. *Recommendation:* permute the `sub-N` labels after the DAG is drawn. It touches no
   par, budget or unlock order, but it makes the level materially harder, so it is your call.
2. **Finding 21 — `gateSlack` can be negative** (measured: −648 on seed 1). *Recommendation:* leave
   the arithmetic alone; the wording fix in finding 18 makes it honest, and the negative case only
   arises on a fleet that is about to fail `precedence` anyway.
3. **Findings 3-10 are for the `src/render`/`src/ui` owner**, not for you to action here. The three
   worth prioritising, in order: (a) a feeder-link overlay for `vars.deps`/`dep0`/`dep1` and
   `FED_BY` — `precedence` is this level's subject and its edges are invisible; (b) sink identity
   from `machine.id`/`vars.lane` rather than `kind`, so the Charter registry and the renewals tray
   — the campaign's closing *choice* — stop being two identical hoppers; (c) the detail thresholds
   (`20*dpr` for marks, `MACHINE_DETAIL_TILE_PX`, `ITEM_DETAIL_TILE_PX`) versus this board's ~8
   CSS px/tile fit zoom, which is unique to w8-05 at 48x40 and silently drops the whole mark layer
   on load.
4. **Finding 23** — the player-facing half of the reference has a guard the `Sim` driver half has;
   dormant on all three seeds, but it is a live foot-gun if the seeds ever move.
5. **Not touched, and deliberately:** `par: { ticks: 1050 }` and the comment above it already flag
   the gold line as an open orchestrator decision. I left it exactly as found — it is a par change
   and out of my remit.

### Pre-existing uncommitted edits I verified

Everything the previous agent left in `w8-05.ts` is **correct**; I confirmed each against code
rather than reading it as plausible.

| edit | verified how |
|---|---|
| `:126` `feederIndex` docstring "2, 9 and **5** feeders" (was 4) | built each seed and walked the DAG up from the `fed:` station — ancestries are 2 (`sub-6`), 9 (`sub-9`), 5 (`sub-7`) |
| `:593` `sealedAirlock` "after N uses **that moved it**" | `useLog` (`shared.ts:546`) drops `ok:false`, and `Sim.use` pushes `ok:false` for an unfed machine (`sim.ts:643-653`) — so the count really is moves, not attempts |
| `:772-782` `misreadHold`'s three-way split (unknown id / never started / no feeder finished) | matches `holdsIn`'s three exit paths exactly; covered by two divergence tests, one of which the agent added |
| `:894-900` `misreadGate` "nobody threw `<feeder>`" | matches `gateSlack`'s two undefined branches |
| `:950-952` brief "nine turns of the handle" | `AIRLOCK_CYCLE` is 10 entries → `stages: 9` |
| `:964` `The desk` gains `crates` | `desk.vars` is `{ stations, classes, crates }` (`:392-397`) |
| `:980` `Energising` — manual, `power()` reaches none | `MANUAL_ONLY` is set on every station (`:349`); `Sim.power` throws `IllegalActionError` naming `vars.manual` (`sim.ts:716-724`) |
| `:990` `The band` — site-wide, free, one queue for the fleet | `receivePacket` finds the antenna globally with no distance test and moves a single shared `rxNext` cursor (`src/runtime/api-bindings.ts:98-115`); sensing has no cost entry (`src/engine/costs.ts`) |
| `:1000` `Fuel` — a depot on the desk's row, the rest scattered, none on the band | `HOME_DEPOT` is `(4, EXIT_ROW)` and `DESK_AT` is `(2, EXIT_ROW)`; `spec.depots` more are scattered; the packet stream carries only `CRATE`/`DEPOT`(class sink)/`FORM` (`:462-470`) |
| `:1006` `The airlock` — the cycle wraps, a tenth `use()` reseals | `Sim.use` advances `cycle[(i+1) % cycle.length]` (`sim.ts:660-661`) and the `links` repaint to Wall for any non-`open` state |
| `:1010` `What opens it` — "furthest down the grid, never a root" | `feederIndex` maximises depth, ties broken by proximity to the gate; measured depths 2/9/5, none of them a root |
| `:990-994` `The shift` — tick 3000 | `deadlineFor` = 3000 on all three seeds (`SHIFT_FLOOR` binds; the formula yields 2088/2478/2908), and the predicate is `endTick <= 3000`, so "fails if the last bot stops **after** 3000" is exact |
| `:1038` starter `NOTE(4470)` "wants a hand on the handle and our power" | consistent with `MANUAL_ONLY` + `FED_BY` both being set on the airlock (`:415`) |
| `__tests__/bonus.test.ts:311-334` the nearest-station guess test | correct, and its comment is honest that seed 1 cannot refuse the guess. I considered this against DESIGN §11.5 and let it stand: reading `fed:sub-N` off `probe("airlock").vars` is *easier* than computing the nearest station, and the `What opens it` fact states the rule outright, so seed 1 is not teaching a wrong rule — it merely fails to disprove one nobody has a reason to form |
| `__tests__/divergence.test.ts:490-505` the two `misreadHold` cases | both assert the strings the new code emits |

---

## Cross-level: one generator defect, twice, on the two levels the world is built around

`w8-03` and `w8-05` were audited independently, by different agents, and both landed on the same
finding without knowing the other had:

> `build` assigns station ids band by band and only ever draws a feeder from an already-numbered
> band, so `sub-i`'s feeders always have index `< i`. **Station index order is therefore always a
> topological order, on every seed of both levels.** A run that does `for (let i = 0; i < n; i++)
> use("sub-" + i)` satisfies `precedence-held` (w8-03) and `precedence` + `grid-online` (w8-05)
> without ever reading `vars.deps`.

CURRICULUM §10 gives w8-03 "a topological order is a *partial* order" and w8-05 "everything at
once". On both, the dependency graph is the subject, and on both a player can pass the ordering
objective without looking at it. It is not a §11 violation — nothing is hidden; the opposite, an
accidental gift — which is why neither agent fixed it. It survives as a *level* problem rather than
a *fatal* one only because the tick budget still refuses a single-file walk: on w8-03 one bot in
index order needs ~250 ticks against a 160-tick shift, so the graph still has to be read to know
what may run in **parallel**, which is the half of the lesson that actually bites.

**Recommendation:** permute the `sub-N` labels after the DAG is drawn, in both levels. In `w8-05`
that is free (no par, budget or unlock impact — the geometry is unchanged, only the names move). In
`w8-03` the ids are tied to the sites the rng dealt, so relabelling reshuffles the boards and par
would need re-measuring; do that one only if par is being revisited anyway.

Not done in either level: changing what a level teaches, and anything that moves par, are both
report-only under `docs/audits/BRIEF.md`.
