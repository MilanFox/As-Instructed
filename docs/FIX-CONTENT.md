# FIX-CONTENT — the unknown-id ruling, `w2-01`, the `use` requisition, and CURRICULUM drift

Written as the work happened; each section was appended when its unit finished.

---

## Job 1 — the unknown-id ruling

**The reading in the brief was right about the tangle and right about the direction, and the
deciding test gives a *different* answer for each of the three.** That is the finding, and it is
worth more than the fix.

### What the tangle actually was

`applyMachineChange` was doing two unrelated jobs. Its real one is *apply this mutation to this
machine and trace it*. Its accidental one was *bill a tick and log a refusal* — and the only way to
reach that second job was to hand it an id you already knew was wrong. Both World 6 verbs did
exactly that on purpose:

```ts
sim.applyMachineChange(botId, '', () => {}, cost);              // transmit, no antenna
sim.applyMachineChange(botId, from ? toId : fromId, () => {}, cost);  // link, bad id
```

So a level verb's **deliberate** refusal and a **genuinely broken** id arrived at the engine as the
same call, carrying the same `ok: false` act event, returning the same `false`. The engine could
not tell them apart, which is precisely why it could not say anything useful about either. Nothing
could be ruled on until they were separated.

`Sim.refuseMachineAct(botId, detail, cost)` now carries the billing job: it charges, pushes the same
`ok: false` act event, and returns nothing. Trace shape is unchanged, so replay is unchanged.

### The deciding test, applied

*Can the identical call succeed later in the same run?*

| | player-supplied id? | can it succeed later? | ruling |
|---|---|---|---|
| **`link(fromId, toId)`** | yes, both | **no** — nothing in the API builds a machine | **throws** |
| **`transmit(text)`** | **no — it takes no id at all** | **it depends, and that is the point** | **split** |
| **`applyMachineChange`** | **no — it is an engine extension point** | n/a — the caller is our code, not the player's | **throws, and its `boolean` goes** |

**`link` — throw.** Both arguments are player-supplied strings and neither can become valid. There
is a free pre-check and the game already teaches it: `w5-05`'s own fact table reads *"Substations
are `sub-1` upward; past the last one it returns `null`"* — that is `probe`, free, and it is the
documented idiom for finding where the ids stop. A `false` on a bad id is a branch that can never
flip, which is the exact defect `FIX-POWER` named. The refusal is charged and logged, then it
throws naming which of the two ids was wrong.

**`transmit` — the answer is different, and not because it is an exception.** `transmit` has no
unknown-id case, because it takes no id: it finds the antenna itself. Its two refusals are
different kinds of thing and were one `false`:

- **the antenna is not `on`** — a *state*. `power(id, "on")` clears it and the identical call then
  succeeds. This stays `false`, and the boolean stays honest. There is now a test that powers the
  antenna up and transmits again, so the succeed-later property is asserted rather than asserted-about.
- **there is no antenna on this work order at all** — permanent. Unlocks are cumulative, so
  `transmit` is in the player's hands on all of World 7, `w8-01` and `w8-02`, none of which install
  an antenna. That half throws.

So the unknown-id ruling does not reach `transmit`; a *different* rule reaches it — the same
`succeed later` test applied to two causes that were sharing one bit. This is `plant()`'s defect
(three causes, one bit) turning up in World 6, and it is the reason the brief was right that these
should not be made uniform.

**`applyMachineChange` — throws, but the program it accuses is ours.** Once `refuseMachineAct`
carries the deliberate refusals, the only way to arrive here with an unknown id is a *verb* that
computed one — level code or a binder, never a player literal. It throws `IllegalActionError`
naming the id, and its return type changed `boolean` → `void`, because after the split that boolean
could only ever be `true`. That is not a player-facing surface: the only callers are
`api-bindings.ts` and one naive-program fixture.

### The fourth one, which this reopened as the brief said it would

`power()`'s **unknown-id** branch still returned `false`. `FIX-POWER` split it out and kept it on
the reasoning that *"an unknown id is a state of the world"*. It is not one, and that ruling fails
its own test — nothing in the API creates a machine. Leaving it would have shipped a new
incoherence created by this very change: on `w5-03` and `w5-05`, where `power` and `link` take the
same substation ids from the same `probe` loop, `link("hub", "ghost")` would stop the run and
`power("ghost", "on")` would shrug. `power` now throws on an unknown id too, with the same
sentence shape.

`power` and `link` both keep their `boolean` return. That follows the precedent `FIX-POWER` set
hours earlier — *the reference page now says the run stops, instead of promising `false`* — rather
than inventing a second convention. `link`'s reference page and its worked example both changed;
the example used to be `if (link('node-1', 'node-2')) { … }`, teaching players to branch on
something that could not be false.

### What the player reads

Every one of them names the thing, names the free check, and says what to do — an unknown id is a
program bug, not a puzzle, so there is nothing to spoil:

> `link("node-1", "node-9"): no machine on this work order has the id "node-9". probe("node-9")`
> `returns null for an id that does not exist, and costs nothing — check it before you lay cable to it.`

> `power("ghost"): no machine on this work order has that id. probe("ghost") returns null for an id`
> `that does not exist, and costs nothing — check it before you act on it.`

> `transmit(): this work order has no antenna, so there is nothing here that can send. Drop the`
> `call — no command installs one, and the listening-post work orders that do carry one say so in`
> `the brief.`

No new plumbing: `runSeed` already catches `SimError`, `toRuntimeFailure` already maps `code`, the
console already renders the message and the failure already carries the player's own line number.
`src/ui/copy.ts`'s `illegal-action` flavour lines already point at the console, so **no UI change is
needed and none is proposed.**

### Difficulty

Unmoved for every correct program, and slightly *up* for one lazy pattern. No `par`, medal
threshold, budget, bonus or cost was touched. No reference solution changed — the only four tests
that went red were the four that pinned the old behaviour directly, which is itself the evidence
that no shipped content depended on it. The pattern that dies is the speculative sweep
(`for (i…) power('sub-'+i, 'on')` relying on `false` past the end), which the briefs already told
the player to write with `probe`.

### Files changed

| File | Change |
|---|---|
| `src/engine/sim.ts` | `refuseMachineAct` added. `applyMachineChange` throws on an unknown id, returns `void`. `power`'s unknown-id branch throws. Three doc comments rewritten — two described behaviour that is now gone. |
| `src/runtime/api-bindings.ts` | `linkMachines` and `transmitPayload` stop poison-pilling `applyMachineChange`; both use `refuseMachineAct` and then speak. `IllegalActionError` imported. |
| `src/runtime/api-spec.ts` | `link`, `transmit` and `power` reference pages restated; `link`'s example no longer branches on a constant. |
| `docs/ENGINE.md` §2 | The two-philosophies table did not cover machine ids or the antenna, and its extension-point note did not mention `refuseMachineAct`. |
| `src/engine/__tests__/sim.test.ts` | +2 tests, 2 rewritten. |
| `src/runtime/__tests__/api-bindings.test.ts` | +3 tests, 1 rewritten. |
| `src/runtime/__tests__/run-level.test.ts` | 1 rewritten — it asserted the old `false` end to end. |

**`docs/ENGINE.md` is not on this agent's ownership list.** It is not on the do-not-touch list
either, and `FIX-POWER` edited the same section as part of the same ruling; the edit is two blocks
and trivially revertible if you would rather it came up as a diff.

### Verification

`npx tsc --noEmit` silent. `npm run build` clean. `npx eslint src` — the one known
`w5-01.ts:32` false positive, nothing new. `npx vitest run` — **90 files / 1909 tests, all green**,
baseline 1904, so **+5**. Neither ratchet in `src/__tests__/` fired: `refuseMachineAct` is a class
method rather than a module export, and no confession lost its evidence.

---

## Job 2 — `w2-01` is cut

**It dies, and the deciding evidence is that its own par design never discriminated anybody.**

The brief's test is *"does it teach anything the surrounding levels do not?"* — and the honest
answer is **yes, one thing**: a running argmax, a best-so-far value carried with its position and
driven back to. No surviving reference solution does that again until `w4-05`. So the case for
cutting cannot be "it teaches nothing", and I am not going to pretend it is.

The case that carries it is this. `w2-01`'s whole shape is a discrimination: par 16 sits between
the walk-the-row-and-come-back answer (18 on the worst seed, silver) and the believe-the-instrument
answer (≤9, gold), and there is a star for the same idea. **Both playtesters took gold, the star,
and exact par 18/18, on their first run.** A discrimination that discriminates nobody is not a
lesson, it is a lap. The beginner named `w2-01 → w2-03` as the point where the pull first weakened
and docked the sawtooth specifically because *"w2-01 arguably reads as filler"*;
`docs/FIX-COMPRESSION.md` §2 ranked it the number-one remaining cut and declined **only on file
ownership**, which this pass has. That evidence has been sitting unactioned through two passes.

The one real objection is on the record and I have not buried it. CURRICULUM §1.1 states a rule:
*a new world's opener is where new hardware is taught in isolation, and a player fighting a hard
puzzle and an unfamiliar API learns neither.* `w2-01` was `scan`'s isolation level. **The isolation
was nominal.** `w2-02` already opened with `scan()` in its starter, already spent two of its five
hints on free sensing, and already carried `scan`'s reference page in its `docs` array — it was a
level using a verb it did not requisition. And the rule's own condition is a *hard* puzzle: `w2-02`
is a 3, golded first-run in under five minutes by both testers. **§1.1 now states World 2 as an
exception, in the document, with the three things that have to be measured before anyone else
claims it** — rather than leaving a rule the campaign quietly breaks.

`scan` moved to `w2-02`, the first level whose reference solution cannot run without it. That is a
better home than the one it left, and unlike the `use` requisition in Job 3 it needed no invention.

**What is lost, stated rather than waved away:** the argmax. It is recorded in §13's ledger note
and in `docs/CURRICULUM.md` §12 rather than quietly dropped. The *other* half — the early exit on a
provable bound — is not lost: `w2-05` teaches it three levels later and teaches it better, because
there the bound is a hopper the player can feel filling rather than an assertion in a fact table.

**What is gained, and it is the strongest argument and independent of content:** `w2-04` — the
level both testers named the best of the first twenty, and the only one that produced a re-solve —
moves to campaign position **4**, and `w2-05` with the Repository unlock to position **5 of 33**.

### The dependency sweep, run rather than reasoned

| Thing | Result |
|---|---|
| Unlock gates | `LevelDef` has no `requires` field. `isLevelUnlocked` walks `campaignOrder()` positionally and self-heals. Only `scan`'s `unlockedBy` moved. |
| Requisitions | `w2-01` handed over exactly one verb, `scan`, and it moved to a level that cannot be solved without it. No later level's only requisition card was here. `seenRequisitions` keys by verb, not level, so a player mid-campaign is not re-shown it. |
| The Repository | `LIBRARY_UNLOCK_LEVEL` is `w2-05`; `LIBRARY_REQUIREMENTS` names no World 2 level; `src/ui/library.ts` derives its regression targets from `campaignOrder()`. Nothing. |
| Save migration | **Run, not reasoned.** `save.test.ts`'s withdrawn-work-order suite now carries `w2-01` in `WITHDRAWN` and is green: a pre-cut save keeps its code, medal and stars, imports over another save without loss, and does not gate the order that followed. `levelIsGraded` already returns `true` for an unknown id precisely so a retired level keeps its recorded medal. No version bump; `MIGRATIONS` keys on version, not content. |
| The `34` count | `EXPECTED_INDICES` in `levels.test.ts`, plus prose in `solutions.ts`, `legibility.test.ts` and three docs. All moved to 33. |
| Achievements / score | Name no level id. `maxPoints` is a reduce over the live list; `review.test.ts`'s `51` is `closeFirst(17) × 3` and holds. |
| Campaign completability | **Run.** `reference-solutions.test.ts` drives all 33 reference solutions through the real worker on every seed and `levels.test.ts` scores each one gold. Green. |

### Files changed for the cut

Deleted `src/levels/world-2/w2-01.ts` and its `__solutions__` fixture. `world-2/index.ts`,
`api-spec.ts` (`scan.unlockedBy` → `w2-02`), `w2-02.ts` (`hardware` gains `scan`; **a `scan()`
facts row added**, because the requisition would otherwise hand over a verb the fact table never
defines). `naive.ts` loses `rowSweep`, which existed only as this level's lazy foil. Tests:
`levels.test.ts`, `solutions.ts`, `world-2.test.ts`, `world-2/divergence.test.ts`,
`reference-solutions.test.ts`, `ambient.test.ts`, `dts-typecheck.test.ts`, `errors.test.ts`,
`run-level.test.ts`, `save.test.ts`. Docs: `DESIGN.md` §6 and §11, `CURRICULUM.md` (below).

### The ratchet fired, exactly as the brief predicted — here is the diff

`src/__tests__/unused-exports.test.ts` is reserved, so this is handed up rather than applied.
**I applied it temporarily to prove it works, then restored the file and confirmed it byte-identical
to its committed state.** With it applied the whole suite is **90 files / 1885 tests, all green**;
without it, those same two tests are the only red in the tree.

```diff
   // --- Level-authoring helpers under `src/levels/*/shared.ts` and `caves.ts`. Bonus objectives
   // and terrain queries for levels that were folded away; `docs/FIX-BONUSES.md:86` still credits
-  // `noBlockedMoves` / `shortestRoute` to `w1-02` and `w1-04`, and neither level exists. ---
+  // `noBlockedMoves` / `shortestRoute` to `w1-02` and `w1-04`, and neither level exists, and the
+  // two `parked*` entries went the same way with `w2-01` (docs/FIX-CONTENT.md). ---
   'src/levels/world-1/shared.ts noBlockedMoves',
@@
   'src/levels/world-2/shared.ts noFailedHarvests',
+  'src/levels/world-2/shared.ts parkedOnRipestCrop',
+  'src/levels/world-2/shared.ts parkedWithoutOvershoot',
   'src/levels/world-4/caves.ts floorGraphSummary',
@@
 /** Exports whose only readers are tests, split as `[every file, files outside `__tests__`]`. */
-const KNOWN_TEST_ONLY: readonly [number, number] = [70, 32];
+const KNOWN_TEST_ONLY: readonly [number, number] = [69, 32];
```

The `70 → 69` is `rowSweep` leaving `naive.ts`. The two `KNOWN_DEAD` additions are the two objective
factories `w2-01` was the only reader of; `world-2/shared.ts` already keeps four other retired
factories the same way, and `world-1/shared.ts` keeps two from the previous cut, so this is the
established shape rather than a new one. **`confessed-invariants.test.ts` needed no change** — no
World 2 file registers a confession, and none lost its evidence.

---

## Job 3 — the `use` requisition moves to `w5-01`

**Moved, not invented for.** The claim was true and understated: **Worlds 1–4 place no machines at
all.** `use()` cannot return anything but `false` anywhere in the first four worlds, so `w3-04` was
not merely a level with no reason to use the verb — it was a level where the verb was provably
inert. It landed there because it belonged to the withdrawn `w3-03` and `w3-04` was the only
unowned World 3 file to park it in; `docs/CURRICULUM.md` already carried a `hardware note` saying
*"`use` has no job in this work order"*, and `docs/FIX-COMPRESSION.md` had named both fixes and
marked them **"Not done."**

**First level that actually needs it: `w5-01` Mains.** Its machines carry a `cycle`, its
`energised` objective requires every substation `on`, its `in-order` objective replays `use` events,
and `power` is not unlocked until `w5-02` — so `use` is the *only* way to satisfy it. Two of its
five facts rows are already about `use()` and its `docs` array already lists it.

**Nothing between them needs it, verified rather than assumed.** The four intervening levels are all
World 4 (`w4-01`, `w4-02`, `w4-04`, `w4-05`); none places a machine, none's reference solution calls
`use`, and none names it in `facts`, `docs` or hints.

`w3-04` is left with `hardware: []`, which 15 of the 33 levels already ship and which the brief
panel has copy for (*"Nothing new fitted for this order."*). Three of the four World 4 levels around
it are already empty.

Changed: `w3-04.ts`, `w5-01.ts`, `api-spec.ts` (`unlockedBy` **and** `world`, which
`api-spec.test.ts` pins to each other), `world-3.test.ts`'s hardware map, `DESIGN.md` §6, and
`CURRICULUM.md` (the World 3 and World 5 unlock lines, `w3-04`'s `hardware note` rewritten from a
complaint into a record).

**One thing found while there and fixed in the same edit, because leaving it would have been
choosing to ship a line I had just read:** `CURRICULUM.md` had `w5-01`'s and `w5-02`'s `hardware`
**swapped** — the doc gave `w5-01` `power` and `w5-02` `probe`, the code has `w5-01` `probe` and
`w5-02` `power`. `w5-01`'s `teaches` row described `power()` too, on a level that does not unlock
it, so correcting only the `hardware` token would have left a fresh contradiction two lines above
it. Both are now right.

### One diff for `src/ui/` — not applied, it is your file

`src/ui/copy.ts:232` is the requisition card for `use`, and its `opens` line is written for The
Sorting Yards. It now arrives in The Grid, on a level called *Mains*:

```diff
   use: {
     spec: 'Operates the machine on or beside the tile. Costs 2 ticks.',
-    opens: 'The yard has machines. The machines have never had anyone to press them.',
+    opens: 'The line has substations. Nobody has ever been sent out to throw one.',
   },
```

No test asserts this string (`api-spec.test.ts` polices only the `spec` field's types and prices),
so nothing is red without it — it is simply wrong on screen. `scan`'s card needed no change: its
line is world-agnostic and `w2-02` is in the same world.

---

## Job 4 — CURRICULUM drift

The code was the truth in every case but one, which is escalated below rather than fixed.

### `w2-01` — moot, and the doc was drifted in nine places anyway

Worth recording because it is evidence for Job 2's ruling rather than against it: the block
described a level that **harvested**, requisitioned `scan` *and* `harvest`, varied *"which tiles are
ripe"*, and carried a bonus (*"exactly as many harvest calls as there are ripe tiles"*) belonging to
a different objective entirely. Nothing in the shipped level harvested anything. A block that had
drifted that far from its level is a block nobody had read in a long time. Deleted, and the places
that counted or ordered around it were repaired: the header, the §1 curve chart and its per-world
means (W2 **4.5 → 5.3**, campaign **5.5 → 5.6**), §1.2's plateau bullet, §1.4's hour budget, §12's
withdrawn table (*"Three more"* → *"Four more"*), §13's ledger — retitled to **33 distinct ideas**,
row deleted, rows 5–34 renumbered — and §14's randomisation table.

### `w2-05` — ten disagreements, all corrected

The doc described **a different level**: *"two crops, one quota, one shift"* on a **14×10** grid with
a **silo in a corner**, graded by a quota that varies ±20%, taught as *"prioritisation under a hard
deadline"*, with a bonus on **unspent ticks**. Shipped: one crop and a **weed**, on **14×8** with a
12×6 field, **no silo, no depot and no return leg**, the quota **is** the hopper (7–9, drawn per
seed, readable only through `inventory()`), and the bonus is `tile-footprint` — a budget on the
**wheels**, at most 32 tiles. Its `naive-fails` row claimed a fixed route fails; the six-row
serpentine passes, and there is a test pinning that it passes and takes silver.

The correction rewrites `premise`, `teaches`, `heritage`, `world`, `varies`, `anti-hardcode`,
`naive-fails`, `generalize`, `size` and `bonus`. `hardware`, `seeds` and `par` were already right.

**And this is the one place where the doc describes something better than what shipped, so I stopped
and did not fix it.** `teaches` promised *"prioritisation under a hard deadline — you cannot visit
everything, so choose"*, and `world` promised a `maxTicks` reaching ~70% of the field. Shipped, the
shift is 84 ticks and the naive serpentine costs **58–68** — so **nothing has to be given up to
pass**, and the choosing only decides the medal. The `(synthesis)` tag and the 7/10 both lean on the
promised version. My correction takes the level as it is and drops the deadline framing, which keeps
the doc honest; making the doc true again means tightening `SHIFT` toward ~70, and **that is a
difficulty change on a settled level, which is yours and not mine.** Flagged, not touched.

Also noted for whoever owns seed policy, not drift: capacity draws 8, 9, 9, 9, 9 across the five
seeds, so §15.5's *"never author a seed whose only distinction is different numbers"* is close to
being breached on the one axis the level names.

### `w8-05` — eighteen disagreements, and the criticism after the bonus rework

Corrected: `assumes` **thirty-nine → thirty-two** previous levels (and the same arithmetic in
`note`); the `heritage` row, which claimed *"every heritage in this document, once"* including
**MST** and **recursive-descent parsing**, neither of which the level contains; `world`, which
described **6–12 bots** (it is 6–7), an *"enciphered, partly-corrupt"* stream the level's own facts
row denies, and a stream *"revealing part of the map and part of the graph"* which reveals neither —
while omitting the airlock, the form and the two slots, i.e. a fifth of the required objectives and
the whole narrative payoff, and omitting that **every station is hand-operated**, the largest
mechanical change since the playtest; `varies`, which claimed every axis independently drawn when
they are **three hand-authored instances**; `anti-hardcode`'s *"seven seeds"*; `naive-fails`, which
credited coordination to `send`/`recv` the reference does not call once; `seeds` **7 → 3**; `size`
**500 → 506**; §18's two `findKey` lines, stale since the band stopped being enciphered; and
`bonus`, three stars → one.

**Does *"accumulates rather than integrates"* still hold after the bonus rework? It is materially
weaker, and the honest verdict has moved from the tester's 2/5 to about 3/5 — but "accumulates" is
still the more accurate word, and what is left of it is now one nameable thing rather than a
general complaint.**

The tester's three specifics were: the signal thread gave coordinates but not routes; the grid
solution was fully independent (*"deleting it changes no other line"*); the crate tour and the form
run shared only the pathfinder.

- **The second is dead, and this is the real change.** Every substation is now `MANUAL_ONLY`, so
  `power()` is refused and `grid-online` requires a bot **standing on the tile** with a `use()` in
  the log. `grid-online` and `quota` now compete for the same six or seven bots, the same fuel pool
  and the same handful of refuel tiles. Deleting the grid code no longer changes nothing — it frees
  the whole fleet. **Seed 4 makes the coupling unavoidable**: a pure chain, where parallelising the
  grid buys nothing and the only correct answer is to put everybody else on crates while it runs.
  Solving the grid changes what you do about the quota. That is integration, it is new since the
  playtest, and a test pins it.
- **The first is gone as a thread** — no cipher, no corruption, ~20 lines and a data source.
- **The third is verbatim still true.** The form leg — read `FORM`, walk to the mark, pick up the
  chip, pay nine `use()` calls at the airlock, walk east, drop it — depends on the grid, the
  precedence order, the classes and the schedule **not at all**. It shares the pathfinder and the
  fuel pool and nothing else. `docs/FIX-FINALE.md` names the fix (make the airlock draw from the
  grid, so it will not cycle until its feeder is on), prices it at ten lines of `build` and no new
  API — and it was **not made**: the airlock machine has no `deps` and no relation to any `sub-*`.

**And the bonus rework does not move the verdict either way, which is itself the finding.**
`name-the-hold` is a good bonus by the criteria it was chosen under — it asks a second question, an
idle program is refused it on all three seeds, and it replaced two predicates a bare `print()`
satisfied. But it reads **only** the station use-log and the dependency graph. It never touches a
crate, a fuel gauge, the form or the airlock. It is a report on **one thread**, and the thread it
reports on is the one that already integrates best. So it cannot be evidence that the level
integrates, and if anything it points mildly the other way: the finale's single remaining star asks
about a quarter of the level.

I did not write an integration verdict into `CURRICULUM.md` — the verdict lives in
`PLAYTEST-VETERAN.md` and `FIX-FINALE.md`, and the level block is the right resolution. But the doc
carried the **boast version** of it, and that is what changed: `heritage`'s *"every heritage in this
document, once"* **is** the accumulation complaint written as a feature, and two of its six items
were no longer true. The replacement names the four that remain and says why MST and the grammar are
deliberately not re-run — retiring the boast and correcting the fact in the same line.

**Two design questions escalated, not resolved:** the airlock/grid precedence above, which is all
that is left of the criticism and which nothing has ruled on; and whether the finale should carry a
second star, which `docs/FIX-BONUSES-7-8.md` deliberately left open with two candidates it declined
to choose between.

### One stale comment fixed in passing

`src/levels/world-8/__solutions__/w8-05.ts` still explained its own slack as *"where the
twenty-percent bonus lives"*. That bonus was deleted hours ago. The reasoning held and the citation
did not, so the citation was corrected rather than the comment removed — the same repair
`docs/OPEN-ITEMS.md` records for `budgets.ts`.

---

## Verification, whole pass

- `npx tsc --noEmit` — silent.
- `npm run build` — clean.
- `npx eslint src` — the one known `w5-01.ts:32` false positive. Nothing new.
- `npx vitest run` — **90 files / 1885 tests, all green, with the two-line ratchet diff above
  applied**; **2 red without it**, and those two are the only red in the tree. Baseline was 1904 /
  90: `-24` with `w2-01`'s suites, `+5` from the unknown-id ruling.
- **Campaign completability and save survival were run, not reasoned** — see the Job 2 table.

## Standing constraints, held

No `par`, budget, medal threshold or bonus objective was touched anywhere in this pass. **No
remaining level was made easier.** Difficulty rises in two places and drops in none: an unknown
machine id now stops the run instead of shrugging, and `w2-02` opens World 2 carrying `scan` on top
of what it already asked.
