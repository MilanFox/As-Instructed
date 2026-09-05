# FIX — verdict divergence reporting, and two false briefs

Working notes for the two defects raised by `docs/PLAYTEST-BEGINNER.md` §3, §5 and §6a.
Appended per unit of work, in the order the work was finished.

## Defect 1 — a failing objective now says where it failed

### The shape of the fix

One optional method on `Objective`, threaded through the verdict to the report that already
exists. Nothing new was invented and no panel was added.

```
Objective.divergence?(ctx) -> { where, expected, received } | undefined
```

- `src/engine/objectives.ts` — new `Divergence` and `ObjectiveReport` types, `clipValue`,
  `NOTHING`. `evaluateObjectives` asks for a divergence **only when the objective was missed**,
  and omits the field entirely when the objective did not implement one or returned `undefined`.
  A met objective is never asked, so `divergence` implementations may assume failure.
- `src/engine/verdict.ts`, `src/runtime/protocol.ts` — both were re-declaring the objective row
  inline; both now use `ObjectiveReport`. The field rides the worker boundary as a plain object
  and needed no serialisation work.
- `src/game/budgets.ts` — `ObjectiveReading` accepts it, `FailureCause` carries it. Ranking is
  untouched: a divergence does not change which cause is shown first.
- `src/ui/screens/Results.tsx` + `src/ui/styles/app.css` — rendered inside the existing `cause`
  row as `where / want / got`, monospace, green for wanted and red for received. Three words of
  chrome and two values. No explanation, no legend, no sentence about the diff.

The rail (`ObjectiveRail.tsx`) was deliberately **not** touched. It is a live, one-line-per-row
list during scrubbing; a two-line diff in it would be noise at every playhead position, and the
report is where a player goes to find out what to change.

### Which objectives opted in

| Objective | `where` | Example |
|---|---|---|
| `printedSequence` | line index | `line 3` · want `stone 5` · got `ice 1` |
| `botAt` | end of run | `end of run` · want `(3, 0)` · got `(2, 0)` |
| `machineState` | machine id | `terminal` · want `filed` · got `idle` |
| `w6-03`/`w6-05 stay-on-route` | tick + cell | `tick 12 · (7, 5)` · want `floor` · got `pit` |
| `w8-03 precedence-held` | station + feeder | `sub-5 · feeder sub-2` · want `start at tick 88 or later` · got `started at tick 74` |
| `w8-05 precedence` | station + feeder | as above, plus `feeder sub-2 energised first` when the feeder was never touched |

`w3-03`'s `manifest-printed` is a `custom` wrapping `printedSequence`, so it needed one line to
forward the diff. `w3-03`'s `manifest-filed` gets its diff free from `machineState`.

`stay-on-route` was identical in `w6-03` and `w6-05`, so it became one exported builder in
`src/levels/world-6/signal.ts` — the shared home World 6 already uses. `w8-03`'s
`precedenceBreaches` and `w8-05`'s `precedenceHolds` were widened to return the breach record
they were already computing; neither adjudication rule changed. Both levels' `firstBreach` picks
the *earliest* breach, because everything downstream of the first out-of-order start is a
consequence rather than a second mistake, and the two levels' differing treatment of a feeder
that was never energised at all (a breach in `w8-05`, not one in `w8-03`) was preserved exactly.

### Not changed, on purpose

- **`allTilesAre`, `tileCount`** — could name the first offending cell, but their predicate is an
  opaque closure, so `expected`/`received` would have to be invented ("matches the spec") or
  guessed from `terrain`, which is wrong for any predicate that reads `growth` or `occupant`. A
  confidently wrong diff is worse than none. Their `progress()` already gives `n / total`.
- **`inventoryAtLeast`, `itemsDelivered`, `machinesAllIn`** — counting objectives. `7 / 12` is the
  whole answer; there is no single point to name.
- **`withinTicks`, `withinSenses`, `withinOps`** — budgets. `src/game/budgets.ts` already answers
  "by how much and in what unit", which is the divergence for a budget.
- **The rail**, as above.
- **Ranking, medals, par, scoring, bonuses** — untouched.

### `w3-03`: does the diff give the answer away?

The brief asked me to flag any level where one line of diff is effectively the solution. `w3-03`
is the closest call and I concluded it is safe, for a reason worth writing down.

A true diff is always an oracle: print a guess, read back what line *n* should have been, print
that, repeat. On `w3-03` the manifest is five to seven lines, so seven runs would extract one
seed's answer. But **the level runs four seeds and all four must pass**, the reported trace is the
*first failing* seed's, and the four manifests differ. Extracting all four costs roughly 28 runs,
and the program then still has to decide *which* manifest to print — which means distinguishing
the seed at run time, which means reading the yard, which is the level. The oracle is strictly
more work than the brute-force sweep the playtester already used and passed with (276 ticks
against par 25). It is not a shortcut.

The generic rule that keeps this true is in the code: `printedSequence` reveals **one line, the
first that differs, and never the lines after it**. A single-seed level whose expected output is
two or three lines would not be safe. There is not one today.

### The level I believe is unshippable rather than merely undiagnosable

**`w3-03` Manifest.** The diff fixes the reported defect — the fifty-five minutes were spent
because the grader would not say which line was wrong, and now it does. It does not fix the rest
of what §3 found, and none of the rest lives in the verdict layer:

1. **The terminal cannot be identified.** Not by `terrain`, not by `mark`, not by `machineId`.
   The only working method is to stand on each of the four painted pads and call `use()`. That is
   guess-and-check with a tick cost, in a level whose entire lesson is "deduce, do not walk".
   The `manifest-filed` divergence now says `terminal · want filed · got idle`, which tells the
   player they did not file it — it cannot tell them how they were meant to find it.
2. **All four hints address one misconception, and it is not the blocker.** Hints 1–3 restate
   "do not walk on everything"; hint 4 is about class variance. The blocker is geometric: three
   rack columns, two aisles, and a brief that says "rack **row** 7" while the aisles run
   north–south.
3. **The level does not enforce its own lesson.** A brute-force sweep passes at ~11x par.

Fixing (1) needs a level-data change (a distinguishable terrain, a `mark`, or a probeable
`machineId`) and (2) needs the hint budget rewritten. Both are content decisions and the brief
bars me from restructuring levels, so this is flagged rather than done. **`w3-03` is a cut or a
rewrite candidate, not a bug fix.**

### Character counting found (reported, not acted on)

- `src/levels/world-6/w6-03.ts` bonus `shorter-encoding` compares `mine.length < theirs.length`
  on the **transmitted string**, not on source code. World 6's subject is run-length encoding and
  that comparison is the lesson, not code golf. It cannot move a medal (DESIGN.md §11 A4: a bonus
  is a star). Left alone.
- `Verdict.stats.chars`, `par.chars` and `scoreChars` exist and are wired to nothing that scores,
  exactly as DESIGN.md §7 requires. Left alone.

### Other findings, not acted on

- `w5-05`'s bonus `tight` ("Finish within 2% of the shortest possible run") still has no
  `progress()`, and a divergence would not be the right fix for it either — it is a resource
  budget and wants a `progress()`. Already on the backlog in `docs/OPEN-ITEMS.md`.
- `Sim.noteObjective` still has no production caller (`docs/OPEN-ITEMS.md`). Divergence does not
  depend on it: it is evaluated once, at the end, from the finished trace.

### Tests

New: `src/engine/__tests__/divergence.test.ts` (10), `src/levels/__tests__/divergence.test.ts`
(14), plus 2 added to `src/game/__tests__/budgets.test.ts`. Every objective kind touched has at
least one test asserting the reported expected/received pair for a known-wrong program, and one
asserting that a correct program reports no divergence at all.

The `w3-03` case from the playtest is reproduced directly: a program that prints nothing and a
program that prints a full manifest with every count off by one produce the **same** `progress` —
the identical `0 of 5 — 5 short` the tester saw — and now produce **different** divergences.

```
 ✓ src/engine/__tests__/divergence.test.ts (10 tests) 4ms
 ✓ src/levels/__tests__/divergence.test.ts (14 tests) 12ms
 ✓ src/game/__tests__/budgets.test.ts (15 tests) 4ms

 Test Files  3 passed (3)
      Tests  39 passed (39)
```

### One note on formatting

Running `npx prettier --write` over the touched level files reformatted large regions that were
never prettier-clean at `HEAD` — `w8-05`'s `INSTANCES` table alone went from 7 lines to 90. That
churn was reverted and the files carry only the logical change. `npx prettier --check` still
reports pre-existing drift in several level files; none of it is on a line this work touched, and
`npm run format` would produce it wholesale. Left for a separate pass.

---

## Defect 2 — two briefs that state things that are false

Done in parallel, in files disjoint from Defect 1.

### 2a. `w2-05` Harvest Quota — brief fixed, not the API

```
- 'shift. You will know it is full when `harvest()` stops handing anything back.'
+ 'shift. A `harvest()` on ripe crop that hands back nothing means it is full.'

- `The shift ends after **${SHIFT} ticks**. The field is far longer than that.`
+ `The shift ends after **${SHIFT} ticks**. The field is ${WIDTH} by ${HEIGHT}, far more
+  ground than that buys.`
```

`Sim.harvest` returns `null` on three conditions — no crop, unripe, **or** no room left
(`src/engine/sim.ts`). Qualifying the sentence with "on ripe crop" makes it exactly true, and it
is precisely what the reference solution already does. The API alternative (a distinguishable
"full" signal) would change `harvest`'s return type and ripple through `api-spec.ts`, the
generated `.d.ts`, `api-bindings.ts`, `Sim.harvest`, the reference solutions for `w2-04`, `w2-05`
and `w8-01` — all of which stop on `harvest() === null` — and `__tests__/naive.ts`. Two brief
lines against that: the brief fix is the smaller change by a wide margin.

The field shape now comes from the level's own constants, so it cannot drift. It is 12x6; the
playtest's "13x7" counted the wall ring. No objective, par, seed, budget or score was touched.

`harvest`'s doc entry in `api-spec.ts` never mentioned the full-inventory case at all, which is
what let the brief be written wrong in the first place. Fixed at the source.

### 2b. `w4-02` Breadcrumbs — the drift was a hand-written duplicate

`api-spec.ts` was **right** all along (`mark(text: string | null): void`,
`readMark(): string | null`), and so were the brief, the docs panel, the `.d.ts` and the
bindings — all four are generated from it. The drift lived in `HARDWARE` in `src/ui/copy.ts`,
which `Requisition.tsx` renders. It is the only copy of the API surface in the codebase that is
not generated from the spec, and it had drifted in **thirteen** places, not one.

A new structural test in `src/runtime/__tests__/api-spec.test.ts` now holds them together, over
`PLAYER_API` x `hardwareNote`:

1. every function has a card — no silent fallback;
2. **no card names a type the signature does not have** (so `undefined` is banned outright, since
   this codebase returns `null`);
3. every "Costs N ticks" matches `fn.cost`, and every "free" claim requires `cost === 0`.

It matches type words and digits, not prose, so it is not a fragile string-matcher. It was
verified to bite: reverting the two `mark` strings fails it.

### 2c. Audit — what else disagreed with its signature

**Fixed, requisition cards (`src/ui/copy.ts`):** `mark`, `readMark`, `power` (described as a free
sensor; it is a setter costing 2), `inventory` (returns a number, not items), `mine` (declared
`mine(dir)`, card said own tile), `fuel`, `bots` (returns ids, not handles), `spawn`,
`receive`/`recv`/`decode` ("undefined" for `null`), `look` (a ray along one direction, not
line-of-sight), `link`.

**Fixed, `api-spec.ts` docs** (these feed the docs panel *and* the JSDoc in the player's `.d.ts`):
`harvest` and `mine` both omitted the full-inventory `null`; `mine` also claimed ore only when
regolith, rock, rubble and ice are mineable; `plant` omitted its third failure case; `probe`'s
"on or beside the bot" is the faced neighbour only.

**Fixed, level briefs and starters** — each one contradicted by the engine: `w7-03` ("there is no
`clock()` to read" — there is, since `w7-01`; and a wrong account of `sync`), `w7-01` (`sync`
described as costing ticks and charging the bots that were ahead; it is free and it advances the
ones behind), `w8-02` (short `pickup` attributed to the arms being full; it also happens when the
tile holds fewer), `w7-04` ("thirty work items" — 18/24/26/30/15 across seeds, a hardcode trap on
four of five), `w7-05` (`probe` "next to the bot"), `w4-01`'s hint ("one tile in each direction"
against `look(dir, range = 8)`), and `w4-03`'s starter, **which did not compile** — `print(pos())`
passes a `Vec` where a `string` is required.

A second structural test, in `reference-solutions.test.ts` (which already drives the real player
compiler): **all 40 starters compile cleanly**. It failed on exactly `w4-03` before the fix.

**Left alone, reported only.** `mine`'s declared `dir` is required while `Sim.mine` supports the
own-tile form (spec narrower than runtime — misleads nobody, and widening it changes the
player-visible surface). `pos`/`scan`/`look`/`probe` are documented "free to call as often as you
like", which is true in ticks but not against `maxOps` or a `withinSenses` budget. `wait`'s
`cost: 'n'` is really `n x costs.wait`. `move`'s `cost: 1` conflates `move` and the separately
overridable `moveBlocked`. `sync` advances to a high-water mark that includes dead bots' clocks.
`carrying`'s "order first picked up" is really stack order. `spawn` does not document that the
child inherits a full tank, which is exploitable on fuel levels. `use` on a machine whose state is
not in its `cycle` jumps to `cycle[0]` rather than stepping. `w8-01`'s and `w3-01`'s `scan`/
`pickup` phrasings are loose but load-bearing for those levels and defensible.

Two notes for whoever implements World 5/6's `link`, `receive`, `transmit`, `decode` (which have
no `Sim` method yet): `costOf()` in `api-bindings.ts` reads the price from `api-spec.ts`, so a
level's `costOverrides.link`/`.transmit` are silently ignored; and `decode`/`receive` call
`sim.clock`/`sim.probe` purely to register an op, which inflates `senseTotals()` for reads the
player never made.

### Character counting found by the audit (reported, not acted on)

- **`src/ui/panels/DocsPanel.tsx`** — the "Ticks and par" guide states *"Characters are scored
  second: source length after comments and leading whitespace are stripped."* That directly
  contradicts DESIGN.md §7 and it is the loudest such claim in the game. **This one is a real
  content bug and wants deleting**, but the brief says report, not act.
- `src/game/store.ts` — the success console line reads `work order closed — N ticks, M chars`,
  putting a char count on the result line rather than "quietly next to the editor".
- `src/game/score.ts` `countChars`, and `EditorPanel.tsx`'s `{chars} chars` — the latter is the
  §7-sanctioned neutral stat. `medalFor` is ticks-only; medals are clean.

---

## Verification

```
$ npx tsc --noEmit
(exit 0, no output)

$ npx vitest run

 Test Files  46 passed (46)
      Tests  1432 passed (1432)
   Duration  8.17s
```

Baseline before any of this work was 44 files / 1402 tests, all passing. The 30 new tests are
26 from Defect 1 (10 + 14 + 2) and 4 from Defect 2. Nothing was failing before that is failing
now, and nothing was skipped.

`npx eslint .` reports the same **2 pre-existing errors** it reported at `HEAD`, both the known
`react-hooks/rules-of-hooks` false positives on the game's own `use()` and `useLog()` names
(`docs/OPEN-ITEMS.md`, Housekeeping). The `w8-05` one moved line and enclosing function —
`precedenceHolds` to `firstBreach` — because that function was split; it is the same false
positive.

Nothing is committed or staged.
