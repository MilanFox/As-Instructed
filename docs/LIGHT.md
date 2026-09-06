# The light

**One lamp. Due north-west. Elevation ≈34°. It never moves.**

This is the rule the whole screen obeys, not just the board. A desk lit from one direction and a
board lit from another looks broken in a way nobody can name — they will not say "the key light
disagrees", they will say it looks cheap. So this document is the single place the direction of
the light is written down, and everything that draws a surface reads it from here.

It exists because `docs/SPIKE-ART-DIRECTION.md` gave Deep Site the premise *"the board is a lit
place, seen from above"* and then applied it to texture and nothing else. Making the premise
literally true meant fixing the lamp, and a fixed lamp is only worth anything if everything is
fixed to the same one.

---

## 1. The rule

| surface | treatment |
|---|---|
| **top face** — points at the sky | the material, unmodified |
| **north arris** — the lit top edge | `#dbe8f0` at 0.46 alpha, one hard rule `0.07T` deep plus one dither row at half cell |
| **west arris** | `#dbe8f0` at 0.30 alpha, `0.055T` deep |
| **east chamfer** | black at 0.32 alpha, `0.07T` |
| **south face** — never lit | `shade(deep, 0.62)` at the top of the face, `shade(deep, 0.34)` at its foot |

`T` is the tile size in device pixels. Alphas are quantised to 1/64 by `alpha()`, which is memoised
— a colour string the canvas has not seen before costs a parse, and one per object per frame is
measurable.

**The south face is anchored on the material's darkest tone, not its mid.** A face keyed off the
mid tone came out *lighter* than the top it belonged to on cave stone, which reads as a surface
folding the wrong way.

## 2. Anything with height

A prop, a machine, a bot, a wall, a rock:

- its **base sits on the cell's south edge**;
- its **top pushes north** — height is a screen-space offset, never a change of footprint;
- its **lit faces are north and west**;
- its **dark face is south**;
- its **shadow goes south-east**.

Height carries meaning rather than decoration. On the board today: wall and void rise `1.0`, rock
and ore `0.85`, rubble `0.42`, all against `SOLID_RISE = 0.20` of a tile. **Three obstacle classes
told apart by height without spending a hue on it** — which means the distinction survives
greyscale, and it must not be re-solved with colour by anything added later.

A machine is shorter than a wall. Anything that reads as taller than the terrain it stands in is
wrong.

## 3. Cast shadow

A shadow is a **projection, not an edge band**: the footprint translated `SHADOW_REACH = 0.28`
tiles south **and** east equally. With the rise, that pins the lamp at ≈34°.

Intersecting that projection with a neighbouring cell yields three *disjoint* pieces, which is why
a floor tile in an inside corner takes **one** shadow value and not three stacked ones:

- solid to the **north** → band `x ∈ [0.28T, T]`, `y ∈ [0, 0.28T]`
- solid to the **west** → band `x ∈ [0, 0.28T]`, `y ∈ [0.28T, T]`
- solid to the **north-west** → corner `[0, 0.28T]²`

Values: umbra `#04090f` at 0.32; contact strip 0.30 over `0.09T` against the base; occlusion-only
(a solid to the south or east, where no shadow can physically fall) 0.28 and 0.20.

`SHADE` (the bot's shadow, 0.34) and `UMBRA` (terrain, 0.32) are deliberately within a hair of each
other. Keep them together — two shadow densities on one screen reads as two lamps.

## 4. The readability contract

**Draw order is the contract, and it is structural rather than a promise.**

Everything in the cached terrain layer draws **under** everything else. Crops, machines, items and
bots are live passes on top. Therefore **a cast shadow can land on ground and on nothing else.**

That is what guarantees the one thing the campaign cannot ship without: `w2-02` is a field of ripe,
unripe and bare tiles and is unsolvable if a player cannot tell them apart, so a shadow that
darkened a ripe crop would be a bug rather than atmosphere. It cannot, because it is drawn first.

Two consequences worth stating for anyone extending this:

- **Nothing that carries a distinction may be drawn into the cached layer.** If it is in the cache,
  a shadow can fall on it.
- **Motion is the one thing that can break this at runtime rather than at draw time.** A bot
  animating between cells sits over its neighbours mid-step, and can be over a crop at the exact
  moment a player is reading ripeness. Draw order does not save you there; the bot really is on
  top. Anything that moves has to be designed against that case.

Measured, not asserted: trail contrast against the floor is 1.13 clear and 1.10 shadowed, and the
`referenceFloor` regression that pins it is green.

## 5. Numbers, and why they are those numbers

| name | value | argument |
|---|---|---|
| `SOLID_RISE` | 0.20 | below ~0.15 the south face is 1–2 px at the small rungs and the block is a darker square again; above 0.25 the walkable tile north of a wall starts costing the player thought |
| `SHADOW_REACH` | 0.28 | long enough to read as a projection, short enough that a one-tile corridor keeps about half its floor unshadowed |
| `CONTACT_DEPTH` | 0.09 | one dither cell — the thinnest strip that survives 16 device px |
| `UMBRA` | 0.32 | the floor's own grain swings ±14% of its mid; at 0.20 the shadow sat inside the grain and read as nothing. 0.32 clears it by better than 2:1 and still leaves the additive marks — grid, ripe head, pad stencil — findable |
| face upper / foot | 0.62 / 0.34 of `deep` | see §1 |

**The occlusion budget: a solid covers the southern one fifth of the tile north of it, and never
its centre.** `w1-05`'s objective is literally "enter every floor tile in the bay" — a tile the
player cannot see is a tile they cannot plan through.

## 6. Off the board

The desk chrome obeys this lamp too. Three things do not survive the trip unchanged:

**The fractions are for small elements.** Every depth above is a fraction of a 16–48 device-pixel
tile. At desk scale — an element hundreds of pixels across — `0.07` becomes a fat band and stops
reading as an edge. Treat the fractions as ratios while the element is small and switch to a fixed
1–3 device-pixel rule once it is large. **The alphas and the colours carry over unchanged, and they
are the part that makes it look like the same lamp.**

**Do not compute from the elevation.** "≈34°" is a gloss, not a number to derive from:
`atan(0.20 / 0.28)` is 35.5° measured along one axis and 26.8° along the true diagonal. The two
constants are the spec. For a cast shadow, the usable form is **offset `dx = dy = 1.4 × height`,
equal in both axes** — in CSS, a `box-shadow` whose x and y are the same number. 135°, not 148°.

**An arris is a line, not a gradient.** The first attempt at the board's lit edge was a wide
half-coverage checker and at 40 px it read as chrome trim — a dazzle strip along the top of every
wall rather than an edge catching a lamp. One hard rule plus one row of falloff is what works. A
CSS gradient in that position reads as plastic.

If the board and the chrome ever genuinely cannot agree, change this document rather than diverging
quietly. Two lamps is the failure this exists to prevent.

## 7. The cost rule that goes with the texture

The shading above is made of hard steps and dither, and both are *counted* marks — they emit one
draw call per block or per step. That makes them easy to write in a way whose cost is wrong, and
this defect has now been found three separate times in one pass, which makes it a class rather than
three bugs.

**The rule: a smaller board must be cheaper to draw, not the same price.**

The number of draw calls a mark emits should fall as the tile shrinks, because the number of device
pixels it covers falls as the square. Two shapes break that:

- **A step that floors at one device pixel while the extent scales with the tile.** `dither()` walks
  `ceil(w / cell) × ceil(h / cell)`. If `cell` bottoms out at 1 device px, the block count *rises*
  as the tile shrinks. The worst instance found passed `cell = half`, which was 1 device pixel at
  every zoom — a per-pixel Bayer fill, ~190 block tests to draw one ground stack, and it drew almost
  nothing.
- **A step that is a small fraction while the extent is large.** `stepLine()` emits one `fillRect`
  per `w` of span, so a hairline diagonal is simultaneously the most expensive and the least visible
  mark available. A 1 px weight at a 48 px tile was ~100 draw calls for a mark nobody can see.

Both are the same underlying error: **the draw-call count is decoupled from the device-pixel area
covered.**

**Where each construct is allowed.** `dither()` belongs inside the cached terrain sheet, which is
built once per zoom step and is genuinely free per frame. On a live layer — machines, crops, items,
the bot — it is a trap, and there are now none there. `stepLine()` is fine anywhere provided `w` is
never below about 2 device px.

The three sites already fixed were the item grain, the old bot's cast shadow, and the blocked and
failed marks. Anything added later should be checked against the rule rather than against those
three examples.

### The test

A rule stated as prose does not survive contact with the next agent. This one has a mechanical
check, and a construct that cannot pass it is the defect:

**Count draw calls through a counting context at two tile sizes, and assert the smaller tile is
cheaper.**

```
count(mark, 16) < count(mark, 48)
```

Wrap the context in a Proxy that increments a counter on every `fillRect`, `stroke`, `fill` and
`drawImage`, run the mark at 48 device px and again at 16, and compare. It is deterministic, it
needs no canvas, and it runs under Vitest in Node — `src/render/__tests__/marks.test.ts` already
builds exactly this recording context for a different purpose, so the machinery exists.

Strict inequality is the right assertion, not "roughly equal". Covered area falls as the square of
the tile, so a mark whose count merely *holds* is already paying 48-pixel prices at 16 px. The
observed healthy ratio on the three live layers is **far ÷ near ≈ 0.5**; the atlas path, for
contrast, is 0.99 — a `drawImage` costs a `drawImage` regardless of size, which is why the authored
directions can beat it at small tiles and why giving that back would be a real loss rather than a
rounding error.

### The test has a second half

The check above is **per element**, and per element is not enough. The desk lane found this on its
own board approximation and it is the sharper half of the rule:

**A per-element count can fall correctly while the per-frame total stays flat, because the tile
count rises exactly as fast as the per-tile count falls.**

Their case: an ordered dither whose cell is correctly pinned to device pixels, so the per-tile block
count *does* shrink with the tile — it passes the two-size test locally. But at a 40 device-px tile
that is ~400 fills per tile, and a 40×40 board is tens of thousands of calls per frame **at every
zoom**, because halving the tile doubles the number of tiles. The element scales; the frame does
not.

So run the count twice:

```
count(mark,  16) < count(mark,  48)      // per element
count(board, 16) < count(board, 48)      // per frame, whole board
```

**The second one is the one that decides whether a player's frame rate is safe.** A construct that
passes the first and fails the second has to move off the per-frame path entirely — baked into an
offscreen sheet once per zoom step — rather than being tuned.

That is what the terrain cache already is, and why it is worth its complexity. Verified for
`deepsite.ts` at the time of writing: all 23 `dither` call sites sit inside the sheet-row painters
that `buildSheet` composes, none on any live path — so the dither runs once per zoom step and the
board pays one `drawImage` per frame for all of it. The live painters loop per *object*, and object
count does not rise when the tile shrinks, so they are safe by shape rather than by tuning.

**Anything that loops per tile per frame is the thing to look for.** There is nothing like it in
`deepsite`; `signal` and the shared modules have not been audited.

## 8. Where it lives

`src/render/art/deepsite.ts`. The constants above are module scope and built once; nothing on the
live draw path allocates.

`volume()` and `castBlock()` encode §2 and §3 for props. Use them rather than re-deriving the
offsets — `castBlock`'s shorter `0.07T` offset is correct for a prop precisely *because* the lamp
elevation is fixed, and that is the kind of thing that silently drifts when two places compute it.
