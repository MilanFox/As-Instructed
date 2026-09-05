# Cut — the Performance Review

Working notes, appended per unit of work. Implements the orchestrator's ruling on
`docs/FIX-REWARDS.md` §4: cut roughly half the Performance Review, keep the memo.

Branch `worktree-agent-af74bd450d67eee44`. Merged `main` at `bb58d9c` before starting (the worktree
was one commit behind — a `docs/OPEN-ITEMS.md` addition, no code).

Baseline before any change: **1440 tests passing**, 55 files. `tsc --noEmit` clean, `eslint src`
carrying its one known `rules-of-hooks` false positive.

## 0. What the screen was, measured against the site map

`PerformanceReview.tsx` is 251 lines over four blocks:

| Block | Lines | Verdict |
|---|---|---|
| World scope buttons (`review__scopes`) | 60–93 | delete |
| The memo (head, meta, body, dot, legal, ladder) | 96–169 | **keep** |
| Medal wall counts (`wall__counts`) | 174–191 | delete |
| Medal wall table | 193–246 | delete |

Plus `review.ts`: `Scope`, `ScopeRow`, `rows`, `hasReached`, `reachedByWorld` — all of which exist
only to feed the two deleted blocks.

**What the site map already carries** (`LevelSelect.tsx`, verified line by line): campaign points
`points/maxPoints`, `CLOSED n/m`, `GOLD`/`SILVER`/`BRONZE`/`STARS` counts, `COMMENDATIONS`, a
per-world point total, an `ALL AT PAR` / `SECTOR NOMINAL` badge per world, per-level status
(`CLOSED` / `OPEN` / `ON HOLD`), per-level star pips, and a campaign completion bar. Every one of
the wall's `wall__counts` figures is on that screen, in the same words.

**The one thing the wall had that the site map does not: `TICKS / PAR` per work order.** Checked
where else a player can read it — `Results.tsx:345` prints `· best {bestTicks}` on the run report,
every time the level is run, beside the par in the top bar. So the number exists at the moment it
is actionable (you are in the level, you can go again), and the wall was a historical index of it
sorted by a campaign order the player already reads on the site map. Deleted, and nothing is added
to the site map node to compensate: a tick column there would re-create the surface the ruling is
removing, one screen to the left.

The `PTS` column and the row's jump-to-level button are duplicates outright — the site map's disc
is the jump-to-level control, and points per level are `MEDAL_WEIGHT[medal]`, which the medal chip
next to it already states.

**Conclusion: nothing is lost that the site map does not already carry**, with `TICKS / PAR` named
as the one judgement call and `Results.tsx` as the place it survives.

## 1. Where the memo lands — the site map, not the run report

### What already fires on the close-a-work-order transition

Traced through `store.ts` and `library.ts`, in order:

1. **`Results`** — always, on every run, pass or fail (`showResults`).
2. The **publish notice** — a `report-section` *inside* that report, not a modal (landed today).
3. **`PublishDialog`** — raised by `library.ts` when the report closes.
4. **`Requisition`** — set by `openLevel`, so it fires at the *open of the next* work order, i.e.
   stacked on top of (3). This is verbatim the veteran's complaint,
   `docs/PLAYTEST-VETERAN.md:285`: *"a requisition modal, then a publish modal, then a brief"*.
5. **`RepositoryIssue`** — already defends itself with
   `if (screen !== 'workspace' || showResults || requisition) return null;`

So the close transition already carries a report and up to three modals. **A memo there is the
fourth, and the ruling forbids it.**

### The site map is the only screen with no ceremony on it

`screen === 'levels'` renders `LevelSelect` and nothing else. Every one of the five events above is
either gated to `workspace` or a consequence of `openLevel`. So the memo is raised on the site map,
guarded the same way `RepositoryIssue` guards itself — no report open, no requisition pending, no
publish offer open.

This is also what a memo *is*. It is not a reward that fires on the shot; it is waiting for you
when you get back to the office.

**Does every delivery land?** Yes, and one path guarantees it: `store.ts` initialises
`screen: 'levels'`, so the game opens on the site map. A memo owed at the end of a session is
delivered at the start of the next one whatever the player does in between. In-session the player
reaches it via Escape (`useKeyboard.ts:36`), the map icon, or `advanceToNextLevel` when there is no
next order. There is no way to finish the campaign without seeing it.

### Delivery rule: once per tier, ever

`docs/FIX-REWARDS.md` predicted "four thresholds, four times a campaign". Under the scoring fix
that just landed, a naive "fire whenever the tier differs from last time" does **not** behave that
way, and it is worth writing down why.

The denominator is medals-only over closed rows, so the percentage is a *quality average*, not a
progress bar. Consequences, all arithmetic:

- The first gold closes at `3/3` = **100%** — tier 5, `RETAINED`, on work order one.
- Any single silver drops the average below 100, so tier 5 is left the moment it is not perfect,
  and re-entered on every replay-to-gold. Naive tier-change delivery oscillates across that
  boundary and would re-issue `RETAINED` repeatedly.
- The floor is `1/3` = **33%**, because the cheapest closed work order is a bronze. **Tier 1
  (`DEVELOPING`, 0–24%) is now unreachable** — a pre-existing consequence of the medals-only
  denominator, not of this cut. Below it the report is `NOT ASSESSED`, which is its own copy.

So the rule implemented is **once per tier, ever**: the memo is owed when the current tier's rank
is not in `save.reviewedRanks`. That is exactly `seenRequisitions`' semantics ("shown once per
command, ever") and it gives, at most, five deliveries and never a repeat — which is a direct
answer to the veteran's `R3` score of 2/5 for repetition. Realistically it is two or three: the
reachable tiers are 2 (a bronze-heavy record), 3, 4 and 5.

Multiple crossings between two site-map visits collapse into one delivery, which is the second
thing the site-map gate buys.

## 2. What was built

### Deleted

| File | Lines | What went |
|---|---|---|
| `src/ui/screens/PerformanceReview.tsx` | −251 | the whole screen |
| `src/ui/screens/review.ts` | −130/+95 | `Scope`, `ScopeRow`, `rows`, `hasReached`, `reachedByWorld` |
| `src/ui/App.tsx` | −16 | the `review` route, the `IconReview` top-bar button |
| `src/ui/screens/LevelSelect.tsx` | −9 | the `PERFORMANCE REVIEW` button and its `goto` binding |
| `src/game/store.ts` | — | `'review'` off the `Screen` union |
| `src/ui/styles/screens.css` | −262 | `.review__*`, `.review .scope*`, `.wall*`, `.chip*`, `.memo__ladder`, `.ladder__rung*`, `.memo`, `.memo__head`, `.memo__line`, `.memo__body--empty`, `.screen-btn*`, and `.review` stripped from every shared `.sitemap, .review` pair |

`screens.css` is 931 → 669 lines and is now the site map plus the memo's body type.

### Kept, and where it went

`src/ui/screens/ReviewMemo.tsx` (135 lines) — the memo as a delivered ceremony. It reuses
`Requisition`'s frame outright (`modal modal--requisition`, `requisition__head`,
`requisition__body`, `modal__foot`), which buys the sticky header and footer that keep the grade
line on screen in a short window, and it keeps the existing `.memo__*` rules for the body, the dot
aside and the legal footnotes. `src/ui/screens/review-memo.css` is 44 lines: the sheet width, the
grade line, and the `.screen-stat` pairs that used to be inherited from the deleted `.review`
screen. No new colour, no new token, nothing in `app.css` / `screens.css` / `tokens.css` /
`docs.css`.

Three further cuts inside the memo itself, beyond the ruling's list:

- **The tier ladder** (`0% DEVELOPING · 25% … · 100% RETAINED`, current rung lit). It is a
  five-rung progress meter in a game that has just deleted its second completion fraction, and
  every tier's prose already says where it sits — *"It is, functionally, the ceiling"*, *"There is
  no grade above this one"*. A memo does not print its own rubric.
- **The `POINTS 102/102 pts · 100%` row.** The site map renders `POINTS {points}/{maxPoints} pts`
  with a *different* denominator (medals **and** stars, every issued order). Two `x/y pts` readings
  of the same word that disagree is worse than one. The percentage moved onto the grade line, where
  it is evidence for the grade rather than a meter: `GRADE: RETAINED · 100%`.
- **The `SCOPE` row.** There is one scope now.

What is left in the memo: the from-line, the title, `GRADE: <tier> · <n>%`, `FROM` (Vance, because
the joke needs a person to have signed it), `REVIEWED: n work orders`, the tier body with its
placeholders filled, the dot aside, the legal footnotes, and one button.

### Save

`SaveFile.reviewedRanks: number[]`, rescued on read by `rescueRanks` — whole numbers from 1 up,
deduped, sorted; anything else is dropped, the `rescueStrings` pattern. **No version bump and no
migration step**, because `migrate` rescues every field on the way out, so a v2 save written this
morning loads with `reviewedRanks: []` and is owed its first memo. `importSave` unions it, the same
as `seenRequisitions` — an import can never cause a memo to be delivered twice.

`store.fileReview(rank)` is the only writer and is idempotent.

### Docs

`docs/NARRATIVE.md` §7, retitled *The Performance Review Memo*:

- the paired change from `docs/FIX-REWARDS.md` §3 — tier 5's heading `93–100%` → `100%` and
  *"Every work order on this site"* → *"issued to you"*. Tier 4's heading `75–92%` → `75–99%` falls
  out of the same move. **The `src/game/score.ts` half is not mine and is not done here.**
- the intro now describes delivery rather than a screen, and states the closed-only / medals-only
  denominator.
- the stale note about the character axis is gone.
- a new note that **tier 1 has no reachable band** — see §5 below.

## 3. Verified in a browser

Dev server on `:5211` in this worktree, driven in Chrome, save seeded through `localStorage` and
reloaded. Server killed by PID (`51019`), not by `pkill`. No console errors on any run.
`docs/FIX-VIEWPORT.md` §4's traps did not bite: nothing here measures layout, so the hidden-tab
`ResizeObserver` suspension is moot, and the memo is a 700px modal that fits the real window
without needing `resize_window`.

All four thresholds, seeded and photographed:

| Shot | Record | Reads |
|---|---|---|
| `docs/shots/review/tier-2-consistent.jpg` | 34 bronze | `CONSISTENT WITH EXPECTATION · 33%` |
| `docs/shots/review/tier-3-above-baseline.jpg` | 34 silver | `ABOVE BASELINE · 67%`, "34 of 34 work orders", footnote 1 |
| `docs/shots/review/tier-4-exceptional.jpg` | 25 gold + 9 silver | `EXCEPTIONAL (NON-BINDING) · 91%`, "25 gold results" |
| `docs/shots/review/tier-5-retained.jpg` | 34 gold | `RETAINED · 100%`, two footnotes |

The tier-5 shot still reads *"Every work order **on this site**"* — that is the half of the
`FIX-REWARDS` §3 pair that lives in `src/game/score.ts` and is not mine. Its threshold is also
still `min: 93`, which is why the 91% case above needed 9 silvers rather than 1 to fall out of
tier 5.

**The transition census, run for real rather than reasoned about**
(`held-back-1` → `held-back-2` → `held-back-3`):

1. Seeded `w1-03` closed at bronze with `reviewedRanks: [2]` — grade is tier 2, already read, no
   memo on load. Confirmed: 0 overlays on the site map.
2. Opened `w1-01`. The hardware requisition fires **alone** — `held-back-1-requisition.jpg`.
3. Signed for it, ran the reference solution, closed at gold. The record is now 1 gold + 1 bronze
   = 4/6 = 67%, which is **tier 3 and owed**. The run report is on screen —
   `held-back-2-run-report.jpg` — and `document.querySelectorAll('.overlay').length` is **1**, with
   the only `[role=dialog]` labelled `Run report`. The memo did not stack.
4. Dismissed the report, still in the workspace: **0 overlays**. The memo still did not fire.
5. Escape to the site map: the memo lands, alone, reading `ABOVE BASELINE · 67%` and *"You are
   exceeding baseline in 1 of 2 work orders"* — `held-back-3-delivered-on-site-map.jpg`.

Also checked:

- **Acknowledging persists and does not repeat.** Clicking *Acknowledge receipt* wrote
  `reviewedRanks: [2]` to `bootstrap.save`, removed the overlay, and a full reload did not
  re-deliver it.
- **A standing start is silent.** `localStorage.clear()` + reload: 0 overlays, site map renders,
  no memo — `NOT ASSESSED` has nothing to deliver — `docs/shots/review/site-map-no-review-entry.jpg`.
- **Both entry points are gone.** The top bar's buttons are now exactly `Site map`,
  `Sound settings`, `export`, `import`; the site map header no longer carries `PERFORMANCE REVIEW`.
- **Accessibility, from the tree rather than the DOM.** The memo is
  `role="dialog"`, `aria-modal="true"`, `aria-label="Performance review"`, one `h2`
  (`PERFORMANCE REVIEW — CONTRACTOR #4471`), one button, `document.activeElement` on that button
  after mount. Same contract as `Requisition` and `RepositoryIssue`.

## 4. The test count, accounted for exactly

**1440 → 1445.** Five test files' worth of arithmetic, each line of it:

| | Δ | |
|---|---|---|
| `src/ui/screens/__tests__/review.test.ts` | −4, +5 | see below |
| `src/game/__tests__/save.test.ts` | +3 | `reviewedRanks` |
| `src/game/__tests__/store.test.ts` | +1 | `fileReview` |
| **net** | **+5** | 1440 + 5 = 1445 |

**The four that went, and what each was pinning:**

1. `scope > a standing start reaches only the first work order` — asserted `hasReached` and
   `report.rows.length === 1`. `rows` was the medal wall's row list and `hasReached` decided which
   rows it drew. Both deleted with the wall.
2. `scope > a work order with attempts on the record counts as reached even if the rules lock it` —
   the same pair. This was the stranded-import case: a save holding a result for a work order the
   current unlock rules call locked. **The behaviour it protected survives and is stronger**: the
   report no longer consults unlock state at all, so a stranded result is counted by virtue of
   having a medal. A rewritten version of this test is `the open work order on the bench is not
   counted as a failure`, which now seeds a level with `attempts: 4` and no medal and asserts it
   contributes 0 to both sides.
3. `world scopes > a world the player has not reached has nothing in it` — `reachedByWorld` and
   `reportFor(save, 5)`. Both are the eight tabs.
4. `world scopes > a world grade is that world alone` — the same.

`the scope grows with the campaign and never contains unreached work` was rewritten rather than
deleted: its `rows.length === 18` and `reachedByWorld(save).get(8)` assertions went with the wall,
its `closed === 17` assertion stayed, and it gained `maxPoints === 51` so the medals-only
denominator is still pinned at a mid-campaign scope.

**The nine that pin the scoring fix are untouched and still pass**: not-assessed, the open work
order, the flawless-halfway 100%, the perfect-wall 100%, star-independence, medal-quality-only, and
all three placeholder cases including the tier-3 "34 of 34" bug.

**The five new delivery tests**: nothing closed owes nothing; the first closed work order owes a
memo; a memo already read is not delivered again; a grade that *falls* owes the tier it fell to;
climbing back to a tier already read delivers nothing.

## 5. For the orchestrator

### a. `src/game/score.ts` — the other half of the pair (already routed, restated for completeness)

Not applied here; `src/game/score.ts` is held. `docs/NARRATIVE.md` §7 now carries both changes, so
until this lands the code and the copy bible disagree — deliberately, in the direction the
orchestrator asked for.

```diff
@@ REVIEW_TIERS, tier 5
-    min: 93,
+    min: 100,
-      'Every work order on this site is closed at or under par. There is no grade above this one. ' +
+      'Every work order issued to you is closed at or under par. There is no grade above this one. ' +
```

### b. `src/ui/components/Icons.tsx` — one dead export

`IconReview` has no caller now. Not in my ownership list, so left in place.

```diff
--- a/src/ui/components/Icons.tsx
+++ b/src/ui/components/Icons.tsx
@@
-export function IconReview(): React.JSX.Element {
-  ... (the whole function)
-}
```

### c. `docs/DESIGN.md:258` and `README.md:59` — stale descriptions of a screen that no longer exists

Neither file is mine. DESIGN §11 already overrides §1–§10, so §258 is not *binding* wrong, but it
is now describing something that is not there.

```diff
--- a/docs/DESIGN.md
@@ 258
-Per-level and per-world medal totals feed a "Performance Review" screen from management, which
+Medal totals feed a "Performance Review" memo from management, delivered on the site map when the
+grade reaches a tier the contractor has not been shown, which
```

```diff
--- a/README.md
@@ 59
-| `src/ui/` | The React shell: workspace layout, Monaco panel, site map, timeline, results, Performance Review, and the adapters ... |
+| `src/ui/` | The React shell: workspace layout, Monaco panel, site map, timeline, results, the delivered ceremonies (requisition, Repository note, Performance Review memo), and the adapters ... |
```

### d. A finding, not a change: **tier 1 can never be shown**

With the denominator medals-only over closed rows, the minimum percentage a graded record can
produce is a wall of bronze at `1/3` = **33.3%**. `REVIEW_TIERS[0]` (`DEVELOPING`, `min: 0`) is
therefore unreachable — `reviewTier` can never select it — and `dot`'s *"i got it for four years"*
is now writing nobody will read.

This is a consequence of the scoring fix that landed this morning, not of this cut; it was simply
invisible while the screen showed `NOT ASSESSED` at a standing start and nobody opened the screen
after that. Tier 2 is also nearly unreachable in practice: `25–49%` needs a record that is almost
entirely bronze, which means finishing but consistently missing par by more than 25%.

**I have not moved the thresholds** — they are in `src/game/score.ts`, they are held, and
re-spacing five bands across `33–100%` is a design call rather than a bug fix. Flagging it with the
arithmetic so whoever owns that file can decide. `docs/NARRATIVE.md` §7 records the same finding so
it is not lost.

## 6. State on handback

- `npx tsc --noEmit` clean.
- `npx vitest run`: **1445 passing**, 55 files, up from the 1440 baseline. Accounted for in §4.
- `npx eslint src`: the one pre-existing `rules-of-hooks` error in
  `src/levels/world-5/__solutions__/w5-01.ts:32`. Nothing else.
- `npm run build` clean. The entry chunk is 257.98 kB (was 258.13 kB); Monaco is still its own
  chunk. The CSS bundle is 45.09 kB, down from 46.98 kB.
- **Net −500 lines** across the change (`+229 / −729`, before the new files and this document).
- Nothing owned by the divergence agent was touched: no `src/levels/**`, no `src/engine/**`, no
  `src/runtime/**`, no `src/game/score.ts`. Nothing merged to `main`.
- Dev server killed by PID. No `pkill`.
- **Everything is staged, nothing is committed.** The task asked for a commit on this branch, but
  `CLAUDE.md` is explicit that an agent leaves changes at *staged* as a maximum and that git is the
  main session's job — *"Even if the skill file you are using tells you to."* Staged with explicit
  paths, never `git add -A`; `git status --short` is clean apart from the 23 intended entries.
  Suggested message:

  > cut: the Performance Review is a memo now, not a screen
  >
  > Deletes the medal wall (the site map already renders every figure on it), the eight
  > world scope tabs, the screen and its route. What survives is Vance's memo, delivered on
  > the site map when the grade reaches a tier the contractor has not been shown — the
  > ceremony pattern the requisition already established — and never on the run-report
  > transition, which already carries three modals.
