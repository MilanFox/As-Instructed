# BOOTSTRAP — Curriculum

Companion to `docs/DESIGN.md` §5–§6 (DESIGN.md wins any conflict). No solutions or solution
code — reference solutions live in `src/levels/**/__solutions__/` as test fixtures.
Anti-hardcode rationale and exact per-level randomization live in each level's own source file,
not here.

33 levels ship. Ids are non-contiguous within a world by design — `w1-02, w1-04, w2-01, w2-03,
w3-03, w3-05, w4-03` do not exist; the gaps are normal, not missing content.

---

## 2. Global Rules for Level Authors

1. One `teaches` concept per level, one sentence.
2. `anti-hardcode` names a specific randomized axis, never "it's random". Sole exception:
   `w1-01` — single-seed, a memorized path is the intended solution (§3).
3. Every seed list includes ≥1 degenerate case: empty/one-element set, index 0, index n−1,
   depth 1, one bot, key = 0.
4. Par = reference ticks − ~10%, from the level's named heuristic, never an optimal solver —
   `w5-04`/`w5-05`/`w7-04` derive par from FFD / Prim-or-Kruskal / LPT, from the *median* seed.
5. Never require optimality — "good enough that the naive approach fails".
6. A failing run must be legible from the trace alone.
7. `heritage` (the textbook algorithm) never appears in player-facing text.
8. A bonus absorbs ambition ("do it properly"), never grind ("do it 50 times").
9. An objective grading printed/text output diffs against the expected value, never reports a
   bare count.
10. A level never requires identifying an in-world object by a property it doesn't expose to
    the player.
11. A hint budget that spends most of its hints restating one idea is a smaller hint budget than
    it looks — spread hints across distinct blockers, not repetitions of one.

**Information budget** (`Objectives.withinSenses`, DESIGN.md §7): use only where sensing itself
is the puzzle (`w5-02`) or re-sensing substitutes for remembering (`w8-01`). Omit where the
sensor is local (World 3), re-sensing is already the level's resource (`w4-01`, `w4-02`), the
level is on the Frustration Watch (§11), or rationing would punish the better answer (`w5-03`,
`w8-03`).

---

## 3. World 1 — Boot Sector
Unlocks `move` `pos` `canMove` `print` `wait`. `print` is scored only in `w6-01`.

| id | teaches | seeds | diff | bonus |
|---|---|---|---|---|
| w1-01 | Issuing an action; coordinates (x East, y South, North = y−1); counted `for` loop | 1 — declared hardcode exception (§2 rule 2) | 1 | none |
| w1-03 | Conditional repetition on `canMove` | 3 | 2 | zero blocked moves |
| w1-05 | Nested iteration over an area of unknown row/column count | `[21,1,2,6,8]` | 4 | ≤1 move per floor tile |

`w1-01`'s route is 78 tiles inside a 90-tick booking — tight enough that typing every `move()`
longhand still passes; intentional.

---

## 4. World 2 — Regolith Fields
Unlocks `scan` `harvest` `plant` `inventory`. `seeds.length >= 3` mandatory from here on.

| id | teaches | seeds | diff | bonus |
|---|---|---|---|---|
| w2-02 | Two-phase per-cell cycle; the world goes stale the instant you act on it | 4 | 3 | waste no swing or seed |
| w2-04 | Interrupt/resume a traversal against a resource read at runtime | 4 | 6 | zero failed harvests |
| w2-05 | Prioritise under a deadline; the sensor reaches further than the wheels | 5 | 7 | fill hopper on ≤32 tiles walked |

`w2-02` needs the renderer's growth-stage overlay or a correct program looks idle. `w2-05`'s
shift is 62 ticks, par 60, on a 72-tile field — deliberately tight.

---

## 5. World 3 — The Sorting Yards
Unlocks `pickup` `drop` `carrying`.

| id | teaches | seeds | diff | bonus |
|---|---|---|---|---|
| w3-01 | `pickup`/`drop`/`carrying` — one carry slot | 3 | 2 | par ticks, zero failed pickups |
| w3-02 | A lookup table read from the world, never hardcoded | 4 | 4 | beat par by 10% |
| w3-04 | Order-preserving processing — a FIFO queue, not nearest-first | 4 | 6 | zero rejected drops |

---

## 6. World 4 — Cave Systems
Unlocks `look` `mark` `readMark`.

| id | teaches | seeds | diff | bonus |
|---|---|---|---|---|
| w4-01 | Local sensing (`look`) vs. knowing the map | 3 | 3 | never re-enter a tile |
| w4-02 | External memory: `mark`/`readMark` as a visited set | 4 | 5 | solve with fewer than *N* marks |
| w4-04 | Separate exploration from execution: build a graph, then plan over it | 4 | 7 | visit 3 points in optimal order |
| w4-05 | Online exploration under a shared fuel budget | 5 | 8 | return with ≥20% fuel unspent |

`w4-02`'s replay must visibly show the bot looping when the `w4-01` rule fails to stop — the
loop is the lesson. `w4-04` is on the Frustration Watch, §11.

---

## 7. World 5 — The Grid
Unlocks `probe` `use` `power` `link`.

| id | teaches | seeds | diff | bonus |
|---|---|---|---|---|
| w5-01 | Preconditions: read the feed direction before driving it | 3 | 3 | zero failed `power()` |
| w5-02 | Binary search over a probe budget | 5, incl. break at 0 and n−1 | 4 | ≤8 probes every seed |
| w5-03 | Topological sort of a dependency graph | 4, incl. a deep chain, a wide-shallow graph, a 3-prerequisite node, 2 disconnected components | 6 | valid order + min travel + ≤20 probe reads (a retry-until-stable loop passes — already priced in ticks) |
| w5-04 | Assignment under capacity; item order decides whether greedy works | 5 | 7 | leave the largest feeder unused |
| w5-05 | Minimum-cost network construction (MST) | 5, incl. a clustered and a near-uniform point set | 8 | within 2% of true MST weight |

`w5-05` is on the Frustration Watch, §11.

---

## 8. World 6 — Deep Signal
Unlocks `receive` `transmit` `decode`.

| id | teaches | seeds | diff | bonus |
|---|---|---|---|---|
| w6-01 | Drain a queue; handle empty without crashing | 3, incl. an empty-queue seed | 2 | none |
| w6-02 | Validation: checksum, compare, reject | 4, incl. a zero-corrupt and a first-packet-corrupt seed | 4 | report the wrong byte |
| w6-03 | Decode a compressed (RLE) instruction stream | 4 | 5 | transmit a shorter RLE of your own route |
| w6-04 | Brute-force key search against a checkable property | 4, incl. key = 0 | 7 | recover a key via frequency analysis |
| w6-05 | Parse a nested (recursive) grammar | 5, incl. a depth-1 seed | 8 | repair one corrupt group via redundancy |

`w6-01` sits at difficulty 2 directly after `w5-05`'s 8 — the steepest drop in the game and
deliberate; no bonus, no added complexity. `w6-04` is on the Frustration Watch, §11.

---

## 9. World 7 — Swarm
Unlocks `bots` `spawn` `sync` `send`/`recv`. Score is `max(bot.clock)` — makespan — on every
level here.

| id | teaches | seeds | diff | bonus |
|---|---|---|---|---|
| w7-01 | Parallel clocks: makespan, not the sum | 3 | 3 | gold via one shared loop body for both bots |
| w7-02 | Static partition by work, not area, unknown worker count | 4 | 5 | makespan within 10% of `total_work / N` |
| w7-03 | Mutual exclusion — "retry if blocked" is a livelock, not a delay | 4, incl. a 2-bot seed | 7 | zero blocked moves |
| w7-04 | Dynamic scheduling: assign the next job to the earliest-free worker | 5, incl. a near-uniform and a heavily-skewed distribution | 8 | makespan within 4/3 of the load lower bound |
| w7-05 | Message passing: a scout publishes findings, workers consume live | 5 | 9 | workers idle under 10% of makespan |

`w7-01`'s replay must render both bots moving concurrently, never serialised. `w7-03` is on the
Frustration Watch, §11.

---

## 10. World 8 — The Kessler Contract
No new hardware.

| id | teaches | seeds | diff | bonus |
|---|---|---|---|---|
| w8-01 | Optimisation as its own skill: ticks and the information budget both gate | 4 | 5 | close in 136 ticks; survey on 10 beams |
| w8-02 | Pipeline composition: explore/route/deliver without leaking the seams | 5 | 8 | deliver ≥half the crates before exploration ends |
| w8-03 | A topological order is a *partial* order — independent branches run in parallel | 5 | 9 | match critical-path makespan; restart plan on ≤26 probe reads |
| w8-04 | Reconcile a decoded plan against observed reality | 5, incl. a zero-drift and a heavy-drift (>⅓ stale) seed | 9 | complete without re-exploring any correctly-described section |
| w8-05 | Integration exam: everything at once, on the same fleet and fuel | `[1,4,7]` | 10 | see below |

`w8-01`'s shift is 215 ticks (par 165), survey budget 16 beams — a fully-correct full-field
sweep spending zero beams still overruns the shift by 5–40 ticks; that tension is the level.

`w8-05`: the airlock draws power from the feeder DAG's most-downstream substation; every
substation is hand-operated (no desk `power()`). Manifest is plain. Must be beatable at bronze
by a slow, honest program — only gold is meant to bite. Seeds `1`/`4`/`7` are three authored
instances, not a draw: general case; a pure chain with no parallelism (spare fleet capacity goes
to crates); the squeeze (fuel runs out before scheduling does). Bonus, two stars, both free in
ticks, graded on the worst seed: `name-the-hold` (print `held <station> <n>` — longest gap
between a station's last feeder going live and its own first `use()`) and `mind-the-gate` (print
`gate <station> <n>` — how long the airlock stood powered before anyone used it).

---

## 11. Frustration Watch
These constants and behaviours look like mistakes. They are deliberate — do not "fix" them.

- `w4-04`: starter ships a typed `Map<string,string[]>` + `key(x,y)` helper; tick budget allows
  one wasteful exploration pass. Required scaffolding, not slack to tighten.
- `w5-05`: cable budget carries an 8% margin over true MST weight; verdict draws laid cable
  against best-possible weight. Remove either and an MST failure becomes illegible.
- `w6-04`: brief states the keyspace (≤256) and the magic-header target outright. Without this a
  player concludes the puzzle has no answer instead of that it wants brute force.
- `w7-03`: dedicated `LivelockError`, not a generic timeout; opens on a 2-bot seed. Never
  pre-teach "livelock" in `w7-02`'s brief — it must land cold in `w7-03`.

---

## 15. Seed Policy

1. `seeds.length >= 3` from World 2 on.
2. Seed 1 is the friendliest instance — a player's first honest idea works or nearly works.
3. Every seed list includes ≥1 degenerate case (see the per-level tables above).
4. Seed 1 runs first in the UI; a run stops on first failure.
5. A seed differing from another only in its numbers, not a decision, is padding — remove it.

---

## 16. Reusable Routines (the Brick Ladder)
A routine belongs here only when more than one level calls it. Reuse is optional for
players — every level below is solvable writing the logic inline.

| Routine | Earned in | Called by |
|---|---|---|
| `survey(b?)` | `w4-04` | `w4-05`, `w7-05`, `w8-02` |
| `pathTo(x,y,b?)` — costs ticks | `w4-04` | `w4-05`, `w7-02`, `w7-05`, `w8-01`, `w8-02`, `w8-03` |
| `waves(deps)` | `w5-03` | `w5-05`, `w8-03` |
| `unpack(route)` | `w6-03` | `w6-05`, `w8-04` |
| `findKey(packets)` | `w6-04` | `w6-05`, `w8-04` |
| `deal(costs, fleet)` | `w7-04` | `w7-05`, `w8-03` |
| `reach(x,y,b?)` = `survey` + `pathTo` | `w8-02` | `w8-04`, `w8-05` |
| `dispatch(deps,costs,fleet)` = `waves` + `deal` | `w8-03` | `w8-05` |

Earning levels never import the routine they exist to teach. `pathTo(x,y,b?)` takes an optional
trailing `Bot` argument for multi-bot use from `w7-02` on; earlier single-bot callers omit it.
