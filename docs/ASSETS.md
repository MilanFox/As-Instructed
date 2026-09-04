# ASSETS — inventory for the renderer

Machine-usable inventory of everything under `public/assets/` and `public/fonts/`.
Licences: `public/assets/LICENSES.md`. Human sanity-check: `docs/assets-preview.png`.

Everything is **CC0 (Kenney.nl)** or **OFL (fonts)**. Total committed: **2.1 MB / 135 files**.

---

## 1. Read this first

`docs/DESIGN.md` §8 fixes tile size at **48 px**, integer scaling,
`imageSmoothingEnabled = false`. Kenney's top-down art is authored at **64 px**, which
does not scale to 48 by an integer factor. Blitting 64 → 48 at runtime with smoothing
off produces visible row-drop aliasing.

So the assets are delivered in two layers:

1. **`tiles/bootstrap_tiles_48.png` — the primary target.** A curated atlas,
   pre-resampled to exactly 48x48 with Lanczos at build time. Blit it 1:1.
   This is what the renderer should use for everything.
2. **`tiles/kenney_*/` — the original 64 px sheets**, kept verbatim with their XML
   atlases. Use these only when you need a tile the curated atlas does not have;
   then add it to the atlas rather than scaling at runtime.

---

## 2. Primary atlas — `public/assets/tiles/bootstrap_tiles_48.png`

| Property | Value |
|---|---|
| Image | `public/assets/tiles/bootstrap_tiles_48.png` |
| Dimensions | 768 x 432 px (159 KB) |
| Tile size | 48 x 48 px |
| Grid | 16 columns x 9 rows, no margin, no spacing |
| Frames | 134 |
| Atlas file | `bootstrap_tiles_48.json` (custom JSON, format below) |
| Colour | RGBA, straight alpha |

```jsonc
{
  "image": "bootstrap_tiles_48.png",
  "tileSize": 48, "columns": 16, "rows": 9,
  "width": 768, "height": 432,
  "sources": { "scifi": "kenney_sci-fi-rts/scifi_tilesheet.png", "...": "..." },
  "frames": {
    "floor.metal": {
      "x": 0, "y": 0, "w": 48, "h": 48,
      "src": { "sheet": "tds", "x": 256, "y": 192, "w": 64, "h": 64 }
    },
    "blocker.crate_metal": {
      "x": 336, "y": 96, "w": 48, "h": 48,
      "src": { "sheet": "tanks", "key": "crateMetal.png", "x": 596, "y": 588, "w": 56, "h": 56 }
    }
  }
}
```

`frames[name]` is always a 48x48 rect in the atlas — `x`/`y`/`w`/`h` is all the
renderer needs. `src` is provenance only (which source sheet and pixel rect the tile
came from); nothing at runtime should read it.

Minimal usage:

```ts
const atlas = await (await fetch('/assets/tiles/bootstrap_tiles_48.json')).json();
const img = new Image(); img.src = '/assets/tiles/' + atlas.image;
// ...
const f = atlas.frames['floor.regolith'];
ctx.drawImage(img, f.x, f.y, f.w, f.h, px, py, 48, 48);
```

Two shapes of frame, both already normalised to 48x48:

- **Full-bleed floors** cover the whole cell and tile seamlessly against themselves.
- **Props** (everything under `blocker.*`, `feature.*`, `ore.*`, `rock.*`, `plant.*`,
  `item.*`, `overlay.*`) are transparent-background sprites centred in the cell, and
  must be drawn *on top of* a floor tile. Non-square source sprites were fit to the
  48-box preserving aspect (e.g. `feature.cable` is an 11x48 wire inside a 48x48 cell).

---

## 3. Source sheets (kept verbatim)

All grids are **64 x 64 px tiles, 0 margin, 0 spacing**, top-left origin, unless noted.
`col,row` → pixel rect is `(col*64, row*64, 64, 64)`.

| id | Path | Dimensions | Tile | Grid (cols x rows) | Atlas file |
|---|---|---|---|---|---|
| `scifi` | `tiles/kenney_sci-fi-rts/scifi_tilesheet.png` | 1152 x 448 | 64 | 18 x 7 | none — grid only |
| — | `tiles/kenney_sci-fi-rts/scifiRTS_spritesheet.png` | 513 x 513 | varies | packed | **XML** `scifiRTS_spritesheet.xml` (Starling/TexturePacker `SubTexture name x y width height`) |
| `tds` | `tiles/kenney_topdown-shooter/tilesheet_complete.png` | 1728 x 1280 | 64 | 27 x 20 | none — grid only |
| `soko` | `tiles/kenney_sokoban/sokoban_tilesheet.png` | 832 x 512 | 64 | 13 x 8 | none — grid only |
| — | `tiles/kenney_sokoban/sokoban_spritesheet.png` | 600 x 598 | varies | packed | **XML** `sokoban_spritesheet.xml` |
| `map` | `tiles/kenney_map-pack/mapPack_tilesheet.png` | 1088 x 768 | 64 | 17 x 12 | none — grid only |
| — | `tiles/kenney_map-pack/mapPack_spritesheet.png` | 896 x 896 | varies | packed | **XML** `mapPack_spritesheet.xml` (188 sprites) |
| `td` | `tiles/kenney_tower-defense/towerDefense_tilesheet.png` | 1472 x 832 | 64 | 23 x 13 | none — grid only |
| `tanks` | `tiles/kenney_tanks/onlyObjects_retina.png` | 782 x 782 | varies | packed | **XML** `onlyObjects_retina.xml` (147 sprites, **semantic names**) |

Notes:

- `tanks` is the *retina* (2x) sheet on purpose — its sprites are 56–139 px, so they
  downscale into the 48 px atlas instead of being upscaled.
- The three XML files are the packs' own atlases and are the authority for those
  sheets. The XML sprite names in `tanks` are meaningful (`crateMetal.png`,
  `fenceYellow.png`, `wireStraight.png`); in `scifi`/`soko`/`map` they are just
  numbered (`scifiTile_07.png`, `mapTile_142.png`) and carry no semantics.
- The 64 px grids above have **no** shipped atlas file. Coordinates in this document
  were verified by cropping and viewing the sheets, plus a per-cell statistical pass
  (mean colour / stddev / alpha coverage) to confirm which cells are plain floors.
- Row 12–15 of `td` (cols 0–13) and rows 16–19 of `tds` are furniture / house
  interiors. Ignore them; they are off-tone.

Also present but not part of the tile atlas:

| Path | Dimensions | Notes |
|---|---|---|
| `ui/kenney_board-game-icons/iconsDefault.png` | 1344 x 832 | 64 px grid, 21 x 13, **0 spacing**. Pure white icons on transparent — tint at runtime with `globalCompositeOperation` or an offscreen canvas. |
| `ui/kenney_ui-pack/*.png` | 82 loose PNGs | 9-slice-able panels, buttons, checkboxes, sliders (Grey/Default set) |
| `ui/kenney_cursors/*.png` | 24 loose PNGs | curated cursor subset, see §7 |

---

## 4. Tile vocabulary

Every name below is a key in `bootstrap_tiles_48.json.frames` unless it says
`DRAW_IN_CODE`. `src` column is `sheet col,row` for grid tiles or the XML sprite name.

### 4.1 Floors (full-bleed, tileable)

| Semantic name | atlasKey | src | Looks like |
|---|---|---|---|
| `floor.metal` | ✅ | `tds 4,3` | flat dark asphalt/deck plate, `#4a4a4a`, dead uniform |
| `floor.metal.dot` | ✅ | `tds 5,3` | same + small yellow marker dot |
| `floor.metal.bolt` | ✅ | `tds 6,3` | same + yellow ring / bolt head |
| `floor.metal.dash` | ✅ | `tds 3,3` | same + short yellow floor stripe |
| `floor.metal.line_v` | ✅ | `tds 0,1` | yellow bay line down the left edge |
| `floor.metal.line_h` | ✅ | `tds 1,2` | yellow bay line across the upper edge |
| `floor.metal.corner` | ✅ | `tds 2,1` | yellow bay-line corner (top + right) |
| `floor.metal.w_line_v` | ✅ | `tds 7,1` | white variant of `line_v` |
| `floor.metal.w_dash` | ✅ | `tds 8,3` | white variant of `dash` |
| `floor.metal.w_bolt` | ✅ | `tds 13,3` | white variant of `bolt` |
| `floor.grating` | **DRAW_IN_CODE** | — | `floor.metal` base + 6 px dark slots with 2 px light bevel, repeating on one axis; draw once to an offscreen 48² canvas and cache as a pattern |
| `floor.plate` / `.b` / `.c` | ✅ | `td 19,7` / `20,7` / `21,7` | bevelled blue-grey plate, square / octagonal / chamfered insets |
| `floor.plate.diamond` | ✅ | `td 22,7` | bevelled diamond plate |
| `floor.concrete` | ✅ | `tds 6,12` | flat pale blue-grey concrete `#9cc0c2`, dead uniform |
| `floor.concrete.b` | ✅ | `tds 0,12` | same with faint speckle |
| `floor.gravel` | ✅ | `td 21,6` | blue-grey speckled gravel/rubble |
| `floor.regolith` / `.b` | ✅ | `scifi 0,0` / `1,0` | rust-orange Martian regolith `#ba6343`, two variants |
| `floor.regolith.rocky` | ✅ | `scifi 4,0` | regolith with a grey stone vein |
| `floor.dirt` | ✅ | `map 8,4` | soft brown soil `#d69664` |
| `floor.tilled` | **DRAW_IN_CODE** | — | `floor.dirt` base + 4–5 horizontal furrows (2 px shadow, 1 px highlight); rotate 90° for the cross-ploughed variant |
| `floor.rock` | ✅ | `map 13,0` | grey stone plateau `#89a2a3` |
| `floor.ice` | ✅ | `scifi 0,1` | pale cyan ice sheet `#b5e0e2` with crack lines |
| `floor.ice.b` | ✅ | `tds 7,0` | flatter, greyer frost `#9bbfc1` |
| `floor.snow` | ✅ | `tds 11,0` | near-white snow `#f1f1f1` |
| `floor.sand` | ✅ | `map 3,0` | warm sand `#e5d4b1` |
| `floor.clay` | ✅ | `tds 12,0` | saturated orange clay `#d37c48` |
| `floor.circuit` | **DRAW_IN_CODE** | — | dark `#121820` base + 2 px `--accent` (`#35e0c8`) traces on a 12 px sub-grid with 4 px pad squares at junctions; needs 4–6 rotations to look non-repeating |
| `floor.hazard` | **DRAW_IN_CODE** | — | 45° stripes, 8 px `--accent-2` (`#ffb020`) alternating with 8 px `#2a2a2a`; trivially exact at 48 px (`ctx.rotate` + `createPattern`) |
| `floor.water` | ✅ | `map 15,11` | pale blue water `#abe5f8` |
| `floor.grass` | ✅ | `tds 0,0` | flat green `#27ae60` — for the terraformed finale only |

### 4.2 Walls and blockers

| Semantic name | atlasKey | src | Looks like |
|---|---|---|---|
| `wall.metal` | ✅ | `td 17,6` | blue-grey panel with a single vertical seam |
| `wall.metal.b` | ✅ | `td 17,7` | double vertical seam |
| `wall.metal.c` | ✅ | `td 17,8` | horizontal seam / hatch line |
| `wall.panel` | ✅ | `soko 11,6` | grey diamond-tread plate — the most "machine room" of the set |
| `wall.rock` / `.b` | ✅ | `soko 8,6` / `8,7` | grey stone blocks, square / rounded |
| `wall.brick` / `.b` | ✅ | `soko 6,6` / `7,6` | red brick, two bonds |
| `wall.brick.orange` | ✅ | `tds 16,2` | orange industrial brick |
| `wall.wood` | ✅ | `tds 16,3` | tan plank wall |
| `blocker.crate_metal` | ✅ | `tanks crateMetal.png` | grey metal crate, X bracing, top-down |
| `blocker.crate_wood` | ✅ | `tanks crateWood.png` | brown wooden crate, top-down |
| `blocker.container` / `.b` | ✅ | `scifi 2,6` / `3,6` | open-top cargo bin, orange fill / green fill |
| `blocker.barrel` | ✅ | `tanks barrelRust_top.png` | rusted grey barrel, top-down |
| `blocker.barrel.black` | ✅ | `tanks barrelBlack_top.png` | dark barrel with a **red** lid |
| `blocker.barrel.green` | ✅ | `tanks barrelGreen_top.png` | green-lidded barrel |
| `blocker.barrel.red` | ✅ | `tanks barrelRed_top.png` | red-lidded barrel |
| `blocker.pipe` | ✅ | `scifi 1,6` | grey pipe elbow, top-down |
| `blocker.fence` | ✅ | `tanks fenceYellow.png` | yellow/black hazard rail, horizontal |
| `blocker.fence.red` | ✅ | `tanks fenceRed.png` | red/white barrier rail, horizontal |
| `blocker.barricade` | ✅ | `tanks barricadeMetal.png` | metal X caltrop barricade |
| `blocker.barricade_wood` | ✅ | `tanks barricadeWood.png` | wooden X barricade |
| `blocker.sandbag` / `.brown` | ✅ | `tanks sandbagBeige.png` / `sandbagBrown.png` | sandbag stack, beige / brown |

Fence/rail sprites are authored horizontal only. Rotate 90° in the renderer for
vertical runs — they are symmetric enough that this reads correctly.

### 4.3 Features

| Semantic name | atlasKey | src | Looks like |
|---|---|---|---|
| `feature.landing_pad` | ✅ | `tds 5,1` (2x2 block) | yellow painted square outline on dark deck — composited from the sheet's 2x2 marking and squashed to one tile |
| `feature.landing_pad.w` | ✅ | `tds 12,1` (2x2 block) | white variant |
| `feature.door` | ✅ | `tds 17,12` | pale frame with a dark sealed panel — reads as a closed hatch/door |
| `feature.hatch` | ✅ | `tds 16,13` | large pale ring around a black opening — open hatch |
| `feature.terminal` | ✅ | `td 16,3` | grey-blue console tile with a wrench glyph |
| `feature.terminal.offline` | ✅ | `td 17,3` | same tile with an X glyph — use for unpowered/faulted |
| `feature.power_node` | ✅ | `tds 17,13` | pale ring with a dark hub, top-down |
| `feature.power_node.b` | ✅ | `td 18,3` | console tile with a concentric target glyph |
| `feature.node_blank` | ✅ | `td 15,3` | the same console tile with no glyph — base for code-drawn overlays |
| `feature.cable` | ✅ | `tanks wireStraight.png` | thin grey cable running along one axis (11x48 in cell) |
| `feature.cable.bend` | ✅ | `tanks wireCrooked.png` | cable with a bend |
| `feature.antenna` | ✅ | `scifi 14,0` | mast with a dish and struts |
| `feature.dish` | ✅ | `scifi 15,0` | squat parabolic dish on a pedestal |
| `feature.silo` / `.b` | ✅ | `scifi 16,0` / `17,0` | orange-and-grey storage silo, two profiles |
| `feature.tanks` | ✅ | `scifi 17,2` | paired blue liquid tanks |
| `feature.hangar` | ✅ | `scifi 15,1` | grey barrel-vault hangar |
| `feature.dome` | ✅ | `scifi 16,2` | habitat dome |
| `feature.factory` | ✅ | `scifi 14,2` | saw-tooth roof factory with orange panels |
| `feature.refinery` | ✅ | `scifi 16,1` | block plant with an orange stack |
| `feature.drill` | ✅ | `scifi 0,6` | derrick / mining drill |
| `feature.conveyor` | **DRAW_IN_CODE** | — | `floor.metal` base + a 32 px dark belt with 6 px cross-slats; animate by offsetting the slat phase by `tick % n` — a static sprite would waste the free animation |
| `feature.solar_panel` | **DRAW_IN_CODE** | — | dark blue-black rect inset 4 px, 3x3 cell grid in `#1b3a5a` with 1 px `#35e0c8` gridlines and a grey frame; no CC0 top-down solar panel exists in any Kenney pack |
| `feature.pit` | ✅ | `tds 22,11` | irregular black hole/void blob |
| `feature.oil` | ✅ | `tanks oilSpill_large.png` | dark olive spill splat |
| `feature.coolant` | ✅ | `tds 20,11` | grey pool with a hot orange centre |
| `feature.coolant.b` | ✅ | `tds 19,11` | pale grey-blue puddle |
| `feature.lava` | ✅ | `tds 18,11` | solid molten-orange pool |

### 4.4 Ore, rock, plants (growth / depletion ladders)

`ore.stage1 → stage2 → stage3 → rich → rich.b` is a size ladder, small to large;
run it backwards for depletion. `rich`/`rich.b` add green and gold crystal flecks.

| Semantic name | atlasKey | src |
|---|---|---|
| `ore.stage1` … `ore.stage3` | ✅ | `scifi 1,4` / `2,4` / `3,4` |
| `ore.rich`, `ore.rich.b` | ✅ | `scifi 4,4` / `5,4` |
| `rock.small`, `rock.medium`, `rock.large` | ✅ | `scifi 1,5` / `2,5` / `3,5` |
| `rock.crystal`, `rock.crystal.b` | ✅ | `scifi 4,5` / `5,5` |
| `rock.boulder` | ✅ | `tds 20,8` |

Plant growth, in order (purple alien crop from the Sci-Fi RTS pack):

| Semantic name | atlasKey | src | Stage |
|---|---|---|---|
| `plant.stage0` | ✅ | `scifi 4,3` | bare seed in the soil |
| `plant.stage1` | ✅ | `scifi 5,3` | sprout bud |
| `plant.stage2` | ✅ | `scifi 2,3` | small capped stalk |
| `plant.stage3` | ✅ | `scifi 0,3` | pod, unharvestable |
| `plant.stage4` | ✅ | `scifi 1,3` | tall pod — harvest here |
| `plant.mature` | ✅ | `scifi 3,3` | full tree, the World-2 finale look |
| `plant.alt.small` / `.large` | ✅ | `scifi 4,6` / `5,6` | green succulent, second crop species |
| `plant.bush` / `.dead` | ✅ | `tds 18,8` / `19,8` | green / withered scrub |
| `plant.tree` / `.dead` | ✅ | `tanks treeGreen_small.png` / `treeBrown_small.png` | round canopy, top-down |

### 4.5 Items

| Semantic name | atlasKey | src | Looks like |
|---|---|---|---|
| `item.crate.brown` | ✅ | `soko 6,3` | flat top-down crate, brown |
| `item.crate.red` | ✅ | `soko 7,3` | red |
| `item.crate.blue` | ✅ | `soko 8,3` | blue |
| `item.crate.green` | ✅ | `soko 9,3` | green |
| `item.crate.grey` | ✅ | `soko 10,3` | grey |
| `item.crate.<colour>.dark` | ✅ | `soko 6..10,4` | same five with a heavy dark outline — use for "already sorted / locked" |
| `item.core.brown` | ✅ | `soko 12,1` | faceted gem, amber |
| `item.core.red` | ✅ | `soko 12,2` | red |
| `item.core.blue` | ✅ | `soko 12,3` | cyan-blue — the default **data core** |
| `item.core.green` | ✅ | `soko 12,4` | green |
| `item.core.grey` | ✅ | `soko 12,5` | grey/inert |
| `item.ore.red` | ✅ | `scifi 0,4` | single small orange ore chunk |
| `item.ore.grey` | ✅ | `scifi 0,5` | single small grey ore chunk |
| `item.shard` / `.b` | ✅ | `tds 20,9` / `18,9` | scattered ice/crystal shards |
| `item.debris` | ✅ | `tds 18,10` | scattered orange rubble |
| `item.coin` | ✅ | `soko 9,5` | gold token — credits / score pickups |
| `item.seed` | ✅ | `scifi 4,3` | tiny brown seed (same art as `plant.stage0`) |
| `item.battery` | **DRAW_IN_CODE** | — | 20x30 rounded rect, dark `#1b2430` body, 6 px `--ok` (`#7ee06a`) charge bar, 6x4 grey terminal nub on top; no CC0 top-down battery exists in the evaluated packs |

### 4.6 Overlays

| Semantic name | atlasKey | src | Looks like |
|---|---|---|---|
| `overlay.goal` | ✅ | `soko 0,3` | white bracket corners framing the cell — the goal/target marker |
| `overlay.goal.brown` … `.grey` | ✅ | `soko 1..5,3` | same brackets with a colour-matched crate glyph inside; pairs 1:1 with `item.crate.<colour>` for the World-3 sorting levels |
| `overlay.tracks` | ✅ | `tanks tracksDouble.png` | dark twin tread marks |
| `overlay.tracks.small` | ✅ | `tanks tracksSmall.png` | short tread segment |
| `overlay.tracks.large` | ✅ | `tanks tracksLarge.png` | long tread segment |
| `overlay.selection` | **DRAW_IN_CODE** | — | 2 px `--accent` (`#35e0c8`) inset rect + 8 px corner ticks, pulsing alpha 0.5–1.0 over ~800 ms; must animate, so keep it in code |
| `overlay.shadow` | **DRAW_IN_CODE** | — | radial gradient ellipse, 36x14, `rgba(0,0,0,0.45)` → transparent, drawn one tile-height below the sprite anchor |
| `overlay.grid` | **DRAW_IN_CODE** | — | 1 px `rgba(106,122,140,0.18)` lines on the 48 px lattice; one `stroke()` pass for the whole viewport, never a per-tile blit |
| `overlay.glow` | **DRAW_IN_CODE** | — | additive radial gradient, `--accent` at 0.35 alpha centre → transparent at r=36, `globalCompositeOperation = 'lighter'` |

`overlay.tracks*` are dark and near-invisible on `floor.metal`. They read on
regolith, sand, concrete and ice. On dark decks, draw tread marks in code instead.

### 4.7 Coverage

Against the brief's vocabulary list: **27 of 36 entries covered by real CC0 art,
9 `DRAW_IN_CODE`** (grating, tilled soil, circuit floor, hazard stripes, conveyor,
solar panel, battery, plus three of the four overlays). The nine gaps are all flat
geometric or animated things that Canvas2D draws better and cheaper than a bitmap
would — none of them is a missing *illustration*.

---

## 5. Biome palettes

One base floor per world, so each world reads as a place. Props are cross-compatible;
the floor is what carries the identity.

| # | World | Base floor | Accent tiles | Notes |
|---|---|---|---|---|
| 1 | **Boot Sector** — dusty test hangar | `floor.metal` + the `floor.metal.*` marking set | `feature.landing_pad`, `wall.metal`, `blocker.crate_wood`, `overlay.goal` | The yellow bay lines are the whole look. Scatter `line_v` / `line_h` / `corner` / `bolt` deliberately; a hangar is a painted floor plan. Sheet: **`tds`**. |
| 2 | **Regolith Fields** — hostile agriculture | `floor.regolith` (+ `.b`, `.rocky`) | `plant.stage0..mature`, `feature.silo`, `feature.dome`, `floor.tilled` (code), `rock.*` | Sheet: **`scifi`**. The purple crop and the rust ground come from the same pack and were drawn to sit together. |
| 3 | **The Sorting Yards** — logistics depot | `floor.concrete` / `floor.plate` | all `item.crate.*`, all `overlay.goal.*`, `blocker.container`, `feature.conveyor` (code) | Sheet: **`soko` + `td`**. The Sokoban crate/goal pairing is exactly the sorting mechanic, colour-matched out of the box. |
| 4 | **Cave Systems** — unmapped tunnels | `floor.rock` + `floor.gravel` | `wall.rock`, `rock.*`, `ore.*`, `feature.pit`, `feature.coolant` | Sheets: **`map` + `scifi`**. Darken the whole layer ~30% and let the code-drawn headlight cone do the work; the source art is lit too brightly for a cave. |
| 5 | **The Grid** — power infrastructure | `floor.plate` / `.b` / `.c` / `.diamond` | `feature.power_node`, `feature.cable`, `feature.terminal`, `floor.circuit` (code), `feature.solar_panel` (code) | Sheet: **`td`**. Weakest biome for sourced art — see §8. |
| 6 | **Deep Signal** — listening post | `floor.ice` / `floor.snow` | `feature.antenna`, `feature.dish`, `feature.cable`, `item.core.*`, `rock.crystal` | Sheets: **`scifi` + `tds`**. Cold, empty, a few very tall masts. |
| 7 | **Swarm** — a hundred cheap robots | `floor.concrete.b` + `floor.hazard` (code) | `overlay.tracks*`, `blocker.fence`, `blocker.barricade`, `feature.landing_pad` | Sheets: **`tds` + `tanks`**. A yard: painted lanes, rails, tread marks everywhere. |
| 8 | **The Kessler Contract** — finale | `floor.plate.diamond` + `floor.metal` | `feature.factory`, `feature.refinery`, `feature.hangar`, `feature.tanks`, `feature.drill`, `plant.mature`, `floor.grass` | Sheet: **`scifi` structures**. This is where the big `scifi` buildings finally pay off — the megastructure should be built out of them. |

Two palette cautions:

- `map` (sand / rock / water) is noticeably brighter and more pastel than `scifi` and
  `tds`. Where they meet, multiply the `map` tiles by ~0.9 or keep them in separate
  levels.
- `floor.grass` (`#27ae60`) is a very saturated green against `--bg-void` (`#0a0e14`).
  Reserve it for the terraforming payoff at the end of World 8, where the contrast is
  the point.

---

## 6. Fonts

`public/fonts/` — both are **variable** fonts, Latin subset, self-hosted, OFL 1.1.
Google Fonts serves one file per family covering all weights, so there is exactly one
`.woff2` each.

| File | Family | Weight axis | Size |
|---|---|---|---|
| `Inter-latin-var.woff2` | Inter | `wght` 100–900 | 48 KB |
| `JetBrainsMono-latin-var.woff2` | JetBrains Mono | `wght` 400–800 | 31 KB |

Unicode range covered (Google's `latin` subset):
`U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA, U+02DC, U+0304,
U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193, U+2212, U+2215, U+FEFF, U+FFFD`

Paste this into `src/ui/styles/tokens.css` (or a `fonts.css` next to it):

```css
@font-face {
  font-family: 'Inter';
  font-style: normal;
  font-weight: 100 900;
  font-display: swap;
  src: url('/fonts/Inter-latin-var.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,
    U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193,
    U+2212, U+2215, U+FEFF, U+FFFD;
}

@font-face {
  font-family: 'JetBrains Mono';
  font-style: normal;
  font-weight: 400 800;
  font-display: swap;
  src: url('/fonts/JetBrainsMono-latin-var.woff2') format('woff2');
  unicode-range: U+0000-00FF, U+0131, U+0152-0153, U+02BB-02BC, U+02C6, U+02DA,
    U+02DC, U+0304, U+0308, U+0329, U+2000-206F, U+20AC, U+2122, U+2191, U+2193,
    U+2212, U+2215, U+FEFF, U+FFFD;
}

:root {
  --font-prose: 'Inter', system-ui, -apple-system, 'Segoe UI', sans-serif;
  --font-mono: 'JetBrains Mono', ui-monospace, SFMono-Regular, Menlo, monospace;
}
```

Preload both in `index.html` — the terminal chrome is monospace-heavy and a FOUT is
very visible:

```html
<link rel="preload" href="/fonts/JetBrainsMono-latin-var.woff2" as="font" type="font/woff2" crossorigin>
<link rel="preload" href="/fonts/Inter-latin-var.woff2" as="font" type="font/woff2" crossorigin>
```

Monaco needs the family name to match exactly: `fontFamily: "'JetBrains Mono', monospace"`.
Monaco measures glyph width on init, so set it before mounting the editor, not after.

---

## 7. UI assets

| Path | What | How to use |
|---|---|---|
| `ui/kenney_board-game-icons/iconsDefault.png` | 1344x832, 64 px grid, 21 x 13, 0 spacing, 255 icons | Pure **white** on transparent. Tint by drawing to an offscreen canvas and compositing `source-in` with the token colour, or use CSS `mask-image` for DOM icons. |
| `ui/kenney_ui-pack/` | 82 PNGs, Grey/Default set | 9-slice frames, buttons, checkboxes, sliders. |
| `ui/kenney_cursors/` | 24 PNGs | `pointer_a/b/c`, `pointer_scifi_a`, `hand_*`, `target_a/b`, `cross_*`, `busy_*`, `arrow_n/e/s/w`, `resize_*`, `disabled`. Wire via `cursor: url(...) x y, auto`. |

Useful `iconsDefault.png` cells (col,row → `(col*64, row*64, 64, 64)`), verified by eye:

| Icon | col,row | Use |
|---|---|---|
| compass W / S / E / N | `5,3` `6,3` `7,3` `8,3` | direction glyphs for `Dir` in docs and the HUD |
| move / four-way arrow | `7,8` | `move` |
| rotate CCW / CW | `15,8` `16,8` | `turn` |
| swap / exchange arrows | `12,8` | `send` / `recv` |
| hourglass | `0,8` | tick budget |
| pie fractions, empty → full | `13,1` … `20,1` | progress rings for objectives |
| padlock open / closed | `9,3` `10,3` | locked levels, hardware unlocks |
| flag | `11,3` | objective / goal |
| skull | `12,1` | failure states |
| shields with numerals | row `11`, right half | medal tiers |
| wheat / flame | `19,9` `17,9` | World 2 / hazard flavour |

DESIGN §8 says the UI is a corporate terminal built from plain CSS with 1 px borders.
Kenney's UI Pack is rounded and playful and will fight that. Treat `kenney_ui-pack/`
as a fallback, not the plan — the icons and cursors are the parts worth using.

---

## 8. Known weak spots

- **World 5 (The Grid) is the under-served biome.** Circuit floor, solar panel and
  conveyor are all `DRAW_IN_CODE`, so its whole visual identity depends on code-drawn
  tiles. No CC0 top-down pack evaluated (Kenney's full 164-asset catalogue, filtered to
  top-down 2D) has sci-fi circuitry or photovoltaics. If it looks thin once it is
  playable, the cheapest fix is a strong `floor.circuit` pattern plus code-drawn
  glowing links between `feature.power_node` instances — the glow will carry it.
- **Structures are drawn in 3/4 view, not true top-down.** `feature.antenna`, `.silo`,
  `.hangar`, `.factory`, `.dome`, `.refinery` and `.tanks` are Kenney RTS building
  sprites: you see their fronts. They read fine as landmarks in a stylised grid, but
  do not mix them with a strict top-down camera assumption. Anchor them bottom-centre
  in the cell so their bases sit on the tile.
- **`floor.metal` is genuinely flat** (`#4a4a4a`, zero variance). That is deliberate —
  the marking tiles are what make World 1 legible — but if a whole level of it looks
  dead, `floor.plate` / `floor.plate.diamond` are the textured alternatives.
- **The five 64 px grids ship no atlas file** (`scifi`, `tds`, `soko`, `map`, `td`). Their
  coordinates in §4 were verified by inspection; if you pull a *new* tile from them,
  verify the crop visually before trusting it.

---

## 9. Rebuilding the atlas

`public/assets/tiles/bootstrap_tiles_48.build.py` regenerates
`bootstrap_tiles_48.png` + `.json` from the committed source sheets;
`bootstrap_tiles_48.preview.py` regenerates `docs/assets-preview.png`. Both need only
Pillow:

```sh
python3 -m venv /tmp/assetvenv && /tmp/assetvenv/bin/pip install pillow
/tmp/assetvenv/bin/python "public/assets/tiles/bootstrap_tiles_48.build.py"
/tmp/assetvenv/bin/python "public/assets/tiles/bootstrap_tiles_48.preview.py"
```

To add a tile: append one row to `ENTRIES` in the build script — `("g", sheet, col, row)`
for a 64 px grid cell, `("gr", sheet, col, row, ncols, nrows)` to squash a block into one
tile, `("x", sheet, "spriteName.png")` for an XML-atlas sprite — then rerun both.
Frame positions are assigned by list order, so **appending is safe and reordering is not**;
the renderer reads names, never indices, but a diff is much easier to review if the
existing rows do not move.

These two `.py` files sit under `public/` only because `public/assets/` was the
directory this work owned. They are build-time only and should be moved to a
`scripts/` directory once one exists, so Vite stops copying them into `dist/`.
