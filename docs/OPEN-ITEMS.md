# Open Items

Live backlog. Everything here is known-but-not-done. Committed state is green:
`tsc --noEmit`, `npm run build`, `npm run test:run` (1402 tests) all clean at `2c86403`.

## In flight
Two playtest agents are running against the stable build and will write
`docs/PLAYTEST-BEGINNER.md` and `docs/PLAYTEST-VETERAN.md`. Both are barred from reading
`__solutions__`, `CURRICULUM.md` and `NARRATIVE.md`. Both owe a ranked keep/cut/merge list for
every level played. **Act on their findings before anything below** — several items here may be
resolved, reprioritised, or made irrelevant by what they report.

## Design pivots on the table
The developer has explicitly said nothing is sacred, that cutting content is preferred to fixing
it, and that 40 levels is an arbitrary number.

1. **Move the Library unlock earlier.** Currently end of World 3, roughly 8 hours in. It is the
   game's anti-repetition mechanic and it arrives after the repetition has already done its
   damage. `docs/DESIGN-REVIEW-RUBRIC.md` independently flags "five worlds of the same activity"
   as what ends sessions two and three.
2. **Restructure the finale `w8-05`.** ~500-line reference solution, seven seeds, all-or-nothing,
   with the entire story payoff behind it. Genre completion data for levels of this shape is
   under 5%. Staged objectives with partial credit is the obvious fix.
3. **World 7 teaches too much in one level** — virtual clocks, `sync`, collisions and makespan
   scoring all arrive in `w7-01`.
4. **A broader second axis.** `withinSenses` only bites on two levels, because sensing is free in
   ticks and `scan` is adjacent-only. The honest candidate is per-level resource `spend` (cable,
   marks, fuel), already in `Verdict.stats`. Do not reintroduce character counting — the
   developer rejected code golf explicitly.

## Level-side fixes (flagged, not made)
- Budget objectives whose labels name neither number nor unit, so they resolve only by inference:
  `w8-03 within-shift`, `w8-05 deadline`, `w3-02 tight-round`, `w3-05 short-shift`,
  `w5-03 tight-order`, `w8-04 no-resurvey`. They should state the number and unit the way
  `w1-02` and `w8-01` now do.
- `w5-05`'s bonus "Finish within 2% of the shortest possible run" has **no `progress()`**, so it
  is unreportable.
- Genuinely binary objectives that fail without saying where: `w6-03`/`w6-05 stay-on-route`,
  `w8-03 precedence-held`, `w8-05 precedence`. Each needs a `progress()` or a failure `at:`.

## Engine / runtime
- **`Sim.noteObjective` has no production caller** — the engine never emits `objective` events.
  `src/game/playback.ts` works around this by deriving objective flips from a trace replay. Either
  wire the engine properly and simplify playback, or delete the dead API.
- `withinOps` has no per-event trace record, so it cannot be counted live. No level uses it yet.

## UI
- **Viewport aspect.** At 1600x836 the canvas is 891x393 (2.27:1) and `viewportFraction` is 0.58,
  so a 21x21 grid gets 18.7px tiles and wastes 56% of the canvas width. Bumping the constant to
  ~0.72 gives +24% tile size but squeezes the brief/console from 285px to 190px, which is too
  tight for a World 8 brief. Wants a level-shape-aware split or zoom-past-fit-and-follow, not a
  constant bump.
- Unhandled promise rejection at `src/ui/library.ts:86` (`installTypes`) fires on every level
  open. Noisy in the console, not user-visible.
- `BriefPanel.tsx` does not persist hint-reveal state across reloads.

## Housekeeping
- `npx eslint` reports 2 errors, both false positives: `react-hooks/rules-of-hooks` firing on the
  game's own `use()` and `useLog()` names in `src/levels/`. Needs a rule scope, not a rename.
- `wip/wave1-interrupted` branch is superseded and can be deleted.

---

## 2026-09-05 — post-playtest state

Both playtests are in and committed: `docs/PLAYTEST-BEGINNER.md`, `docs/PLAYTEST-VETERAN.md`.
Headline: the ceiling is real from `w4-04`; everything before it is a runway both
testers would have quit in. Gold on nine of the first ten levels, first honest run.

### Merged to main

- `2268ccd` — failing objectives report `{where, expected, received}`; `HARDWARE` card
  copy pinned to `api-spec.ts` by a structural test (it had drifted in 13 places);
  all 40 starters asserted to compile (`w4-03`'s did not).
- `fc77133` — player-facing character count removed (docs claim, editor footer,
  success line). Scoring plumbing still present, see below.

### In flight (isolated worktrees, none committed)

- **Bonuses** — every bonus in worlds 1–3 rebuilt as a failable challenge. Eight stars
  were earned and zero attempted; `w4-02`'s mark budget is the target shape. Scoped to
  the eight survivors after the cut.
- **Library integrity** — publish silently truncated multi-line arrow functions and wrote
  an unparseable `lib.ts`. Fix + validate-before-commit + shrink the 19-checkbox dialog.
  Regression tab explicitly off-limits: both testers praised it, H9 refuted.
- **Finale** — `power()` works remotely (8 calls, 16 ticks, no travel, satisfies both grid
  objectives and deletes `dispatch`'s reason to exist). Plus per-objective credit,
  per-seed visibility, 7 seeds → 3, signal thread cut. Difficulty must not drop.
- **Compression** — deleting `w1-02`, `w1-04`, `w2-03`, `w3-03`, `w3-05`, `w4-03`. 40 → 34.
  No renumbering; save files must survive; sole-introducer dependencies move to survivors.

### Decided, not yet started

- **Remove character-count plumbing entirely** — `countChars`, `scoreChars`, `par.chars`,
  `bestChars`, `stats.chars`. Touches all 40 level files, so it waits for the level agents.
- **The Library needs a moment.** It unlocks with one grey status-bar line, after the
  player has already hand-written its obvious contents six times. Unlock earlier and
  make the unlock land. This is the mechanic the user singled out as the best idea.
- Viewport aspect: 891×393, 56% of width wasted on square grids.
- Hint-reveal state not persisted. Unhandled rejection at `src/ui/library.ts:86`.
- Par is default-gold through World 2. Deliberately frozen until the above lands, because
  the fix is either "raise par" or "par is not the axis" and that depends on the new bonuses.
- Housekeeping: 2 pre-existing eslint false positives; delete branch `wip/wave1-interrupted`.

### Backlog — i18n, German toggle

Requested 2026-09-05. Not started, and deliberately not started small: this is a
structural change, not a string sweep.

**Scope.** Player-facing prose lives in four places and none of it is extracted:
briefs and hints inline in the 34 level files (~2200 quoted lines), `src/ui/copy.ts`
(316), `src/meta/copy.ts` (263), and the docs entries in `src/runtime/api-spec.ts`
(793, mixed prose and signatures). Plus commendation titles/notes/requirements in
`src/game/achievements.ts`, verdict and failure copy, and the objective labels that
`budgets.ts` now parses for their unit.

**Three things make this harder than a normal i18n job:**

1. **The API must stay English.** `move`, `harvest`, `scan().crop`, `Dir.North` are real
   TypeScript the player writes. Identifiers, the generated `.d.ts`, starter code and
   every code sample stay as they are. So `api-spec.ts` splits: signatures fixed,
   surrounding prose translated. Same for briefs, which quote the API inline.
2. **`budgets.ts` parses English labels.** A label ending `, in <plural noun>` is how a
   budget declares its unit, and label words are matched against event kinds. That
   coupling has to be replaced with explicit structured fields *before* any label is
   translated, or German labels silently stop being budgets.
3. **The tone is the product.** The dry corporate register — work orders, requisitions,
   Scheduling, "the last recorded instance was in 2204 and is disputed" — is most of the
   game's character. Machine-translated German would read as flat instructions and lose
   it. The German copy has to be *written*, by someone who can be funny in German, against
   the English as a reference rather than a source.

**Order of work:** decouple `budgets.ts` from label prose → extract strings behind a
lookup keyed by id, English as the fallback locale → verify nothing regressed with the
English still in place → then write the German. Steps 1–3 are the engineering and are
worth doing on their own; step 4 is a writing job.

A language toggle belongs in Settings next to the layout controls, persisted in the save.
