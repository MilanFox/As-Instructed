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
