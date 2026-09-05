# FIX-FINALE — the two defects in `w8-05`

Written against `docs/PLAYTEST-VETERAN.md` §6. Both defects it names are closed. Nothing here
lowers what the finale asks of a player; two things raise it.

Verification at the end of the work: `npx tsc --noEmit` clean, `npm run build` clean,
`npx vitest run` **1436 passed / 47 files**, `npx eslint .` **1 error, pre-existing**
(`src/levels/world-5/__solutions__/w5-01.ts:32` — the `react-hooks/rules-of-hooks` plugin thinks
the player API's `use()` is a React hook; it is not, it is on main, and it is not mine).

---

## Defect 1 — `power()` worked from anywhere on the map

### What was actually wrong

`Sim.power(botId, machineId, state)` resolves the machine by id and sets its state, at a flat
cost, with no reference to where the bot is standing. On `w8-05` that meant:

```ts
for (const i of topologicalOrder) power(`sub-${i}`, 'on');
```

closed **both** grid objectives in sixteen ticks from inside the muster bay. The playtester found
it on run 3. It also — unreported, and worse in kind — defeated the airlock: `power('airlock',
'open')` reaches `Sim.applyMachineLinks`, which repaints a `door`'s `links` on any state change,
so the two gate tiles turned from `Wall` to `Floor` for two ticks and no travel. That deleted
decision #6 on the tester's own list ("a sealed airlock must be treated as a wall by the
planner") as well as the grid third.

`w8-03` had the identical hole and nobody had reported it: `grid-live` read final state,
`precedence-held` reads the use log but is vacuously true when nothing was ever `use`d, and
`within-shift` is trivial for a program that never walks. A `power` loop closed `w8-03` outright.

### Why the obvious fix was not available

I checked every caller before touching the semantics. `power` is used by **`w5-02`, `w5-03`,
`w5-05`** and by nothing else, and all three depend on the remote behaviour:

- **`w5-02` Continuity Test** is a binary search over **200 relays**. The reference probes eight
  of them and patches one; **the bot never moves**. Requiring physical presence does not make
  `w5-02` harder, it makes it a different level — the information game is the level.
- **`w5-03` Order of Operations** prices `power` at 2 ticks flat and puts walking distance in a
  *bonus* (`tight-order`), which only works because the required path costs nothing to walk.
- **`w5-05` Blackout** energises by id after `link`ing, on one clock.

So a global "presence required" rule (or a distance-proportional cost) breaks three shipped
levels and their pars, and would have to be paid for by rewriting `w5-02` entirely. That is a
bigger change than the defect justifies, and it would remove a level the curriculum wants.

### What I did instead

**The level marks the machine, not the command.** New reserved `Machine.vars` key, `manual`:

```ts
export const MANUAL_ONLY = 'manual';   // src/engine/types.ts
```

`Sim.power` refuses any machine publishing `vars.manual === 1` — it returns `false`, logs the act
with `ok: false`, and charges the full tick and fuel price, exactly like an unknown id. `use()`
is unaffected, and `use()` is positional, so the only way to move a manual machine is to stand on
its tile.

It lives in `vars` rather than in a field of its own for one reason: `vars` is the only channel
`probe` publishes (`MachineView.vars` is a copy of `Machine.vars`). A rule the player cannot read
before they break it is not a rule, it is a trap. `probe("sub-3").vars.manual` is `1`, the brief
says so in a paragraph of its own, and `api-spec.ts`'s `power` doc now says so too.

Marked manual:

| level | machines | effect |
|---|---|---|
| `w8-05` | every `sub-N`, plus `airlock` | the grid is a routing problem again; the airlock is a wall until somebody pays the nine-stage toll on foot |
| `w8-03` | every `sub-N` | the level is the parallel schedule it was written to be |

World 5 publishes no `manual` flag anywhere, so it is byte-for-byte unaffected. There is a test
that says so (`finale.test.ts` → "World 5 still operates its grid from the desk").

### The brief now matches the code

`w8-05`'s brief has always said *"The audit reads the use log."* It did not. `gridTally` read
`machine.state === 'on'`. It now requires **both** — the station finished `on` *and* somebody's
successful `use` is in the log. Same in `w8-03`'s `allEnergised`. With `manual` in place the two
readings agree today; both are there so the sentence in the brief stays true whatever a later
edit does to the flags.

### Proof the exploit is dead

`src/levels/__tests__/finale.test.ts` runs the tester's own program — read `probe("desk")`, read
every station's `deps`, topologically order them, `power(id, 'on')` — through the real
`runSeed` path on all three seeds and asserts:

- every `power` act event came back `ok: false`;
- `grid-online` is unmet at `0 / N`;
- the run does not pass;
- the objective's `divergence` names the station: `sub-0 at (12, 9) · want on, switched by a
  use() at the tile · got never used; no bot stood on it`.

A second test fires `power('airlock','open')` and asserts both gate tiles are still `Wall`.

### Consequence worth naming

`dispatch(deps, costs, fleet)` — the Repository composite `w8-03` teaches and `w8-05` bills for —
now has something to hold up. It was a brick with nothing on it.

---

## Defect 2 — the failure surface was whack-a-mole

The tester's diagnosis, which I took as given: the finale is not too hard, it is
**undiagnosable**. Five objectives × seven seeds → one bit. Everything below is feedback, not
difficulty, with one exception that is flagged.

### 2a. Independent per-objective credit

Three changes, at three different lifetimes.

**Per run — `src/runtime/aggregate.ts`.** The aggregate verdict used to be *the first failing
seed's objective column*, verbatim. On a three-seed level that reports objectives as met that
another seed missed. Each objective is now taken from **the worst seed for that objective** — the
first run that missed it, with that run's own progress — and from the reported seed when every
seed held it. Same rule the file already applied to the score, applied per row instead of per
run. `worstPerObjective()`.

**Banked — `LevelProgress.objectives?: string[]`.** New optional field, unioned in
`mergeProgress`, rescued in `rescueLevels`, no save-version bump (it is additive and optional,
like `bestChars`). It records the required objective ids that held **on every seed at once**,
recorded on *every* run, pass or fail — a failed run costs nothing but time (DESIGN §7.1), and an
objective that held on all three layouts is closed work whatever its neighbour did.
`objectivesOnEverySeed()` in `src/game/score.ts` computes it; `store.recordResult` banks it.

**Shown — `ObjectiveRail`.** A `closed on every seed — 3 / 5` row under `targets`, read from the
save rather than from the last run, so a player who closes the grid, the quota and the form and
then breaks the deadline still sees three closed rather than a blank rail.

Asserted by `finale.test.ts` → "an idle run banks the objectives it did hold on every seed" and
"the credit survives the run that earned it". A program that only prints reports **2 of 5 met**
(`precedence`, `deadline`) and banks exactly those two, instead of a bare zero.

### 2b. Per-seed visibility

`PerSeedResult.objectives` was already on the wire; nothing rendered it.

- **A chip strip per objective row** in the run report: one chip per seed, green where that
  objective held, red where it did not (`SeedStrip`, `.seed-chip`). Colour is never the only
  carrier — the strip ships an `sr-only` sentence, "still open on seeds 4, 7".
- **The seeds section now names the objective**, not just the verdict: `seed 4 · failed · 806
  ticks · Deliver every crate to its own class depot (11/15)`.
- **A header count**: `objectives — 2/5 closed on every seed`.

Run 11 of the playtest — "fixed seed 2 and broke seed 1 with three lines" — is now two chips
changing colour on two named rows.

This composes with the parallel `divergence` work rather than duplicating it: divergence answers
*what* diverged and where in the world; the strip answers *which objective on which seed*. Both
are on the report and they sit on different rows of it. I opted two more `w8-05` objectives into
`divergence` while I was there (`grid-online` names the dark station and why; `file-form` says
whether KD-0001-T is in a hold, on the ground at (x, y), or nowhere), and gave `w8-03`'s
`grid-live` the same treatment.

### 2c. Three seeds, not seven

`w8-05` seeds went from `[1,2,3,4,5,6,7]` to **`[1, 4, 7]`**. The three kept, and why each earns
its place under CURRICULUM §15.5 ("never author a seed whose only distinction is different
numbers"):

| seed | shape | fleet / stations / crates | the decision it tests |
|---|---|---|---|
| **1** | branching DAG | 6 / 8 / 12 | The general case, and the **teaching seed** (§15.2): smallest grid, smallest quota, the layout where a player's first honest plan nearly works. |
| **4** | **pure chain** | 7 / 10 / 15 | The **degenerate case** §15.3 requires. The grid cannot be parallelised at all, so a fleet that queues behind it wastes the shift; the answer is to spend the fleet on crates and let one electrician walk the chain. |
| **7** | branching DAG | **6 / 12 / 20** | The **squeeze**. Same six bots as seed 1 against half again the stations and nearly twice the crates. This is the seed where fuel, not scheduling, is what runs out — the coupling the tester called "the best idea in `w8-05`". |

Cut, and why each was padding:

- **2** (8 bots / 9 stations / 14 crates, branching) and **3** (10 / 10 / 16, branching) — seed 1
  and seed 7 with the dials nudged. Same topology, same constraint regime, no new decision.
- **5** (12 bots / 11 stations / 20 crates, branching) — the *most* generous fleet against seed
  7's quota. Strictly easier than 7 on every axis that matters; it was the seed that made the
  reference expensive without making it think.
- **6** ("flat" DAG — almost every station independent) — the other degenerate, and the wrong one
  to keep. "Everything is ready at tick 0" removes a constraint; the chain adds one. Between two
  degenerates, keep the one that makes the player notice something. `w8-03` still ships a flat
  seed (its seed 3), so the idea is not lost from the campaign.

The `'flat'` DAG shape and the `Instance.cipherKey` / `Instance.decoys` fields are gone from the
level. Terrain and object placement for seeds 1, 4 and 7 are **unchanged** — the cut draws
happened after every `take()` call, so the maps the tester reconnoitred are the same maps.

### 2d. The signal thread, cut

The tester asked for it to go: it duplicates World 6, and on seed 1 the shift was 0 and no packet
was corrupt, so a paragraph of brief was decoration.

I cut the **puzzle** and kept the **channel**, deliberately, and this is the one judgement call
in the document worth arguing with:

- **Gone:** the 95-key Caesar shift (`cipherKey`), the corrupt-packet decoys (`decoys`,
  `decoyPacket`), `findKey` from the Repository requirement table and from the brief, the
  cipher hint, and the key-search block from both halves of the reference solution.
- **Kept:** `receive()` returning `KD4470|CRATE|x|y|kind` in clear. Split on `|`, read the
  fields. Six lines, no puzzle.

**Why not cut it outright.** Crates and the form are ground items, not machines, so `probe` does
not publish them. Deleting the manifest would have forced discovery of 12–20 crates by walking a
48×40 unknown map — that is not removing a thread, that is adding the most expensive one in the
level, and it would have destroyed the thing the tester asked to preserve verbatim: *"free and
total reconnaissance… it makes the finale about planning, not discovery"*. Cutting the cipher
removes the World 6 duplication and the decision-free grind; keeping the manifest keeps the
opening the tester praised.

Objective count is unchanged at five. The signal was never an objective — cutting it removes
work, not credit.

### 2e. Budget labels that name neither a number nor a unit

Flagged for `w8-03`, `w8-04`, `w8-05`, `w5-03`. Two things were wrong at once: the label named no
unit, so `budgets.ts` could not attribute a meter, and the `progress()` clamp threw away the only
number that mattered on a failure (a 60-tile overrun against an allowance of 44 reported
`44 / 44` and an empty box).

**`src/game/budgets.ts`** learns one general rule: a label ending `…, in <plural noun>` is
**declaring its own unit**, and an objective that declares a unit is a budget even when no meter
in the run reproduces it. The plural is load-bearing — `printedSequence`'s "Report 3 lines, in
order" ends in the same shape and must stay a tick-box (there is a test for exactly that, and it
still passes). Any level authored later gets the readout for free by saying what it counts.

| level | objective | was | now |
|---|---|---|---|
| `w8-05` | `deadline` | "Finish inside the shift" | "Finish inside the shift, in ticks" → `917 / 3000 ticks` |
| `w8-05` | `under-budget` (bonus) | binary, no numbers at all | "…, in ticks" + `progress()` → a real gauge |
| `w8-03` | `within-shift` | "…before the shift deadline" | "…inside the shift's deadline, in ticks" |
| `w8-03` | `tight-shift` (bonus) | "…theoretical minimum plus travel" | "Beat the shift's theoretical minimum plus travel, in ticks" |
| `w8-04` | `no-resurvey` (bonus) | "Walk almost nothing the plan already described" | "Stay inside the allowance for ground the plan already described, in tiles", **unclamped** |
| `w5-03` | `tight-order` (bonus) | "…inside the reported allowance" | "…inside the reported allowance, in steps", **unclamped** |

### 2f. The two binary precedence objectives

`w8-05`'s `precedence` and `w8-03`'s `precedence-held` failed without saying where. The parallel
agent gave both a `divergence` (which station jumped which feeder, and by how many ticks). I gave
both a `progress()` on top: **stations that came up in order, out of all of them**. A schedule
that is one edge wrong now reads `11 / 12` rather than the same empty box as one that is entirely
wrong. `w8-05`'s `precedenceHolds`/`firstBreach` were refactored onto a shared `breachesIn()`
list so the two readings cannot disagree — the same shape `w8-03` already had.

---

## Things I did not do, and why

**Par is unchanged at 1300 ticks — flagging it rather than moving it.** The two most expensive
instances (seeds 3 and 5) went with the cull, so the reference now costs 560–977 ticks across
both halves on the surviving seeds, against 560–1130 across seven. Gold is therefore slightly
looser relative to the reference than it was. DESIGN §5 would put par near 880. I did not move it
because par is the medal line on a level nobody has closed yet, and tightening it silently while
removing seeds is the sort of change that should be a decision rather than a side effect. **If
you want the bar held exactly where it was, `par.ticks: 1050` is the number**; the comment in
`w8-05.ts` points here.

**I did not make the finale shorter.** The tester's own correction (§6.9, "H3 CONFIRMED, with a
correction") is that code volume is not the problem. Five objectives, six bots minimum, the fuel
coupling, the airlock toll and the form leg are all intact, and the grid third that `power` was
deleting is back — which makes the level *more* demanding than the one that was played, not less.

**I did not restructure the level.** See below.

**Character count.** Nothing in `src/` scores, ranks, compares or displays it; `countChars`,
`Verdict.stats.chars`, `par.chars` and `LevelProgress.bestChars` are the save-compatibility
carriers DESIGN §7 explicitly retains, and the player-facing readouts were removed on main before
I merged. **Two stale claims remain in `docs/CURRICULUM.md` and they are yours, not mine:**
- §10, `w8-05` `world`: "A hard deadline, a fuel budget **and a character budget**."
- §10, `w8-05` `bonus`: "(b) come in a third under the **character budget**."

`w8-05` ships no such bonus and never did; the three stars are `under-budget`,
`fleet-utilisation` and `no-blocked-moves`. Two lines to delete.

**Other CURRICULUM drift I introduced deliberately** (orchestrator's call whether to reconcile):
- §10 `w8-05` `seeds`: `[1..7]` → now `[1, 4, 7]`, with `anti-hardcode` "Seven seeds across six
  independent axes" no longer true.
- §10 `w8-05` `world`: "An inbound enciphered, partly-corrupt signal stream" → now a clear
  manifest.
- §10 `w8-05` `size`: "the shipped reference source is 500 lines exactly" → 487 lines.

---

## Does `w8-05` want a deeper restructure? Yes, and here is the honest version.

The tester's §6.7 verdict — the finale *accumulates* rather than *integrates* — is still true
after this pass, and nothing in this pass could have fixed it. Concretely, after the cut:

- The grid and the quota share the fleet and the fuel, and now also share the routing. That is
  real integration and it got **stronger** here: closing the `power` hole means the electricians
  and the haulers are drawing on the same bots, the same fuel and the same depots.
- The form is still a bolt-on. It is one errand: pick up a chip, pay the airlock toll, walk east,
  drop it. It shares the pathfinder with everything else and nothing else. Its *narrative* weight
  is the whole point of the level (NARRATIVE §3.3), and its *mechanical* weight is one `pickup`
  and one `drop`.
- The deadline is not a fifth objective, it is a scalar over the other four.

If someone opens this level again, the change I would argue for is **making the form leg
contingent on the grid**: the airlock draws from the grid, so it will not cycle until the
substation that feeds it is on. That would turn the two independent halves into a precedence
constraint across them, cost about ten lines of `build`, add no new API, and make the ending
something the player unlocks by finishing the work rather than something they walk to in parallel
with it.

The tester also asked for **a checkpoint on the airlock leg**, because the narrative payoff sits
behind a robustness problem and it is the only part of the game a player cannot see any other
way. I did not add one: a checkpoint is a save-state concept the engine does not have (a run is
one program, start to finish — DESIGN §3), and inventing one for a single level is a larger
change than this brief. The cheapest thing in that direction that *does* fit the engine is a
**bonus objective for reaching the chamber at all**, so the last leg is visibly scored rather
than all-or-nothing. That is a design call, not a bug fix, so it is here rather than in the code.

---

## Files touched

| file | why |
|---|---|
| `src/engine/types.ts` | `MANUAL_ONLY` |
| `src/engine/index.ts` | export it |
| `src/engine/sim.ts` | `power` refuses a manual machine |
| `src/runtime/api-spec.ts` | `power`'s doc says so (edited with the coordinator's later permission) |
| `src/runtime/aggregate.ts` | worst-seed-per-objective |
| `src/game/budgets.ts` | declared units |
| `src/game/save.ts` | `LevelProgress.objectives` |
| `src/game/score.ts` | `objectivesOnEverySeed` |
| `src/game/store.ts` | banks it |
| `src/ui/screens/Results.tsx` | seed chips, seed rows that name the objective, header count |
| `src/ui/panels/ObjectiveRail.tsx` | `closed on every seed` |
| `src/ui/styles/app.css` | `.seed-chip`, `.objective__seeds`, `.rail__label-note`, `.seed-row__outstanding` |
| `src/levels/world-8/w8-05.ts` | manual machines, three seeds, manifest not cipher, use-log audit, labels, divergences |
| `src/levels/world-8/__solutions__/w8-05.ts` | the band section, both halves |
| `src/levels/world-8/w8-03.ts` | manual stations, use-log audit, labels, precedence progress, divergence |
| `src/levels/world-8/w8-04.ts` | `no-resurvey` label + unclamped progress |
| `src/levels/world-5/w5-03.ts` | `tight-order` label + unclamped progress |
| `src/meta/unlock.ts` | `findKey` no longer required by `w8-05` |
| `src/levels/__tests__/finale.test.ts` | new — both defects pinned |

Nothing under `src/levels/world-1` … `world-3` was touched. Nothing is committed.
