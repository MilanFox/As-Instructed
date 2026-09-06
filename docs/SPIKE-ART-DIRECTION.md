# Spike — Art Direction

Three implemented visual directions, screenshotted from the real build, for a decision.

The charge was **"looks boring"**, and the benchmark was a Steam store page: would a stranger
scrolling stop on a screenshot of this? The brief sharpened twice while this was running — first
to "an actual art style, not a UI", then to "don't be afraid to throw away everything". What is
below is built against the last of those.

**This is a spike. Nothing in it is a proposal to keep as-is.** The deliverable is a choice.

---

## 1. What is actually wrong, before the directions

`docs/AUDIT-UI.md` concluded *"it looks like a very good design system that nobody has laid out."*
That is true and it is not the whole charge — "boring" and "badly laid out" are different
failures, and a perfectly laid out version of this screen would still be boring. Four things
matter more than the layout:

**1. The screenshot is of the chrome, not the simulation.** Every game this is being measured
against is photogenic because the *sim* is the spectacle: Opus Magnum's arms swinging, Factorio's
belts moving, Baba's rules sitting on the board as objects. Here the board is a muddy grey-brown
letterbox in the top-right quadrant, and the largest single object on screen is an **empty black
code editor**. The eye lands on a void.

**2. The board is empty until you press Run.** `NO TRACE ON FILE`, centred in a black rectangle.
The canvas draws exactly one `fillRect` and returns (`renderer.ts`, `if (!trace) return`). A
puzzle game that opens on nothing has thrown away its establishing shot — the board *is* the
problem statement, and this game makes it a reward for compiling. The audit ranks this second;
against the "boring" charge it is first.

**3. The game has a strong identity and will not commit to it.** The writing is genuinely good and
completely sure of itself:

> "Yield is up eleven percent. Yield is measured by a machine that we also maintain."

> "Kessler & Daughters does not recognise the term 'unsafe.' The approved term is 'outside of
> tolerance.'"

> "16 gold results. Finance have asked whether the tick budgets were set correctly. They were. I
> have told them they were. They have asked again."

That is TIS-100 territory, and TIS-100 wins by committing to its bit **absolutely** — a fake
1970s manual, a monochrome CRT, no concession anywhere. The look here half-commits, and
half-committing to a bit is what reads as boring. Nothing on screen is as confident as the prose.

**4. The palette is fighting itself.** Eight per-world accents sit on top of a six-colour semantic
palette. Three of them (`#9a7bd8`, `#4ea8ff`, `#ff7ad9`) are not in `tokens.css` at all, despite a
comment claiming they are. Two *are* reserved semantic tokens: **World 7 is `--danger`** and
**World 8 is `--gold`** — so on `w8-05` the world's colour and the medal you are chasing are the
same colour. And `--ink-dim` fails WCAG AA on all three surfaces across **111 uses**.

There is also a structural cause worth naming, because it is why previous passes did not stick:
**the canvas and the chrome had two separate palettes that only agreed by hand.** `theme.ts`
duplicated `tokens.css` as a frozen literal, with two further copies in `index.html` and the dev
harness. Changing the stylesheet changed nothing on the board. That is fixed below.

---

## 2. The shared foundation

All three directions sit on one seam, committed separately so it can be taken without them.

**`src/render/art/`** — an art direction is now a single file implementing one interface
(`art/types.ts`). It owns colour, per-bot identity hues, line weights and cutoffs, the trail ramp,
and — the part that matters — four painter hooks: `paintTerrain` (takes over the cached terrain
layer completely, bypassing the tile atlas), `backdrop`, `post`, and the bot painters. A direction
with no hooks is a palette swap; `standard` is exactly that, which is how the shipped look
survives as a comparison baseline rather than as a special case in the renderer.

**One palette, both sides.** `theme.ts` is now live bindings onto the current direction, and
`applyArtDirection()` writes that palette onto `:root` as custom properties plus a `data-art`
attribute. The canvas and the stylesheet can no longer disagree, and each direction ships its own
scoped stylesheet under `src/ui/styles/art/`.

**The trail invariant, generalised.** `FIX-TRAIL` §7 records a real and expensive bug: the first
visited-tile ramp ran from `--ink-dim`, which is within a few points of the World 4 cave floor, so
the cold end of the ramp drew *nothing at all* on the one level it exists for. The fix was "the
cold end is a darkening", and a regression test pinned the literal `rgba(10, 14, 20` that produced.

That literal is the right lesson written one direction too narrowly. A darkening is correct for
`standard`, `survey` and `deepsite`. It is **wrong for `signal`**, which paints a near-black
phosphor floor where a darkening fails for precisely the reason `--ink-dim` did. The invariant
that actually holds is the one §7 argues in prose — *luminance first, hue second* — so each
direction now declares its own `trail` ramp and a `referenceFloor`, and the test asserts
**contrast against the floor the direction actually paints**, in either direction. That is a
strengthening of the test, not a routing-around of it; it would still have caught the original bug.

**The board is drawn before the first Run.** `Renderer.setPreview(world)` renders the level's
initial state — terrain, grid, goal brackets, machines, and the bots at rest with a slow idle —
the moment the work order opens. `Workspace.tsx` was already building that world object for the
layout hook and throwing it away.

**The eight world accents became a sequence.** `src/levels/index.ts` is level data and stayed
untouched, but the UI no longer reads its `accent` field: `LevelSelect` and the top bar now go
through `--world-1` … `--world-8`, which each direction owns. The default is one hue cooling into
another across the eight, because the campaign is linear and *position in the sequence* is the
thing worth encoding — which the old set of eight unrelated brand colours threw away. It also
retires the two collisions, where World 7 was `--danger` and World 8 was `--gold`.

**The contrast floor is met by all three.** The audit found `--ink-dim` failing WCAG AA on all
three surfaces across 111 uses. Measured ratios, `--ink-dim` against each surface, plus `--ink` on
the panel for reference:

| direction | on `--bg-raised` | on `--bg-panel` | on `--bg-void` | `--ink` on panel |
| --- | --- | --- | --- | --- |
| **standard** (shipped) | **3.56** ✗ | **4.06** ✗ | **4.40** ✗ | 11.99 |
| survey | 5.47 ✓ | 6.39 ✓ | 6.97 ✓ | 13.63 |
| signal | 6.08 ✓ | 6.39 ✓ | 6.55 ✓ | 11.99 |
| deepsite | 6.45 ✓ | 7.42 ✓ | 7.95 ✓ | 15.32 |

`standard` is left failing on purpose — it is the baseline being compared against, not a direction
being proposed, and repairing it would flatter it.

**The layout stopped being a panel grid.** The board now bleeds to the top, right and bottom edges
with the program flush-left and everything else floating over it: objectives as a HUD card, the
brief/console/reference as one dismissible sheet, the transport as a floating pill, the tab bar and
the bottom status bar deleted. Shared across all three directions so they stay comparable, and it
is the single biggest structural reason the old screenshot read as a web app — the largest object
on it was an *empty code editor* and the board was a letterbox in the top-right quadrant.

The result is measured, against the real `Camera`, at four window sizes:

| window (dpr 1) | `w4-05` 40x40 | `w8-05` 48x40 |
| --- | --- | --- |
| 1280x720 | 8 → **16** | 8 → **16** |
| 1440x900 | 10 → **20** | 10 → **20** |
| 1680x780 | 8 → **18** | 8 → **18** |
| 2560x1440 | 24 → **32** | 24 → **32** |

**Tiles double at every size below 2560 and gain two zoom rungs there. No level gets smaller at any
size** — and that is now a test across all 34 levels under both the old and new geometry, not a
claim.

One judgement in there is worth surfacing because the obvious move was wrong: the code is **not**
floated over the board. A translucent program panel over the sim looks better in a screenshot and
hides eight of `w4-05`'s forty columns. The canvas is inset by exactly the program's width instead,
so no drawn tile is ever underneath the code. Readability beat beauty and it cost a nicer shot.

The accessibility pass was done against the **actual accessibility tree**, not inferred from the
DOM, which caught three things the DOM would not have: the sheet dialog was unnamed, its `<header>`
was exposing a second `banner` landmark, and focus was falling to `<body>` on close rather than
returning to the chip that opened it. All three fixed.

---

## 3. SURVEY — the board is a drafting sheet

**The bet, in one sentence:** Kessler & Daughters never sent anyone to the planet, so what the
contractor is looking at is not a window onto the site — it is Survey's plot of it, and the board
is therefore *paper*.

Shots: `docs/shots/art/survey/`

That single inversion — a pale bone sheet inside dark chrome — does most of the work:

- It is the one thing on a store page that does not look like every other dark-mode programming
  game. Every competitor in this genre is light-on-dark. This is ink on paper.
- The bot becomes the **darkest mark on the lightest field**, which is the most findable a bot can
  possibly be, instead of a small cyan blip on mid-grey.
- Grid legibility stops being a problem by construction. AUDIT-UI F6 (grid at 18% alpha over a
  floor of the same value, invisible below 10px/tile) cannot happen on paper.
- The dry institutional voice finally has a surface that matches it. "Yield is measured by a
  machine that we also maintain" belongs on a form.

**The mark-making language**, which is what makes it an art direction rather than a palette: one
ink at three line weights, and **material expressed as hatching, never as fill**. Rock is
cross-hatch, phase-continuous across cells so a massif reads as one hatched body rather than a
checkerboard of independently hatched squares. Regolith is stipple. Ice is a tighter parallel rule
with fracture strokes. Rubble is the same rock after it fell over — broken short strokes. Ore is
hatch with the hatch *cleared* around a filled lozenge. Pits are the only red on the sheet, depots
are survey benchmarks, cable is blue-pencil schematic. No gradients, no glow, no bevels, no
rounded corners anywhere — in the canvas or the CSS.

Value carries the gameplay read before any texture resolves: wall 0.94 → rock 0.34 → ore 0.26 →
rubble 0.14, **in the order they resist you**. And the load-bearing mark is the heavy ruled outline
on every solid edge facing a walkable cell: whatever the hatch does inside, "here / not here" is a
drawn line at every zoom.

It also ships the **drafting furniture** — ruler ticks on two edges, coordinate numbers every five
cells, corner registration marks. That is a direct fix for the audit's "no axis labels, no ruler,
no coordinate readout", arrived at by committing to the bit rather than by adding a feature.

**What it costs in legibility:**

- **Rock vs rubble at 24px/tile is the weakest read.** Cross-hatch at a 5px pitch and broken
  strokes at a 5px pitch converge on the same grey. They still separate by base value, and both
  still say *solid*, so the gameplay read holds — but the *material* read degrades.
- **Below 14px/tile every texture collapses** to the flat value it was averaging. Correct
  behaviour, and the same trade `sprites.ts` already makes for bots, but the direction stops being
  a direction down there.
- **Coordinate numbers vanish at `w8-05`.** They are drawn inside the terrain cache, which is at
  device resolution, so a number at a third of a 24px tile is four CSS pixels on a retina panel.
  The cutoff is 34 device px. Ticks and the major every-fifth rule still carry the counting. The
  real fix is a screen-space readout, which is now possible and noted below.
- Cable's blue is the one place a second colour becomes a fill. Defensible — power is the one live
  thing on the sheet — but it is the rule the direction bends.

**Cost to finish properly:** move the coordinate readout to screen space; give rubble a fourth
texture channel; decide whether the biome stain (currently a few points of paper tint) is enough
to tell eight worlds apart or whether worlds want stronger differentiation.

---

## 4. SIGNAL — one phosphor, taken to the wall

**The bet, in one sentence:** commit to the bit absolutely — the screen *is* the company's
equipment, the feed is forty light-minutes stale, and everything on it is one amber phosphor at
varying intensity with no second hue anywhere.

Shots: `docs/shots/art/signal/`

This is the direction that exists because the diagnosis was "the game half-commits". TIS-100 wins
its look by refusing to concede anywhere, and this refuses too: no prose font, no second colour,
no fill that is not made of light.

**The mark-making language:** the board is built from **horizontal lines**, because that is what
the device physically draws. Terrain is raster — different terrains are different raster patterns,
not different colours. Floor is a dotted quincunx. Wall is full-coverage raster. Rubble is a
*broken* raster with every third line missing. Ice is the only unbroken one. A conveyor arrow is a
filled triangle, which is to say a stack of horizontal runs — the whole argument of the direction
stated in one primitive.

Two details are worth calling out because they are the difference between a filter and a design:

- **The raster pitch is an integer that divides the tile.** Chosen per zoom to land nearest eight
  lines per tile; `w8-05` at 24 device px lands on 3. Dividing the tile means the phase never
  resets at a cell boundary, so the board is one continuous raster instead of a moiré field — *and*
  the dot columns land on tile edges, reinforcing the countable grid rather than fighting it.
- **A lit line along the top of every exposed solid face.** That is beam overshoot at a brightness
  transition, and it does the job the standard direction's drop shadow does. Without it a raster
  board is a flat texture map and you cannot see where structure is.

The trail is the direction's best trick and it is free: on a phosphor tube a visited cell is one
that has not finished decaying, so the visited-tile heat overlay stops being an overlay and becomes
the thing the display would actually do.

**What it costs in legibility — and this one is expensive, honestly:**

- **Monochrome deletes colour as an information channel.** Three things currently encoded in hue
  have to survive without it. Medals and pass/fail are solved well — rank becomes *how the beam is
  driven* (gold is the only inverted badge in the chrome, silver a struck rule, bronze a dotted
  rule, unearned has no border), and failure is a hatch texture before it is a colour, so it
  survives a colour-blind read.
- **Bot identity is the real casualty.** Twelve intensities of one amber is not a usable identity
  channel — a player cannot name an intensity from memory. Its author was blunt: *"If the bot
  painters can't change, this direction should not ship for World 7."* That is now fixed (a
  numeral printed in the far-zoom chip, plus a four-bit punch strip on the hull), but it is a
  standing tax: every future feature that would reach for a colour has to find a shape instead.
- **`rock` vs `wall` vs `rubble` is the weakest triple at 24px** — all three are dense horizontal
  texture, separated only by break density.
- The scanline pass costs roughly **12% of overall luminance**. Bloom returns it on lit marks and
  not on dim ones, which is the right sign, but every overlay is working harder here than
  elsewhere.

**CRT curvature was considered and rejected**, for a reason worth recording: a curved 48x40 grid
makes edge tiles non-square and uncountable, and hit-testing stays rectilinear, so the tile the
player clicks stops being the tile they see. DESIGN.md §8's "no curvature" turns out to be a
gameplay rule wearing an aesthetic hat. Retrace, halation, bloom and persistence were taken
instead — all things the beam does to the *image*, not to the *geometry*, and geometry is what the
player is debugging against.

**Cost to finish properly:** give rubble a fourth channel (withholding the crown line from it is
the cheapest); validate World 7 with twenty bots on screen; decide whether the one bent rule
(`danger` red-shifting to `#ff5a1f`) is a concession too far or exactly the right one.

---

## 5. DEEP SITE — the board is a lit place

**The bet, in one sentence:** stop drawing a diagram of the site and draw the site — give the board
material, a fixed light and real depth, and let the simulation be the spectacle the way Factorio's
belts and Opus Magnum's arms are.

Shots: `docs/shots/art/deepsite/`

This is the direction that competes on **craft and density** rather than on a concept. It is also
the one that would be most at home on a Steam page without any explanation, because it is playing
the game every other good-looking industrial sim plays.

**The mark-making language:**

- **One fixed key light from the north-west, for the whole game.** Every solid gets a lit top edge,
  a dark south face and a cast shadow; every floor gets ambient occlusion where it meets a solid.
  Because the light never moves, the shading becomes a *language* the player reads instantly rather
  than an effect. The chrome obeys the same light — panel bevels are lit along the top and
  shadowed along the bottom, and a pressed button swaps the two, so the housing and the thing it
  houses agree about where the sun is.
- **Everything is an ordered 4x4 Bayer dither on a four-step ramp. There are no anti-aliased
  gradients anywhere**, and no soft diagonals — even sloped lines are drawn as runs of square
  blocks. This is the key craft decision and it is a *legibility* decision as much as a stylistic
  one: at 24 device px per tile a two-tone checker resolves into an honest mid-tone, where a smooth
  ramp resolves into mud with a seam at every tile edge.
- Materials are distinguishable **by texture with colour removed**: plate is flat with seams and
  rivets, grain is fine and granular, stone is chipped and faceted with warm oxide in the cracks,
  ice is smooth with internal fracture. Tile variation comes from a deterministic hash of `(x, y)`
  — deterministic because the terrain cache rebuilds on every zoom step, and a regolith field that
  reshuffles itself when the player scrolls is worse than one that tiles.

**The discipline that makes it work** is a single number, `FLOOR_SPREAD = 0.09`. This was the risk
I flagged to its author before they started: *this is the direction most able to bury the grid and
the trail under its own texture.* Their answer is a stated luminance budget — a floor may swing
only ±0.012 of relative luminance around its mid, roughly a third of what the grid moves it and a
third of what the trail's first step moves it. Solids get a much wider spread (0.24) because
nothing walkable is ever drawn as one, so they are not competing with the trail.

The consequence is worth noting because it is a real design concession: **the shipped biome table
dims whole worlds by up to 45% to sell a cave, and this direction cannot do that** — a floor dimmed
to 55% is a floor the trail's cold end no longer separates from. So the darkness moves into the
walls and the void, where nothing has to stay legible on top of it, and the eight zones differ by
hue and material rather than by value.

That budget was **measured rather than eyeballed**, by rasterising the real output in software and
comparing per-tile mean luminance across a field of one terrain against how much the overlays move
it. Across all eight biomes the floor sits in a band of 0.082–0.103 mean L with tile-to-tile
variation of 0.001–0.003, while the *smallest* overlay — the trail's cold end at 20% alpha — moves
a tile by 0.024–0.031. That is **8x to 32x the texture's own tile-scale variation**, and the grid
is roughly twice the trail again. Even the worst case, a floor tile in the corner of two walls
carrying both cast shadows, still gets moved 0.023 by the trail and 0.048 by the grid.

The check also caught two real bugs before I ever saw them: the signal biome's ice fractures were
drawing a near-white hairline that pushed peak luminance to 0.34, and soil and ice were both out of
band. That is the kind of thing that ships and then gets found six weeks later as "the trail
doesn't work on ice".

**What it costs in legibility:**

- **It is the busiest board of the three, and busy is a permanent tax.** The value-range budget
  keeps the grid and trail on top today, but every future overlay has to be checked against a
  textured floor rather than a flat one. The other two directions do not carry that.
- **It is the least distinctive of the three.** If the goal is "a stranger stops scrolling", this
  is a very well-made version of a thing they have seen before. Survey and Signal are not.
- Dither is a commitment: it looks deliberate at 24-48px and can look like noise if the game ever
  renders at a non-integer scale.

**Cost to finish properly:** equipment silhouettes want another pass (a depot should be
recognisable across a 48x40 board by shape alone); the eight biomes are differentiated but not yet
*characterful*; and the dither cell size should probably be pinned to device pixels rather than
tile fraction so it never lands on a half-pixel.

---

## 6. Side by side

`docs/shots/art/<direction>/`. Three matched sets, same scene, same window, same tick, so they can
be flipped between. **`standard` is included as the baseline** — it is what the game looks like now.

| file | what it is |
| --- | --- |
| `stress-trail-20bots.jpg` | 30x30, **24 device px/tile**, tick 400, 20 bots, **visited-tile trail lit**. The worst case for everything at once: small tiles, many bots, heat overlay. The most useful single comparison. |
| `showcase-48px.jpg` | 14x9 at 48px/tile, tick 30. Every terrain, a machine, a conveyor run, crops at three maturities, ground items, three bots. The close-up read of each direction's mark-making. |
| `w4-05-preview.jpg` | The real app, `w4-05` (40x40 cave), **before any Run** — the establishing shot that used to be a black rectangle. Survey / Signal / Deep Site only. |
| `survey/w4-05-work-order.jpg` | The same frame with the work order still up: the site *and* the order, which is what opening a level now looks like. |

The harness HUD (top-left) is left in deliberately: it carries the frame time, the tile size and
the terrain rebuild count for the exact frame you are looking at.

| | **Survey** | **Signal** | **Deep Site** |
| --- | --- | --- | --- |
| Board is | a drafting sheet | a phosphor tube | a lit place |
| Value | **dark-on-light** | light-on-dark | light-on-dark |
| Marks | hatch, stipple, ruled line | raster scanlines | ordered dither |
| Colours on the board | ink + 3 annotations | **one** | material hues |
| Grid legibility | **best** — free by construction | good — graticule never hides | good — needs a policed budget |
| Bot findability | **best** — darkest mark on lightest field | weakest — needs a printed numeral | good — cool light on warm site |
| Recognisable cropped to 200px | **yes** | **yes** | less so |
| Ongoing tax | none | monochrome, forever | texture budget on every overlay |
| Frame cost (mean, 30x30, 20 bots) | 0.34ms | 0.39ms | 0.30ms |
| Terrain rebuild (30x30) | 1.2ms | 1.6ms | 1.7ms |

Two results worth pulling out of that table:

**None of the three costs frame budget.** All three are *faster* than the shipped look (0.54ms mean,
3.4ms rebuild), because painting terrain from code in one pass per material beats blitting 1920
atlas frames. Performance was the risk I expected to have to trade against and it evaporated.

**Every direction beats the shipped grid**, because the shipped grid is a 1-*device*-pixel line —
half a CSS pixel on a retina panel. That was AUDIT-UI F6 and it was one number.

### What it weighs

**No new dependencies and no new fonts.** `Inter` and `JetBrains Mono` were already self-hosted as
variable fonts with full weight ranges; the type hierarchy in all three directions is bought with
weights and tracking that were already in the download. **No new binary assets** — every mark in
every direction is drawn in code, so there is no new image, atlas or sprite sheet.

The whole spike is ~6,400 lines of TypeScript under `src/render/art/` and ~1,900 lines of CSS
under `src/ui/styles/art/`. In the built bundle that is **`index.css` at 80.5 kB / 13.5 kB gzipped**
carrying all three directions' stylesheets at once, and the direction modules inside the main
chunk. Shipping only the chosen direction removes roughly two thirds of both. Nothing else about
the build changed; the pre-existing Monaco chunk-size warning is untouched.

Notably the art *replaces* rather than adds at runtime: a direction that paints its own terrain
never loads a tile atlas frame for the floor, so the 768x432 atlas PNG becomes needed only for the
machine, crop and item sprites that are still outstanding below.

---

## 7. What is not finished

Honest list, because a spike that only reports its wins is not useful.

- **Machines, crops and ground items still come off the 48px tile atlas.** Every direction paints
  its own terrain and its own bots, then `renderer.ts` drops atlas sprites on top. The fix is a
  `drawMachine?` / `drawCrop?` / `drawItem?` hook alongside `drawBot?`.

  **This does not penalise the three equally, and it is worth knowing which way it cuts before
  reading the screenshots.** The atlas was authored for a dark, warm, mid-saturation world, so:
  Deep Site barely shows the seam and is quietly flattered by it; Survey shows it most *visibly* —
  saturated sprites on a bone sheet; and **Signal shows it worst in principle**, because purple
  crops and a blue item on a monochrome amber tube do not merely clash, they break the entire
  premise of the direction. Compare `showcase-48px.jpg` across the three: every non-terrain object
  in Signal's shot is a hole in the bit. Judge that direction on its terrain and bots, and mentally
  subtract the sprites.

  **I deliberately did not simply skip those passes**, which would have "fixed" all three looks:
  crop maturity is required information (`w2-02` is unsolvable without it) and a prettier board
  that hides what the player has to read is exactly the trade this brief forbids.
- **Signal gates the board behind an animation.** Its 1.6s reveal sweep is time-driven, so in a
  backgrounded or throttled tab the board can sit half-drawn. It is a good effect and it should not
  be the only route to seeing the level; it wants a hard cap and an immediate-complete on focus.
- **Survey's coordinate numbers vanish at `w8-05`**, the one board that most needs them. The
  screen-space readout that fixes it is now possible (`PostPaint` carries the camera) but the
  margin annotation is still drawn inside the terrain cache.
- The eight-world differentiation is thin in all three. Survey tints the paper stock a few points;
  Signal cannot use hue at all; Deep Site changes material but had to give up the biome dimming
  that sold a cave.

---

## 8. Recommendation

**Ship SURVEY.** Then keep Signal as a second, selectable direction, and treat Deep Site as the
fallback if the brief ever changes to "make it look like the other good industrial sims".

That is a ranking, so here is the reasoning rather than the adjectives.

### Why Survey wins

**1. It is the only one where the art direction makes the game *more* readable, not less.**
Every other direction in this spike — and every direction I considered and rejected — trades
legibility for atmosphere and then spends effort clawing it back. Survey does the opposite. Ink on
paper is the highest-contrast board this game can have; the audit's worst rendering finding (F6:
grid invisible at 18% alpha over a floor of the same value) *cannot occur* on it; and the ruler
ticks and coordinate numbers that fix "no axis labels, no coordinate readout" arrived as a
by-product of committing to the bit rather than as a feature someone had to argue for. When the
brief says readability beats beauty, the right answer is the direction where you never have to
choose.

**2. It is unmistakable, and it is the only one that is.** Deep Site is the best-crafted board of
the three and it looks like a very good version of something a Steam browser has already scrolled
past — dark industrial sim, warm lights, dithered rock. Signal is unmistakable but it is
unmistakably *TIS-100*, and being second at someone else's idea is worse than being first at your
own. A pale drafting sheet inside dark chrome is a composition nobody else in this genre is using,
it survives being cropped to a thumbnail, and it is legible at 200px where two dark boards are not.

**3. It is the only one that matches the writing, which is this game's best existing asset.** The
prose is already excellent and already completely sure of itself — *"Yield is up eleven percent.
Yield is measured by a machine that we also maintain."* That voice belongs on a form, filed in
triplicate, by a department that draws everything up. The diagnosis was that the game half-commits
to its bit; Survey is the direction where the look finally agrees with the words.

**4. It has no ongoing tax.** Signal costs monochrome forever: every future feature that would
reach for a colour has to find a shape instead, and its author was blunt that bot identity is a
standing problem. Deep Site costs a policed luminance budget on every overlay anyone ever adds.
Survey costs nothing structural — it is a value system and a mark language, and both are additive.

**5. It fixes the composition problem too.** With the board full-bleed and pale, the eye lands on
the simulation. The old screenshot's largest object was an empty black code editor; the new one's
largest object is the site.

### What I am not glossing over

- The atlas machines and items look worst on Survey. A saturated sprite on a bone sheet is more
  obviously wrong than the same sprite on a dark board. This is the first thing to fix and it is a
  known, scoped piece of work.
- Rock and rubble converge at 24px/tile.
- It is the furthest from what "a sci-fi programming game" is expected to look like. That is the
  bet. If the user's instinct on seeing it is *"this doesn't look like a game"*, that instinct is
  worth more than my argument and Deep Site is the right answer instead — it is genuinely
  excellent and it is finished to the same standard.

### Why keep Signal rather than discard it

The registry makes a second direction nearly free — one file, one stylesheet, one line. Signal is
the most atmospheric thing in the spike and the one I would most enjoy looking at for ten minutes.
It is also the one I would least like to debug a forty-tile maze in for two hours. That is exactly
the shape of a **selectable alternate**, not a default. Its phosphor-persistence trail is the best
single idea any of the three produced, and it would be a waste to bin it.

### What I would do next, in order

1. `drawMachine?` / `drawCrop?` / `drawItem?` hooks, so a direction owns everything on its board.
   Biggest remaining visual defect, and it is worst on the recommended direction.
2. Survey's coordinate readout into screen space (`PostPaint` already carries the camera).
3. Cap Signal's reveal and complete it immediately on focus.
4. Give the eight worlds real differentiation inside the chosen direction.

### Taking one forward

Everything is **staged, not committed** — this repo's standing rule is that nothing gets committed
without the user asking, and that rule explicitly overrides task instructions to the contrary.

The separability the brief wanted is structural rather than in the commit graph, which is stronger:
**each direction is exactly two self-contained files.** To ship one and drop the others, delete the
other two `src/render/art/*.ts` and `src/ui/styles/art/*.css`, remove their entries from the
`DIRECTIONS` record and `ART_IDS` in `src/render/art/index.ts`, narrow the `ArtId` union in
`src/render/art/types.ts`, and drop two `import` lines from `src/ui/App.tsx`. Nothing else refers
to them. If separate commits are still wanted, the natural split is: the seam and the preview →
the layout restructure → one commit per direction → docs and shots.

**One caveat on process.** The three directions were authored in parallel against a shared seam
and then integrated; they have each been checked against the constraints that matter — contrast
measured, trail invariants tested per direction, frame cost benchmarked, reduced-motion honoured —
but they have had a few hours of looking at, not a few days. Any of them will have things in it
that a week of play would find. The bet I am confident about is the *direction*, not every
decision inside it.
