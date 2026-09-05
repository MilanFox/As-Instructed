# FIX-INCENTIVES — the commendation cut, and findings 3 and 5–12

Worktree `worktree-agent-a4ebd5b8b36d19b2e`, branched from `main` at `d8ac109` (level with main,
no merge needed). Baseline before any change: **1692 tests, 68 files, green in 10.3s.**

Scope, as revised mid-task by the orchestrator: `src/game/achievements.ts`, `src/game/store.ts`,
`src/game/save.ts`, `src/levels/**`, `docs/DESIGN.md` and the tests for those. **All of `src/ui/`
was handed back** to the art-direction agent partway through; anything that needed a screen is
written up under *Changes for the orchestrator to apply* as intent first, diff second.

Appended per unit of work, in the order the work happened.

---

## 1. The commendation cut — fifteen to five

### The ruling this implements

Both playtesters report the layer changed their behaviour zero times (`AUDIT-INCENTIVES.md` §18,
"The playtests found three incentive problems I missed", item 1). A reward nobody responds to is a
list. The test applied to each of the fifteen: **does it name a specific thing the player did, that
they would be pleased to have noticed?** Attendance, completion, and restatements of a medal the
player already has fail that test.

### The five that survived

| id | title | why it survived |
|---|---|---|
| `second-look` | A SECOND LOOK, AND A THIRD | Mandated keep. Closing on the 4th run or later pays for the loop the game is made of — run, fail, read, revise. It was added this week to replace the deleted streak and it encodes the opposite incentive. |
| `raised-again` | RAISED, AND RAISED AGAIN | The tenth run is a different event from the fourth, not a second rung on one ladder. The beginner playtester spent 55 minutes and 11 runs on `w3-03` and then quit (`PLAYTEST-BEGINNER.md` §15). This is the only thing in the game that says anything to that player at run 10. Same variable as `second-look`, same direction — the incoherence finding 5 names was `first-run` pointing the other way, and that is gone. |
| `came-back-for-it` | REOPENED ON PURPOSE | Mandated keep. A bonus met on an already-closed order is the one commendation that pays for *returning* to work you had banked. |
| `minimal-observation` | MINIMAL OBSERVATION | The audit's own carve-out (finding 6): an information budget is level-authored, visible in the objective rail, and rewards understanding the world well enough to need fewer questions. It is the only restraint reward left, which is what makes "look less" read as a design idea rather than as a general instruction to touch nothing. |
| `repository` | ADDED TO THE REPOSITORY | Finding 9: the Repository is the campaign's spine — eleven of the last fourteen work orders name a routine they expect in `lib.ts` — and it is otherwise unmeasured by anything. Publishing a subroutine is a specific act, not a medal restated. It is also the only survivor not awarded by a run. |

### The ten that were deleted, and why

| id | title | verdict |
|---|---|---|
| `filed` | FILED | Attendance. "Close your first work order" is the game starting. |
| `within-budget` | WITHIN BUDGET | A restatement of the gold the player is looking at. |
| `first-run` | AS PER THE BRIEF | Finding 5. The only commendation an *action* could take away, on a game whose starters exist to be run and watched hitting a wall. The behavioural claim was refuted by the playtests; the incoherence was not. |
| `revised-downward` | REVISED DOWNWARD | A once-ever, lossier copy of `personalBestLine`, which does the same job every time it happens, with a number, and which both testers named the best reward in the game. Keeping both meant the good version fired second. |
| `outside-tolerance` | OUTSIDE OF TOLERANCE | Finding 7. A hidden second par on the same axis as the visible one, invisible until met, and unreachable rather than hard wherever the route is forced. |
| `no-contact` | NO CONTACT REPORTED | Finding 6. See §2 below. |
| `there-is-a-star` | THERE IS NO BONUS | A restatement of the star. The joke is good; the reward is the star arriving twice. |
| `sector-nominal` | SECTOR NOMINAL | Completion. It is the site map's closed-count with a note attached. |
| `sector-gold` | THE BUDGETS WERE SET CORRECTLY | Completion again, on medals this time. Also the entry A7 nearly broke twice. |
| `no-regressions` | NO REGRESSIONS AT THIS TIME | Finding 9.3. It makes a red result feel like a personal failure on the one screen in the game where a red result is the useful outcome. |

### What the cut took with it

`earnedBy` now reads exactly four fields. `RunFacts` lost `medal`, `ticks`, `parTicks`,
`blockedMoves`, `stars`, `previousBestTicks` and `worldResults`; the `WorldResult` interface and
`ELEGANT_FACTOR` are gone entirely. That is the finding-6 simplification the audit predicted
(`blockedMoveCount(trace)` is gone from `store.ts`) plus a larger one it did not: **no surviving
commendation reads a medal**, so the A7 hazard — a commendation keyed to a medal on a level that
has none — is now structurally absent rather than handled. `sector-nominal` and `sector-gold` were
the two that had to be taught about ungraded levels; both are gone.

