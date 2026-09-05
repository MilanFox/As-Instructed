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

- ~~**Remove character-count plumbing entirely.**~~ Done, in an isolated worktree — see
  `docs/FIX-CHARCOUNT.md`. `countChars`, `scoreChars`, `par.chars`, `bestChars` and
  `Verdict.stats.chars` are gone from `src/` and from `DESIGN.md`. 34 level files, not 40: the
  compression cut landed first. Saves carrying the old fields still load — the save reader
  whitelists fields, so a retired one is dropped on read, proved by a fixture test.
- ~~**The Library needs a moment.**~~ Done, in an isolated worktree — see
  `docs/FIX-LIBRARY-MOMENT.md`. The unlock moved from the close of `w3-04` to the close of
  `w2-05` and now arrives as a delivery note in the `Requisition` ceremony. Note for whoever
  reads this next: **"six times" was a pre-cut artefact** (four post-cut, and the thing
  retyped — a serpentine sweep — is not on the Library ladder at all), and the unlock was
  *not* too late in the campaign; it was too early to hold anything. See §1 of that file.
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

### In flight at compaction (2026-09-05, ~89% of the usage window)

- **Prose pass** — isolated worktree, uncommitted. Cutting all 34 briefs and hints from a
  mean of 218 words to under 60, folding in the accessible-language item (same files).
  Target: 2-3 sentences of roleplay then the task, HRM-style. Mechanical facts relocate to
  structured UI rather than being deleted. Report appends per level to `docs/FIX-PROSE.md`.
  If it died, its worktree is under `.claude/worktrees/` and the partial report is usable.

All four earlier agents are merged. Main is at 34 levels, 1398 tests, tsc + build clean.

### In flight (2026-09-05, after the window reset)

Three agents live, disjoint file ownership, none merged:

- **Prose pass** — `worktree-agent-ab499d8682cb03eac`, fanned out into three sub-agents
  sharding worlds 2–3, 4–5 and 6–7 inside one worktree. Holds **all of `src/levels/**`**,
  which is why the character-count plumbing removal cannot start yet.
- **Library moment** — owns `src/meta/**`, `src/ui/library.ts`, `App.tsx`, `src/ui/screens/**`,
  `src/ui/copy.ts`, `src/ui/components/**`. Told to verify the "six times" claim against the
  post-cut 34-level order before designing, since the phrasing predates `525ce7a`, and to
  answer `unlock.ts`'s own argument for the World 3 close rather than ignore it. Any brief
  change is written to the report as a diff for the orchestrator, not applied.
  Report: `docs/FIX-LIBRARY-MOMENT.md`.
- **Viewport aspect** — owns `Workspace.tsx`, `src/ui/panels/**`, `src/render/**`, and the
  three shared stylesheets. Before/after screenshots at 1440x900 and 2560x1440 are the
  evidence. Report: `docs/FIX-VIEWPORT.md`.

Verified at the reset: main green at **1398 tests, tsc clean**. All four earlier agents'
worktrees clean and fully merged — nothing was lost to the window, nothing to salvage.

Housekeeping done: the five merged agent worktrees and their branches are pruned, leaving
only the three live ones. `wip/wave1-interrupted` was already gone — the earlier note listing
it as outstanding was wrong.

### 2026-09-05, 14:30 — prose and Library merged

Main is green at **1417 tests**, tsc / build clean. One eslint error remains, the known
`rules-of-hooks` false positive on `w5-01`'s solution (the game API has a `use()` verb).

**Prose pass, merged.** Mean brief 220 → **58 words**, worst 560 → 96, total −74%. The
interesting part is not the cutting but where the facts went: three things the UI already
had and never drew are now on screen. `budget.maxTicks` is set by ten levels and the brief
was the only place to learn it — `w8-05`'s brief claimed "the objectives panel shows the
number", which was simply false until now. `LIBRARY_REQUIREMENTS` was a structured table
rendered nowhere, re-typed as prose in every affected brief. And `LevelDef.facts` now
carries ~190 rows of numbers that used to be buried in paragraphs. DESIGN.md §5 gained the
rule: prose is read once, a row can be re-read, and players are frequently reading in a
second language.

`makespan`, `precedence` and `audit` are gone from player-facing text; the domain nouns
and the flavour stayed. The accessible-language item is therefore **done**, folded into
this pass.

**Library moment, merged.** The verification step was worth more than the fix. Of the
original complaint: "one grey status-bar line" was exactly right — `UnlockMemo` rendered
only *inside* the panel, behind a toggle nobody clicks, while `wait()` gets a modal with a
staged reveal and an audio cue. "Unlocks too late" was already stale, the cut moved it from
14/40 to 10/34. "Hand-written six times" was wrong — it was four, and it referred to a
serpentine sweep that is not on the Library ladder at all.

The real defect was the opposite shape: **zero of the six earned routines existed before
the unlock**, so the Repository was provisioned at level 10 and sat empty for three work
orders — meaning moving it earlier *on its own* would have made that window longer. Unlock
now closes `w2-05` (level 7) with a `RepositoryIssue` ceremony reusing the Requisition
modal, and both of its "why" lines are computed from `LIBRARY_REQUIREMENTS` rather than
written, so they cannot drift. `offerPublish` also bails unless the player already has a
callable top-level declaration — the entry point is gated on the habit the system exists
to teach, which is why the beginner never saw it and rated it 1/5. **Correction, 16:20:
that was recorded here as fixed and it is not.** The Library work added the `briefed` gate
and the ceremony; `src/meta/store.ts`'s `if (!declarations.some(each => each.callable))
return;` is untouched. Verified by reading the line. The error was mine, over-reading the
agent's report, not the agent's.

No level became gated; the campaign is still finishable by a player who never opens it.

### Defects found while doing the above — not fixed, ranked

1. **`power()` on a manual machine fails silently** — charges the tick, returns false,
   explains nothing. `w8-03` and `w8-05` cannot teach it by failure until this speaks.
2. **`w4-02`'s designed failure is invisible** — no visited-tile trail in the replay, so
   the loop teaches nothing. Dot's warning had to be trimmed rather than removed.
3. **`w7-02`/`w7-03` now diverge from CURRICULUM.md §11** — the KD-2704 courtesy memo was
   cut because the engine's `LivelockError` already says it at the moment it bites. Either
   amend the doc or reverse the call.
4. Dead `docs` ids on `w8-05`; two `costs` overrides the reference page contradicts;
   `w8-05`'s 16000-vs-3000 limit mismatch. Detail in `docs/FIX-PROSE.md`.

### In flight

- **Viewport aspect** — running. Told to re-measure: the brief panel is much shorter and
  the objective rail taller than when it took its "before" screenshots, so its layout
  problem changed shape underneath it.
- ~~**Character-count plumbing removal**~~ — done in a worktree, not yet merged. See
  `docs/FIX-CHARCOUNT.md`. The save risk resolved to nothing structural: `rescueLevels`
  already reads by whitelist, so dropping the field from `LevelProgress` is a tolerate-and-drop
  with no new `SAVE_VERSION`. Two fixture tests prove a legacy save keeps its medals, code,
  ticks, stars and objectives.

### 2026-09-05, 15:30 — character-count plumbing deleted (`a3a532f`)

Green at **1369 tests**, tsc / build clean, eslint at the one known false positive.

There were **two** counters, and nothing had noticed because nothing compared them:
`scoreChars` (a regex in `engine/verdict.ts`) and `countChars` (a 110-line hand-written
scanner with three private helpers in `game/score.ts`). Both are gone, along with
`Verdict.stats.chars`, `VerdictInput.chars`, `LevelScore.chars`, `LevelProgress.bestChars`,
the `chars` arguments through `run-level` and `aggregate`, and `par.chars` from all 34
level files. `par` is now `{ ticks: number }`. Every tick value is byte-identical — no par,
medal threshold or budget moved.

Test count 1417 → 1369, accounted rather than assumed: `countChars` suite −10, per-level
`par.chars` −34, world-level −6, new save fixtures +2. World-2's
`no bonus label mentions characters or code length` was deliberately **kept** — it is the
guard against the idea returning through a bonus objective.

**No save version bump, and none needed:** `migrate` already funnels every read through
`rescueLevels`, which rebuilds progress off a field whitelist rather than spreading the
stored object, so dropping a field *is* tolerate-and-drop. Two fixtures prove it — a full
legacy save with `bestChars: 132` restoring to an exact object, and a record containing
nothing but `bestChars` landing on `emptyProgress()` without throwing.

DESIGN.md §4.6/§5/§7 updated: the "carried for historical reasons" sentence is replaced by
"Character count does not exist."

### Follow-up left by that work — small, unblocked

`runLevel`'s `options.source` existed only to feed `scoreChars` and went with it. That
leaves **`SeedRunOptions.source` and `RunRequest.code` with no readers** — `code`'s only
consumer was `serve.ts` forwarding it into `source`. Removing them touches `protocol.ts`,
`serve.ts`, `run-level.ts`, `src/ui/adapters.ts`, `src/meta/adapters.ts` and four test
files, so it was correctly left as its own change rather than smuggled into a deletion.
`LevelScore` in `score.ts` is also now an exported interface with no reference anywhere.

### 2026-09-05, 16:00 — viewport merged (`d08dc45`)

Green at **1378 tests** (1369 + 9), tsc / build clean.

891x393 was never hard-coded and the camera was innocent — it is two independent
constants on two axes: `DEFAULT_LAYOUT.editorFraction = 0.44` gives the 891, and
`viewportFraction = 0.58` gives the 393. The finding that decided the design is that
`tilePx = min(viewW/cols, viewH/rows)` and the box is 2.27:1 while nothing in the campaign
exceeds 1.4:1 — **the viewport is always height-bound, so widening it buys zero tile
size.** The "56% of width wasted" framing was right about the waste and wrong about the
remedy.

Also wrong in the old note: the grids are **not all square**. 8 of 34 are 1:1, 26 are
wider, median 1.40 — but the largest (w4-05 40x40, w8-05 48x40, three 30x30) are the square
ones, so the assumption fails in general and holds where it matters.

New `useWorkspaceLayout` hook: detail panel capped at 340px, height claimed only up to what
the grid can spend, right-column width targeting `viewportHeight x gridAspect`. **All of it
applies only while the saved fraction is still the shipped default** — a dragged splitter is
returned verbatim, so no player's saved layout is stomped and no migration was needed.

Found while measuring: `.rail` carries `.panel`, so `.workspace__lower > .panel { flex: 1 }`
was overriding the rail's own `width: 268px` and handing the objective rail **half the
detail panel** (711px at 2560). One selector.

Campaign-wide, driving the real `Camera` over all 34 levels: **no level's tiles get smaller
at any size.** At 2560x1440 the site view goes 1.92:1 to 1.00:1, mean canvas fill 48% to
69%, and w4-05/w8-05 go 18px to 24px tiles at 49% to 96% fill. Screenshots in
`docs/shots/viewport/`.

Known costs, accepted: wide-thin levels lose a few points of fill at 2560 against the
deliberate 96px tile ceiling; the objective rail scrolls at 2560 where it did not before;
and the editor now carries the surplus — 1576px of Monaco for a 40-line program. A
max-width on the code column is the obvious next move and belongs to the UI audit.

Measurement note for whoever drives a browser next, written up in `FIX-VIEWPORT.md` §4:
`resize_window` does not work in this environment, and **Chrome suspends ResizeObserver
delivery in a hidden tab** — so measure *after* forcing a frame with a screenshot. This
cost the agent real time and looked like an app bug.

### In flight

- **Par recalibration** — measuring reference solutions against par across all 34 levels.
- **`power()` silent failure** — engine/runtime.
- **Incentive audit** — read-only, writes only `docs/AUDIT-INCENTIVES.md`.
- **`w4-02` visited-tile trail** — started now that `src/render/**` is free. Also checking
  whether DESIGN §11 A5's blocked-move and livelock visuals were ever implemented.

### 2026-09-05, 16:10 — `power()` now speaks (`ebf533d`)

Green at **1384 tests** (1369 + 6 new, none removed), tsc / build clean. The 86
reference-solution tests and `finale.test.ts` pass unedited; no par, threshold, budget or
tick cost moved.

**Hard, explained failure, not a quiet `false`.** `Sim.power()` throws `IllegalActionError`
on a `vars.manual: 1` machine; it still returns `false` for an unknown machine id, which
had been conflated with it in a single branch. The deciding test — worth reusing for the
sibling verbs below — is **"can the identical call succeed later in the same run?"** Every
`false` case in this engine is transient (a wall opens, an inventory empties); every
throwing case is permanent. Nothing clears `vars.manual`, so the call is wrong for the
whole run, and a `false` that can only ever be `false` hands the player a branch that can
never flip: a bug dressed as a control-flow option.

The non-fatal-notice option was rejected on plumbing, not taste: the console carries only
`print` events plus one closing line, so a notice would either corrupt
`Objectives.printedSequence` or need a second parallel channel. The throw needed **zero new
plumbing** — `runSeed` -> `toRuntimeFailure` -> `toVerdictFailure` already carries `code`,
`at` and the player's line. Same mechanism as `LivelockError`.

Confirmed in-browser on `w8-03`. The check caught a real error in the agent's own copy: the
result panel shows the flavour line but *not* `failure.message`, so a first draft saying
"the reason is the line above" was false and was rewritten to point at the console.

### Mute verbs — ranked, none fixed, use the test above to rule on each

1. **`plant()`** — worst. Three causes (not plantable / already cropped / no seed) collapse
   to one bit. Correctly on the `false` side; wants a `reason` field, not a throw.
2. **`send()`** — returns `false` for an unknown or dead bot id while every other verb
   throws for exactly that. Both states are permanent, so it should throw. Strongest next
   candidate.
3. **`spawn()`** — calls `blockReason()` and discards it; `move()` makes the same call and
   puts `reason` on its event. One field, already in hand.
4. **`pickup()`/`drop()`** — mute in a different type, returning `0`.
5. **`applyMachineChange()`** — consistent with the kept `false`, just terse.
6. **`refuel()`** — arguably fine, `OutOfFuelError` explains it downstream.

Flagged separately, needs a ruling: **`use()` on an empty or absent `cycle` returns `true`
and does nothing.** A mute *success* is worse than a mute failure — the player's program
cannot detect it at all.

### The three World 8 findings, resolved

1. **Dead `docs` ids on `w8-05` — dismissed.** All six resolve. FIX-PROSE's open gap is
   also closed: all 34 levels audited, every `docs` id resolves campaign-wide.
2. **`costs` overrides — confirmed, and there are three, not two.** `DocsPanel.tsx:230`
   renders the flat `api-spec` cost and ignores per-level overrides: `w7-02` (`spawn` 2 vs
   5), `w7-04` (`use` 1 vs 2) and **`w8-05` (`use` 1 vs 2)**, the last unlisted and the one
   that matters, since `use` is the only way to work a manual station in the finale. The
   player is shown a wrong number. Handed to the trail agent, which owns that file.
3. **16000-vs-3000 — confirmed, but dead config rather than a visible contradiction.**
   `deadlineFor()` returns exactly 3000 on all three seeds; the floor always binds, par is
   1050, and `maxTicks: 16000` can never bite first. It only makes a doomed run 5x longer.

### Queued, blocked only by the par agent holding `src/levels/**`

`docs/FIX-POWER.md` carries exact diffs for two fact rows (`w8-03.ts:265`, `w8-05.ts:636`)
that still promise the old silent `false`. **Ruling: delete them rather than correct them.**
The prose pass kept those rows *because* the failure was mute; that condition is gone, and a
row explaining what an error message now says out loud is the "told me" half of
PLAYTEST-BEGINNER §9. Apply once par merges.

### 2026-09-05, 16:20 — incentive audit landed (`docs/AUDIT-INCENTIVES.md`, 920 lines)

Read-only instrument, no source touched. It did what it was built to do: the top finding is
structural and neither playtest saw it.

**1. 31 of 34 levels cannot report *where* a run failed.** 71 of 82 `Objectives.*` calls in
the level files are `Objectives.custom`; only 25 pass a progress tuple, and only **three
levels** (`w6-01`, `w6-03`, `w6-05`) can produce an actual `Divergence`. Everything else
falls through `failureCauses` to `'not met'`. `w4-04`'s bonus knows the order you took and
the best order and reports neither. **The "read" step of run → fail → read → revise is
empty**, so the loop degrades to guessing — and `RAISED, AND RAISED AGAIN` then pays out for
ten runs of guessing. Proposed fix: make `divergence` non-optional in `custom`, add a
`checkbox` variant for genuinely binary objectives, and guard it with a campaign-wide test.
Blocked on the par agent holding `src/levels/**`.

**2. The publish gate is not fixed.** See the correction above. Now assigned.

**3. Strictly linear unlock** — 33 single points of failure, hint ladder the only escape and
it ends. The gate is already leaky: `openLevel` does not check it, and the Performance
Review's medal wall opens any row.

**4. The Performance Review is a completion percentage wearing a rank.** Scoped to all 34
levels regardless of progress, so a player at 17/17 with flawless golds reads **38%** and is
told they are average. All-gold-no-stars is **76.1%**, below the 93% `RETAINED` tier whose
own text is *"Every work order closed at or under par"* — which that player has done.
**Neither tester opened this screen once.** Now assigned.

Findings 5–12 cover `AS PER THE BRIEF` versus the 4th/10th-run commendations; four bonuses
plus `NO CONTACT REPORTED` plus the tick cost all paying for not bumping, which jointly
rewards hardcoding; the bonus layer being 27 tightenings out of 37; a Discrepancy reporting
a failure on a layout **there is no seed picker to run**; a bonus star graded on one seed
while the medal beside it is graded on all of them; and **DESIGN.md §7.1 still binding
agents to implement the streak** that was deleted this morning.

### The audit's par ruling — forwarded to the par agent

**Par is not the axis, and raising it is the wrong fix.** Par is two measurements sharing
one badge: on traversal levels (`w3-02` 332, `w4-04` 970, `w8-05` 1050) it prices route
quality honestly; on reasoning levels the route is forced — eight level files' own comments
say par *is* the correct solution's cost — so it measures nothing. Raising par there turns
"gold for correct" into "silver for correct", replacing a truthful signal with a lie about
headroom that does not exist. Proposal: `graded: false` on reasoning levels, keeping tuned
par only where the route is a genuine choice.

**Verified independently:** `SILVER_FACTOR = 1.25`, `w6-01` is `par: { ticks: 1 }` and
`w5-02` is `par: { ticks: 2 }`, so the silver band contains no integer and **silver is
arithmetically unreachable on those levels.** A ladder bug independent of tuning.

### Where the audit corrected itself against the playtests

Marked inline, which is the discipline working. Its behavioural claim in finding 5 is
**refuted** — both testers ran freely (42 runs across 17 levels, 11 on one) and neither
hesitated, so only the incoherence survives. Finding 9's prediction is **refuted at the top
of the skill range** — the veteran used the Repository unprompted, for intrinsic reasons.
And it withdrew a claim that `personalBestLine` was tick-golf pressure: both testers name it
the best reward in the game, correctly, because it is a diff against your own past work with
no threshold. **Do not touch it.**

Three problems the playtests found and the audit missed are in its §18. The largest: both
testers say the commendation layer changed their behaviour **exactly zero times**, which
makes deletions cheap and raises whether fifteen commendations should be five.
