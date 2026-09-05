# FIX — the visited-tile trail

`docs/OPEN-ITEMS.md` defect 2 / `docs/FIX-PROSE.md` finding 4: **`w4-02`'s designed failure is
invisible.** The level's whole argument is that a naive tunnel-follower rides a closed circuit
until the shift ends, and the replay drew no evidence of it. The bot moved; nothing said it had
been there before.

Branch `worktree-agent-a821e9af07425cc55`, worktree from `main` at `d08dc45` (already current —
no merge needed).

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

3. **Two existing hues, no new accent.** `palette.inkDim` (`#6a7a8c`) at the cold end and
   `palette.danger` (`#ff5d5d`) at the hot end, interpolating between. `danger` is already the
   game's failure hue (it is what `drawBlockedTell` uses), so red *is* the existing colour for
   "this went wrong" and I did not have to invent one. I deliberately did **not** route the ramp
   through `palette.accent2` amber, which would have read as a smoother heat gradient: amber is
   `overlay.goal`, and a mid-heat floor wash the same colour as the objective brackets is the one
   confusion this level cannot afford.

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
   floor wash in grey-to-red, drawn under everything. Different shape, different position,
   different hue family, and the trail is under the mark rather than over it, so a marked tile
   that has also been walked shows both. *A mark you placed* and *a tile you walked* stay two
   readable things.
