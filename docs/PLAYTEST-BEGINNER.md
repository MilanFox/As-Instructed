# BOOTSTRAP — Beginner Playtest

**Tester persona.** Competent but non-expert programmer. Knows `for`, `while`, `if`, arrays,
calling functions. Has never done Advent of Code, has never implemented BFS, does not know what a
"visited set" is, would not reach for a `Map` unaided. Playing in the evening because it looked fun.

**Session.** 2026-09-05, 09:04–11:00. **~1h55m of actual play.**
**Levels closed: 17 of 40 — w1-01 through w4-02.**
9 gold · 5 silver · 3 bronze · 13 stars · 42 runs · 4 hints (all on one level).

---

## 0. Coverage, and what I did not do

Stated up front (rubric §12.6).

- Played **w1-01 → w4-02**. **Not reached:** w4-03 onward, so **H2, H3, H4, H6, H9, H15, H16, H18
  and the whole of §10 (the ending) are NOT REACHED.**
- The Repository/Library became available but **I never published anything** — see §7. So O4 and O5
  are barely covered and the brick ladder is untested.
- Did not use Performance Review, export/import, or audio settings. Did not test H17 (hint
  persistence across reload). Tested only one of the three halt cases (§6, Q6).
- **~20 minutes were lost to environment problems that are not the game's fault and are not reported
  as findings.** A second process on this machine was spawning Vite servers on random ports and
  steering my Chrome tab, wiping my save twice. I isolated onto `http://127.0.0.1:5273` and
  restarted from a verified-clean save. Everything below is from that clean run.
- Because I drive Monaco through browser automation, I wrote solutions as **long single lines** to
  stop auto-closing brackets duplicating characters. That is a tooling artefact and says nothing
  about the game's ergonomics. Line counts are logical, not physical.
- **Where a real player would have quit and I continued because I was instructed to: `w3-03`.**

---

## 1. The headline

**I would have quit at `w3-03` "Manifest", about ninety minutes in.** Not because it was hard —
because for 55 minutes the game printed the same eight words on every run (`0 of 5 — 5 short`) no
matter what I changed, and all four of its hints answered a question I had not asked. I closed it at
**276 ticks against a par of 25** — eleven times par — with a solution that does the exact opposite
of what the level teaches.

Before that, the opposite problem. **Levels 1 through 8 offered no resistance at all.** Seven passed
on the first or second run, six took gold, and I never re-read a brief or touched a hint. The first
hour is not a difficulty curve; it is a flat line followed by a cliff.

The good news is real and I will spend one paragraph on it: **`w1-03`'s multi-seed failure screen is
excellent**, `w2-04` is a genuinely well-shaped puzzle, `w3-04` and `w4-01` are clean, and the
toolchain never once got in my way — zero Monaco fights, zero unexplained TypeScript, sub-two-second
runs. Now the problems.

---

## 2. Per-level transcript

| # | Level | Runs | Time | Medal | Ticks / par | Hints | Brief re-reads | My difficulty |
|---|---|---|---|---|---|---|---|---|
| 1 | w1-01 Cold Start | 3 | 3m | gold | 6 / 6 | 0 | 0 | 1 |
| 2 | w1-02 Forty-Five Metres | 1 | 2m | gold ★ | 45 / 45 | 0 | 0 | 1 |
| 3 | w1-03 Length Unknown | 2 | 2m | gold ★ | 24 / 24 | 0 | 0 | 2 |
| 4 | w1-04 Grid Reference | 1 | 3m | gold ★ | 16 / 16 | 0 | 0 | 2 |
| 5 | w1-05 Floor Inspection | 1 | 8m | silver ★ | 60 / 50 | 0 | 0 | 4 |
| 6 | w2-01 Sensor Package | 1 | 4m | gold ★ | 18 / 18 | 0 | 0 | 2 |
| 7 | w2-02 Ripe Only | 1 | 4m | gold ★ | 47 / 49 | 0 | 0 | 2 |
| 8 | w2-03 Rotation | 1 | 5m | gold ★ | 72 / 76 | 0 | 0 | 3 |
| 9 | w2-04 Capacity | 2 | 9m | silver ★ | 63 / 52 | 0 | 1 | 5 |
| 10 | w2-05 Harvest Quota | 5 | 15m | gold ★ | 68 / 74 | 0 | 3 | 6 |
| 11 | w3-01 Pick and Place | 3 | 12m | silver | 176 / 157 | 0 | 1 | 5 |
| 12 | w3-02 Sorted by Colour | 3 | 10m | silver ★ | 402 / 332 | 0 | 1 | 6 |
| 13 | **w3-03 Manifest** | **11** | **55m** | **bronze** | **276 / 25** | **4/4** | **4** | **9** |
| 14 | w3-04 First In, First Out | 2 | 8m | silver ★ | 449 / 365 | 0 | 0 | 5 |
| 15 | w3-05 The Night Shift | 1 | 6m | bronze | 680 / 439 | 0 | 0 | 5 |
| 16 | w4-01 Headlamp | 1 | 4m | gold ★ | 52 / 52 | 0 | 0 | 3 |
| 17 | w4-02 Breadcrumbs | 3 | 10m | bronze ★ | 832 / 391 | 0 | 1 | 6 |

**Per-world wall clock (D5):** W1 ≈ 18 min (budget 40 — **half**). W2 ≈ 37 min. W3 ≈ 91 min, of
which **55 is one level**. W4 (2 of 5) ≈ 14 min.

### Notes worth keeping

**w1-01.** Loop closed in under 60 seconds. I pressed Run before finishing the brief — the good
answer — but **only because I had to**: the site view shows `NO TRACE ON FILE` and nothing else. I
could not see the pad, the distance, or the pillar. Runs 1 and 2 were reconnaissance, not attempts.
Run 2 ended one tile short and the verdict said `Contract not fulfilled: Park the bot on the landing
pad` — **word-for-word what it said when the bot had not moved at all.** Q1 **B**.

**w1-03.** I hardcoded `for (let i = 0; i < 12; i++) move(Dir.East)` on purpose. The verdict gave me
a seed table side by side — `seed 1 failed / seed 4 failed / seed 7 passed` — and the line
**"It passed on seed 7. The field is not always the same field."** That is the best screen in the
game. **H10 refuted.** (Nit: `Seed 1 of 4 (seed 1) failed` — the parenthetical reads like a debug
string.)

**w1-05.** First level that needed thought, first effectively empty starter — and one of its two
comments is `// Sweep East while canMove(Dir.East) says there is more row.`, which hands you the
technique. I came in 60 against par 50, knew exactly which ten ticks were wasted, and **did not go
back.** The reward for doing so is 4 points instead of 3.

**w2-01 → w2-03.** Three consecutive first-run golds doing the same activity with one predicate
changed. This is the plateau. At the end of w2-02 I noticed I was going through the motions.

**w2-04.** The first level that felt like a puzzle, and the best-shaped one. The hopper starts full
of seed, so you cannot harvest until you plant, and the only plantable tile is the single bare one.
The probe-run verdict was the **best feedback in the game** — `Harvest every crop: 0 of 5 — 5 short`
and `Leave every soil tile planted: 5 of 6 — 1 short` told me there were five crops and exactly one
gap. Q1 **A**.

**w3-04.** Survey, sort by stencilled number, ferry. Clean, honest, my solution was mine, two runs.
It comes immediately after the worst level in the game and the contrast is stark — this is what
World 3 should feel like.

**w4-01.** Gold, first run, exactly par. Follow a tunnel that does not fork. Two minutes of thought.

**w4-02.** See §6 and §8 — this level produced three separate findings.

---

## 3. `w3-03` Manifest — the wall

The most important section here.

**What it wants:** count every item in a rack row, `print` one line per class in a declared order,
then `use()` the terminal.

**Run by run:**

1. Probe. `scan()` of self and neighbours. I am on a `pad` at (15,6), `machineId: null`, `use()`
   returns `false`.
2. Walked west along y=6 scanning north and south. **`0 of 5 — 5 short`.**
3. **Hint 1** — *"Reading a tile costs nothing. Standing on it costs a tick."* I already had this.
   **Par is 25; walking every tile is visibly impossible. The par number taught the lesson before
   the hint did.**
4. **Hint 2** — *"A bot in an aisle is already beside both of the racks that flank it."* Also
   already had it.
5. Moved south first, then walked. **`0 of 5 — 5 short`.**
6. Added a "go to the terminal" loop with an uninitialised `-1` target and **triggered the tick
   budget halt** — 2501 ticks, *"Your program did not halt. We stopped it. We would like this noted
   on the record."* Instant recovery, no soft-lock. **Clearest message I saw all session.**
7. **Hint 3** — *"Nothing here asks you to move a crate. It asks you to report one."* Irrelevant.
8. Walked the full aisle end to end. Console shows I printed `part 5 / cell 4 / stone 5 / ice 1` —
   four plausible lines. **Still `0 of 5`.**
9. **Hint 4** (last) — *"The set of classes stocked in the row changes between shifts."* Irrelevant.
10. Full-yard diagnostic printing every item with coordinates. **This is what actually solved it.**
    Items sit at x = 14, 16 **and 18** — three rack columns, so there are **two** aisles. That is
    what "four aisle heads" meant. One aisle can never see the third rack.
11. Swept the whole yard with a dedupe list → **`5/5` ✅**. Then had to `use()` on *every* pad,
    because the terminal is not identifiable by `terrain`, `mark` or `machineId` — I checked all
    three.

**What is wrong, specifically:**

- **The grader never diffs.** For an objective that grades *text my program printed*, the feedback is
  `0 of 5 — 5 short` and nothing else. It does not show what it expected, what it received, which
  class is missing, or which count is wrong. **Printing four correct-looking lines produced the same
  message as printing nothing.** Q1 **C**. This one message cost ~35 of the 55 minutes.
- **All four hints address one misconception, and it is not the blocker.** Hints 1, 2 and 3 are three
  restatements of "don't walk on everything, don't pick things up". The real difficulty is
  geometric — where the row is, how many aisles there are, which pad is the terminal — and nothing
  touches it. A four-hint budget that spends three on one idea is a two-hint budget.
- **The brief says "rack row 7". The aisles run north–south.** I spent four runs walking east–west
  because the word "row" told me to.
- **The terminal cannot be identified.** Not `terrain`, not `mark`, not `machineId`. The only working
  method is stand-on-each-pad-and-call-`use()`. That is guess-and-check, not deduction.
- **The level does not enforce its own lesson.** I passed at **276 against par 25** by brute-force
  sweeping — precisely the behaviour the level exists to discourage. No gate, no failure, no
  minimum. This is `w1-02`'s disease (H1) in a much more expensive form: I spent an hour learning
  the intended technique and then won by ignoring it.

**D2 checklist:** brief re-read 4× ✓ · "what I will change next" was *"try a different thing and
see"* on runs 5 and 8 ✓ · needed a number the game had not told me (how many aisles) ✓ · the fix
worked and I could not immediately explain why ✓. **Frustrating rather than hard on every observable
criterion in the instrument.**

---

## 4. H1 — `w1-02` teaches a lesson it does not enforce. **CONFIRMED.**

The level has moved since the rubric was written — par is 45, there is now a second objective
("Clear the bay within 60 ticks") and a bonus. It does not help.

I deleted the `for` loop the starter ships and pasted **45 literal `move()` calls.** First run:

```
WORK ORDER CLOSED — At par. Somebody upstairs will assume par was set wrong.
Park the bot on the landing pad     ✓
Clear the bay within 60 ticks       45 / 60 ticks ✓
TICKS 45 · par 45 · MEDAL gold · 4 pts · 1 star
Bonus met: Reach the pad without one blocked move
COMMENDATIONS: AS PER THE BRIEF · THERE IS NO BONUS
```

Maximum score, both objectives, the bonus, the star, two commendations and a streak badge — for
doing the one thing the level exists to discourage, having first deleted the loop the game gave me.
**Nothing in the UI preferred the loop.** The new 60-tick "gate" gates nothing: the naive answer is
45 and the gate is 60.

And the starter *ships the loop already written*, so the level does not teach bounded repetition —
it demonstrates it, then pays you to remove it.

---

## 5. `w2-05` Harvest Quota — the brief states a rule that is false

> **"Come back with the hopper full of crop. […] You will know it is full when `harvest()` stops
> handing anything back."**

Not true. `harvest()` also returns `null` on a crop that is **not yet ripe**, and this level never
mentions ripeness. I wrote exactly what the brief told me to write and stopped at the second tile
with 1 of 8. The verdict — `1 of 8 — 7 short` — gave me the outcome and nothing about the cause. Two
more debugging runs and this console output found it:

```
6   tile crop inv 1
8   harvest returned null inv now 1
...
0 crop=crop growth=8/8
4 crop=crop growth=0/8     <-- unripe; harvest() returns null; hopper has 7 free slots
```

**Q1 class D — misleading.** ~8 minutes, and the only place in 17 levels where I stopped trusting the
text. Secondary: the brief says *"The field is far longer than that"* and never says its **shape**. I
assumed a row (w2-01 had said "one row"). It is a 13×7 rectangle. Another run lost.

---

## 6. `w4-02` Breadcrumbs — three findings in one level

**(a) The reference card is wrong, and it is the last thing you read before writing the line.**
The requisition modal I signed says:

> `mark()` — Writes a **number** onto the bot's current tile.
> `readMark()` — Returns the **number** written on a tile, or undefined.

The brief one panel away says `mark(text)`. In w3-02 and w3-04, `scan().mark` returned **strings**
(`"crate"`, `"1"`). I wrote `mark(cur + 1)` and got:

```
COMPILE · LINE 2
Argument of type 'number' is not assignable to parameter of type 'string'.
```

Three different type claims for one field, and the authoritative one is the compiler. **Q1 class E.**

**(b) Q3, line-number fidelity: PASSES.** The compile error named `LINE 2`, and line 2 was exactly
where `mark(cur + 1)` sat. `It did not compile. Nothing was dispatched, so nothing was billed.` and
0 ticks. That is a good failure.

**(c) Q4, "does w4-02's replay visibly show the bot looping?" — PRESENT-BUT-UNREADABLE.**
I deliberately ran my w4-01 tunnel-follower first, which is what the level is designed to punish. It
failed. The verdict said only `Park the bot on the ore vein — not met`. It did not say I had
revisited tiles or gone in a circle. **And the replay draws no path trail at all** — the maze is a
small grid, the bot is a dot, and nothing distinguishes a visited tile from an unvisited one. To
observe the loop I would have to scrub 64 ticks and hold the route in my head, which is exactly the
problem the level says is hard. The failure *is* the lesson here and the lesson is invisible.

**One genuine positive:** w4-02's bonus — *"Reach the vein having placed fewer than 180 marks"* — is
the **first bonus in seventeen levels that I could actually have failed.** It is an information
budget, it is antagonistic to the tick score, and it is the only place the game gave me a second
dimension to be good at. I met it at 118/180 and I cared. **This is the answer to H8 and the game
already contains it.** It should not be a one-off.

---

## 7. The Library arrives with no ceremony at all

The README says the Repository unlocks at the end of World 3. I closed all five World 3 levels and
went straight into w4-01. **No unlock modal. No memo. No explanation.** The only sign it exists is a
single grey line at the bottom edge of the editor:

> `repository — The Repository is empty. This is a supported configuration and no memo will be
> raised about it.`

That is a good joke, and it is the entire onboarding for the system that `CURRICULUM.md` authors six
later levels against. **`wait()` got a full modal with a signature and a punchline. The Library got a
status bar.** I never opened it, never published, and did not feel invited to.

This matters more than it looks, because of the strongest chore signal in my transcript: **I wrote
the same generic serpentine-sweep routine in six levels** — w1-05, w2-03, w2-05, w3-01, w3-02,
w3-03 — and the same greedy `goTo(x, y)` in four. That is precisely what the Library exists to
absorb, and by the time it appeared I had already written the code six times and had no reason to
look at it.

---

## 8. Par is not a score, and the bonuses are confetti

On **six** of the first nine levels my first correct solution landed on **exactly par**:

| w1-01 | w1-02 | w1-03 | w1-04 | w2-01 | w4-01 |
|---|---|---|---|---|---|
| 6 / 6 | 45 / 45 | 24 / 24 | 16 / 16 | 18 / 18 | 52 / 52 |

Par appears to be the **worst seed's cost of the obvious solution**. The consequence is that the
medal restates "did it work". A player learns in the first twenty minutes that gold is the default
and the number in the corner is decoration, and that lesson is learned long before par starts to
bite at w1-05 / w2-04 / w3-01.

**The bonus stars are worse.** Every bonus through w2-05 is satisfied automatically by any correct
solution — *"Reach the pad without one blocked move"*, *"Survey the row without a wasted move"*,
*"Arrive in the fewest possible ticks"*, *"One swing per ripe crop"*, *"Waste no swing and no seed"*.
**I attempted none of them and was awarded eight.** C3: these are neither absorbed ambition nor added
grind — they are confetti. The first bonus I actually failed (w3-01) had an **unreadable meter**
(§10, item 3). The first bonus that was a real, interesting constraint arrived at level 17.

---

## 9. What taught me versus what told me

**Taught — I failed and understood:**
- `w1-03` multi-seed hardcoding. The seed table did it. Best moment in the game.
- `w2-04` the hopper constraint. The `0 of 5` / `5 of 6` verdict did it.
- `w3-01` that crates and pads do not pair within a row. The seed split did it.
- `w4-02` that a naive tunnel-follower loops — but only *because I already suspected it*; see §6c.

**Told — explained at me before I could get it wrong:**
- `w1-02` — the starter ships the loop.
- `w1-03` — the level is *titled* "Length Unknown", the starter comments say *"counted twenty-two
  once, counted sixteen the next shift / it is not the same corridor"*, **and** the brief says *"The
  corridor is a different length every shift."* **Three tellings before the one good failure.** The
  failure would have hit twice as hard with none of them.
- `w1-05` — the starter comment names the technique.
- `w3-03` — three of four hints restate the intended insight; none unblocks the real problem.
- The `Memory` REQUIRED READING doc — correct content, right place (I first saw it at w2-04, well
  before World 4), but its worked example uses `new Set<string>()` and a
  `` `${here.x},${here.y}` `` key. As my persona that is exactly the construct I said I do not
  know, handed over as reference material rather than taught.

---

## 10. Things that are actually broken

1. **`w2-05`'s brief states a false stopping condition** (§5). Content bug.
2. **`w4-02`'s requisition card gives the wrong type for `mark`/`readMark`** (§6a). Contradicted by
   the brief, by w3-02/w3-04's data, and by the compiler.
3. **`w3-01`'s bonus meter reads `6 / 1 pickups`** for a bonus described as "Finish within par with
   no failed pickup". I did six pickups; the budget is apparently one; I still do not know what it
   counts.
4. **`w3-02`'s result card contradicts itself.** `TICKS 402 · par 332` with *"Bonus met — Beat par by
   ten percent"* directly beneath. The medal uses the worst seed (402), the bonus uses the best
   (281). Two numbers on one card, from different seeds, saying opposite things.
5. **`w3-03`'s terminal is unidentifiable** by `terrain`, `mark` or `machineId`.
6. **Reference panel "FOR THIS ORDER" chips do not navigate.** Clicking `inventory` highlights the
   chip and leaves the panel showing the `Memory` article. It looks like a jump link; it is not.
7. **Commendations are awarded silently.** After w1-02 the site map read `COMMENDATIONS 5`; the
   modals had shown me three.
8. **`scan()`'s return shape is undocumented.** I learned `tile.items` is `[{kind, count}]` by
   printing it after a failed run in w3-02; the verdict (`0 of 8 — 8 short`) was identical to what an
   empty program would produce.
9. **Minor:** `Seed 1 of 4 (seed 1) failed` — redundant parenthetical in every multi-seed verdict.

---

## 11. Keep / cut / merge — every level I played, ranked

The developer has said cutting is preferred to fixing and that 40 levels is not sacred.

### CUT (4)

| Rank | Level | Why | What the game loses |
|---|---|---|---|
| 1 | **w1-02 Forty-Five Metres** | Teaches nothing it enforces; the starter contains the answer; 45 literal `move`s take gold, the star and two commendations (§4). | The corridor-doubles-back joke, and the `print` requisition. Move `print` to w1-01 and nothing else is lost. |
| 2 | **w2-02 Ripe Only** | It is w2-03 with one predicate removed. Both solved first-try in 4 and 5 minutes. Two consecutive serpentine-the-field levels is one too many. | The `harvest` requisition — give it to w2-03. |
| 3 | **w3-03 Manifest** | Unshippable as it stands: the grader gives no diff, the geometry is undiscoverable, the terminal is unidentifiable, and it can be beaten at 11× par by doing the opposite of the lesson (§3). | **The best single mechanic idea in World 3** — "your `print` output *is* the answer". If you keep one thing, keep that objective and move it to a level with a legible map. |
| 4 | **w3-05 The Night Shift** | It is w3-02 plus "you can now carry several". I passed it first run without thinking, at 680 against par 439, and felt nothing. The batching insight is real but tiny. | The rack-capacity idea. Fold it into w3-02 as a second objective and save a whole level. |

### MERGE (2)

| Rank | Merge | Result |
|---|---|---|
| 5 | **w1-01 + w1-02** | One opener: drive to the pad, then drive a long corridor. Two ideas, five minutes. |
| 6 | **w2-02 + w2-03** | One level: sweep the field, harvest what is ripe, plant what is bare. That *is* w2-03. |

### KEEP (11)

| Rank | Level | Why | Fix first |
|---|---|---|---|
| 1 | **w1-03 Length Unknown** | The single best teaching moment in the game. | **Remove two of its three tellings.** The title, the starter comments and the brief all spoil the failure before it lands. Let the seed table do the work. |
| 2 | **w2-04 Capacity** | The best-shaped puzzle I played. Physical constraint, short deduction, exact feedback. | Nothing. |
| 3 | **w4-02 Breadcrumbs** | The only level with a bonus I could fail, and it is a genuine second axis. | Fix the `mark` type in the reference card; **draw a path trail in the replay** (§6c). |
| 4 | **w3-04 First In, First Out** | Clean survey-sort-execute. Two runs, my own solution, no friction. | Nothing. |
| 5 | **w3-02 Sorted by Colour** | A real step up; the matching problem is honest work. | Fix the bonus/medal seed contradiction; document `tile.items`. |
| 6 | **w3-01 Pick and Place** | Good introduction to survey-then-execute; its multi-seed failure taught me something real. | Fix the `6 / 1 pickups` meter. |
| 7 | **w2-05 Harvest Quota** | The level is fine. | Delete the false sentence (§5); say the field is a rectangle. |
| 8 | **w1-05 Floor Inspection** | First honest challenge, good shape. | Remove the starter comment that names the technique. |
| 9 | **w4-01 Headlamp** | Cheap, clean, one idea, and a correct rest beat after World 3. | Nothing. |
| 10 | **w1-04 Grid Reference** | Two minutes, does one thing (read your own position). | Nothing. |
| 11 | **w2-01 The Sensor Package** | Correct length for a world opener. | Nothing. |

**Net: 40 → 36 levels, and World 3 gets an hour shorter.**

---

## 12. The five most expensive problems, ranked by players lost

1. **`w3-03`'s grader never diffs on a text-output objective.** `0 of 5 — 5 short`, six times, was
   the entire feedback. ~35 minutes and the exact point I would have quit. *Fix: show expected vs.
   received, or name the first wrong or missing class.*
2. **Par is not a score for the first eight levels.** Six first attempts landed exactly on par. This
   spends the credibility of every later medal, Cost tab and Library projection before the player
   has written a `while` loop. *Fix: par from the intended technique on the median seed, not the
   worst.*
3. **Bonuses through w2-05 are free.** Eight stars, zero attempts. A reward that costs nothing
   teaches that rewards cost nothing — and it poisons the one real bonus when it finally arrives at
   level 17. *Fix: w4-02's information-budget bonus is the model; use it from World 1.*
4. **`w2-05`'s brief states a false rule** and `w4-02`'s reference card states a wrong type. Two
   places in seventeen levels where the game's own text was the bug. In a game whose whole promise is
   "failures are your fault, never random", these are the most corrosive defects on the list.
5. **`w1-02` rewards deleting the loop it teaches (H1).** Cheapest fix in the document and still
   open. Or cut the level.

Runners-up: the Library arriving as a status bar after I had already written its contents six times
(§7); the `6 / 1 pickups` meter; the w3-02 bonus/medal seed contradiction; dead Reference chips;
silent commendations; `scan()`'s undocumented shape.

---

## 13. Is there too much text?

**Mostly no, and that surprised me.** The briefs are four or five short paragraphs. The voice —
Vance's memos, Halloran's lowercase notes, `dot`'s asides — is genuinely funny and I read all of it
through World 2. The comedy is load-bearing rather than decorative, and it lands because the early
levels let you feel competent first.

**The exceptions:**

- **The result modal is the crowded surface, not the brief.** At a World 3 close it carries a status
  line, a flavour line, a streak badge, two objective rows with fractions, three stat tiles, a
  commendations block, a bonus block with a progress bar, a four-to-five-row seed table, and three
  buttons plus a "skip the ceremony" link. **That is eleven things competing at the moment I most
  want one number.** The game already knows: it shipped a skip link.
- `w3-03`'s brief is the only one I found genuinely hard to parse, and not because it is long —
  because "rack row 7" and "four aisle heads" describe a geometry I could not build in my head, and
  the level cannot be looked at before it is run.

**I stopped reading failure flavour lines at w2-03 (level 8 of 40). I stopped reading commendations
at w2-02. I never stopped reading briefs** — but I re-read w3-03's four times.

**R3, first repeated line: one level apart.** *"Under par. Par has been adjusted. This is how it has
always worked."* fired at **w2-02** and again at **w2-03** — my second and third times under par in
the entire game.

---

## 14. Did the difficulty ever spike unfairly?

**Yes, once, and it is the whole story of World 3.**

- **w1-05** is a spike (1→4) and it is *fair*: runs-to-pass stayed at 1, I understood it, and I was
  satisfied. Correct shape.
- **w2-04** is a spike (3→5) and it is *fair*: two runs, exact feedback, real satisfaction.
- **w3-03** is a **wall** (6→9). Runs-to-pass jumped 3× to 11, time jumped 5×, hints went 0→4, and
  time-to-next-run grew monotonically as I ran out of ideas. Crucially the unfairness is not the
  difficulty — it is that **the difficulty was in information the game withheld** (how many aisles;
  what the grader wanted; how to identify a machine), not in anything I could reason about.
- **w2-05** is *frustrating rather than hard* for the same reason at smaller scale: the brief lied.

**D1 verdict:** one wall (w3-03), one plateau (w2-01→w2-03), two fair spikes. **D3:** the sawtooth
works where I saw it — w2-01, w3-01 and w4-01 all read as relief rather than filler. w4-01 in
particular is a well-placed decompression beat after w3-03, and it is the reason I was willing to
open w4-02 at all.

---

## 15. Would I keep playing? Level by level

- **w1-01 → w1-04.** Yes, but from curiosity, not pull. Nothing had asked anything of me.
- **w1-05.** Yes. First time I had to think, and I liked it.
- **w2-01 → w2-03.** **This is where the pull first weakened.** Three levels, three first-run golds,
  one activity. At the end of w2-02 I would have put it down for the evening — not annoyed, done.
- **w2-04.** Yes, emphatically. This pulled me back in.
- **w2-05.** Yes, but irritated — at the brief, not the puzzle.
- **w3-01, w3-02.** Yes. This is the game finding its level.
- **w3-03.** **No. This is where I stop.** Fifty-five minutes, eleven runs, four hints exhausted,
  the same eight words every time. I finished it because I was instructed to.
- **w3-04, w3-05, w4-01, w4-02.** Played after the point I would have quit, so my engagement here is
  not a real reading. For what it is worth, w3-04 and w4-01 were good and w4-02's bonus was the
  first thing in an hour that made me want to try harder.

**Would I open it again tomorrow?** Before w3-03, yes. After it, I would open it, look at w3-04, and
if it opened with another undiscoverable geometry I would close the tab.

**What is the game about, in my words:** *"You write a small program for a robot that has to work on
several maps it has never seen, and then you watch the recording of it getting it wrong."* That is a
good pitch and the game delivers it hardest at w1-03 and w2-04.

**A4 — what would I show a friend?** Not my code. The **w1-03 seed table** — the moment the game told
me my program only worked on one map.

---

## 16. Scorecard

```
BOOTSTRAP DESIGN REVIEW — beginner playtester — 2026-09-05
Sessions: 1   Total hours: ~1.9   Furthest level: w4-02 (17 of 40 closed)
Reason play stopped: budget, at a natural break. The point I WANTED to stop was w3-03.

FIRST SESSION
  F1  Minute 0-5: loop closes                       [4]/5   Page load to first Run <60s; site map
      paints instantly; Run found unprompted; 2 concepts before first Run (coords, move). Docked 1:
      the site view is empty before the first run, so w1-01 runs 1-2 were reconnaissance.
  F2  Minute 5-15: second idea + legible failure    [4]/5   At minute 15 I was on w1-04. w1-03's
      seed table is a genuinely excellent legible failure — better than TFWR's or 7BH's equivalent.
      Docked 1: no failure in the first 15 minutes was unplanned; the game had not resisted me once.
  F3  Minute 15-30: reason to return                [3]/5   Medal above bronze by minute 3;
      Requisition felt like a reward, not an interstitial. But by minute 30 I was on w2-01 and had
      still not met a problem. The reason to return was curiosity, not appetite.
  F4  Genre failure modes avoided                   [3]/5   Zero toolchain friction (no unresolvable
      TS, no Monaco fights, worst Run-to-verdict ~2s). Coordinate system never confused me. But
      mode 2 applies squarely: w1-02's starter constrains you into the answer, then pays you to
      delete it. Mode 4 (comedy before competence) is handled well — the jokes land.

TEACHING CONTRACT
  T1  One concept per level, honoured               [3]/5   worst offender: w3-03 — count items +
      deduce the geometry + identify the terminal + format graded text = four things, three
      undocumented.
  T2  Stress points survive                         [2]/5   w1-02 fails outright (H1). w2-04
      survives well and is the best level I played. w2-03 (honourable mention) survives fine.
  T3  Lessons retained / reinforced                 [3]/5   The w1-03 multi-seed lesson is
      reinforced by every later verdict's seed table — that genuinely works. The w2-04 capacity
      lesson is never revisited. Nothing reminds you of anything 40 minutes later.
  T4  Documentation contract                        [2]/5   missing verbs/facts: scan()'s return
      shape; inventory()'s return type; how to identify a machine. Wrong: mark()/readMark() types on
      the requisition card. Dead "FOR THIS ORDER" chips. DESIGN.md A3 memory doc is SHIPPED, correct
      and well placed (first seen w2-04) — the one clear pass here.

DIFFICULTY
  D1  Curve shape                                   [2]/5   walls: w3-03 (55 min, 11 runs, 4 hints,
      11x par). Plateau: w2-01 -> w2-03 (three first-run golds, declining interest).
  D2  Frustrating-not-hard levels                   [2]/5   count + ids: 2 — w3-03 (meets all six
      rubric criteria), w2-05 (false brief).
  D3  Sawtooth reads as relief                      [4]/5   w2-01, w3-01 and especially w4-01 all
      read as relief, not filler. w4-01 straight after w3-03 is the reason I opened w4-02 at all.
      Docked 1: w2-01 arguably reads as filler because w1-05 was not hard enough to recover from.
  D4  Curriculum difficulty numbers accurate        [—]/5   NOT ASSESSED — I deliberately did not
      read CURRICULUM.md. My own 1-10 ratings are in §2.
  D5  Hour budget accurate                          [2]/5   worst world: W3 — 91 minutes, 55 of them
      one level. W1 ran at HALF its 40-minute budget (18 min), which is its own problem.

REWARD
  R1  Frequency                                     [3]/5   longest gap: never more than one level.
      Densest cluster: 4 events in one modal at w1-01 close (medal + 3 commendations).
  R2  Signal vs. noise                              [2]/5   first dismissed reward: the flavour line,
      at w2-03. Commendations from w2-02. Commendations changed my behaviour ZERO times. Two were
      awarded without ever being shown. At a World 3 close, 11 distinct things compete for attention.
  R3  Variety and escalation                        [2]/5   first repeat: "Under par. Par has been
      adjusted." at w2-02 and again at w2-03 — one level apart, on my 2nd and 3rd times under par.
      Escalation across worlds NOT ASSESSED (did not reach W5+).
  R4  Competence returned per world                 [3]/5   After W1: "I can make a bot walk a shape
      it cannot see." After W2: "I can hold state across a sweep and react to what a tile says."
      After W3: NONE — w3-03 returned only the knowledge that brute force works. After W4 (partial):
      "I can make a bot remember where it has been."

REPETITION
  C1  Code-to-insight ratio                         [3]/5   worst: w3-03 — ~14 logical lines for 2
      real insights, but 11 runs and 55 minutes, nearly all spent guessing geometry rather than
      typing. Best: w3-04, ~16 lines / 3 insights. No level crossed 25 lines per insight.
  C2  Chore shapes present                          [2]/5   RETYPING is severe: I wrote the same
      generic serpentine sweep in w1-05, w2-03, w2-05, w3-01, w3-02, w3-03 — six levels, the same
      twelve lines — and the same greedy goTo(x,y) in four. This is exactly what the Library exists
      to absorb and it arrives one world too late (§7). Re-running for seeds: 0. Watching: 0, I
      never set 64x and looked away. Toolchain waiting: negligible.
  C3  Bonuses absorb ambition                       [1]/5   Not grind — the opposite. 8 stars
      awarded, 0 attempted, through w2-05. First failable bonus at level 11 and its meter was
      unreadable. First genuinely interesting bonus at level 17 (w4-02's mark budget).
  C4  Novelty across worlds                         [3]/5   W1 -> W2 changed the problem, not the
      activity (both sweep a grid). W2 -> W3 genuinely changed it (carry, match, report). W3 -> W4
      changed it again (see, remember). H12 is only half right so far.

FEEDBACK
  Q1  Failure is actionable   A: 5  B: 8  C: 8  D: 2  E: 1     [2]/5
      C: six are w3-03's "0 of 5 — 5 short"; one is w3-02's "0 of 8 — 8 short" (identical to what an
        empty program yields); one is w2-05's "1 of 8 — 7 short".
      D: both w2-05 — the brief's false stopping condition, believed twice.
      E: w4-02's requisition card giving the wrong type for mark().
  Q2  Fault attribution clear                       [2]/5   ambiguous cases: w2-05 run 2 (I assumed
      I was wrong; the brief was wrong). w3-03 runs 5-8 (could not tell whether my counts, my format
      or my coverage was at fault). w4-02 run 2 (card said number, compiler said string).
  Q3  Line-number fidelity                          [4]/5   1 of 3 tests run: a compile error
      reported "COMPILE · LINE 2" and line 2 was exactly right. Throw-from-lib and
      interface-shifts-lines tests NOT RUN.
  Q4  Trace legibility                              [2]/5   Plant growth stages: PRESENT (distinct
      green bars, readable). w4-02 bot looping: PRESENT-BUT-UNREADABLE — no path trail is drawn at
      all, so the failure that IS the lesson is invisible (§6c). Blocked-move rendering: NOT
      ASSESSED. w5-05 cable: NOT REACHED.
  Q5  Multi-seed failure legible                    [5]/5   The w1-03 seed table plus "It passed on
      seed 7. The field is not always the same field." I can see which seed, that they differ, and
      the tick cost of each. This is the best screen in the game and it must not be touched.
  Q6  Halt cases + no soft-lock                     [4]/5   Tick-budget halt triggered accidentally
      at w3-03: "Your program did not halt. We stopped it. We would like this noted on the record."
      2501 ticks reported, verdict rendered normally, UI never locked, recovery instant. Op-budget
      and watchdog cases NOT TESTED.

OPTIMIZATION
  O1  Engagement vs. anxiety                        [2]/5   ratio: Indifference 12, Engagement 4
      (w1-05, w2-04, w3-04, w4-02 — and I acted on only one), Obligation 0, Anxiety 0. Indifference
      at gold is the dominant state, and the rubric correctly calls that a failure.
  O2  Somewhere to be good                          [2]/5   Answer was "no" on 16 of 17 levels. The
      single exception is w4-02's mark budget, which is a real antagonistic axis and which I cared
      about. H8 CONFIRMED for W1-W3; the fix already exists in the game at w4-02.
  O3  Par credibility                               [1]/5   worst pars: w1-03 (24 = the longest
      seed, so every correct answer scores exactly par) and w3-03 (25, against a level I passed at
      276). Six exact-par first attempts across the first nine levels.
  O4  The Library                                   [1]/5   Unlocked with no ceremony — one grey
      status-bar line (§7). I never opened it. By the time it appeared I had already hand-written
      its most obvious contents six times. Publish offer never fired. Regression/Cost tab untested.
  O5  Layer conflict                                [—]/5   NOT REACHED — never published.

AGENCY
  A1  Solutions feel owned                          [4]/5   Yes on 16 of 17. w2-04's plant-to-make-
      room, w3-01's survey-then-ferry and w3-04's survey-sort-ferry all felt like mine. No algorithm
      was ever named at me — CURRICULUM §7's rule is being honoured. Transcription levels: none.
      The exception is w1-02, which is owned by its starter.
  A2  Solution space breadth                        [3]/5   single-solution levels: w1-01, w1-02,
      w1-04 (3). Most of W2/W3 admit a few genuinely different approaches; w3-03 admits two, one of
      which (brute force) is 11x worse and still passes.
  A3  Starters constrain appropriately              [2]/5   w1-02's starter contains the whole
      answer. w1-05's comment names the technique. w1-03's comments spoil the level's one good
      failure. These starters remove the question, not the wrong question.
  A4  Something to show someone                     [3]/5   The w1-03 seed table. Not my code — the
      moment the game told me my program only worked on one map.

ENDING            NOT REACHED
```

---

## 17. Hypothesis verdicts

| # | Verdict | Evidence |
|---|---|---|
| **H1** | **CONFIRMED** | 45 literal `move` calls on w1-02 → gold, star, both objectives, 2 commendations, first run. The new 60-tick gate does not gate: the naive answer is 45. Nothing in the UI preferred the loop, and the starter ships the loop for you to delete. §4 |
| H2 | NOT REACHED | Did not reach World 8. |
| H3 | NOT REACHED | Did not reach World 8. |
| H4 | NOT REACHED | Did not reach World 7. |
| **H5** | **REFUTED as an abandon risk** | w2-04 took 2 runs / 9 min and gave the best failure message in the game. **But two predicted sub-shapes did occur:** I passed 21% over par and never returned to improve it; and the "`harvest` silently fails and still costs a tick" lesson never fired at all, because I designed around it rather than hitting it. |
| H6 | NOT REACHED | Did not reach w4-04. |
| H7 | **PARTIAL — leaning refuted for the stated reason** | One session. The point I wanted to stop was **w3-03 — a wall, not fatigue**. The earlier natural stopping point was **w2-02 — boredom, not fatigue**. Neither ends on "tired". |
| **H8** | **CONFIRMED for W1–W3, with the fix already in the game** | O2 was "no" on 16 of 17 levels; one axis, no solution of mine was notably good at anything. **But w4-02's "place fewer than 180 marks" is exactly the information budget the hypothesis says is missing**, it is genuinely antagonistic to ticks, and it is the only bonus in 17 levels I could have failed. The MINIMAL OBSERVATION commendation exists on the site map and never fired. |
| **H10** | **REFUTED, emphatically** | w1-03's seed table shows which seeds failed, which passed, and the tick cost of each, with the line "The field is not always the same field." A non-programmer would understand it. Best screen in the game. |
| **H11** | **CONFIRMED, and early** | First repeated flavour line at **w2-03, one level after its first use**. I stopped reading failure flavour at **w2-03 (level 8 of 40)** and commendations at **w2-02**. I never stopped reading briefs. |
| **H12** | **PARTIALLY REFUTED** | At the end of World 3 my expectation of World 4 was "more of this, with a map I cannot see" — so the prediction holds for W1→W2 (same activity, new problem). **But W2→W3 and W3→W4 genuinely changed the activity** (carry/match/report; see/remember). The novelty problem is real in Worlds 1–2, not across the board. |
| **H13** | **REFUTED (warm cache)** | Site map painted essentially instantly, editor arrived with the workspace, first successful Run inside 60 seconds. NOT tested cold or throttled — so refuted only for the warm case. |
| **H14** | **CONFIRMED, with a twist** | I did question the premise — but only because **par 25 makes walking every tile visibly impossible**, not because the brief signalled anything. The trick reads as a trick. Worse: all three hints that restate the insight answer a misconception I never had, while the real blocker (the geometry) is unsupported by any hint. §3 |
| H15 | NOT REACHED | Did not reach w5-05. |
| H16 | NOT REACHED | Did not reach w6-04. |
| H17 | NOT TESTED | Did not reload after revealing hints. |
| H18 | NOT REACHED | — |

---

## 18. The three things

1. **The one change that would most improve this game: make failure messages *diff*.** Where an
   objective counts things, name the thing that is missing; where it grades text, show expected
   against received. `0 of 5 — 5 short`, repeated six times without variation, is the single reason
   I would have stopped playing, and the same defect in milder form is why `w3-02` cost me a run and
   `w2-05` cost me three.

2. **The most likely single reason a real player stops: `w3-03`,** at around the ninety-minute mark,
   after exhausting four hints that all answer a question they did not ask. Second most likely, and
   quieter: closing the tab after `w2-02` because eight levels in a row have asked nothing of them.

3. **The best thing about it, which must survive the fixes:** the multi-seed verdict — the seed
   table and the sentence *"The field is not always the same field."* The entire identity of this
   game is on that one screen, and it lands on the third level. Everything else in this document is
   negotiable; that is not.

---

## 19. One more thing, for the developer

The game is at its best when it makes you *look* — `w2-04`, `w3-04`, `w4-02` — and at its worst when
it makes you *guess* — `w3-03`, `w2-05`. The difference is not difficulty. It is whether the
information needed to reason is in the world or withheld from it. Every level I enjoyed handed me a
world I could interrogate with `print` and `scan`, and every level I resented hid a fact I could
only find by accident.

And the single cheapest structural improvement available: **move w4-02's bonus shape to World 1.**
An information budget is free to implement, it is antagonistic to ticks, it gives a struggling
player somewhere to be good, and the game already has one working example of it. It would fix H8,
fix C3, and give the medal system something to mean.
