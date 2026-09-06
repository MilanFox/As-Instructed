# Fix — two reward-surface defects

Working notes, appended per unit of work. Findings 2 and 4 of `docs/AUDIT-INCENTIVES.md`.
Branch `worktree-agent-adcb06d4b0e4253a3`, cut from `main` at `7edf1ee` — already current, nothing
to merge.

## 0. What the code actually says

**Item 1 — the publish gate.** `src/meta/store.ts` `offerPublish` runs four guards in order:
`unlocked`, `briefed`, `publishMuted`/`publishDeclined`, and then
`declarations.some((each) => each.callable)`. The fourth returns without setting any state, so the
player gets nothing at all. `src/ui/library.ts` is the only caller — it stashes `pending` when the
results modal opens and calls `offerPublish` when that modal closes, so the offer is already
sequenced after a modal rather than stacked on one.

`publishableDeclarations` (`src/meta/publish.ts`) skips any line starting with whitespace, so a
helper the player *has* factored but left inside `main()` is invisible to the scan as well as to
the offer. That is the audit's second-order note and it is real.

**Item 2 — the review's scope.** `reportFor` in `src/ui/screens/PerformanceReview.tsx` maps
`campaignOrder()` unconditionally. Per row: `points = levelPoints(medal, stars)` and
`maxPoints = levelMaxPoints(bonusCount)` = `3 + bonusCount`. `fillPlaceholders` sets `[n]` to
`gold + silver` for tiers 1–3 and `gold` for tiers 4–5, `[m]` to the scope size.

Ownership note: `REVIEW_TIERS` and the tier `min` thresholds live in `src/game/score.ts`, which the
par-recalibration agent holds. Everything fixable without it is fixed in the screen; the one change
that is not is written out under "Changes for the orchestrator to apply".

## 1. Item 2 — the Performance Review

### The numbers, verified

Today's campaign is **34 work orders and 37 bonus stars** across 32 levels, so the old denominator
is `34 × 3 + 37 = 139`, not the 134 the audit computed. The defects reproduce at the new numbers.

| Player | Old points | Old grade | New points | New grade |
|---|---|---|---|---|
| Standing start, nothing closed | 0/139 = 0% | `DEVELOPING` | 0/0 | `NOT ASSESSED` |
| 1 closed, gold | 3/139 = 2% | `DEVELOPING` | 3/3 = 100% | `RETAINED` |
| 17/17 gold, every star | 68/139 = 49% | `CONSISTENT WITH EXPECTATION` | 51/51 = 100% | `RETAINED` |
| 17/17 gold, no stars | 51/139 = 37% | `CONSISTENT WITH EXPECTATION` | 51/51 = 100% | `RETAINED` |
| 34/34 gold, no stars | 102/139 = 73% | `EXCEPTIONAL (NON-BINDING)` | 102/102 = 100% | `RETAINED` |
| 34/34 silver | 68/139 = 49% | `CONSISTENT WITH EXPECTATION` | 68/102 = 67% | `ABOVE BASELINE` |
| 34/34 bronze | 34/139 = 24% | `DEVELOPING` | 34/102 = 33% | `CONSISTENT WITH EXPECTATION` |
| 32 gold + 2 silver | 100/139 = 72% | tier 3, prints "34 of 34" | 100/102 = 98% | tier 4, prints "32 gold results" |

Defect (a) is gone: the grade no longer moves when the player simply plays more. Defect (b) is
gone: a perfect medal wall is 100%. Defect (c) is gone: `[m]` is now the closed count, which is
the same set the percentage is computed over, so the sentence cannot disagree with the number
above it.

### What changed

New file `src/ui/screens/review.ts` holds `reportFor`, `hasReached`, `reachedByWorld` and
`fillPlaceholders`; `PerformanceReview.tsx` is now rendering only. There is no DOM test harness in
this repo, so the arithmetic had to leave the component to be testable at all.

Three rules replace the old one:

1. **The wall lists reached work orders** — `isLevelUnlocked(save, id) || attempts > 0`. The
   `attempts` half covers an imported or pre-rules-change save holding a result for a work order
   the current unlock rules call locked.
2. **The grade counts closed work orders only.** A row with no medal contributes 0 points *and* 0
   to the denominator. The audit's version would have kept the work order the player is currently
   standing on in the denominator as a zero, which caps a flawless player below 100% forever and is
   a smaller version of the same disease — press Run, do not finish yet, watch your review drop.
3. **The denominator is medals only** (`levelMaxPoints(0)` = 3 per closed level, `levelPoints(medal)`
   with no star term). Stars are still summed and still shown in the wall's counts and per row.
   DESIGN §11 A4 weights are untouched — gold is still 3 and a star is still worth 1 everywhere
   points are shown for a single result; `Results.tsx` and `LevelSelect.tsx` are unchanged.

Smaller consequences, all falling out of the above:

- `GRADE: NOT ASSESSED` now means "you have closed nothing in this scope" rather than "this scope is
  empty". Body copy changed one word: *issued* → *closed*.
- The `REVIEWED` line lost its denominator — `17 work orders`, not `17 of 34`. Finding 13 calls the
  visible completion fractions attendance meters; this was one of them.
- World scope buttons enable on *reached* levels, not on "the level exists". A player in World 2 now
  sees two live tabs instead of eight, six of which were live and empty.
- The `PTS` column reads `—` for a work order with no result instead of `0/4`.

### Tests

`src/ui/screens/__tests__/review.test.ts`, **14 tests**: scope at a standing start / mid-campaign /
complete, the stranded-attempts case, not-assessed, the open work order not counting as a failure,
the halfway-flawless and perfect-wall percentages, star-independence, medal quality as the only
lever, per-world scoping, and three placeholder cases including the tier-3 "34 of 34" bug.

## 2. Item 1 — the publish surface

### What was built

**A line on the result, not a dialog.** When a work order closes, `reviewForPublish` runs while the
report is still on screen. If the scan found nothing callable it sets a `notice`, and the report
grows one more `report-section` under the commendations:

> **repository**
> Nothing in this work order is shaped like a subroutine, so there was nothing to file. A
> subroutine is a named function at the top level of the file, and a later work order can import it
> and call it.
> *stop offering*

If the player factored a helper but left it indented inside a block, the first sentence is replaced
by the specific one: **`step` is a subroutine, but it is nested inside something else. Move it out
to the top level of the file and the Repository can file it.** That is the audit's second-order
note (`publishableDeclarations` only sees column zero) turned into the one sentence worth saying to
a player who has already done the thinking.

The full dialog is unchanged and still gated on a callable declaration. Nothing new opens, nothing
new needs dismissing, no new stylesheet — `report-section`, `rail__label`, `modal__line` and
`modal__quiet` all already exist, and `modal__quiet` is the same treatment as *skip the ceremony*
two rows below it.

### What was rejected, and why

- **Delete the early return, as the audit proposed.** The dialog would open with
  `PUBLISH.nothingToPublish` and a disabled `PUBLISH` button. That is a modal that interrupts, asks
  a question and then refuses to accept an answer — and it is the fourth modal on a transition the
  veteran already complained about (medal → requisition → delivery note → this).
- **The dialog in an explanatory state.** Same cost. The dialog's whole job is a list with
  checkboxes; a version with no list is a different component wearing the same frame, and the
  player still has to close it.
- **A floating toast after the report is dismissed.** Non-blocking, but a new UI concept, a new
  stylesheet, and it arrives *after* the moment it is about, in the editor, where it reads as
  chrome and gets dismissed unread. The report is the screen where the player is already reading a
  judgement of the code they just wrote.
- **A permanent line in the Repository panel.** The player who needs this does not open that panel.
  That is the defect, restated.

### When it fires, and when it stops

Guards, in order — the first two are `offerPublish`'s and are unchanged:

1. `save.unlocked && save.briefed`. **The delivery-note guard is kept.** No notice before the
   ceremony that says the Repository exists.
2. Not `publishMuted`, not `publishDeclined.includes(levelId)`. A player who said no stays said-no.
3. `save.published.length === 0`. It stops the moment the player publishes anything: the habit was
   the message, and by then it has landed. This is the only rule the offer does not also have, and
   it is what keeps the notice from becoming wallpaper for a player who never wants to factor.
4. Nothing callable at column zero. Otherwise the dialog handles it, as before.

Plus one render guard: the notice only draws on a passed run. The bridge only recomputes on a pass,
so without it a stale notice would appear under a failure report.

The off switch is `stop offering`, which sets `publishMuted` — the same flag the dialog's
"Stop offering" sets, reversible from the same place in the Repository panel. A player who never
learns to factor and does not want to hear about it is one click from silence, and the silence is
now something they chose.

### Files

- `src/meta/publish.ts` — `nestedRoutineNames(source)`, ~18 lines, reuses `DECLARATION_START` and
  `isCallable`. Publishes nothing; it only picks the sentence.
- `src/meta/store.ts` — `PublishNotice`, `notice` state, `reviewForPublish`, `muteNotice`.
  `offerPublish` is unchanged apart from a comment that no longer describes silence.
- `src/meta/copy.ts` — `PUBLISH.noticeLabel`, `noticeNothing`, `noticeNested`.
- `src/ui/library.ts` — one call at results-open, and the modal-stacking comment extended.
- `src/ui/screens/Results.tsx` — the section, and two store reads.

No persisted shape changed. `notice` is transient store state, never written to the save, so there
is no fixture to add for it.

### Tests

`src/meta/__tests__/publish-notice.test.ts`, **16 tests**: the straight-line case (the beginner's
case) now raises a notice where it used to raise nothing; the nested case names the routine; the
factored case still gets the dialog and no notice; every guard including both mute paths; the
stale-notice clear; the off switch persisting; and five unit tests on `nestedRoutineNames`
(indented function, indented arrow, data and loop counters ignored, commented-out code ignored,
each name once).

### Verified in a browser

Dev server on 5199, seeded save, `w1-01` solved with the reference solution — which is
straight-line with no top-level declaration, i.e. exactly the shape the audit says every starter
models. The report closed at gold and carried the notice under the commendations. Clicking
*stop offering* removed the section and wrote `publishMuted: true` to `bootstrap.library`.
Server PID killed by number.

## 3. Changes for the orchestrator to apply

One change is needed in `src/game/score.ts`, which the par-recalibration agent holds. It is
independent of everything above and safe to apply late; without it the review still works, but
tier 5's text stays false at 93–99%.

With the denominator now medals-only, 100% means *every closed work order is gold*. Tier 5's text
claims exactly that, so its threshold has to be 100 rather than 93 — at 93% a player can be
carrying seven silvers. And the scope is now what the player has been issued, not the whole site,
so "on this site" has to become "issued to you". Verified in the browser: a 17/17 flawless save
reads `GRADE: RETAINED · 100%` above a paragraph beginning "Every work order on this site…", which
is the last untrue sentence on the screen.

```diff
--- a/src/game/score.ts
+++ b/src/game/score.ts
@@ REVIEW_TIERS, tier 5
   {
     rank: 5,
     grade: 'RETAINED',
-    min: 93,
+    min: 100,
     body:
-      'Every work order on this site is closed at or under par. There is no grade above this one. ' +
+      'Every work order issued to you is closed at or under par. There is no grade above this one. ' +
       'There has never needed to be. ' +
```

`docs/NARRATIVE.md` §7 carries the same sentence and the same threshold and should move with it.
I left both alone rather than land half of a pair.

Nothing in `src/ui/screens/__tests__/review.test.ts` depends on which value is in place: the
flawless cases assert rank 5 at 100%, and the mixed case asserts `rank >= 4`.

**Second item, informational.** The par agent is weighing `graded: false` on some levels. The
review's denominator is `levelMaxPoints(0)` per **closed** row, so an ungraded level that can never
carry a medal never enters the denominator and costs the player nothing — the fix is already
inert under that change. If `graded: false` levels can still record a medal, add one filter in
`reportFor` (`src/ui/screens/review.ts`), which is the only place the scope is decided.

## 4. Verdict — does the Performance Review earn its complexity?

**No, and I would cut roughly half of it.** Neither playtester opened it once, and that is the
finding, not an accident of two sessions.

What the screen is, structurally: a memo whose four tiers are the only content the player cannot
get elsewhere, and a medal wall that restates the site map. The site map already shows points,
closed count, gold/silver/bronze/star counts, per-world point totals, an `ALL AT PAR` badge per
world and a completion bar — I photographed all of it while testing. The medal wall adds per-level
ticks-against-par and a `PTS` column, and it is the *second* place in the game where a completion
fraction is rendered (finding 13). Two screens, one dataset, and the one nobody opens is the one
with the grade on it.

The memo is worth keeping. It is five paragraphs of the game's best writing, it is the only place
Vance speaks at length, and now that it grades quality rather than attendance it says something
true. It also only changes at four thresholds, which is the right cadence for a joke about
corporate metrics — the player should be *told* the grade, not go looking for it.

The cheap cut, in rough order of value:

1. **Delete the medal wall.** The site map is the medal wall, and it is the screen the game opens
   on. Ticks-against-par belongs on the site map node if it belongs anywhere.
2. **Deliver the memo instead of hosting it.** Raise it when the grade *changes* tier — four times
   a campaign, at most — the way the delivery note and the requisition are raised. That is the
   ceremony pattern the repo already has, and it puts the writing in front of the player who will
   never click a chart icon in a top bar. Keep a read-again route from the site map.
3. **Drop the world scope buttons.** Eight tabs to re-slice a number the memo only reads at one
   scope. If per-world grading matters, the site map's per-world row is where it goes.

That is about 200 of the screen's 330 lines and the whole of `reachedByWorld`, and what survives is
a memo with a grade on it. I have not done it: it deletes a screen and a route, it touches the
site map (`LevelSelect.tsx`) and the ceremony ordering in `App.tsx`, and cutting a screen is a call
for the orchestrator rather than something to smuggle into a scoping fix. The scoping fix stands on
its own either way — if the screen is cut down, the memo it delivers is the fixed one.

## 5. State on handback

- `npx tsc --noEmit` clean. `npm run build` clean; Monaco is still its own chunk, so the new
  `meta/store` import from `Results.tsx` did not pull it into the entry bundle.
- `npx vitest run`: **1414 passing**, up from the 1384 baseline. 30 new: 14 review, 16 notice.
- `npx eslint src`: the one pre-existing `rules-of-hooks` error in
  `src/levels/world-5/__solutions__/w5-01.ts`, nothing else.
- No persisted shape changed, so no save fixture was needed.
- No file owned by the par agent or the renderer agent was edited. Nothing was merged to `main`.
