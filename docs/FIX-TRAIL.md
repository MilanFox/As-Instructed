# FIX — the visited-tile trail

`docs/OPEN-ITEMS.md` defect 2 / `docs/FIX-PROSE.md` finding 4: **`w4-02`'s designed failure is
invisible.** The level's whole argument is that a naive tunnel-follower rides a closed circuit
until the shift ends, and the replay drew no evidence of it. The bot moved; nothing said it had
been there before.

Branch `worktree-agent-a821e9af07425cc55`, worktree from `main` at `d08dc45`. Main was merged
twice more mid-flight — once for the `power()` engine fix, once for the par recalibration. Both
merges were clean; neither touched `src/render/**`, and the only overlap was DESIGN.md §11 A5,
which git resolved without help.

---

## 1. The design question, answered with measurement rather than taste

The brief left three calls open: *that* a tile was visited versus *how often*; always-on versus
opt-in versus a toggle; and which hue carries it. All three collapse into one number once you
measure how much revisiting actually happens, so I measured it before writing any renderer code.

Two throwaway probes (`src/render/__tests__/__probe*.test.ts`, deleted before commit) compiled a
`TraceTimeline` for every reference solution on every seed and counted arrivals per cell. The
census is a *visit histogram*: how many tiles were stood on once, twice, three times, and so on.

### The reference solutions

| level | seed | cells | visit histogram |
| --- | --- | --- | --- |
| `w4-01` | 1–3 | 49–53 | `1x` only — **max heat 1, nothing is ever revisited** |
| `w4-02` | 1 | 103 | `1x:94 2x:8 3x:1` |
| `w4-02` | 2 | 156 | `1x:108 2x:47 3x:1` |
| `w4-02` | 3 | 156 | `1x:79 2x:73 3x:4` |
| `w4-02` | 4 | 127 | `1x:75 2x:52` |
| `w4-04` | 2 | 376 | `1x:103 2x:106 3x:89 4x:58 5x:17 6x:3` |
| `w4-05` | 4 | 210 | `1x:13 2x:185 3x:12` |
| `w3-01` | 1 | 36 | `2x:5 3x:2 4x:20 5x:4 6x:5` — every tile revisited |
| `w8-02` | 3 | 211 | `1x:74 … 10x:8 11x:1 15x:1` |

### The `w4-02` naive tunnel-follower — the run this defect is about

Driving `w4-02` with the `w4-01` rule (take any passable neighbour that is not the one you came
from; reverse only at a dead end) until the 1600-tick budget halts it:

| seed | cells | visit histogram |
| --- | --- | --- |
| 1 | 65 | `13x:2 **25x:62** 26x:1` |
| 2 | 65 | `1x:32 2x:4 28x:2 55x:6 **56x:21**` |
| 3 | 40 | `1x:22 56x:6 57x:2 **113x:10**` |
| 4 | 53 | `15x:1 16x:1 30x:10 **31x:41**` |

**Sixty-two of sixty-five tiles, stood on twenty-five times each.** On seed 3, ten tiles stood on
a hundred and thirteen times.

### What that settles

1. **How often, not whether.** A binary "visited" trail would paint the correct `w4-02` solution
   and the failing one *identically* — both cover roughly the same cave. The entire difference
   between passing and failing this level lives in the visit *count*, so the count is what the
   trail has to draw. A trail that saturates after one visit shows nothing here at all.

2. **Always-on, with no level flag, no opt-in and no toggle.** This was the call I expected to
   have to fudge, and the numbers make it free. There are three regimes and they do not overlap:

   - `w4-01`, `w1-01`, `w2-02`, `w2-05`, `w5-01`, `w7-01` — max heat **1**. A trail that only
     draws revisits renders *literally nothing* on these. `w4-01` is a perfect control: the
     player sees a clean untouched cave, then plays `w4-02` and sees it burn.
   - The honest working solutions — `w4-02` correct at **2–3**, `w4-05` at **2–3**, `w4-04` at
     **2–6**, `w3-01` at **2–6**. A quiet wash. This is not noise; these are levels where
     re-walking ground is the method, and showing it faintly is true.
   - The designed failure — **25 to 113**.

   An absolute intensity ramp whose ceiling sits around 10 therefore separates them by itself.
   The trail is loud exactly when there is something to be loud about, which means it needs no
   per-level configuration to behave — and that matters practically too, since `src/levels/**` is
   held by another agent and a `LevelDef` flag was not available to me.

3. **Two existing hues, no new accent.** `palette.bgVoid` (`#0a0e14`) at the cold end and
   `palette.danger` (`#ff5d5d`) at the hot end, interpolating between. `danger` is already the
   game's failure hue (it is what `drawBlockedTell` uses), so red *is* the existing colour for
   "this went wrong" and I did not have to invent one. I deliberately did **not** route the ramp
   through `palette.accent2` amber, which would have read as a smoother heat gradient: amber is
   `overlay.goal`, and a mid-heat floor wash the same colour as the objective brackets is the one
   confusion this level cannot afford.

   The cold end was `palette.inkDim` in the first draft and had to change. See §7 — it is the one
   thing on this list that only the browser could have told me.

4. **Rejected: normalising heat against the run's own maximum.** Elegant, and it would auto-tune
   per level — but it changes meaning as the playhead advances, so scrubbing backwards would
   *cool* tiles that had been hot, and it would hide genuine waste on a run where the waste is
   uniform. Absolute counts survive scrubbing and mean the same thing on every level.

5. **Rejected: adding the count to the hover readout.** `RendererOptions.onHover` /
   `readoutAt()` / `TileReadout` exist, but `grep -rn onHover src/` outside `src/render/` returns
   nothing — **the hover readout has no consumer in the UI today**. Adding a `visits` field would
   have been invisible. Noted below as something for whoever revives that plumbing.

6. **Marks versus trail — the distinction the level is about.** A mark is a small rounded chip
   with text, drawn in `palette.accent` teal at `y + 0.28` (`drawMark`). The trail is a full-tile
   floor wash running dark-to-red, drawn under everything. Different shape, different position,
   different hue family, and the trail is under the mark rather than over it, so a marked tile
   that has also been walked shows both. *A mark you placed* and *a tile you walked* stay two
   readable things.

---

## 2. The change

Three files touched, one added. No panel moved, no UI control added, no dependency, no engine or
level change.

### `src/render/trail.ts` (new)

`VisitTrail` — built from a `TraceTimeline`, which is what the replay already compiles at
`setTrace`. Every successful `move` segment contributes an *arrival* `(t1, cell)`; each bot's
start cell contributes one at `bornAt`. The arrivals are sorted once into two typed arrays
(`Float64Array` ticks, `Int32Array` cells) and that is the whole data structure.

- `sync(tick)` walks the arrival list forwards, incrementing a `Uint16Array` of per-cell counts
  and pushing a cell onto the draw list the first time it reaches 2. A backwards seek refills the
  counts with zero and replays — the same bargain `refreshSnapshot` already makes for the world
  snapshot, and for the same reason.
- `draw(ctx, tilePx, range)` fills each in-view hot cell with `RAMP[min(count, 10)]`.
- `visitsAt(x, y)` and `hotCount` exist for tests and for whoever revives the hover readout.

**No trace field was needed.** The visited set is entirely derivable from what the replay already
draws — the bot's arrival tick and destination per move — so nothing was proposed for
`src/engine/**`.

### `src/render/theme.ts`

One export added: `mix(from, to, t)`, a linear blend between two palette entries. The file's own
rule is "nothing in `src/render/` may hardcode a colour literal — if a shade is missing, add it
here", and a nine-step ramp between two existing hues is exactly that case.

### `src/render/renderer.ts`

A `trail` field built alongside `timeline` in `setTrace`, and two lines in `frame()` between the
terrain blit and `drawGrid`. That slot is deliberate: the grid stays legible over the wash, and
conveyors, crops, machines, **marks**, ground items, particles and bots all draw after it.

### `src/render/index.ts`

Re-exports `VisitTrail`, `TRAIL_MIN_VISITS`, `TRAIL_MAX_VISITS`, `trailFill`, `mix`.

---

## 3. What it costs

Measured against the campaign's worst cases from the census in §1.

**Per frame:** one pass over the hot list, one `fillRect` per in-view revisited cell, and a
`fillStyle` write only when the heat changes between neighbours. The hot list is bounded by the
*grid*, not by the tick budget — a cell appears in it once however many times it is walked. The
worst case in the campaign is `w8-05` seed 7 at **351** cells on a 48×40 grid; `w4-02` is at most
77. 351 flat `fillRect`s is well under the cost of the existing per-frame particle pass, and it is
**zero** on every level whose solution never doubles back.

**Per tick of playback:** one increment. The advance is incremental and never re-scans.

**Per backwards-scrub frame:** `Uint16Array.fill(0)` over `w × h` (1920 entries on `w4-02`, 1920
on a 48×40) plus one increment per arrival up to the new tick (≤ 1601 on a budget-halted `w4-02`
run). Tens of microseconds, and only on frames where the playhead actually moved backwards.

**Allocation:** none per frame. The ramp is nine `rgba()` strings built once at module load
through the existing memoised `alpha()`; the counts array and the two arrival arrays are allocated
once per `setTrace`.

No full redraw per tick was introduced — the terrain layer cache and its revision-based
invalidation are untouched, and the trail draws *over* the blit rather than into it.

---

## 4. DESIGN.md §11 A5 — the fourth bullet

A5 already made RENDER responsible for two visuals a level's teaching depends on (plant growth
stages; simultaneous bots and a visibly distinct blocked move). This is the same family and now
the same list. Added, in A5's voice — a requirement naming the level that needs it, not an
implementation note:

> - RENDER must show *how often* each tile has been stood on, not merely that it has. `w4-02`'s
>   designed failure is a naive walker riding a loop until the shift ends, and a trail that
>   saturates on the first visit draws the failing run and the passing one identically.

The heading count moved from "Three cross-cutting requirements" to "Four".

---

## 5. The sibling requirement — `w7-01` / `w7-03`

Checked as instructed. **Both halves of A5's second bullet are already implemented**, and well.
Nothing to fix and nothing to list:

- *All bots simultaneously with per-bot clocks* — `TraceTimeline` compiles one segment list per
  bot and `poseAt` is independent per bot, so two bots at different clocks are legitimately at
  different points in their animations on one frame. `src/render/timeline.ts` cites A5 in its
  header.
- *A blocked move drawn visibly differently from a successful one* — three independent tells, not
  a tint. `timeline.ts` gives a blocked move a **different segment shape** (`bumpCurve`: a lunge
  into the obstruction and a hard stop, never leaving the origin cell) rather than a translation.
  `sprites.ts:drawBlockedTell` adds a red rim, an impact chevron on the face that was hit, and a
  `!` that outlasts the impact and hops while the bot collects itself.
  `fx.ts` case `'blocked'` throws hard white sparks against the bump direction plus an expanding
  red ring on the wall.

**The `w7-03` livelock is therefore seen, not inferred from a tick count.** `Sim` trips
`LivelockError` after `DEFAULT_LIVELOCK_ROUNDS = 8` all-bots-blocked rounds (DESIGN §11 A6,
`src/engine/sim.ts:1057`), which means the replay shows every bot in the tunnel lunging,
recoiling, flashing red and banging for eight consecutive rounds *before* the failure lands.

One unplanned bonus: the trail lights `w7-03` up too. Its *reference* solution reaches heat 8–18
with every cell revisited, because a one-tile aisle shared by up to six haulers means constant
re-walking — so the level's "right of way" argument now has a floor picture as well as a tick
count. It stays orthogonal to `w7-03`'s bonus objective (`blockedMoves(...) === 0`): a blocked
move produces no arrival and therefore no heat.

---

## 6. Verified in the browser

Dev server on `:5199` in this worktree, driven in Chrome. Save seeded through `localStorage` with
all 34 work orders closed and a program planted on `w4-02`, so the level opens with the code
already in the editor and one click runs it.

Both `docs/FIX-VIEWPORT.md` §4 traps bit again and are worth restating: `resize_window` still does
nothing here, and the driven tab reports `document.hidden === true`, so **Chrome suspends RAF**.
A `requestAnimationFrame` inside injected JS never resolves — it timed out the CDP call at 45s —
and the canvas holds whatever the last forced frame drew. Every measurement below was taken by
setting the scrub position, *then* taking a screenshot to force a frame, and reading only that
image. A third trap to add to the list: **Vite HMR of a `src/render/**` module does not reliably
reach a hidden tab's already-mounted renderer.** Two full minutes went into "the trail is broken
at low tick counts" that was a stale module; a hard reload fixed it, and the offline probe had
already proved the data was right.

### The naive tunnel-follower — the run this whole document is about

The `w4-01` rule pasted into `w4-02`. All four seeds fail at 1601 ticks against a 1600 budget.

| tick | heat across the 65-tile circuit | shot |
| --- | --- | --- |
| 120 | mostly `2x` — a quiet darkening, the second lap | `docs/shots/w4-02/naive-tick0120-second-lap.png` |
| 240 | `3x`/`4x` — visibly warming, the whole circuit | `docs/shots/w4-02/naive-tick0240-fourth-lap.png` |
| 1601 | `25x` — the circuit is a solid red ring against bare rock | `docs/shots/w4-02/naive-tick1601-halted.jpg` |

The tick-1601 shot is the one that closes the defect. **The closed circuit the bot rode is drawn
as a closed red ring, and the branches of the cave it never entered are untouched grey stone.**
You can read the shape of the mistake off the picture without being told anything.

### The controls

| case | what the trail draws | shot |
| --- | --- | --- |
| `w4-02` solved with breadcrumbs, 214 ticks, objective met | a faint darkening on the corridors that were backtracked, **no red anywhere** | `docs/shots/w4-02/breadcrumbs-solved-tick0214.png` |
| `w4-01` with the same tunnel-follower, 48 ticks, objective met | **nothing at all** — the tunnel is clean | `docs/shots/w4-02/control-w4-01-no-trail.png` |

`w4-01` is the control the brief asked for and it behaves exactly as designed: a level whose
solution never doubles back renders no trail, so there is nothing to switch off and nothing to
opt out of.

Marks and trail were checked together on the solved run: the breadcrumbs read as small teal chips
sitting *on top of* a dark floor wash. Two concepts, two readable marks.

---

## 7. The calibration the browser caught

The first ramp ran `palette.inkDim` → `palette.danger`. On paper it was right. In the cave it drew
**nothing at all** below about eight visits, and `w4-02`'s naive run does not reach eight until
tick ~400 — long after the player has stopped watching.

The cause: `inkDim` is `#6a7a8c`, and the World 4 cave floor renders at roughly `#6b7681`. The
cold end of the ramp was within a few points of the surface it was painting on. A trail whose
first three steps are invisible is the original defect wearing a different hat, and it is
precisely the class of thing that survives a passing test suite and a plausible-looking diff.

Two changes, both in `RAMP`:

- **The cold end is now `palette.bgVoid`** — a *darkening* rather than a tint. Luminance first,
  hue second, which works on any biome rather than on the one whose floor happens to contrast.
- **Hue and alpha are on separate curves.** Red arrives at `TRAIL_HOT_VISITS = 6` so the trouble
  reads early; alpha keeps deepening to `TRAIL_MAX_VISITS = 10` so a run well past trouble keeps
  saying so. Previously both saturated together at 10.

| visits | fill |
| --- | --- |
| 2 | `rgba(10, 14, 20, 0.156)` — a scuff |
| 3 | `rgba(71, 34, 38, 0.188)` |
| 4 | `rgba(133, 54, 57, 0.203)` |
| 6 | `rgba(255, 93, 93, 0.266)` — fully red |
| 10+ | `rgba(255, 93, 93, 0.359)` |

Measured heat over the naive `w4-02` run, seed 1 (offline probe): `t=60` nothing hot; `t=120`
56 cells at `2x`; `t=180` 52 at `3x`; `t=240` 48 at `4x`; `t=400` 47 at `6x` — **fully red by tick
400 of a 1600-tick budget**, a quarter of the way in.

---

## 8. Side fix — `DocsPanel` showed the wrong tick price on three levels

Handed over by the `power()` agent (`docs/FIX-POWER.md` §2) as squarely in this agent's ownership.
Confirmed, small, self-contained, fixed.

`DocsPanel.tsx` rendered `costLabel(fn.cost)` — the campaign-wide price out of `api-spec` — with
no access to the level's `costs` overrides. Three levels override:

| level | override | the page said |
| --- | --- | --- |
| `w7-02` | `spawn: 2` | `spawn: 5` |
| `w7-04` | `use: 1` | `use: 2` |
| `w8-05` | `use: 1` | `use: 2` |

`w8-05` is the finale and `use` is the only way to work a manual station there, so a player
budgeting the shift against a doubled price had reason to believe the deadline was unreachable.

The fix is one helper and one prop. `level` was already in `DocsPanel`'s scope:

```ts
export function levelCost(fn: ApiFunctionSpec, costs: CostOverrides | undefined): number | string {
  if (typeof fn.cost !== 'number') return fn.cost;
  return costs?.[fn.name as keyof CostOverrides] ?? fn.cost;
}
```

The `typeof` guard is load-bearing: `wait`'s cost is the string `'n'`, a multiplier rather than a
price, and it must not be replaced by the `wait` entry in `CostTable`. No engine or level change
was needed — `LevelDef.costs` was already on the object the panel holds.

Five tests in `src/ui/panels/__tests__/docs-cost.test.ts`, asserted against the real level defs
rather than fixtures, so they fail if an override is added or removed without the docs following.

---

## 9. Checks

| check | result |
| --- | --- |
| `npx tsc --noEmit` | clean |
| `npx vitest run` | **1410 passed**, 53 files (post-merge baseline 1389 + 21) |
| `npm run build` | clean |
| `npx eslint src` | the one known `w5-01` `rules-of-hooks` false positive, nothing else |

All four re-run after the final merge with main. **21 new tests**, all in files this change owns:

- `src/render/__tests__/trail.test.ts` — **16**. Eleven on `VisitTrail`: draws nothing when no
  tile is revisited; counts the start tile; records *how often* rather than *whether*; lists a
  cell as hot exactly once; heats up as the playhead advances; cools on a backwards scrub; reaches
  the same state stepped as jumped; culls out-of-view cells; one filled tile per revisited cell in
  tile units; ignores blocked moves, because a bot that never arrived never stood there. Four on
  the ramp: silent below the threshold, a distinct step per visit, saturates rather than running
  away on a livelocked run, runs between two existing palette hues, and is a *darkening* at the
  cold end rather than a grey the cave floor swallows — that last one is the regression guard for
  §7. One integration test drives the real `w4-02` twice, with the reference solution and with the
  tunnel-follower, and asserts the heat gap stays wide: reference under 10, naive over 20 and at
  least 5× the reference. If a future seed change collapses that gap, this defect is back and the
  suite says so.
- `src/ui/panels/__tests__/docs-cost.test.ts` — **5**, per §8.

Nothing was deleted or skipped. No par, medal threshold, tick cost, budget or objective was
touched, and no character count was reintroduced in any form.

---

## 10. Left for the orchestrator

Nothing blocking. Three notes:

1. **The hover readout is dead plumbing.** `RendererOptions.onHover`, `Renderer.readoutAt()` and
   `TileReadout` are implemented and have no consumer anywhere outside `src/render/`. If it is
   ever revived, `VisitTrail.visitsAt(x, y)` is public and a "walked N times" row is a two-line
   addition — it would turn the trail from a picture into a checkable number.
2. **`docs/FIX-PROSE.md` finding 4 offered a follow-on that is now available.** It says: *"If a
   path trail lands in the replay, dot's remaining 'the tunnels join up' line can go too."* The
   trail has landed and the failure now teaches. I did **not** make that cut — `w4-02`'s brief is
   in `src/levels/**`, which the par agent holds. It is a one-line prose change and someone should
   decide it deliberately rather than inherit it.
3. **`docs/OPEN-ITEMS.md` defect 2 can be struck**, and `docs/FIX-POWER.md` §2 with it.
