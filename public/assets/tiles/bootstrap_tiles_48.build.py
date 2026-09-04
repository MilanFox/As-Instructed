#!/usr/bin/env python3
"""Build the curated 48px BOOTSTRAP tile atlas from the committed Kenney CC0 sheets."""
import json
import os
import re
from PIL import Image

ROOT = "/Users/milan.fox/Projects (Private)/gamedev-1/public/assets/tiles"
TILE = 48
COLS = 16

GRID_SHEETS = {
    "scifi": ("kenney_sci-fi-rts/scifi_tilesheet.png", 64),
    "tds": ("kenney_topdown-shooter/tilesheet_complete.png", 64),
    "soko": ("kenney_sokoban/sokoban_tilesheet.png", 64),
    "map": ("kenney_map-pack/mapPack_tilesheet.png", 64),
    "td": ("kenney_tower-defense/towerDefense_tilesheet.png", 64),
}
XML_SHEETS = {
    "tanks": "kenney_tanks/onlyObjects_retina",
}

# (name, source, spec)
#   ("g", sheet, col, row)                 single 64px grid cell
#   ("gr", sheet, col, row, ncols, nrows)  rectangular block of grid cells, squashed to one tile
#   ("x", sheet, spriteName)               named sprite from an XML atlas
ENTRIES = [
    # ---- floors -------------------------------------------------------
    ("floor.metal",            ("g", "tds", 4, 3)),
    ("floor.metal.dot",        ("g", "tds", 5, 3)),
    ("floor.metal.bolt",       ("g", "tds", 6, 3)),
    ("floor.metal.dash",       ("g", "tds", 3, 3)),
    ("floor.metal.line_v",     ("g", "tds", 0, 1)),
    ("floor.metal.line_h",     ("g", "tds", 1, 2)),
    ("floor.metal.corner",     ("g", "tds", 2, 1)),
    ("floor.metal.w_line_v",   ("g", "tds", 7, 1)),
    ("floor.metal.w_dash",     ("g", "tds", 8, 3)),
    ("floor.metal.w_bolt",     ("g", "tds", 13, 3)),
    ("floor.concrete",         ("g", "tds", 6, 12)),
    ("floor.concrete.b",       ("g", "tds", 0, 12)),
    ("floor.plate",            ("g", "td", 19, 7)),
    ("floor.plate.b",          ("g", "td", 20, 7)),
    ("floor.plate.c",          ("g", "td", 21, 7)),
    ("floor.plate.diamond",    ("g", "td", 22, 7)),
    ("floor.gravel",           ("g", "td", 21, 6)),
    ("floor.regolith",         ("g", "scifi", 0, 0)),
    ("floor.regolith.b",       ("g", "scifi", 1, 0)),
    ("floor.regolith.rocky",   ("g", "scifi", 4, 0)),
    ("floor.dirt",             ("g", "map", 8, 4)),
    ("floor.rock",             ("g", "map", 13, 0)),
    ("floor.ice",              ("g", "scifi", 0, 1)),
    ("floor.ice.b",            ("g", "tds", 7, 0)),
    ("floor.snow",             ("g", "tds", 11, 0)),
    ("floor.sand",             ("g", "map", 3, 0)),
    ("floor.clay",             ("g", "tds", 12, 0)),
    ("floor.water",            ("g", "map", 15, 11)),
    ("floor.grass",            ("g", "tds", 0, 0)),
    # ---- walls / blockers ---------------------------------------------
    ("wall.rock",              ("g", "soko", 8, 6)),
    ("wall.rock.b",            ("g", "soko", 8, 7)),
    ("wall.brick",             ("g", "soko", 6, 6)),
    ("wall.brick.b",           ("g", "soko", 7, 6)),
    ("wall.metal",             ("g", "td", 17, 6)),
    ("wall.metal.b",           ("g", "td", 17, 7)),
    ("wall.metal.c",           ("g", "td", 17, 8)),
    ("wall.panel",             ("g", "soko", 11, 6)),
    ("wall.brick.orange",      ("g", "tds", 16, 2)),
    ("wall.wood",              ("g", "tds", 16, 3)),
    ("blocker.crate_metal",    ("x", "tanks", "crateMetal.png")),
    ("blocker.crate_wood",     ("x", "tanks", "crateWood.png")),
    ("blocker.barrel",         ("x", "tanks", "barrelRust_top.png")),
    ("blocker.barrel.black",   ("x", "tanks", "barrelBlack_top.png")),
    ("blocker.barrel.green",   ("x", "tanks", "barrelGreen_top.png")),
    ("blocker.barrel.red",     ("x", "tanks", "barrelRed_top.png")),
    ("blocker.barricade",      ("x", "tanks", "barricadeMetal.png")),
    ("blocker.barricade_wood", ("x", "tanks", "barricadeWood.png")),
    ("blocker.sandbag",        ("x", "tanks", "sandbagBeige.png")),
    ("blocker.sandbag.brown",  ("x", "tanks", "sandbagBrown.png")),
    ("blocker.fence",          ("x", "tanks", "fenceYellow.png")),
    ("blocker.fence.red",      ("x", "tanks", "fenceRed.png")),
    ("blocker.pipe",           ("g", "scifi", 1, 6)),
    ("blocker.container",      ("g", "scifi", 2, 6)),
    ("blocker.container.b",    ("g", "scifi", 3, 6)),
    # ---- features ------------------------------------------------------
    ("feature.landing_pad",    ("gr", "tds", 5, 1, 2, 2)),
    ("feature.landing_pad.w",  ("gr", "tds", 12, 1, 2, 2)),
    ("feature.door",           ("g", "tds", 17, 12)),
    ("feature.terminal",       ("g", "td", 16, 3)),
    ("feature.terminal.offline", ("g", "td", 17, 3)),
    ("feature.power_node",     ("g", "tds", 17, 13)),
    ("feature.power_node.b",   ("g", "td", 18, 3)),
    ("feature.node_blank",     ("g", "td", 15, 3)),
    ("feature.hatch",          ("g", "tds", 16, 13)),
    ("feature.cable",          ("x", "tanks", "wireStraight.png")),
    ("feature.cable.bend",     ("x", "tanks", "wireCrooked.png")),
    ("feature.antenna",        ("g", "scifi", 14, 0)),
    ("feature.dish",           ("g", "scifi", 15, 0)),
    ("feature.silo",           ("g", "scifi", 16, 0)),
    ("feature.silo.b",         ("g", "scifi", 17, 0)),
    ("feature.tanks",          ("g", "scifi", 17, 2)),
    ("feature.hangar",         ("g", "scifi", 15, 1)),
    ("feature.factory",        ("g", "scifi", 14, 2)),
    ("feature.dome",           ("g", "scifi", 16, 2)),
    ("feature.refinery",       ("g", "scifi", 16, 1)),
    ("feature.drill",          ("g", "scifi", 0, 6)),
    ("feature.pit",            ("g", "tds", 22, 11)),
    ("feature.oil",            ("x", "tanks", "oilSpill_large.png")),
    ("feature.coolant",        ("g", "tds", 20, 11)),
    ("feature.coolant.b",      ("g", "tds", 19, 11)),
    ("feature.lava",           ("g", "tds", 18, 11)),
    # ---- ore / rock props ----------------------------------------------
    ("ore.stage1",             ("g", "scifi", 1, 4)),
    ("ore.stage2",             ("g", "scifi", 2, 4)),
    ("ore.stage3",             ("g", "scifi", 3, 4)),
    ("ore.rich",               ("g", "scifi", 4, 4)),
    ("ore.rich.b",             ("g", "scifi", 5, 4)),
    ("rock.small",             ("g", "scifi", 1, 5)),
    ("rock.medium",            ("g", "scifi", 2, 5)),
    ("rock.large",             ("g", "scifi", 3, 5)),
    ("rock.crystal",           ("g", "scifi", 4, 5)),
    ("rock.crystal.b",         ("g", "scifi", 5, 5)),
    ("rock.boulder",           ("g", "tds", 20, 8)),
    # ---- plants ---------------------------------------------------------
    ("plant.stage0",           ("g", "scifi", 4, 3)),
    ("plant.stage1",           ("g", "scifi", 5, 3)),
    ("plant.stage2",           ("g", "scifi", 2, 3)),
    ("plant.stage3",           ("g", "scifi", 0, 3)),
    ("plant.stage4",           ("g", "scifi", 1, 3)),
    ("plant.mature",           ("g", "scifi", 3, 3)),
    ("plant.alt.small",        ("g", "scifi", 4, 6)),
    ("plant.alt.large",        ("g", "scifi", 5, 6)),
    ("plant.bush",             ("g", "tds", 18, 8)),
    ("plant.bush.dead",        ("g", "tds", 19, 8)),
    ("plant.tree",             ("x", "tanks", "treeGreen_small.png")),
    ("plant.tree.dead",        ("x", "tanks", "treeBrown_small.png")),
    # ---- items ----------------------------------------------------------
    ("item.crate.brown",       ("g", "soko", 6, 3)),
    ("item.crate.red",         ("g", "soko", 7, 3)),
    ("item.crate.blue",        ("g", "soko", 8, 3)),
    ("item.crate.green",       ("g", "soko", 9, 3)),
    ("item.crate.grey",        ("g", "soko", 10, 3)),
    ("item.crate.brown.dark",  ("g", "soko", 6, 4)),
    ("item.crate.red.dark",    ("g", "soko", 7, 4)),
    ("item.crate.blue.dark",   ("g", "soko", 8, 4)),
    ("item.crate.green.dark",  ("g", "soko", 9, 4)),
    ("item.crate.grey.dark",   ("g", "soko", 10, 4)),
    ("item.core.brown",        ("g", "soko", 12, 1)),
    ("item.core.red",          ("g", "soko", 12, 2)),
    ("item.core.blue",         ("g", "soko", 12, 3)),
    ("item.core.green",        ("g", "soko", 12, 4)),
    ("item.core.grey",         ("g", "soko", 12, 5)),
    ("item.coin",              ("g", "soko", 9, 5)),
    ("item.ore.red",           ("g", "scifi", 0, 4)),
    ("item.ore.grey",          ("g", "scifi", 0, 5)),
    ("item.shard",             ("g", "tds", 20, 9)),
    ("item.shard.b",           ("g", "tds", 18, 9)),
    ("item.debris",            ("g", "tds", 18, 10)),
    ("item.seed",              ("g", "scifi", 4, 3)),
    # ---- overlays --------------------------------------------------------
    ("overlay.goal",           ("g", "soko", 0, 3)),
    ("overlay.goal.brown",     ("g", "soko", 1, 3)),
    ("overlay.goal.red",       ("g", "soko", 2, 3)),
    ("overlay.goal.blue",      ("g", "soko", 3, 3)),
    ("overlay.goal.green",     ("g", "soko", 4, 3)),
    ("overlay.goal.grey",      ("g", "soko", 5, 3)),
    ("overlay.tracks",         ("x", "tanks", "tracksDouble.png")),
    ("overlay.tracks.small",   ("x", "tanks", "tracksSmall.png")),
    ("overlay.tracks.large",   ("x", "tanks", "tracksLarge.png")),
]


def load_grid(sheet):
    path, size = GRID_SHEETS[sheet]
    return Image.open(os.path.join(ROOT, path)).convert("RGBA"), size


def load_xml(sheet):
    base = os.path.join(ROOT, XML_SHEETS[sheet])
    img = Image.open(base + ".png").convert("RGBA")
    raw = open(base + ".xml").read()
    subs = {
        n: (int(x), int(y), int(w), int(h))
        for n, x, y, w, h in re.findall(
            r'name="([^"]+)"\s+x="(-?\d+)"\s+y="(-?\d+)"\s+width="(\d+)"\s+height="(\d+)"', raw
        )
    }
    return img, subs


grids = {k: load_grid(k) for k in GRID_SHEETS}
xmls = {k: load_xml(k) for k in XML_SHEETS}

rows = (len(ENTRIES) + COLS - 1) // COLS
atlas = Image.new("RGBA", (COLS * TILE, rows * TILE), (0, 0, 0, 0))
frames = {}

for i, (name, spec) in enumerate(ENTRIES):
    kind = spec[0]
    if kind == "g":
        _, sheet, col, row = spec
        img, size = grids[sheet]
        box = (col * size, row * size, (col + 1) * size, (row + 1) * size)
        src = {"sheet": sheet, "x": box[0], "y": box[1], "w": size, "h": size}
        cell = img.crop(box).resize((TILE, TILE), Image.LANCZOS)
    elif kind == "gr":
        _, sheet, col, row, nc, nr = spec
        img, size = grids[sheet]
        box = (col * size, row * size, (col + nc) * size, (row + nr) * size)
        src = {"sheet": sheet, "x": box[0], "y": box[1], "w": nc * size, "h": nr * size}
        cell = img.crop(box).resize((TILE, TILE), Image.LANCZOS)
    elif kind == "x":
        _, sheet, key = spec
        img, subs = xmls[sheet]
        x, y, w, h = subs[key]
        src = {"sheet": sheet, "key": key, "x": x, "y": y, "w": w, "h": h}
        crop = img.crop((x, y, x + w, y + h))
        scale = TILE / max(w, h)
        nw, nh = max(1, round(w * scale)), max(1, round(h * scale))
        cell = Image.new("RGBA", (TILE, TILE), (0, 0, 0, 0))
        cell.paste(crop.resize((nw, nh), Image.LANCZOS), ((TILE - nw) // 2, (TILE - nh) // 2))
    else:
        raise ValueError(kind)

    dx, dy = (i % COLS) * TILE, (i // COLS) * TILE
    atlas.paste(cell, (dx, dy))
    frames[name] = {"x": dx, "y": dy, "w": TILE, "h": TILE, "src": src}

atlas.save(os.path.join(ROOT, "bootstrap_tiles_48.png"))
meta = {
    "image": "bootstrap_tiles_48.png",
    "tileSize": TILE,
    "columns": COLS,
    "rows": rows,
    "width": atlas.width,
    "height": atlas.height,
    "note": "Derived from Kenney CC0 sheets in sibling folders; src records the origin crop.",
    "sources": {
        **{k: v[0] for k, v in GRID_SHEETS.items()},
        **{k: v + ".png" for k, v in XML_SHEETS.items()},
    },
    "frames": frames,
}
with open(os.path.join(ROOT, "bootstrap_tiles_48.json"), "w") as fh:
    json.dump(meta, fh, indent=1)
print("frames", len(frames), "size", atlas.size)
