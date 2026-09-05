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
- Refill the achievement set further if it reads thin once the cut lands.
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

### Done since that list was written

- `5f1341c` — the streak is gone. It reset on any failed run, taxing the loop the game is
  made of, and contradicted RAISED, AND RAISED AGAIN on the same screen.
- `575f729` — two commendations replacing it with the opposite incentive: REOPENED ON
  PURPOSE (a bonus met on an already-closed order) and A SECOND LOOK, AND A THIRD (close
  on the 4th run or later).
- `baaddb5` — revealed hints persist in the save; they had lived in a module-level Map.
- `b223b57` — `w8-05` par 1300 → 1050, holding the gold bar where it was after the seed cull.
- `b566142` — `w2-05` brief states the sensor's reach, owed by the bonus work.
- Unhandled rejection at `src/ui/library.ts:86` — fixed with the Library work; the cause was
  Monaco compiler options being re-pushed on every level change, disposing the worker
  mid-`installTypes`.
- `aggregate.ts` scoring the bonus on seed 1 alone — already fixed by the finale work's
  `worstPerObjective`; verified, no action needed.

### Backlog — incentive audit (a different instrument from a playtest)

Requested 2026-09-05, prompted by the streak: it survived two full playtests and was
caught by the user reading a screenshot. That is the point. A playtest surfaces what
blocks or bores a player; it does not surface what quietly shapes their behaviour,
because an agent playing a level is not actually afraid to experiment and so never feels
the tax. Different failure mode, different instrument.

**Method.** Do not play. Read the systems — scoring, medals, bonuses, commendations,
save, unlock gating, hint economy, the Library ladder, failure copy — and audit them as
an incentive structure against known design anti-patterns. Cross-reference the findings
against `docs/PLAYTEST-BEGINNER.md` and `docs/PLAYTEST-VETERAN.md` afterwards, not
before, so the two instruments stay independent.

**What it is hunting**, with the streak as the worked example:

- A reward that punishes the core loop. This game's loop is run → fail → read → revise;
  anything that makes failing cost something is attacking the game itself.
- Two systems rewarding opposite behaviour. The streak reset on a failed run while
  RAISED, AND RAISED AGAIN paid out for closing on the tenth — on the same screen.
- Patterns imported reflexively from other genres because they are familiar: streaks,
  dailies, completion percentages, FOMO timers, anything that measures attendance.
- A displayed number the player cannot meaningfully influence, or that only rewards the
  easy stretch of the game (the streak only ever congratulated first-try solves).
- Feedback that is an oracle rather than a diff, and its inverse: a fail state that
  reports a bit where it could report a divergence.
- Difficulty that is noise rather than depth — more seeds, more objectives, wider
  surface, no new idea. The finale's 5 x 7 pass/fail grid was this.
- Anything that makes asking for help feel like a confession.

**Deliverable.** A ranked list. Each finding states the behaviour the system provokes and
why that behaviour is bad for *this* game — "the code does X" is not a finding. Every
finding gets a proposed cut or replacement, because the fix for an incentive is usually
deletion. A report concluding the systems are well designed is a failed report.

Worth re-running after the compression and par work lands, since both change the
incentive surface.

### Backlog — UI and visual audit (third instrument)

Requested 2026-09-05. Looking good is a requirement here, not polish, and it is stated as
one: "Does it look GOOD (which would be kinda important to me too)". The playtests judged
whether levels were fun and the incentive audit judges what the systems reward; neither
looks at the screen.

**Method.** Drive the real build in a browser and *look at it*. Screenshot every screen
and every meaningful state — level select, brief, editor, running, paused mid-trace,
results at each medal, a failure with a divergence, the docs panel, the publish dialog,
the Library, the Regression tab, the achievement shelf, settings. Capture at more than one
window size, including a laptop 13" and a wide monitor. For findability questions, pull
the actual accessibility tree for roles and labels rather than inferring them from the DOM.

**The three questions, in order:**

1. **Is anything hard to find?** Which controls does a new player miss? Where is a feature
   discoverable only if you already know it exists? Known instance: the Library unlocks
   with one grey status-bar line, after the player has hand-written its obvious contents
   six times. Assume nobody reads; if a thing is only announced in prose, it is hidden.
2. **Too much information, or too little?** The standing directive is that LLMs
   over-estimate how much humans read: cut text, show don't tell, de-noise in doubt. Find
   the screens that violate it. Equally, find where the game is silent when it should show
   a number, a diff, or a state — the failure surface work fixed one of these and there
   will be more.
3. **Does it look good?** Judge it as a designer, not as a linter: type scale and
   hierarchy, spacing rhythm, alignment, colour discipline, contrast, how the canvas
   grid reads against the chrome, whether motion helps or distracts, whether the whole
   thing feels like one artefact or several bolted together. Compare against the bar the
   genre actually sets — Opus Magnum, TIS-100, Baba Is You, Factorio's panels. Say plainly
   where it falls short of them and what specifically to change.

**Known already, do not re-report as discoveries:** viewport aspect wastes 56% of width on
square grids at 891x393; the Library's unlock has no ceremony.

**Deliverable.** Ranked, with screenshots inline as evidence, each finding naming the
screen and the specific change. "It looks fine" is a failed report. Where a fix is a CSS
or layout change small enough to prove, make it and show the before/after.

### Backlog — accessible language pass — **DONE, see `docs/FIX-PROSE.md`**

Requested 2026-09-05, delivered the same day, together with the brief-length target from
PLAYTEST-BEGINNER §13, in one sweep over the same files. Mean brief 220 → 58 words; every
term classified; `makespan`, `precedence` and `audit` replaced in player-facing text. The
item is left below as written, because the report is scored against it.

The game role-plays corporate jargon; the player has not studied
economics or operations research. The tone stays — this is not a de-flavouring pass.

**The test, and it is the whole item:** is the word *flavour* or is it *load-bearing*?

- **Flavour** — a name for the thing we are doing, where nothing is lost if the player
  never unpacks it. "TPS report" is fine: it is obviously a joke name for a task. Keep
  every one of these. They are most of the game's character.
- **Load-bearing** — the player must understand the word to solve the puzzle, read a
  verdict, or operate the UI. Here jargon stops being a joke and becomes a gate. Use the
  broadly-known word instead (preferred), or introduce the term once, in place, the first
  time it appears.

Prefer swapping the word over adding a gloss: explaining a term costs the reader more
than choosing a common one, and the standing directive is to cut text.

**Candidates to audit, by frequency in player-facing code** — flagged for review, not
convicted:

- `makespan` (14) — near-certain offender. It is an operations-research term and it is the
  actual scoring metric for multi-bot levels, so it is load-bearing *and* obscure. "The
  clock stops when the last bot stops" says it without the word.
- `precedence` (19) — a real DAG/scheduling concept the finale requires the player to
  reason about, and the name of two objectives. Load-bearing. "What has to happen first"
  is the same idea in words everyone has.
- `requisition` (97) — means "the level hands you a new tool". Load-bearing: it gates
  what the player can write. Probably keep the word as a stamp, but the *first* one must
  make its function unmistakable without relying on the noun.
- `feeder` (160), `manifest` (20), `dispatch` (17), `audit` (13) — mixed. Some are domain
  nouns for objects on the map, which is fine; some describe what an objective checks,
  which is not.
- `work order` (230), `commendation` (62) — almost certainly pure flavour. Keep.
- `tolerance` (5) — check what it modifies; if it names a threshold the player must hit,
  it is load-bearing.

**Non-native readers make this worse**, and this game has a German toggle on the backlog:
uncommon English abstractions are exactly what fails first for a reader working in a
second language, and they are also the hardest words to translate without losing the joke.
Do this pass **before** any string extraction for i18n, so the German is written against
copy that is already clear.

**Deliverable.** Every player-facing term classified flavour / load-bearing / borderline,
with the load-bearing ones rewritten and shown in context. A report that reclassifies
everything as flavour is a failed report.
