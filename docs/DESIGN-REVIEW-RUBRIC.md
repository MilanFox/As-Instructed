# BOOTSTRAP — Design Review Rubric

> **What this is.** An instrument for a playtest agent to apply and a developer to act on. It
> measures whether BOOTSTRAP is *fun*, which is the one thing the 1,175 tests do not.
>
> **Companion:** `docs/GENRE-ANALYSIS.md` — the evidence this rubric is built from.
>
> **The instrument is biased toward finding problems on purpose.** See §11 before you write a
> single line of report.

---

## 0. Hypotheses to test

Ranked predictions, written before anyone played. Each one is falsifiable. **The playtest must
return a verdict on every row: CONFIRMED / REFUTED / NOT REACHED, with the evidence.** A
hypothesis that is refuted is a good outcome and should be reported as loudly as one that is
confirmed.

### H1 — `w1-02` teaches a lesson it does not enforce
**Prediction.** `par.ticks` is 27 and the route is 27 moves, so **writing `move(Dir.East)`
twenty-seven times scores gold** — the exact behaviour the level exists to discourage. `w1-02` is
single-seed by declared exception (`CURRICULUM.md` §3), and the curriculum names the **char par** as
its *only* substitute defence: *"Defeated instead by the char par: 27 `move` calls passes bronze;
gold requires three loops. Scoring teaches the lesson, not failure."* But `DESIGN.md` §7 abolished
char scoring and no character objective exists anywhere in `src/`. The specified bonus ("under 60
characters") was not shipped either, leaving `w1-02` the only World 1 level after the opener with no
bonus at all. So the second level of the game has no mechanism — not failure, not score, not
bonus — that distinguishes the right answer from the wrong one.
> **Note, mid-review:** a concurrent content edit removed the brief's false claim that *"the
> character count in the corner is part of your score."* Good, and it confirms the diagnosis. The
> claim being gone does not restore the missing gate; it just means the game no longer lies about
> it. Re-verify the brief text at playtest time — these files are moving.
**How to test.** Solve `w1-02` with 27 literal `move` calls. Record the medal. Then solve it with
three loops. Record the medal. Report both. Then report whether anything at all in the UI suggested
the second solution was better.
**Why it's first.** It is not where a player quits; it is where a player learns what the score is
worth. Every later system — par, medals, the Cost tab, the whole Library metagame — is denominated
in trust that the number means something, and the game spends that trust before the player has
written a `while` loop. Cheapest fix in this document.

### H2 — `w8-01`'s teaching mechanic does not exist
**Prediction.** The brief states *"Two budgets apply and both are hard… Missing either one is a
fail."* The shipped level has one objective (deliver the ripe crops) and one bonus (a 17%-tighter
tick count). There is no character gate. `CURRICULUM.md` §12 records that w8-01 was created
*specifically to replace* a rejected draft called "a medium mixed level" that duplicated
"everything and nothing" — and without the dual budget, w8-01 is that rejected level.
**How to test.** Write a deliberately verbose but tick-efficient solution — long variable names,
generous whitespace, no golfing. Does it pass? Does it gold?
**Cost if confirmed.** A player who believes the brief will spend an hour golfing against a gate
that does not exist, and level 36 of 40 teaches nothing.

### H3 — World 8's finale is a code-volume problem, and most players never see the ending
**Prediction.** `w8-05`'s reference solution is 500 lines against 7 seeds in a single Monaco pane
with no file splitting, no checkpoints, and no partial credit. The genre's most-disliked puzzle
shape is exactly this ("a big code-to-solving ratio" — conceptually clear, tedious to implement).
SpaceChem finished at <2%; 7 Billion Humans at <5%. **The narrative payoff — the termination form,
the two endings, the message from 4470 (`NARRATIVE.md` §3.3) — is behind it.** The `note` insisting
bronze be reachable by "a patient player with a slow, ugly solution" does not help, because slow
and ugly is still several hundred lines.
**How to test.** Time-box a real attempt at w8-05 at 4 hours and report where you actually were.
Separately: count how many *distinct decisions* the level requires versus how many *lines* it
requires. Report the ratio.
**Related.** w8-02 ~120 lines, w8-03 ~110, w8-04 ~110, w7-05 ~90, w4-05 ~90. World 8 is roughly
450 lines of authored program *before* the finale.

### H4 — World 7's execution-model change gets one level and needs three
**Prediction.** Per-bot virtual clocks, makespan-as-score, `sync`, collision-returns-false, and
livelock all arrive in World 7, and `w7-01` is the single level allotted to teach the model. This
is precisely the jump that broke 7 Billion Humans, whose reviewers said "while stages introduce new
commands, there are more possibilities now that one stage doesn't feel like enough".
**How to test.** After finishing w7-01, before opening w7-02, write down from memory: (a) what
`sync()` does, (b) what the score is, (c) what happens when two bots want the same tile. Report
how many you got right. Then report how many times you re-read the docs during w7-02 and w7-03.

### H5 — `w2-04` Capacity is the first real abandon risk, around 90 minutes in
**Prediction.** w2-04 is the curriculum's first +2 spike (4→6) and sits at roughly level 9. It is
the first level where an action *silently fails and still costs a tick* (`harvest` returns false
when the hopper is full), and the first requiring interrupt-and-resume of the player's own
traversal. Capacity is deliberately unreadable except through `inventory()`. The naive solution is
4–5× over par but *passes*, so the player is bronzed and vaguely dissatisfied rather than blocked —
which is the shape that produces quiet abandonment rather than a complaint.
**How to test.** Report: number of runs before first pass; whether the first pass was a
return-to-silo-after-every-harvest solution; and whether you then went back to improve it or moved
on. **Moving on without improving is the confirmation signal.**

### H6 — `w4-04` produces the blank-editor failure the curriculum predicted
**Prediction.** `CURRICULUM.md` §11 calls it "the biggest risk in the game" and prescribes four
mitigations, the load-bearing one being a starter that ships a typed `Map<string, string[]>` and a
`key(x,y)` helper with a `NOTE(4470)` comment. If any mitigation did not ship, the failure mode is
a blank editor — the worst kind, "because there is nothing to debug".
**How to test.** Open w4-04 and, before writing anything, screenshot the starter. Verify all four
mitigations are present. Then report time-to-first-run (not time-to-pass). A time-to-first-run over
10 minutes confirms.

### H7 — the game has no decompression beat, and sessions 2 and 3 end on fatigue
**Prediction.** Every Zachtronics title ships a solitaire minigame for the state of "spent but
still here". BOOTSTRAP's answer is the difficulty sawtooth, whose designated rest beat (`w6-01`) is
~8 hours into a 22-hour campaign. The only non-thinking activity is the trace replay, which lasts
seconds.
**How to test.** Play in real sessions, not one sitting. At the end of each, record *why* you
stopped: solved something and felt good / hit a wall / got bored / got tired. If two or more
sessions end on "tired" rather than "wall", confirmed.

### H8 — one scored axis makes every solution converge and gives a struggling player nowhere to be good
**Prediction.** Medals are ticks-only (`DESIGN.md` §7). Opus Magnum's three antagonistic metrics
exist so that every player is at a high percentile in *something*; with one axis there is no
trade-off to have an opinion about, and a player 40% over par is simply worse. BOOTSTRAP has an
unused second axis available — `Objectives.withinSenses`, the information budget — which is
genuinely antagonistic to ticks (sensing is free in ticks) and is not code golf.
**How to test.** After silver-ing a level, ask: is there any dimension on which this solution is
notably good? Record whether the answer is ever yes. Also record how many levels actually use
`withinSenses` and whether its appearance is explained.

### H9 — the Library's Regression tab converts a reward into a liability
**Prediction.** Publishing to `lib.ts` means editing it re-runs every closed work order that
imports it. `LIBRARY.md` is careful (medals move only on explicit ACCEPT; `lastKnownGood` revert;
whole system optional). But the emotional shape is the inverse of a histogram: a histogram can only
tell you where you stand, a regression report can tell you that you made things worse. If a player
publishes once, sees a degraded result, and stops publishing, the six-brick ladder
(`CURRICULUM.md` §18) is authored against a system nobody uses.
**How to test.** Publish `pathTo` at w4-04/w4-05. Later, deliberately make it slower. Report the
exact wording and visual weight of what the Regression tab says, and your gut reaction in one
sentence written *before* you reason about it.

### H10 — the first multi-seed failure at `w1-03` is the most important teaching moment in World 1, and the UI may not deliver it
**Prediction.** `CURRICULUM.md` §3 requires that a counted loop pass seed 1 and fail seeds 2–3, and
that "the UI must show it clearly — seed 1 green, seed 2 red, side by side". `NARRATIVE.md` §5 #18
supplies the line ("Passed on seed [a]. Failed on seed [b]. The field is not always the same
field."). If the player instead sees a generic failure, the concept that defines this game's
relationship to hardcoding lands as a bug report.
**How to test.** Deliberately solve w1-03 with `for (let i = 0; i < 12; i++) move(...)`. Screenshot
what you see. Report whether a non-programmer would understand what just happened.

### H11 — the flavour bank is finite and the failure lines will wear out
**Prediction.** `NARRATIVE.md` §5 is 24 stock failure lines, capped at 90 characters, explicitly
"read dozens of times", across 40 levels and hundreds of runs. Jokes have a half-life. Once a line
is familiar it stops being a reward and becomes chrome, and the player starts skipping the panel it
lives in — including the parts that are not jokes.
**How to test.** Record the tick at which you stop reading failure messages. Record the level at
which you stop reading briefs before starting. Report both level numbers.

### H12 — `w6-01` is 8 hours in and by then the player has been asked to move a bot for 25 levels
**Prediction.** World 6 is "mostly data, not movement", which the curriculum correctly identifies
as a holiday. But the corollary is that Worlds 1–5 are *entirely* movement, and the genre evidence
says variety, not difficulty, is what sustains a long campaign. The risk is not that w6-01 is bad;
it is that the player needed it at hour 4.
**How to test.** At the end of World 3 (~4 hours), write down what you expect World 4 to feel
like. Report whether the answer contains any variation on "more of this".

### Lower-confidence, still worth a verdict

| # | Hypothesis | Test |
|---|---|---|
| H13 | Monaco lazy-loading makes a cold first load miss the 60–90s "this is fun" window | Cold cache, throttled to Fast 3G. Time from URL to first successful Run. |
| H14 | `w3-03` Manifest's "don't move" insight reads as a trick, not a lesson | Report whether you questioned the premise or optimised the route first, and how long before you switched. |
| H15 | `w5-05` Blackout fails opaquely: 9% over budget with no indication of which cable was wrong | Verify the verdict reports cable spent vs. budget vs. best possible, and that the replay draws the laid cable. Curriculum §11 requires all three. |
| H16 | `w6-04` The Cipher reads as missing information | Verify the brief states the keyspace size *and* the magic header, per §11. Report your first instinct on reading it. |
| H17 | Hint reveal state is not persisted across reloads (`BriefPanel.tsx`), so a returning player re-reveals hints they have read | Reveal two hints, reload, report what you see. |
| H18 | Bronze on `w8-05` is not actually reachable in one evening | See H3. |

---

## 1. How to run this instrument

**Play in real sessions.** Stop when you would actually stop. Session boundaries are data.

**Keep a running transcript with these columns, per level:**

```
level | wall-clock start | first-run time | runs to first pass | runs after first pass
      | medal | hints revealed | doc lookups | brief re-reads | reason for each failed run
      | one sentence: "what I will change next" (written BEFORE editing)
      | one sentence: how you felt when it passed
```

The **"what I will change next"** column is the single highest-value measurement in this document.
It is written before the edit, so it cannot be reconstructed. A run where the tester cannot fill it
in is a **feedback failure**, and feedback failures are the leading cause of abandonment in this
genre (§6).

**Report the level numbers, always.** "Pacing sagged in the middle" is unusable. "I stopped reading
briefs at w3-04 and never resumed" is actionable.

---

## 2. First session

Genre-specific because the first-session literature is written about mobile games with a 60-second
hook, and a programming puzzle game cannot and should not have one. The adaptation: the first
session's job is not delight, it is **establishing that the loop is short and that failure is
free.**

Evidence base: industry FTUE guidance puts the decisive window in the first 60 seconds to
10 minutes, with the specific warning that *"if you teach too much too early, retention drops
because the player feels tested before they feel rewarded"*
([Playio](https://blog.playio.co/mobile-game-onboarding-retention),
[Inviox](https://www.invioxstudios.com/blog/why-players-quit-games-within-the-first-10-minutes-and-how-to-fix-it)).
Barth's SpaceChem tutorial postmortem is the genre-specific version: railed tutorials with "so much
boilerplate" and many ways to fail are "a really wide hallway with one door"; the fix is
sandboxes where players "go in with trial and error, having no idea what they're doing"
([Game Developer](https://www.gamedeveloper.com/design/spacechem-s-zach-barth-on-educational-games-tutorial-design)).

### F1 — Minute 0–5: the loop must close once

| Signal | Report |
|---|---|
| Time from page load to first successful **Run** (any result) | Seconds. Target: **< 120s.** Fail: > 300s. |
| Did the player press Run before reading the whole brief? | Y/N. **Y is the good answer.** The starter ships working code; if nobody presses Run to see what it does, the affordance is weak. |
| Did the player find Run without being told? | Y/N, and how. |
| Number of concepts presented before the first Run | Count: coordinate system, `Dir` enum, `move`, the memo fiction, ONBOARD, the docs panel, the timeline. **> 4 is a red flag.** |
| Was the first thing that happened on screen a *bot moving*? | Y/N. If the first feedback is a wall of text, that is the finding. |

### F2 — Minute 5–15: the second idea, and the first honest failure

| Signal | Report |
|---|---|
| Which level is the player on at minute 15? | Level id. Target: w1-03 or w1-04. |
| Has the player *failed* yet, and did they understand why? | Both, separately. A first session with no failure is as bad as one with an illegible failure. |
| Did the player discover scrub/step/speed control? | Y/N, unprompted or prompted. This is BOOTSTRAP's best affordance; if it goes undiscovered in 15 minutes, that is a UI finding, not a player finding. |
| Did the player look at the docs panel? Did they find what they needed? | Y/N/N. TFWR's most avoidable complaint was a player hunting for hours for a function that did not exist. |
| Did the w1-02 char claim get believed? | Y/N. See H1. |

### F3 — Minute 15–30: the reason to come back

| Signal | Report |
|---|---|
| Has the multi-seed model been experienced (not just read)? | Y/N, at which level. |
| Has the player seen a **medal above bronze**? | Y/N. A first session where every result is bronze teaches "I am mediocre at this". |
| Has a hardware Requisition ceremony fired? | Y/N. Report whether it felt like a reward or an interstitial to click through. |
| Can the player state, in one sentence, what the game is about? | Their words, verbatim. |
| **Would the player open it again tomorrow?** Why, in their words. | Verbatim. This is the whole question. |

### F4 — Genre-specific first-session failure modes to check explicitly

1. **Feeling tested before feeling capable.** The player writes code, it fails, and they do not know
   whether the fault is theirs, the API's, or TypeScript's. Signal: any failed run in the first 15
   minutes where "what I will change next" is blank or is "try something".
2. **The wide hallway with one door.** The starter constrains you into one solution and any
   deviation fails. Signal: player tries a reasonable alternative approach in W1 and it fails for a
   reason unrelated to the lesson.
3. **Toolchain friction masquerading as difficulty.** A TypeScript error, a Monaco quirk, a
   red squiggle the player cannot resolve. Signal: any minute spent on a compiler message rather
   than a game message. Report each occurrence with the exact message text.
4. **Comedy before competence.** The brief's jokes land only if the player already feels okay.
   Signal: did the tester skip the flavour on w1-01? On w1-03?
5. **The coordinate system.** `y` grows South is stated in the brief, the starter, and the docs.
   Report whether the tester still got it wrong, and whether the failure told them so.

---

## 3. The teaching contract

Koster's model: fun is the pleasure of mastering a pattern, and a game dies when the pattern is
learned and nothing new arrives — or when the pattern is never identifiable at all
([A Theory of Fun](https://www.goodreads.com/book/show/18182.A_Theory_Of_Fun_For_Game_Design),
[summary](https://bumblingthroughdungeons.com/theory-fun-game-design-raph-koster/)). Baba Is You's
mechanism is subtraction: a teaching level "is designed to only include what is necessary", so the
lesson is the only available action. `CURRICULUM.md` §2.1 states the same rule
("one concept per level"), and §13 audits it.

**The contract:** every new idea is introduced *alone*, in a level where it is the only thing that
is hard, before it is combined with anything.

### T1 — Isolation audit
For each level, report:
- What the level's `teaches` field claims.
- What the tester actually had to figure out, in their own words, as a list.
- **If the list has more than one item, the contract is violated.** Name the extra item.

### T2 — Known contract stress points, check each
| Level | The claim | What to verify |
|---|---|---|
| `w1-02` | Bounded repetition | Is the loop *rewarded*? (H1.) An unenforced lesson is not taught. |
| `w2-04` | Interrupt and resume | Is silent-failure-of-`harvest` a second lesson smuggled in? |
| `w4-04` | Explore-then-execute | Are graph representation, exploration, and shortest-path three lessons or one? The curriculum admits this and mitigates; verify the mitigation. |
| `w7-01` | Parallel clocks | Model change + `sync` + collisions + makespan scoring in one level. (H4.) |
| `w8-01` | Optimisation as a skill | Does the second budget exist? (H2.) |
| `w6-05` | Recursive grammar | Recursion + checksums + cipher + obstacle field. Is the depth-1 seed genuinely first? |

### T3 — Retention of the lesson
Does the game ever check that the lesson took? Report, for three teaching levels, whether the next
level that *uses* the concept surfaces any reminder, or whether the player is silently assumed to
remember it 40 minutes later.

### T4 — The documentation contract
- Is every unlocked verb findable in the docs panel within 15 seconds? Test three at random.
- Did the tester ever look for a function that does not exist? **Name it.** This is TFWR's
  most-cited avoidable failure.
- `DESIGN.md` A3 requires the docs to state plainly that ordinary JS values persist for the whole
  run and only `mark`/`readMark` persist in the world. Verify verbatim, and report where it sits
  relative to World 4.

---

## 4. Difficulty curve

Csikszentmihalyi's flow channel as Schell frames it: challenge rising faster than skill produces
anxiety; skill rising faster than challenge produces boredom
([Schell, *The Art of Game Design*](https://schellgames.com/art-of-game-design);
[flow channel explainer](https://www.gamedeveloper.com/design/understanding-the-flow-channel-in-game-design)).
Puzzle-game difficulty modelling uses probability of success, attempt counts and completion time as
the objective measures, and warns that averaging across cohorts hides intrinsic difficulty
([Kristensen et al.](https://arxiv.org/html/2401.17436v1)). Casual-puzzle analysis distinguishes the
three shapes usefully: **isolated spikes are fine if they resolve within 1–2 levels; short plateaus
leave residual frustration; long valleys create habit-formation windows.**

### D1 — Distinguishing spike, wall, and plateau from the outside

| Shape | Signature in the transcript | Correct response |
|---|---|---|
| **Spike** | Runs-to-pass jumps ≥3×, then returns to baseline on the next level. Tester reports satisfaction on passing. | Leave it. Verify the level *after* it drops. |
| **Wall** | Session ends here. Or: hints exhausted, and time-to-next-run grows monotonically. Or: the tester leaves and does not return in the same session. | Emergency. Report the level and the exact minute. |
| **Plateau** | Three or more consecutive levels with similar runs-to-pass *and* the tester reports declining interest. Passing produces no reaction. | Boredom, not difficulty. Look for missing novelty, not for a nerf. |
| **Frustrating rather than hard** | See D2. | Redesign, don't retune. |

### D2 — Frustrating-rather-than-hard: the observable definition
A level is frustrating rather than hard when **the tester's "what I will change next" is about the
game rather than about their program**. Concretely, any of:
- "Try a different thing and see" (no model of the failure).
- "I think this might be a bug."
- "I don't know what it wants."
- "I need to know a number the game hasn't told me."
- The tester re-reads the brief more than twice in one level. **Report which levels and how many
  times.** This is the single cheapest wall detector in the instrument.
- The tester's fix works and they still cannot explain why.

Cross-check against `CURRICULUM.md` §11's four nominated risks (`w4-04`, `w5-05`, `w6-04`,
`w7-03`) plus the honourable mention (`w2-03`). **Report each mitigation as SHIPPED / PARTIAL /
ABSENT with evidence**, not as an opinion about the level.

### D3 — The sawtooth
`CURRICULUM.md` §1.1 claims seven deliberate drops, with `w5-05 → w6-01` (8 → 2) as "the game's
rest beat". Report, for each world opener actually played: did it read as relief, as filler, or as
"the game is wasting my time"? All three are possible and only the first is intended.

### D4 — Per-level difficulty ground truth
Report your own 1–10 difficulty for every level played, next to the curriculum's figure. **Report
every disagreement of ≥2 as a finding.** The curriculum's numbers are unvalidated design intent.

### D5 — Hour budget
`CURRICULUM.md` §1.4 budgets W1 ≈ 40 min through W8 ≈ 6 h, ~22 h total to bronze. Report your
actual per-world wall-clock. A world running 2× its budget is a curve problem regardless of whether
you enjoyed it.

---

## 5. Reward schedule

Rewards work as scaffolding for intrinsic motivation and fail as a substitute for it. The
overjustification effect — Lepper, Greene & Nisbett's 1973 study, where children promised a
certificate for drawing subsequently drew *less* in free play — is the canonical demonstration that
attaching an extrinsic reward to something already enjoyed reframes it as work
([reward-schedule overview](https://www.gamedeveloper.com/business/reward-schedules-and-when-to-use-them),
[summary of the 1973 study](https://finestreak.com/blog/reward-schedules-habit-reinforcement)).
BOOTSTRAP is well-positioned here: nothing is gated behind a commendation, requirements are public,
and failure costs nothing (`DESIGN.md` §7.1). The risk is not exploitation; it is **noise**.

### R1 — Frequency
- Report every reward event you received, with its level and wall-clock time: medal, star,
  commendation, Requisition, memo, world intro card, world complete card, Performance Review,
  narrative beat, Library unlock, publish offer.
- **Longest gap between any two reward events.** Report the levels it spans.
- **Densest cluster.** Report how many fired within 60 seconds of a single level completion.

### R2 — When a reward becomes noise — the observable test
A reward has become noise when **the tester dismisses it without reading it.** Report:
- The first reward type you dismissed without reading, and at which level.
- Whether any reward was dismissed by reflex (clicking through before the text rendered).
- Whether the commendation system ever caused you to do anything differently. If never, say so
  plainly — a reward that changes no behaviour and is not read is dead weight, not neutral.
- After `w3-05`, the Library adds publish offers, regression summaries, and discrepancy notices on
  top of the existing stack. Report the total count of distinct things competing for attention at
  the moment a World 4 level closes.

### R3 — Variety and escalation
- Do the medal/flavour lines repeat? `NARRATIVE.md` §6 caps them at 70 characters. Report the first
  line you saw twice and how many levels apart.
- Does the reward *escalate* across worlds, or is a World 8 gold acknowledged the same way as a
  World 1 gold? Report verbatim what each said.
- The Performance Review tiers (`NARRATIVE.md` §7) are the escalation mechanism. Report which tier
  you were in, whether you knew the thresholds, and whether it made you want to improve or made you
  feel graded.

### R4 — The competence signal (SDT)
Ryan, Rigby & Przybylski show that in-game **competence and autonomy** independently predict
enjoyment and continued play ([Motivational Pull of Video Games, 2006](https://link.springer.com/article/10.1007/s11031-006-9051-8);
[A Motivational Model of Video Game Engagement, 2010](https://selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf)).
Report, once per world: *"After this world, I feel more capable at X"* — fill in X, or write NONE.
A world where X is NONE is a world that returned no competence.

---

## 6. Repetition and busywork

The player explicitly does not want a chore. The genre's own definition of a chore is precise:
**a high code-to-insight ratio** — problems that are "conceptually easy but tedious to implement"
([Kitty Giraudel on AoC](https://kittygiraudel.com/2020/12/30/my-thoughts-on-advent-of-code/)). The
adjacent failure is TFWR's: the loop becomes "just watching automation happen" and the player
leaves it running unattended.

### C1 — The code-to-insight ratio (the primary chore metric)
For every level, report two numbers:
- **Lines written** (your final solution, excluding comments and blank lines).
- **Distinct insights required** — decisions where you had to *realise* something rather than
  *type* something. List them.

**Flag any level above ~25 lines per insight.** Predicted offenders from the reference sizes:
w4-05 (~90 lines), w7-05 (~90), w8-02 (~120), w8-03 (~110), w8-04 (~110), **w8-05 (~500)**.

### C2 — Chore shapes, and how each looks in a transcript
| Shape | Transcript signature |
|---|---|
| **Retyping** | The tester writes a routine they have already written in a previous level. Report which routine, and both level ids. (This is precisely what the Library is meant to absorb — see §8.) |
| **Bookkeeping** | A large fraction of the solution is index arithmetic, bounds checks, or serialisation with no decision content. |
| **Watching** | Long replay times with nothing to learn from them. Report any level where you set speed to 64× and looked away. |
| **Re-running for seeds** | The tester runs the same code repeatedly hoping a different seed passes, without changing their model. Report count. |
| **Waiting on the toolchain** | Time from Ctrl+Enter to verdict. Report the worst case, and whether it broke your train of thought. |
| **Difficulty that is really tuning** | The insight is had, and the remaining work is shaving ticks by trial and error. Report any level where >50% of your runs came after you already knew the answer. |

### C3 — Bonus objectives
`CURRICULUM.md` §2.8: "a good bonus is 'do the same thing but properly'; a bad bonus is 'now do it
50 times'." For every bonus attempted, classify it as ABSORBED AMBITION or ADDED GRIND, with one
sentence. For every bonus *not* attempted, say why in one sentence — an unattempted bonus is a
design signal.

### C4 — Novelty budget
Worlds 1–5 are all movement on a grid. World 6 is the first world that is mostly data. Report, at
the end of each world, whether the *activity* felt different from the previous world or only the
*problem* did. (H12.)

---

## 7. Feedback quality

In this genre feedback quality *is* difficulty. Factorio's most-praised property is that "failures
are always the player's fault, never random". Research on programming error messages for novices
finds that enhanced messages measurably reduce repeated errors, and that readability is subjective
and experience-dependent — meaning the only reliable test is showing it to someone
([Becker et al., CHI 2021](https://dl.acm.org/doi/10.1145/3411764.3445696);
[Compiler Error Messages Considered Unhelpful](https://dl.acm.org/doi/10.1145/3344429.3372508)).

### Q1 — The core question, per failed run
**Did the failure tell you what to change?** Classify every failed run:
- **A — Actionable.** Message named the problem; next edit followed directly.
- **B — Locating.** Message told you *where* but not *what*; you diagnosed it from the trace.
- **C — Opaque.** You knew you failed and had to re-derive why from scratch.
- **D — Misleading.** The message pointed at the wrong thing.
- **E — Fault of the game.** Toolchain, TypeScript, Monaco, engine, or a broken brief.

Report the counts, and **report every C, D and E individually with the exact message text and the
level.** D and E are bugs. C is a design defect.

### Q2 — Whose fault was it?
For each failed run: was the fault the player's, the game's, or ambiguous? Ambiguous is the
dangerous category — `CURRICULUM.md` §11 explicitly warns that a livelock at `w7-03` will read as
an engine bug, and `DESIGN.md` A6 adds a dedicated failure code for it. Verify that code fires and
that its wording names livelock explicitly.

### Q3 — Line-number fidelity
`DESIGN.md` §3 requires runtime errors mapped back to the player's line/column through the wrapper
offset and the source map; `LIBRARY.md` §2 extends this across two files. Test deliberately:
1. Throw from level code. Is the line right?
2. Throw from three functions deep inside `lib.ts`. Does it report the **library** line, with the
   file named?
3. Declare an `interface` above the throw (erased at emit, shifts everything below). Is the line
   still right?
Report each. A wrong line number in a programming game is a category-E failure on every subsequent
run.

### Q4 — Trace legibility
- Is a **blocked** move visibly different from a successful one? (`DESIGN.md` A5; required by
  w7-01 and w7-03.)
- Are plant growth stages distinct overlays? (Required by w2-03; without it the curriculum says the
  level is "opaque".)
- Does `w5-05` draw the laid cable, and does the verdict report spend vs. budget vs. best possible?
  (Required by §11.)
- Does `w4-02`'s replay visibly show the bot looping? (The failure *is* the lesson there.)
Report each as PRESENT / ABSENT / PRESENT-BUT-UNREADABLE.

### Q5 — Multi-seed failure legibility
When seed 1 passes and seed 3 fails: can you see *which* seed, *what* differed about it, and
replay it? Report exactly what the UI gives you. (H10.)

### Q6 — The halt cases
Three independent stops exist (tick budget, op budget, watchdog). Trigger all three deliberately:
a long loop with API calls; a long loop without ticks; `while(true){}` with no API call. Report the
message and the recovery time for each. `DESIGN.md` §10.6: it must not be possible to soft-lock the
UI. Verify by attempting to.

---

## 8. The optimization metagame

BOOTSTRAP has two optimisation layers — the tick score and the Library — and they interact. The
question is when an optimisation layer creates engagement versus anxiety.

**The evidence.** Opus Magnum's histogram works because it asks "can you reach the 70th
percentile?" rather than "can you be first", ensuring every player has *something* to feel good
about, and because its three metrics are mutually antagonistic so no dominant solution exists
([PC Gamer](https://www.pcgamer.com/perfectly-solving-opus-magnums-puzzles-is-impossible-but-thats-ok/)).
It is also **monotone-safe**: it can tell you where you stand, never that you got worse. TFWR's
optimisation lands because it is player-initiated and buys the next problem; it stops landing when
it "put players back into work mode".

### O1 — Engagement vs. anxiety, per level
After each level, report which of these you felt, in one sentence:
- **Engagement:** "I want to try that a better way." (Report whether you actually did.)
- **Obligation:** "I should go back and get gold." (Report whether you enjoyed it.)
- **Anxiety:** "I am worse at this than I should be."
- **Indifference:** "It passed."
**Obligation and anxiety are both failures.** Indifference at gold is also a failure.

### O2 — Is there anywhere to be good?
For each silver or bronze: was there any dimension on which your solution was notably good?
(H8.) Report how often the answer is yes. If it is rarely, the single-axis medal is the cause.

### O3 — Par credibility
`DESIGN.md` §5 sets par at reference-solution ticks minus ~10%, from the *intended technique*.
Report any level where par felt arbitrary, unreachable, or trivially beaten, with your tick count
and the par. A par that the intended technique cannot hit is a broken contract; a par you beat by
40% on your first honest attempt is a dead axis.

### O4 — The Library, specifically
- **Publish offer timing.** Does it fire at a moment of satisfaction or interrupt one?
- **First publish.** Did you understand what publishing *cost* you (library calls charge real
  ticks) before you did it? Report verbatim what told you.
- **Regression.** (H9.) Report the wording, the visual weight, and your unreasoned first reaction.
- **Cost tab.** Did a projected medal upgrade ever cause you to optimise a library routine? Y/N. If
  yes, report whether it felt like a discovery or an assignment.
- **The brick ladder.** `CURRICULUM.md` §18 authors six later levels on the assumption you own
  `survey`, `pathTo`, `waves`, `unpack`, `findKey`, `deal`. Report, for each level that "names" a
  brick: did the brief make you feel *equipped* or *behind*? "Behind" means the optional system has
  become de facto mandatory.
- **The refactor beat.** `w7-02` asks you to add a `b?: Bot` argument to a published `pathTo`.
  Report whether the regression suite's confirmation that four earlier levels still pass felt like
  a payoff or a chore.
- **The opt-out.** Verify the claim: a player who never opens the Repository finishes with the same
  medals. Test at least one §18 level *without* the library and report the medal.

### O5 — Where the two layers conflict
Ticks and library reuse can pull opposite ways: an imported general routine is often slower than a
level-specific one. Report any level where using your own library cost you a medal. That is either
the system's best moment or its worst, and only a playtest can say which.

---

## 9. Agency and expression

Self-determination theory: **autonomy** predicts enjoyment independently of competence
([Ryan, Rigby & Przybylski](https://link.springer.com/article/10.1007/s11031-006-9051-8)). Opus
Magnum's unscored fourth metric is aesthetics — solutions are GIF-able and shareable, and that is
where "my solution" lives. Schell's Lens of Expression asks what the game lets the player say about
themselves.

### A1 — Ownership
- Per level: **"Was this solution mine?"** Y/N/sort-of, one sentence.
- Were there levels where you felt you were transcribing an intended answer rather than authoring
  one? Name them. (Suspects: the levels with named textbook heritage — `w5-02` binary search,
  `w5-03` topological sort, `w5-05` MST, `w7-04` LPT. `CURRICULUM.md` §7 tells authors never to
  name the algorithm in the brief; verify they didn't, and report whether the level still felt like
  a homework problem.)
- Did you ever solve a level in a way you suspected was not intended? **This is the strongest
  positive signal in this section.** Report it and report whether the game acknowledged it.

### A2 — Solution space
- How many meaningfully different solutions can you see for each level? Report 1 / a few / many.
- Levels where the answer is 1 are exercises, not puzzles. Count them.

### A3 — Starter code as a constraint
Starters ship working code and, in some levels, scaffolding (`w4-04`'s typed `Map`). Report any
starter that felt like it decided your approach for you. Scaffolding that removes the *wrong*
question is good; scaffolding that removes the question is not.

### A4 — Is there anything to show someone?
If you wanted to show a friend one thing you made in this game, what would it be? If the answer is
nothing, that is a finding. (Opus Magnum's answer is a GIF; TFWR's is a farm; AoC's is a
leaderboard rank.)

---

## 10. The ending

Barth's rule is the whole section: *"I've never beaten the last level of SpaceChem… If you don't
want to do your own last level then it shouldn't be your last level."* SpaceChem shipped at <2%
completion; 7 Billion Humans at <5%.

### E1 — Reachability
- Did you reach it? Honestly, at what cost in hours?
- Was bronze on `w8-05` reachable by "a patient player with a slow, ugly solution", as
  `CURRICULUM.md` requires? Report your line count and hours. (H3, H18.)
- **Would the developer solve w8-05 for fun?** Ask them. Report the answer verbatim.

### E2 — Does the finale integrate or accumulate?
An integration exam should make you feel that you *know things*. A pile of subproblems makes you
feel that you have chores. Report which, with evidence: did solving one part make another part
easier, or just shorter?

### E3 — Payoff
`NARRATIVE.md` §3.2 lists seven plants — Appendix C, Vance CC'ing #4470, Depot 0, the uncounted
Daughters, the locker, the 9-tick airlock, the status ping. Report, for each: did you notice it
when planted? Did you connect it when paid off? An unnoticed plant that pays off is a beat that
lands on nobody.

### E4 — The choice
The ending is a form with two buttons and no timer, both endings warm, neither punished, no medal
difference (`NARRATIVE.md` §3.3).
- Did the choice feel like a real decision? Did you hesitate? For how long?
- Did the game make you *want* one of them? (It is designed not to.)
- Did the final Vance memo land as the last joke it is intended to be?

### E5 — Afterwards
- Is there a reason to keep playing (gold hunting, bonuses, the Library)? Did you want one?
- Does the Performance Review make ending on 60% medals feel like a result or like a shortfall?

---

## 11. Scorecard

Fill this in. Every score needs the evidence line; a score without evidence is not a score.

**Scale.** `1` broken — actively loses players · `2` weak — a real problem · `3` adequate — no harm
· `4` good — a strength · `5` exceptional — a reason to play this over its competitors.

```
BOOTSTRAP DESIGN REVIEW — <tester> — <date>
Sessions: <n>   Total hours: <h>   Furthest level: <id>   Reason play stopped: <one line>

FIRST SESSION
  F1  Minute 0-5: loop closes                       [ ]/5   evidence:
  F2  Minute 5-15: second idea + legible failure    [ ]/5   evidence:
  F3  Minute 15-30: reason to return                [ ]/5   evidence:
  F4  Genre failure modes avoided                   [ ]/5   evidence:

TEACHING CONTRACT
  T1  One concept per level, honoured               [ ]/5   worst offender:
  T2  Stress points survive                         [ ]/5   evidence:
  T3  Lessons retained / reinforced                 [ ]/5   evidence:
  T4  Documentation contract                        [ ]/5   missing verbs:

DIFFICULTY
  D1  Curve shape (spike/wall/plateau)              [ ]/5   walls found:
  D2  Frustrating-not-hard levels                   [ ]/5   count + ids:
  D3  Sawtooth reads as relief                      [ ]/5   evidence:
  D4  Curriculum difficulty numbers accurate        [ ]/5   biggest disagreement:
  D5  Hour budget accurate                          [ ]/5   worst world:

REWARD
  R1  Frequency                                     [ ]/5   longest gap:
  R2  Signal vs. noise                              [ ]/5   first dismissed reward:
  R3  Variety and escalation                        [ ]/5   first repeat:
  R4  Competence returned per world                 [ ]/5   worlds returning NONE:

REPETITION
  C1  Code-to-insight ratio                         [ ]/5   worst level + ratio:
  C2  Chore shapes present                          [ ]/5   which:
  C3  Bonuses absorb ambition                       [ ]/5   grind bonuses:
  C4  Novelty across worlds                         [ ]/5   evidence:

FEEDBACK
  Q1  Failure is actionable    A:__ B:__ C:__ D:__ E:__     [ ]/5
  Q2  Fault attribution clear                       [ ]/5   ambiguous cases:
  Q3  Line-number fidelity (3 tests)                [ ]/5   results:
  Q4  Trace legibility (4 checks)                   [ ]/5   results:
  Q5  Multi-seed failure legible                    [ ]/5   evidence:
  Q6  Halt cases + no soft-lock                     [ ]/5   results:

OPTIMIZATION
  O1  Engagement vs. anxiety                        [ ]/5   ratio:
  O2  Somewhere to be good                          [ ]/5   evidence:
  O3  Par credibility                               [ ]/5   worst par:
  O4  The Library                                   [ ]/5   evidence:
  O5  Layer conflict                                [ ]/5   evidence:

AGENCY
  A1  Solutions feel owned                          [ ]/5   transcription levels:
  A2  Solution space breadth                        [ ]/5   single-solution levels:
  A3  Starters constrain appropriately              [ ]/5   evidence:
  A4  Something to show someone                     [ ]/5   what:

ENDING            (mark NOT REACHED rather than guessing)
  E1  Reachable                                     [ ]/5   hours + lines:
  E2  Integrates rather than accumulates            [ ]/5   evidence:
  E3  Plants noticed and paid off        __/7 noticed      [ ]/5
  E4  The choice lands                              [ ]/5   hesitation time:
  E5  Afterwards                                    [ ]/5   evidence:

HYPOTHESES        H1..H18: CONFIRMED / REFUTED / NOT REACHED, with evidence, one line each.

THE THREE THINGS
  1. The one change that would most improve this game:
  2. The most likely single reason a real player stops:
  3. The best thing about it, that must not be broken by fixing 1 and 2:
```

---

## 12. Rules for the report

**A report that says "it's good" is a failed report.** The default failure mode of an AI evaluator
is agreeableness: producing a fluent, positive, hedge-laden summary that flatters the artefact and
tells the developer nothing they can act on. This instrument exists to counteract that. The
following are binding.

1. **Every criterion scoring 4 or 5 requires a named comparison.** "Good pacing" is not a finding.
   "The w5-05 → w6-01 drop worked; I came back the next day specifically because w6-01 was short"
   is. If you cannot name what makes it good, score it 3.
2. **Every criterion scoring 1 or 2 requires a level id and a timestamp.** Vague criticism is as
   useless as vague praise.
3. **A report with no score below 3 is rejected.** Not because the game must be bad, but because a
   40-level game built without playtesting has problems, and an instrument that cannot find them is
   broken. If you genuinely found nothing below 3, say so explicitly and explain why your method
   failed to surface anything — that is itself the report.
4. **Report at least five specific, concrete problems**, ranked by how many players they cost.
5. **Do not soften.** "Might possibly be slightly confusing for some players" is a sentence with no
   information. Write "I did not understand what w4-04 wanted for eleven minutes."
6. **Report what you did not do.** Levels skipped, hours not played, features not touched. An
   unstated gap in coverage is worse than an admitted one.
7. **Do not simulate a player you are not.** Where a human would have quit and you continued because
   you were instructed to, **say so and name the level.** That sentence is more valuable than the
   rest of the section it appears in.
8. **Separate observation from inference.** "I re-read the brief four times" is an observation.
   "The brief is unclear" is an inference. Report both, labelled.
9. **Never write a finding you cannot point at.** If it is not in the transcript, it did not happen.

---

## 13. Sources

**Design literature**
- Raph Koster, *A Theory of Fun for Game Design* — fun as pattern-mastery; boredom as the exhaustion
  of a learnable pattern. [Overview](https://bumblingthroughdungeons.com/theory-fun-game-design-raph-koster/) ·
  [Book](https://www.goodreads.com/book/show/18182.A_Theory_Of_Fun_For_Game_Design)
- Jesse Schell, *The Art of Game Design: A Book of Lenses* — the lens framework; the flow channel;
  Lens of Challenge, Reward, Expression. [Publisher page](https://schellgames.com/art-of-game-design) ·
  [Flow channel explainer](https://www.gamedeveloper.com/design/understanding-the-flow-channel-in-game-design)
- Ryan, Rigby & Przybylski, *The Motivational Pull of Video Games: A Self-Determination Theory
  Approach*, Motivation and Emotion (2006). [Springer](https://link.springer.com/article/10.1007/s11031-006-9051-8)
- Przybylski, Rigby & Ryan, *A Motivational Model of Video Game Engagement* (2010).
  [PDF](https://selfdeterminationtheory.org/SDT/documents/2010_PrzybylskiRigbyRyan_ROGP.pdf)
- Lepper, Greene & Nisbett (1973) — overjustification. Summarised in
  [reward-schedule overview](https://finestreak.com/blog/reward-schedules-habit-reinforcement) ·
  [Reward Schedules and When to Use Them](https://www.gamedeveloper.com/business/reward-schedules-and-when-to-use-them)
- Kristensen et al., *Difficulty Modelling in Mobile Puzzle Games* (2024) — success probability,
  attempts, completion time as difficulty measures. [arXiv](https://arxiv.org/html/2401.17436v1) ·
  [Statistical Modelling of Level Difficulty](https://arxiv.org/pdf/2107.03305)
- Becker et al., *On Designing Programming Error Messages for Novices: Readability and its
  Constituent Factors*, CHI 2021. [ACM](https://dl.acm.org/doi/10.1145/3411764.3445696) ·
  *Compiler Error Messages Considered Unhelpful* [ACM](https://dl.acm.org/doi/10.1145/3344429.3372508)
- FTUE / first-session retention: [Playio](https://blog.playio.co/mobile-game-onboarding-retention) ·
  [Inviox](https://www.invioxstudios.com/blog/why-players-quit-games-within-the-first-10-minutes-and-how-to-fix-it) ·
  [PlaytestCloud puzzle survey questions](https://help.playtestcloud.com/en/articles/6291264-survey-questions-for-playtesting-your-puzzle-game)

**Genre evidence** — full citations in `docs/GENRE-ANALYSIS.md` §9. Load-bearing ones:
- Zach Barth on SpaceChem's tutorial, difficulty, and its last level —
  [Game Developer](https://www.gamedeveloper.com/design/spacechem-s-zach-barth-on-educational-games-tutorial-design)
- Opus Magnum's histograms and the 70th-percentile framing —
  [PC Gamer](https://www.pcgamer.com/perfectly-solving-opus-magnums-puzzles-is-impossible-but-thats-ok/)
- "Big code-to-solving ratio" as the definition of a tedious puzzle —
  [Kitty Giraudel](https://kittygiraudel.com/2020/12/30/my-thoughts-on-advent-of-code/)
- "One stage doesn't feel like enough" for a new execution model —
  [Nintendo World Report, 7 Billion Humans](http://www.nintendoworldreport.com/review/48732/7-billion-humans-switch-review)
- "This quickly started to feel like real work to me" —
  [The Refined Geek on The Farmer Was Replaced](https://therefinedgeek.com.au/index.php/2026/01/21/the-farmer-was-replaced-the-dark-drone-filled-future-that-awaits-us/)
