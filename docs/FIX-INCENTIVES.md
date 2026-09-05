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

### Save compatibility — the proof

`RETIRED_ACHIEVEMENTS` in `achievements.ts` names the ten. `rescueAchievements` in `save.ts` skips
them on read and keeps everything else, which is `rescueLevels`' medal whitelist applied to a
second field: **one drop, on read, so no screen has to know which commendations this build stopped
issuing.** An id that is merely unrecognised is kept — it was written by a build that is not this
one, and a player who opens an older binary must not have their record eaten by it.

Three further seams, all closed:

- **The v1 → v2 migration** used to reconstruct `filed` and `within-budget` from `medal` and
  `clearedAt`. Both are retired and none of the five follows from what a v1 save stored, so it now
  reconstructs nothing. `reconstructStats` is untouched.
- **`importSave`** unions `current.achievements` with `incoming.achievements`. Both sides have
  already been through `rescueAchievements`, so a retired id cannot re-enter through an import.
  There is a test for exactly that.
- **`store.award(id)`** now refuses an id this build does not issue. `src/ui/library.ts` still
  raises `no-regressions`, and that call site is not mine to delete; the guard means it writes
  nothing rather than writing a value the next load discards.

Proof is `src/game/__tests__/save.test.ts`, the new fixture block *"a save written by a build that
had fifteen commendations"*, built on `ungraded.test.ts`'s pattern: a literal JSON save from the
old build holding five retired ids and three surviving ones, asserting that the five go, the three
keep their original timestamps, and the level record, stars, best ticks, attempts, campaign stats,
signed requisitions and read review ranks all survive byte for byte. Plus one test that an
unrecognised id (`shipped-it-twice`) is kept, and one that import does not resurrect.

`achievements.test.ts` also holds a new invariant: no id may be in `ACHIEVEMENTS` *and*
`RETIRED_ACHIEVEMENTS`, because such a commendation would be awarded on the run and gone by the
next load.

### Test accounting for this unit

**1692 → 1686, exactly −6.**

| file | before | after | what moved |
|---|---:|---:|---|
| `achievements.test.ts` | 24 | 12 | −12. The twelve that died: `filed`'s first close; gold-only-on-gold; first-run-on-attempt-one; the personal-best commendation; the half-of-par bar; zero-blocked-moves; the duplicate tenth-attempt test; four sector tests (closed-sector, all-gold, empty world, ungraded-counts-as-gold); ungraded-pays-no-gold; the bonus-star commendation. Three arrived: the information budget in isolation, an ordinary close earning nothing, and the live-vs-retired disjointness invariant. |
| `save.test.ts` | — | +6 | The retirement fixture block. Four existing tests were re-pointed from `filed`/`no-contact` onto live ids; one was rewritten to assert the v1 migration reconstructs nothing. |
| `store.test.ts` | — | 0 | Two rewritten in place: "files the first close" became "pays no commendation for an ordinary close"; "never re-awards" became "files a commendation once and never again", driving `w1-01` to four runs so `second-look` is the thing that fires. `award` gained an assertion that a retired id is refused. |
| `ungraded.test.ts` | — | 0 | One retitled: the v1 gold on an ungraded level now reconstructs nothing at all rather than `filed` alone. |

---

## 2. Finding 12 — the binding document still ordered the streak's return. **Fixed.**

This was the live hazard: §11 of `DESIGN.md` opens *"Amendments — these override §1–§10"*, there was
no amendment retiring the streak, and §7.1 read `stats` as *"(runs, passes, fails, streak, best
streak)"* with a bullet stating a failed run *"resets the streak."* The most likely way the streak
came back was that somebody read §7.1 and put it back.

Three changes:

- **§7.1 now states the deletion in §7's absolute register**, the one it uses for character count:
  *"There is no streak. There is no streak counter, no best streak, no field for either in
  `CampaignStats`, and nothing anywhere that resets on a failed run."* The failure bullet no longer
  resets anything, and gained *"no commendation taken back"* because that is now the whole penalty
  model. A new bullet fixes the list at five and states the admission test.
- **`docs/DESIGN.md` §11 A9** records the ruling where agents are told to look. It carries the
  streak deletion, the cut to five, the survivors by id, the one-sentence test any sixth must pass,
  the invariant that **no commendation reads a medal** (so A7 cannot break one), and the
  retired-id-drop / unknown-id-keep save rule.
- **§11 A10** records finding 6's ruling as a standing constraint rather than as a one-off
  deletion: *a blocked move is priced once, in ticks.* Without it the next agent adds another
  no-bump reward and the finding regrows. See §4 below.

The orphaned doc comment under `CampaignStats.fails` — a description of the streak with no field
beneath it — is deleted in `save.ts`.

**Left for the orchestrator:** `src/ui/styles/screens.css:564` still defines
`.sitemap .screen-stat__streak`. That file belongs to the art-direction agent.

---

## 3. Finding 3 — the strictly linear unlock. **Fixed in the store; one line left for the screen.**

I did think hard before adding machinery, and the honest answer turned out not to be "stop
pretending the gate is strict" but "**stop the gate being the campaign's only failure mode**". The
difference matters: deleting the gate outright would have put all 34 work orders on the board at
minute one, and the leak the audit found — `openLevel` never checked the lock — is an argument that
the gate is *incoherently* enforced, not that it should not exist.

`isLevelUnlocked` in `src/game/store.ts` now implements the audit's own proposal:

- **closing a work order opens the next two**, measured from the deepest close in campaign order,
  so closing an order you skipped ahead to still moves the frontier;
- **closing a world opens the whole of the next world**;
- a fresh save still opens exactly one, so the on-ramp is unchanged.

Eleven lines, one exported constant, no new state and nothing persisted. The teaching order
survives because the entitlement is bought with closes — reaching World 5 still means closing most
of World 4. What does not survive is *not yet succeeding* closing a door, which it never should
have been able to do. Recorded as **DESIGN.md §11 A11** so it is not quietly re-tightened.

**One thing the change required, and it is the interesting one.** With two orders open, a player
can reach an order having skipped the one that granted a command — and `hardwareUnlockedBy` was
always cumulative, so they would have had `scan()` in scope with no requisition card for it.
`openLevel` now offers **every unsigned command in the order's API surface**, not only the ones
that order adds. `seenRequisitions` still makes each one once, ever, so nobody sees a card twice.
This bug existed before the change too, via the `openLevel` leak; it is now closed.

Six tests added in `store.test.ts` under *"the unlock gate"*: fresh save opens one; a close opens
two; **a player stuck on order 2 who closes order 3 keeps moving**; a closed world opens the next
world entire; a world whose predecessor is unclosed stays shut; a withdrawn id is unknown rather
than open. The existing withdrawn-level test in `save.test.ts` was re-pointed — `w1-05` is now open
after closing `w1-01`, and `w2-01`, three along, is the probe that must still be shut.

**Left for the orchestrator — intent first.** The gate lives *only* in the store now. The site map
must render a locked order as unavailable and an open one as available, and it must call
`isLevelUnlocked(save, id)` to decide — it must not re-derive the rule. Two specific things in the
current `src/ui/screens/LevelSelect.tsx`, for whatever replaces it:

1. `LevelSelect.tsx:84` picks the "current" order as the first unlocked-and-not-completed one.
   That still works with two open and needs no change, but whatever replaces it should keep
   picking the *earliest* open incomplete order, so the eye lands on the on-ramp and the second
   open order reads as the alternative rather than as the destination.
2. **`openLevel` still does not check the gate, and the Performance Review used to open locked
   orders through it.** The review screen is gone (A8), so the disagreement the audit found is
   already half-resolved. If the new site map wants the gate to be real, the guard belongs in
   `openLevel` and I have deliberately not added it: a store that silently refuses to open a level
   is a soft-lock risk, and with two orders open the gate is no longer worth defending that hard.
   My recommendation is to leave `openLevel` permissive and let the screen decide what it offers.

---

## 4. Finding 6 — the six systems that all pay for not bumping. The real answer.

This is the one I was asked to answer properly, so here is the count re-done against the code
rather than against the audit's summary, because the audit miscounts by one and defends the wrong
survivor.

| # | system | what it actually tests | verdict |
|---|---|---|---|
| 1 | `moveBlocked: 1` in `src/engine/costs.ts`, charged in `sim.ts` | a blocked move costs a tick | **Keep. This is the correct signal and the only one that should exist.** |
| 2 | `no-contact` / NO CONTACT REPORTED | `blockedMoves === 0` on any level | **Deleted.** |
| 3 | `w7-01` `no-slack` | `endTick <= floorTicks(ctx) && blockedMoves === 0` | **Query — see below.** |
| 4 | `w7-03` `no-bumps` | `blockedMoves === 0` | **Defend. The audit is wrong about this one.** |
| 5 | `w8-05` `no-blocked-moves` | `blockedMoves === 0` | **Cut. The clean one.** |
| 6 | `w3-01` `clean-run` | `endTick <= PAR && failedPickups === 0` | **Not in this family.** It counts failed *pickups*, not blocked moves. It is finding 7 material — a par restatement with a no-error conjunct — not finding 6 material. |

### The structural defect, stated correctly

The problem is not the count. It is that **a tick cost is proportional and a bonus gate is binary**,
and only one of those can be traded against.

Bumping a wall twice costs two ticks. You can still take gold. The player is free to use `move`'s
return value as the free sensing channel the game explicitly teaches — `w1-01`'s own hint sells
bump-and-turn as a real, slightly-expensive strategy, and `move`'s hardware note says *"Returns
false if the way is blocked."* The price is real, it is legible, and it leaves the idiom available.

A binary `blockedMoves === 0` gate cannot be traded against. It has exactly one reliable route on a
multi-seed level: **already know where the walls are.** Put it beside an information budget — "look
less" — and the pair is jointly satisfiable only by a program that does not need to look because it
was written against a layout the author had seen. That is a hardcoded route, which is precisely
what the multi-seed conjunction in `objectivesOnEverySeed` exists to prevent. Two systems, pointing
at the behaviour a third system is built to defeat.

**So the rule, and it is now DESIGN.md §11 A10:** *an incentive for the absence of an error must be
proportional, never binary.* Without a rule the finding regrows — the next author writes another
zero-bumps bonus because each one looks reasonable alone, which is exactly how the streak happened.

### Why `w7-03`'s `no-bumps` should survive, against the audit

The audit calls it "the first idea, graded harder" and groups it with `w8-05`'s. It is not the same
object. `w7-03`'s required objective is *deliver every crate to the silo bay*; its subject is a
one-lane tunnel that every bot must cross, and its designed failure is two polite bots deadlocking
in it. The hints are entirely about scheduling — *"A queue that runs one way empties faster than a
queue that alternates."* On that level `blockedMoves === 0` is not "did you plan the route"; it is
**"did you schedule the tunnel, or did you let the bots discover each other?"** That is a strictly
harder question than the required objective and it needs an idea the required solution does not
have, which is the audit's own admission test for a good bonus.

It is also the level's only bonus, so cutting it takes the level from four points to three.

The contrast with `w8-05` makes the case: there, `no-blocked-moves` sits beside `under-budget` and
`fleet-utilisation` on a level that already asks two harder questions, and it is not about
contention — it is about not driving into scenery. That is the one to cut.

### The query on `w7-01` `no-slack`

`(ctx) => ctx.trace.endTick <= floorTicks(ctx) && blockedMoves(ctx.trace.events) === 0`.

If `floorTicks` is genuinely the theoretical minimum makespan, the second conjunct is **dead
weight**: a blocked move costs a tick, so any bump already puts `endTick` over the floor and the
first conjunct has failed. Dropping `&& blockedMoves === 0` would then be a pure simplification
with no difficulty change at all.

I did not make the change, for one reason: if `floorTicks` has any slack in it, dropping the
conjunct makes the bonus easier, and difficulty is not mine to lower. **This needs one measurement
by whoever owns `src/levels/world-7`:** is there a program that hits `floorTicks` with a blocked
move in it? If no, delete the conjunct. If yes, `floorTicks` is not the floor and that is a
separate bug.

### What I did not change, and why

**No level content.** The hard constraint is *"Difficulty must not drop. No par, medal threshold,
budget, tick cost or objective changes."* A bonus objective is an `Objective` in `LevelDef.bonus`,
and cutting one lowers a level's maximum points and the Performance Review's denominator. I own
`src/levels/**` but not the licence to change what a level offers, so the two content changes are
diffs below rather than commits.

---

## 5. Every finding's disposition

| # | finding | disposition |
|---|---|---|
| 3 | strictly linear unlock | **Fixed** in `store.ts`, §3 above. One rendering note left for the site map. |
| 5 | `AS PER THE BRIEF` taxes pressing Run | **Fixed by deletion.** Taken as tidying, not as a fix, per the audit's own §18 correction — the behavioural claim was refuted by both playtests and I did not act on it. What I acted on is the coherence claim: three entries read `RunFacts.attempt`, one of them backwards. Now two read it, both forwards. |
| 6 | six systems pay for not bumping | **Partly fixed, fully answered.** §4 above. Commendation deleted; ruling recorded as A10; two content diffs handed over. |
| 7 | the golf moved onto ticks; 73% of bonuses are tightenings | **Partly fixed.** `outside-tolerance` deleted — it was a hidden second par on the visible par's own axis, invisible until met, and unreachable rather than hard wherever the route is forced. `revised-downward` deleted for the related reason that it was a once-ever, lossier copy of `personalBestLine`. `personalBestLine` untouched, as instructed and as it deserves. The bonus-layer half is content and is listed below. |
| 8 | should ticks be the medal axis in the early game | **Superseded.** The audit's own prescription — `LevelDef.graded`, `CLOSED` on a pass, 3 points flat — landed this week as §11 A7, at the narrower scope the orchestrator ruled (six levels, not "everything through World 2"). The par numbers were never mine. One sub-point survives and is a UI naming problem, listed below: `w1-01` shows **90** in the objective rail as a hard limit and **78** as par, with nothing on screen saying one is a fail and the other is a boundary. `w8-01` does the same with 215 and 165. |
| 9 | the Repository is unmeasured | **Partly fixed.** `no-regressions` deleted — it made a red result feel like a personal failure on the one screen in the game where a red result is the useful outcome, which is the opposite of what a refactoring suite is for. `repository` kept, and it is now one of five rather than one of fifteen, which is the whole of the visibility change I can make without adding points. The audit is right that the fix is *legibility, not points*, and it is right for a better reason than it gives: §18 records that the veteran used the Repository for its own sake with no reward at all, so the prescription "do not add points" is not a preference, it is a tested result. Both legibility items are UI and are listed below. |
| 10 | a Discrepancy reports a failure with no way to look | **Not fixed — `src/meta/**` is held by the crash-fix agent.** My ruling and the cheapest honest version are below. |
| 11 | a bonus star graded on one seed, the medal beside it on all of them | **Not fixed — needs `src/runtime/**`, which is outside my scope.** Cause confirmed and the exact patch is below. |
| 12 | DESIGN.md §7.1 still mandates the streak | **Fixed**, §2 above. |

---

## Changes for the orchestrator to apply

Each one leads with the intent, because a diff against a component that is being rebuilt does not
survive and an intent does.

### A. UI — the commendation shelf and the run report

**Intent: the shelf is a list of five, and nothing in the game may count it as a fraction of a
whole.** `src/ui/components/CommendationShelf.tsx` renders `{earned.length}/{ACHIEVEMENTS.length}`.
At fifteen that was a progress bar the player could not influence; at five it is worse, because
five is small enough that "1/5" reads as failing. **Drop the count entirely** and render the list.
No code change is required for correctness — the component maps `ACHIEVEMENTS` and will simply show
five rows — so this is a judgement call and it is the only one I would insist on.

`src/ui/screens/Results.tsx` needs nothing: it maps `freshCommendations` through `getAchievement`
and already filters `undefined`, so a retired id arriving from an old code path renders nothing
rather than crashing.

### B. `src/ui/library.ts:197` — delete the retired award

**Intent: the regression suite must not imply that a clean pass is the goal.** Refactoring is
supposed to break things so you find out; the suite already protects the player correctly
(`applySuite`'s `acceptMedals` defaults false).

```diff
-    const summary = state.suite?.summary;
-    if (
-      summary &&
-      state.suite !== previous.suite &&
-      summary.total > 0 &&
-      summary.broken === 0 &&
-      !state.suite?.run.cancelled
-    ) {
-      useGame.getState().award('no-regressions');
-    }
```

Not urgent: `store.award` now refuses an id this build does not issue, so the call is inert. It is
dead code, not a bug.

### C. `src/ui/styles/screens.css:564` — delete `.sitemap .screen-stat__streak`

The last physical trace of the streak.

### D. `src/audio/__tests__/sounds.test.ts:198` — a stale comment

`// Fifteen commendations exist. The fifteenth must not be a dog whistle.` The test itself is fine
and still passes: it asserts the `commend` sound holds pitch at the top of its ladder instead of
climbing out of the audible range, which is a property of the synth, not of the list length. Only
the comment is wrong. `src/audio` is not mine.

### E. `src/runtime/**` — finding 11, the bonus star graded on one seed

**Intent: a bonus is a level objective and must be graded on the same conjunction as every other
objective — every seed, worst result reported.** Right now the medal reads
`maxOf(runs.map(ticks))` while the star is re-evaluated in `store.ts`'s `withBonus` against the one
returned trace, which `aggregate.ts:81` picks as `runs[0]` when everything passed. That is why
`w3-02` shows `TICKS 402 · par 332` with "Bonus met — beat par by ten percent" underneath: 402 is
the worst seed, 281 is seed one.

Three small changes, and then `withBonus` disables itself — its `missing` filter returns the
verdict untouched once the worker reports the bonus, so nothing in `src/game` has to change on the
same commit.

`src/runtime/protocol.ts`, in `PerSeedResult`:

```diff
   objectives: ObjectiveReport[];
+  /** The level's bonus objectives on this seed. Never affects `passed`. */
+  bonus?: ObjectiveReport[];
   failure?: RuntimeFailure;
```

`src/runtime/run-level.ts`, after the existing `buildVerdict` call — a second pass rather than
adding them to the first, because `buildVerdict` derives `passed` from *every* objective it is
given and a bonus is optional by definition:

```diff
   const result: PerSeedResult = { seed, passed: verdict.passed, ticks: …, ops: …,
     objectives: verdict.objectives };
+  const bonus = level.bonus ?? [];
+  if (bonus.length > 0) {
+    result.bonus = buildVerdict({
+      objectives: bonus, world: sim.world, trace, initialWorld,
+      ops: sim.ops, seeds: 1, spend: sim.spendTotals(),
+    }).objectives;
+  }
```

`src/runtime/aggregate.ts` — the same worst-seed-per-objective rule the required objectives already
get, which is the whole point:

```diff
+function bonusAcrossSeeds(runs: readonly SeedRun[]): Verdict['objectives'] {
+  const reported = runs[0]?.result.bonus;
+  if (!reported) return [];
+  return reported.map((objective) => {
+    for (const run of runs) {
+      const missed = run.result.bonus?.find((c) => c.id === objective.id && !c.met);
+      if (missed) return missed;
+    }
+    return objective;
+  });
+}
```
```diff
-    objectives: worstPerObjective(runs, reported),
+    objectives: [...worstPerObjective(runs, reported), ...bonusAcrossSeeds(runs)],
```

Then delete `withBonus` from `src/game/store.ts` — its own comment says *"Delete this the day the
verdict carries them"* — and note that `FakeRunner` in `src/game/ports.ts` runs only
`submission.seeds[0]`, so it will keep needing `withBonus`'s behaviour or an equivalent. That is
the one thing to check before deleting.

**This is a scoring change and it will make some stars harder.** That is the correction, not a side
effect: those stars are currently awarded on a weaker standard than the objectives beside them.

### F. `src/meta/**` — finding 10, the Discrepancy nobody can look at

**Intent: either the player can run the layout they are told failed, or the game does not tell
them.** Being told you are wrong and given no instrument is worse than not being told, and the card
already offers `Stop raising these`, so the system's own opt-out is its most attractive option.

I would **give them the seed**, and the ranked options are:

1. **Best, and not much work.** When a discrepancy is open on level X, add its seed to X's run set.
   Everything needed exists: `run()` in `store.ts` passes `seeds: [...level.seeds]` to the runner,
   the runner takes a seed list, `seedResults` already carries per-seed objective readings, and
   `Results.tsx` already renders per-seed marks for multi-seed levels. The seam is one optional
   field on the store that the meta layer sets — `store.ts` must not import `src/meta`, or the
   layering inverts. I did not build half of it because the shape belongs to whoever owns `meta`.
2. **Minimum honest version.** Render the raised seed's trace on the card itself.
3. **If neither, stop raising them.** A costless notification about an unobservable failure trains
   the player to mute the one mechanism in the game that challenges overfitting — which is the
   single most likely wrong mental model a player of this game can form.

Once it can be inspected, `MIN_CLOSED_BEFORE_FIRST = 6` and `COMPLETIONS_PER_DISCREPANCY = 5`
should come down. Five events across 34 levels is the right rarity for a notification and the wrong
rarity for a teaching device.

### G. `src/levels/**` — the content half of findings 6 and 7

I own these files but not the licence to change what a level asks, so they are diffs. Both are
deletions of an optional bonus; neither touches par, a threshold, a budget, a tick cost or a
required objective.

**G1. `src/levels/world-8/w8-05.ts:857–872` — delete the `no-blocked-moves` bonus.** Intent: stop
paying a star for the non-occurrence of an error on a level that already asks two harder questions.
It sits beside `under-budget` and `fleet-utilisation`; `w8-05` keeps two bonuses and loses one
point of maximum. This is the clean cut of the four and the one I would take.

**G2. `src/levels/world-7/w7-01.ts:194` — probably delete the second conjunct**, pending the one
measurement in §4: `(ctx) => ctx.trace.endTick <= floorTicks(ctx) && blockedMoves(...) === 0`. If
`floorTicks` is the real floor the conjunct is unreachable-when-false and deleting it changes
nothing observable.

**G3. Do not cut `w7-03`'s `no-bumps`** despite the audit naming it. Argument in §4.

**G4. Finding 7's wider list, unactioned and ranked.** The audit names the pure tightenings; the
two playtests independently confirm the symptom (beginner §8 *"these are… confetti"*, veteran §8
*"Dead bonus: most of them"*) and independently name the same single exception, `w4-02`'s mark
budget. The ones I would retire or replace first, because they restate the required solution with a
tighter number and ask no new question: `w3-01` clean-run, `w8-01` audit-tight, `w8-03` tight-shift.
The models for what a replacement looks like are all in World 6 — `w6-02` `name-the-fault` asks the
player to *report which byte was altered*, which is a question the required objective does not ask.
**A level with no second idea in it is allowed to have no bonus**, which is already true of `w1-01`
and `w6-01`.

### H. UI — finding 8's surviving sub-point: a limit and a budget are not the same object

**Intent: two different tick numbers on one screen need two different words.** `w1-01` shows `90` in
the objective rail (`Objectives.withinTicks(90, { id: 'bay-booking' })` — a hard fail) and `78` as
par (a medal boundary). `w8-01` shows 215 and 165 the same way. The player is given no way to tell
which one ends the run. Whatever the new site map and workspace look like, a **limit** and a
**budget** should not both be labelled "ticks".

### I. Findings 9.1 and 9.2 — make the Repository legible without pricing it

**Intent: the one honest number already exists and is not shown.** `LibraryUsage` (`ticks`, `calls`)
is computed on every meta run and thrown away.

1. On the Results screen, for any run that linked the library: *"3 routines from the Repository, 41
   ticks inside them."* A fact about the run, not a score.
2. On the Repository panel, the reuse count per published routine: `pathTo` called by six work
   orders is the argument for the feature made by the save file rather than by a brief.

Neither adds a point to anything, which is the point — §18 records that intrinsic utility was
sufficient for the veteran with no extrinsic reward at all.

---

## 6. Verification

`npx tsc --noEmit` clean. `npm run build` clean. `npx eslint src` reports the one pre-existing
error at `src/levels/world-5/__solutions__/w5-01.ts:32` and nothing else. No re-run was needed —
the `onTaskUpdate` contention never appeared in this session.

**`npx vitest run`: 1692 tests, 68 files, green — the same total as the baseline, which needs
explaining because a cut should lower it.** Two changes moved it in opposite directions and they
happen to cancel:

| change | delta | detail |
|---|---:|---|
| the commendation cut | **−12** | `achievements.test.ts` went 24 → 12. Twelve died with ten commendations: `filed`'s first close; gold-only-on-gold; first-run-on-attempt-one; the personal-best commendation; the half-of-par bar; zero-blocked-moves; a duplicate tenth-attempt test; four sector tests; ungraded-pays-no-gold; the bonus-star commendation. Three arrived: the information budget in isolation, an ordinary close earning nothing, and the live-vs-retired disjointness invariant. |
| the save-retirement fixture | **+6** | `save.test.ts`, the new *"a save written by a build that had fifteen commendations"* block. |
| the unlock gate | **+6** | `store.test.ts`, the new *"the unlock gate"* block. |
| everything else | 0 | Six tests rewritten in place across `save.test.ts`, `store.test.ts` and `ungraded.test.ts` — re-pointed from retired ids onto live ones, or re-aimed at the new behaviour. None added, none removed. |

**−12 + 6 + 6 = 0.** The commendation layer is 12 tests lighter; the two things that replaced it are
a save-compatibility fixture and a progression invariant, which are worth more per test than an
assertion that a gold pays a gold commendation.

### Checked in the browser

Dev server on `:5191` in this worktree, own PID, killed after; own tab, closed after. Seeded a save
holding five commendation ids — three of them retired — with `w1-01` closed.

- The site map renders `w1-01` **CLOSED**, `w1-03` **OPEN**, `w1-05` **OPEN**, and every World 2
  node **ON HOLD**. That is the new gate exactly: one close, two open, the next world still shut.
- The shelf reads **2/5** and lists five rows — `A SECOND LOOK, AND A THIRD` (earned),
  `RAISED, AND RAISED AGAIN`, `REOPENED ON PURPOSE`, `MINIMAL OBSERVATION`,
  `ADDED TO THE REPOSITORY` (earned).
- `localStorage` still held `filed`, `within-budget` and `no-contact` — the retirement is a drop on
  *read*, so the header count, the shelf and everything downstream already read 2 while the stale
  keys sit in storage until the next write. That is the pattern behaving as designed, and it is why
  a player's other awards survive: nothing rewrites the record, it is filtered as it is loaded.
- No console errors.




