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
- ~~**Par is default-gold through World 2.**~~ Done, in an isolated worktree — see
  `docs/FIX-PAR.md`. The recorded framing was wrong in a way the measurement settles: par was
  never *loose*. On 21 of 34 levels it is set to exactly the reference solution's worst seed, so
  there was nothing to tighten. The answer splits by world. **World 1: par is not the axis** —
  the tick-optimal route is the first route a player writes (measured: on `w1-03` the answer with
  no idea in it ties the reference, and the star-earning stride costs *more*), so nothing moved.
  **World 2: raise par, on the two levels where par paid gold for ignoring the level's own
  hardware** — `w2-01` 18 → 16 and `w2-05` 74 → 60, with both reference solutions rewritten to the
  route par now rewards. The lazier route still passes every seed and now takes silver. `w2-02`
  and `w2-04` were measured and left alone. Note for whoever reads this next: **the bonus rework
  did its job** — the reference now fails five of the six World 1–2 bonuses — but the playtest
  measured which instrument a player acts on, and it is the medal, not the star. See §2 of that
  file.
- **Silver is arithmetically unreachable on `w5-02` and `w6-01`.** Found by the incentive audit
  (`docs/AUDIT-INCENTIVES.md` §8), confirmed and pinned by a test. Ticks are integers and silver is
  `(par, par × 1.25]`, so the band holds no integer below a par of four. Both pars are placeholders
  rather than design figures — `w6-01`'s own comment says it is 1 "because the registry test
  requires a positive par". Not fixable by moving a number. Two exit routes, both written out in
  `docs/FIX-PAR.md` §6–7: the `graded: false` schema change, which covers both levels as a side
  effect, or a one-line widening of the band in `src/engine/verdict.ts` that is behaviour-preserving
  on the other 32 levels. **Left for the orchestrator: it is a DESIGN §7 amendment and it reaches
  `src/ui/panels/**`.**
- The audit's `graded: false` proposal is sound in principle and **wrong in scope** — measured
  against the reference solutions it is 4 right and 7 wrong out of eleven, and it misses `w6-03`
  and `w6-05`. The measured set is `w1-01, w1-03, w5-02, w6-01, w6-03, w6-05`, and it leaves World
  2 graded in full. Table in `docs/FIX-PAR.md` §6.
- Housekeeping: 2 pre-existing eslint false positives; delete branch `wip/wave1-interrupted`.

### Scratched — i18n and the German toggle

**Cut 2026-09-05 by the user, before any work started.** Nothing was built: no locale
lookup, no extracted strings, no toggle. The only trace was the backlog entry that used to
sit here (`4a554ef`) and this note. **Do not re-propose it** — it was considered in detail,
specced, and dropped deliberately.

One thing it was carrying survives on its own merits, below.

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

**Non-native readers make this worse**: uncommon English abstractions are exactly what fails
first for a reader working in a second language. That was doubly true when a German toggle
was on the backlog; the toggle is scratched and this reason stands on its own, since the
game is played in English by people who do not think in it.

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

### 2026-09-05, 16:25 — par recalibration merged (`c36e07f`)

Green at **1389 tests**, tsc / build clean.

**The recorded framing was wrong, and this is the headline: par was never loose.** Measured
against every reference solution on every seed, **21 of 34 levels have par set to exactly
the worst seed's cost**; median headroom across the campaign is **0.0%**. There was nothing
to tighten. A par of 70 on `w1-01` would make gold unreachable by the only program the level
admits. What the testers felt as generosity was the solution space being a single point.

The decisive measurement was not headroom but a *lazy* versus a *smart* program per level,
both driven through the harness. `w1-03` is the proof: the idea-free answer **ties** the
reference exactly, because sensing is free — and the star-earning stride costs *more*.

**World 1: par is not the axis. Nothing moved.** **World 2: raise par, on the two levels
paying gold for ignoring the level's own hardware** — `w2-01` 18 → 16, `w2-05` 74 → 60, both
reference solutions rewritten to the route par now rewards. The lazy route still passes every
seed and now takes **silver with margin**. `w2-02` and `w2-04` measured and left alone.

The evidence for fixing the medal rather than the star: the beginner finished ten ticks over
par on `w1-05`, knew which ten, and *"did not go back. The reward for doing so is 4 points
instead of 3."* The veteran's silver-to-gold rewrite on `w2-04` was *"the single best moment
in my first ninety minutes."*

### On the audit's `graded: false` proposal — principle agreed, scope rejected

The audit picked its set by **par magnitude**; the measured criterion is **can any correct
program cost fewer ticks than another**. It was right on 4 of 11 and wrong on 7, and it
missed `w6-03` and `w6-05` entirely. Measured set: **`w1-01`, `w1-03`, `w5-02`, `w6-01`,
`w6-03`, `w6-05`** — leaving **World 2 graded in full**, the opposite of both the original
item and the audit's proposal.

`w2-04` fixed the criterion's wording. Ticks cannot tell lapping from waiting there, so the
clock cannot see the lesson — but it graded both testers at 63 against par 52, and ungrading
it would delete the best medal event in two playtests. **"The clock cannot see the lesson"
is not "the clock cannot grade."** Written up as **DESIGN §11 A7** (`958e96e`), my ruling.
Implementation is blocked: it reaches `ObjectiveRail.tsx` (renderer agent) and `store.ts`,
`achievements.ts`, `save.ts` (rewards agent).

### The silver-band fact, confirmed and bounded

Silver's band is empty below par 4 (`floor(3 x 1.25) = 3`), which bites **exactly two**
levels, `w5-02` and `w6-01` — and neither par is a design figure. `w6-01`'s own comment says
its par is 1 *because the registry test requires a positive par*; the reference costs 0. A
test now fails if a third appears. Second finding on the way through: **`SILVER_FACTOR` in
`score.ts` was dead** — nothing read it, the live 1.25 is inline in `medalFor`. Two copies,
one authoritative: the same shape as the two tick counters and the two character counters
found earlier today. **That is three duplicated-constant bugs in one day; worth a sweep.**

### In flight

- **Divergence** — the audit's top finding. Also carrying the silver-band widening, the dead
  `SILVER_FACTOR`, and the two `power()` fact-row deletions.
- **`w4-02` visited-tile trail**, plus the `DocsPanel` per-level `costs` bug.
- **Publish gate + Performance Review scoping.**

### Still open, unassigned

- `w1-01` has no bonus and cannot have the obvious one: nothing in a trace distinguishes a
  loop from 78 `move()` calls, and character count stays deleted. Recorded so it is not
  re-litigated.
- CURRICULUM drift on `w2-01`/`w2-05` — `premise`/`world`/`bonus` rows still describe
  pre-compression versions. Deliberately not folded into the par change.
- Worlds 3–8 pars unmeasured against the lazy/smart criterion; World 3 already silvers a
  beginner three times.

### 2026-09-05, 16:30 — `w4-02`'s failure is visible (merged)

Green at **1410 tests** (1389 + 21: 16 trail, 5 docs-cost), tsc / build clean.
Defect 2 in the list above is closed, and `FIX-POWER.md` §2 can be struck.

**Heat, not a flag** — and the agent measured before writing renderer code, which decided
the design. `w4-02` solved correctly touches its worst tile **3** times; failed, **25 to
113**. A binary "was this tile visited" trail would have painted the two runs identically:
the defect restated in colour. Only revisits draw; one visit is invisible.

**Always on, no level flag, no toggle**, because the measurement showed three
non-overlapping regimes: solutions that never double back peak at heat 1 and draw nothing,
honest working solutions sit at 2–6, and the designed failure at 25+. An absolute ramp
separates them without configuration.

The naive tunnel-follower now paints the closed circuit as a **solid red ring against bare
grey rock** by the time it halts, with the branches it never entered untouched. Controls
both check out: the same level solved with breadcrumbs shows a faint darkening and no red;
`w4-01` with the same program shows nothing at all.

**The calibration no test could have caught.** The first ramp ran `inkDim` → `danger` and
drew *nothing* below ~8 visits, because `inkDim` (`#6a7a8c`) is within a few points of the
World 4 cave floor's own grey. The cold end is now `bgVoid` — a darkening, luminance first —
with hue and alpha on separate curves. There is now a test that fails if the cold end stops
being a darkening.

Cost is bounded by the **grid, not the tick budget**: worst case `w8-05` at 351 cells,
`w4-02` at most 77, zero on levels that never double back. No per-frame allocation.

**DESIGN §11 A5 gained a fourth bullet.**

**The sibling requirement was already implemented, and well.** Blocked moves get a different
segment *shape*, a red rim, an impact chevron, a hopping `!`, sparks and a ring; `w7-03`'s
livelock trips after 8 all-blocked rounds, so it is seen for eight rounds before it lands.
Nothing to do. The trail also lights `w7-03` up, orthogonally to its `blockedMoves === 0`
bonus, since a blocked move produces no arrival.

**`DocsPanel` per-level `costs` — fixed** in the same pass. `w7-02`, `w7-04` and `w8-05`
were showing a price the player does not pay. The `typeof` guard matters: `wait`'s cost is
the string `'n'`.

### Handed to the divergence agent

Dot's *"the tunnels join up"* line in `w4-02`'s brief can now go — the condition that
justified keeping it is gone. Sent as a decision to make deliberately, not a rubber stamp,
since the trail only speaks *after* a run while the line speaks before it.

### Browser gotchas, now three — `FIX-VIEWPORT.md` §4

`resize_window` does not work in this environment; Chrome suspends ResizeObserver delivery
in a hidden tab; and **Vite HMR of a `src/render/**` module does not reliably reach a hidden
tab's mounted renderer**, so a stale module looks exactly like a bug. Hard reload.

### 2026-09-05, 16:38 — publish gate and review scoping merged (`299622d`)

Green at **1440 tests** (1384 + 14 review scoping + 16 publish notice), tsc / build clean.

**The publish refusal is a line on the result, not a dialog.** When the scan finds nothing
callable, the report grows one section under the commendations saying there was nothing
shaped like a subroutine to file, what a subroutine is, and how a later work order would
call it — with a *stop offering* control. If the player factored a helper but left it
indented, that sentence is replaced by one naming it, which turns the audit's second-order
note (`publishableDeclarations` only sees column zero) into the one sentence worth saying.

No new modal and no new stylesheet — `report-section`, `rail__label`, `modal__line` and
`modal__quiet` already existed. Rejected on the way: deleting the early return (a modal that
interrupts, asks, then refuses an answer, and the *fourth* on that transition); the dialog in
an explanatory state; a floating toast; and a line in the Repository panel, which the player
who needs it never opens. New guard `published.length === 0` stops it becoming wallpaper.

**The review's denominator was 139, not the audit's 134** — 34 levels and 37 stars. The
defects reproduced anyway.

| Player | Before | After |
|---|---|---|
| Nothing closed | 0% `DEVELOPING` | `NOT ASSESSED` |
| 17/17 gold, all stars | 49% `CONSISTENT WITH EXPECTATION` | 100% `RETAINED` |
| 34/34 gold, no stars | 73% `EXCEPTIONAL` | 100% `RETAINED` |
| 32 gold + 2 silver | 72%, tier 3, prints "34 of 34" | 98%, tier 4, "32 gold results" |

Three rules: the wall lists **reached** work orders, the grade counts only **closed** ones,
and the denominator is **medals only**. It declined the audit's version of the second rule —
keeping the level you are standing on in the denominator as a zero caps a flawless player
below 100% forever, which is the same disease in miniature. Correct call.

### Ruling: cut the Performance Review down. Assigned.

Its own agent recommended it and I agree. Neither tester opened the screen; the medal wall
restates the site map, which already shows points, closed count, medal counts, per-world
totals and an `ALL AT PAR` badge; it is the second place a completion fraction renders
(audit finding 13); and cutting beats fixing. **The memo stays** — best writing in the game,
changes at four thresholds — but it gets *delivered* on tier change through the existing
`Requisition`/`RepositoryIssue` ceremony rather than hosted behind a top-bar icon. World tabs
go. Roughly 200 of 330 lines, plus a screen and a route.

The one risk flagged to that agent: the veteran already complained about three stacked modals
on one transition, so a delivered memo must not become a fourth.

### Paired change, deliberately split across two agents

Tier 5 goes `min: 93 → 100` in `score.ts` (divergence agent) and its text "Every work order
**on this site**" → "**issued to you**" in `NARRATIVE.md` §7 (review-cut agent). Under a
medals-only denominator 100% means every closed order is gold, which is what the tier's own
text claims; at 93% a player carries seven silvers and is told otherwise. **No test depends
on the value**, which is exactly why it needed routing rather than leaving to be noticed.

### Open — `budgets.ts` infers a budget's unit by parsing its English label

This was written down as an i18n prerequisite. **i18n is scratched; this item is not**, and
it should never have needed a translation project to justify it.

`src/game/budgets.ts` decides what a budget measures by reading the words of its own label:
`TICK_WORDS`/`OP_WORDS` regexes against the lowercased label, sense and resource names
matched word-by-word, and `declaredUnit()` parsing a label that ends `…, in ticks` or
`…, in tiles`. A label is player-facing prose. **Reword the prose and the budget silently
stops being a budget** — no error, no failing test, just a number that quietly stops scoring.

The risk is not hypothetical here: every brief and objective label in the campaign was
rewritten today, and `makespan`, `precedence` and `audit` were removed from player-facing
text in the same pass. That pass happened to leave the load-bearing words intact. The next
one has no reason to.

The fix is a structured field on the objective declaring its unit, with the label free to
say whatever reads best. The parsing can stay as a fallback for levels that have not
declared, but a level that declares should never be guessed at. Worth a test that fails when
a label changes in a way that changes the inferred unit.

### 2026-09-05, 17:05 — Performance Review cut (merged). SESSION HANDOFF POINT.

Green at **1445 tests**, tsc / build clean. Main is `HEAD` of everything below; nothing of
value is unmerged except the divergence agent's branch, described further down.

**−500 lines net.** Gone: `PerformanceReview.tsx`, the `review` route and `Screen` member,
the top-bar icon, the site-map button, and the scope/rows machinery in `review.ts`.
`screens.css` 931 → 669. **Nothing lost that the site map does not already carry** — checked
line by line. The wall's one unique datum was `TICKS / PAR` per work order, and `Results.tsx`
already prints `· best {bestTicks}` on every run report, which is when it is actionable. It
deliberately did *not* add a tick column to the site map: that would rebuild the deleted
surface one screen to the left. Correct instinct.

**Three cuts beyond the ruling, all right:** the five-rung tier ladder (a progress meter, in
a game that had just deleted its second completion fraction, where every tier's prose already
says where it sits); the `POINTS 102/102` row, which used a *different denominator* from the
site map's own `POINTS x/y` — two disagreeing readings of one word; and the `SCOPE` row. The
percentage moved onto the grade line.

**The memo lands on the site map**, gated like `RepositoryIssue`. That is the only screen
with zero ceremonies — the close-a-work-order transition already stacks the run report, the
publish offer and the hardware crate, which was the veteran's complaint. It is also where the
game starts, so a memo earned at the end of a session opens the next one.

**Delivery is once per tier, ever** (`save.reviewedRanks`), not on tier change. Firing on
change misbehaves under the new medals-only scoring: the first gold reads 100%, so the grade
**oscillates across the tier-5 boundary** and would re-issue `RETAINED` repeatedly. That is
the kind of thing only found by actually running it.

### Left over, small, none blocking

1. `src/ui/components/Icons.tsx` — `IconReview` is now a dead export. Diff in
   `docs/FIX-REVIEW-CUT.md`.
2. `docs/DESIGN.md:258` and `README.md:59` still describe the deleted screen. Diffs in the
   same report.
3. **Tier 1 can never be shown.** The medals-only denominator floors a graded record at
   `1/3` = 33.3%, so `DEVELOPING` (0–24%) is unreachable and tier 2 needs a nearly all-bronze
   record. Fell out of the morning's scoring fix, not the cut. `NARRATIVE.md` §7 records it;
   moving the thresholds is a design call in `score.ts`.

### If this session ended here — how to resume

One agent was still running: **divergence**, branch `worktree-agent-a7462ef9324db5988`. It
had already committed the mechanism, Worlds 1, 2 and 8, and the `score.ts` tier-5 change
(`d73d6ac`), with more uncommitted in its worktree and a 33KB `docs/FIX-DIVERGENCE.md`
written incrementally. **Merge what is committed, salvage the rest, read the report for which
levels are converted.** Its remaining bundled items were the silver-band widening, the dead
`SILVER_FACTOR`, the two `power()` fact-row deletions, and a judgement call on cutting Dot's
"the tunnels join up" line from `w4-02`'s brief.

The queue after that, in order: apply leftovers 1–3 above; implement **DESIGN §11 A7**
(`graded?: boolean`, measured set `w1-01, w1-03, w5-02, w6-01, w6-03, w6-05`); sweep for more
duplicated constants (**three found in one day**); work `AUDIT-INCENTIVES.md` findings 3 and
5–12; the ranked mute verbs (`plant()`, `send()`, and `use()` returning a mute *success*);
the UI/visual audit, now unblocked; then the loose content items.

### 2026-09-05, 17:15 — divergence merged. Every objective in the campaign now says where.

Green at **1624 tests / 64 files** (+184: 38 guard, 1 ladder, 140 world-level, 5 from main),
tsc / build clean. All 86 reference solutions pass unedited; no par, threshold, budget, cost
or objective `id` moved. The audit's top finding is closed.

**The mechanism forces the issue at the type level.** `Objectives.custom` now *requires*
`report`, and `report` requires `divergence`; there is no shorter call, and the transitional
positional overload is deleted, so the compiler asks at every call site.
`Objectives.checkbox` is the only legal way to report one bit. The invariant is **binary, or
a divergence, no third option** — and a progress tuple is explicitly *not* a third option,
because `0 of 5 — 5 short` is the readout that cost the beginner 55 minutes.

**Result: 34 silent / 55 progress-only / 9 divergent → 98 divergent, 0 silent, 0 binary.**
Not one objective in the campaign turned out to be genuinely binary; each already held a
tick, tile, count or pair it had computed in order to answer. `BINARY_BY_DESIGN` ships empty.

Deleting the overload surfaced **11 call sites the guard could not see** — it walks `LEVELS`,
and six of those were unused exported builders in World 1/2 `shared.ts`. They got real
divergences too, on the grounds that a dormant builder is exactly where the defect grows back.

`w4-04`'s bonus, the worked example, real values on seed 1:
`(7, 21) → (25, 3) → (13, 21)` — **want** `224 steps` — **got** `448 steps`.

**Three reports were refused as answer keys rather than diffs**, which is the judgement the
job needed: `w4-04/best-order` (the order itself), `w6-02/name-the-fault` (the right byte —
it returns the run's wrong guess instead, ruling out one of 4–10), and `w5-02/patched`, where
"the break lies further along" would have been a free reading per run and let a player close
200 segments having bisected nothing. **The audit asked for the best order; half that request
was a diff and half was an oracle.** A test asserts `w4-04`'s expected/received contain no
coordinate.

The guard is `src/levels/__tests__/legibility.test.ts`: four static invariants plus, per
level, driving the **empty program** and asserting every miss returns a filled
`{where, expected, received}` within 44 characters. Four of seven world suites re-run it over
every shipped seed.

**Bundled fixes all landed:** the silver band is `max(par + 1, par * 1.25)`, and
`levels.test.ts` now *grades the ladder directly* — walking every integer tick and asserting
all three medals are reachable — rather than inferring it. `SILVER_FACTOR` has one copy.
Both `power()` fact rows and Dot's "the tunnels join up" line are cut; `w4-02`'s brief is
44 → 28 words, and the player keeps the two `NOTE(4470)` starter comments plus the red ring
the trail draws. Dot's line was the third telling of the same fact.

**A correction to an earlier note:** `FIX-REWARDS.md` §3 claimed no test depended on the
tier-5 threshold. `score.test.ts` asserted `reviewTier(93) === RETAINED`. Fixed with the
change. The paired text half is now applied in both files — `score.ts:137` is annotated
*"verbatim from NARRATIVE.md §7"*, and that invariant is intact.

### Open, unassigned, in the order I would take them

1. `src/ui/components/Icons.tsx` — dead `IconReview` export. `docs/DESIGN.md:258` and
   `README.md:59` describe the deleted review screen. Diffs in `docs/FIX-REVIEW-CUT.md`.
2. **Tier 1 is unreachable** — the medals-only denominator floors a graded record at 33%, so
   `DEVELOPING` (0–24%) can never show and tier 2 needs a near-all-bronze record. A design
   call in `score.ts`; `NARRATIVE.md` §7 records it.
3. **DESIGN §11 A7** — `graded?: boolean`, measured set `w1-01, w1-03, w5-02, w6-01, w6-03,
   w6-05`. Reaches `ObjectiveRail.tsx`, `store.ts`, `achievements.ts`, `meta/types.ts`,
   `save.ts`. All owners are now free.
4. **Duplicated-constant sweep** — three found in one day (two tick counters, two character
   counters, `SILVER_FACTOR` beside an inline `1.25`). Look for the fourth.
5. **`budgets.ts` infers a budget's unit by parsing its English label** — see its own section.
6. `AUDIT-INCENTIVES.md` findings 3 and 5–12, still unassigned.
7. The ranked mute verbs: `plant()` wants a reason field, `send()` should throw, and `use()`
   on an empty cycle returns `true` and does nothing — a mute *success*, needing a ruling.
8. **The UI/visual audit**, unblocked since the viewport and review work merged.
9. Loose content: `w2-01` cut candidate, `use` requisitioned at `w3-04` where nothing operates
   a machine, `w8-05` accumulating rather than integrating, CURRICULUM drift on
   `w2-01`/`w2-05`, Worlds 3–8 pars unmeasured against the lazy/smart criterion.

**No agents are running. Main is green and everything is merged.**
