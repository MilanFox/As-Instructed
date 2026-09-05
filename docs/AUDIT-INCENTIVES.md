# Incentive audit

Read-only audit of the reward systems, 2026-09-05. Method: read the systems as an incentive
structure, name the behaviour each provokes, rule on whether that behaviour is good for *this*
game. No level was played. The playtests were read only after the findings below were formed,
and the cross-reference is at the end.

The instrument exists because the streak survived two playtests. The streak's shape was:
**a reward whose only way to earn it is to not do the thing the game is made of.** That shape is
the search pattern throughout.

Ranked most damaging first. **Confirmed** means the code says so and I traced it.
**Suspected** means I believe it and say what would settle it.

## Summary

| # | Finding | Provokes | Proposed fix |
|---|---|---|---|
| 1 | 31 of 34 levels report a bare bit on failure; only 3 can produce a `Divergence` | guessing instead of reading | make `divergence` mandatory in `Objectives.custom`; add a campaign-wide test |
| 2 | `offerPublish` still gated on a callable top-level declaration | Repository never reaches the player who needs it | **delete the gate** |
| 3 | Strictly linear unlock, 33 single points of failure | stuck is terminal | open the next two; open a world on world close |
| 4 | Performance Review grades against all 34 levels; top tiers contradict their own text | attendance, not understanding | scope to opened levels; take stars out of the denominator |
| 5 | `AS PER THE BRIEF` (close on the 1st Run) beside two "close on the 4th/10th" | *(behavioural claim refuted by both playtests — see §18; incoherence stands)* | **delete `first-run`**, as tidying |
| 6 | `NO CONTACT REPORTED` + 4 bonuses + tick cost all pay for not bumping | don't look, don't touch → hardcode | **delete `no-contact`**; replace the no-bump bonuses |
| 7 | 27 of 37 bonuses are tightenings, not second ideas | shave, don't think | cut the pure tightenings; a level may have no bonus |
| 8 | Par is the medal axis on levels with one solution; silver unreachable on two | teaches that the grade is noise | `graded: false` on reasoning levels; keep par where route is a choice |
| 9 | The Repository is unrewarded by every measure | retype inline, take the same gold | show `LibraryUsage` and reuse counts; delete `no-regressions` |
| 10 | A Discrepancy reports a failure on a layout the player has no way to run or watch | mute it | let the player run the raised seed |
| 11 | A bonus star is graded on one seed; the medal beside it on all of them | the card visibly contradicts itself | evaluate bonuses over every seed |
| 12 | DESIGN.md §7.1 still mandates the streak | the streak comes back | amend §7.1 and add an §11 ruling |
| 13 | `7/15` commendation fraction (suspected) | checklist framing | drop the denominator |
| 14 | lifetime `fails` counter stored, never read (suspected) | a scoreboard waiting to be rendered | delete it |
| 15 | World 8 is breadth, self-documented (suspected) | grind | curriculum call, flagged only |
| 16 | Six lines tell the player excelling will be punished; Dot says "i'd slow down" (suspected) | do less | let Dot stop carrying the joke at rank 4 |

Findings 1–12 are confirmed in the code. 13–16 are suspected and each states what would settle it.
§17 records what I checked and found sound. §18 is the cross-reference against the two playtests,
including the two places the playtests show I am wrong.

---

## 1. CONFIRMED — 31 of 34 work orders cannot report *where* a run went wrong, so the "read" step of the core loop is empty and the game rewards guessing

`src/engine/objectives.ts` supports a `divergence` — "**First divergence only.** Not every mismatch,
not a full expected/actual dump. One point." `src/game/budgets.ts` `failureCauses` consumes it,
`Results.tsx` renders it. The machinery is real, good, and almost entirely unfed.

Counted across the campaign:

- **71** of the **82** `Objectives.*` calls across the 34 level files are `Objectives.custom(...)`.
  (`grep -rho "Objectives\.[a-zA-Z]*" src/levels/world-*/w?-0*.ts | sort | uniq -c` → custom 71,
  withinSenses 6, withinTicks 2, printedSequence 1, inventoryAtLeast 1, botAt 1. A handful more
  arrive through shared level helpers; the campaign carries 61 required + 37 bonus objectives.)
- **25** of those supply a `progress` tuple (the 4th argument), which yields
  `"2 of 3 — 1 short"`.
- **Three levels** in the whole game can produce an actual `Divergence`: `w6-03` and `w6-05` via
  `stayOnRoute()` in `src/levels/world-6/signal.ts`, and `w6-01` via `Objectives.printedSequence`.
  `grep -rn divergence src/levels/` outside `__tests__` returns exactly those two files.

Everything else falls through `failureCauses` to the final branch:
`detail: budget ? budgetReadout(budget) : 'not met'` (`src/game/budgets.ts:420`). A bit.

Worked example, `src/levels/world-4/w4-04.ts:216`:

```ts
Objectives.custom('best-order', 'Take the collection points in the best order', (ctx) =>
  tookBestOrder(ctx),
),
```

Three arguments. On a miss the player is told: *"Take the collection points in the best order —
not met."* The level knows which order they took and which order was best. It reports neither.
That is an **oracle**, not a diff, and it is the campaign's default shape.

**Behaviour provoked.** When the report cannot tell you *how* you were wrong, re-reading it is
worthless, so `run → fail → read → revise` collapses into `run → fail → guess → run`. The player
starts permuting code rather than reasoning about it. This is the single most damaging thing in
the report because it does not distort the core loop, it **deletes a step from it**.

**And it makes two other systems pay out for the wrong reason.** `A SECOND LOOK, AND A THIRD` and
`RAISED, AND RAISED AGAIN` reward closing on the 4th and 10th run. Those were added to celebrate
*persistence through diagnosis*. With a bare-bit failure surface they instead reward
*persistence through guessing* — the game congratulates a behaviour its own feedback forced.
It cannot tell the difference, and neither can the player.

**Why the coverage looks the way it does.** `src/levels/__tests__/divergence.test.ts` names its own
provenance: *"`docs/PLAYTEST-BEGINNER.md` §3 is the specification for this file: fifty-five minutes
lost because four plausible answers and an empty program produced the identical `0 of 5 — 5
short`."* The fix was applied exactly where the playtest bled and nowhere else. That is the correct
response to a bug report and the wrong response to a systemic defect — which is precisely why this
audit is a separate instrument.

**Fix — make a divergence mandatory, not optional, for any objective that can name one.**

1. Change `Objectives.custom`'s signature so the divergence argument is required for objectives
   whose predicate compares against something the level computed. Mechanically: make `custom`
   take an options object with `divergence` non-optional, and add a narrow
   `Objectives.checkbox(id, label, fn)` for the genuinely binary ones ("the bot ended on the
   lift"). Then the type system asks the question at every call site instead of letting silence
   be the default.
2. Add a test in the shape of `src/levels/world-2/__tests__/world-2.test.ts`'s
   `no bonus label mentions characters` guard — a campaign-wide assertion that every objective
   which is not a `checkbox` reports either a `progress` tuple or a `divergence`. That is the only
   thing that keeps the coverage from decaying back.
3. Triage by damage first: the objectives most worth a diff are the ones whose predicate is a
   comparison the level already performed — `best-order` (report the order taken and the best
   order), `w5-04` `largest-idle`, `w6-02` `name-the-fault`, every `w8-*` precedence check. Those
   are diffs sitting one line from being printed.

This is also the cheapest large win in the report: the consumer side is already built and
shipping.

---

## 2. CONFIRMED — the publish offer is still gated on the habit the Repository exists to teach

`src/meta/store.ts:294` `offerPublish`, line 300:

```ts
const declarations = publishableDeclarations(code, hardware);
if (!declarations.some((each) => each.callable)) return;
```

`isCallable` (`src/meta/publish.ts:614`) is true only for a `function`, a `class`, or a `const`
bound to an arrow/function expression. A player who writes straight-line code in the work-order
body — **which every level's `starter` models** — has no callable top-level declaration, so the
only automatic route into the Repository never fires. Ever. Not once in 34 levels.

**This was diagnosed and not fixed.** `docs/FIX-LIBRARY-MOMENT.md` §1.5 states it verbatim:
"the discoverability chain being conditional on the player having already independently adopted
the habit the Repository exists to teach", and §1.6 names it as *the* undiagnosed defect. What
actually landed was the `briefed` gate and the `RepositoryIssue` ceremony (§269, §289 of that
doc). The `callable` early-return was left in place. `docs/OPEN-ITEMS.md` records this as fixed.
It is not.

**Behaviour provoked.** The player who already factors code gets offered the factoring tool. The
player who does not gets nothing, forever, and the game never once suggests the idea to the person
it was built for. The system self-selects for the players who least need it.

**Why that is bad here specifically.** "Write a routine once and reuse it" is the single
professional habit this campaign is architected around — `LIBRARY_REQUIREMENTS` in
`src/meta/unlock.ts` is an eight-rung ladder built entirely on it, and eleven of the last
fourteen work orders name a routine they expect to find in `lib.ts`. The teaching mechanism is
switched off for exactly the population that has not learned the lesson.

**Fix — delete the gate, do not soften it.** Drop the `callable` early-return. Offer publication
of whatever the scan found; if it found nothing callable, that is the *most* valuable moment to
speak, and the dialog should say so — "there is nothing here shaped like a routine yet; here is
what one looks like." A refusal is information. Silence is not. `publishDeclined` and
`publishMuted` already exist, so a player who does not want it can turn it off in one click; that
is the correct place for the off switch, not a heuristic that guesses whether they deserve to be
asked.

Second-order: the same shape is one level down. `publishableDeclarations` also requires column-zero
placement ("declared at column zero-ish"). Nested helpers, the natural product of a player who
*is* organising their code but inside a `main()`, are invisible to the offer too.

---

## 3. CONFIRMED — the campaign is a single-file chain: one level at a time, no lateral movement

`src/game/store.ts:727` `isLevelUnlocked`:

```ts
/** A level is open once the level before it in campaign order has been closed. */
```

Strictly N−1. `src/ui/screens/LevelSelect.tsx:83` renders every other node as `ON HOLD` with
`disabled`. There are 33 joins in the campaign and every one of them is a single point of failure.

**Behaviour provoked.** A player who is stuck has exactly one legal action: keep grinding the same
work order. They cannot go sideways, cannot bank a win somewhere else, cannot come back tomorrow
having done something in between. The only other escape valve is the hint ladder, which is finite
and ends with "That is everything she wrote down." (`src/ui/panels/BriefPanel.tsx:143`). After
that the player's options are solve it or quit.

**Why that is bad here specifically.** This genre's canonical answer to *stuck* is lateral
movement — Zachtronics, Baba Is You and The Witness all keep several things open at once, because
being stuck is not a failure state, it is a state you leave by walking away and returning with a
different frame. Here the game's own loop (run → fail → read → revise) has no exit condition, and
the design gives the frustrated player nothing to revise *toward* except more of the same. The
campaign's completion rate is bounded by the single hardest level in it.

The dependency argument for linear order is real but much narrower than the gate: `w4-05`
genuinely assumes `survey` and `pathTo` from `w4-04` (`src/meta/unlock.ts`
`LIBRARY_REQUIREMENTS`). That argues for ordering *within* a world, not for a global chain of 33
locks.

**The gate is already leaky, which makes the fix cheap and the current state incoherent.**
`openLevel` in `src/game/store.ts:292` does **not** check `isLevelUnlocked` — the lock lives
entirely in `LevelSelect`'s `disabled` attribute. And the Performance Review's medal wall renders
`<button className="wall__link" onClick={() => openLevel(row.level.id)}>` for **every row in
scope**, locked or not (`src/ui/screens/PerformanceReview.tsx`). So a player who clicks a work
order title on the review screen opens a level the site map refuses to open. Two screens disagree
about whether the campaign is gated, there is no store-level invariant behind it, and the strict
version is enforced only where it hurts.

**Fix.** Unlock at a coarser granularity: closing any work order opens the next **two**, and
closing a world opens the whole of the next world. Both preserve the teaching order — nobody
reaches World 5 without World 4 — and remove the terminal-stuck state. Failure must never be able
to close a door, and right now *not yet succeeding* closes 33 of them.

Secondary: 33 greyed `ON HOLD` nodes visible from level 1, with names and blurbs, is also a small
FOMO surface — a list of things the player is not allowed to have.

---

## 4. CONFIRMED — the Performance Review is a completion percentage wearing a performance grade, and its top tiers contradict their own thresholds

`src/ui/screens/PerformanceReview.tsx` `reportFor`, with `REVIEW_TIERS` / `reviewTier` in
`src/game/score.ts`.

The grade is `points / maxPoints` over a scope of `campaignOrder()` — **all 34 work orders,
always**, regardless of how many the player has been allowed to open (which, from a standing
start, is one; see finding 2). `maxPoints` is `3 + bonusCount` per level, and 32 of the 34 levels
carry a bonus, so the campaign total is ≈134 points.

Three separate defects fall out of that arithmetic.

**(a) It grades a mid-campaign player against work they are locked out of.** A player who has
closed 17 of 34 with a flawless gold on every one scores 51/134 = 38% and is told
`CONSISTENT WITH EXPECTATION` — *"This is the grade the site was designed around. Please do not
feel that it is the ceiling. It is, functionally, the ceiling."* A player who could not possibly be
doing better is told they are average. It is arithmetically impossible to exceed 50% before you
are past halfway, however well you play. This number is not a measure of performance; it is a
progress bar with a grade written on it.

The screen's own doc comment shows the authors saw this coming and fixed the wrong version of it:
*"the scope only ever contains work orders that have actually been **issued** — grading a
contractor against thirty-nine unwritten levels would pin them at DEVELOPING forever."* "Issued"
was implemented as "exists in `LEVELS`", not "the player has reached it". Now that all 34 are
written, the guard does nothing at all.

**(b) A perfect medal wall does not earn the top grade, and the top grade's own text says it
should.** All 34 at gold with zero bonus stars is 102/134 = **76.1%** → tier 4,
`EXCEPTIONAL (NON-BINDING)`. Tier 5 (`RETAINED`, `min: 93`) opens: *"Every work order on this site
is closed at or under par."* That sentence is **true of the tier-4 player**. Reaching 93% actually
requires all 34 golds *plus* 23 of the 32 bonus stars. The ladder is rendered on screen
(`memo__ladder`, "93% RETAINED"), so the player can read a threshold they have no way to reconcile
with the grade text sitting above it.

**(c) The tier-3 body goes false at the boundary.** `fillPlaceholders` sets `[n]` to
`gold + silver` and `[m]` to the scope size. A player at 32 golds, 2 silvers, no stars is
100/134 = 74.6% → tier 3, and is told "You are exceeding baseline in **34 of 34** work orders"
under the heading `ABOVE BASELINE` — one rung *below* where a single extra tick would have put
them.

**Behaviour provoked.** The only way to move this number meaningfully is to keep playing and to
sweep bonus stars campaign-wide. It rewards attendance. Worse, it punishes reading it early: the
player most in need of encouragement — mid-World-2, doing perfectly — receives the game's flattest
put-down, and it is not even true.

**Fix — scope it, and take stars out of the denominator.**
1. Restrict the scope to work orders the player has actually opened
   (`isLevelUnlocked(save, id) || progress.attempts > 0`). Two lines in `reportFor`; fixes (a)
   outright.
2. Grade on medals alone (`maxPoints = 3` per level). A perfect medal wall then reads 100%, tier
   5's text becomes true, and a bonus star goes back to being what `BONUS_MET` in
   `src/ui/copy.ts` promises it is — *"There is no bonus. There is a star."* A star should be a
   note on a record, not 9 percentage points of the grade you are held to.
3. §11 A4 fixes the *weights*, not the denominator, so (2) does not violate it. If it is read as
   doing so, the minimal version is to let a star push you up a tier but never hold you down —
   one line on `report.maxPoints`.

If the review is meant to be a joke about corporate metrics rather than a scoreboard, it must stop
being the game's only campaign-level number. Right now it is both.

---

## 5. CONFIRMED — the streak's contradiction survived the streak: `AS PER THE BRIEF` is a tax on pressing Run, and it sits on the shelf between the two commendations that reward the opposite

> **Corrected after the playtest cross-reference — see §18.** The behavioural claim below (that
> this makes players hesitate to press Run) is **not supported**: neither tester hesitated, and both
> ran freely. What survives is the coherence argument. Treat this as tidying, not as a fix, and
> rank it below findings 6–8.

`src/game/achievements.ts`, three entries reading the same variable (`RunFacts.attempt`) in
opposite directions, rendered adjacently by `src/ui/components/CommendationShelf.tsx`:

| id | title | requirement | direction |
|---|---|---|---|
| `first-run` | AS PER THE BRIEF | "Close a work order on the first Run." | fewer runs is better |
| `second-look` | A SECOND LOOK, AND A THIRD | "Close a work order on your 4th run or later." | more runs is better |
| `raised-again` | RAISED, AND RAISED AGAIN | "Close a work order on your 10th run or later." | more runs is better |

The streak was deleted and its two counterweights were added. **The pro-first-try term was left in
place.** The shelf shows unearned commendations with their requirement text (by design — "a
commendation is only tempting if you know what it wants"), so a player reading the shelf is told
the site's stated ideals are, in order, *close it in one run* and *close it in ten*.

**And `first-run` is the only one of the fifteen that an action can take away from you.**
`attempt = previous.attempts + 1` (`src/game/store.ts:508`) and `attempts` is persisted forever.
The moment you press Run on a level for any reason other than a finished attempt, `first-run` is
gone on that level.

**Why that is specifically bad here.** The starters are written to be run. `w1-01`'s entire starter
is `move(Dir.East);` — an incomplete program whose only purpose is to be dispatched so the player
watches it hit a wall. `w2-02`'s is `const here = scan(); print(\`${here.crop} ...\`)` — a probe.
The game hands the player a program designed to be executed and read, and then keeps a
commendation that is only available if they do not execute it. That is the streak's exact shape:
**a reward whose only route is to not do the thing the game is made of**, just narrowed from
campaign-wide to per-level.

It is also the one commendation that can only ever congratulate the *easy* stretch. First-run
closes happen in Worlds 1–2 and essentially nowhere after, so the note it prints ("Dot has read the
trace twice and found nothing to correct") is a reward for the levels that needed no thought.

**Fix — delete `first-run`.** Not rebalance, not reword. Remove the entry from `ACHIEVEMENTS` and
the `if (facts.attempt === 1)` line from `earnedBy`. Nothing is gated on it (`achievements.ts` rule
1), `starsFor`-style hygiene is not needed because commendation ids are never scored, and a save
that already holds it keeps the timestamp harmlessly. The shelf loses one row and gains coherence:
every remaining commendation then rewards *doing something*, and none rewards *not running*.

If a "clean first attempt" note is wanted for flavour, the honest version measures understanding
rather than restraint — e.g. gold on the first *passing* run — but the simplest correct move is to
have nothing there at all. There are already fourteen.

---

## 6. CONFIRMED — `NO CONTACT REPORTED` and `MINIMAL OBSERVATION` jointly reward hardcoding, and the first one double-charges a cost the medal already charges

`src/game/achievements.ts`:

- `no-contact` / NO CONTACT REPORTED — "Close a work order without a single blocked move."
- `minimal-observation` / MINIMAL OBSERVATION — "Meet an information budget — sense no more than a
  work order allows."

**A blocked move already costs a tick.** `src/engine/costs.ts:31` `moveBlocked: 1`, and
`src/engine/sim.ts:340` charges it. So bumping into a wall is *already* priced into the medal axis,
softly and proportionally, which is the right way to price it. `no-contact` charges for it a second
time, and converts a soft proportional cost into a binary all-or-nothing.

**The game teaches bump-and-turn as a legitimate idiom and then penalises it.** `w1-01`'s own hint
5 reads: *"Driving until a wall stops you does reach the corner, but every blocked move costs a
tick, and the bay is only booked for ninety."* That is a level explicitly presenting
move-and-check-the-return-value as a real, slightly-expensive strategy. `move`'s hardware note in
`src/ui/copy.ts` sells the same thing: *"Returns false if the way is blocked."* The return value of
`move` is a first-class free sensing channel, and one commendation says never to use it.

**The combination is the finding.** Together the two say: *do not look, and do not touch.* The only
strategy that satisfies both is to already know the layout — which on a fixed-seed level means
hardcoding a route, exactly the behaviour the multi-seed design exists to prevent. On multi-seed
levels the pair is not merely un-hintful, it is jointly unsatisfiable without a survey you are
being told not to run. Two systems rewarding opposite behaviour, in the specific sense the streak
established.

Note also that `no-contact` is silently unearnable on a whole class of levels by design: DESIGN.md
§11 A5 requires RENDER to draw a *blocked* move visibly differently precisely because `w7-01` and
`w7-03` are about bots blocking each other. On those, contention is the mechanic, and a
commendation that says "The walls have filed nothing" is a note that the level cannot issue.

**It is charged a third time, in the content.** Four bonus objectives pay a star for the same
absence: `w3-01` `clean-run` (par ticks *and* no failed pickup), `w7-01` `no-slack` (minimum ticks
*and* no blocked moves), `w7-03` `no-bumps` (zero blocked moves), `w8-05` `no-blocked-moves`. So a
single behaviour — never bumping — is paid by the tick cost, by a commendation, and by up to four
bonus stars, three of which then feed the Performance Review percentage (finding 4). Nothing else
in the game is weighted anything like this heavily, and it is not an idea; it is the absence of an
error signal.

**Fix — delete `no-contact`.** The tick cost is the correct and sufficient signal, and it is
already in the medal. And on the content side, `w7-03` `no-bumps` and `w8-05` `no-blocked-moves`
should be replaced with bonuses that ask for *something*, not for the non-occurrence of a thing a
correct solution avoids for free — that is a proxy for "did you plan the route", which the tick
budget already measures directly. Removing it also removes `blockedMoveCount(trace)` from `RunFacts`
assembly in `src/game/store.ts`, which is a net simplification.

Keep `minimal-observation`. An information budget is level-authored, visible in the objective rail,
and rewards understanding the world well enough to need fewer questions — that is a real idea and
the only one of the two that is. But it should be the *only* restraint reward in the game, so that
"look less" reads as a design idea rather than as one half of a general instruction to interact
with the world as little as possible.

---

## 7. CONFIRMED — deleting the character count did not delete the golf; it concentrated all of it onto ticks, and the bonus layer is now 73% "do the same thing, tighter"

Character count is genuinely gone — I checked. No `chars` on `Verdict.stats`, no `bestChars`, no
scanner, `par` is `{ ticks: number }`, and `src/levels/world-2/__tests__/world-2.test.ts:315`
guards bonus labels against `/char|length|line|short/`. **I found no surviving pressure toward code
golf.** `w6-03`'s bonus "Send the same route back in fewer characters" is the only label in the
campaign with the word, and it grades the *transmitted payload string* against
`inbound(ctx.initialWorld)` — a run-length-encoding puzzle the bot solves at runtime, not the
player's source. `ObjectiveContext` has no field that could see source text. That part of the work
landed cleanly.

**But the pressure did not go away, it moved.** With chars gone, `ticks` is the only quantity the
game measures at all, and **five** systems now push on it simultaneously:

1. the medal (`medalFor`);
2. `outside-tolerance` / OUTSIDE OF TOLERANCE — under **half** of par;
3. `revised-downward` / REVISED DOWNWARD — beat your own recorded tick count;
4. `personalBestLine` in `src/ui/copy.ts` — *"Your own record, lowered by N"*, shown "once,
   loudly, next to the two numbers". **(I was wrong to list this one — see §18. Both testers name
   it the best reward in the game and they are right: it is a diff about the player's own past
   work, with no threshold and no denominator. Do not touch it.)**;
5. the bonus layer — of 37 bonus objectives across the campaign, roughly **27 are tightenings of
   the required solution** rather than a new idea: `w1-03` rationedSurvey, `w1-05`
   oneMovePerFloorTile, `w2-01` parkedWithoutOvershoot, `w2-02` noWastedFieldwork, `w2-04`
   withinSpoilage, `w3-01` clean-run, `w4-01` single-pass, `w4-02` mark-budget, `w4-05`
   fuel-reserve, `w5-01` one-pass, `w5-02` eight-probes, `w5-05` tight, `w7-01` no-slack, `w7-02`
   within-ten-percent, `w7-03` no-bumps, `w7-04` within-bound, `w8-01` audit-tight/tight-survey,
   `w8-03` tight-shift, `w8-04` no-resurvey, `w8-05` under-budget/fleet-utilisation/
   no-blocked-moves, and the rest.

Only about **10 of 37** bonuses require a genuinely different idea — `w3-02` one-depot-at-a-time,
`w3-04` aisle-discipline, `w4-04` best-order, `w5-04` largest-idle, `w6-02` name-the-fault, `w6-03`
shorter-encoding, `w6-04` straggler, `w6-05` repair-blocks, `w8-02` ship-while-you-look. Those are
the good ones and they are the minority.

**Behaviour provoked.** The bonus star is presented as the game's "second thing to think about" —
`BONUS_MET`: *"There is no bonus. There is a star."* In practice, three times out of four, it is
the medal again with a tighter number. The player who wants the star is not asked to have a
different insight; they are asked to shave. That is the same activity the medal already scored,
paid twice, and it is the exact shape the character-count deletion was meant to remove from the
game.

**Why that is bad here specifically.** The `w6-*` bonuses prove what the good version looks like:
`name-the-fault` asks you to *report which byte was altered*, which is a strictly harder question
than the required objective and answering it requires an idea the required solution does not have.
That is what a bonus should be. `no-bumps` is not a second idea; it is the first idea, graded
harder.

**Fix — reclassify, do not rebalance.** A bonus objective should be admitted only if it asks a
question the required objective does not. Cut or replace the pure-tightening ones. Concretely,
retire the ones that are the required solution restated (`w3-01` clean-run, `w7-03` no-bumps,
`w8-05` no-blocked-moves, `w8-01` audit-tight, `w8-03` tight-shift) rather than re-tuning their
thresholds — a level with no second idea in it is allowed to have no bonus, which is already true
of `w1-01` and `w6-01`.

Also delete `outside-tolerance` (under half of par). It is a hidden second par, invisible until
met, on the same axis as the visible one, and on the levels where the route is forced it is
unreachable rather than hard — see finding 8.

---

## 8. STRUCTURAL RULING — should a tick budget be the medal axis in the early game?

*(The par-recalibration agent owns the numbers. This is the structural half only; no par values
are proposed here.)*

**My ruling: no. Not because par is set too low, but because on those levels there is nothing for
a three-tier grade to grade, and the fix is to stop displaying one — not to raise the number.**

The evidence is that par is not one axis, it is two different measurements sharing a badge.

**Where a tick budget measures something real.** `w3-02` (par 332), `w3-04` (365), `w4-02` (391),
`w4-04` (970), `w4-05` (700), `w8-02` (700), `w8-05` (1050). These are traversal levels. Ticks
price route quality, the solution space is genuinely wide, and gold-vs-silver reports a real
difference in the player's thinking. Here par is a good axis and should stay.

**Where it measures nothing.** `w6-01` par **1**. `w5-02` par **2**. `w7-01` par 10, `w6-04` par
14, `w2-01` par 18. On these the difficulty is entirely reasoning — binary search over 200 relays,
a decode, a scheduling insight — and the *action* the bot takes afterwards is one or two ticks
long. Worse, the medal ladder degenerates arithmetically. `medalFor` is `<= par` gold,
`<= par * 1.25` silver, pass bronze. At par 1 the silver band is `(1, 1.25]` and at par 2 it is
`(2, 2.5]`: **on `w6-01` and `w5-02` silver is unreachable by construction.** The player sees a
three-medal ladder where two outcomes exist: gold, or a bronze cliff one tick wide.

And the level files themselves say the middle case out loud. The par-relevant comments on `w1-01`,
`w4-01`, `w5-01`, `w5-03`, `w5-05`, `w6-02`, `w6-03` and `w6-05` state in various words that the
route is forced and par *is* the correct solution's cost — `w5-05`'s is "Prim leaves nothing to
shave." Those are levels with one sensible solution. On a level with one sensible solution, a tick
budget cannot distinguish a good player from a correct one, and **raising par makes it worse, not
better**: it converts "gold for correct" into "silver for correct", which takes a truthful signal
and replaces it with a lie about a headroom that does not exist.

So the question "raise par, or is par not the axis?" has a third answer, and I think it is the
right one: **par is the correct axis on some levels and the wrong one on others, and the game
should say which.**

Concretely, what I would do:

1. **Give `LevelDef` an explicit `graded: boolean` (or `medalAxis: 'ticks' | 'none'`).** On an
   ungraded level, a pass is a close — one state, shown as `CLOSED`, no ladder, no "ticks / par"
   line. The player is not told they scored 3/3; they are told the work order is closed, which is
   the truth. Ungraded levels contribute their 3 points flat to the Performance Review so nothing
   downstream changes.
2. **Ungrade the early game and the pure-reasoning levels** — everything through World 2, plus
   `w5-02`, `w6-01`, `w6-04`, `w7-01`. That is roughly the set both the code comments and the
   arithmetic already identify.
3. **Keep par as a real, tuned axis exactly where the route is a choice** — the traversal levels
   above. There it is doing honest work and the recalibration agent's numbers matter.

The incentive argument for this, which is the part I actually own: **a medal ladder on a level
with one solution teaches the player that the game's grade is noise.** They gold nine of the first
ten without trying, conclude the medal means nothing, and then stop reading it at exactly the
point in World 3 and 4 where it starts carrying information. Devaluing the signal in the on-ramp
is more expensive than having no signal there, because it is very hard to make a player start
believing a number again once they have learned to ignore it.

A displayed number that cannot be influenced is on this audit's hunt list. Par on `w6-01` is one.

**One more piece of evidence that the tick budget is doing two jobs at once.** The very first level
of the game has **two different tick numbers**: `par: { ticks: 78 }` and a *required* objective
`Objectives.withinTicks(90, { id: 'bay-booking', label: 'Clear the bay within 90 ticks' })`
(`src/levels/world-1/w1-01.ts:75,84`). `w8-01` does the same (par 165, a required shift budget of
215). So on level one the player is shown 90 in the objective rail and 78 as par, with nothing
explaining that one is a hard fail and the other is a medal boundary. If the medal axis is going to
stay on ticks anywhere, these two roles need different names on screen — a *limit* and a *budget*
are not the same object and the UI currently presents both as "ticks".

---

## 9. CONFIRMED — the Repository is the only system in the game with no reward attached to it, and it is the one habit the campaign is built around

Nothing in the scoring system can tell whether a player used `lib.ts`.

- The medal is `ticks` only. `src/meta/unlock.ts` states plainly that of the eight ladder
  routines, only `pathTo` moves ticks at all: *"The other five are free at the tick level and earn
  their place on reuse alone."*
- The Performance Review counts medals and stars. Neither can see the Repository.
- Of fifteen commendations, exactly two touch it — `repository` (publish once) and
  `no-regressions` — and both are one-shot. There is no ongoing signal.
- Meanwhile using it is strictly *more* work than not: publish, manage imports, keep the
  regression suite green.

**Behaviour provoked.** Retype the routine inline. Close the order. Take the identical gold. The
optimal play, under every measure the game keeps, is to ignore the Repository — and finding 2
means the game will never even offer it to the player who would have. Eleven of the last fourteen
work orders name a routine they expect in `lib.ts` (`LIBRARY_REQUIREMENTS`), so this is not a side
feature; it is the campaign's spine, and it is unmeasured.

**Why that is bad here specifically.** Every other reward in this game measures a property of one
run. Factoring is the only thing in the curriculum whose payoff is *across* runs, and it is the
only thing with no reward. The incentive structure is therefore blind to the single most
transferable skill the game teaches.

**Fix — do not add points; make the payoff visible.** Adding a "library bonus" would be a
counterweight, and counterweights are what this audit is against. Instead:

1. The one honest number already exists and is not shown: `LibraryUsage` (`ticks`, `calls`)
   is computed on every meta run. Show it on the Results screen for any run that linked the
   library — "3 routines from the Repository, 41 ticks inside them." That is a fact about the
   run, not a score, and it makes the habit legible without pricing it.
2. Show the reuse count on the Repository panel per published routine — `pathTo` called by six
   work orders is the argument for the feature, made by the save file rather than by a brief.
3. `no-regressions` should go. "Finish a regression pass with nothing broken" makes a red result
   feel like a personal failure on the one screen where a red result is the *useful* outcome —
   refactoring is supposed to break things so you find out. The suite already protects the player
   correctly (medals move only on explicit accept, `applySuite`'s `acceptMedals` defaults false);
   the commendation is the only thing on that screen implying a clean pass is the goal.

---

## 10. CONFIRMED — a Discrepancy reports a failure the player has no way to observe, and offers a button to make it stop

`src/meta/discrepancy.ts`. A closed work order is re-run on a seed **outside its own seed list**
(`offScheduleSeeds`), and if it fails, a card is raised: *"Shipping have run it against layout 847,
which was not on the schedule, and it did not close."* (`DISCREPANCY.body`, `src/meta/copy.ts:247`).

The idea is excellent — generalization is the thing this campaign most wants to teach, and a level's
own seed list is a conjunction the player can overfit to. Two things sink the execution.

**The player cannot see the failing run.** There is no seed picker anywhere in the UI — I checked
`Workspace.tsx`, every panel, and `ViewportPanel.tsx`, which displays `level?.seeds[0]` as a
read-only label. Pressing Run always runs the level's own seed list. So when the player clicks
`OPEN THE WORK ORDER` they arrive at a level that runs the four layouts it always ran, all of
which pass. The failing layout is never rendered, never traced, never stepped, and produces no
divergence, no objective readout, no tick count. Resolution is decided behind their back:
`recheckDiscrepancies` (`src/meta/store.ts:391`) re-runs the level on the raised seed after any
later completion and flips it to resolved if it happens to pass.

**Behaviour provoked.** The player is told a bit — *it broke somewhere you cannot look* — and given
no instrument to investigate it. This is the same defect as finding 1 in its most extreme form:
not a report that omits the divergence, but a *run that cannot be watched*. Since the discrepancy
costs nothing (correctly: nothing is un-closed, no medal moves), and since the card offers
`Stop raising these`, the rational player mutes it. The system's own opt-out is its most attractive
option.

**Why that is bad here specifically.** Overfitting to the visible seeds is the single most likely
wrong mental model a player of this game can form, and the Discrepancy is the only mechanism that
challenges it. Built this way it does not challenge it — it asserts it, unfalsifiably, and then
apologises with a mute button.

**Fix — let the player run the seed.** When a discrepancy is open on level X, add its seed to X's
run set (or expose it as a one-click "run layout 847"). Everything needed is already there: the
runner takes a seed list, the viewport already labels the seed, `seedResults` already carries
per-seed objective readings, and `Results.tsx` already renders per-seed marks for multi-seed
levels. The discrepancy then becomes what it was meant to be — a failing run the player can watch,
diagnose and fix — instead of a notification. If that is too much, the minimum honest version is to
render the raised seed's trace on the card itself.

Second, `MIN_CLOSED_BEFORE_FIRST = 6` and `COMPLETIONS_PER_DISCREPANCY = 5` means roughly five
discrepancies across a 34-level campaign. That is the right rarity for a costless event, and the
wrong rarity for a teaching device. Once it can be inspected, it should fire more.

---

## 11. CONFIRMED — a bonus star is graded on one seed while the medal beside it is graded on all of them, so a single result card contradicts itself

Found by both playtests as a symptom; the cause is `withBonus` in `src/game/store.ts:142`:

```ts
/* … Evaluating the level's own bonus objectives against the returned trace closes the gap
   without inventing a second scoring rule … Delete this the day the verdict carries them. */
const context = { world: replayTo(revived, revived.endTick), trace: revived, initialWorld: … };
return { ...verdict, objectives: [...verdict.objectives, ...evaluateObjectives(missing, context)] };
```

Required objectives are a conjunction across every seed — `objectivesOnEverySeed` in
`src/game/score.ts` exists specifically to enforce that, and the aggregate verdict reports each one
from its **worst** seed. The medal likewise comes from `verdict.stats.ticks`, the multi-seed
aggregate. But a bonus that the worker did not report is re-evaluated here against **one** revived
trace. So the star is graded on a single layout while everything beside it is graded on all of
them.

The visible consequence, from `docs/PLAYTEST-BEGINNER.md` §10: *"`w3-02`'s result card contradicts
itself. `TICKS 402 · par 332` with 'Bonus met — Beat par by ten percent' directly beneath. The
medal uses the worst seed (402), the bonus uses the best (281)."* And
`docs/PLAYTEST-VETERAN.md` §4: *"`w2-05`'s bonus progress reads from a different seed than the
verdict… Three numbers, two sources."*

**Behaviour provoked.** The star is systematically easier than the objectives it sits next to, and
the card openly shows the player that the game's two numbers disagree. That teaches, in one glance,
that the scoring is not to be taken seriously — which is the same lesson finding 8 says par teaches
in the on-ramp, arriving from a second direction.

**Why it matters more than a display bug.** Those stars are 32 of the 134 points the Performance
Review grades on (finding 4). A quantity awarded on a weaker standard than everything around it is
feeding the game's only campaign-wide number.

**Fix.** Evaluate bonus objectives in the worker, over every seed, on the same conjunction rule as
required objectives — which the module's own comment already prescribes: *"Delete this the day the
verdict carries them."* Until then the card must at minimum label which seed each figure came from;
showing two numbers from two seeds under one heading is worse than showing one.

---

## 12. CONFIRMED — `docs/DESIGN.md` §7.1 still mandates the streak, and DESIGN.md is binding

`docs/DESIGN.md:246`:

> The reward systems are `src/game/achievements.ts` (commendations) and the `stats` block in
> `src/game/save.ts` (runs, passes, fails, **streak, best streak**).

and `:251`:

> **Failure costs nothing but time.** … A failed run **resets the streak** and increments a
> counter that exists only to reward persistence.

Neither field exists. `CampaignStats` in `src/game/save.ts:66` is `{ runs, passes, fails }` — and
still carries the streak's **orphaned doc comment with no field under it**:

```ts
  fails: number;
  /** Work orders closed in a row with no failed run in between. Reset by a failure, never by time. */
}
```

`src/ui/styles/screens.css:855` still defines `.sitemap .screen-stat__streak`.

**Why this is a finding and not housekeeping.** §11 of DESIGN.md opens "Amendments (orchestrator
rulings — these override §1–§10)". There is no amendment retiring the streak. So the binding spec,
read by the next agent that opens it, instructs them to implement a counter that resets on failure,
and leaves them a CSS class and a doc comment that look like a half-finished job someone abandoned.
The most likely way the streak comes back is that somebody reads §7.1 and puts it back.

**Fix.** Amend §7.1 to state the deletion in the same absolute register §7 now uses for character
count — *"There is no streak. A failed run changes nothing but a counter that exists to reward
persistence"* — and add an §11 amendment recording the ruling, because §11 is what agents are told
overrides everything. Delete the orphaned comment in `save.ts` and the dead CSS class. This is
about ten minutes of work and it is the difference between a deletion and a deletion that stays
deleted.

---

## 13. SUSPECTED — the two visible completion fractions are attendance meters

`src/ui/components/CommendationShelf.tsx:23` renders `{earned.length}/{ACHIEVEMENTS.length}` —
"7/15" — above a list of every unearned commendation with its requirement. `LevelSelect.tsx:181`
renders a commendation count on the site map.

The shelf's design note is right that showing requirements beats hiding them behind question
marks. The **fraction** is the imported pattern: a denominator turns a set of optional notes into a
checklist with a completion percentage, and several of the fifteen are not things a player can
choose to go and do (`sector-gold` needs a perfect world; `raised-again` needs to have struggled
ten times). A player at 7/15 is being shown a gap they cannot close by deciding to.

I have marked this suspected rather than confirmed because it is a genuine judgement call and the
shelf is otherwise well built. **What would settle it:** whether a player reads "7/15" as
information or as a task. That is a playtest question, and the honest answer is that this
instrument cannot answer it. The low-risk move is to drop the denominator and show the earned count
alone — `7 COMMENDATIONS` — which loses nothing and cannot be read as a target.

Small confirmed defect in the same code: `LevelSelect.tsx:181` counts `Object.keys(save.achievements).length`,
i.e. keys in the save rather than commendations that still exist. A retired id would inflate it
forever. This is the same bug class `starsFor` in `src/game/score.ts` was written to fix, and the
fix is the same one line: filter against `ACHIEVEMENTS`.

---

## 14. SUSPECTED — the campaign counts and can display a lifetime failure total

`src/game/save.ts` `CampaignStats.fails`, incremented in two places
(`src/game/store.ts:215` and `:544`). Its own comment defends it: *"`fails` exists to celebrate
persistence, not to scold, which is the whole reason it is safe to count them."*

`grep -rn "stats\.fails|stats\.passes|stats\.runs" src/ui src/meta` returns **nothing** — all three
counters are written on every run and read by no screen in the game. They are dead weight in the
save. The reason this is filed as suspected rather than confirmed is that a number nobody displays
provokes no behaviour today. The concern is that a stored lifetime failure count is a loaded gun: it is one
`<dd>{save.stats.fails}</dd>` away from being a scoreboard of every time the player was wrong, and
the `.screen-stat__streak` class sitting unused in `screens.css` is evidence that this exact
family of numbers has been on the site map before.

**What would settle it:** grep the built output, or ask whether the site map ever showed it. If it
is genuinely unrendered, the fix is to delete `fails` outright — it is derivable as
`runs - passes` if anything ever wants it, and a number that exists only to be displayed one day
should not exist. `passes` is likewise unread.

---

## 15. SUSPECTED — World 8 is breadth where it should be depth, and the finale's par has 33–47% slack

Reported for completeness because it is the "difficulty that is noise rather than depth" target,
and because the levels **say so themselves**:

- `src/levels/world-8/w8-02.ts:161` — *"Every piece here is something World 3 and World 4 already
  taught. What is new is the budget."*
- `src/levels/world-8/w8-04.ts:405` (hint) — *"The band is not the puzzle. You have decoded a
  shifted, checksummed stream before, and this one is in the same format."*

World 8 raises seeds (5), required objectives (up to 5 on `w8-05`) and grid size without raising
the number of new ideas. A synthesis capstone is a legitimate design and the code is honest about
being one; the risk is that the *added* difficulty lands entirely as more surface at a tighter
clock, which is the shape the finale's withdrawn 5x7 grid already had.

`w8-05` also carries self-documented par debt: its own comment states the reference solution costs
**560–977 ticks** across three seeds against `par.ticks: 1050`, left over from a seven-seed version
— "a decision for the orchestrator, not a silent one". **That is the par agent's, not mine**, and I
am only recording that the level flagged itself.

**What would settle the breadth question:** whether `w8-01`–`w8-04` each contain one thing a player
has to newly understand, or four things they have to newly *assemble*. Assembly is a real skill and
a fine capstone; four levels of it in a row with a tightening clock is a grind. That is a
curriculum call, not an incentive one, so I flag it and stop.

---

## 16. SUSPECTED — the voice tells the player, six times, that doing well will be punished, and Dot advises slowing down

The house joke is that Kessler & Daughters responds to excellence by revising the standard. As a
joke it lands. As an incentive it is the *only* commentary attached to good results, and it is
uniformly discouraging:

- `src/ui/copy.ts` `UNDER_PAR` — *"Under par. Par has been adjusted. This is how it has always
  worked."* (shown on **every** sub-par gold, i.e. the best result the game has)
- `achievements.ts` `within-budget` — *"Gold. Finance have asked whether the budget was set
  correctly. It was."*
- `achievements.ts` `outside-tolerance` — *"Par has not been adjusted. Par will be adjusted."*
- `achievements.ts` `sector-gold` — *"Gold across a sector. The budgets are now under review,
  which is the thanks you get."*
- `score.ts` `REVIEW_TIERS` rank 4 — *"…that question has historically been resolved by adjusting
  the budgets."*
- `score.ts` `REVIEW_TIERS` rank 4 `dot` — **"4470 got this grade too. i'd slow down. i wouldn't,
  but i'd say it."**

The last one is the one I would look at hardest. Dot is the game's trusted voice — she writes the
hints, she is the one character not lying to the player — and at the second-highest grade she tells
them to stop trying. The `GOLD` and `SILVER` lines in `copy.ts` do the same in a smaller register:
*"Efficient. Noted. Not, at this time, rewarded."*

Par is never actually adjusted; nothing in the code moves a threshold. So the threat is empty. But
the player does not know that, and a player who takes the fiction at face value has been told, at
every peak moment, that the correct response to a good result is to do less.

**Suspected rather than confirmed** because `NARRATIVE.md` §7 makes the escalation an explicit
design ruling — "a weak review is gentle, a perfect one is a threat assessment. Do not invert it" —
and I am not going to overturn a stated ruling from the incentive side alone. **What would settle
it:** whether a player reads "i'd slow down" as satire or as advice. If it is even ambiguous, that
one line should change, because it is the one sentence in the game where the trusted character
recommends the behaviour the game does not want.

The minimum change that costs nothing: keep the corporate voice threatening and let **Dot** be
unambiguously on the player's side at rank 4, as she already is at rank 5 ("hey. good work.
genuinely."). The joke survives; the only warm voice stops carrying it.

---

## 17. NOT A FINDING — things I checked and found sound

Recorded so they are not re-audited.

- **Hint economy.** Genuinely good, and the one place I expected to find a confession mechanic and
  did not. Hints are free, un-timed, available from tick zero, stored append-only, never displayed
  as a count, and the byline is *"D. Halloran — field engineering. asking costs you nothing."*
  (`src/ui/panels/BriefPanel.tsx:128`). I read every `hints` array in all 34 levels; not one
  shames the asker. Several reframe the block as a question — `w1-03`: *"You cannot know the
  length before the run starts. What can you find out during it?"* The one structural note is that
  reveal is strictly sequential (`revealHint(revealed + 1)`), so a player stuck on the last idea
  must take spoilers for the first three. That is standard for the genre and I would leave it.
- **Failure costs nothing, and the code enforces it.** `recordResult` in `src/game/store.ts` never
  touches medal, `bestTicks`, stars or commendations on a failed run; `mergeProgress` keeps the
  better of each; `betterMedal` cannot go down; commendations are append-only with no removal path
  anywhere in `save.ts`. A failed run genuinely costs time only, and `NO_PENALTY` says so on
  screen. This is the thing the game gets most right.
- **Objectives are banked on failure.** `objectivesOnEverySeed` records required objectives that
  held on every seed even when the run failed. Partial credit for partial understanding, with
  nothing gated on it. Correct.
- **The regression suite is safe by construction.** `applySuite`'s `acceptMedals` defaults to
  false; a worse result is reported, never applied. The reasoning in the module header — "Losing a
  gold to an edit they were told nothing about is the fastest way to make someone stop touching
  the library" — is exactly the right instinct.
- **Seeds cannot be identified from player code**, so no information budget is beatable by a
  hardcoded lookup table. `probe()` returns a `MachineView` with no seed; `look()` returns a
  `TileView` exposing `machineId` but not `vars`, so `w5-02`'s mandatory 10-probe budget has no
  free side channel. `w6-04`'s comment states the rule: *"The key lives on the world, not the
  antenna: `probe` must not be able to hand it over."*
- **Character count is gone and stayed gone.** See finding 7.
- **The Requisition ceremony** is `seenRequisitions`-gated, once ever, skippable, and gates
  nothing. Fine.
- **No dailies, no timers, no FOMO clock, no currency, no lives, no attempt limit** anywhere in the
  codebase. The imported-pattern search came back mostly clean; what it found instead were
  patterns imported from the game's *own* earlier design (the streak's residue) rather than from
  other genres.

---

## 18. Cross-reference against the two playtests

Read **after** every finding above was written, so the instruments stay independent. Where the
playtests contradict me I say so.

### Where the two instruments agree

| # | Verdict |
|---|---|
| 1 (no divergence) | **Confirmed, hard.** Beginner §3, `w3-03`: *"The grader never diffs… `0 of 5 — 5 short` and nothing else."* §18: *"the single reason I would have stopped playing."* |
| 3 (linear gating) | **Confirmed.** Veteran §3: *"**What would have kept me: let me skip.** A single 'I know how to loop, show me something hard' door at the site map."* Beginner is the other half: stuck on `w3-03` for 55 minutes, 11 runs, §15 *"**No. This is where I stop.**"* |
| 7 (bonuses are tightenings) | **Confirmed, by both, independently.** Beginner §8: *"these are… **confetti**… The first bonus that was a real, interesting constraint arrived at level 17."* Veteran §8: *"Dead bonus: most of them."* Both named the same single exception — `w4-02`'s mark budget. |
| 8 (par is not the axis early) | **Confirmed, by both, almost verbatim.** Veteran §2: *"**A par you cannot miss is not a target, it is a receipt.**"* Beginner §8: *"gold is the default and the number in the corner is decoration."* Golds in the first ten: beginner 8, veteran 9. |
| 11 (bonus graded on one seed) | **Found by the playtests first**, and I traced the cause to `withBonus` afterwards. |

### Where the playtests did not look — the reason this instrument exists

- **Finding 4 (Performance Review).** **Neither tester mentions the screen once.** The beginner
  states it was out of scope; the veteran reached `w8-05`, opened the Repository, read the
  Regression tab closely, and never opened the Performance Review or wrote a word about it. The
  game's only campaign-wide number is entirely un-playtested. This is the streak's exact situation.
- **Finding 2 (publish gate).** Neither names the mechanism, but their two transcripts reproduce it
  perfectly: the beginner, who writes straight-line code, reports *"Publish offer never fired"*
  (§16 O4); the veteran, who factors by reflex, published three routines at `w4-02`. Two players,
  opposite outcomes, the predicted cause. Neither diagnosed it.
- **Finding 6 (double-charging blocked moves).** The *symptom* is confirmed — beginner §8:
  *"'Reach the pad without one blocked move'… **I attempted none of them and was awarded eight.**"*
  — but neither noticed that blocked moves are already priced in ticks, so the reward is paid
  twice.
- **Findings 10 (Discrepancy), 12–16.** Untouched. Neither tester reached World 5 or 6, so the
  `w6-01` / `w5-02` unreachable-silver arithmetic and the divergence coverage count are un-
  corroborated by observation; they stand on the code alone.

### Where the playtests show I am wrong

**Finding 5 is weaker than I wrote it, and possibly wrong.** I claimed `first-run` provokes
hesitation before pressing Run. Neither tester hesitated. The beginner ran 42 times across 17
levels, 11 on `w3-03` alone; the veteran ran 12 times on `w8-05`. Both quote the commendation
(beginner §4: *"COMMENDATIONS: AS PER THE BRIEF"*) and neither felt taxed by it. **The behavioural
claim is not supported.** What survives is the coherence argument: three commendations reading the
same variable in opposite directions is still incoherent, and a shelf that publicly states
"close it on the first Run" as a site ideal is still the wrong message next to two that say the
opposite. **I would still delete it — but as tidying, not as a fix. Demote it below findings 6–8.**

**Finding 9's behavioural prediction is refuted for the skilled player.** I claimed optimal play is
to ignore the Repository because nothing scores it. The veteran used it anyway, for its own sake —
§5: *"For `pathTo`/`reach` — yes, unreservedly; I wrote that BFS three times in four levels and
that is exactly the retyping the Library exists to absorb."* Intrinsic utility was sufficient for
him with no extrinsic reward at all. The beginner did not use it, but attributes that to
discoverability, not to the absence of points. So: **the scoring gap is real and un-tested; my
claim that it drives behaviour is refuted at the top of the skill range and unproven at the
bottom.** The prescription is unchanged and is the better for it — *do not add points*, make the
payoff legible.

**And a caution against my own finding 7.** I listed `personalBestLine` as one of five systems
piling onto the tick axis. Both testers name it as the single best-received reward in the game.
Veteran §5: *"`RECORD 47 ~~was 63~~ — Your own record, lowered by 16.` … **Do not touch it.**"*
He is right and I was wrong to file it as pressure: it is a *diff*, shown once, about the player's
own past work, with no threshold and no denominator. It is the shape every other reward in this
game should be copying. **Do not touch it.** My finding 7 stands against the *bonus layer* and
against `outside-tolerance`; it does not stand against the personal best.

### The playtests found three incentive problems I missed

1. **The commendation layer changes nothing.** Beginner §16 R2: *"Commendations changed my
   behaviour ZERO times. Two were awarded without ever being shown."* Veteran §8 R2: *"The
   commendation system never once changed what I did."* This is a verdict on the whole layer, not
   on individual entries, and it re-frames findings 5 and 6: the specific commendations are
   incoherent, but the layer they sit in is inert. That argues for the deletions being *cheap* —
   nothing is lost — and against adding anything to it. Fifteen commendations that provoke no
   behaviour is a system with a maintenance cost and no output; the honest question is whether it
   should be five.
2. **A bonus can read `met` before the program runs.** Veteran §4: *"On `w8-05`, 'Keep every bot
   working for at least two thirds of the shift' is green at tick 0."* A reward that is already
   earned when you arrive teaches that rewards are noise, which is finding 8's lesson again.
3. **An unintended shortcut trivialises a third of the finale and the game says nothing.** Veteran
   §6.3: `power(id, 'on')` closes both grid objectives in 16 ticks with no travel — *"the game did
   not acknowledge it in any way."* Optimal scored play diverges hard from intended play and the
   incentive system is silent in both directions.

### Playtest complaints now stale

- The **streak** the beginner logs at `w1-02` (*"two commendations and a streak badge"*) is gone.
- The **Library's missing ceremony** — beginner §7 in its entirety — is fixed. Her "hand-written
  its contents six times" was already established as wrong (four, and off-ladder).
- All **absolute level positions** in both documents ("17 of 40", "level 16 of 40") predate the
  40 → 34 cut and need renumbering; the substance behind each complaint does not.
- **Brief length** is not a live complaint in either document — the beginner's §13 concluded
  *"Mostly no"* before the compression pass — so the prose work fixed something the playtests had
  not flagged, which is worth noting in both directions.
- **Character count** appears in neither document. Its deletion closed a defect no tester felt,
  which is again the point of a separate instrument.

### What the cross-reference says about the two instruments

The playtests caught what *hurt*: the failure surface, par credibility, the dead bonuses, the
missing skip door. This audit caught what *shapes*: the publish gate, the review's arithmetic, the
discrepancy that cannot be inspected, the bonus graded on one seed, and the binding doc that still
orders the streak's return. There is one overlap of substance — findings 1, 3, 7, 8 — and the
overlap is where the loudest problems are, which is what you would expect. The findings the
playtests missed entirely (2, 4, 10, 11) are all systems that are *quiet*: they never block anyone
and never bore anyone, they just pay for the wrong thing. That is the category the streak was in.
