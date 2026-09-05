# BOOTSTRAP — Playtest report (veteran / AoC profile)

> **STATUS: FINAL** for the levels played. Coverage gaps are declared in §0 and are large —
> Worlds 5, 6 and 7 were seeded, not played.
>
> Tester profile: professional programmer, finishes Advent of Code every year, has played
> SpaceChem, Opus Magnum, TIS-100 and The Farmer Was Replaced. Came here for the ceiling.

## 0. Method, and what I did not do

- Session start 08:59, single sitting. Worlds 1 and 2 played **honestly and completely**
  (10/10 closed, no seeding). `w3-01` played honestly. `w3-02`–`w3-05` **seeded**.
  `w4-01`–`w4-04` played honestly. `w4-05`, all of World 5, 6, 7 and `w8-01`–`w8-04`
  **seeded** — I did not play them. `w8-05` attempted for 2h10 over 12 runs and **not closed**.
- **Coverage gaps I am declaring up front:** World 5 (constraint solving), World 6 (parsing),
  **World 7 entirely** (the multi-bot execution model — H4 is therefore NOT REACHED except
  through the `w8-05` API surface), and `w4-05`. I read `w7-*` API documentation but did not
  play the levels. Anything I say about World 7 pacing is inference, not observation, and is
  labelled as such.
- **Tooling caveat, and it matters:** another Chrome-automation agent shared my browser tab
  group for the whole session. It repeatedly navigated my tab away and — because keyboard
  events go to whichever Chrome tab is *active*, not to the tab an automation call targets —
  roughly half of my paste-into-Monaco attempts landed in the other agent's game instead of
  mine. I lost about 40 minutes to this and eventually stopped using the editor at all,
  injecting source through `localStorage` and clicking **RUN** with the mouse. **None of this
  is the game's fault** and none of it appears as a finding below. Where I report a run count,
  I have excluded runs lost to tooling.
- I did not read `src/levels/**/__solutions__/`, `docs/CURRICULUM.md` or `docs/NARRATIVE.md`.
  I did read `src/runtime/api-spec.ts` once, to get the multi-bot verb documentation — that
  file is the source of the in-game reference panel, so it is player-visible content, but I
  read it out of band because clicking 12 reference entries through a contested browser was
  not affordable.

---

## 1. The headline

**The ceiling is real but it starts at level 16 of 40, and the finale has a hole in it big
enough to delete a third of the level.**

Three things I would tell the developer before anything else:

1. **World 1 and World 2 are ten levels that produced exactly one moment of thought.** I took
   gold on the first honest run on nine of the ten. The one exception (`w2-04`) is the only
   level in twenty before `w3-01` where I had to think, and it is the tenth level of the game.
2. **`power(machineId, 'on')` solves the entire grid third of `w8-05` from the desk, remotely,
   in 16 ticks, with no travel and no topological reasoning.** It satisfies both grid
   objectives including the feeder-order audit. See §6.
3. **The Library's Regression tab is the best-designed thing in the game and the publish dialog
   that feeds it is the worst.** The extractor silently truncated a multi-line arrow function
   to its first line and committed a syntactically invalid `lib.ts`. See §5.
4. **I did not finish the finale, and the reason is not that it is hard.** Four of five
   objectives, two of seven seeds, twelve runs, ~200 lines. What beat me was seven randomised
   maps × five objectives × one pass/fail bit, with no partial credit anywhere in that product.
   See §6.

---

## 2. Per-level notes

Format: `id · title · my medal / par · runs to pass · what I actually had to figure out`.

### World 1 — Boot Sector (played honestly, ~25 min of real play)

| id | title | result | runs | what I had to figure out |
|---|---|---|---|---|
| `w1-01` | Cold Start | **gold 6/6**, 1st run | 2 (1 deliberate throwaway) | Nothing. Read brief, typed six moves. |
| `w1-02` | Forty-Five Metres of Corridor | **gold 45/45 + star**, 1st run | 1 | Nothing. I wrote **45 literal `move()` calls** and it took gold, the star, and full marks. |
| `w1-03` | Length Unknown | gold 24/24 + star | 2 (first was a deliberate hardcode) | `while (canMove(...))`. |
| `w1-04` | Grid Reference | gold 16/16 + star, 1st run | 1 | Arithmetic stated verbatim in the brief. |
| `w1-05` | Floor Inspection | **gold 50/50 + star**, 1st run | 1 | The one W1 level with content: serpentine either half of a partitioned bay, crossing at the doorway row. Genuinely fine. |

**`w1-02` is H1, and H1 is CONFIRMED.** The level's stated lesson is bounded repetition. Par is
45, the route is 45 tiles, and forty-five hand-written `move()` calls scores **gold plus the
star**. There is no character axis, no bonus, no failure and no score difference that
distinguishes the loop from the transcription. The second level of the game teaches a lesson it
does not enforce, and — worse for a player like me — it teaches me on level 2 that the number
does not mean anything. Everything downstream (par, medals, the Cost tab, the whole Library
metagame) is denominated in trust I had already spent by minute six.

**Par credibility is a bigger problem than H1.** Par in Worlds 1–2 is set at *exactly* the
natural solution's worst-seed tick count. `w1-01` 6/6. `w1-02` 45/45. `w1-03` 24/24. `w1-04`
16/16. `w1-05` 50/50. `w2-01` 18/18. I did not aim at par once; I hit it dead on six times in a
row by writing the obvious thing. A par you cannot miss is not a target, it is a receipt.

### World 2 — Regolith Fields (played honestly)

| id | title | result | runs | what I had to figure out |
|---|---|---|---|---|
| `w2-01` | The Sensor Package | gold 18/18 + star, 1st run | 1 | Walk the row recording, walk back to argmax. `scan(dir)` reads neighbours free, which is a nice free-information beat. |
| `w2-02` | Ripe Only | gold 47/49 + star, 1st run | 1 | Serpentine + a predicate. |
| `w2-03` | Rotation | gold 72/76 + star, 1st run | 1 | Same serpentine, start corner now variable. Two lines different from `w2-02`. |
| `w2-04` | **Capacity** | silver 63 → **gold 47** on re-solve | 3 | **The first real puzzle in the game.** The hopper arrives full of seed, so you cannot harvest until you have planted something; planting on the one bare tile is the only way to open a slot; crops ripen on a clock so idling is sometimes cheaper than walking. Good level. |
| `w2-05` | Harvest Quota | gold 68/74 + star | 2 | Filter `crop === "crop"`, stop when `harvest()` stops paying. First run failed because I assumed a single row; the field is 2-D. |

**H5 (`w2-04` is the first abandon risk) — REFUTED, but read the detail.** I did not abandon; I
silvered, immediately felt the pull to improve, rewrote the two-pass into a lap-based version,
and went 63 → 47 and silver → gold. **This was the single best moment in my first ninety
minutes**, and the reason is the results card:

> `RECORD 47  ~~was 63~~ — Your own record, lowered by 16. The old figure has been retained.`

That is the reward the rest of the game is missing. It is personal, it is a delta, it does not
compare me to anyone, and it appeared without me asking. **Do not touch it.** But note *when* it
fires: level 10 of 40, because it is the first level where the honest first attempt is not
already gold.

### World 3 — The Sorting Yards (only `w3-01` played)

| id | title | result | what I had to figure out |
|---|---|---|---|
| `w3-01` | Pick and Place | gold 143/157 + star | Recon the shed cheaply (walk the middle lane, `scan` N/S to read three rows in one pass), then greedy nearest-crate/nearest-pad ferrying. ~35 lines. First level that felt like a small AoC part 1. |

`w3-02`–`w3-05` seeded, not played. No verdict.

### World 4 — Cave Systems (played honestly to `w4-04`)

| id | title | result | what I had to figure out |
|---|---|---|---|
| `w4-01` | Headlamp | gold 52/52 + star, 1st run | Walk a corridor, don't re-enter tiles. ~25 lines. |
| `w4-02` | Breadcrumbs | gold 236/391 + star, 1st run | Iterative DFS with physical backtracking. **I placed zero marks** — see below. |
| `w4-03` | Left Hand on the Wall | gold 362/548 + star, 1st run | **Nothing. I pasted the `w4-02` file unchanged and it golded.** |
| `w4-04` | Map First, Move Second | **silver 1124/970**, bonus **not met** | Survey the cave into an adjacency map, BFS pairwise distances, brute-force 3! orders, walk the best circuit. ~90 lines. The first level in the game that is worth an evening. |

Three findings here, in order of severity.

**(a) `w4-02` and `w4-03` are the same level.** I solved `w4-03` by pasting `w4-02`'s file with
no edits and took gold with a 34% margin. If two consecutive levels accept a byte-identical
solution, one of them is not a level.

**(b) `w4-02` teaches a mechanic the game has already made redundant, and its bonus does not
defend it.** `mark`/`readMark` exist to remember where you have been. But `w4-01`'s own brief
contains the section *"Memory — Ordinary JavaScript values … hold their contents for the whole
run"*, and the reference panel makes that REQUIRED READING. So the level immediately after that
paragraph asks me to solve a loop-detection problem, and the correct answer is the `Set` the
previous level just told me about. The bonus is *"Reach the vein having placed fewer than 180
marks"* — I placed **zero** and got the star. A bonus that is satisfied by ignoring the level's
subject cannot defend the level's subject. `w4-03` then says out loud *"Your breadcrumbs would
work here. They are not necessary, and they cost a tick each"* — the game knows.

**(c) H6 — the `w4-04` blank-editor risk — REFUTED, mitigations SHIPPED.** The starter is
exactly what was prescribed:

```ts
// NOTE(4470): i kept mine like this. key(x, y) names a tile, the
// NOTE(4470): array is what it touches. the tunnels join up in places
const known = new Map<string, string[]>();
function key(x: number, y: number): string { return x + "," + y; }
// TODO(4470): the side chambers are easy to walk straight past
```

Typed `Map`, `key` helper, `NOTE(4470)` voice, and a `TODO` that points at the actual trick.
Time-to-first-run for me was under two minutes. This is good scaffolding: it removes the
representation question and leaves the algorithm question. **`w4-04` is the best level I
played.**

**(d) …and `w4-04`'s bonus is the worst feedback failure I hit.** *"Take the collection points
in the best order."* I brute-forced all `3!` orders over exact BFS distances and walked the
minimum. The bonus said **outstanding**, with no number, no comparison, no "you took A→C→B, best
was C→A→B", nothing. My best theory — and it is a theory, because the game told me nothing — is
that the objective scores the order in which the bot *stands* on the pads, and my depth-first
survey walks over them before the planned circuit ever starts. If that is right, the bonus is
unreachable by the survey-by-walking approach the level's own starter scaffolds, and the
intended answer is to survey the side chambers with `look()` from the junction. I wrote that
version too. **It produced byte-identical tick counts on all four seeds** (1008 / 1072 / 1124 /
1100), which means my `look()`-based stub-skip never fired and I still do not know why. Two
attempts, ~25 minutes, and I ended with no model of the failure. By D2's definition that is
"frustrating rather than hard".

---

## 3. Difficulty curve, measured

My per-level difficulty, 1–10, for an experienced programmer:

```
w1-01  1   w2-01  2   w3-01  4   w4-01  3
w1-02  1   w2-02  2                  w4-02  4
w1-03  1   w2-03  2                  w4-03  1  (same as w4-02)
w1-04  1   w2-04  5                  w4-04  6
w1-05  3   w2-05  3                  w8-05  8+ (in progress)
```

**The shape is a flat line at 1–2 for nine levels, one spike to 5, back to 2–4 for six levels,
then a genuine ramp at `w4-04`.** That is not a sawtooth, it is a runway. The first ninety
minutes of this game are a plateau by §D1's definition: three-plus consecutive levels with the
same runs-to-pass and no reaction on passing.

**Would I have got to World 5 without being paid to?** Honestly: **probably not in one sitting,
and here is the exact moment.** After `w2-03` — my third consecutive gold-on-first-run
serpentine — I caught myself pasting the previous level's file and changing two lines. That is
the point where a player like me closes the tab and says "I'll come back to it", and the thing
about coming back to it is that you don't. `w2-04` rescued me by about one level's margin.

What would have kept me: **let me skip.** A single "I know how to loop, show me something hard"
door at the site map — even one that marks those levels unscored — costs nothing and would have
put me at `w3-01` in ten minutes with my goodwill intact.

---

## 4. What is actually broken

Ranked by how many players it costs.

1. **`w8-05`: `power(id, 'on')` deletes the grid objective.** Eight remote calls, 16 ticks, no
   travel, no topological sort, both grid objectives met including the feeder audit. Detail in
   §6. This is the finale's largest sub-problem and it is not a problem.
2. **The publish extractor truncates expression-bodied multi-line arrow functions to their
   first line.** I published this from `w4-01`:
   ```ts
   const ahead = (d: Dir, p: {x:number;y:number}) =>
     d === Dir.North ? { x: p.x, y: p.y - 1 } :
     ...
   ```
   The dialog reported it as **"lines 4–4"** and `lib.ts` received exactly:
   ```ts
   export const ahead = (d: Dir, p: { x: number; y: number }) =>
   ```
   — no body. `lib.ts` was then **committed** with a syntax error, the commit button said
   "committed", and `w4-01` broke. Block-bodied arrows (`explore`, lines 11–24) extract
   correctly, so the bug is specific to arrows whose body is an expression spanning lines.
3. **`w4-03`'s shipped starter does not typecheck.** The starter is `print(pos());` and Monaco
   reports, before the player has touched anything:
   `Argument of type 'Vec' is not assignable to parameter of type 'string'. (2345)`
   The status bar says **"1 problem"**. Level 18 of 40 opens with the game's own code red.
4. **`w4-04`'s bonus is unexplained on failure** (§2d). No number, no comparison, no diagnosis.
5. **The publish dialog does not scale.** On `w4-04` it offered me **19 checkboxes** — every
   top-level declaration in the file, including `terrains`, `orders`, `bestCost` and
   `bestRoute`. It has no notion of "reusable routine" versus "local scratch variable", so at
   realistic solution size the offer becomes a wall of noise you dismiss reflexively. Which is
   what I started doing.
6. **`w2-05`'s bonus progress reads from a different seed than the verdict.** The card said
   *"Bonus met"* while the progress bar beside it read `58 / 71 ticks` and the header read `68`.
   Three numbers, two sources.
7. **Bonus objectives show as `met` before the program has run.** On `w8-05`, "Keep every bot
   working for at least two thirds of the shift" is green at tick 0.
8. **The trace viewer is unreadable at finale scale.** `w8-05`'s map is roughly 48×30 rendered
   into ~375px. I could not distinguish a crate from a substation from a wall. The replay is
   the debugging instrument, and on the level that most needs debugging it is a texture.

---

## 5. The Library

I published three routines (`key`, `ahead`, `compass`) at `w4-02` and used them for real in
`w4-02`, `w4-03` and `w4-04`.

**The Regression tab is excellent and I want to say so precisely, because §12 requires it.**
When my broken `ahead` landed, the tab said:

> **1 no longer closes. Your record is unchanged. It will stay unchanged until you say
> otherwise — a result is not withdrawn because a later edit disagreed with it.**
> `NOMINAL w1-01 nominal. 6 → 6 ticks` … `BROKEN w4-01 no longer closes. 52 → 0 ticks · gold → unclosed`
> `[RESTORE LAST KNOWN GOOD] [ACCEPT THE NEW RESULT] [CLOSE]`
> *a degraded state is still a state. the form has a box for it*

**My unreasoned first reaction, written before I thought about it: "oh good, it caught it — and
it didn't take my medal."** That is the opposite of what H9 predicted. **H9 is REFUTED.** The
before→after tick column on twelve nominal levels is also the only place in the game that ever
showed me a *portfolio* of my own results, and it is the closest thing here to Opus Magnum's
histogram. It should be a first-class screen, not a tab behind a footer chip.

**The closure analysis is also good.** Ticking `explore` produced:

> This also uses `found`, `opposite`, `seen`, which would stay behind. Publish those too, or the
> subroutine will not run.

Correct, specific, and it stopped me making a mistake.

**Where it fails:**

- **The economics were never stated before I committed.** The publish dialog says nothing about
  cost. The tick-cost line — *"a subroutine is charged at the point of use, in full, on every
  call"* — lives in the Repository intro memo, which I only saw *after* publishing, because I
  had to open the Repository to see what I had done. And having read it, **I still do not
  believe it**: my `w4-02` DFS calls `key()` and `ahead()` several thousand times and finished
  in 236 ticks against a par of 391. Whatever "charged in full on every call" means, it is not
  ticks-per-call, and the README's *"Library calls cost real ticks"* reads as a straight
  contradiction of what the simulator does.
- **The unit of publication is wrong.** It offers top-level declarations. A real routine is a
  function plus the state it closes over plus the helpers it calls; the dialog knows this (it
  warns about it) but still makes me assemble it by hand out of nineteen checkboxes.
- **Publish offers fire at the *start of the next level*, on top of the requisition ceremony,
  not at the moment of satisfaction when the previous one closed.** At the open of `w4-02` I had
  a requisition modal, then a publish modal, then a brief, before the first line of the new
  problem.

**Would I use it if the game did not nudge me?** For `pathTo`/`reach` — yes, unreservedly; I
wrote that BFS three times in four levels and that is exactly the retyping the Library exists to
absorb. For anything else — no. It is a folder, and I have a folder.

---

## 6. The finale — `w8-05` The Kessler Contract

**Time spent: 2 hours 10 minutes. 12 runs. ~200 lines of my own code. Result: I did not close
it.** Best state reached: **4 of 5 objectives met, on 2 of 7 seeds, in ~370–425 ticks against a
par of 1300 and a shift of 3000.** I never got the fifth objective to hold on more than one seed
at a time.

### 6.1 Scale, from my own recon (seed 1)

Map ~48×30. **6 bots. 8 substations** (9 on seed 2). **12 crates** (14 on seed 2) in 3 classes.
Airlock needing **9 uses**. Two form slots at x=47. **Fuel 110 per bot.** Shift **3000 ticks**,
par **1300**, **7 seeds**, five objectives, all-or-nothing.

### 6.2 The opening is much better than the shape's reputation

**Time-to-first-run: about 90 seconds.** The starter is five honest lines that print the two
numbers you need (`fleet: 6`, `stations: 8`). And **reconnaissance is free and total**: `probe()`
returns the exact position and dependency vector of every substation, every depot, both slots,
the airlock's stage count and the desk's totals — from anywhere, for zero ticks. I had the entire
static world model in a 16-line program at tick 0.

That is the right call for a level this size. It makes the finale about *planning*, not
*discovery*, and it means a player cannot be stuck at minute five not knowing what the level
contains. If any part of `w8-05` should be preserved verbatim, it is this.

### 6.3 The hole: `power()` deletes the grid third

The brief's longest paragraph is the grid: topological order, `vars.deps`/`dep0`/`dep1`, *"the
audit reads the use log"*, *"using one twice turns it back off"*. The Library brick
`dispatch(deps, costs, fleet)` exists to *"group the grid into waves and deal each wave out
across the fleet."*

All of it is defeated by:

```ts
for (const i of topologicalOrder) power(`sub-${i}`, "on");
```

Console, run 3:

```
2  power sub-0 -> true clock 2 fuel 108
...
16 power sub-3 -> true clock 16 fuel 94
✓ Leave every substation on          8/8   met
✓ Energise each station only after its feeders  met
```

**Sixteen ticks. Four fuel. No travel. No fleet. Both grid objectives, including the feeder
audit.** `power()` is documented as *"Sets a machine's state directly instead of stepping through
its cycle the way `use` does"* and takes any machine id anywhere in the world. The finale's
largest advertised sub-problem reduces to reading `probe`, sorting eight nodes by two edges, and
a loop.

This is the strongest "I solved it a way I suspect was not intended" moment I have had in a
puzzle game, and **the game did not acknowledge it in any way** — no line of flavour, no
objective variant, nothing. §A1 calls this the strongest positive signal available; here it is
worth nothing because it also removes a third of the level.

**Fix, cheapest first:** make the substation objective read the *use log* it says it reads —
i.e. require `use()` at the machine, or make `power()` fail on `node` machines, or price
`power()` at a distance-proportional tick cost. Any of the three restores the level. As shipped,
`dispatch` is a brick with nothing to hold up.

### 6.4 The cipher is not always a cipher

The brief spends a paragraph on a 95-key Caesar shift over printable ASCII plus a mod-1000
checksum, and on *"roughly a fifth of the traffic fails its checksum"*. On seed 1 the first
packet arrives as:

```
KD4470|CRATE|14|25|ore|743
```

Plaintext — the shift is 0 — and **all 16 packets passed the checksum**. 12 crates + 3 depots +
1 form = exactly 16, with nothing corrupt. A player who prints `raw[0]` before writing
`findKey` learns that on the seed in front of them, a paragraph of the brief was decoration.
Seed 0 should not be the identity shift, and if a fifth of packets are meant to be corrupt,
seed 1 should contain some.

### 6.5 What actually beat me: the fuel/pathing interaction, across seven seeds

Everything else in the level I solved. Signal decode: 40 lines, worked first time on every seed.
Crate logistics (group by class, nearest-neighbour tour, drop at the class sink): worked, 12/12
and 14/14. Airlock: 9 `use()` calls. The form: `pickup()`, carry, `drop()`.

What I could not make robust was **route the bot across an unknown 48×30 obstacle field on a
110-unit fuel budget, seven different times.** The pieces:

- The map is unknown. Pathing has to be optimistic-BFS-with-replanning, and an optimistic
  planner walks into pockets and pays fuel for it.
- `refuel()` only works on a **depot tile**, and — this took me two runs and is a genuinely nice
  trap — **the class sinks are not depot tiles.** `refuel at 11,22 -> false`; the depot is at
  (11,23), one tile south. So you cannot assume "I am at the depot I just delivered to,
  therefore I can refuel".
- The form leg is east, past the airlock, and the depots I had discovered were all west.

The result was **whack-a-mole across seeds**, and this is the finding that matters most:

| run | change | seed 1 | seed 2 | seed 3 |
|---|---|---|---|---|
| 6 | fuel-aware legs | **passed 449** | failed 116 | failed 100 |
| 8 | path-length reserves | **passed 365** | failed 483 (form) | failed 100 |
| 10 | robust airlock approach | **passed 367** | failed 537 (form) | failed 100 |
| 11 | single top-up, ordered sides | failed 424 (form) | **passed 425** | failed 100 |
| 12 | `look()` wall learning | failed 410 (8/12) | failed 475 | failed 571 |

**Every fix traded one seed for another.** Run 11 fixed seed 2 and broke seed 1 with a
three-line change. Run 12 — adding free line-of-sight wall learning, which should strictly
improve the planner — made everything worse, because `look()`'s stopping rule and my
"the tile past the beam is a wall" inference disagree, and I have no way to see which tiles the
engine thinks are walls.

That is the honest experience of `w8-05` as an AoC player: **the last mile is not a puzzle, it is
a robustness engineering problem against seven hidden test cases with a single pass/fail bit.**

### 6.6 Where I would have stopped if nobody were watching

**Run 11, around the 100-minute mark on this level.** I had just watched a three-line change move
the failure from seed 1 to seed 2 and back, with both failures reported as the same sentence,
and I could see that the remaining work was going to be an hour of guessing at a pathfinder I
cannot inspect. That is the point at which I would have closed it and not opened it again,
because the game had stopped asking me questions and started asking me to grind.

### 6.7 E2 — does the finale integrate or accumulate?

**Accumulate.** Solving one part never made another part easier — it made it *shorter*.
Concretely:

- The signal decode gave me crate coordinates. It did not help me get to them.
- The grid solution (`power` loop) is 100% independent of everything else; deleting it changes
  no other line.
- The crate tour and the form run share only the pathfinder.

The only genuine integration in the level is **fuel**, which couples routing to depot placement
to task ordering. That coupling is real, interesting and load-bearing, and it is the best idea in
`w8-05`. Everything else is bolted alongside it.

### 6.8 Should this level exist in this shape? No. Here is the shape I would ship.

The finale currently asks for one program that satisfies five independent objectives on seven
randomised maps, scored as a single bit. Genre data says almost nobody finishes that, and my own
run says the reason is not that any part is hard — **it is that the failure surface is the
product of five parts and seven seeds, and there is no partial credit anywhere in that product.**

Three changes, in order of value:

1. **Score the objectives independently.** Five objectives, five ticks in the results card, each
   with its own seed row. Let a player close the work order with the substations, the quota and
   the form on all seven seeds and *see* that they have three of five, rather than "still open".
   The engine already tracks per-objective progress (`8/12`, `9/9`) — it just refuses to bank it.
2. **Cut the seed count to three for this level, or make seeds an escalating ladder.** Seven
   randomisations of a 48×30 map is not seven times the confidence, it is seven times the
   whack-a-mole. Three seeds with visibly different *shapes* would test the same generality.
3. **Cut one of the five threads — the signal.** It is the one that is fully optional by the
   brief's own admission (*"None of this is required. The same facts can be found by walking"*),
   it duplicates World 6, and on seed 1 it is not even encrypted. Fold its content into `w6-04`
   and give `w8-05` the four threads that actually interact.

**And then give the airlock leg a checkpoint.** The narrative payoff — the two slots, the
termination form, the choice — sits behind a robustness problem, and it is the only part of the
game a player cannot see any other way.

### 6.9 E1 / H3 / H18 verdicts

- **H3 CONFIRMED, with a correction.** It is *not* primarily a code-volume problem: my working
  solution is ~200 lines, not 500, and reaching 4/5 objectives took 90 minutes. It is a
  **failure-surface problem**. The correction matters because the obvious fix (make it shorter)
  would not help; the fix is partial credit and fewer seeds.
- **H18 CONFIRMED.** Bronze on `w8-05` was not reachable for me in an evening, and I am the
  target player, working with free total reconnaissance and no fear of the API.
- **E1 — reachability: 1/5.** I did not reach the ending. I got four of five objectives on two
  of seven seeds after two hours and twelve runs.
- **E3/E4/E5: NOT REACHED.** I never saw the termination form, the two endings, or the message
  from 4470. Which is exactly the risk the shape carries.

### 6.10 Decisions versus lines — the ratio the rubric asked for

Distinct decisions I actually had to *make* on `w8-05`, exhaustively:

1. Read the world from `probe` rather than by walking.
2. Topologically order the substations.
3. Find the Caesar key by testing the magic header; validate with the checksum.
4. Group crates by class and tour each class before returning to its sink.
5. Realise that the class sink is not the refuel tile.
6. Realise that a sealed airlock must be treated as a wall by the planner.
7. Budget fuel per leg rather than per phase.

**Seven decisions. ~200 lines. ~28 lines per decision** — against §C1's flag threshold of 25. And
that is my *incomplete* solution; finishing it would raise the ratio, not lower it.

## 7. Keep / cut / merge — everything I played

Ranked by how confident I am.

### CUT

| level | why |
|---|---|
| **`w4-03` Left Hand on the Wall** | Byte-identical solution to `w4-02` took gold with 34% margin. It is `w4-02` with a different sprite. Its only distinct content is a sentence telling you the previous level's mechanic was unnecessary. |
| **`w2-03` Rotation** | Two lines different from `w2-02`. The stated new idea ("the mule drops you at a different corner") is `canMove(Dir.South) ? Dir.South : Dir.North`. That is a variation, not a level. |
| **`w1-04` Grid Reference** | The brief contains the formula. The level is transcription. If `pos()` needs a home, put it in `w1-03`. |

### MERGE

| levels | into |
|---|---|
| **`w1-01` + `w1-02`** | One opener. `w1-01` is four moves; `w1-02` is forty-five. Neither has a mechanism that distinguishes a loop from transcription, so together they are one level that currently occupies two. |
| **`w4-02` + `w4-03`** | One level: "the tunnels join up, get out". Keep `w4-02`'s loops. If `mark` must survive, give it a level where JS memory genuinely cannot help — a second bot reading a first bot's trail, which is what `mark` is actually for and what the reference panel says it is for. |
| **`w2-02` + `w2-03`** | One harvest level with the variable start corner from the beginning. |

### KEEP, unchanged

`w1-05` Floor Inspection (first level with a real shape), `w2-04` Capacity (best level in the
first twenty, and the only one that produced a re-solve), `w2-05` Harvest Quota, `w3-01` Pick
and Place, `w4-01` Headlamp, **`w4-04` Map First Move Second** (best level I played).

### KEEP, but fix

- **`w1-02`** — needs *any* mechanism that rewards the loop. Since character count is off the
  table: make it multi-seed with a variable corridor length, which turns transcription from
  suboptimal into impossible and costs one line of level config. This is the cheapest fix in the
  document.
- **`w4-04`** — the bonus must report what order you took and what the best order was.
- **`w8-05`** — see §6.8. Keep the level, change its scoring: independent per-objective credit,
  three seeds not seven, and close the `power()` hole. Cut the signal thread out of it.

`w3-02`–`w3-05`, `w4-05`, all of World 5, 6, 7 and `w8-01`–`w8-04`: **no verdict, not played.**

---

## 8. Scorecard

Scale: 1 broken · 2 weak · 3 adequate · 4 good · 5 exceptional. Criteria I could not reach are
marked NOT REACHED rather than guessed.

```
BOOTSTRAP DESIGN REVIEW — veteran/AoC tester — 2026-09-05
Sessions: 1   Total hours: ~4   Furthest level: w8-05 (4/5 objectives, 2/7 seeds, not closed)
Reason play stopped: ran out of session, not out of will — but see §6.6 for where I would
have stopped unpaid.

FIRST SESSION
  F1  Minute 0-5: loop closes                       [4]/5  First Run inside 30s of opening
      w1-01; first failure card said "Nothing was billed. Attempts are not recorded against
      you." Not 5 because the first thing on screen is a requisition modal, not a bot moving.
  F2  Minute 5-15: second idea + legible failure    [4]/5  w1-03's per-seed table plus "It
      passed on seed 7. The field is not always the same field."
  F3  Minute 15-30: reason to return                [2]/5  At minute 30 I had five golds, four
      commendations, and had not thought about anything. Nothing was outstanding.
  F4  Genre failure modes avoided                   [2]/5  Mode 3 (toolchain friction) hit hard:
      w4-03's shipped starter does not typecheck.

TEACHING CONTRACT
  T1  One concept per level, honoured               [2]/5  Worst offender w4-02: its concept
      (mark/readMark) is made redundant by REQUIRED READING printed one level earlier.
  T2  Stress points survive                         [2]/5  w1-02 fails outright (H1). w2-04 and
      w4-04 pass and are good. w8-05's grid stress point is bypassed entirely by power().
  T3  Lessons retained / reinforced                 [3]/5  w4-04's starter reinforces w4-02's
      Map idea; w8-05 assumes World 6's parsing without reminding you of it.
  T4  Documentation contract                        [5]/5  Named comparison: the hover for pos()
      gives signature, prose, the exact budget rule ("Free: costs no ticks, but still counts
      against the instruction budget") and an @example. TIS-100 gives you a PDF. The
      "Memory — REQUIRED READING" page is verbatim as specified and sits at w4-01, one level
      before World 4 needs it. I never hunted for a function that did not exist.

DIFFICULTY
  D1  Curve shape                                   [2]/5  Nine levels flat at 1-2/10, one spike
      at w2-04, then flat again. No wall in W1-W4; the risk is boredom.
  D2  Frustrating-not-hard levels                   [2]/5  2 of 17: w4-04's bonus (no model of
      the failure after 25 min) and w8-05 runs 11-12 (fixes that trade seeds, see §6.5).
  D3  Sawtooth reads as relief                      [ ]    NOT REACHED (w6-01 not played).
  D4  Curriculum numbers accurate                   [ ]    Deliberately not read.
  D5  Hour budget accurate                          [3]/5  W1+W2 took ~35 min of real play
      against a 40-min W1 budget alone. Fast — which is the complaint, not the compliment.
      w8-05 is budgeted inside a 6h World 8; I spent 2h10 and did not close it.

REWARD
  R1  Frequency                                     [3]/5  Densest cluster: w1-01's close fired
      a medal, four commendations and a next-order button in one modal. Longest gap: w2-01
      through w2-03, three levels with nothing but the same gold card.
  R2  Signal vs. noise                              [2]/5  First reward dismissed unread: the
      publish offer at w4-04, because it was 19 checkboxes. The commendation system never once
      changed what I did.
  R3  Variety and escalation                        [2]/5  "Under par. Par has been adjusted."
      seen at w2-02 and again at w2-03, one level apart. "Bonus met. There is no bonus. There
      is a star." on eight consecutive levels. A World 8 result card is worded identically to
      a World 1 one.
  R4  Competence returned per world                 [3]/5  W1: NONE. W2: resource cycles under
      a shared capacity constraint. W3: cheap reconnaissance. W4: survey/BFS/TSP — yes.
      W8: NONE, because I did not close it.

REPETITION
  C1  Code-to-insight ratio                         [2]/5  Worst: w4-03, ~30 lines and ZERO
      insights (I pasted w4-02's file unedited and golded). w8-05: ~28 lines per decision on an
      incomplete solution (§6.10), against the flag threshold of 25.
  C2  Chore shapes present                          [2]/5  Retyping: the same BFS-over-an-
      adjacency-Map in w4-02, w4-03, w4-04 and w8-05. Difficulty-that-is-really-tuning: w4-04
      and w8-05 runs 8-12, where >50% of my runs came after I already knew the answer.
      Re-running for seeds: 4 times on w8-05 without changing my model.
  C3  Bonuses absorb ambition                       [2]/5  Eight consecutive World 1-2 bonuses
      met by accident on the first honest run. w4-02's "fewer than 180 marks" met with zero.
      Grind bonus: none. Dead bonus: most of them.
  C4  Novelty across worlds                         [2]/5  W1-W5 are all movement on a grid.
      At the end of World 3 my written expectation of World 4 was "more of this on a different
      sprite sheet", and for w4-01 through w4-03 that was correct.

FEEDBACK
  Q1  Failure is actionable    A:14 B:3 C:3 D:0 E:1 [4]/5  The A count is genuinely high and
      the messages are the best thing in the game — see below. The three Cs: w4-04's bonus
      (x2) and w8-05 run 12. The E: w4-03's non-compiling starter.
  Q2  Fault attribution clear                       [4]/5  One ambiguous case (w4-04's bonus).
      "Out of charge. Recovery has been scheduled for a date to be confirmed." followed by
      'Bot #0 ("KD-80") ran out of fuel attempting move: it needs 1 and has 0. Fuel is restored
      by refuel() while parked on a depot tile.' is a model error message.
  Q3  Line-number fidelity (3 tests)                [ ]    NOT TESTED.
  Q4  Trace legibility (4 checks)                   [2]/5  w8-05: PRESENT-BUT-UNREADABLE — a
      48x30 map in ~375px, where I could not tell a crate from a substation from a wall. The
      other three checks NOT REACHED.
  Q5  Multi-seed failure legible                    [5]/5  Per-seed rows with pass/fail and tick
      counts, plus a named diagnosis. Named comparison: AoC tells you "that's not the right
      answer"; this tells you which of seven inputs broke and how far it got.
  Q6  Halt cases + no soft-lock                     [ ]    NOT TESTED.

OPTIMIZATION
  O1  Engagement vs. anxiety                        [2]/5  Engagement once in 17 levels (w2-04,
      and I acted on it: 63 -> 47). Indifference on 13. Indifference at gold is a failure by
      O1's own rule.
  O2  Somewhere to be good                          [1]/5  Never, in 17 levels. One axis, and
      par set at the obvious solution's cost, means every honest solution lands on the same
      number. The unused second axis (withinSenses / "MINIMAL OBSERVATION") appears as a
      commendation but no level I played used it.
  O3  Par credibility                               [2]/5  Six consecutive exact-par golds
      without aiming (w1-01 6/6, w1-02 45/45, w1-03 24/24, w1-04 16/16, w1-05 50/50,
      w2-01 18/18). Worst par: w8-05's 1300 against a 3000 shift, where my incomplete
      single-bot run was at 425 — the tick axis is dead on the finale, which is scored on
      whether it runs at all.
  O4  The Library                                   [3]/5  Regression tab is a 5, publish dialog
      is a 1. See §5.
  O5  Layer conflict                                [3]/5  No conflict observed. Importing
      key/ahead/compass into a DFS that calls them thousands of times cost nothing measurable
      (236 ticks against par 391), which contradicts both the Repository memo and the README.

AGENCY
  A1  Solutions feel owned                          [4]/5  Yes from w2-04 onward. Strongest
      signal: the w8-05 power() route, which the game did not acknowledge (§6.3).
  A2  Solution space breadth                        [2]/5  Single-solution levels: w1-01, w1-02,
      w1-04, w2-02, w2-03. Five exercises in the first ten levels. Many-solution: w4-04, w8-05.
  A3  Starters constrain appropriately              [4]/5  w4-04's typed Map + key() removes the
      representation question and keeps the algorithm question. Better scaffolding than any
      Zachtronics title offers, which is none. Docked one for w4-03's broken starter.
  A4  Something to show someone                     [2]/5  The w4-04 replay of a bot walking a
      computed optimal circuit through a cave it mapped itself. There is no way to export it,
      and at w8-05 scale the renderer is unreadable anyway.

ENDING
  E1  Reachable                                     [1]/5  2h10, 12 runs, ~200 lines, 4/5
      objectives on 2/7 seeds. Not closed. See §6.
  E2  Integrates rather than accumulates            [2]/5  Only fuel couples the threads; the
      grid third is fully separable and in fact removable (§6.3, §6.7).
  E3  Plants noticed and paid off        0/7 noticed [ ]   NOT REACHED. I noticed three plants
      going in — Appendix C at w4-01, "CC: CONTRACTOR #4470" on the Repository memo, and the
      NOTE(4470) comments in starters from w1-03 onward — and saw none of them pay off.
  E4  The choice lands                              [ ]    NOT REACHED.
  E5  Afterwards                                    [ ]    NOT REACHED.
```

## 9. Hypothesis verdicts

| # | verdict | evidence |
|---|---|---|
| H1 | **CONFIRMED** | 45 literal `move()` calls on `w1-02` scored gold + star + full marks. Nothing in the UI preferred the loop. |
| H2 | **NOT REACHED** | `w8-01` seeded, not played. |
| H3 | **CONFIRMED, with a correction** | It is not a code-*volume* problem — my working solution is ~200 lines, not 500. It is a failure-*surface* problem: five objectives × seven seeds × one pass/fail bit. See §6.5, §6.9. |
| H4 | **NOT REACHED** | World 7 seeded, not played. I read the multi-bot API but never used `sync`, `send`, `recv` or `spawn` in anger — my `w8-05` attempt used one bot. |
| H5 | **REFUTED** | I silvered `w2-04` (63), immediately went back, and golded it (47). The `RECORD 47 ~~was 63~~` card is why. |
| H6 | **REFUTED** | All four `w4-04` mitigations shipped: typed `Map<string,string[]>`, `key(x,y)`, `NOTE(4470)` voice, and a `TODO(4470)` pointing at the trick. Time-to-first-run under two minutes. |
| H7 | **NOT REACHED** | Single session. |
| H8 | **CONFIRMED** | O2 scores 1/5. In 17 levels there was never a dimension on which a solution was notably good. The antagonistic second axis exists as a commendation ("MINIMAL OBSERVATION") and no level I played used it. |
| H9 | **REFUTED, emphatically** | The Regression tab's wording — *"Your record is unchanged. It will stay unchanged until you say otherwise — a result is not withdrawn because a later edit disagreed with it"* — defuses the anxiety completely. My unreasoned first reaction was relief. See §5. |
| H10 | **REFUTED** | Per-seed rows plus *"It passed on seed 7. The field is not always the same field."* A non-programmer would understand it. |
| H11 | **PARTIAL** | I stopped reading medal flavour at `w2-03`, where *"Under par. Par has been adjusted."* repeated one level after first appearing. I never stopped reading briefs — they carry load-bearing information (e.g. `w8-05`'s checksum rule). |
| H12 | **CONFIRMED** | At the end of World 3 my written expectation of World 4 was "more of this on a different sprite sheet". For `w4-01`–`w4-03` that was exactly right; `w4-04` broke it. Worlds 1–5 are entirely movement on a grid and the first non-movement world is eight hours in. |
| H13 | **NOT TESTED** | Warm cache throughout. |
| H14 | **NOT REACHED** | `w3-03` seeded. |
| H15 | **NOT REACHED** | `w5-05` seeded. |
| H16 | **NOT REACHED** | `w6-04` seeded. `w8-05`'s equivalent brief *does* state both the keyspace (95) and the magic header (`KD4470`) plainly, which is the right shape. |
| H17 | **NOT TESTED** | I never revealed a hint. In 17 levels I did not press "Request hint" once — which is its own finding: the hints are invisible to a player who is not stuck, and I was only ever stuck on things a hint would not have covered (a bonus with no diagnosis, and a pathfinder). |
| H18 | **CONFIRMED** | See H3/E1. Two hours ten, twelve runs, four of five objectives, two of seven seeds. |

---

## 10. The five concrete problems, ranked by players lost

1. **Worlds 1–2 are a nine-level plateau that an experienced player clears at exact par without
   thinking.** Nine golds, eight of them on the first honest run, one moment of thought. This is
   where a real player like me closes the tab. Everything else in this document is downstream of
   the fact that the game's best material starts at level 16.
2. **`w8-05`'s `power()` hole deletes a third of the finale**, including the only reason
   `dispatch` exists in the Library ladder (§6.3).
3. **`w8-05` has no partial credit across five objectives and seven seeds**, so the last mile is
   robustness grinding rather than puzzle solving, and the entire narrative payoff is behind it
   (§6.5, §6.8).
4. **The publish extractor silently truncates expression-bodied multi-line arrow functions**,
   committing a syntactically invalid `lib.ts` and breaking a closed work order. The Regression
   tab caught it; nothing else did (§4.2).
5. **`w4-02` and `w4-03` are the same level**, and `w4-02`'s subject (`mark`/`readMark`) is made
   redundant by required reading printed one level earlier, with a bonus that is satisfied by
   ignoring it (§2a, §2b).

Honourable mentions: `w4-03`'s starter does not typecheck; `w4-04`'s bonus fails without a
diagnosis; the publish dialog offers 19 checkboxes at realistic solution size; the trace renderer
is unreadable at finale scale.

---

## 11. The three things

1. **The one change that would most improve this game: cut the first nine levels to four and put
   a skip door on the site map.** The ceiling is real — `w4-04` and `w8-05`'s fuel-coupled
   logistics are worth an evening each. The climb to it is nine levels of transcription that
   score exact par by accident, and the game's own best reward (the `RECORD n ~~was m~~` card)
   structurally *cannot fire* until a level is hard enough to be failed once. Every level you cut
   from World 1 moves that card earlier.
2. **The most likely single reason a real player stops: boredom at `w2-02`/`w2-03`**, having
   taken gold on the first run seven or eight times in a row and correctly concluded that the
   number is not measuring them. The second most likely is `w8-05` run 11, when a three-line
   change moves the failure from one seed to another and back.
3. **The best thing about it, which must survive fixing 1 and 2: failure.** Free, per-seed,
   named, and specific — *'Bot #0 ("KD-80") ran out of fuel attempting move: it needs 1 and has
   0. Fuel is restored by refuel() while parked on a depot tile. Kessler & Daughters does not
   operate a recovery service.'* — plus a regression report that tells you what broke while
   explicitly refusing to take your medal away. Every one of those is better than the genre
   standard, and none of them depends on the early levels being gentle.

---

## 12. Would I recommend this to another Advent-of-Code player?

**Yes, with an instruction: import a save that starts you at World 4.**

Unqualified, no. I would lose them in World 2. With that one sentence attached, yes — `w4-04`
is a better-scaffolded version of a problem I would happily solve in December, the failure
reporting is better than anything in the genre, and the Regression tab is a genuinely new idea
that Zachtronics never had. But I would also tell them the ending is not currently reachable in
an evening, and that they should not plan their week around seeing it.
