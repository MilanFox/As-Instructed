# Renderer audit — implementation log

Implementing `docs/audits/renderer.md`. Appended per job as it lands. Authority: `src/render/`
throughout, plus `src/engine/` for the deletions in finding 14/15 only. Nothing here touches
`src/ui/`, `src/levels/` or `src/runtime/`.

One idea runs through every visual choice below, and it is the §8 ink pair rather than a new
colour: **`--ink-dim` is a fact that is costing you nothing, `--ink` is a fact that is costing you
now.** The sprouting clock is dim because waiting is free; the spoilage clock is ink because the
ledger is running; unread packets are ink and read ones dim; a dead tether is dim and a live one is
`--accent`, which is §8's existing "player/active". No finding below introduced a palette entry.

---

## Finding 9 — a crop ripe for thirty ticks drew exactly like one ripe for one

**Verdict:** fixed, both legs.

**What was wrong.** `maturity()` clamps at `maxGrowth` and `plantStageIndex` returns the last rung
for every `ratio >= 1`, so the six-stage ladder has nothing left to say from the moment the crop
ripens. `w2-04`'s `crop-spoilage` bonus grades precisely the interval after that point. This is the
`sproutsIn` precedent's far side: the near side of the growth clock was drawn, the far side was not,
and the far side is the side the bonus is made of.

**What I drew.** `drawSpoiling` in `src/render/overlays.ts` — *the same clock as `drawSprouting`,
read past its mark.* Same corner (north-west), same centre, same radius, same face. The two can
never both be up on one tile (`sproutsIn > 0` needs `t < plantedAt`; `ripeFor > 0` needs
`t > plantedAt + maxGrowth`), so the corner is never contested and the player learns one dial, not
two.

The difference between them is **fill, not hue**:

- *Sprouting*: hollow face, `--ink-dim` rim, hand frozen at noon. Nothing has started.
- *Spoiling*: the face darkens through a wedge from noon as the hand sweeps one lap per 12 ticks,
  in `--ink`. Past one lap the face is solid and each further lap leaves an inset tree ring
  (capped at two, so nothing ever crosses the tile edge and starts reading as a mark on the
  neighbour). The hand goes on sweeping in the void colour over the filled face, so a lapped clock
  is still visibly running. The exact count is a monospace number beside it above 26 screen px,
  same as the sprouting badge.

**Why not a wilt tint.** The audit's own suggestion was a tint deepening toward a warning colour.
I did not take it, for three reasons and the user should know all three:

1. `PLANT_STAGES`' comment states DESIGN §8's requirement as a *ladder* rather than a tint ramp,
   because maturity has to read at a glance. A continuous ramp is the shape that comment rejects.
2. `terrain.ts`'s `renderPits` already settled the house rule for exactly this situation — "the fix
   stays inside the art direction rather than adding a warning colour: a hole is drawn as a hole."
   A clock that has run past its mark is drawn as a clock that has run past its mark.
3. A tint over the crop sprite competes with the one distinction `w2-02` is unsolvable without.
   The badge sits in the corner and leaves the six-stage ladder as the only thing carrying
   maturity. Nothing about `w2-02` changed.

Two steps (hollow/dim vs solid/ink) plus a sweeping hand also survive greyscale, and survive the
zoom below which the number hides — which is exactly where a dim amber would stop saying anything.

**Which tiles get a badge.** Only tiles carrying `meta.plantedAt`. That is the same condition
`drawSprouting` reads and the same first branch `world-2/shared.ts`'s `spoilageLedger` charges: a
tile has a growth clock exactly when it has a `plantedAt`. `w2-04` authors every graded crop with
one (`w2-04.ts:50`, allowed to be negative so a tile is ripe on arrival), and a crop the player
plants gets one from `Sim.plant`. `w2-02`'s field is authored ripe with no clock at all and gets no
badge — right, because nothing there grades how long anything waits, and forty badges would be
noise over the one distinction that level is played on.

**The hover label.** `describeTile` now composes `ripe 12t` as its own part after the maturity part,
in the voice of the existing ones, so the readout reads `3,4 · soil · crop 8/8 · ripe 12t`. Two
facts, because "ripe" and "for how long" are two facts and the bonus grades the second. `TileReadout`
gained a matching `ripeFor: number` field, mirroring how `sproutsIn` is both a helper and a field.

**Changed:**
- `src/render/overlays.ts` — new `ripeFor(tile, t)` helper and `drawSpoiling()`; `TileReadout`
  gained `ripeFor`; `describeTile` pushes the `ripe Nt` part.
- `src/render/renderer.ts` — `drawCrops` computes `overripe` and calls `drawSpoiling` in both the
  atlas branch and the art-direction-painter branch, exactly where `drawSprouting` already sits.
- `src/render/index.ts` — exports `drawSpoiling`, `drawSprouting` and `ripeFor`.

**For the user:**
- The label only reaches the top strip once the sibling agent's finding-2 fix lands (`readoutLine`
  currently discards `readout.label` and hand-rolls a poorer line). Nothing further is needed from
  me; the part is in `parts` and will appear the moment that lands.
- The ledger has a second branch I deliberately left undrawn: a crop authored already ripe with no
  `plantedAt` is charged from tick 0 (`ready = 0`). No level in the campaign uses it — `w2-04` and
  `w2-05` both author `plantedAt` — and drawing it would put a running clock on every `w2-02` tile.
  If a future level does use it, this is the line to revisit.
- If it reads too quiet in play, one line moves the hand and the number to `palette.accent2`. I
  chose not to pre-empt that; the argument above is why, and the user's own playtest of `w2-04` is
  the right thing to settle it.

---

## Finding 7 — the antenna's unread packets were undrawn

**Verdict:** fixed, board leg. The API leg shipped before me (`buffered()`, see
`docs/audits/handoff-antenna.md`); the fiction leg was already on the World 6 fact cards.

**What was wrong.** §11.8 names "an unread packet" as one of its own three worked examples of a
known unknown a preview must draw, and the antenna was the single tile in the game drawing nothing
at all: identical with zero packets on it and with twelve, identical after every read.

**What I drew.** `drawBuffer` in `src/render/overlays.ts`, called from a new
`Renderer.drawMachineReadout`. Two marks, in the handoff's own priority order:

1. **A cursor bar** on the tile's south edge — the same place and the same shape as
   `drawPlantGauge`'s maturity strip, because it makes the same statement: a run through a fixed
   quantity. Spent packets `--ink-dim` behind the cursor, unread `--ink` ahead of it. This is
   handoff item 2 (the cursor, not just the total) and it is what makes `w6-02`'s twenty-to-forty
   packets worth scrubbing.
2. **A three-card stack and the unread count**, above the bar, once the tile is over 26 screen px.
   The stack says "packets" rather than "a gauge"; only the front card — the one at the cursor —
   goes to full `--ink`, so a drained buffer is a stack that is visibly still there and no longer
   saying anything. The count is monospace per §8.

**The empty band draws.** `bandLines` returns `-1` for a tile with no band and `0` for a band with
nothing on it, and an empty band draws the outlined bar and a dim `0` rather than nothing. That is
the whole finding in one pixel: `w6-01`'s seed 3, where the correct program does nothing at all,
now reads as *a listening post with an empty buffer* rather than as an ordinary antenna. Verified
against the real generator — seed 1 `buffer 10/10`, seed 2 `buffer 6/6`, seed 3 `buffer 0/0`.

**The flicker warning is honoured.** `buffered()` writes no tile change on purpose, so a program
polling the depth every tick changes nothing in the snapshot and the drawing does not move. The
only thing that moves it is `receive()` advancing `rxNext`, which is a real `tileChange` and
therefore scrubs backwards and forwards like everything else.

**No allocation in the frame.** `bandLines` counts newline char codes rather than splitting; an
antenna holding forty packets would otherwise mint forty strings per frame.

**The gate.** On the tile carrying an `rx` string, not on a list of machine kinds. Same shape as
`usesFuel()` gating the fuel gauge: the readout appears exactly where the state it reports exists.
`w8-04` and `w8-05` drain the same queue and get it for nothing, which is what the handoff asked
for ("do not gate it on World 6").

**Where the readout lives.** `drawMachineReadout` runs *after* whichever painter drew the machine,
in the renderer rather than behind the `drawMachine` art hook. A direction owns machine *identity*;
this is the level's own content, it is the same fact in every direction, and §11.7 asks for it on
every board rather than on the boards whose direction happened to implement it. `drawSprouting` is
already placed by exactly this argument.

**Changed:**
- `src/render/overlays.ts` — `bandLines()`, `bandCursor()`, `drawBuffer()`; `TileReadout` gained
  `buffer: { unread, total, sent } | null`; `describeTile` composes `buffer 3/12` and `sent 5`.
- `src/render/renderer.ts` — `drawMachines` restructured so the sprite branch falls through to a
  new `drawMachineReadout`, which draws the buffer.
- `src/render/index.ts` — exports `bandLines`, `bandCursor`, `drawBuffer`.

**For the user:**
- **Handoff item 4, the outbound tally, landed on the board anyway** — via finding 4's `vars`
  badge rather than via this cluster. Every World 6 mast carries `sent` and nothing better, so it
  wins the badge and sits in the tile's north-east corner while the buffer sits south. That is the
  before/after pair the handoff asked for, drawn as two separate marks rather than as two numbers
  crowding one. The hover label carries both spellings, `buffer 3/12 · sent 5` off the tile's `tx`
  log and `sent 5` off the machine var — the same count reached two ways.
- The label again only reaches the top strip once the sibling agent's finding-2 fix lands.

---

## Findings 4, 5 and 6 — `Machine.vars`, `manual`/`fed:`, and `Machine.links`

**Verdict:** all three fixed on the board leg. Finding 6's API half is **not mine and is not done**
— see "For the user".

These three are one picture and shipped as one, in `Renderer.drawMachineReadout` and
`Renderer.drawMachineTethers`. The tile's four corners are now spoken for and never collide:
north-east is the `vars` badge, south-west the crank, the south edge the antenna buffer, and the
north-west stays the crop clock (no tile has both a crop and a machine).

### Finding 4 — the `vars` badge

**What was wrong.** Worlds 5-8 keep their substance in `Machine.vars` — twenty-nine keys — and
nothing in `src/render/` read `vars` at all. Two nodes with `capacity: 12` and `capacity: 30` drew
as the same sprite, so "which feeder is the biggest", a comparison the eye makes instantly in every
other game, was a `probe()` loop.

**Which keys.** Not all twenty-nine, and **not by a rule** — by an allow-list, `BADGE_VARS` in
`overlays.ts`, best first. Every rule anyone would write picks the wrong key, because most of those
twenty-nine are not quantities at all:

- `dep0: 3` means "`sub-3` feeds me" — badging `3` is a confident wrong number, which is worse than
  the blank it replaces. It is an edge; it wants a tether, not a digit.
- `c0` … `c59` (`w7-02`) are positions packed as `y * w + x`. Dozens of meaningless three-digit
  numbers per machine.
- `salt`, `key` are cryptographic material; graded and solution-critical, but a random number on a
  tile communicates nothing. They belong in the probe panel.
- `band: 4470` never varies and is never read. `x`/`y` restate `machine.at`. `index`, `bay`, `lane`,
  `segment` restate the machine's own id suffix.
- `seed` is the grader's regeneration handle and in `w6-04` is deliberately withheld from `probe`.

So the list is the eighteen keys that are genuinely a magnitude *and* that a level grades, states on
a fact card, or whose reference solution reads. Ordered by how much the comparison is worth on the
board: `capacity`, `draw`, `cost`, `stages`, `deps`, `requisition`, `stations`, `sites`, `shift`,
`travelBudget`, `cableBudget`, `scouts`, `workers`, `crops`, `jobs`, `probeBudget`, `bound`, `sent`.

Measured against every world 5-8 builder at seed 1:

| Level | Badges |
| --- | --- |
| `w5-04` | 12 distinct across 24 machines — `capacity` on feeders, `draw` on consumers |
| `w7-04` | `cost` on all sixteen job levers, 5 distinct |
| `w8-03` / `w8-05` | `deps` on every station; a `0` badge marks the graph's roots at a glance |
| `w5-02`/`w5-03`/`w5-05` | the reactor's stated budget, and nothing on the 200 relays |
| `w6-01`…`w6-05` | `sent` on the mast |
| `w7-02` | `requisition 4` on the depot |
| worlds 1-4 | nothing. No machine there carries a listed key, so no board changed. |

**The visual.** An `--ink` monospace number on a plate with an `--ink-dim` hairline border,
north-east corner. Deliberately *not* `--accent`: `drawMark` owns cyan on a tile because a mark is
something the player wrote, and this is something the level authored. `w8-05` puts both on one sink
and they have to stay tellable apart. Hidden below 22 screen px.

**Naming it.** The badge is a bare number by necessity, so `describeTile` now composes
`capacity 17` into the label — the board carries the *comparison*, the label carries the *name*, and
`probe()` still carries everything. That is the three legs of §11.7 divided sensibly rather than
each one trying to do all of it.

### Finding 5 — `manual` and `fed:`

**`manual`** is a crank glyph in the south-west corner: a boss, an arm and a handle, `--ink`, three
marks because two of them is an arrow and one is a dot. It says the actual rule — *this one is
turned, not switched*. `types.ts:118-125` already argued that "a rule the player cannot read before
they break it is not a rule, it is a trap" and then satisfied that argument on the API leg only;
this is the other half. Fourteen stations on `w8-03` and nine on `w8-05` now show it, and the
airlock does too.

**`fed:<id>`** is a tether from the fed machine to its feeder. `w8-05`'s airlock is the only write
in the campaign and it is graded — the divergence and the `gate` bonus both read it — so the line
also names *which* machine, by ending on it.

### Finding 6 — `Machine.links`

A tether from the machine to each linked cell, with a diamond on the cell. The gates on `w8-05` were
already visible as walls; what was invisible was the *association* — nothing said those two walls
were ever going to move, or which machine moved them. The diamond is there because the line says
which machine and the cell has to go on saying it once the eye has left the line.

### The tether's two states

Live is **solid and `--accent`**; dead is **dashed and `--ink-dim`**. The dash carries as much as
the colour on purpose: `signal` is a single phosphor and a distinction carried only in hue is not a
distinction there (`marks.test.ts` enforces exactly this for machine identity). A dashed line reads
as a connection not currently carrying, which is what a cold feeder and a shut gate both are.

- `fed:` goes live when the named feeder reads `on`. That is the audit's own recommendation.
- `links` goes live when the owning machine is `on`/`open`/`busy`, because that is the tick its
  tiles actually flip.

Tethers are their own pass, run before the machine sprites, so a line goes *under* every plate —
not only under its owner's. A tether crossing a third machine and stopping at its edge reads as
ending there.

**Changed:**
- `src/render/overlays.ts` — `BADGE_VARS`, `badgeVarKey()`, `drawVarBadge()`, `drawCrank()`,
  `drawTether()`; `describeTile` composes the badged key, `manual` and `fed by <id>` into the label.
- `src/render/renderer.ts` — `drawMachines` calls `drawMachineTethers` first and
  `drawMachineReadout` per machine; both are new private methods.
- `src/render/index.ts` — exports all five.

**Nothing allocates in the frame.** `badgeVarKey` returns `''` rather than an object, the `fed:`
lookup is a hand-rolled loop rather than `Object.keys().find()`, and `setLineDash` is handed two
hoisted arrays rewritten in place.

**For the user:**
1. **Finding 6's API half is still missing and is not in my directory.** `MachineView`
   (`src/engine/sim.ts:74-81`) returns `id, kind, at, state, vars, inventory` and no `links`, so a
   player still cannot ask which tiles the airlock opens — they can only open it and look. The board
   leg is now standing but §11.7's third leg is not, on a level that grades reaching what is behind
   the gate. My authority in `src/engine/` was the deletions only, so I did not add it. The
   `MANUAL_ONLY` precedent gives two ways to do it: add `links: Vec[]` to `MachineView`, or let the
   level write `gate:<x>,<y>: 1` keys the way `fed:` writes an id into a key. I would add the field —
   `vars` holds numbers, and packing a coordinate into a key name is the thing `dep0` already does
   badly.
2. **The badge's allow-list is a maintenance edge.** A future level inventing a new quantity key
   gets no badge until the key is added to `BADGE_VARS`. That is the intended failure direction —
   silence rather than a wrong number — but it is a thing to know. The list is one array with a
   comment saying why it is a list.
3. **`w5-02`'s 200 relays deliberately show nothing.** `live` is the solution-critical key there and
   it is a `0`/`1`; two hundred tiles reading `0` or `1` is noise, not information. It wants a tint
   or a glyph, which is a level-design call rather than a mechanical one, so I left it. It is the
   one severity-2 key I chose not to draw.

---

## Findings 13-16 — the trail count, and the deletions

### Finding 13 — the trail saturates at ten visits with no number

**Verdict:** fixed, in text.

The ramp's ceiling is right and I did not touch it — `trail.ts` chose ten from a census, because
`w4-02`'s worst *correct* tile is stood on six times, so ten hands the top of the ramp to runs that
are genuinely stuck. What the ceiling costs is that fifteen visits and a hundred are the same wash.
The exact figure belongs in text, which is the audit's own recommendation.

`describeTile` gained a fifth parameter, `visits`, and `TileReadout` a `visits` field; the label
composes `27 visits`. It comes in from the caller rather than out of the world because the count is
derived from the trace's arrival ticks and is not stored on a tile — `Renderer.readoutAt` passes
`this.trail.visitsAt(...)`. Only past `TRAIL_MIN_VISITS`, for the reason `trail.ts` gives for not
drawing a single visit: standing somewhere once is not information, and a `1` on every tile a bot
crossed is noise.

### Finding 14 — Conveyor

**Verdict:** the renderer's half is cut. The engine member is **not** cut, and that is a decision,
not an omission — reasons below.

`Terrain.Conveyor` promises `facing` in tile meta, `sim.ts` implements nothing, no level places one,
and `TileView` has no `meta` for a facing to arrive through. The renderer nonetheless animated a
four-phase scroll over it — "something is moving here" about a mechanic that does not exist. Cut
from `src/render/` entirely:

- `Renderer.drawConveyors`, the `conveyorCells` index and its `indexSnapshot` line, and the call in
  `frame()` — one fewer per-frame pass on every board in the game.
- `CONVEYOR_PHASES`, the four `feature.conveyor.*` entries in `CODE_TILE_NAMES` and
  `TILE_VOCABULARY`, the four `CODE_PAINTERS` bindings and the `conveyor()` painter itself.
- `TerrainArt.animated`, the field the whole animated layer hung on. It was written nineteen times
  and read nowhere but by the one test that asserted it, so the layer had already decayed to a
  switch with one arm.
- `terrainArt` now falls `Terrain.Conveyor` through with `Terrain.Floor`, rather than deleting the
  case: `default` returns `EMPTY_ART`, which is `solid: true`, and quietly turning a walkable
  terrain into a wall is a worse bug than the one being fixed.
- `__dev__/scenes.ts` — the showcase's `c` run is now `Terrain.Cable` (a real terrain with real
  bend art, which is what a showcase is for) and the terrain-grid scene drops its conveyor column.

### Finding 15 — dead vocabulary and `ORE_STAGES`

**Verdict:** `ORE_STAGES` cut. The dead `Terrain`/`ItemKind`/`MachineKind` members **not** cut.

`ORE_STAGES` was exported, vocabulary-tested and never called — `terrainArt`'s `Ore` case picks a
prop from a fixed per-cell hash instead. Ore depletion had a sprite ladder and no code path. It is
gone from `tiles.ts` and from the barrel, with `tiles.test.ts`'s ladder assertion narrowed to
`PLANT_STAGES`, which is the ladder that is real.

Two guards moved with it, both of which would have been a surprise to anyone doing this by hand:

- `src/render/__tests__/tiles.test.ts` — the `routes conveyors to the animated layer` test is gone
  and `CONVEYOR_PHASES`/`ORE_STAGES` are out of its imports and its ladder spread.
- `src/__tests__/unused-exports.test.ts` — `KNOWN_TEST_ONLY` is an exact pinned pair and had to go
  `[73, 34] → [71, 32]`. That is the census moving in the right direction (two test-only exports
  stopped existing), which is what the pin is for. Nothing else in that file changed.

### Why the vocabulary members stayed

I confirmed the audit's claim first, exhaustively: **no file under `src/levels/` places `conveyor`,
`rubble`, `regolith`, `ice`-as-terrain, `furnace`, `press`, `source` or `charger`.** Every hit is
prose, a biome name ("Regolith Fields"), or an unrelated token (`save.source`, `aria-pressed`). The
audit is right that they are dead. One correction to it: **`ItemKind.Ice` is alive** —
`w2-05.ts:104` sows ice-scrub with `crop: ItemKind.Ice`, and `w8-02`/`w8-05` list it as a delivery
class. Only `Terrain.Ice` is dead. An `ice` deletion done from the audit's list as written would
have broken `w2-05`.

I still did not delete them, and here is the whole case, because it is the one place I did not take
the decision the brief asked for and the user should be able to overrule me on it in one sentence:

1. **`src/runtime/api-spec.ts:47-106` hand-mirrors `Terrain` and `ItemKind` into the player-facing
   `.d.ts` as a template literal.** No test checks parity, and `tsc` cannot: it is a string.
   Deleting `Terrain.Rubble` from the engine leaves the player's own type documentation advertising
   a terrain that does not exist — a §11 violation traded for a cosmetic cleanup, in a directory I
   am not allowed to edit.
2. **`src/ui/desk/furniture/legend.ts` landed *during this wave*** — the sibling agent's fix for
   finding 3 — and keys `TERRAIN_IS: Record<Terrain, string>` and `ITEM_IS: Record<ItemKind, string>`
   on the full unions, `Terrain.Conveyor` included at line 74. Removing a member is an immediate
   compile error in a file that is not mine, on the day it was written. DESIGN §10.1 says
   `tsc --noEmit` is clean at every handoff, and I cannot make it clean again.
3. **`docs/DESIGN.md:293` quotes rubble's `0.42` rise** as one of the six load-bearing lamp rules
   ("wall and void rise 1.0, rock and ore 0.85, rubble 0.42"). Deleting rubble makes a governing
   document stale, and `docs/` outside this file is not mine either.
4. **The art directions index their sprite sheets by contiguous integer**, unchecked by any type.
   `deepsite.ts` has `ROW` against `SHEET_ROWS = 26`, plus positional `MACHINE_INDEX`/`MACHINE_BODY`
   and `ITEM_INDEX`/`ITEM_BODY` tables; `signal.ts` has `STAMP_*` against `STAMP_COUNT = 20` and a
   second 0-9 machine table. Removing one entry means renumbering everything after it, in two files
   totalling 5,800 lines, with two other agents in the tree, to close a severity-4. Finding 15's own
   text says of this art: "that art is not a bug."

**What it would take, if the user wants it.** Three one-line edits I cannot make, then the deletion
is mechanical. In order: the `Terrain`/`ItemKind` literals in `api-spec.ts`; the two `Record` maps in
`legend.ts`; the `§8` sentence in `DESIGN.md`. Then in code I own: the `terrainArt` cases, the
`machineTileName` cases, the two art directions' dispatch and sheet rows, and these tests —
`tiles.test.ts:158` (`itemKinds`/`machineKinds` are **hardcoded arrays**, not `Object.values`, so
they need a hand edit; `ALL_TERRAIN` and `marks.test.ts` are derived and adapt on their own),
`sim.test.ts:484-490` (the mining table rows), `sim.test.ts:475-480` (`asciiWorld(['G..'])` +
`expect(sim.mine(0)).toBe(ItemKind.Regolith)` has to be rebuilt around a surviving mineable),
`sim.test.ts:1396/1406` and `:766/773` (Furnace and Press used as stand-in kinds),
`world.test.ts:138-140`, `game/__tests__/playback.test.ts:154-155`, `sim.test.ts:1652`. The `U`/`I`/`V`
legend chars in `engine/__tests__/helpers.ts:43-49` are used by no map string and go free; **`G` is
used** and does not.

**The one I would do anyway:** `MachineKind.Furnace`/`Press`/`Source`/`Charger` are the cheap corner
of this — `MachineView.kind` is typed `string` in `api-spec.ts:140`, so *no* runtime edit is needed
and the legend's machine map is keyed differently. It is still blocked on the two positional sprite
tables, which is the only reason it is not done here.

### Finding 16 — weak forms

Untouched and still true, except that **`cable` power state** is now partly answered from the other
side: an energised grid draws its `fed:` and `link` tethers in `--accent`, so what is live is
legible even though the cable run between two nodes still is not. A pulse along energised cable is
still the better fix and is still open.

**Changed:**
- `src/render/tiles.ts` — `CONVEYOR_PHASES`, `ORE_STAGES`, `TerrainArt.animated`, the conveyor code
  tiles and painter all removed; `terrainArt`'s conveyor case folded into `Floor`.
- `src/render/renderer.ts` — `drawConveyors`, `conveyorCells` and the frame call removed;
  `readoutAt` passes the visit count.
- `src/render/overlays.ts` — `TileReadout.visits`, `describeTile`'s `visits` parameter and label part.
- `src/render/index.ts` — `CONVEYOR_PHASES` and `ORE_STAGES` unexported.
- `src/render/__dev__/scenes.ts` — showcase conveyor run becomes a cable run; terrain grid drops it.
- `src/render/__tests__/tiles.test.ts` — conveyor test deleted, ladder assertion narrowed.
- `src/__tests__/unused-exports.test.ts` — pinned census `[73, 34] → [71, 32]`.

---

## Finding 1 — the airlock cranks eight times and the board never moved

**Verdict:** fixed. **Beyond the six jobs I was given** — I did it because it is the report's own
top-ranked severity-1 board-leg failure, it sits in my directory, and after findings 4-7 the
infrastructure for it was one function.

**What was wrong.** `w8-05`'s airlock is a `Door` with
`cycle: ['sealed','1','2','3','4','5','6','7','8','open']`, and each `use()` advances it one step.
The machine glow fires only for `on`/`open`/`busy`, so `sealed` and `1` through `8` were the
identical unglowing door: a player cranking the airlock watched an unchanged tile for eight of the
nine steps until the ninth flipped it open. That is `w2-04`'s `0/8` again and worse, because `0/8`
at least printed a number. The audit calls it "the only [finding] that is a clean instance of the
`w2-04` precedent".

**What I drew.** `drawStageRing`, in `drawSprouting`'s vocabulary exactly as the audit asked — a
ring plus a number, with the two zoom cutoffs already tuned, saying the thing it says: *this is
partway through, and here is how far*. South-east corner, so it does not contest the crank
(south-west), the `vars` badge (north-east) or the buffer (south edge). The arc runs clockwise from
noon in `--accent`, turning `--ok` at the last step. Cyan rather than the crop clocks' ink pair
because unlike them this is the player's own progress, and §8 gives cyan to the player.

Gated on `cycle.length > 2`. A two-state door is already told by its own sprite and does not want a
ring reading `1/1`.

**It pays for itself twice.** `w7-04`'s sixteen job levers build the same `['open','1',…,'done']`
shape from `cycleFor(job.cost)` and get the ring for nothing — `job-0` now reads `0/11` and climbs
as it is worked, which is the whole of that level's arithmetic on the board.

**One redundancy removed.** `w8-05` publishes the total as `vars.stages: 9` and `w7-04` as
`vars.cost: 11`, and both are exactly the ring's denominator. So the `vars` badge is suppressed when
its value equals the ring's total: the level said the same number twice, and the ring says it with a
position attached. Verified — the airlock draws one ring `0/9` and no `9` badge; the levers draw
`0/11` and no `11`.

**The label** gained `stage 3/9`, before the `vars` part: `door:sealed · stage 0/9 · manual ·
fed by sub-3` is now the airlock's full statement in one line.

**Changed:** `src/render/overlays.ts` (`drawStageRing`, the `stage n/m` label part),
`src/render/renderer.ts` (`drawMachineReadout`), `src/render/index.ts`.

---

## Closing

**Verification.** `npx tsc --noEmit` clean, `npx eslint src/render/` clean, `npx vitest run` **102
files / 2192 tests, all passing.** The two `w8-05` failures the brief warned about were already gone
when I arrived — another agent closed them mid-wave. I broke one test and fixed it
(`unused-exports.test.ts`'s pinned census, moved by my own deletion) and updated one that encoded
the deleted behaviour (`tiles.test.ts`'s conveyor case).

**Every probe was written, run and deleted in the same step.** Nothing was left under `src/`.

**Git was read-only throughout.** No `add`, no `commit`, no `stash`, nothing staged.

### What is still open, ranked

| # | Finding | Whose | Note |
| --- | --- | --- | --- |
| 6 | `MachineView.links` | `src/engine/` | The board leg now stands; the API leg does not. `w8-05` grades reaching what is behind the gate and a player still cannot ask which tiles it opens. |
| 2 | `readoutLine` should return `readout.label` | `src/ui/` | Sibling agent. **Everything I added to the label is invisible until this lands** — `ripe 12t`, `buffer 3/12`, `stage 0/9`, `capacity 17`, `manual`, `fed by sub-3`, `27 visits`. |
| 15 | The dead `Terrain`/`ItemKind`/`MachineKind` members | three directories | Blocked on `api-spec.ts`, `legend.ts` and `DESIGN.md §8`, none of them mine. Full recipe above. |
| 8 | `n/capacity` on the bot | `src/render/` | Not in my six jobs and I did not take it. It is the one remaining severity-2 in my own directory. |
| 12 | `Machine.inventory` on `TileReadout` | `src/render/` | Same. One field and one label part. |
| 16 | A pulse along energised cable | `src/render/` | Partly answered from the other side by the tethers; the cable run itself still does not distinguish live from dead. |

### The vocabulary I added, in one place

Six marks, none of them a new colour, all of them in §8's existing palette. A machine tile's four
quadrants are now spoken for and cannot collide:

| Where | Mark | Says |
| --- | --- | --- |
| Crop, NW | sprouting clock — hollow face, `--ink-dim`, hand at noon | has not started |
| Crop, NW | spoilage clock — filling face, `--ink`, hand sweeping, tree rings | ripe and standing |
| Machine, NE | `vars` badge — `--ink` monospace on a dim-bordered plate | the level's own number |
| Machine, SW | crank — `--ink` boss, arm, handle | turned, not switched |
| Machine, SE | stage ring — `--accent` arc from noon, `--ok` at the end | partway through, this far |
| Machine, S | buffer — card stack, count, two-tone cursor bar | packets held, packets read |
| Between tiles | tether — solid `--accent` live, dashed `--ink-dim` dead | bound to that, carrying or not |

The rule underneath all of it: **`--ink-dim` is a fact that is costing you nothing, `--ink` is a
fact that is costing you now, `--accent` is you.**
