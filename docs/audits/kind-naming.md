# Kind-naming audit — shared brief

Read `docs/audits/BRIEF.md` first; this is a narrow follow-on in the same family, and the same
fair/unfair distinction governs it.

A board's contents live in different fields of the same free `scan()` read. Terrain is
`TileView.terrain`, loose items are `TileView.items`, a chalk mark is `TileView.mark`, a crop is
`TileView.crop`, a machine is `TileView.machineId` (`src/engine/sim.ts:56`). A player who does not
know which field a thing lives in cannot write the survey at all — not "writes a worse survey",
cannot start. That is DESIGN §11, and no amount of hint text repairs it, because hints sharpen and
do not introduce.

The question that produced this audit, asked of `w3-01` by a player with the board in front of
them: *how am I supposed to detect the crates and the pads — are those items? terrain? marks?*
Nothing player-facing answered it. The brief said "every pad must end the shift holding a crate"
and the facts said "on the west siding" — both true, neither one naming a category.

Name the category in the facts, in parentheses, at the point the kind is introduced:

    { label: 'The crates', value: 'Crates (an item) lying on the west siding. As many crates as there are pads.' },
    { label: 'The pads', value: 'Pad (a terrain) on the east side of the shed. A loaded pad is a pad with a crate lying on it.' },

Name the category, never the expression. `scan().terrain === Terrain.Pad` handed over is the
level; "pad is a terrain" is the premise the level is built on top of. The player has the API docs
and can find the field once they know which field it is.

## Findings

## Worlds 1-3

Campaign-order note that governs every verdict below: `scan()` does not exist until `w2-02`
(`src/runtime/api-spec.ts`, `unlockedBy`). Nothing in World 1 can read a `TileView` field at all —
the only instrument is `canMove(dir)`, a boolean about the next tile. So the World 1 terrains are
inventoried here but not annotated: "(a terrain)" on a sheet whose reader has no field to put it in
is a row that answers a question the level cannot raise, and the parent brief's own warning about
noise on a fact card applies. `pad` gets its naming at `w3-01`, which is the first order that
requires detecting one.

### w1-01 — Cold Start

**Kinds:** `wall`, `floor`, `pad` (all terrain). First appearance of all three.
**Unnamed:** all three, and deliberately left so. Hardware here is `move`/`pos`/`print`/`wait` —
there is no sensing call of any kind, `canMove` arrives at `w1-03`. The route is quoted leg by leg
in `facts` ("**19 East, 5 South, 22 West, 5 South, 22 East.**") and `board.redrawn` says nothing is
redrawn, so the pad is arrived at by counting, never detected. No player program on this board can
read a terrain, so no player is blocked by not knowing which field holds one.
**Changed:** nothing.

### w1-03 — Length Unknown

**Kinds:** `wall`, `floor`, `pad` (terrain).
**Unnamed:** as above. The corridor end is found by `canMove(Dir.East)` going false, and the fact
card states exactly that ("True when the next tile East is clear. Asking is free."), with
`board.fixed` adding "the pad is the last floor tile of the corridor". The pad is a destination
here, not a thing to sense.
**Changed:** nothing.

### w1-05 — Floor Inspection

**Kinds:** `wall` (outer wall and the partition), `floor`.
**Unnamed:** as above. Both objectives (`inspectedEveryTile`, `oneMovePerFloorTile`) are derived
from `walkableTiles` on the initial world; the player finds walls with `canMove`. No `scan()`.
**Changed:** nothing.

### w2-02 — Rotation

**Kinds:** `soil` (terrain — every one of the 25 field tiles), `crop` (`TileView.crop`, first
appearance), `seed` (an `ItemKind`, but only ever in the hopper — never on a tile). First level in
the campaign with `scan()`.
**Unnamed:** `soil`. `crop` was already resolved: the "Bare soil" row said "Reads `crop: null`",
which names the field outright, and the starter code prints `here.crop`. `seed` is not a
`TileView` question — it lives in the inventory and `plant()` defaults to it. But `soil` appeared
only as an English noun ("workable soil", "bare soil", "the field is 5 by 5 of soil"), and the
conflation is the trap: "bare soil" is two facts glued together — a terrain and an empty `crop`
field — and the sheet named the second and not the first. `plant()`'s refusal rule ("the ground is
not soil") is graded through `everyTilePlanted`, and the only doc page that resolves it is the
`plant` API page, which is the API-docs escape hatch the parent brief already rules insufficient.
This is `soil`'s first appearance in the campaign, so it is annotated here rather than at `w2-04`
or `w2-05`.
**Changed:** `w2-02.ts` `facts`, the "Bare soil" row now reads `'Soil (a terrain) with nothing on
it. Reads `crop: null` and `growth: 0` of `maxGrowth: 0`. Plant it — seed only goes into bare
soil.'` — same three clauses, category named, and "Plant it" moved to the end so the row reads
definition-then-instruction like its neighbours.

### w2-04 — Capacity

**Kinds:** `soil`, `crop`, `seed`. No new kind.
**Unnamed:** none. `soil` is named one level earlier and `board.fixed` here repeats the guarantee
("every tile is soil, so a bare tile is empty rather than blocked"). The one field this order adds
is `sproutsIn`, and it has its own fact row naming it as something `scan()` reports — which is the
three-legs fix DESIGN §11.7 cites as its own precedent, already applied.
**Changed:** nothing.

### w2-05 — Harvest Quota

**Kinds:** `soil`, `crop`, `ice`. `ice` is first-appearance and is the interesting one: ice-scrub
is planted as a *crop* (`ItemKind.Ice` in `TileView.crop`), not as an item, so a player could
reasonably expect to find it in `items`.
**Unnamed:** none. The fact card is literally labelled `` `scan().crop` `` and reads `'"crop"`
counts towards the quota. `"ice"` does not'`, which settles both the field and the two legal
values. The starter code repeats it. This row is the best existing example in worlds 1-3 of the
fix this audit asks for.
**Changed:** nothing.

### w3-01 — Pick and Place

The worked example. `crate` (an item) and `pad` (a terrain) are both named in `facts` already.
Not touched.

### w3-02 — Sorted by Colour

**Kinds:** `floor`, `pad` (the depot pads, via `depotPad` in `yard.ts`), `mark` (the class
stencilled on each pad), and the seven `YARD_CLASSES` — `crate`, `part`, `chip`, `cell`, `ore`,
`stone`, `scrap` — all of them loose **items** on the floor.
**Unnamed:** the classes. `mark` had a fact row of its own (`` `scan(dir).mark` ``) and `pad` was
named at `w3-01`, but nothing said where a floor crate's *class* is read from. That is the whole
level: the program builds a class → pad table, so it has to read a class off a pad (`mark`, given)
and off a crate (`items`, not given). The brief calls every one of the seven "a crate", which
makes it worse — it reads as one kind of thing with a colour painted on it, and a player who
carries the `mark` idea across will look for a stencil on the crate and find `null`. The reference
solution (`__solutions__/w3-02.ts`) reads `tile.items` and matches `stack.kind` against
`tile.mark`; the level said neither half. Note that `carrying()` unlocks here and returns
`ItemKind[]`, so pick-up-then-look is a legal but tick-expensive alternative route — it does not
repair the gap, because surveying before lifting is what the bonus grades.
This is the "reappears in a role the first level did not establish" case the brief allows:
`w3-01` named crate as an item, but there the item kind never mattered, there was one of them and
`pickup()` took whatever was under the wheels.
**Changed:** `w3-02.ts` `facts`, new first row above the `mark` row —
`{ label: 'The crates', value: 'Crates (an item) lying loose on the yard floor. A crate has no
stencil — its class is the kind of item it is.' }`. Category named, and the stencil/kind
distinction stated where a player will otherwise assume symmetry. No expression handed over: the
matching `items[].kind === mark` is still theirs to write.

### w3-04 — First In, First Out

**Kinds:** `floor`, `pad` (the one outbound bay), `mark` (the arrival number, as a numeric
string), `crate` (an item).
**Unnamed:** none of the three that matter. `mark` has its own fact row; `pad` is named at
`w3-01` and the fact card says "The outbound bay is the one pad tile in the yard", in the same
terrain role `w3-01` established; `crate` as an item is named at `w3-01` and this order needs no
more from it than `w3-01` did — a slot only ever holds `'crate'`, and the identity the level
grades is the stencil, not the kind. Repeating "(an item)" three levels running is the noise the
brief warns about.
**Changed:** nothing.

### Worlds 1-3 — noted, not changed

Two things outside this audit's scope, for whoever owns the wider §11 pass:

1. **`w3-04`, the stencil/crate correspondence.** `build` stencils a `mark` only onto slots that
   receive a crate, so `mark !== null` is a complete and free crate detector — which is how the
   reference solution can work the yard without ever reading `items`. Player-facing, the converse
   is stated only in hint 1 ("Every occupied slot has a number painted on it"), and the facts and
   `board.fixed` never say that an unpainted rack slot is guaranteed empty. That is DESIGN §11.3
   (a hint carrying the premise), not a kind-naming defect, so it is left alone here.
2. **`w2-02`/`w2-04`/`w2-05` and the `soil` guarantee.** All three boards are 100% soil and all
   three say so in `board.fixed`, so `soil` is never actually detected anywhere in World 2. The
   annotation added at `w2-02` is therefore forward-looking — it exists so that the first order
   which *does* mix soil with something else has the category already on the record. If the
   worlds 4-6 pass finds soil next to non-soil, that level is where the read becomes load-bearing.

## Worlds 4-6

Scope: `src/levels/world-4/`, `src/levels/world-5/`, `src/levels/world-6/`. First-appearance rule
applied in campaign order, so a kind introduced here is named once and left alone on every later
level in the range. `wall`, `floor`, `pad`, `soil`, crops/seeds and `crate` are assumed named by
the Worlds 1-3 pass.

Verified against the code rather than the inventory handed over: `rock` first appears at `w4-01`,
`depot` at `w4-04`, `ore` (terrain and item) at `w4-05`, `cable` at `w5-01`, `pit` at `w6-03`.
`stone`, `scrap`, `ice`, `regolith` and `rubble` appear nowhere in Worlds 4-6 — `w4-05` is the only
mining level in the range and it cuts ore only, into `Terrain.Wall` that is deliberately not
mineable. Nothing to name for those four.

### w4-01 — Headlamp

**Kinds:** `rock` (terrain, fill), `floor` (terrain, the tunnel), `pad` (terrain, the goal).
**Unnamed:** `rock`. The whole level is "which way is not rock", read off `look(dir)` rays, and no
player-facing string said whether rock was terrain, an item or something on the tile. `board.fixed`
says "rock everywhere the tunnel is not" — true, and it names no category.
**Changed:** `w4-01.ts` `facts`, new row after "The tunnel":
`{ label: 'The rock', value: 'Rock (a terrain) fills everything the tunnel is not. It cannot be walked on and a ray cannot see through it.' }`.
`pad` left alone — named at `w3-01`, and "the only tile in the tunnel that is not plain floor" is
enough once the category is known.

### w4-02 — Breadcrumbs

**Kinds:** `rock`, `floor`, `pad` (the ore vein), `mark` (the star's whole mechanic).
**Unnamed:** none. `mark` is the first appearance in the campaign and the facts already name the
field twice — "`readMark()` Returns the string under the bot" and "A tile's mark also shows up in
what `look` returns", which is the `TileView.mark` field said in words. `pad` and `rock` are both
already introduced.
**Changed:** nothing.

### w4-04 — Map First, Move Second

**Kinds:** `rock`, `floor`, `pad` (three collection points), `depot` (the lift).
**Unnamed:** `depot`. First appearance in the campaign. "One depot tile" says there is one and does
not say what a depot is — and the two graded landmarks on this board are distinguished only by
terrain, so a player who cannot tell which field `depot` lives in cannot separate the lift from the
collection points at all. The file's own comment already argues that separability is load-bearing.
**Changed:** `w4-04.ts` `facts`, "The lift" row now reads `'Depot (a terrain). One tile of it.'`

### w4-05 — The Deep Shaft

**Kinds:** `wall` (opaque, not mineable), `floor`, `depot` (the lift), `ore` **terrain** (the vein
faces), `ore` **item** (what `mine` yields, graded by `inventoryAtLeast`).
**Unnamed:** both senses of `ore`. This is the sharpest case in the range, because `ore` is the one
string that is a legal value of *both* `Terrain` and `ItemKind`, so even a player who reads the API
type declarations cannot resolve it — a vein face is `scan().terrain === 'ore'` and the quota is an
`ItemStack` of kind `'ore'`, and nothing player-facing distinguished them.
**Changed:** `w4-05.ts` `facts`, "The veins" row now opens `'Ore (a terrain) set into the tunnel
walls'` and adds `'Cutting a face clears it to floor and puts ore (an item) in the hold.'` before
the existing `wall` sentence. `depot` left alone — named at `w4-04`, and "The depot tile the bot
starts on" is already in the fact card here.
**Incidental:** `npx prettier --write` reflowed one pre-existing 101-character line in `unfiled()`
(the `'a different figure'` divergence). Committed formatting drift, not my change; left fixed
because reverting it would only fail the next `npm run format`.

### w5-01 — Mains

**Kinds:** `wall` (the frame), `cable` (the one walkable row), machines (`reactor`, `sub-1` upward,
`MachineKind.Node`).
**Unnamed:** `cable`. First appearance in the campaign, and it is the only walkable terrain on the
board — the whole corridor the bot drives. `board.fixed` said "one row of cable, twenty tiles long"
without saying whether cable is terrain, an item lying on floor, or a machine footprint.
**Machines are not a defect here.** This is also the campaign's first machine level, and the audit
flagged `scan().machineId` as newly in scope. It is not reached in Worlds 4-6: every machine in
World 5 and World 6 is addressed by a **stated id** (`reactor`, `sub-<n>`, `relay-<n>`,
`feeder-<n>`, `consumer-<n>`), the facts give the id scheme and the `null` sentinel past the last
one on every level that has machines, and `TileView.machineId` is first needed at `w7-05`, outside
this batch. Nothing to name.
**Changed:** `w5-01.ts` `facts`, "The line" row now opens `'One row of cable (a terrain), walkable,
walled on every side.'` before the existing two sentences.

### w5-02 — Continuity Test

**Kinds:** `wall`, `cable` (the whole snaking run), machines (`reactor`, `relay-0`..`relay-199`).
**Unnamed:** none that this level owes. `cable` is introduced at `w5-01`, one level earlier, and
naming it again would be the repetition the brief warns against.
**The §11 exception, argued.** I considered nothing safe *and* necessary to add here, so nothing
was added. The exclusion in my instructions permits naming which field a kind lives in, and that
would have been safe: the run's shape is already fully published — the brief says two hundred
segments, the facts say `relay-0` through `relay-199` "in order, from the reactor outward", and
`probe(id).vars.live` is spelled out down to which value means which side of the break. What is
withheld is *which* relay is broken, and no category name touches that. But there is also nothing
left to name: the player never scans a tile on this level, never needs the terrain, and reads
everything through `probe` on an id the facts hand over. Adding "cable (a terrain)" here would be
noise on the one fact card in the game that most needs to stay short.
**Changed:** nothing.

### w5-03 — Order of Operations

**Kinds:** `floor` (the district), `cable` (one tile under the reactor and under each station),
machines (`reactor`, `sub-<n>`).
**Unnamed:** none. Everything graded — the prerequisite lists, the states, the travel allowance —
is read through `probe(id)` and `vars`, and the facts name `prereq:<id>` and `vars.travelBudget`
by key. The cable tiles under the machines are a marker the level never grades and never asks the
player to detect; the crew walk is arithmetic on `machine.at`, not on terrain.
**Changed:** nothing.

### w5-04 — Load Balance

**Kinds:** `floor` (the yard), `cable` (one tile under each feeder and consumer), machines
(`feeder-<n>`, `consumer-<n>`).
**Unnamed:** none. "What reports what" names both id schemes, both `vars` keys (`capacity`,
`draw`) and the `null` sentinel, and `board.fixed` states outright that `link` takes both ends by
id so nothing has to be driven to. No terrain is detected or graded.
**Changed:** nothing.

### w5-05 — Blackout

**Kinds:** `floor` (the district), `cable` (one tile under the reactor and each station), machines
(`reactor`, `sub-<n>`).
**Unnamed:** none. Ids, `vars.cableBudget` and the `weak <id> <n>` report line are all named in the
facts, and `board.fixed` states that the field is empty so no cable is ever obstructed. Cable as a
*resource* (the drum) is fully specified and is a different thing from `Terrain.Cable`, which here
is only the marker drawn under a machine and is never graded.
**Changed:** nothing.

### w6-01 — Carrier Wave

**Kinds:** `wall`, `floor` (the shack), the antenna machine (`mast`, `MachineKind.Antenna`) with
the band queued in the tile's `meta.rx` beneath it.
**Unnamed:** none the level owes. The bot never moves and no terrain is graded. The band is not a
`TileView` field at all — `receive()` and `buffered()` are runtime compositions over the antenna
(`src/levels/world-6/signal.ts`), and the facts name both calls, their return values and the
`null` sentinel. `meta.rx` is engine plumbing the player has no route to and needs none.
**Changed:** nothing.

### w6-02 — Checksum

**Kinds:** `wall`, `floor` (the shack), antenna (`mast`).
**Unnamed:** none. Everything graded is packet text and `probe('mast').vars.salt`, both named in
the facts; the id `mast` is given in the fact card and in the starter.
**Changed:** nothing.

### w6-03 — Compression

**Kinds:** `pit` (terrain, the whole field), `floor` (the route), `pad` (terrain, the goal),
antenna (`mast`).
**Unnamed:** `pit`. First appearance in the campaign, and the level fills a 20 by 20 board with it.
"Off the route — Pit. Every tile that is not on the route is a pit." named the thing and not the
category.
**Changed:** `w6-03.ts` `facts`, "Off the route" row now reads `'Pit (a terrain). Every tile that
is not on the route is a pit, and a bot that ends a move on one does not come back.'`
**Why the second clause, deliberately beyond a bare category name:** `pit` is the one terrain in
the game where `TileView.walkable` is `true` and stepping on it is still fatal
(`src/engine/types.ts:44`). Naming the category on its own would point a player straight at
`walkable`, which is the wrong field and answers "yes" — a worse outcome than saying nothing.
The lethality is graded (`stayOnRoute()`, `src/levels/world-6/signal.ts`) and its only prior
player-facing statement was the objective label "Keep the bot out of the pits" and the `Terrain`
type doc, which is DESIGN §11.1 territory as much as this audit's. `pad` left alone (named at
`w3-01`); `floor` left alone.
**Incidental:** `npx prettier --write` rejoined a pre-existing two-line `inbound` arrow that fits
in 100 columns. Committed formatting drift, not my change.

### w6-04 — Cold Start

**Kinds:** `wall`, `floor` (the shack), antenna (`mast`).
**Unnamed:** none. No terrain is detected or graded; the level's whole content is the band, and
`board.fixed` already states outright that no `probe` will hand over the key.
**Changed:** nothing.

### w6-05 — Telemetry

**Kinds:** `pit` (the whole 30 by 30 field), `floor` (the route), `pad`, antenna (`mast`).
**Unnamed:** none outstanding. Same "Off the route — Pit." card as `w6-03`, in the same role, two
levels later; under the first-appearance rule the naming belongs at `w6-03` and repeating it here
would be the noise the brief warns about. Everything else the level grades is packet text,
`probe('mast').vars.salt` and printed lines, all named in the facts.
**Changed:** nothing.

### Worlds 4-6 — noted, not changed

1. **`pit` lethality was player-facing only in an objective label** (`w6-03`, `w6-05`). Handled in
   copy at `w6-03` for the reason argued above. The deeper issue is a §11.7 one and is not mine to
   fix: `TileView.walkable` reads `true` on a pit, so the API actively misinforms a defensive
   program. Recommendation for the user, not implemented — either `walkable` reports `false` for
   `Terrain.Pit`, or `TileView` grows a field that says "this kills". Both are behaviour changes
   and both touch `src/engine/`.
2. **`Terrain` and `ItemKind` are the only place the categories are enumerated**, and `ore` is a
   legal value of both. `w4-05` is the only level where that ambiguity is load-bearing and it is
   now resolved in copy, but a reader who leans on the type declarations rather than the fact card
   still has no way to tell the two `'ore'`s apart. A one-clause addition to the `ItemKind` doc in
   `src/runtime/api-spec.ts` — that `ore`, `ice` and `regolith` name both a terrain and the item
   cut out of it — would close it globally. Not done: `api-spec.ts` is outside this batch and is
   shared with two other agents.
3. **This file is now interleaved.** Three agents appended concurrently, so `## Worlds 4-6` at
   line 88 holds only the World 4 sections; World 5 and World 6 landed further down, after other
   batches' headings. Append-only was the instruction and I held to it. Reordering into one block
   per world is a job for whoever consolidates.

## Worlds 7-8

Campaign-order note for this range: `pad`, `floor`, `wall`, `rock`, `depot`, `soil` and the items
`crate` and `crop` are all first met in worlds 1-6 and are annotated there. What is genuinely
first-in-campaign here is bot-to-bot sensing, `ice`, and `MachineView.links`. Marks first appear at
`w3-02` and machines at `w5-01`, both outside this range.

### w7-01 — Two Bots

**Kinds on the board:** `wall`, `floor`, `pad` (all terrain); two bots. No items, no marks, no
machines.
**Unnamed:** none. The pads are terrain the player never has to detect — both corridors are dead
ends and the facts, the brief and `board.fixed` all say the pad is the last tile of the corridor,
so the run walks until it cannot. Bots are addressed by id through `bots()`/`bot(id)`, which
`hardware` and `docs` both list; nothing here is found by `scan`.
**Changed:** nothing.

### w7-02 — Divide the Field

**Kinds on the board:** `wall`, `floor`, `soil` (terrain); `crop` (`TileView.crop`); one `Sink`
machine, `depot`; a fleet the run raises with `spawn`.
**Unnamed:** none that this level owes. Crops are introduced in World 2, and this order never asks
the player to detect one anyway: the fact card publishes `vars.crops` and `vars.c0 … c{n-1}` as
packed positions, and `probe("depot")` is named as free and reachable from anywhere. The route to
every graded thing is stated end to end.
**Changed:** nothing.

### w7-03 — Right of Way

**Kinds on the board:** `wall`, `floor`, `pad` (terrain, the silo column); `crate` (an item);
two to six bots.
**Unnamed:** none. Crates are introduced at `w3-01`. The silo is graded by column, not by terrain
(`stack.at.x === SILO_X`), and the fact card says so — "The whole west wall. Any tile in **column
1** counts" — so pad terrain is not load-bearing here. Bot-to-bot detection is the level, and it is
named in three separate facts: "Two bots going opposite ways cannot pass", "Held, not standing",
and `canMove(dir)` given as the read that asks `move`'s own question. On the Frustration Watch
(CURRICULUM §11), so nothing was added about what happens when two bots meet.
**Changed:** nothing.

### w7-04 — Dispatch

**Kinds on the board:** `wall`, `floor`, `depot` (terrain); `Node` machines `job-0` upward and one
`Lever`, `board`. No items, no crops, no marks.
**Unnamed:** none. Every graded thing is a machine and the facts hand over the machine route
outright: "`job-0` upward. `probe(id)` is free, reports `vars.cost` and the position, and gives
back `null` past the last one." The player never needs `TileView.machineId` because ids are
enumerable.
**Changed:** nothing.

### w7-05 — Chain of Command

**Kinds on the board:** `wall`, `floor`, `rock` (terrain); `Node` machines `site-0` upward and one
`Lever`, `muster`; one or two scouts and four to eight workers.
**Unnamed:** none. The sites are deliberately unlisted and the fact card names the category and the
read in one line: "The sites are not listed. `probe()` with **no argument** reports the machine
under or ahead of the bot, and that is the only way to find one." Standing rock is World 4 terrain
and `board.redrawn` ties it to what a `look` can see past.
**Changed:** nothing.

### w8-01 — Efficiency Audit (the DESIGN §11 exception)

**Kinds on the board:** `soil` (terrain, the whole field), `pad` (terrain, the silo corner); `crop`
(`TileView.crop`, with `growth`/`maxGrowth`); one `Sink` machine, `silo`.
**Unnamed:** nothing the level grades. The silo is named as `probe("silo")` and reported from
anywhere; the crop and its ripeness are World 2 vocabulary; the pad terrain is not graded at all —
`delivered` counts items on the silo machine's tile.
**Changed:** nothing. Under the exception, nothing was added that says what is on the field.
**Reported, not changed — a real naming collision:** the fact card calls the field "open regolith",
but `build` fills it with `Terrain.Soil`, and `regolith` is a *different, real* `Terrain` value
(`src/engine/types.ts:34`). NARRATIVE.md §"regolith" mandates the word and forbids "soil" in prose,
so the copy is correct by the narrative contract and wrong by the engine's vocabulary. A player who
writes `scan().terrain === 'regolith'` on this field gets `false` forever. Nothing on this level
grades terrain, so it is currently harmless, and I left it alone rather than break the NARRATIVE
rule on my own authority. It is a decision for the user: either the fiction word stops naming a
distinct terrain, or levels that use `Terrain.Soil` stop calling it regolith in copy.

### w8-02 — Full Stack

**Kinds on the board:** `rock` (terrain, opaque, the whole unmapped fill), `floor`; loose crates of
`ore`, `ice`, `scrap`, `part`, `cell`, `chip` (items, `TileView.items`); `Sink` machines
`depot-<class>`.
**Unnamed:** the crates. The bays were already named against their field — "Shows up as a
`machineId` on any tile you can see" — and the crates, which is the other half of the same sort,
had nothing. Worse on this board than on most: three of the six class names (`ore`, `ice`, and the
`rock` the depot is cut from) are also `Terrain` values, so a player reasoning from the class list
has a live wrong field to guess. The starter code compounds it — it prints `scan().terrain` and
`view.machineId` and never touches `items`.
**Changed:** `src/levels/world-8/w8-02.ts` — new fact `A crate`, placed before `A bay` so the two
halves of the sort are named together: "An item, not terrain. A tile's `items` gives each stack's
`kind`, and that kind is the crate's class — the word its bay id ends in."
**Why a second naming, after `w3-02`:** `w3-02` already establishes "a crate's class is the kind of
item it is", five worlds back, on an open lit yard with no terrain that shares a class name. Here
the board is unmapped rock, the roster is different, and the join to the bay id is new. This is the
"reappears in a role the earlier level did not establish" case.
**Declined:** enumerating the six-class roster on the fact card. `probe("depot-ore")` is stated to
work from anywhere without having seen the bay, so a printed roster would let a run locate every
bay from tick zero, which is search the level means the player to do. Naming the field costs the
level nothing; naming the roster would cost it the survey.

### w8-03 — The Grid Goes Down

**Kinds on the board:** `floor`, `pad` (the desk tile), `cable` (terrain, walkable, painted along
every feeder edge); `Node` machines `sub-0…sub-n` and one `Router`, `desk`. No items, no crops, no
marks.
**Unnamed:** none. Everything graded is a machine reached by id — the facts give `probe("desk")`,
`probe(id)`, `vars.deps`/`vars.dep0…`, and `probe(id).at` supplies every position, so no tile ever
has to be recognised by sensing. Cable is World 5 terrain and the facts name it twice ("the cable on
the ground is walkable").
**Changed:** nothing.

### w8-04 — Signal from 4470

**Kinds on the board:** `rock` (fill), `floor`, `depot` (terrain, the lift); `chip` (an item — this
is KD-0001-T itself); a `mark` on every locker tile; `Sink` machines `locker-0…` and one `Antenna`.
**Unnamed:** two, both on the same tile.
1. **The marks.** `build` stencils the target locker `KD-0001-T (unsigned)` and every decoy locker
   `KD-<n>-<L> (signed)`. The brief states the distinction in fiction — "every one of those is
   signed, filed and empty" — and no player-facing string says it is *readable*, or from which
   field. The renderer draws marks (`src/render/overlays.ts:763`, and the hover tooltip prints
   `mark "…"`), so the player sees a stencil on the board that no text accounts for. That is
   §11.7's second leg shipped without the third.
2. **The form.** The locker is a `Sink` machine and the form is a separate item lying on the same
   tile. Nothing said which. `use()` on a Sink is the obvious wrong guess, and the level's own
   objective label ("Finish the shift holding KD-0001-T") does not disambiguate.
**Changed:** `src/levels/world-8/w8-04.ts` — two new facts after `The lockers`. `A locker tile`
names the stencil and gives `scan(dir).mark` plus `look` as the reads, matching the idiom `w3-02`
and `w3-04` already use for this field. `The form` names it as an item taken with `pickup()` and
rules the machine out. Prettier also reformatted three pre-existing spots in this file that were
not formatter-clean (`onSite`, the decoy-packet array, one `if`); whitespace only.
**Not a difficulty change:** the marks only confirm what the decoded plan already leads to, and
walking the workings to read stencils is the "throw the plan away" program the level's own hint 5
already calls correct and expensive. The star (`read-the-plan`) still needs the ninety-five-key
checksum search, which no stencil touches.
**`docs` left alone:** the reference panel lists every *unlocked* API function regardless of
`docs`; `level.docs` only re-ranks guide pages (`src/ui/desk/furniture/Manual.tsx:272`). `scan` and
`readMark` are already on the panel by World 8, so adding them would have changed nothing.

### w8-05 — The Kessler Contract

**Kinds on the board:** `rock`, `floor`, `depot` (terrain, the fuel pumps), `wall` (the two gate
tiles while shut); crates of `ore`/`ice`/`scrap`/`part`/`cell` and one `chip` (items); marks on the
form tile and both filing slots; `Sink` machines `depot-<class>`, `Node` substations, `slot-charter`
and `slot-renewals`, an `Antenna`, a `Router` desk, and the `airlock` with its `links`.
**Unnamed:** none. This is the level where the defect was caught once already and the facts are the
template for the rest: the quota fact says "These sinks are machines, and nothing to do with the
fuel depot **terrain** below"; the fuel fact says "`refuel()` works on any depot **tile** — the
terrain, not a `depot-<class>` sink … `scan()` and `look()` on the terrain are how you find them";
the airlock fact says "`probe("airlock").links` gives the two gate tiles it walls off"; the form
fact says "KD-0001-T is a chip on a marked tile in the workings". Item, terrain, machine, links and
mark are each named against their field.
**Changed:** nothing.

## Follow-on changes

Three defects the sweep surfaced that were not kind-naming, fixed in the same pass.

### `TileView.lethal`

`TerrainProps` has seven properties and `TileView` surfaced six. The missing one was `lethal`, and
it is the one that kills you: `Terrain.Pit` is `walkable: true` on purpose — `move` onto a pit
succeeds, the bot arrives, and then it dies — so a defensive program asking the only free question
the API offered about the tile ahead was told yes and drove into the hole. Making the pit
unwalkable would have turned it into a wall and deleted the mechanic, so the fix went on the
reading side: `lethal` is now a field on the free snapshot, no new cost-table entry, and `w6-03`'s
fact card names both fields because the trap is the pair.

### regolith is not soil

`NARRATIVE.md` mandates "regolith" for farmable ground and forbids "soil", while the engine has
two distinct terrain values — `Terrain.Soil`, which every farming level is built from, and
`Terrain.Regolith`, which no work order places at all. `w8-01` called its field "open regolith"
over `Terrain.Soil`, making `scan().terrain === 'regolith'` false forever there. `w8-01` and
`w7-02` were the only boards whose copy claimed a terrain they did not have.

Resolved in the glossary by dropping the ban rather than by an escape hatch: **soil** is a canon
term of its own now — worked ground that takes seed — and **regolith** is the raw ground rock it
is laid into. Both words are real in the fiction because both are real in the engine, which is
also what World 2's name has always meant. The general rule moved up to the glossary preamble:
where a string names what a read returns, the engine's word wins.

### `w3-04`'s hint-only premise

`build` stencils a mark only onto slots that receive a crate, so `mark !== null` is a complete free
crate detector, and the reference solution depends on it. The forward direction lived in hint 1 and
the converse nowhere. Hints sharpen, they do not introduce (CURRICULUM §2). It is a fact now,
qualified with "when the shift opens" because the paint stays on the tile after a crate is lifted.
