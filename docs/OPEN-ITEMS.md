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

### 2026-09-05, 18:45 — window reset, leftovers cleared, four agents out

State verified before starting: main `358414b`, **1624 tests / 64 files**, tsc / build clean,
no agents running, every worktree branch already an ancestor of main. Nothing was lost to the
window and there was nothing to salvage.

**Leftovers applied (`8e67604`).** Dead `IconReview` export removed; `DESIGN.md` and
`README.md` no longer describe the deleted review screen. **DESIGN gains §11 A8** recording
the cut and, more usefully, *why delivery is keyed to the grade reached rather than to a
change of grade* — under the medals-only denominator a first gold reads 100%, so "on change"
oscillates across the top boundary and re-issues the same memo. That reasoning was only in an
agent report; it belongs in the binding document.

### In flight — four agents, disjoint ownership

- **Ungraded levels** — DESIGN §11 A7. Owns `src/levels/**`, `src/game/**`, `src/meta/**`,
  `ObjectiveRail.tsx`. Told to verify rather than trust the claim that ungraded levels are
  already inert in the review's denominator, and that `personalBestLine` must survive
  ungrading — both testers called it the best reward in the game, and ungrading removes the
  ladder, not the mirror.
- **Mute verbs** — `plant()`, `send()`, `spawn()`, `pickup()`/`drop()`, plus a ruling on
  `use()` returning a mute *success*. Owns `src/engine/**`, `src/runtime/**`, `copy.ts`.
  Committing per verb so a partial merge is usable. Warned that `send()` throwing is where
  the 86 unedited reference solutions would break first.
- **UI/visual audit** — read-only. Explicitly handed the one thing the viewport work deferred
  to it: 1576px of Monaco for a 40-line program at 2560.
- **Duplicated-constant sweep** — read-only. **Three instances in one day is a rate, not a
  coincidence.** Asked not just for a fourth but for the cheapest *guard* that would have
  caught each of the three known ones, since a guard that closes the class beats a fix.

Next wake-up armed for 23:42.

### 2026-09-05, 19:55 — duplicated-constant audit (`docs/AUDIT-CONSTANTS.md`, 612 lines)

Read-only, no source touched. It found a live player-visible bug the sweep was not
looking for.

**1. The silver rule existed four times and three copies were already wrong — fixed
(`db3d4c1`).** `FIX-PAR.md` §7 widened the band to `max(par + 1, par * 1.25)` so a par under
four has a reachable rung. That landed in `verdict.ts` **and nowhere else**. Still stating the
old rule: the function's own docstring, **`DESIGN.md` §7 — the binding contract** — and
`DocsPanel.tsx`, *what the player reads in game*. Two levels ship with par below four, so the
game documented a medal it hands out. **Deduplicating the constant did not deduplicate the
rule**, which is the sharpest statement of this bug class yet. DESIGN and the docs panel are
fixed; the docstring is routed to the agent that owns `verdict.ts`.

**2. The fourth instance: `BONUS_STAR_WEIGHT`.** Exported from `verdict.ts`, re-exported from
`index.ts`, named authoritative by `ENGINE.md` — **read by nothing.** The live value is
`BONUS_STAR_POINTS` in `score.ts:13`, two lines above the `SILVER_FACTOR` that was
deduplicated this morning; that fix did not look up. And `score.test.ts:60` is a **tautology**
— `toBe(3 + 2 * BONUS_STAR_POINTS)` passes for any value. Both halves routed to their owners.

**3. `CostTable.link` and `.transmit` are unreachable.** The sim reads 15 of 17 cost keys; the
live cost for those two is in `api-spec.ts` via `costOf()`. A level author writing
`costs: { transmit: 3 }` gets a **silent no-op with no type error** — the same disease across
a data boundary that `FIX-POWER.md` found in the docs panel.

**4. `REVIEW_TIERS` versus `NARRATIVE.md` §7 has already failed once** — `7b7acd5`, four hours
earlier, was a hand fix to tier 5. All five agree today; nothing enforces it.

**5–9.** `api-spec` costs versus `DEFAULT_COSTS` (16 agree, unguarded); **`CURRICULUM.md` §3
specifies a 9-tick timed door on `w1-05` that does not exist** in an 81-line static-doorway
level; `MEDAL_BEAT` and `BASE_TICKS_PER_SECOND` each twice, *both admitting it in a comment*;
palette three times plus a dead `--tile: 48px` with zero `var(--tile)` uses.

### The guard, and it is the real result

`grep -rniE 'verbatim|mirrors|authoritative' src/` **returns 24 hits, and every one is an
unenforced hand-maintained invariant.** This codebase has the good habit of confessing its
duplicates in prose and nobody has ever read that index. One guard built on it covers five of
the nine findings. Unused-export linting is cheaper and would have caught `SILVER_FACTOR` and
finding 2 outright, but it is **blind to every case where both copies are live** — findings 1,
3, 5, 7, 8 — so it is worth shipping first and worth not mistaking for closing the class.

Neither guard is built yet. Both are queued.

### 2026-09-05, 20:55 — ungraded levels merged (DESIGN §11 A7)

Green at **1653 tests / 65 files** (1624 + 25 `ungraded.test.ts` + 4 achievements), tsc /
build clean. `w1-01`, `w1-03`, `w5-02`, `w6-01`, `w6-03` and `w6-05` no longer carry a ladder.

The pair worth knowing: **`w1-01` and `w1-05` both finish at exactly 78 ticks.** The ungraded
rail reads `ticks 78`; the graded one reads `ticks 78 / 50` in over-budget amber. The ungraded
rail reports the clock, the graded rail grades it.

**Two of the "places a medal was assumed" turned out to be live bugs, not adaptations:**

- **`outside-tolerance` was paying out on every single `w6-01` close.** Par there is 1 *because
  the registry test requires a positive par*, the only solution costs 0, so `0 < 0.5` always
  held. Every player was being congratulated for restraint on the one level with no other
  number available. Found only because A7 forced someone to read every medal assumption.
- **`sector-nominal` and `sector-gold` would have silently become unattainable** in worlds 1, 5
  and 6 — both read `medal !== None` as "closed". `RunFacts.worldMedals` is now
  `worldResults: {medal, closed}[]`.

"Ungraded" is `Medal | null` minted outside the engine, deliberately **not** a fifth `Medal`
value, so `src/engine/**` stayed untouched while another agent held it.

**Verified rather than trusted, as instructed:** `reportFor` needs no filter — it already skips
on `Medal.None` before touching either side of the fraction. Four tests pin it, including that
an ungraded close cannot drag a perfect record below 100% nor inflate a weak one.

**Save compatibility** is whitelist-on-read, exactly like the retired char-count field: a
pre-A7 gold on `w1-01` is dropped while everything else survives, and an id this build does not
know **keeps** its medal, so a retired level does not lose one to a lookup miss. Six cases.

### Three defects only running it found — assigned

The screens were not that agent's to touch, so it measured each against the live app and wrote
exact diffs. Now with an agent owning `src/ui/screens/**`, `App.tsx`, `components/**`:

1. **An ungraded close pays 0 points on the site map** — `0/11 pts · 2/3 closed`, should be
   `6/11`.
2. **`ALL AT PAR` and the gold tally are unattainable in worlds 1, 5 and 6.**
3. **From the real accessibility tree, a closed ungraded order is announced
   `"Closed. no medal."` — identical to an untouched level's `"Open. no medal."`** The "must
   not render as a missing medal" requirement, failing in the one place sighted players never
   see. The visual ring was already correct, which is why nothing else caught it.

Plus `Results.tsx` still awarding a gold badge, and `App.tsx` drawing par as a target (`78/78`).
`copy.ts`'s ungraded `successLine` is routed to the mute-verbs agent that owns it.

**The instruction that matters most for that work: ungrading removes the grade, not the
reward.** The ceremony still fires, the audio and celebration take the `pass` path, and the
level still pays 3 points. Nothing may read as a consolation or a withheld medal.

### Note for anyone reading a red test run today

Two full-suite runs reported failures with **10x inflated timings that never reproduced in
isolation** — contention from parallel agents, not real. Re-run before trusting a red.

### 2026-09-05, 22:25 — the mute-verb sweep is done (merged)

Green at **1665 tests / 66 files**, tsc / build clean. All 86 reference solutions pass
unedited; nothing under `src/levels/**`, `src/game/**`, `src/meta/**` or `src/ui/panels/**`
was touched.

**The finding that reframed the whole job.** Before changing anything it traced what a player
can actually *read*, and found exactly two channels: the **throw channel** (`SimError` →
`verdict.failure.message` → console) and the **return value** the verb hands the program. **A
trace event is not a player channel** — `store.ts` builds the console from `print` events and
one failure line, and `describeBlock()` is exported, tested, and *called by nothing*. So
`MoveEvent.reason`, the model `FIX-POWER.md` held up as exemplary, is for replay and tests, not
for the player. Every `false` case therefore had to answer a second question: **is the reason
reachable by a free call?**

| Verb | Ruling |
|---|---|
| `plant()` | `reason` on the event, reference page names the three free checks. **No `canPlant`** — every input is already free and exact, so a boolean restores the same one bit and a string hands World 2 the answer it asks the player to assemble. |
| `send()` | **Throws.** `move(99,…)` threw while `send(0,99,…)` shrugged. A dropped message also adds a second cause to World 7's hardest symptom — an empty inbox — which already happens to *correct* programs that forgot `sync()`. |
| `spawn()` | `detail` on the act event. No `canSpawn`: `blockReason` is asked about arrival at `t + costs.spawn`, so `canMove` is inexact and fixing that would move `w7-02`'s fleet size, i.e. difficulty. |
| `pickup()`/`drop()` | `reason` on both. They stay numbers — `w8-02` infers real carry capacity from a *short* pickup, so the numeric contract is load-bearing. |
| `applyMachineChange()` | **Left `false`, stopped and reported.** See the ruling below. |
| `refuel()` | **Left `false`.** `w8-05` calls it *speculatively* from wherever a bot stands and branches on the `false`; throwing would break the finale's own solution. |

**The `use()` ruling — returns `false`, does not throw.** It was the worst case in the sweep:
it returned `true`, wrote `ok: true`, emitted a `machineChange` whose `before` and `after` were
identical, and played the `use` cue — four assertions that the machine had been operated. A
mute *success* is undetectable by the program **and** by the objective, so the only symptom is
an objective that stays open after a run that looked complete, and the player debugs the
objective.

It applied the deciding test more carefully than I did: **`use` is the only verb that never
names its target.** `power("sub-3")` carries its target in the argument, so that call is
permanently wrong; `use(dir)` carries a *direction*, and the bot walks one tile and the
identical expression succeeds. The refusal is positional, and position is the most transient
state in the game. A throw would also have been actively wrong — 19 authoring sites produce
cycle-less machines, seven on `w8-05`, whose own reference **stands bots on `depot-*` and the
slots** to `drop()`. Throwing would lose the run for standing on a delivery bay.

Its new `copy.test.ts` guards the ungraded line by **rejecting grading vocabulary**, which
caught its own first draft, "filed under done".

### Two decisions that were sitting in a code comment — ruled

Found by grepping `w8-05.ts` to verify a leftover, not by anything pointing at them. Worth
noting as a process failure: `docs/FIX-FINALE.md` flagged both for the orchestrator and nothing
surfaced them.

1. **`w8-05` par stays at 1050.** The reference comes in at 560–977 across the three surviving
   seeds, so there is ~7% headroom against a campaign whose median is 0%. Loose by local
   standards — but this is the finale, the one level where a player arrives with a large program
   and the fewest chances to iterate, and tightening a medal **nobody has closed yet** is tuning
   a number with no evidence behind it. It folds into the Worlds 3–8 par measurement, which is
   already queued and which is the instrument that should decide it.
2. **Reconcile the `w8-05` CURRICULUM drift.** §10 still says seven seeds across six independent
   axes (now `[1, 4, 7]`), an enciphered partly-corrupt signal stream (now a clear manifest), and
   a 500-line reference (now 487). Bundle it with the `w2-01`/`w2-05` drift already open. The
   constant audit just demonstrated that unenforced doc-versus-code invariants are this
   codebase's most common bug class; a curriculum that describes a level that no longer exists
   is exactly that.

### Still open from the sweep

**`applyMachineChange` / `link` / `transmit` unknown-id ruling.** By the deciding test an
unknown *machine* id is permanent, so `link("reactor","ghost")` is a branch that can never flip
— but `api-bindings.ts:124,180` call it with ids *guaranteed* not to resolve (`''`) purely to
charge the tick, so throwing today would turn `transmit()`-with-no-antenna into a stopped run in
W5/W6. **My reading, for whoever takes it: the tick-charge path and the change path should be
separated first, then a player-supplied unknown id throws.** Verify that against the code before
acting — it reopens `power()`'s shipped unknown-id ruling and lands in level-owned files.

### 2026-09-05, 22:35 — UI and visual audit (`docs/AUDIT-UI.md`, 1318 lines, 23 findings)

Read-only, 21 screenshots in `docs/shots/audit-ui/`. **It found a crash nobody was looking
for**, which is the argument for the instrument: two playtests and an incentive audit had
each been past this screen.

**1. The publish offer takes the whole app to a black screen.** `PublishDialog` memoises
`selection` on `offer`; its effect calls `setSelection`, which does
`set({ offer: { ...offer, selection } })` — new identity every call, so it never settles.
React throws, and with **no error boundary above the modal layer** the entire tree unmounts to
`--bg-void`. I confirmed the mechanism by reading both files. **There is no screenshot of the
publish dialog in the audit because the dialog cannot be reached.** Assigned, with the
archaeology as the first task: both testers *did* reach this dialog, so either it regressed
today or the reproduction needs a state they never hit — and that has to be settled, because a
right patch on a wrong diagnosis still leaves the trap.

**2. The site view is empty until you press Run.** Every level opens on a black rectangle
reading `NO TRACE ON FILE`. The player is asked to write a program against a map they cannot
see.

**3–10.** The divergence is thrown away on dismiss — after being stated four times · 68–81% of
the brief is below the fold, **including the hint button**, with no scroll cue · the reference
is 11,444px of manual through a 390×290 slot · the report's last paragraph is drawn *under* its
own footer, unscrollable · the grid cannot be counted and is not drawn at all at 13" ·
`--ink-dim` fails AA on all three surfaces across 111 uses, and ghost buttons read as disabled ·
the medal is ring hue alone, no glyph, no legend, and **`MedalBadge` exists but is unused** ·
the 340px detail cap starves the brief while the editor takes 198ch it cannot use.

**11–23** include: awards outrank the medal on the report; the commendation shelf is
unreachable; 8 shortcuts and 3 announced; 576px of dead rail beside 15-character truncation;
`skip the ceremony` is a permanent setting; **three disagreeing tick counters**; two unhandled
rejections.

### The verdict on "does it look good" — worth quoting

**"Not yet — it looks like a very good design system that nobody has laid out."** The tokens,
the spacing scale, the mono/prose split, the motion and five individual screens are at the bar.
The composition is not. Against the genre: Opus Magnum opens on the bench and closes with
histograms; this opens on a black rectangle and closes with the word `gold` in a box the same
size as `SEEDS 1`. TIS-100's board is a countable lattice and its manual is a printed document;
here the lattice is 18% alpha over a floor of the same value and the manual is 12,000 characters
through a 290px slot. Baba Is You never spends a hue it does not mean; `src/levels/index.ts`
adds **eight world accents on top of a six-colour semantic palette**, three of them outside
`tokens.css`, and **World 7 *is* `--danger`, World 8 *is* `--gold`**.

Its six changes, in order: draw the level on entry; give the medal and a comparison the top of
the report and cut the restatements; make the grid countable and draw the divergence on it; fix
the contrast token; rebalance the columns; spend the world accents down.

**It also answered the question the viewport work deferred to it: yes, cap the code column.**
At 2560 Monaco is 1572px with a 7.79px character — **198 characters of measure against a longest
campaign line of 43**. And the 340px detail cap was set against the wrong number: trebling window
height leaves the brief at 307px holding 1108px of content.

**Discipline worth noting:** it deliberately did not report the six ungraded levels or any
failure-message wording, both being concurrent agents' territory, and kept its run-report
findings to counts of blocks and repetitions rather than sentences.

### Assigned now

- **The crash** — own agent, `src/meta/**`, archaeology first, regression test as the deliverable.
- **The error boundary over the modal layer** — routed to the screens agent that owns `App.tsx`;
  `PanelBoundary.tsx` already exists and should be reused rather than duplicated.
- Findings 6, 9 and 12 routed to the same agent as small adjacent work, with the note that any
  medal legend needs an honest `CLOSED` state now that six levels have no medal.

Everything else in the audit is unassigned and is the largest block of open work in this file.

### 2026-09-05, 22:45 — "looks boring." Art-direction spike commissioned.

The user, on reading the UI audit: *"the verdict is — looks boring. I would agree. Can we make
it look like a cool GAME? Something I would want to showcase on Steam (we are not going to
Steam, but that's the benchmark)."*

**This is a different charge from the audit's**, and the distinction is the whole item. The
audit judged *correctness* — contrast ratios, scroll cues, wasted measure. Fixing all 23
findings yields a well-laid-out version of the same boring screen. Both streams are worth
running; neither substitutes for the other.

**The diagnosis handed to the spike, to test rather than accept:**

1. **The screenshot is of the chrome, not the simulation.** Every benchmark game is
   screenshot-worthy because the *sim* is the spectacle — Opus Magnum's arms, Factorio's belts,
   Baba's rules sitting on the board as objects. Here the hero rectangle reads `NO TRACE ON
   FILE` until Run is pressed, then draws 18%-alpha grid lines over a floor of the same value.
   **A puzzle game that opens on a black rectangle has thrown away its establishing shot.**
2. **The game has a strong identity it will not commit to.** Dry institutional bureaucracy is
   TIS-100 territory, and TIS-100 wins by committing *absolutely* — fake 1970s manual,
   monochrome CRT, no concession. **Half-committing to a bit is what reads as boring.**
3. The palette already fights itself: eight world accents over a six-colour semantic palette,
   three outside `tokens.css`, with World 7 *being* `--danger` and World 8 *being* `--gold`.

**Format: a spike, deliberately.** Three implemented, running, screenshotted directions — not
mockups, not a filter — compared at the same level, size and tick so they can be flipped
between. Taste is the user's; they pick by looking. Told to reach for the strongest version of
each bet rather than the safe one, because a timid spike tells them nothing, and to take a
fourth direction if it is obviously better.

**The constraint that outranks the brief:** readability beats beauty every time. This is a
puzzle game and the player reads the board to debug their program. Anything that makes the grid
harder to count, the bot harder to find or a divergence harder to see is wrong however good it
looks — and each direction must state what it costs in legibility. Contrast is a floor, not a
preference; the audit already found `--ink-dim` failing AA across 111 uses.

Scoped to `src/render/**` and `src/ui/styles/**` — enough to change theme, palette, canvas,
type scale and spacing without touching component structure, and disjoint from the two live
agents. A direction needing markup changes gets described and screenshotted as close as
possible, not smuggled in.

Report: `docs/SPIKE-ART-DIRECTION.md`, shots under `docs/shots/art/<direction>/`, three
separate commits so any one can be taken forward alone. A recommendation is required —
"they're all fine" is a failed report.

### 2026-09-05, 23:10 — the screen half of A7, and the crash contained (merged)

Green at **1692 tests / 68 files** (+27, +2 files: 13 site map, 14 results), tsc / build clean.

All five defects the previous agent measured but could not touch are fixed. Boot Sector reads
`6/11 pts` instead of `0/11`; `ALL AT PAR` and the at-par aside now count an ungraded close,
while the `GOLD`/`SILVER`/`BRONZE` columns stay medal-only — a `Tally.atPar` was added rather
than blurring the medal counts, which is the right side of that line.

**The accessibility fix, in the real tree:**

```
before: "w1-01, Cold Start. Closed. no medal."      "w1-05. Open. no medal."
after:  "w1-01, Cold Start. Closed. Not graded."    "w1-05. Closed. gold medal."
                                                     "w2-01. Open. no medal."
```

Three states now say three different things. `MedalBadge` took a real `Medal | null` arm
rather than a call-site special case.

**A regression the browser caught in its own fix, which no test would have:** `medalForLevel`
returns `null` on an ungraded level *regardless of whether the run passed*, so a **failed** run
was stamped with the green closed mark under the words `WORK ORDER OPEN`. Now routed through
`reportedMedal`. That is the second time today that driving the thing caught a defect in a fix
that typechecked.

**AUDIT-UI F21 — the modal layer now has an error boundary.** The five stacked modals each get
the existing `PanelBoundary`. Reproduced against the live crash: `#root.children.length` goes
`0` → `1`, the workspace survives with the player's program intact, and the fault contains to a
145px *"The publish offer — unavailable"* notice. It also found that **most of what the crash
actually cost was a layout bug**: without `.modal-layer { flex: none; height: auto }` the
fallback inherited `height: 100%` and pushed the editor off screen. The `src/meta/**` loop
itself is untouched and still throws — that fix is a separate agent's, and the boundary is
containment, not a cure.

### Open from the audit, with owners now free

- **F1** — a medal legend on the site map. `MedalBadge` now has the honest `CLOSED` state it
  needs and `medal={medalOf(node.level, node.progress)}` drops straight in; the legend layout
  is a design call.
- **F9** — `.modal__body { min-height: 0; overflow-y: auto }`. Real bug: the run report's last
  paragraph is drawn under its own footer.
- **F18** — blocked on a ruling: the `GRADE` stat's denominator counts medals while the header
  counts points. **Ruling: the header follows `reportFor`.** Points are the thing A7 made
  uniform across graded and ungraded levels, so a second denominator beside it is the
  disagreeing-tick-counter bug in miniature. Whoever takes F18 should verify that against the
  code before acting.
- **F22 half** — `aria-label="Playback speed"` on the speed combobox; the accessible name is
  currently just `1x`. Left rather than half-done.
- The ticks cell still reads `par 78 · best 78` on an ungraded level. One ternary; not a target,
  no colour, so it was flagged rather than changed.

### 2026-09-05, 23:20 — the art brief, sharpened

User: *"I would want something that has an actual art style. Not a 'UI'. A 'game'."*

**My original brief was too small and this is a correction to it, not an addition.** I scoped
the spike to theme, palette, type scale and spacing — which is a **restyle by construction**. A
perfectly executed restyle still answers "what UI framework is this" rather than "who drew
this". Recorded because the same mistake is easy to repeat: scoping an art task to CSS
variables guarantees a CSS-variable answer.

**What the target actually is:**

- **The things in the world must be drawn, not tokened.** A bot should read as a machine with a
  silhouette and a front, not a coloured rounded rect. Rock should look like rock; a feeder like
  industrial equipment; a depot recognisable from across the board. The board is currently
  semantic fills and it needs to look **authored**.
- **Silhouette at tile size is the real design problem.** `w8-05` is 48x40 at roughly 24px
  tiles, and the visited-tile trail has to stay legible *on top of* whatever gets drawn. Dense,
  small, still readable is exactly what Factorio and Opus Magnum solved.
- **Identity, not surface.** A title treatment and a consistent line/dither/edge language —
  something recognisable cropped to a 200px square. TIS-100 is identifiable from any crop.
- **The chrome must belong to the same world as the board.** The audit's observation that the
  warm-grey canvas does not join the chrome gets fixed by making them one artefact.

**Scope grew to match: the agent may now author and commit real art assets** — hand-authored
SVG, sprite sheets, pixel art as data, canvas routines with craft in them. `src/render/sprites.ts`
is the existing seam. Ownership extended to `src/assets/**` and `public/**`. Constraints: no new
runtime dependencies, nothing fetched — everything authored in-repo with stated provenance and
weight.

**Unchanged and still outranking all of it: readability beats beauty.** The player debugs by
reading the board. A direction that makes the grid harder to count, the bot harder to find or a
divergence harder to see is wrong however good it looks, and each must state that cost honestly.

### 2026-09-05, 23:45 — window reset. Two more agents out; UI punch list deliberately held.

State verified: main `d8ac109`, **1692 tests / 68 files**, tsc / build clean. The wake-up brief
was four hours stale — everything it listed as in flight had already merged. Trust the last
sections of this file over any resume brief.

**Scheduling call: the UI audit's ~19 remaining findings are held until the art spike lands.**
Most are contrast, spacing and palette fixes on the exact stylesheets the spike is replacing.
Doing them now is work thrown away twice, and worse, it would make the spike merge against a
moving target. They get **re-triaged against whatever direction wins** — some will be obsolete,
some more urgent. Three stay live regardless because they are structural rather than stylistic:
F9 (the report's last paragraph is drawn under its own footer), F22 (`aria-label` on the speed
control), and the medal legend.

### In flight — four agents, disjoint

- **Art direction** — highest value, and the one the user is waiting on. Brief was sharpened
  from restyle to art style; scope now includes authoring real assets.
- **Publish crash** — the cure; the containment already merged.
- **Incentives** — audit findings 3 and 5–12, plus cutting fifteen commendations to about five.
  The evidence that makes it cheap: **both testers say the layer changed their behaviour zero
  times.** Told to keep `REOPENED ON PURPOSE` and `A SECOND LOOK, AND A THIRD` unless it can
  argue otherwise — they were added this week to replace the streak and they pay for the loop
  the game is made of — and to leave `personalBestLine` alone entirely.
- **Invariants** — the guards. Primary deliverable is *not* more fixes: it is the test that
  enforces the 24 confessed `verbatim`/`mirrors`/`authoritative` claims, plus unused-export
  detection, judged by which of the five known instances each would have caught.

### Two rulings issued with that work

1. **`budgets.ts` gets a structured unit field.** The label goes back to saying whatever reads
   best; parsing survives only as a fallback, and a level that declares is never guessed at.
   Same shape as the guards: replace an invariant maintained by prose with one maintained by
   the type system.
2. **Delete Performance Review tier 1.** `DEVELOPING` (0–24%) is unreachable — the medals-only
   denominator floors a graded record at 33%. A grade nobody can ever see is dead content, and
   this game deleted an entire screen on that reasoning three hours earlier. Four tiers. The
   agent was told to verify my arithmetic first and to propose the honest ladder if tier 2 is
   also unreachable in practice.

Next wake-up armed for 04:42.

### 2026-09-05, 23:55 — the art brief, third and final sharpening

User: *"Don't be afraid to throw away everything and style it new. Nothing is set in stone. The
current Website is a UI — I want an ART DIRECTION. Be bold. Try out things. See what sticks.
Change entire things, throw away assets and try others. I want it to be a GAME, not a WEBSITE."*

**My ownership split was the binding constraint, not the brief.** I had given the art spike
`src/render/**` and `src/ui/styles/**` and told it to *describe* structural changes rather than
make them. That caps the work at repainting: a transformation that cannot touch component
structure cannot stop something looking like a dashboard. Worth recording as the general
lesson — **twice now the art work was limited by how I scoped it rather than by the idea.**
First to CSS variables, then to no-markup.

**Now:** the art spike owns **all of `src/ui/`** — screens, components, panels, `Workspace.tsx`,
`App.tsx`, styles — plus `src/render/**`, `src/assets/**`, `public/**` and `index.html`. The
incentives agent was pulled off every UI file and confined to `src/game/**`, `src/levels/**`
and docs; it now hands over diffs, and was told to **lead with the intent rather than the diff**,
because intent survives a rebuilt component and a diff against a deleted one does not.

**Licence granted explicitly:** restructure the layout, delete components, replace the panel
system if the panel system is what reads as a dashboard. The existing tokens, spacing scale,
palette and type are **not a baseline to preserve** — they are what was judged, and the verdict
was boring. Told to be bolder than feels sensible, and that one of three directions being too
much is a success condition, not a failure: *"see what sticks" is licence to fail on one.*

**What still holds, and deliberately only this:**

- **Readability beats beauty** — with the honest version spelled out: a direction may cost real
  legibility if it says so and argues the trade.
- No gameplay, par, medal, budget, objective, level or difficulty change. Character count stays
  deleted.
- Motion respects `prefers-reduced-motion` and `settings.celebrations`; per-frame cost stated.
- No new runtime dependencies; assets authored in-repo with provenance and weight.
- Green at the end. **Tests asserting current markup may legitimately need rewriting** — rewrite
  to assert behaviour. A renderer test failing because the palette changed on purpose is a
  signal to update the test; one failing because the grid stopped being countable is a signal
  to stop.

---

## 2026-09-06 — publish crash merged; the reward and invariant agents still out

**Merged: the publish dialog no longer loops the render** (`f90f842`). Main is green at
**1698 tests / 69 files**, tsc and build clean.

The diagnosis is worth keeping because it is a *class* of bug, not an incident. `PublishOffer`
carried a `selection` field, so `setSelection` minted a new object identity on every keystroke,
and a memo that legitimately depended on `offer` could never converge. The regression commit is
`befef62`, which added `offer` to the memo deps — **the correct move by the rules of hooks**. It
stepped into a trap laid the day the component was written. The fix is structural rather than a
guard: `offer` is now write-once (minted by `offerPublish`, cleared by confirm/skip) and
`confirmPublish(selection)` takes the draft as an argument. An identity guard or narrowed deps
would both have stopped today's loop while leaving the trap armed for the next reader.

**Rejected on the way:** a hand-written deep compare (stops guarding silently the day
`PublishSelection` gains a field) and a sibling store field (same trap for the first component
that subscribes to it). *A mid-interaction draft does not belong in a frozen fact.*

`src/meta/__tests__/publish-dialog.test.ts` brings its own React — a hand-cranked renderer with
real hook semantics and `Object.is` dep comparison, no jsdom, no testing-library, no new deps.
Verified by checking the two pre-fix sources back out under it: **3 of 6 fail before, 6 pass
after**, and it settles in exactly 2 passes rather than never. `skipPublish` and `confirmPublish`
had **no test at all** in the repo before this.

**Two findings picked up in passing:** F13's 37-word scolding now fires only when actionable and
is one sentence; the COST tab no longer repeats the status bar verbatim; the Repository's Monaco
gained `ariaLabel: 'lib.ts'` (two textboxes were both named "Editor content" in the a11y tree).

**Still open from that report:** F20 is live on main — `src/ui/library.ts:90` throws
`Uncaught (in promise)` from `installTypes` on level entry, logged twice per entry. Routed to
whoever owns `src/ui/` when the art direction settles. The modal-layer error boundary is still
owed and still worth having with the loop gone.

**In flight overnight:** the art direction spike (the one that matters), the reward-layer cut,
and the invariant guards. Reveille armed for the window reset at 04:42 with a full brief; the
Mac is caffeinated. The art comparison shots go **to the user to pick from** — that call is
taste, so it is theirs. Every other call is mine.

---

## 2026-09-06 — the reward layer merged; two agents spawned on the files it freed

**Merged: fifteen commendations cut to five** (fast-forward to `3c96853`). Main green at
**1698 tests / 69 files**. The test applied to each was *"does it name a specific thing the player
did, that they would be pleased to have noticed?"* — attendance, completion, and restatements of a
medal the player is already looking at all fail it.

**Survivors:** `second-look`, `raised-again`, `came-back-for-it`, `minimal-observation`,
`repository`. The consequence worth keeping is structural rather than cosmetic: **no surviving
commendation reads a medal.** `RunFacts` lost `medal`, `ticks`, `parTicks`, `blockedMoves`, `stars`,
`previousBestTicks` and `worldResults`, so the A7 hazard — a commendation keyed to a medal on a
level that has none — is now *absent* rather than *handled*. `WorldResult` and `ELEGANT_FACTOR` are
gone entirely.

The agent **corrected the audit on finding 6** and I accept the correction. The audit counted six
systems paying for not bumping; `w3-01`'s `clean-run` counts failed *pickups*, a different family,
so the live count was five. But the count was never the defect: **a tick cost is proportional and a
bonus gate is binary, and only one of the two can be traded against.** Beside an information budget
the pair is jointly satisfiable only by a hardcoded route — precisely what the multi-seed
conjunction exists to defeat. Recorded as **A10** so it cannot regrow. Its defence of `w7-03`'s
`no-bumps` also stands: on a one-lane tunnel that bonus asks *"did you schedule?"*, not *"did you
plan a route"*, and it is the level's only one.

**Finding 3 fixed with a consequence I would not have predicted:** `isLevelUnlocked` now opens the
next two on a close and a whole world on a sweep — the beginner spent 55 minutes and 11 runs stuck
on `w3-03` and then quit. It required a companion fix, because a player who skips ahead would
otherwise arrive holding `scan()` with no requisition card: `openLevel` now delivers every unsigned
command in the order's API surface.

Save compatibility is `rescueLevels`' whitelist applied to a second field — retired ids dropped on
read, unrecognised ids kept, because a save written by a build that is not this one must not be
eaten by this one. Proven on a seeded save in the browser, not just in tests.

### Spawned on the freed files

**Discrepancy agent** (`src/meta/**`, `src/game/store.ts`) — finding 10. The game tells the player a
published routine failed on a seed and gives them **no way to run that seed**, while the card itself
offers `Stop raising these`. An accusation with no instrument trains the player to mute the one
mechanism that challenges overfitting, which is the most likely wrong mental model a player of this
game can form. Decision made and handed down, not asked: **give them the seed.** The layering
constraint is the hard part — `store.ts` must not import `src/meta`.

**Bonus and par agent** (`src/levels/**`, `docs/DESIGN.md`) — told to **replace, not just delete**.
Most bonuses restate the required solution with a tighter number, which is the first idea at a
smaller tolerance rather than a second idea. The bar is `w6-02`'s `name-the-fault`, which asks the
player to report *which byte was altered* — a question the objective does not ask. Granted licence
to author new bonus objectives; refused licence to touch par, budgets, thresholds or required
objectives. Also carrying the Worlds 3–8 par measurement, which it must split across sub-agents.

### Held for the art direction, deliberately

`docs/FIX-INCENTIVES.md` §A, §B, §C, §H, §I are all `src/ui/**` and wait for the direction to land:
the shelf's `2/5` fraction, the dead `award('no-regressions')` call, `.screen-stat__streak` in
`screens.css`, finding 8's *limit vs budget* naming (two different tick numbers on one screen need
two different words), and findings 9.1/9.2 — `LibraryUsage` already computes `ticks` and `calls` on
every meta run and throws them away.

**Finding 11** (`src/runtime/**`, the bonus star graded on one seed) goes to the invariants agent
when it lands; the exact three-file patch is in §E. Done tonight: the stale fifteen-commendation
comment in `src/audio/__tests__/sounds.test.ts`.

---

## 2026-09-06 — invariants merged; the guard found a live bug before the report was written

**Merged (`worktree-agent-ae39fc29957bc928a`, clean, no conflicts).** Main green at
**1723 tests / 74 files**, tsc and build clean.

Two guards, and the honest scorecard for them is the part worth keeping. `confessed-invariants`
turns the `verbatim|mirrors|authoritative` index into a registry exact **in both directions** — a
new confession fails until registered, a deleted one fails until removed — with seven guards
hanging off it. `unused-exports` is an exact-set ratchet over 39 dead exports with **no new
dependency**, and its load-bearing rule is *a re-export is not a read*, which is exactly what made
`BONUS_STAR_WEIGHT` look alive.

**Neither catches two live implementations under different names**, and the agent said so plainly
rather than papering over it: G2 gets the dead-copy cases and is blind wherever both copies are
live; G1 gets the hardest case (three of four copies are not code) and misses the rest. A guard
that admits its blind spot is worth more than one that implies it has none.

**The index was 24 hits and did not hold 23 invariants.** Nine real duplicated values, **eleven uses
of the word in ordinary English** ("safe to render verbatim" means *render it as-is*), and three
real invariants with no literal to compare. The eleven false positives are the reason nobody read
that index twice.

**The guard found a fifth instance of the bug class within minutes of existing.**
`src/meta/profile.ts:23` declares a **second `SILVER_FACTOR`**, its comment states the pre-`FIX-PAR`
rule, and `medalThresholds` beside it drops the `par + 1` floor — so on `w6-01` (par 1) and `w5-02`
(par 2) the Refactor screen projects a silver rung the engine does not use. **Two of the five known
instances reproduced in one 223-line file, in a file the audit had explicitly cleared.** Encoded as
`KNOWN_OPEN` and asserted *exactly*, so fixing it fails the test until the entry goes. Routed to the
discrepancy agent, which owns `src/meta/**`.

**Tier ruling, arithmetic first:** the floor is exactly 33.3%, so tier 1 was unreachable — but
**tier 2 is reachable**, since all-bronze lands at 33.3%, inside its band. Four tiers is the honest
ladder, not three. Ranks stay numbered **2–5** because they are persisted, and renumbering would
withhold a memo from a player who had never read it. No threshold moved.

**Budgets:** `Objective.meter` and `unit` now live in the engine, so a budget declares its unit
instead of having it parsed back out of its own prose. `budgets.ts` had its own copy of the union —
the bug class, inside the file being fixed for it. Parsing stays as a fallback and **only six
campaign objectives still infer from their label**, pinned exactly. Routed to the levels agent.

### Spawned: bonus stars graded on one seed

Finding 11, and it matters more than its size suggests. The medal reads the **worst** seed; the
bonus star is re-evaluated against the single returned trace, which is `runs[0]`. So `w3-02` shows
`TICKS 402 · par 332` with *"Bonus met — beat par by ten percent"* underneath — 402 is the worst
seed, 281 is seed one. The screen contradicts itself, and worse: **the bonus star is the one reward
in the game a hardcoded route can still win**, on the exact axis the multi-seed conjunction exists
to defend. Ruled: a bonus is a level objective and is graded on the same conjunction as every other
objective. It will make some stars harder, and that is the correction rather than a side effect.

Told to treat §E's patch as a proposal rather than gospel — the agent that wrote it could not run
it — and that the deliverable is **the list of which bonuses across all forty levels change status**,
because that list measures how much of the layer was being won on seed one alone.

**Four agents live:** art direction, bonuses-and-par, discrepancy, bonus-seed-grading.

---

## 2026-09-06 — the art spike landed; the window reset killed four agents mid-work

**Merged: the discrepancy layout goes on the run set** (`183e43c`). Main green at
**1735 tests / 75 files**. A player can now press Run on the work order a Discrepancy names and
watch it fail on the layout the card is talking about, then fix it and watch the card clear —
verified end to end in a browser, not reasoned about.

Three decisions in it worth keeping. **Own seeds run first**, because the runtime reports the
*first* failing seed, so an audit layout can only become the reported failure once everything the
level always asked for already passes — the player is never shown a layout they were not told about
while they still have an ordinary bug. **A `note` travels with the seeds** and `run()` prints the
raiser's sentence to the console, because the campaign has no vocabulary for *why* an extra layout
is on a schedule and inventing one in `store.ts` would be the leak the import ban exists to prevent
— and the console is the one surface that stays legible while the art rebuild is live. **The write
lives in `src/meta/campaign.ts`**, not on `MetaHost`, because `MetaHost` is implemented by a React
integration and so is live too late for something that must hold from the moment the save is read.

`MIN_CLOSED_BEFORE_FIRST` 6 → **4** and `COMPLETIONS_PER_DISCREPANCY` 5 → **3**, both from
measurement rather than taste: the first never gated anything (the Repository is provisioned by the
tenth close anyway), and the second was sized against the campaign when the real ceiling is the
**candidate pool** — only ~10 of 34 work orders import `lib`, and one raise per order caps it there.
Frequency should follow how often the player's code is brittle, not a counter.

The handed-over `SILVER_FACTOR` bug is fixed, imported from `engine/index.ts` rather than
`game/score.ts` — meta→game would have been a new worse edge. Removing the `KNOWN_OPEN` entry took
**four** sites, not one, and the agent flagged that rather than editing quietly: it **flipped** the
last assertion instead of deleting it, so `medalThresholds()` is now the fourth prose copy held to
the same standard. I reviewed that diff. It strengthens the guard.

### The art direction landed — three bets, and the pick is the user's

**Not three shades of one look. Three mark-making systems**, each a self-contained pair under
`src/render/art/`, with `standard` kept as a fourth selectable baseline.

- **SURVEY** — the fiction does the work: Kessler & Daughters never sent anyone to the planet, so
  the board is not a window onto the site, it is Survey's *plot* of it. Paper, hatching, stipple,
  ruled line; one ink at three weights; no gradients, glow, bevels or rounded corners anywhere.
- **SIGNAL** — one phosphor, no second hue, board built from raster lines because that is what the
  device physically draws. Terrains become raster *patterns* rather than colours, and the trail
  stops being an overlay and becomes persistence.
- **DEEP SITE** — one fixed north-west key light for the whole game, so shading becomes a language
  rather than an effect; everything on a four-step Bayer ramp, which is a **legibility** decision:
  at 24px a checker resolves honestly where a smooth ramp turns to mud.

**Shots sent to the user; the direction is theirs to pick and I am not picking it.** Everything
else about the branch I decided: it merges as four selectable modules, so nothing about the merge
forecloses the choice.

**Three things came free with it.** The empty board is fixed — `setPreview` draws the level before
the first Run, which was the UI audit's worst finding. Tiles doubled on `w4-05` and `w8-05`, with a
test that no level shrinks at any size. And **all three directions render faster than the shipped
look** (0.30–0.39ms against 0.54ms; terrain rebuild 1.2–1.7ms against 3.4ms) — performance was the
risk I expected to trade against and it evaporated. All three clear the `--ink-dim` contrast bar
that `standard` fails on every surface.

The agent **argued with `FIX-TRAIL` §7 and changed its test**, correctly: "the cold end is a
darkening" is right for three directions and meaningless against Signal's near-black floor. The
invariant is now contrast against each direction's own `referenceFloor`. That is a strengthening,
not a route around. **Known gap, deliberately left:** machines, crops and items still come off the
tile atlas — it refused to skip those passes to make the boards prettier, because crop maturity is
required to solve `w2-02`.

### The window reset killed four agents mid-work; all state survived

Bonus-seed grading, bonuses-and-par, and its two sub-agents all died on the same 429, none on an
error. Every worktree was intact and uncommitted. All resumed with a brief naming exactly where
they stopped, and the parent told to **re-spawn its sub-agents to continue** rather than redo their
work.

### The guards fired on the art branch, which is them working

Five failures: new exports nothing reads yet, new prose matching the confessed-invariant index, and
`TIMELINE_H` — whose **premise is gone rather than violated**, since the board is now the full
height of the workspace and the timeline floats over it. That is a judgement call, so it went to an
agent rather than getting a mechanical patch. **Main was kept green throughout** by having that
agent absorb the art branch into its own worktree instead of merging the art branch red.

It was told the thing that matters about these guards: the original index was 24 hits holding nine
real invariants and eleven ordinary English uses of the word "mirrors", and **that ratio must not
come back** — reword the prose, do not register the false positive. And that deleting a dead export
beats listing it.

---

## 2026-09-06 — bonuses are graded on every seed now

**Merged** (`37daffd` + `b3fca45`). Main green at **1744 tests / 76 files**, tsc, build and eslint
clean but for the known `w5-01.ts:32` false positive.

**Three of 37 bonuses change status**, and the shape matters more than the count:

| level | bonus | per-seed | was | is |
|---|---|---|---|---|
| `w7-02` | `within-ten-percent` | `Y Y n Y` | star | refused |
| `w7-04` | `within-bound` | `Y Y n Y Y` | star | refused |
| `w8-01` | `audit-tight` | `Y n n n` | star | refused |

**All three are budget bonuses.** Not one predicate bonus moved — `no-overshoot`, `no-bumps`,
`single-pass`, `no-resurvey` hold on every layout or none. So seed-one grading was softening
*precisely* the half of the bonus layer where the number was supposed to be the challenge, and
leaving the half that was never at risk alone. That is a better finding than the count.

The proof is the part I would keep: three programs differing only in when they group the round by
class, the third grouping **only when the yard matches seed one** (`crates.length === 8 &&
depots.size === 4`) — a hardcoded route written down as a program. Seed one meets the bonus, no
other seed does, the star is refused. The grouped-everywhere program still earns it. Before and
after in the browser: `TICKS 332 · gold · 4 pts · 1 star` with the seed table reading 218 and 332 —
three numbers that could not all be true — against `TICKS 332 · gold · 3 pts` where both numbers
are seed two's.

**It departed from the proposed patch in four places and was right each time**, which is why the
brief said to treat that patch as a proposal: `evaluateObjectives` instead of a second
`buildVerdict` (two of the six proposed args were noise and the second verdict built a discarded
failure message); **generalised `worstPerObjective` rather than adding a near-duplicate** — one copy
of the rule, which is the whole point of the guard work that landed hours earlier; template list
from the *reported* run rather than `runs[0]`, matching what required objectives already do; and
`senseTotals(trace)` hoisted so bonus and required objectives are graded against identical counts.

**A trap found on the way:** `withBonus` passed no `ops`, and `withinOps` reads `ctx.ops ?? 0` — so
an ops-budget bonus was **always trivially met**. No shipped bonus used it. It is closed rather than
documented.

`withBonus` is now deleted, which its own comment had asked for: *"Delete this the day the verdict
carries them."* Today was the day — both `RunnerPort` implementations carry the bonus, including
`FakeRunner`, which never needed `withBonus` specifically, only *someone* to put bonus rows in the
verdict. Leaving it would have silently re-graded, on one seed, any future bonus the runtime failed
to report.

**One content finding routed to the levels agent, and it is a good one: an idle `print()` on
`w8-05` meets two of its three bonuses** — `under-budget` and `no-blocked-moves`. A program that
does nothing collects two thirds of the finale's optional credit. `no-blocked-moves` was already
marked for deletion; this is the argument for it, and it puts `under-budget` on that level under
suspicion too.

I edited one hunk in the levels agent's territory — `finale.test.ts` compared banked work against
every met objective, which held only while the verdict carried required objectives alone. It was
the only red test on main and main does not stay red overnight. The agent has been told, and told
that its version wins if they collide.

---

## 2026-09-06 — the art rebuild is on main, guards and all

**Merged** (`a8cd0a6`). Main green at **1772 tests / 77 files**, tsc, build and eslint clean but
for the known `w5-01.ts:32` false positive. The four art directions ship as selectable modules;
**`DEFAULT_ART` is `survey`**, which is the spike's own recommendation and **not the user's
decision** — that is still open and it is one line to change.

### The geometry guard was retargeted, not deleted, and the argument is the interesting part

The old invariant was **vertical**: the hook subtracted chrome height from the viewport and CSS
declared that height. Making the board full-height with a floating timeline removed the subtraction,
so both constants are genuinely gone. But the restructure **reintroduced the same shape on the other
axis** — `HUD_GUTTER = 232` is the width held back beside the board, and `.hud-card { width: 232px }`
is what has to fit in it. Same two files, same failure mode: widen the card alone and the objective
read-out goes back over the grid, *which is the exact defect the float was introduced to fix.* The
number was written twice with nothing holding it. So the invariant is alive at a different pair of
constants rather than designed out. Verified by perturbation.

**No guard was deleted. None earned it.**

### The confession triage held the line

Four new hits, **one real**: the canvas copy of the twelve colours moved from `theme.ts` into
`art/standard.ts`, so the registration moved with it. The other three were the word in its ordinary
English sense — *"mirrors a dead bot rather than hiding it"* means **reports** it; *"mirrors the
direction onto the document"* means **writes** it, on a line describing the mechanism that
*prevents* a duplication — and were **reworded rather than registered**. The index is now 15 hits
holding 10 invariants, from 24 holding 9. That ratio was the whole point.

### A guard that was passing by accident, found and hardened unasked

`the palette is the same twelve colours everywhere it is written down` read the **live** `palette`
binding — which is `standard`'s only because that test file happens not to import `src/ui/art.ts`
and so never triggers its module-load `applyArtDirection(storedArt())`. Any future change to the
test graph would have made it compare **survey**'s palette against `tokens.css` and **fail on
correct work**. It now names `DIRECTIONS.standard.palette` explicitly. That makes the guard
independent of which direction ships as default — deliberately, because **a test must not be able to
veto the user's choice.**

### One export deleted, one listed, and the honest reason for a count that moved

`deepsite.ts LIGHT` was written once on the line declaring it and read nowhere — deleted, because an
unreferenced constant cannot move a pixel. `src/ui/art.ts chooseArt` was **listed rather than
deleted**: it is the write half of a read/write pair and there is no live twin doing its job, so no
edit to it can silently no-op — it is not the `BONUS_STAR_WEIGHT` shape. Building the picker it
implies would have been a behaviour change.

The test-only pin moved `[68, 32]` → `[67, 32]` **for a bad reason, flagged rather than buried**:
`Workspace.tsx` now sets the inline custom property `'--rig-w'`, and the scan's identifier regex
tokenises that string literal into `rig`, so a shipping file *appears* to read a test fixture named
`rig`. Stripping string bodies would fix it and would take real reads with it, since template
literals hold reads inside `${}`. Pinned at the honest number with the limitation written into the
file's existing "Known limits of a name-based scan" paragraph.

### Spawned: the direction-independent UI defects

Everything on this list must be correct under **all four** directions, and is checked under `signal`
specifically — it is monochrome, so anything fixed by adding a colour fails there. `AUDIT-UI.md`'s
held styling list is **still held** and explicitly out of scope until the user picks.

The three real bugs: `src/ui/library.ts:90` throwing `Uncaught (in promise)` from `installTypes`
twice per level entry (told to find out *why* — a swallowed rejection is a symptom and a bare
`.catch` is not a fix); the missing modal-layer error boundary, since the publish loop once
unmounted the whole app and nothing contains the next one; and the dead `award('no-regressions')`
call.

Then the legibility work: **a limit and a budget are not the same object** — `w1-01` shows `90` in
the rail, which ends the run, and `78` as par, which is a medal boundary, and both are labelled
"ticks". The engine now carries `Objective.meter` and `unit`, so the information exists and is
simply not being said. And **spending `LibraryUsage`**, which is computed on every meta run and
thrown away: routines-used and ticks-inside-them on the results screen, reuse count per routine on
the Repository panel. Explicitly **not** priced into anything — the veteran playtester used the
Repository heavily with no extrinsic reward at all, so the argument for the feature should be made
by the save file rather than by a brief.

---

## 2026-09-06 — eleven bonuses now ask a second question

**Merged** (`61626cb`). Main green at **1831 tests / 82 files**, tsc, build and eslint clean but for
the known `w5-01.ts:32` false positive.

Every replacement is **report-shaped**, earned by the reference on **every** seed, and
**tick-neutral** — `print`, `look` and `clock` are free — so **no medal moved anywhere.**

| level | was | now | the second question |
|---|---|---|---|
| `w3-01` | `clean-run` | `straight-runs` | how do the two sidings line up by row? |
| `w4-01` | `single-pass` | `within-60-look` | did you read the ray as a ray? |
| `w4-02` | `mark-budget` | `breadcrumb-trail` | what could a bot that never ran your program reconstruct? |
| `w4-05` | `fuel-reserve` | `filed-return` | do you know the way home before you drive it? |
| `w5-05` | `tight` | `name-the-weak-link` | what happens when one substation goes down? |
| `w7-01` | `no-slack` | `name-the-idle` | how long did each bot stand still? |
| `w7-02` | `within-ten-percent` | `even-share` | did you split the work, or split the map? |
| `w7-04` | `within-bound` | `name-the-decider` | which job was the critical path? |
| `w8-01` | `audit-tight` | `name-the-row` | which row held most ripe crop *at the open*? |
| `w8-04` | `no-resurvey` | `read-the-plan` | what was the cipher, and how many legs? |
| `w8-05` | three bonuses | `name-the-hold` | which station waited longest on its feeders? |

### The brief gave one test; measurement forced three

1. Does it ask a second question? — kills the tightenings.
2. **Is it earned by the cheapest correct program?** — kills `w4-02`, `w4-01`, `w8-04`.
3. **Is it satisfied by a program that does nothing?** — kills `w8-05`'s absence predicates.

**The agent reversed three of its own rulings as evidence arrived** — `w4-02` from *"exemplar, do
not touch"*, and `w8-05 under-budget` and `w8-04 no-resurvey` from *"looks real, keep"*. `w4-02` and
`w8-04` turned out to be **the same defect: a star paid for declining to use the level's own idea**,
and on `w8-04` the lazy route took the star **more comfortably than the reference** (0/0/0/4/11
off-plan against 17/19/37/14).

They converge on a rule worth keeping: **prefer a bonus requiring evidence of a thing done over one
requiring the absence of a thing done.** Independently corroborated hours earlier from the other
direction — when grading moved to worst-seed, the three bonuses that lost their star were all budget
bonuses and **not one predicate bonus moved.**

`w8-05` loses all three of its bonuses and gains one. `fleet-utilisation` was **unreachable rather
than hard**: World 8's `idleTicks` charges `sync`, so it paid for *not coordinating* — on the
coordination finale. World 7–8 star maximum falls 14 → 11; Worlds 3–5 unchanged, every deletion
matched by a replacement. Worlds 1, 2 and 6 already met the standard.

### The ratchet caught a deletion, and that is the point

The one red test was `confessed-invariants.test.ts` — the entry confessed a comment on `fuelBurned`,
which was `fuel-reserve`'s only consumer and went with the objective. **There was no fix on the
agent's side**: restoring the symbol would have failed `unused-exports.test.ts`, the same ratchet
pointing the other way. It reserved the file as instructed and handed me the four-line diff, which I
applied. A guard exact in both directions notices when the **evidence** for an invariant leaves, not
just when a new one appears.

### Par: measured, and one real content bug

**No impossible pars. 19 of 23 graded levels discriminate; Worlds 3 and 7 are clean.** Seven free
pars, headline **`w8-04`, free by 106–158 ticks — skipping the cipher entirely golds on every
seed.** The level's whole idea is the cipher and the cheapest way to gold is to ignore it. Same
defect the bonus work found from the other side.

**`w8-03` admits no scalar par**: silver must sit inside seed 3's own deadline of 98 while the
reference costs 84.

### Spawned: the par repairs

**Ruled: par stays a scalar. No per-seed par machinery.** A scalar par is a promise the whole game
makes — site map, results, Refactor projection and Performance Review all read one number per level
— so a second shape buys one level and taxes every screen. **`w8-03` has a seed problem, not a par
problem**; the agent is to bring seed 3 into line, and to stop and report with numbers rather than
implement per-seed par if it cannot.

`w8-04` is a **content repair, not a par tune** — told explicitly not to lower par until only the
cipher route fits, because that makes the level harder without making the idea load-bearing and
punishes the player who found the shortcut. **Make the cipher the cheap route.** Also carrying
`w5-01` 37 → 32 and the four-line `CustomReport` engine diff that unblocks the last two objectives
still inferring their unit from their label.

### Recorded so it is not rediscovered as a bug

`look`, `scan`, `probe`, `recv` and `print` are **absent from `DEFAULT_COSTS` — sensing and
reporting are free.** That is deliberate and stays: it is why par can never rank a program for
sensing less, and why an **information budget is the only instrument in the game that can price
sensing at all.**

---

## 2026-09-06 — the UI defects merged, and a coverage gap I am not letting stand

**Merged** (`7a24e80`). Main green at **1831 tests / 82 files**, tsc, build and eslint clean but for
the known `w5-01.ts:32` false positive.

**What a player can now do:** tell which tick number ends their shift — `w8-01` showed 215 and 165
both labelled "ticks", and the objective now carries a `LIMIT` tag against a rail row labelled
`par`, with one seven-word line where both appear: *"par sets the medal. the limit ends the work
order."* Read long dialogs to the end. See what the Repository actually did. Know what a medal
means. Get back to their work after a dialog falls over.

### Item 1 was a real bug, not noise

The rejection value was the bare **string** `'TypeScript not registered!'`, which is why it printed
as `Uncaught (in promise)` with nothing after it. Monaco installs its TypeScript mode lazily behind
`languages.onLanguage`, and `installTypes` asked for the worker **in the same tick as mount, before
any editor existed** — losing the race on a cold module cache. Twice per entry because `StrictMode`
mounts twice; both captured rejections had `levelId === undefined`, i.e. both were the mount path.

**The consequence was not cosmetic:** the `declare module 'lib'` that `installTypes` exists to
publish was silently never installed on that pass, so **a player's own `import` stayed red until the
next Run.** Verified against a forced-cold `vite --force` cache three times.

### The a11y item needed no change, and the reasoning is the standard

The speed control already has an associated `<label class="sr-only">` and `select.labels` returns
`["Playback speed"]`. The accessibility tree prints `combobox "1x"` because that is its **value** —
proved by setting `aria-label="ZZPROBE"` and re-reading the tree, which still printed `"1x"`.
**Adding the attribute would have been a second name for a control that already has one.** Pulling
the tree rather than reading the DOM is exactly why this was caught.

### Three routed back, all applied

`LibraryEditor.tsx` had **the same Monaco race on the path the guard was not on** — it called
`compileLibrary` directly, and does not reproduce today only because a 400ms debounce hides it and
the panel cannot open before the workspace editor. Fixed rather than noted, because "does not
reproduce today" is not a property anyone maintains. An **ungraded work order no longer prints a
par** — the last place the two tick numbers could still read as one kind of thing. Dead
`.sitemap .screen-stat__best` deleted.

**Left as intended, recorded so it is not mistaken for a defect:** `ModalBoundary` renders nothing
for the rest of the session after a dismissal. Remounting the child that threw is a loop.

### The gap: that whole pass shipped with zero tests

Every fix above was verified by hand in a browser. That is good and it is not durable.
**`ModalBoundary.tsx` is new code whose entire purpose is to catch a crash, and nothing asserts that
it catches one** — a safety net nobody has jumped into. Spawned a coverage agent, told to prove each
test **fails against the unfixed code** by checking the pre-fix source back out under it, because
this task exists precisely because that check was skipped.

Two standing instructions in that brief worth keeping: **test behaviour, not markup** — four art
directions ship and the front end may be rebuilt again, so a class-name assertion is noise by next
week — and the medal key must be proved distinguishable **under `signal`**, since a key that only
works in colour fails the direction it was rebuilt for.

---

## 2026-09-06 — both free pars were content bugs, and neither was about par

**Merged.** Main green at **1833 tests / 82 files**, tsc, build and eslint clean but for the known
`w5-01.ts:32` false positive.

### `w8-04`: the intended route now wins on every seed

Par 223 → **116**, medal from the worst seed:

| program | worst | medal |
|---|---:|---|
| reference — decode, drive the plan, repair falls | **116** | **gold** |
| never receives, scavenges the frontier | 290 | bronze |
| never receives, probes every locker | 358 | bronze |

Previously the scavenger golded with **158 ticks to spare**.

**The mechanism was not free sensing, which is what I would have guessed.** It was in `build`: the
fourteen "old workings" stopped one tile *short* of any corridor they hit — which leaves their last
tile adjacent to it, i.e. **joined**. They were short cuts across a route whose entire job is to
wander. Their own comment read *"they do not go anywhere, which is the point."* They went somewhere.

The repair makes **every corridor an induced path**, so the workings form a tree and the filed route
*is* the shortest walk to the locker: refusing to read the plan can only add ground, never remove
it. `build` now asserts `worldDistance(LIFT, locker) === Σ legs + 6 × collapses` and **throws rather
than shipping a free par**. Two supporting repairs, both good instincts: decoy workings now wind,
because a straight stub is dismissed by a single free `look`; and **every working ends in a locker**,
in shuffled ids, because `probe(id)` reaches any machine for zero ticks and exactly one machine
named `locker` handed the answer over at tick zero. The proof is a naive-program fixture and a par
calibration test, not prose. No bonus touched.

### `w8-03`: a seed problem, exactly as ruled

Seed 3 was `layers: 1` — **a grid with no edges**. Two defects in one number: `precedence-held` is
**vacuously true** there, so the seed did not test the objective the level exists for; and
`deadlineFor` keys off the chain, so **the seed with no chain drew the tightest shift in the set.**
The level was grading hardest on the layout that had removed its own idea. The formula was fine all
along — a consistent 1.85–2.05× the honest unoptimised program on all five seeds.

`layers: 1 → 3`. Par 128 → **84**, silver now under every seed's deadline, and bronze — previously
**empty on two seeds and truncated on a third** — is 33–254 ticks wide everywhere. Difficulty rises:
the layer-barrier answer goes from golding on four seeds to bronzing. **Par stays scalar and no
per-seed machinery was built.**

### Also landed

`w5-01` par 37 → 32; the probe-free answer moves gold → silver. `CustomReport` carries a meter, both
remaining objectives converted, and the tails that existed only to feed the parser dropped — so
**`INFERRED_FROM_LABEL` is now empty and nothing in the campaign reads its unit out of its own
English.** A13 amended, since it still called that the gap to close first.

Two ratchet edits applied by me, as routed: `worldDistance` is read by the new build assertion so it
left the dead list, and two off-plan fixtures joined the test-only count. Also fixed a comment in
`budgets.ts` that cited `w8-04`'s deleted `no-resurvey` to illustrate why the match is made against
sampled history rather than the final figure — **the reasoning holds, the citation did not.**

**Still out:** the UI coverage agent.

### Open, and mine to decide when the user picks a direction

`docs/AUDIT-UI.md`'s held styling findings still need re-triage against the winning art direction.
`DEFAULT_ART` is `survey` pending that call.

---

## 2026-09-06 — the coverage found the bug the hand-testing missed

**Merged.** Main green at **1895 tests / 88 files**. 62 new tests, six files, **no source file
changed** — and one real bug found, which is exactly why the pass was commissioned.

### The bug: the objective rail ignores a declared meter

`ObjectiveRail` throws away an objective's declared `meter`/`unit` and re-derives them from the
label. `ObjectiveRow` has no `meter` field, so `budgetFor` sees `undefined` and falls back to parsing
prose. **On the rail, every objective in the campaign is treated as undeclared** — A13's *"prefer a
declaration over the label"* is not in force there at all. Three objectives already disagree between
rail and report, and **`w5-02` is reachable today**: on a failed run the report draws a gauge and the
rail draws a plain counter for the same objective, contradicting `ReportObjective`'s own docstring.

The larger cost is the trap. A13 exists so a new objective can declare its meter **and therefore let
its label say whatever reads best**. Take that freedom and the rail silently loses the gauge, the
unit, and the `LIMIT` tag — the very distinction that shipped hours ago so a player can tell which
tick number ends their run.

**It flagged rather than patched, and did not write the agreement test, because "the honest version
is red today."** Both were the right calls. Spawned to fix the rail and then write that test — proved
red against the unfixed rail first, and asserted across the **whole campaign**, since the three known
cases are symptoms and the invariant is that the rail and the report describe the same objective the
same way.

### The tests that pass both ways, recorded rather than hidden

`ModalBoundary`'s seven containment tests pass against the pre-fix code because `PanelBoundary`
already provided containment (AUDIT-UI F21). That is disclosed, and the file's **first test
reproduces the unprotected case synthetically on every run**: with no boundary in the tree, the
throw comes out of the root render. **That test is the fidelity floor** — a driver that swallowed
errors would pass everything else while proving nothing. The rest that pass both ways are negatives
(*the report says nothing and pays nothing for library use*), which could not have failed before the
feature existed and are its regression guards.

### Two constraints it hit, both routed rather than worked around

**`monaco-editor` ships `module` and no `main`**, so vite cannot resolve it under node and *no test
file in this repo can even `vi.mock('monaco-editor')`* — a file whose whole body is that call fails
to collect. It covered the ordering guarantee through `RuntimeRunner.ready()` instead, where every
caller lives, and handed over the `vitest.config.ts` diff unapplied. Now assigned, with the
condition that **it does not get to destabilise the build**: full suite green and `npm run build`
clean, or revert it.

**The hooks driver is duplicated four times** — precisely the duplicated-constant class the two
ratchet guards exist to catch, sitting inside the test suite. It could not extract it because
`KNOWN_TEST_ONLY` is pinned exactly and `src/__tests__/` was reserved. Now assigned, with that one
constant unreserved and this instruction: **a correct duplicate beats a shared lie.** If a shared
driver cannot preserve errors propagating out of the root render, keep the duplication and explain
why.

---

## 2026-09-06 — the rail and the report now agree, and the sweep found more than was reported

**Merged.** Main green at **1904 tests / 90 files**, tsc, build and eslint clean but for the known
`w5-01.ts:32` false positive.

**The reachable set was larger than the previous agent measured**, and the difference is
methodological rather than a slip: those three cases were measured against a **synthetic empty
source**. Swept against **real runs**, `w8-03 within-shift` and `w8-05 deadline` disagree **on an
ordinary first run** — the report says `LIMIT 0 / 160 ticks`, the rail says `0 / 160` with neither
tag nor unit.

Those two are the `Objectives.custom` budgets that the par repair converted to declared meters hours
earlier, dropping their `…, in ticks` tail **exactly as A13 invites**. So the trap A13 sets was not
hypothetical — **it was already being paid for**, by the change made the same night, in the same
repo, by an agent doing precisely what the amendment told it to do. That is the argument for fixing
the rail rather than documenting the hazard.

The agreement test sweeps every work order **twice** — a do-nothing program and the reference — and
drives each through `runLevel`, so the store holds a verdict the game could really have produced
rather than a fixture. It compares gauge-or-tick-box, `over`, the `LIMIT` tag and the readout. Red
against the unfixed rail: **3 of 4.**

### It corrected the diff it was handed, which is what "verify before applying" is for

**`resolve.mainFields` configures vite's *client* environment; vitest resolves through the SSR one**,
so the handed-over diff changed nothing. The working form is
`ssr: { resolve: { mainFields: ['module', 'main'] } }`. It also corrected the diagnosis: on vitest
3.2.7 a file whose whole body is `vi.mock('monaco-editor', …)` **collects fine** — the wall only
appears when a module that imports monaco is loaded. Cost: nothing. `npm run build` reads
`vite.config.ts` and cannot see it. Bought 5 tests over `typescriptRegistered`'s internals,
mutation-checked by breaking `monaco-setup.ts` three ways and watching each go red.

### The driver was shared for four of five, and the two refusals are the right ones

The four copies were byte-identical but for one hook, so the shared module is a **superset** and
nothing was weakened. **`modal-boundary.test.ts` keeps its own and should**: it is an error-path
instrument with no hooks, and its fidelity floor needs errors to escape the root render, which the
hooks driver cannot carry. `publish-dialog.test.ts` keeps its own too — folding it in would mean
either a fifth-wheel export or giving the shared driver effect semantics the four callers rely on
**not** having. *A correct duplicate beats a shared lie*, applied twice and argued both times.

`KNOWN_TEST_ONLY` `[69, 32]` → `[70, 32]`, measured before bumping, and the only edit anywhere in
`src/__tests__/`.

### Open

`docs/AUDIT-UI.md`'s held styling findings still await re-triage against whichever art direction the
user picks. `DEFAULT_ART` is `survey` pending that call — the one decision on this project that is
not mine.
