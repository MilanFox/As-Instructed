# BOOTSTRAP — Genre Analysis

> **Purpose.** Before anyone plays BOOTSTRAP, know what the genre's best examples actually *do* —
> mechanism by mechanism — and where their players stop. This document is the evidence base for
> `docs/DESIGN-REVIEW-RUBRIC.md`. It is not a review of BOOTSTRAP; §8 is the only section that
> talks about us.
>
> **Method.** Every claim below is sourced. Where a claim is a designer's own admission it is
> quoted. Where it is aggregate player sentiment it is labelled as such, because aggregate
> sentiment from store pages is weak evidence and should not be treated as data.

---

## 1. The genre in one paragraph

Programming puzzle games are the only genre where the player's *artefact* is the thing being
graded rather than their reflexes. That has three consequences the whole genre organises around:
the feedback loop is slow (write → run → watch → diagnose), failure is almost always the player's
fault and legible in principle, and the skill ceiling is unbounded. Every design decision in the
games below is a response to one of those three facts. The games that lose players lose them
because the loop got slow, because failure stopped being legible, or because the ceiling stopped
feeling worth climbing.

---

## 2. The Farmer Was Replaced

The game the player explicitly cited. Python-like language, one drone, a farm, a tech tree.

### What the tech tree actually does to the play loop

It replaces *levels* with a **continuous economy**. There are no discrete puzzles: harvested
resources are the currency, the currency buys tech-tree nodes, and each node unlocks a crop with
new growth requirements — tilled soil, watering, fertiliser, planting adjacency — and each crop's
requirements are a wrapper around a programming concept, from loops through recursion, sorting and
maze-solving ([DLCompare](https://www.dlcompare.com/gaming-news/a-harvest-of-code-automating-the-farm-in-the-farmer-was-replaced),
[GamingOnLinux](https://www.gamingonlinux.com/2025/10/the-farmer-was-replaced-is-a-satisfying-way-to-learn-a-little-programming-with-automation/)).

The mechanism that matters: **the reward for solving puzzle N is throughput, and throughput is the
currency for puzzle N+1.** A better solution to an old problem literally purchases the next
problem. That is what makes the loop "dopaminergic" in the way reviewers describe — the
optimisation is never optional busywork, it is the pacing control.

### Why the shift from puzzle to optimization lands

It lands because the shift is *continuous and player-initiated*. Nothing tells you to go back and
speed up your wheat routine; the tech tree just gets slower, and you notice. The game never
declares an optimisation phase — the player discovers they are in one. This is the opposite of a
scored optimisation gate, and it is why it reads as agency rather than homework.

### Where it goes stale, and when

This is where the citable evidence gets interesting, because the complaints are not about
difficulty.

- **Mid-game passivity.** Negative reviews converge on the same shape: "around the mid game, it
  starts turning into just farming while your bot does everything for you", the game "devolves into
  passive automation where players leave it running in the background", and players report spending
  most of their playtime with the game running unattended
  ([Steam negative reviews](https://steamcommunity.com/app/2060160/negativereviews/?browsefilter=toprated)).
  The automation loop's success is its own failure mode: once the script is good, there is nothing
  to do but wait for the currency.
- **It feels like work.** The most useful single review for our purposes abandoned it at 2.2 hours:
  *"This quickly started to feel like real work to me. The long periods spent staring at the
  code…had me feeling like I was solving a customer's problem"*
  ([The Refined Geek, 7.0/10](https://therefinedgeek.com.au/index.php/2026/01/21/the-farmer-was-replaced-the-dark-drone-filled-future-that-awaits-us/)).
  A second review makes the same point about the ramp: *"the overall ramp up in optimisation
  challenge is something that wouldn't be out of place in one of Google's notorious interview
  questions… all of that just put players back into work mode."*
- **Discoverability of the API.** One reviewer spent hours hunting for a function
  (`get_soil_type`) they assumed existed. The documentation does not adequately state what is
  available. This is not a difficulty complaint; it is a **contract** complaint, and it is the
  single most avoidable failure in the genre.
- **Tutorial cliff.** Complaints at the 1–5 hour mark describe the tutorial ending abruptly and
  the difficulty spiking — "jumps from 'type while' to complex tasks".

Aggregate reception is 95% positive across ~4,000 reviews
([Steam](https://store.steampowered.com/app/2060160/The_Farmer_Was_Replaced/)), so these are the
minority failure modes — but they are precisely the ones a BOOTSTRAP playtest should be watching
for, because BOOTSTRAP shares the "long periods staring at code" property and does *not* share the
economy that makes the staring feel voluntary.

### Transferable mechanisms

| Mechanism | What it buys |
|---|---|
| Reward-is-currency-for-next-problem | Optimisation becomes pacing, not homework |
| No discrete levels | No "am I allowed to move on?" anxiety, no wall you can see |
| Unlocks gate *concepts*, not just verbs | New crop = new algorithm, with a fictional reason |
| Player-initiated optimisation | Agency; the game never assigns the grind |

---

## 3. Zachtronics

The reference implementation of the genre, and the richest source of *documented* failure.

### 3.1 SpaceChem (2011) — the cautionary tale

**Less than two percent of players finished the story mode.** Barth has called it "stupidly
difficult" and gave a GDC 2013 postmortem about it
([GDC Vault](https://gdcvault.com/play/1018235/Ahead-of-the-Curve-The),
[Game Developer](https://www.gamedeveloper.com/design/video-zach-barth-s-i-spacechem-i-postmortem)).

His own diagnosis, which is worth reading as a checklist:

- **The tutorial.** *"Our tutorial is awful, unusable."* It presented "so much boilerplate" with
  many ways to fail — *"a really wide hallway with one door."* His prescription: *"you should make
  little experiments, setting up little environments where people go in with trial and error,
  having no idea what they're doing, just clicking on stuff."*
- **The last level.** *"I've never beaten the last level of SpaceChem. I really deliberately went
  through and made sure the stoichiometry worked out but just had no desire to solve it. […] If
  you don't want to do your own last level then it shouldn't be your last level."*
- **Playtesting.** *"Half the players didn't resonate with it and got stuck. That should have been
  a red flag, but, instead, we were just like 'eh, this is good, let's ship it.'"*

([All quotes: Game Developer, "SpaceChem's Zach Barth on educational games & tutorial design"](https://www.gamedeveloper.com/design/spacechem-s-zach-barth-on-educational-games-tutorial-design))

The three lessons are: teach by sandbox not by rail; the finale must be something the designer
personally *wants* to solve; and "half the testers got stuck" is a stop-ship signal, not colour.

### 3.2 Opus Magnum (2017) — the fix

Zachtronics' response to SpaceChem was to remove every hard constraint. Opus Magnum has unlimited
budget and unlimited space, so **anyone can finish a level given enough effort**
([discussion of the design shift](https://steamcommunity.com/sharedfiles/filedetails/?id=3600654413)).
Infinifactory did the same thing spatially — deliberately more forgiving than SpaceChem's
"claustrophobic reactors".

The scoring is where the genius is:

- **Three metrics — cost, cycles, area — that are mutually antagonistic.** Making a machine faster
  requires more arms, which costs more and takes more space. There is no dominant solution.
- **Histograms, not leaderboards.** The histogram asks *"can you make it to the 70th percentile?
  The 90th?"* rather than *"can you be number one?"* — so every player has something to feel good
  about with every solution
  ([PC Gamer](https://www.pcgamer.com/perfectly-solving-opus-magnums-puzzles-is-impossible-but-thats-ok/)).
- **Perfection is provably unattainable**, and the game says so. A player quoted in the
  community's own optimisation blog: *"I needed to stop thinking like a perfectionist, and have
  fun with it. Otherwise I would never have any solution, let alone a good one"*
  ([biggieblog](https://biggieblog.com/tracking-the-global-opus-magnum-records/)).
- **A fourth, unscored metric: aesthetics.** Solutions are GIF-able. Players share them. This is
  the entire "your solution is *yours*" axis, and it is deliberately not on a histogram.

This is the most important design lesson in the genre and it is a **structural** one, not a tuning
one: *if there is exactly one number, there is exactly one way to be good, and everyone who is not
best at it is worse.* Three antagonistic numbers convert a ranking into a personality test.

### 3.3 Shenzhen I/O, EXAPUNKS, TIS-100 — the ceiling end

- **TIS-100** is the most restrictive environment in the catalogue and has a devoted following
  despite no music, essentially no narrative, and "severely lacking UX"
  ([player reviews](https://backloggd.com/u/IceNinja/review/1081190/)). What retains people is the
  purity: the constraint *is* the content.
- **Shenzhen I/O** adds spatial constraints and a manual you are expected to *print out and put in
  a binder*. Its puzzles are "'real world' practical apps — very silly practical apps" rather than
  abstract algorithms. It has the steepest learning curve of the modern set and is the least
  approachable for beginners.
- **EXAPUNKS** is the friendliest: no instruction-count limits, a strong narrative frame, and a
  hacking fiction that makes the constraint diegetic. Community consensus is that it is "easier
  than TIS-100" and the better entry point
  ([HN](https://news.ycombinator.com/item?id=17747643)).
- Across all three, the reported quit point is consistent: **around task 11+, players "start
  thinking a lot harder and taking increasingly more time to solve"**, and the drop-off follows the
  time-per-puzzle curve rather than any single hard puzzle.

### 3.4 The one thing Zachtronics does that nobody copies

**Every Zachtronics game ships a solitaire minigame.** Barth put one in enough titles that they
were eventually released as a standalone collection
([Zachtronics Solitaire Collection](https://www.zachtronics.com/solitaire-collection/),
[Hardcore Gaming 101](https://www.hardcoregaming101.net/the-zachtronics-solitaire-collection/)).
The functional role is a palate cleanser: a zero-stakes, zero-thinking activity inside the same
application, for when the player is cognitively spent but not ready to close the game. It is the
genre's only widely-shipped answer to *session fatigue* as distinct from difficulty.

---

## 4. Human Resource Machine / 7 Billion Humans

The low-ceiling, high-clarity end. Tomorrow Corporation.

**HRM's mechanisms:**
- A visual drag-and-drop assembly language with about a dozen instructions total. The entire
  language fits on one screen. There is nothing to look up.
- **Two optional par challenges per level** — size (instruction count) and speed (steps executed) —
  presented as checkboxes, not rankings, and never required to progress. Same antagonism as Opus
  Magnum's histogram, at a fraction of the complexity, with no social comparison at all.
- Every level introduces at most one instruction, and the level is built so the new instruction is
  the obvious tool.
- Failure is a visual animation of a small sad office worker doing the wrong thing. It is
  legible without reading.

**7 Billion Humans is HRM plus parallelism, and that is where it breaks.** Reviewers who liked HRM
report that even they had trouble: the game "seems like it's teaching a caveman about the wheel,
then asking them to invent the steam engine", and — the line that matters most for BOOTSTRAP —
**"while stages introduce new commands, there are more possibilities now that one stage doesn't
feel like enough"**
([Nintendo World Report](http://www.nintendoworldreport.com/review/48732/7-billion-humans-switch-review),
[Goomba Stomp](https://goombastomp.com/7-billion-humans-review/)). Critics said it "doesn't give
players the tools to understand the challenges". **As of April 2020, under 5% of players had
completed it** ([Wikipedia, citing Steam achievement data](https://en.wikipedia.org/wiki/7_Billion_Humans)).

The transferable finding: **a one-level introduction is sufficient for a new *verb* and
insufficient for a new *execution model*.** Sequential→parallel is an execution-model change and it
cost 7 Billion Humans most of its inherited audience.

---

## 5. Advent of Code

The player does this yearly, so this is the calibration reference for what they already enjoy.

**Stated design constraints** ([adventofcode.com/about](https://adventofcode.com/2025/about)):
- *"You don't need a computer science background to participate — just a little programming
  knowledge and some problem solving skills will get you pretty far."*
- *"Every problem has a solution that completes in at most 15 seconds on ten-year-old hardware."*
  A hard, published performance contract. The player always knows brute force is *sometimes* wrong,
  never *always* wrong.
- *"Very generally, the puzzles get more difficult over time, but your specific skillset will make
  each puzzle significantly easier or harder for you than someone else."* Difficulty is explicitly
  acknowledged as non-monotonic and personal.

**What makes a good AoC puzzle** (from practitioner write-ups):
- **A precise statement with worked edge cases.** Problems are "clearly defined, with useful edge
  cases", and each is beta-tested before release. The statement achieves "a good balance between
  appearing vague yet providing all the information"
  ([dbushell](https://dbushell.com/2025/01/16/advent-of-code/)).
- **Part 2 reframes rather than scales.** The strong ones invalidate the naive approach — "what is
  the outcome after one billion rounds?" — so the player must *re-understand*, not re-type. The
  weak ones just make N bigger.
- **Part 1 is a working model you then attack.** You always have a passing artefact before the
  hard question arrives. This is a partial-credit structure and it is why people finish days they
  can't fully solve.

**What makes a bad AoC puzzle:**
- **High code-to-insight ratio.** The single most-cited dislike: puzzles with "a big
  code-to-solving ratio" — "conceptually easy but tedious to implement"
  ([Kitty Giraudel](https://kittygiraudel.com/2020/12/30/my-thoughts-on-advent-of-code/)). This is
  the genre's definition of a chore and it is the most portable diagnostic in this document.
- **Difficulty that is really performance tuning.** "A lot of the difficulty comes from
  performance"; solutions get rewritten from naive → hash map → typed arrays. The player is now
  optimising a language runtime, not solving a puzzle.
- **Puzzles solvable only by inspecting your specific input.** AoC 2024 day 24 part 2 is the
  canonical example: solvers had to identify the structure of a 44-bit ripple-carry adder and
  **manually** find the swapped gates. Community writeups describe it as "very easy to make very
  difficult" and "a very manual problem rather than one that could be solved purely
  algorithmically" ([Alteryx community thread](https://community.alteryx.com/t5/General-Discussions/Advent-of-Code-2024-Day-24-BaseA-Style/td-p/1353570)).
  When the intended solution is "look at your data with your eyes", the game has stopped being a
  program.
- **Ambiguous examples.** Individual days get singled out for "obscure" example explanations. In a
  genre where the player can only debug against the statement, an ambiguous statement is a bug.

---

## 6. Adjacent references, briefly

**Baba Is You — teaching without tutorials.** The mechanism is *subtraction*: tutorial levels give
you almost no options, so the only available action is the lesson. Every level "is designed to only
include what is necessary". The rule language uses the most basic grammar structures possible, so
the syntax is never the obstacle
([analysis](https://medium.com/@joaquinrodriguez040/the-tangible-rules-of-baba-is-you-b1c27b340720),
[Steam guide](https://steamcommunity.com/sharedfiles/filedetails/?id=1697071688)). It also does
something BOOTSTRAP cannot: the *world* is the documentation — the rules are physical objects on
the grid. The cost is that Baba "expects you to be quick on the uptake": if you clear a
teaching level without noticing what it taught, you are lost two levels later with no recourse.

**Factorio — the automation loop.** The retention engine is that *every solution creates the next
problem*: automate iron, now you need coal; solve coal, copper is the bottleneck; scale copper, the
power grid fails. "Every fix reveals three new challenges." Combined with: clear rules, logical
systems, and — critically — **"failures are always the player's fault, never random"**
([gloomba](https://www.gloomba.com/en/what-makes-factorio-so-addicting/),
[Game Foundry](https://gamefoundry.games/blog/automation-games-explained-2026)). The satisfying
beat is named precisely: "when a messy setup finally runs smoothly". Note that Factorio *lets the
setup stay messy*. There is no grade.

**Screeps.** Persistent, 24/7, multiplayer JavaScript. Its own marketing argues you don't have to
play constantly ([Steam](https://store.steampowered.com/app/464350/Screeps_World/)). Mostly useful
as a negative example: an unbounded optimisation surface with no terminal state and social
comparison attached is the maximum-anxiety configuration of this genre. BOOTSTRAP's finite,
offline, no-account design is deliberately the opposite, and that is correct.

---

## 7. Cross-cutting mechanism table

| | Teaching | Gating | Reward | Failure handling | Anti-repetition | Retention source | Where players quit |
|---|---|---|---|---|---|---|---|
| **TFWR** | Crop = concept, learned by need | Tech tree bought with throughput | Throughput → next unlock | Visible drone misbehaviour | Continuous economy, no level repeats | Compounding automation | Mid-game passivity; "feels like work"; undocumented API |
| **SpaceChem** | Railed tutorial (admitted failure) | Linear campaign | Histograms | Visual reactor trace | — | Difficulty prestige | **<2% finished** |
| **Opus Magnum** | Sandbox + generous space | Linear, but always beatable | 3 antagonistic histograms + aesthetics | Machine visibly jams | Solution space is huge | "Something to feel good about every time" | Rarely — no hard gate exists |
| **TIS-100 / Shenzhen** | Manual, RTFM | Linear | Histograms | Node-level trace | — | Purity of constraint | Task ~11+, time-per-puzzle curve |
| **EXAPUNKS** | Narrative-embedded | Linear + optional | Histograms, no size limits | Visual EXA death | Zine/manual fiction | Story + friendlier ceiling | Late-campaign complexity |
| **HRM** | One instruction per level | Linear | Two optional par checkboxes | Animated wrong behaviour | Very short levels | Clarity, low ceiling | Rarely |
| **7 Billion Humans** | Same, but parallel model | Linear | Same | Same | Same | — | **<5% finished**; the parallelism jump |
| **AoC** | None; statement only | Calendar (one/day, part 1 gates part 2) | Stars, personal leaderboard | Wrong answer, no diagnosis | 25 unrelated problems | Novelty + social + season | Time; mid-December life; tedium days |
| **Baba Is You** | Subtractive level design | Overworld with multiple paths | New mechanic as reward | Reset is instant and free | Mechanics recombine | Recombination depth | Missed a teaching level |
| **Factorio** | Need-driven; tech tree | Research | Throughput; new bottleneck | Always your fault, never random | Scale changes the problem | Compounding systems | Rarely; late-game UPS |

---

## 8. BOOTSTRAP against the field

### 8.1 What BOOTSTRAP does that matches the best of the genre

- **Determinism and replay.** Trace-based replay with free scrub/step/rewind at 0.25×–64×
  (`DESIGN.md` §3) is strictly better than most of the field's debugging affordances and matches
  Factorio's "failures are always the player's fault, never random". This is a genuine strength and
  the playtest should confirm it is *discoverable*, not just present.
- **Hardware unlocks as ceremony.** `Requisition` showing each new verb once, with what it opens
  up (`DESIGN.md` §7.1), is the TFWR tech-tree beat done as a set piece. Good.
- **Multi-seed generalisation.** Running every seed and requiring all of them to pass is the
  genre's most under-used mechanism. AoC gives everyone a different input for the same reason;
  nobody else in this genre enforces it. This is BOOTSTRAP's most distinctive *correct* idea.
- **Failure costs nothing but time** (`DESIGN.md` §7.1): no penalty, no lost progress, no
  downgraded medal, and a program that did not compile "was never dispatched". This matches Baba Is
  You's free reset and is exactly right.
- **The one-concept-per-level ledger** (`CURRICULUM.md` §13) with an explicit duplicate audit
  (§12). Koster's model says a game dies when the player has learned the pattern and there is
  nothing new; a 40-row distinct-concept ledger is a direct, auditable defence against that.
- **Nothing gated behind achievements; requirements public before they are met** (§7.1). Removes
  the entire class of completionist anxiety that Screeps and loot-driven games generate.
- **The frustration watch** (`CURRICULUM.md` §11) names four at-risk levels and prescribes
  mitigations. This is a designer doing Barth's postmortem *before* shipping. Rare and correct.

### 8.2 What BOOTSTRAP does differently

| BOOTSTRAP | Genre norm | Note |
|---|---|---|
| **One scored axis (ticks)**, chars explicitly not scored | 2–3 antagonistic axes | Deliberate (§7: "code golf is not a skill this game rewards"). See §8.3 — biggest risk. |
| **Real TypeScript** in Monaco | Custom restricted DSL | Higher ceiling, but no floor: the language cannot enforce the lesson. |
| **Discrete 40-level campaign with an ending** | Endless (TFWR, Factorio, Screeps) or discrete-but-longer | Finite is good. It means the finale must land. |
| **Narrative with a real payoff and a choice** | Flavour text (Zachtronics) or none | Strongest differentiator. Also the biggest thing gated behind level 40. |
| **A composition metagame (the Library)** | Nothing comparable | Genuinely novel. See §8.3. |
| **No leaderboard, no social comparison, no account** | Histograms with global percentiles | Removes anxiety; also removes Opus Magnum's "90th percentile at *something*" consolation. |
| **Synchronous player API** | Varies | Correct accessibility call, and rare. |

### 8.3 Where the difference is a risk, not a choice

**Risk 1 — One number is a ranking, three numbers are a personality.** `DESIGN.md` §7 collapses
medals to ticks alone, on the reasonable grounds that code golf is not a skill worth rewarding. But
the thing Opus Magnum's three metrics buy is not golf — it is *the absence of a single ordering*.
With one axis, every gold solution converges on the same shape, there is no trade-off to have an
opinion about, and a player who is 30% over par has no dimension on which they are doing well. The
genre's own evidence says this is the mechanism that keeps non-optimisers engaged
([PC Gamer](https://www.pcgamer.com/perfectly-solving-opus-magnums-puzzles-is-impossible-but-thats-ok/)).
BOOTSTRAP has a second axis available and unused: `Objectives.withinSenses` (the information
budget). Consider making it visible and antagonistic to ticks — sensing is free in ticks, so a
cheap-in-ticks solution is often expensive in information and vice versa. That is a real trade-off
that is *not* golf.

**Risk 2 — The game currently scores something other than what it says it scores.** Three
player-facing surfaces still advertise a character budget that `DESIGN.md` §7 abolished and the
code never implemented:
- `README.md`: "You are scored on **ticks** … and, as a tiedown, on **chars**."
- `w1-02`: `par.ticks` is 27 and the route is 27 moves, so **27 longhand `move()` calls score
  gold**. The level's lesson (use loops) is unenforced. `CURRICULUM.md` §3 names the char par as its
  *only* substitute for the missing multi-seed defence — "gold requires three loops. Scoring teaches
  the lesson, not failure" — and that scoring does not exist. The specified "under 60 characters"
  bonus was not shipped either. (The brief's explicit false claim that "the character count in the
  corner is part of your score" was removed by a concurrent edit during this review; the missing
  gate remains.)
- `w8-01`'s brief: "**Two budgets apply and both are hard.** … Missing either one is a fail." The
  shipped level has one objective (deliver the crops) and one bonus (a tighter tick count). There
  is no character objective anywhere in `src/`. `CURRICULUM.md` §12 records that `w8-01` exists
  *specifically to replace* a rejected draft described as "a medium mixed level" that "duplicated
  everything and nothing". As shipped, w8-01 is that rejected level.

The generalisable point is not the char rule. It is that **the scoring contract is the foundation
the whole optimisation metagame stands on**, and the game breaks it in the second level the player
ever plays. TFWR's most avoidable complaint was of exactly this kind — a documented API that did
not match the real one.

**Risk 3 — Code volume is not difficulty, and World 8 is mostly volume.** The reference solution
sizes: w4-04 ~70 lines, w4-05 ~90, w7-05 ~90, w8-02 ~120, w8-03 ~110, w8-04 ~110, and **w8-05 at
500 lines exactly**, against seven seeds, in a single browser Monaco pane with no file splitting,
no partial credit, and a write→run→watch→diagnose loop. That is precisely Giraudel's "big
code-to-solving ratio" — the genre's single most-disliked puzzle shape — and it is the shape of the
game's finale, which is where the entire narrative payoff lives (`NARRATIVE.md` §3.3). Barth's own
rule applies with force: *"If you don't want to do your own last level then it shouldn't be your
last level."* SpaceChem finished at <2%; 7 Billion Humans at <5%. `CURRICULUM.md` already knows
this — w8-05's `note` insists bronze must be reachable by "a patient player with a slow, ugly
solution" — but "slow and ugly" still has to be several hundred lines, and no note fixes that.

**Risk 4 — The parallelism jump is the documented killer of 7 Billion Humans, and BOOTSTRAP makes
it at level 31 of 40.** World 7 changes the execution model (per-bot virtual clocks, makespan
scoring, `sync`, collisions, livelock), and `w7-01` is the single level allotted to teach it. The
review consensus on 7 Billion Humans was literally that "one stage doesn't feel like enough" for
this. BOOTSTRAP's own sawtooth gives World 7 exactly the same budget it gives World 6's echo loop.

**Risk 5 — The Library is the genre's only "editing this may break your finished work" system.**
`LIBRARY.md` is unusually careful about it (no silent medal downgrade; medals move only on an
explicit ACCEPT; a `lastKnownGood` revert target; the whole system optional). But the *feeling*
being engineered is the inverse of the histogram's. A histogram can only ever tell you where you
stand; a regression report can tell you that you made things worse. Opus Magnum's histogram works
because it is monotone-safe. Watch for players who publish once, see a red Regression tab, and
never publish again — at which point the metagame is dead weight and the six-brick ladder
(`CURRICULUM.md` §18) is authored against something nobody uses.

**Risk 6 — No decompression beat.** Every Zachtronics title ships a solitaire game for the state
of "cognitively spent but still here". BOOTSTRAP's answer is the difficulty sawtooth — but the
game's designated "rest beat" is `w6-01`, roughly 8 hours in on a 22-hour budget
(`CURRICULUM.md` §1.4). The trace replay is the only non-thinking activity and it lasts seconds.
Session 2 and session 3 are likely to end on fatigue rather than on any specific wall.

**Risk 7 — Real TypeScript has no floor.** Every other game in this genre uses a restricted
language, and the restriction is what guarantees the lesson. In BOOTSTRAP a player can solve
`w4-04` with a library they already know how to write, or paste an LLM's answer, and the level
cannot tell. Multi-seed generalisation defends against *memorised outputs*, not against *skipping
the lesson*. This is an accepted trade for the ceiling, but it means the curriculum's teaching
guarantees are softer than they read, and the playtest should not assume a level taught what its
`teaches` field claims.

---

## 9. Sources

**The Farmer Was Replaced**
- [Steam store page](https://store.steampowered.com/app/2060160/The_Farmer_Was_Replaced/) — review counts and framing
- [Steam negative reviews, top rated](https://steamcommunity.com/app/2060160/negativereviews/?browsefilter=toprated)
- [The Refined Geek review, 7.0/10](https://therefinedgeek.com.au/index.php/2026/01/21/the-farmer-was-replaced-the-dark-drone-filled-future-that-awaits-us/) — abandoned at 2.2 h, "feels like real work"
- [GamingOnLinux](https://www.gamingonlinux.com/2025/10/the-farmer-was-replaced-is-a-satisfying-way-to-learn-a-little-programming-with-automation/)
- [DLCompare — the automation loop](https://www.dlcompare.com/gaming-news/a-harvest-of-code-automating-the-farm-in-the-farmer-was-replaced)

**Zachtronics**
- [Game Developer — Barth on educational games & tutorial design](https://www.gamedeveloper.com/design/spacechem-s-zach-barth-on-educational-games-tutorial-design) — all direct quotes in §3.1
- [Game Developer — SpaceChem postmortem video](https://www.gamedeveloper.com/design/video-zach-barth-s-i-spacechem-i-postmortem)
- [GDC Vault — Ahead of the Curve: The SpaceChem Postmortem](https://gdcvault.com/play/1018235/Ahead-of-the-Curve-The)
- [PC Gamer — Perfectly solving Opus Magnum's puzzles is impossible, but that's OK](https://www.pcgamer.com/perfectly-solving-opus-magnums-puzzles-is-impossible-but-thats-ok/)
- [biggieblog — Tracking the global Opus Magnum records](https://biggieblog.com/tracking-the-global-opus-magnum-records/)
- [Steam guide — Zachtronics games ranked by difficulty](https://steamcommunity.com/sharedfiles/filedetails/?id=3600654413)
- [Zachtronics Solitaire Collection](https://www.zachtronics.com/solitaire-collection/) · [Hardcore Gaming 101](https://www.hardcoregaming101.net/the-zachtronics-solitaire-collection/)
- [Backloggd — TIS-100 review](https://backloggd.com/u/IceNinja/review/1081190/) · [HN on EXAPUNKS vs TIS-100](https://news.ycombinator.com/item?id=17747643)

**HRM / 7 Billion Humans**
- [Nintendo World Report — 7 Billion Humans review](http://www.nintendoworldreport.com/review/48732/7-billion-humans-switch-review)
- [Goomba Stomp — 7 Billion Humans review](https://goombastomp.com/7-billion-humans-review/)
- [Wikipedia — 7 Billion Humans](https://en.wikipedia.org/wiki/7_Billion_Humans) — <5% completion

**Advent of Code**
- [About page (design constraints)](https://adventofcode.com/2025/about)
- [Kitty Giraudel — My thoughts on Advent of Code](https://kittygiraudel.com/2020/12/30/my-thoughts-on-advent-of-code/) — "big code-to-solving ratio"
- [dbushell — Advent of Code](https://dbushell.com/2025/01/16/advent-of-code/)
- [Alteryx community — AoC 2024 Day 24](https://community.alteryx.com/t5/General-Discussions/Advent-of-Code-2024-Day-24-BaseA-Style/td-p/1353570) · [Elixir Forum — Day 24](https://elixirforum.com/t/advent-of-code-2024-day-24/68344)

**Adjacent**
- [The Tangible Rules of Baba Is You](https://medium.com/@joaquinrodriguez040/the-tangible-rules-of-baba-is-you-b1c27b340720) · [Baba is Advice](https://steamcommunity.com/sharedfiles/filedetails/?id=1697071688)
- [gloomba — What makes Factorio so addicting](https://www.gloomba.com/en/what-makes-factorio-so-addicting/) · [Game Foundry — Automation games explained](https://gamefoundry.games/blog/automation-games-explained-2026)
- [Screeps: World on Steam](https://store.steampowered.com/app/464350/Screeps_World/)
