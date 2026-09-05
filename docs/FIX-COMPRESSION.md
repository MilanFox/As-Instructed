# FIX — Compressing the runway

Two independent playtests (`docs/PLAYTEST-BEGINNER.md`, `docs/PLAYTEST-VETERAN.md`) reached the
same verdict: the first fifteen levels are a runway, not a game. The veteran took gold on the
first honest run on nine of the first ten levels, six of them at *exact* par without aiming, and
would have closed the tab at `w2-03`. The beginner would have quit at `w3-03` after 55 minutes.
Both named the same ceiling — `w4-04` and `w8-05`, *"worth an evening each"*.

Six work orders are withdrawn. **The ceiling is untouched.** Nothing was made easier, no par was
loosened, and no objective was removed from a surviving level.

| | before | after |
|---|---|---|
| Work orders | 40 | 34 |
| Levels before `w4-04` | 18 | 13 |
| World 1 | 5 | 3 |
| Worlds 5–8 | 20 | 20, untouched |

**Ids are stable.** `w1-05` is still `w1-05` even though `w1-04` is gone, so no save loses a
record and no other agent's branch collides. `LevelDef.index` inside a world is now ascending but
not contiguous (World 1 is 1, 3, 5), and the site map numbers its discs by **position on the
board**, not by `index` or by the id.

---

## w1-02 — Forty-Five Metres of Corridor → folded into `w1-01`

**What it introduced.** `print`. Sole introducer.
**Where the introduction lives now.** `w1-01.hardware`, and `print.unlockedBy` in
`src/runtime/api-spec.ts`. `print` is the debugging verb the whole game leans on and it is now
fitted on the first shift, which is where the beginner asked for it.

**What was folded, and why.** The lesson — bounded repetition — and the route length that is
supposed to make the lesson necessary. `w1-02` enforced nothing: the veteran deleted the `for`
loop the starter shipped, typed **45 literal `move()` calls**, and took gold, the star, both
objectives and two commendations on the first run.

`w1-01` is now the pillar detour (the coordinate lesson: *x* grows East, *y* grows South) followed
by a five-leg service route: 19 East, 5 South, 22 West, 5 South, 22 East. **78 tiles, par 78.**
The three changes that matter:

- **78 typed-out `move` calls, not 45.** This is the only lever that was still available and it
  is an honest one rather than a fix. Nothing in a trace can distinguish a loop from a
  transcription — the events are identical — character count is not scored anywhere (DESIGN.md
  §7), and multi-seed is reserved for `w1-03`, whose reveal both testers called the best screen
  in the game. So the level makes longhand absurd rather than impossible, and says so in
  `CURRICULUM.md`. **This is the one place in this document where the fix is a mitigation and
  not a cure.**
- **The starter no longer ships the answer.** `w1-02` handed the player a complete `for` loop
  and then paid them to delete it (beginner, A3: *"w1-02's starter contains the whole answer"*).
  `w1-01` ships one bare `move(Dir.East);`.
- **The booking gates the one answer that skips counting.** 90 ticks against a 78-tick route.
  Firing 30 moves per leg and letting the walls stop them reaches the pad and costs 155 ticks,
  which fails. `world-1.test.ts` asserts exactly that.

**Deliberately not folded.** `w1-02`'s `noBlockedMoves` bonus. `CURRICULUM.md` §3 says the first
level offers no optional goal, and both testers counted the early bonuses as confetti — eight
stars awarded, zero attempted. One fewer free star.

**`wait` also landed here, and it should not have.** See *Dependencies* below.

---

## w1-04 — Grid Reference → cut outright

**What it introduced.** `wait`. Sole introducer. (`pos` was already fitted at `w1-01`, despite
what `CURRICULUM.md` claimed.)
**Where the introduction lives now.** `w1-01.hardware`, and `wait.unlockedBy` in `api-spec.ts`.
The `wait` entry moved up the `FUNCTIONS` array to keep it stored in unlock order.

**Why it went.** The veteran: *"The brief contains the formula. The level is transcription."* The
brief states **x becomes 10 - x, and y becomes 10 - y** and the level is typing that in. Gold
first run for both testers, 16/16 exact par.

**Nothing was folded.** Reading `pos()` and deriving a direction from the sign of a difference is
not lost — every later `goTo` is that, and `w1-05` requires it under a real constraint.

---

## w2-03 — Rotation → folded into `w2-02`

**What it introduced.** `plant`. Sole introducer.
**Where the introduction lives now.** `w2-02.hardware` is `['harvest', 'plant']`, and
`plant.unlockedBy` is `w2-02`.

**What was folded, and why.** All of it. `w2-02` *is* `w2-03` now: 5×5 field, the mule parks in a
different corner each quarter, harvest what is ready, plant what is bare, no soil tile left empty.
The ripeness predicate from the old `w2-02` survives as the guard on the first of the two actions,
so the merged level demands the predicate **and** the two-phase cycle **and** the moving start.

The testers' own words. Beginner: *"It is w2-03 with one predicate removed. Both solved first-try
in 4 and 5 minutes. Two consecutive serpentine-the-field levels is one too many."* Veteran:
*"Same serpentine, start corner now variable. Two lines different from `w2-02`."* Both proposed
this exact merge, and the veteran named `w2-03` as the point where he would have quit: *"my third
consecutive gold-on-first-run serpentine — I caught myself pasting the previous level's file and
changing two lines."*

Kept from `w2-03`: the world builder, the objectives (`harvested-ripe` + `every-tile-planted`),
the `noWastedFieldwork` bonus, par 76, and Halloran's brief. Kept from `w2-02`: the ripeness
sentence in the brief, the `NOTE(4470)` starter line about two ticks a swing, and the two hints
about free sensing. The reference solution is `w2-03`'s, unchanged apart from its `levelId`.

**Knock-on.** `W2-01 → w2-02 → w2-04` now runs 2 → 3 → 6. `w2-04` — *"the best level in the first
twenty, and the only one that produced a re-solve"* — arrives as level 6 of the campaign instead
of level 10, which is five levels earlier that the `RECORD n ~~was m~~` card can fire.

---

## w3-03 — Manifest → cut outright

**What it introduced.** `use`. Sole introducer, and the one dependency in this whole pass that
does not have a clean home. See *Dependencies*.
**Where the introduction lives now.** `w3-04.hardware` is `['use']`, and `use.unlockedBy` is
`w3-04`.

**Why it went.** This is the level the beginner would have quit on: 55 minutes, 11 runs, all four
hints, closed at **276 ticks against a par of 25** — eleven times par — with a solution that does
the exact opposite of what the level teaches. Four independent faults, and the grader is only one:

1. **The terminal is unidentifiable.** Not by `terrain`, not by `mark`, not by `machineId` — all
   three were checked. The only working method was standing on every pad and calling `use()`.
   That is guess-and-check, not deduction, and it is unshippable on its own.
2. **All four hints address one misconception, and it is not the blocker.** Hints 1–3 are three
   restatements of "reading is free, walking is not". The blocker was geometry: the brief says
   "rack row 7" while the aisles run north–south, and there are two aisles, which nothing says.
3. **The level does not enforce its own lesson.** A brute-force sweep passes at 11× par.
4. **The grader never diffed** — `0 of 5 — 5 short`, six times, identical for four plausible lines
   and for an empty program.

**Fault 4 is already fixed and the fix is kept.** `Objectives.printedSequence` names the first
line that differs and shows expected against received; it is used by `w6-01` and is covered by
`src/engine/__tests__/divergence.test.ts`. What was removed is the level-level regression block in
`src/levels/__tests__/divergence.test.ts`, which drove that machinery through `w3-03`. The engine
tests still cover every shape it asserted.

**What is genuinely lost.** *"Your `print` output is the answer"* plus *"sensing is free, so the
bot barely has to move"* — the beginner called it the best single mechanic idea in World 3 and
said to keep it if you keep one thing. It is recorded in `CURRICULUM.md` §13 as an idea looking
for a level with a legible map and an identifiable machine. **Nothing was folded into a survivor**
because no survivor has a terminal to file a manifest at.

---

## w3-05 — The Night Shift → cut outright

**What it introduced.** No hardware. It was `LIBRARY_UNLOCK_LEVEL`.
**Where the introduction lives now.** `src/meta/unlock.ts` — `LIBRARY_UNLOCK_LEVEL` is `w3-04`,
the new World 3 finale. `LIBRARY_FIRST_WORLD` stays 4, and `isLibraryUnlocked` still accepts any
World 4+ completion, so an imported save cannot end up without a Repository.

**Why it went.** The beginner: *"It is `w3-02` plus 'you can now carry several'. I passed it first
run without thinking, at 680 against a par of 439, and felt nothing."*

**Nothing was folded.** The rack-capacity idea is real but small, and the beginner's suggestion
(fold it into `w3-02` as a second objective) would mean editing `w3-02`, which another agent owns
this cycle. Recorded here as available work rather than done.

**Note on the Library, which this makes worse before it makes it better.** The Repository already
arrived with no ceremony — *"`wait()` got a full modal with a signature and a punchline. The
Library got a status bar"* — and it now arrives one work order earlier still. Not my pass, but it
is the same defect and it is now marginally more exposed.

---

## w4-03 — Left Hand on the Wall → folded into `w4-02`

**What it introduced.** No hardware, no Library declaration, no unlock of any kind.
**Where the introduction lives now.** Nowhere, because there was nothing to move.

**Why it went.** The veteran solved it by **pasting `w4-02`'s file with no edits** and took gold
with a 34% margin. *"If two consecutive levels accept a byte-identical solution, one of them is
not a level."* It also shipped a starter that did not typecheck, though that has since been fixed
on `main`.

**What was folded.** One paragraph, and it is the honest fold rather than a generous one.
`w4-02`'s `CYCLE_CHOICES` already includes `0`, so one of its four seeds is a cave with no loop
anywhere in it — which is precisely `w4-03`'s world. The diptych the curriculum wanted (state in
the world vs. state in the algorithm) therefore survives as a *seed* rather than a level, and
`w4-02`'s brief now says so in Dot's voice: some cuts are one long branch, last shift's rule would
walk you straight out, and you will not know which one you have until you are in it.

Nothing else transplanted. `w4-02` keeps its par, its seeds, its budget and its mark-budget bonus
— which the beginner called *"the first bonus in seventeen levels that I could actually have
failed"* and *"the answer to H8"*. Its known problem (the veteran met it with **zero** marks) is a
bonus-tuning question and is deliberately out of scope here.

**Dead code removed with it.** `leftHandReaches` in `src/levels/world-4/caves.ts` existed only to
assert `w4-03`'s shipped-seed invariant and had no remaining caller.

---

## Dependencies — every case, including the one that is not clean

Each of the six was checked for API unlocks, Library declarations, concepts assumed by a later
level, and constants naming it. Six live dependencies were found. Five have proper homes:

| Dependency | Was | Now | First use |
|---|---|---|---|
| `print` | `w1-02` | `w1-01` | `w1-01`'s own starter |
| `wait` | `w1-04` | `w1-01` | `w2-04` |
| `plant` | `w2-03` | `w2-02` | `w2-02` |
| `use` | `w3-03` | `w3-04` | `w5-01` |
| `LIBRARY_UNLOCK_LEVEL` | `w3-05` | `w3-04` | World 4 briefs |
| Growth-stage overlay (DESIGN.md §11 A5) | needed by `w2-03` | needed by `w2-02` | `w2-02` |

Everything else is derived and healed itself: `LIBRARY_REQUIREMENTS` and the whole brick ladder
name only levels that survived; `src/ui/library.ts` builds its regression targets from
`campaignOrder()`; the achievements table names no level; `src/game/save.ts` keys progress by
arbitrary string and never looks a level up.

### Two of those homes are wrong, and I am flagging rather than hiding them

**`use` at `w3-04` is a hollow requisition.** DESIGN.md §6 pins `use` to World 3. Every surviving
World 3 level belongs to another agent this cycle, and none of the three operates a machine — the
first level that actually calls `use()` is `w5-01`, two worlds later. So the ceremony now fires at
`w3-04` and hands the player a verb the work order has no use for, which is exactly the "reward
that costs nothing" pattern both testers complained about. Two clean fixes, neither of which is
mine to make: give `w3-04`'s outbound bay a terminal worth `use`-ing, or move the unlock to
`w5-01` and amend DESIGN.md §6. **Not done.**

**`wait` at `w1-01` is the same shape, smaller.** DESIGN.md §6 pins `wait` to World 1; the only
World 1 file not owned by another agent is `w1-01`; `wait`'s first genuine use is `w2-04`. So the
opening requisition modal now carries four cards instead of two, and one of them is a verb the
level does not need. `w1-01`'s brief carries `w1-04`'s joke about Procurement supplying the
starter package as a bundle, which is the best that can be done with it from here. **Better home:
`w1-05` or `w2-02`, once `w1-05` is free.** Not done.

### Files I edited that belong to another agent

One, one token: `src/levels/world-3/w3-04.ts`, `hardware: []` → `hardware: ['use']`. Without it
`use` has no level and `api-spec.test.ts` fails, and there was no unowned World 3 file to put it
in. Nothing else in that file was touched — no brief, no objective, no bonus.

### Worlds 5–8

No change made. One stale reference left in place deliberately:
`src/levels/world-7/w7-04.ts:80` has a comment reading *"would be teaching w3-05 again
(CURRICULUM.md §12)"*. It is a comment in a third agent's file and the argument it makes still
holds against `w3-02`. **Reported, not changed.**

---

## Character-count plumbing found and left alone

Per instruction, reported not removed. `par.chars` on every `LevelDef`; `bestChars` in
`LevelProgress` and `mergeProgress`; `scoreChars` in `src/engine/verdict.ts`; `stats.chars` in
`Verdict`. Three test suites still assert `scoreChars(solution.source) <= level.par.chars`
(`levels.test.ts`, `world-1.test.ts`, `world-3.test.ts`), which is why `w1-01`'s `par.chars` was
raised from 120 to 400 when its route got longer. Nothing here reaches a medal. A separate pass
owns it.

---

## Levels I believe should also be cut, on the same evidence — NOT DONE

Ranked by confidence. None of these were touched.

**1. `w1-03` Length Unknown should be *protected*, not cut — but its three tellings should go.**
Not a cut; the strongest keep in the document. Recording it here because the fix is one line and
it is the highest-value line in World 1. The beginner: the level is *titled* "Length Unknown", the
starter comments say *"counted twenty-two once, counted sixteen the next shift"*, and the brief
says *"The corridor is a different length every shift"* — **three tellings before the one good
failure.** The seed table is the best screen in the game and it lands softened. Delete two of the
three. Owned by another agent this cycle.

**2. `w2-01` The Sensor Package — cut, and give `scan` to `w2-02`.** This is the one I would
actually cut next, and the only reason I did not is that it was not on the list and `w2-01` is
another agent's file. The evidence is the same shape as `w2-03`'s: gold on the first run for both
testers, 18/18 exact par, and its content — *walk the row recording, walk back to the best one* —
is a strict subset of what the merged `w2-02` now asks on a 2-D field. The veteran's own note is
that `w2-01` through `w2-03` was *"three levels with nothing but the same gold card"*; the merge
fixed two thirds of that run and left the first third standing. Cutting it would put `w2-04` — the
best level in the first twenty — at **level 5** of the campaign. Against: `w2-01` is the "hardware
in isolation" opener for a whole sensing model, and CURRICULUM §1.1 is explicit that a player
fighting a hard puzzle *and* an unfamiliar API learns neither. That objection is real, which is
why this is a recommendation and not a change.

**3. `w4-01` Headlamp — keep, but know what it is.** Gold on the first run, exact par, for both
testers. It survives on placement rather than content: the beginner called it *"a well-placed
decompression beat"* and said it is the reason they opened `w4-02` at all. With `w3-03` gone the
thing it was decompressing from is gone too, so its case is now weaker than it was. It is also
`look`'s isolation level and where the REQUIRED READING memory doc sits. **Recommend keeping**,
and re-measuring after the next playtest.

**4. `w3-02` should absorb `w3-05`'s rack.** The beginner's proposal, and it is right: a second
objective on `w3-02` ("the rack was fitted; clear the yard in *n* trips") costs one level's worth
of content and no level. Blocked only by file ownership.

**5. `w8-05`'s signal thread.** Out of scope for this pass and named here only because both this
document and the veteran's §6.8 point at it: it is optional by the brief's own admission, it
duplicates World 6, and on seed 1 the Caesar shift is 0 so the paragraph about a 95-key cipher is
decoration. Cutting it makes the finale four interacting threads instead of five bolted-together
ones. Worlds 5–8 belong to a third agent.

---

## Verification

- `npx tsc --noEmit` clean.
- `npx vitest run` — **46 files, 1342 tests, all passing.** Baseline was 46 / 1432; the
  difference is 96 tests that existed only to exercise the six withdrawn work orders, minus 6
  new ones for withdrawn ids in `src/game/__tests__/save.test.ts`.
- `npx eslint src` — two errors, both pre-existing and both in files this pass did not touch
  (`react-hooks/rules-of-hooks` firing on `use()` in `world-5/__solutions__/w5-01.ts` and on
  `useLog()` in `world-8/w8-05.ts`; the rule mistakes them for React hooks).
- Every surviving reference solution still passes on every seed inside par — asserted three ways,
  by `levels.test.ts` against `Sim`, by `reference-solutions.test.ts` through the real
  transpile-and-run path, and by the per-world suites.
- No dangling references to the six ids anywhere in `src/` except the two places that name them
  on purpose: the registry test that asserts `getLevel` returns `undefined` for each, and the save
  test that proves a pre-cut save still loads.
- Save compatibility: `src/game/__tests__/save.test.ts` gains
  *"a save that names a withdrawn work order"* — six cases covering migrate, export/import merge,
  unlock gating and the campaign tally. Player code for a withdrawn order is **kept**, because
  DESIGN.md's rule that code is never lost has no exception for a work order that stopped
  existing.
- World 1 walked in a browser (port 5280 — 5173 and 5931 belong to other agents). Site map shows
  three nodes in World 1 and no PENDING placeholders; `w1-01` closed at **78/78, gold, both
  objectives**, four commendations, and the next-order button reads *"w1-03 · Length Unknown"*.
  After closing it the discs read **01** and **02** carrying `w1-01` and `w1-03`. `w1-01`'s
  requisition delivers all four cards (`move`, `pos`, `print`, `wait`) and `w1-03`'s delivers only
  `canMove`. Performance Review reads *"34 of 34 work orders"*. No console errors.

**One cosmetic consequence to be aware of.** The disc says **02** and the chip under it says
**w1-03**, because the number is the position and the id is stable. It reads as a work-order
reference beside a board position — and a corporate work-order board that skips a withdrawn number
is arguably better fiction than one that does not — but it is a visible mismatch and somebody
should look at it on purpose rather than discover it.

---

## Documentation still naming a withdrawn work order

`docs/CURRICULUM.md` is updated. `docs/LIBRARY.md` was corrected in four places because it
documents `LIBRARY_UNLOCK_LEVEL`, whose value this pass changed. The rest are **reported, not
touched** — they are either the binding contract, another agent's, or a historical record that
should stay as written:

| File | What it says | Verdict |
|---|---|---|
| `docs/DESIGN.md` §11 A5 | *"RENDER must draw plant growth stages as distinct overlays (needed by w2-03)"* | **Needs an orchestrator amendment.** The requirement is unchanged and still load-bearing; it is now `w2-02` that is unsolvable without it. `src/render/overlays.ts` and `src/render/tiles.ts` already say `w2-02`. |
| `docs/NARRATIVE.md` §401, §477 | An **Appendix C** plant is placed in a memo at `w1-02`, and the payoff is at `w5-04` | **Needs a new home.** The plant's first appearance went with the level. The veteran noticed Appendix C going in and never saw it pay off, so this is a real thread, not decoration. NARRATIVE is not mine. |
| `docs/ENGINE.md` §203 | An illustrative `LevelDef` literal with `id: 'w2-03'` | Cosmetic. |
| `docs/OPEN-ITEMS.md` | Lists `w3-05 short-shift` and `w1-02` among bonus items | Stale; the bonus pass owns it. |
| `docs/DESIGN-REVIEW-RUBRIC.md`, `docs/GENRE-ANALYSIS.md`, `docs/FIX-VERDICT-DIFF.md` | H1 is stated against `w1-02`; the genre analysis quotes its par | **Leave.** These are the record of why the cut happened. Rewriting them would erase the evidence. |
| `src/levels/world-7/w7-04.ts:80` | *"would be teaching w3-05 again"* | Comment in a third agent's file; the argument still holds against `w3-02`. |
