# Fix — the sprites the art rebuild left on the atlas

`docs/SPIKE-ART-DIRECTION.md` rebuilt the board in three directions and authored **terrain** for
each of them. Machines, crops and items were not authored: they kept coming off the shared 48 px
tile atlas in every direction. So every board except `standard` shipped half-committed — Survey's
paper plot with 3/4-view Kenney sprites standing on it, Signal's single amber phosphor with
full-colour icons on top of it.

The previous agent left that deliberately and was right to. Crop maturity is what `w2-02` is
played on, and it refused to skip the pass that guarantees it in order to make its screenshots
prettier. This is that pass.

**`standard` does not change.** It is the baseline the other three are judged against, and it is
still the definition of the fallback path: the atlas draws its terrain, `sprites.ts` draws its bot,
`machineTileName` picks its machine frames.

**`DEFAULT_ART` was untouched by this work.** It was `survey` while the pass ran and all four
directions were held to the same standard of finish, precisely because the choice was the user's and
not this pass's to anticipate. The user has since picked **Deep Site**, and `main` set it — so the
direction that shipped was decided on the evidence, and every direction was ready to be it.

---

## 1. Before

All three shots are the same scene at the same zoom: 16 device px per tile, every machine kind in
one row, ripe crops alternating with unripe below them, every item kind along the bottom.

| | |
|---|---|
| `docs/shots/sprites/before-survey-16px.png` | paper board, atlas sprites |
| `docs/shots/sprites/before-signal-16px.png` | one phosphor, full-colour icons |
| `docs/shots/sprites/before-deepsite-16px.png` | lit dithered ground, flat atlas props |

---

## 2. The seam

`src/render/art/types.ts` had three painter hooks — `paintTerrain`, `drawBot`, `backdrop`/`post`.
It now has three more, and they exist because the layers they cover **cannot ride `paintTerrain`**:
terrain is cached and rebuilt on a size or revision change, while maturity is derived from the tick
(`ENGINE.md` §6.4) and a machine's state changes without a rebuild.

```
drawMachine?: (paint: MachinePaint) => void
drawCrop?:    (paint: CropPaint) => void
drawItem?:    (paint: ItemPaint) => void
```

Each takes one bag the renderer owns and rewrites in place per call — `renderer.ts` holds exactly
one `MachinePaint`, one `CropPaint` and one `ItemPaint` for the lifetime of the renderer. A 25-tile
field at 60 fps is 1500 object literals a second if they are built inline, which is the allocation
shape `this.fx` and `this.paint` were already hoisted for.

Three decisions inside the contract are worth stating:

**`stage` is bucketed by the renderer, not by the direction.** `PLANT_STAGES` is a six-step ladder
and DESIGN.md §11 A5 requires the steps to be *visually* distinct. A direction that re-derived the
bucketing could quietly ship five steps and nothing would catch it.

**`ripe` is handed over separately from `stage`.** `stage === stages - 1` is also true for a tile
authored fully grown with `maxGrowth: 0`, and both of those really are harvestable, so the bit the
player acts on is passed as a bit rather than inferred.

**`reduced` is on all three bags.** `BotDrawOptions` already carried it; the three new layers each
have an obvious motion a direction would reach for — the busy lamp, the ripe pulse, the item bob —
and a tell that only exists in motion says nothing to a player who asked the system for stillness.

When a hook is present the direction owns the **whole** mark: `drawCrop` replaces the sprite *and*
`drawPlantGauge`, `drawItem` replaces the sprite *and* the shadow, the bob and the count badge.
Half a mark from the direction and half from `overlays.ts` is how you get a paper board with a
rounded neon progress pill on it.

---

## 3. The guard

`src/render/__tests__/marks.test.ts`, 153 cases.

Each painter is run against a **recording context** — a Proxy that implements the whole Canvas2D
surface, draws nothing, and appends every call and every property write to a list. The assertion is
that two things that should look different produce different call streams. Nothing in the file
names a colour, a radius or a helper function, so any of the four directions can be rebuilt from
scratch tomorrow and the test still says the right thing about the rebuild.

Six properties, per direction, at 16 / 20 / 24 / 32 / 48 device px:

1. every machine kind draws a different mark, resting and running;
2. …still different with **hue removed**;
3. every kind's powered state differs from its unpowered state, with hue removed;
4. every one of the six maturity buckets draws a different mark;
5. **ripe differs from every unripe growth value**, with hue removed;
6. every item kind draws a different mark, with hue removed.

Two more at the floor only:

7. **identity survives with type stripped.** Every `fillText` / `strokeText` / `font=` op is removed
   and the whole battery re-run at 16 px. This closes a real hole: a painter that stamps the kind's
   initial on each machine passes distinctness at every size, because the stream carries the letter
   even where the letter is four CSS pixels tall on a retina panel and reads as a smudge. Type is a
   fine second-level mark at 48 px and is not a mark at all at 16.
8. **every tell survives `reduced: true`.** Each of the three layers has an obvious animation a
   direction would reach for — the busy lamp, the ripe pulse, the item bob — and a tell that only
   exists in motion says nothing to a player who asked the system for stillness. All three
   directions pass: the powered state, the ripe state and every kind stay separable with motion
   off.

And one that is about the bot rather than the three new layers, added ahead of the form pass because
it is the property that pass is most likely to spend by accident:

9. **the four facings are four different pictures**, at every tile size, with hue removed, and again
   with motion off at the floor. Which way a bot points is gameplay — a player reads it before every
   `move`, `mine` and `use`, off the board rather than off the HUD. The pose is built **at rest** on
   purpose: mid-move the travel offset alone would separate the four streams and the test would pass
   on the bot's *position* rather than on anything about the bot. All four directions pass today, so
   the guard starts green and can only be broken by new work.

"Hue removed" is requirement 3 of the brief made mechanical: every colour in the stream is
collapsed to its relative luminance, **keeping alpha and value and throwing away hue**. Brightness
is the medium on a phosphor tube and is a legitimate way to separate two marks; being the orange
one is not. A direction that passes the greyscale pass separates its kinds by shape, weight,
pattern or value.

`standard` is measured through the *real* `sprites.ts` and `overlays.ts`, not by comparing the
atlas frame names it would have asked for. Half the shipped machine tells are not in the name — a
furnace is `feature.refinery` whether it is running or not, and the thing that says it is running
is the glow `drawMachine` puts over the frame. Comparing names would have reported that `standard`
cannot show a busy machine, which is false.

### The floor, measured

`SMALLEST_TILE_PX` is **16 device px**, and the number was measured rather than picked. Running the
real `fit()` arithmetic against the real board panel gives **48** for the biggest campaign board
(25x14), **36** for the 21x21 maze and **24** for the 30x30 stress grid; squeezing the panel to
420x260 CSS on a 2x display still lands 25x14 on **32**. So 16 is two rungs below anything the
campaign fits to. Below it the ladder only continues because the player asked for an overview, and
at 6 px a tile the board is a minimap where nothing in any direction is meant to be identifiable.

### The one shape the test cannot hold

Distinctness is not legibility. Two marks can differ by one `fillRect` and still look the same to a
person. That is what the screenshots in §4 are for, and why they are taken at 16 px with every kind
in one row — a furnace and a press are each fine alone and converge the moment they are adjacent.

---

## 4. The shots

Every shot is the `sceneSprites` grid described in §5: ten machine kinds in one row, five ripe crops
**alternating** with five unripe, the ordered ladder under that, eleven item kinds along the bottom.

| shot | what it shows |
|---|---|
| `deepsite-16px.png` | **the proof.** 16 device px/tile, magnified 3x with hard pixels so the real pixel structure is visible rather than resampled |
| `deepsite-40px.png` | the near form, 1:1 |
| `survey-16px.png` / `survey-40px.png` | same pair |
| `signal-16px.png` / `signal-40px.png` | same pair |
| `survey-16px-reduced.png` | 16 px with `prefers-reduced-motion` on — every tell still there |
| `standard-16px.png` | the baseline, unchanged |
| `before-*-16px.png` | the same scene before this pass: authored terrain with atlas icons standing on it |

The magnification is 3x nearest-neighbour of a genuine 16 device px render, not a re-render at
48 px. A screenshot scaled down by the capture pipeline would have quietly resampled away the exact
thing being claimed.

---

## 5. The proof scene

`sceneSprites()` in `src/render/__dev__/scenes.ts` (dev harness only; not reachable from
`src/main.tsx`). Every machine kind in one row, five ripe crops **alternating** with five unripe
ones walking the ladder from bare to one tick short of ready, the ordered ladder underneath, and
every item kind along the bottom. Static by construction — no `plantedAt`, so `maturity` returns
the authored `growth` and the row means the same thing at every tick.

The harness also gained an art-direction selector and `__harness.tile(devicePx)`, which pins the
camera to one `ZOOM_LADDER` rung and lands both the target and the eased value — a shot taken
straight after `setZoom` alone is of the zoom on the way, not the one asked for.

---

## 6. Cost, measured before anything was authored

*(superseded by §9, which measures the same thing properly by checking the old files back out.
Kept because it is the number the work was steered by while it was in flight.)*

`__harness.measure(600)` after a 200-frame warm-up, same machine, same tab, same session. These are
the numbers the finished directions have to be held against, so they were taken **before** a single
painter existed.

`sprites` scene — 10 machines, 16 crops, 11 item stacks, 1 bot, 13x8:

| direction | 48 px/tile mean | 16 px/tile mean |
|---|---|---|
| standard | 0.213 ms | 0.099 ms |
| survey | 0.248 ms | 0.127 ms |
| signal | 0.209 ms | 0.253 ms |
| deepsite | 0.420 ms | 0.164 ms |

`showcase` scene at `fit` — the comparison the art spike reported on:

| direction | mean |
|---|---|
| standard | 0.220 ms |
| survey | 0.131 ms |
| signal | 0.188 ms |
| deepsite | 0.405 ms |

`p50` is 0.1 ms across the board and `p95` 0.2–0.3 ms, so the mean is the number that moves and the
mean is what is quoted. The non-negotiable is the spike's: the three directions must not give back
the margin they hold over the old look.

---

## 7. The directions

All three were authored in parallel, one agent per direction, each allowed to touch exactly one
file. None of them needed a change to the seam, and none of them asked for one.

### 7.1 Survey — a symbol legend, drawn by the department that draws everything up

**Machines are surveyor's plan symbols.** Ten silhouettes that differ from each other as *outlines*
first, each carrying a second-level diacritic that is deliberately not load-bearing:

| kind | outline | diacritic |
|---|---|---|
| door | portrait leaf | two panel rails |
| lever | plinth with an arm rising right | pivot pip |
| furnace | peaked kiln | firebox grate |
| press | two platens on a ram column | opposed chevrons |
| sink | triangle down | mouth bar, convergent rules |
| source | triangle up | divergent rules, emitting pip |
| node | diamond | cross and filled centre |
| antenna | mast on splayed legs | two radiating chevrons |
| charger | cell body with a terminal tab | a bolt |
| router | hexagon | a 2x2 switch matrix |

The **powered tell is that ink is matter**: live inverts the largest area on the symbol — body
solid ink, diacritic knocked out in paper — and adds a heavy blue-pencil rule struck under the
box. A value inversion and a piece of present/absent geometry, so it survives both the greyscale
pass and `reduced`. `door` inverts the other way on purpose: the drawn body is the leaf, so shut is
solid and open is a gap, and inking an open door solid would say the opposite of what it means.

**Crops are a plot on a drill row.** Near: the row is ruled, stems rise, put out leaf ticks, then
set open heads. Far (under 24 device px) it stops being a plant and becomes **a bar against its
track** — maturity plotted, which is how a drafting sheet states a quantity anyway. Ripe is *signed
off* in both forms and by four channels at once: heads go solid ink, the drill row is re-ruled at
three times the weight, an oxide rule is struck over the plot, and the corner carries a checked-off
bracket. One of those four is a colour.

**Items are keyed tags** — a rectangle with the corner clipped — carrying eleven glyphs separated by
construction rather than by hue: loose grains, a solid mass, a cleared lozenge, an asterisk, a
zigzag, a pip with a radicle, a headed stem, a boxed X, an H bracket, a capped cell, a legged die.
Regolith, stone and ore reuse the terrain layer's own shorthand, so the alphabet is already taught
by the ground.

Thresholds: `MACHINE_DETAIL_TILE_PX 22`, `CROP_DETAIL_TILE_PX 24`, `ITEM_DETAIL_TILE_PX 26`,
`COUNT_MIN_TILE_PX 22`. Each is argued from the size the mark it gates collapses at, not picked.

**Legibility spent:** sink and source are a near-pair, triangle down against triangle up. Kept near
because they are *opposites* — a reader who confuses them has still learnt the axis — and separated
further by diacritic. At 16 px, where diacritics are gone, they are the two most likely to be
misread.

### 7.2 Signal — glyphs made of scanlines, on one phosphor

**Machines are 8-row raster profiles** over a dark backing that knocks the dotted floor out of the
cell. Identity runs on two independent channels: silhouette *and* raster texture.

door is the only two-span-every-row glyph; furnace only narrows, press is an I-beam narrow exactly
where the furnace is wide; sink is a funnel closing down and source the same funnel inverted; node
is a diamond, widest in the middle, so it is neither funnel; antenna is the only glyph empty in the
middle at the top; charger has a socket bitten three rows deep out of one side; router is a bowl
with a feed horn, curved one side and flat the other. Textures run solid / one-in-two / one-in-three
/ offset-alternating, and **sink and source are opposed in outline and in texture** — the sparsest
against the densest.

**Powered is five signals, four of them completely still:** the footing bar goes from dim to the
brightest run in the cell; the status lamp changes from a dash to a filled block, which is
categorical rather than a brightness; the raster closes one step denser; the whole glyph steps from
cold phosphor to hot; and door opens, lever throws. Only a lamp flicker is motion, and it is
additive on top of an already-filled block, so `reduced` loses nothing.

**Crops** near: a stalk of `stage + 1` separated scanline runs, each stack taller *and* broader.
Far: a fixed dim column with a lit fill rising from the bottom — at 16 device px the lit boundary
lands at 2, 4, 6, 7 and 9 px out of 11, five clearly separated edges. Counting is replaced by
locating one edge, because counting fails *silently* once the pitch closes. **Ripe is one solid
block with no gap anywhere in it, on the only hot phosphor in the crop vocabulary, inside a
bracket** — texture, value and enclosure changing at once, because on `w2-02` the player scans the
field rather than comparing a tile to its neighbour, and on the edge of the field there is no
neighbour to compare against.

**Items** are the same run primitive over six rows, plus a dim ground rule and no cast shadow — a
tube has no light to cast one. Per-kind intensity is ordered by what the player is hunting for, so
a floor of mining spoil never out-shouts the one crate that matters.

Thresholds: `PATTERN_CSS 12`, `CROP_COUNT_CSS 13`, `ITEM_BADGE_CSS 12`, all in CSS px and
multiplied by `dpr` at the call site, following `botDetailTilePx`.

**Legibility spent:** a dark backing rect per machine, which knocks out the floor texture the
terrain pass spent its budget on. A glyph made of horizontal runs standing on a field of horizontal
dots is a glyph with the floor running through it, and identity was the brief.

*Method note worth keeping:* this direction's author did not trust the call-stream test and
rendered every glyph as an ASCII raster at 48 and 16 px to look at it. That is what caught `door`
and `charger` converging into two near-full slabs at 16 px — a collision the distinctness test
could not see, because the two streams genuinely differed. The scratch harness was deleted
afterwards; the finding is the part worth keeping.

### 7.3 Deep Site — equipment seen from above, under one light

This is the direction the user picked, so it got two passes: the sprites, then a cost pass that
sent the first version back.

**Machines are ten footprints, no two the same box.** `door` a full-tile slab whose axis is set by
`facing`; `lever` the smallest footprint on the board, a pedestal with a swing arm; `furnace` a
housing with a chimney that breaks the tile's north edge; `press` a *gate* — two guide columns and
an anvil with daylight through the middle; `sink` a 0.8 square that is a **hole**, a three-step
funnel lit on its south-east inner walls, which nothing else in the direction is; `source` a
stepped barrel with hoops and a spout out of the south face; `node` a **rhombus**, the only plan not
square to the plate; `antenna` a tiny base under a mast nearly the whole tile tall and a tenth
wide; `charger` a wide low south-heavy cradle that reads as floor furniture; `router` a **cross**
whose four ports reach all four tile edges.

**Powered is a still tell everywhere:** a hard-edged emissive window plus three bands of spill on
the plate south of the housing, drawn identically under `reduced` and only stopping its breathing.
Plus a shape change where the kind has one — the door's leaves retract, the lever's arm swings, the
press's ram drops.

**Crops** move count, height and width together across the six rungs, because any one of the three
alone is a step a downsample swallows. **Ripe is `cropBrackets`** — four right angles clamped to
the tile corners in a near-white straw, drawn in both the near and far forms, eight `fillRect`s, and
at 16 device px each arm is 5 px long and 2 thick. Reduced to black it is still four right angles
pointing inward. Deliberately held off `accent2` so a ripe field does not read as a goal route.

**Items** are eleven silhouettes standing on the plate under one shadow. The shadow is identical
for all eleven on purpose: it puts them on the ground, it does not tell them apart.

Thresholds: `MACHINE_DETAIL_TILE_PX 20`, `CROP_DETAIL_TILE_PX 14`, `ITEM_DETAIL_TILE_PX 16`,
`ITEM_BADGE_TILE_PX 20` — the last set to the same rung the bot's own label appears at, so the two
never disagree about having room.

**Legibility spent:** the harvest brackets are a loud, near-white, whole-tile mark that is not
strictly "a plant seen from above", and they are the noisiest thing this direction puts on a floor
tile. The trade is deliberate — `w2-02` is unsolvable if ripe is a subtle cue, and a fruit pip is a
speck at 8 CSS px. Everything else in the crop mark is quiet enough to give the brackets room.

*Worth preserving:* the machine lamp and the item bob are phased by **tile position, not by kind**.
Kind-phasing would have made the guard test pass on a distinction no eye can see. The guard measures
call streams and will happily reward a fake difference; this is the discipline that stops it.

---

## 8. The first version was sent back

The first Deep Site painters passed every legibility property and were **2.79x the `standard`
control at 48 px and 5.33x at 16 px**, against a pre-change baseline of 1.73x and 1.80x. Deep Site
was already the most expensive direction, and 0.53 ms/frame is the number the art spike measured
the *old* look at. That is precisely the margin the spike's headline claim is made of, so it went
back.

**The cause was structural, not a tuning problem, and it is the reusable finding here.**

`dither()` walks `ceil(w / cell) x ceil(h / cell)` blocks, and every `cell` in this file is a
*fraction of the tile*. So a dithered mark costs the **same number of block tests at 16 px as at
48 px**. It was the one construct on the board that got no cheaper as the board got smaller, which
is why the far forms were costing what the near forms cost — the symptom that gave it away was
`@16` measuring the same as `@48` when every other direction roughly halves.

Worst instance was an outright bug: the `regolith` item's grain passed `cell = half`, which rounds
to **1 device pixel at every zoom** — a per-pixel Bayer fill, about 190 block tests to draw one
ground stack, and it drew almost nothing.

`dither` is now gone from all three live painters and still does the terrain sheet, where it is
baked once and free. Cast shadows became two hard `fillRect` steps — which is the argument
`paintEdge` already makes for the shadow a wall throws, so it is the house language rather than a
concession. The spill pool's continuously-varying alpha became three quantised steps off a fixed
nine-string table, because a `fillStyle` string the canvas has never seen before is a colour parse,
and one per powered machine per frame is measurable.

---

## 9. Cost, measured properly

The earlier table in §5 was taken on a quiet box and the later runs were not, so the honest method
is a **same-run subtraction**: measure the `sprites` scene, measure `w1-01` (almost no sprites),
subtract *within the round* so the direction's fixed overhead and the machine's mood both cancel,
then take the min across rounds. Min-of-mins on two noisy numbers is not a valid subtraction.

**Sprite-layer cost only** — just the three new painters:

| | 48 px | 16 px | far ÷ near |
|---|---|---|---|
| standard (atlas control) | 0.340 ms | 0.336 ms | **0.99** |
| deepsite (shipped) | 0.843 ms | 0.404 ms | **0.48** |

The far forms now cost less than half the near forms. The atlas path does not get cheaper with zoom
at all — a `drawImage` costs a `drawImage` — so Deep Site now **scales better with zoom than the
thing it replaced**.

Whole-frame `deepsite:standard` on the `sprites` scene, median of five runs: **~1.58x at 48 px**
against a pre-change baseline of 1.73x, and **~1.87x at 16 px** against 1.80x. So 48 px is cheaper
than the board was before this work and 16 px sits on it, with the spread entirely inside the
control's own noise.

`survey` came out **cheaper** than the atlas path it replaced at the small tile size (0.140 →
0.083 ms) because its far form is a bar and a block rather than a blit. `signal` is flat at 48 px
and about 0.07 ms up at 16 px.

**One thing deliberately not fixed:** on a board with almost no sprites, Deep Site still sits about
**1.3x over `standard` before any painter runs** — `backdrop`'s full-screen `drawImage`, `post`'s
vignette `drawImage` and ~96 mote `fillRect`s. That is the direction's fixed atmosphere tax, it
predates this work, and it is where the next 0.1 ms is if anyone ever needs it. It was ruled not
worth the time against the form work.

---

## 10. The light has its own document

`docs/LIGHT.md`. It is not a section of this report on purpose: the lamp is being handed to the UI
lane as the rule the **whole screen** obeys, and a desk lit from one direction beside a board lit
from another looks broken in a way nobody can name. A spec that lives inside a fix report is a spec
nobody outside this lane will find.

It states the lamp (north-west, never moves), the five surface treatments, the projection rule for
cast shadow, the readability contract that draw order enforces, and the argument behind every
number. §4 names the one way the contract can still be broken — motion, at runtime rather than at
draw time. §6 is for surfaces off the board: the desk chrome consumes this document, and it records
what does *not* survive the trip to CSS.

The desk lane has already taken it. One thing that came out of answering them is worth keeping
here: **do not compute from the elevation.** "≈34°" is a gloss — `atan(0.20 / 0.28)` is 35.5° along
one axis and 26.8° along the diagonal. The two constants are the spec, and the usable form for
anything casting a shadow is `dx = dy = 1.4 × height`, equal in both axes.

---

## 11. What this pass did not do

The user's verdict on the whole spike was **"They are all just different colors. Nothing really
revolutionary."** That is correct, and it is a judgement about *form*, not about marks: all three
directions changed how marks are made and none of them changed what the game looks like. Same flat
grid of squares, same top-down orthogonal projection, same tokens sliding between cells.

Deep Site's premise is *"the board is a lit place"* and this pass applied it to **texture and
nothing else**. A lit place has height, occlusion and cast shadow, and the board has none of them.

That is the next piece of work — depth and light, characters, illustration, motion and weight —
and it is tracked separately. Three things from this pass should carry into it:

1. **Measure the smallest tile size, do not guess it.** Running the real `fit()` arithmetic against
   the real board panel is how §3 got 16 px. A cast shadow is exactly the kind of thing that reads
   beautifully at 48 px and eats ripeness at 24.
2. **Send your own work back.** The first Deep Site painters were legible and twice too expensive.
3. **Watch for costs that do not shrink with the tile.** `dither` was one. Anything whose loop
   bound is a *tile fraction* is another.

---

## 12. Parked here — how to resume

Stopped at a usage-window boundary, not at a natural end. Everything below is true as of the park;
the tree typechecks, lints to the one known pre-existing error, and the guard is green.

### What landed

**The sprite pass**, complete, for all four directions (§1–§9 above). Machines, crops and items are
authored per direction; nothing comes off the shared atlas except in `standard`.

**The form pass, concerns 1–3 of 4**, in `deepsite` only:

| concern | state |
|---|---|
| 1. Depth and light | **Landed.** Solids are volumes with a lit north arris, a black south face and a projected shadow; a pit is that picture inverted. Spec extracted to `docs/LIGHT.md`. |
| 2. Characters | **Landed.** The bot is a stooped contractor with a pack and a lamp for a face. Four facings, none told apart by hue. Cheaper than the bot it replaced — 0.41x at 16 px. |
| 3. Illustration | **Landed.** Ten machines that look like what they do, a six-rung crop ladder, eleven items distinct by silhouette first. |
| 4. Motion and weight | **Not started.** |
| — the sweep | **Not started.** Scoped below. |

`survey` and `signal` still pass every test and remain selectable. `standard` still uses the atlas.

### The state of the guard

`src/render/__tests__/marks.test.ts`, **153 cases**, green. It now also holds the bot's four facings
apart at every tile size with hue removed, posed at rest so it cannot pass on the travel offset.

### Next concern: the sweep

Its own agent, before motion, mechanical, no readability surface. Scope was ruled explicitly:

- **`deepsite.ts` live paths** — the ~11 `stepLine` call sites against the sub-2px `w` rule. The
  real target. `dither` is already clean on live paths there; its 24 remaining call sites are all
  inside the cached terrain sheet, where it is free and correct.
- **`signal`** — audit it. It ships as the monochrome accessibility mode, and a player who needs it
  is likelier than average to be on hardware where cost matters. Never audited.
- **Shared modules** — `fx.ts`, `overlays.ts`, `sprites.ts`, `trail.ts`, ~33 loops between them.
  **These matter more than any single direction, because every direction pays for them.** If a
  fourth instance exists anywhere, expect it here.
- **`survey` — do not audit, do not fix, do not measure.** It is cut. Deleting it is *nearly* clean
  and the proposal is in §13 below.
- **`standard`** — only what the guard exercises as a perf control. If it is a fixture, its cost is
  not a player's cost.

The defect it is sweeping for, the rule, and the mechanical test are in **`docs/LIGHT.md` §7**.

**§7 gained a second half after the desk lane found the hole in the first**, and the sweep must run
both: a per-element count can fall correctly while the **per-frame total stays flat**, because the
tile count rises exactly as fast as the per-tile count falls. So count draw calls for a *whole
board* at two tile sizes as well as for a single element. Anything that loops **per tile per frame**
is the shape to hunt; it has to move into a cache rather than be tuned. `deepsite` has none — all 23
`dither` sites are inside the baked sheet and the live painters loop per *object*, whose count does
not rise when the tile shrinks. `signal` and the shared modules are unaudited on both halves.

### Then: motion and weight

Alone, never sharing an agent with the sweep. Two things it inherits rather than chooses:

1. **It is the only concern that can break the readability contract at *runtime* rather than at draw
   time.** Draw order guarantees a cast shadow lands on ground and nothing else — but a bot
   animating between cells genuinely *is* on top of its neighbours mid-step, and can be over a crop
   at the moment a player is reading ripeness. `docs/LIGHT.md` §4 states this.
2. **The bot's lamp pool reaches ~0.35 T past its front face.** Mid-step it will sit over a
   neighbouring cell. It is additive warm light at 0.05–0.28 alpha and cannot hide ripeness the way
   a shadow would, so the live question is only the one in (1).

The characters agent left a named list of articulable dials — crouch, squash axis, cowl origin and
lag, stride, arm swing, carried-crate bob, lamp flicker — **every one zero at rest**, so none of
them can be used to cheat the facing guard.

### Standing instruction for every remaining brief

*If I am wrong, show me the pixels and refuse.* This is not politeness. I judged the wall extrusion
by eye at ~1.5 tiles and sent it back; the agent sampled the terrain cache, showed it was 0.2 of a
tile, and that what I had read as columns was the maze's own multi-cell wall runs. It kept the two
observations that survived the evidence and dropped the one that did not. A sub-agent that folds to
a wrong instruction costs more than one that argues.

---

## 13. Proposal: deleting `survey`

Not done, because it needs two files this lane may not write. The registry side is clean.

**Clean, inside `src/render/`:**

- delete `src/render/art/survey.ts` (its only exports are `PAPER`, `INK` and `survey`, and nothing
  outside the file reads `PAPER` or `INK`);
- `src/render/art/index.ts` — drop the import, the `DIRECTIONS` entry and the `ART_IDS` entry;
- `src/render/art/types.ts` — drop `'survey'` from the `ArtId` union;
- `src/render/__tests__/marks.test.ts` — the hook-count expectation lists `survey:3`;
- `src/render/trail.ts:51` — one prose mention in a comment.

**Needs `src/ui/`, which this lane may not write:** remove the `import './styles/art/survey.css';`
line from `src/ui/App.tsx`, and delete `src/ui/styles/art/survey.css` (~550 lines, entirely
`[data-art='survey']` rules).

**Intent:** `survey` is cut from the shipping picker, so its stylesheet is ~550 lines of dead CSS
shipped to every player and its direction file is ~1,970 lines the next agent into `art/` has to
read past. Removing it also removes a third of the sweep's surface.

**One thing to check before taking it:** `src/__tests__/unused-exports.test.ts` pins an exact count
of exports whose only reader is a test. Deleting three exports may move it. That file is a ratchet
this lane may not edit — the change belongs to whoever owns it, and the scan reports paths by
*declaring module*, so the entries to look for are `src/render/art/survey.ts`.

---

## 14. The cost sweep

`docs/LIGHT.md` §7 states the rule and the two tests. This ran both, over `deepsite`'s live paths,
`signal` on both halves, and the four shared modules. `survey` was not audited; it is deleted in
§15 below.

**Headline: one new instance, in `deepsite`. The shared modules — where a fifth was expected — are
clean.** Everything below is measured through the counting context in `marks.test.ts`, never by
reading the code and reasoning about it.

### 14.1 What was checked, and what it cost

| surface | verdict |
|---|---|
| `deepsite` `dither` — 23 call sites | **clean, and the claim is now verified rather than trusted.** Every site sits at line ≤ 936; `buildSheet` starts at 984 and every sheet-row painter is called only from inside it. The sheet is keyed `${T}|${biome}` and the board pays one `drawImage` per frame for the lot. |
| `deepsite` `hazard` — 2 call sites | clean, same argument: both inside sheet painters. |
| `deepsite` `stepLine` — 13 live calls | **one miss.** Twelve carry a `Math.max(2, …)` floor. The crate's brace at `deepsite.ts:3436` did not. |
| `signal` | clean of this defect class. Its terrain is baked exactly like `buildSheet` — `ensureSheet` rebuilds a 20-stamp strip only when `tilePx` moves, and `paintTerrain` runs off `TerrainLayer.sync`, not per frame. Its live loops are all bounded by a fixed part count. |
| `fx.ts`, `overlays.ts`, `sprites.ts`, `trail.ts` | **clean.** No loop in any of the four takes its bound from a tile size, a tile fraction or a device-pixel step. Every bound is a literal, a `strength`-derived scalar, or a data count. `drawGrid` builds the whole viewport into two `stroke()` calls. `fx`'s pool is a flat 900-slot scan, tile-size-independent. |
| `renderer.ts` | clean. Every per-frame loop walks a data count — `cropCells`, `markCells`, `conveyorCells`, `world.machines`, `world.items`, bot poses — indexed once per tick by `indexSnapshot`, never a scan of the grid. |
| `standard` | rises: 3 draw calls at 16 px against 2 at 48. It is the atlas control, its cost is not a player's cost, and the guard excludes it by name. |

Every `Math.max(1.5, …)` and `Math.max(1, tilePx * k)` in the shared modules is a **stroke width or
a radius inside a single draw call**, not a loop bound. That is the correct legibility pattern and
the opposite of the defect; `overlays.ts:19-27` already names the distinction. Worth stating because
the two shapes grep identically.

### 14.2 The instance

`deepsite.ts:3436` — the crate's diagonal brace:

```
const bw = tileSpan(T, 0.09);       // max(1, round(T * 0.09)) — 1 device px at T ≤ 16
```

`tileSpan` floors at one device pixel, so at a 16 px tile on a 1x panel the brace walked one
`fillRect` per device pixel of span while the span kept scaling with the tile. The crate went **up**
as it got smaller: **18 draw calls at 16 px against 16 at 48 px.** The three sibling `stepLine` sites
in the same file (`2830`, `3359`, and the bot's at `2043`) all carry the floor and say why in a
comment; this one was the outlier. Fixed to `Math.max(2, tileSpan(T, 0.09))` — the same expression
its neighbours use.

Small in isolation, and it flipped a verdict: the whole-campaign per-frame ratio for `deepsite` at
1x went from **1.002 to 0.993** — from failing the board test to passing it — on that one word.

### 14.3 Did the board test disagree with the element test?

**Yes, on `signal`, and that is the case §7's second half exists for.**

Per element `signal` passes: its machine layer is 136 calls at 16 px against 147 at 48. Per object
over a real board it is **0.985 — flat**. On `w5-02` zooming from 48 px to 16 px pulls 1.59x more
objects into view against a per-object cost that does not fall, so the *frame* gets **1.567x more
expensive as the board gets smaller.** The element test cannot see that; only the board test can.

`deepsite` fails the same board comparison on `w8-05` (1.45x) for the opposite reason — its
per-object cost *does* fall, to 0.58, but the viewport reveals 2.5x more objects.

**Neither was tuned, and neither should be.** The absolute numbers are why:

| | peak draw calls per frame | where |
|---|---|---|
| `signal` | **4,661** | `w5-02`, 24 device px, 1x |
| `deepsite` | ~3,300 | `w5-02`, 20 device px |
| `standard` | 811 | `w5-02` |

Four thousand calls a frame is not a frame-rate problem, and the ratio that looks bad is
*revealing more of the board*, which is real work that no amount of baking makes free. A ratio can
always be satisfied by making the near rung worse. So the board half of the guard is pinned as an
**absolute ceiling** rather than as a ratio.

### 14.4 The thing that is not a defect, and the number that goes with it

Every detail rung in this renderer is written `tilePx >= K * dpr` — nine gate sites across
`deepsite.ts`, `signal.ts`, `overlays.ts` and `sprites.ts`. That is a *screen*-pixel threshold, and
it is deliberate: `overlays.ts:19-27` records it as a fix for "a `tilePx < 18` cutoff hides a gauge
at 18 css px while showing it at 9", which reads as the overlay being broken on your machine.

The cost consequence had not been measured, and it is large:

| | far ÷ near, 1x | far ÷ near, 2x |
|---|---|---|
| `deepsite` crops | **1.000** | 0.278 |
| `deepsite` items | 0.984 | 0.782 |
| `signal` crops | **1.000** | 0.609 |
| `signal` items | 0.991 | 0.757 |
| campaign, per frame | 0.993 / 1.048 | 0.731 / 0.880 |

**§9's headline `far ÷ near = 0.48` is a 2x-only number.** On a 1x panel the rungs sit at half the
device-pixel budget, so almost nothing drops its detail before the guard's floor and the sprite
layer barely gets cheaper at all. Anyone quoting 0.48 as the direction's scaling should know it
describes retina and nothing else.

**This was not changed, and the refusal is on the evidence.** The near form at 16 device px is not
an invisible mark being paid for: rasterised into a 16x16 buffer, a ripe `deepsite` crop draws 48
fills of which **44 change a pixel**, and lands **6 distinct colours** against the far form's 5 from
13 fills — mean per-channel difference 53.7. It is a genuinely richer picture, the extra cost is
bounded at ~4,000 calls a frame, and the standing rule is that the board wins. Flipping the gates to
device pixels would buy cost that no player can perceive by spending legibility that they can, and
would re-open the bug `overlays.ts` documents.

Checked while there: the six maturity rungs and ripe-against-every-unripe stay apart **in actual
pixels**, not merely in call streams, at 16/20/24/32/48 px and at both `dpr`, in both shipping
directions. There is no legibility hole hiding behind the gate — only a cost one, and it is priced.

### 14.5 The guard

`src/render/__tests__/marks.test.ts` gained a cost section. It reuses the recording context the
distinctness properties already use, counting the stream instead of comparing it, so there is one
stand-in for the canvas in that file and not two. Everything runs at `dpr` 1 **and** 2, because §9's
numbers came from 2 alone.

1. **No mark costs more at the floor than at 48 px** — every machine kind and state, every crop
   rung, every item kind, every bot facing. This is what catches the crate; it names the offender
   and both numbers rather than returning a bare `false`. Verified to fail by reverting the fix.
2. **No layer costs more at the floor than at 48 px** — the granularity §9's ratio was measured at.
3. **Per frame, whole board: an absolute ceiling of 6,000 draw calls**, over **every level in the
   campaign** at every rung of `TILE_SIZES`, both `dpr`, both shipping directions. Every level, so
   one added later is measured without anyone remembering to add it — and because the shape only
   shows on the big boards. `w5-02` peaks at **24 device px**, not at the floor, which is not a rung
   anyone would have sampled by hand.

One exception is carried as an entry rather than as a loosened bound: `signal machine antenna/idle
@2x`, 15 calls at the floor against 13 at 48. Its cost across the ladder runs 15, 15, 10, 9, 13 —
wobble around a bound of sixteen, because `signal` builds every glyph from a fixed eight rows of at
most two spans and its far form is already one `fillRect` per span, the cheapest a span can be
drawn. Bounded by a part count is what §7 calls safe by shape, and sixteen is sixteen at every zoom.

The guard is **123 cases** where it was 153; deleting `survey` removed a direction's worth and the
cost section added eight.

### 14.6 Not done

- The `* dpr` detail gates, deliberately — §14.4 has the argument and the pixels.
- `survey` was not audited, as scoped. It is deleted below.
- No motion or weight work; that concern is still untouched.

---

## 15. `survey`, deleted

§13's proposal, taken. Inside `src/render/`:

- `src/render/art/survey.ts` — gone, ~1,970 lines;
- `src/render/art/index.ts` — import, `DIRECTIONS` entry and `ART_IDS` entry dropped;
- `src/render/art/types.ts` — `'survey'` out of the `ArtId` union;
- `src/render/__tests__/marks.test.ts` — the hook-count expectation is now
  `['standard:0', 'signal:3', 'deepsite:3']`;
- `src/render/trail.ts:51` — the prose mention.

The picker ships two entries: **Deep Site** (default) and **Signal**. `standard` survives as the
guard's atlas control and never reaches a player.

`src/__tests__/unused-exports.test.ts` **did not move.** `KNOWN_TEST_ONLY` stays `[70, 32]` and
`KNOWN_DEAD` is unchanged — `PAPER` and `INK` had no readers outside their own file at all, so they
were never counted, and `survey` itself was read by the registry. No ratchet edit is needed.

`src/ui/` was not touched, as scoped. A stale `import './styles/art/survey.css';` in `src/ui/App.tsx`
and the ~550-line stylesheet it names are the desk lane's half; nothing in `src/render/` refers to
either, and the build is green with them present or absent.

---

## 16. The crop and the ice-scrub

`w2-05` is one reading: *"two things grow in the west field. one of them is the crop. the other is
ice-scrub, which likes the same soil and is worth nothing to anybody."* Both grow on `Terrain.Soil`,
both carry `growth`/`maxGrowth`, and the level is a shift too short to visit the whole field — so
the player has to decide from the board and the sensor which tiles are worth the wheels.

**They were the same picture.** Not a near miss, not a weak tell: the same picture.

### 16.1 The defect, traced rather than grepped

The kind lives on the tile. `src/engine/types.ts:89` is `crop?: ItemKind`, and `w2-05.ts` sows
`ItemKind.Crop` at lines 79 and 92 and `ItemKind.Ice` at line 104 — sixteen scrub tiles against
twelve or thirteen crop ones, on the same soil, per seed. It is on the sensor: `Sim` copies it into
`TileView.crop` at `src/engine/sim.ts:1083`, `scan().crop` returns `"crop"` or `"ice"`, and the
level's own facts table sells that as the instrument the level teaches.

It stopped at the renderer. `Renderer.indexSnapshot` selects crop cells on `maxGrowth > 0` alone
(`renderer.ts:1165`), which is correct — both kinds grow. `drawCrops` then filled `CropPaint` with
`x`, `y`, `growth`, `max`, `stage` and `ripe` and **nothing else**: `CropPaint` had no field for the
kind at all, so `tile.crop` was read nowhere on the draw path in any direction. Both authored
painters were therefore correct and both were blind. `deepsite.paintCrop` and `signal.drawCrop` drew
the same six-rung ladder for a crop and for a weed, and no amount of art direction could have fixed
it, because the distinguishing fact never arrived.

`marks.test.ts` could not have caught it either. Its `cropStream` fixture built a `CropPaint` by
hand from the same six fields, so the guard that exists to prove two different things draw two
different marks had no way to express these two things.

### 16.2 What changed about the form

`CropPaint` gained `kind`, and `drawCrops` sets it from `tile.crop ?? 'crop'`. Then both directions
were given a second form — **not a recolour and not a smaller plant**.

The argument is what the two things *are*. A crop is cultivated: it stands in ground somebody
turned, its stems are vertical, its plants sit at an even pitch down a row, and when it is ready it
wears the harvest brackets. Ice-scrub is volunteer growth. It sprawls, it has no stem, it is not on
the row, it turns no ground, and **it never wears the brackets however ripe the tile says it is** —
a bracket means "worth the two ticks" and a weed never is, even though `harvest()` will happily
spend a hopper slot on one.

**Deep Site** spends the tell `docs/LIGHT.md` §2 already spends on the three obstacle classes:
height, and the light that comes with it. A crop is a volume — mound, lit west shoulder, dark east
flank, a shadow cast south-east. Scrub lies flat on the plate, so it has no shoulder, no flank and
nothing to cast: one flat value, a low off-centre node, and two to five arms splayed out of it,
none of them the vertical every crop stem is. Beside a thing that stands up it reads as scribble on
the floor. Maturity is arms and reach, never height and never a head.

**Signal** makes the same claim in its own grammar. Every crop rung stands on the soil rule, in the
centre column, tapering upward, and the ripe one is enclosed in a bracket on the hot phosphor. Scrub
draws **no soil rule** — nobody worked this ground, and "sown but bare" and "a weed came up here"
are different facts a player acts on differently — no column, no stalk, no bracket, and never the
hot phosphor. What is left is one to six short runs scattered low across the tile at no pitch and on
no baseline: wide and ragged against centred and vertical.

### 16.3 Hue removed

Deep Site's scrub is `#55707d`. Its relative luminance is **0.1500** against the crop leaf's
`#5f7247` at **0.1492** — contrast against the floor plate `#4c5661` is **1.423** for the scrub and
**1.417** for the leaf. The two are the same value to three decimal places, deliberately: there is
no room left for this mark to be passing on hue while looking like form, and the scrub sits at the
same contrast against the floor that the crop's own mid leaf does. Ripe stays the brightest thing on
the tile at 6.07 against the floor, untouched.

`signal` is one phosphor and never had a hue to lean on; its scrub differs by alpha *and* by
structure.

### 16.4 The floor, in call streams and in pixels

`marks.test.ts` gained a `crop against scrub` block over the two directions that author a crop —
`standard` reads one plant out of the atlas and has no second frame to reach for, the same line the
cost section draws. It is a collision check over the **union of the two ladders**, hue removed,
at 16/20/24/32/48 px, plus a no-motion no-type run at the floor, plus ripe-crop against every scrub
rung. The union matters: a scrub that draws what a crop three rungs down draws is the same defect
wearing a different number, and it is the shape a "make the weed smaller" fix produces.

Checked in **actual pixels** as well as in call streams, by rasterising every rung of both kinds
into a tile buffer at 16/20/24/32/48 px, both `dpr`, both directions: **no crop rung is
pixel-identical to any scrub rung**, anywhere on that grid.

### 16.5 Cost, both halves of §7

Per element and per layer, draw calls, at the floor and at 48 px:

| | 16 px | 24 px | 48 px |
|---|---|---|---|
| `deepsite` scrub layer (six rungs) | 50 | 71 | 91 |
| `deepsite` scrub, per rung | 3–15 | — | 5–27 |
| `signal` scrub layer | 21 | 21 | 21 |

Deep Site's scrub falls with the tile by shape: the arms are stepped lines whose weight never drops
below **two device pixels**, which is §7's bound, so the step count is `reach / w` and shrinks with
the tile rather than flooring at a hairline. Signal's is flat — bounded by a part count, which is
what §7 calls safe by shape, and one to six `fillRect`s is already the cheapest a run can be drawn.
Neither loops per tile per frame, so neither needed baking.

The whole-board half: `w2-05`'s crop layer across all five seeds and all five rungs peaks at **901**
calls (`deepsite`) and **172** (`signal`), against the standing per-frame ceiling of 6,000 that the
guard applies to every level in the campaign. The campaign peak is unchanged — `w2-05` is the only
level that sows anything but crop, and `boardStream` now passes the tile's kind so the ice tiles are
measured rather than counted as crops.

The guard is **145 cases** where it was 123.

### 16.6 The shot

`docs/shots/sprites/crop-vs-scrub-24px.png`. Bare, unripe, nearly-ripe and ripe crop beside young
and spread scrub, at **24 device px** — the legibility floor the campaign plays at — magnified 4x
nearest-neighbour, in both shipping directions and at both `dpr`, because Deep Site's detail gate is
a *screen*-pixel threshold and 24 device px is the near form on a 1x panel and the far form on a 2x
one. Both are real and both are shown. The right half is the same sheet with every pixel collapsed
to its luminance.

Rasterised straight out of the painters rather than captured from a browser: a capture pipeline
resamples, and the claim being made is about the pixel structure at the floor.

### 16.7 Ratchets

Neither moved. `src/__tests__/unused-exports.test.ts` is unchanged — `kind` is a field on an
existing exported interface, not a new export — and `confessed-invariants.test.ts` is unchanged.
Full suite 2,056 tests over 96 files, from 2,034.

### 16.8 Not done

Nothing outside `src/render/`. In particular `standard` still draws one plant for both kinds; it is
the guard's atlas control and never reaches a player (§15), and giving the atlas a second frame
would be an asset change rather than a rendering one.
