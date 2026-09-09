# Perfect-information audit — the preview leg (DESIGN.md §11.7–8)

**Scope:** every piece of state the levels put into the world, cross-referenced against what
`src/render/` draws and what `src/ui/` surfaces outside of hover, plus the third leg — whether the
value is reachable from the player-facing API.

**Authority:** investigation only. No file in `src/render/` or `src/ui/` was touched. Every gap
below is a recommendation for the user.

**Method:** five inventories built in parallel by sub-agents (world state, renderer, UI, API,
levels), then cross-referenced. Raw inventories are in `docs/audits/renderer.*.part.md`.

---

## The shape of the result

The board is in better shape than the brief feared. Every `Terrain` a level places has a distinct
form; every `MachineKind` and every `ItemKind` has a sprite in all three art directions; growth has
six distinct stages plus the `sproutsIn` clock face; the trail carries a true visit *count*, not a
visited-or-not flag; blocked moves are told from successful ones several times over. The four
things DESIGN §8 says RENDER *must* draw are all drawn.

The failure is one layer up, and it is systematic rather than per-sprite:

> **Worlds 5 through 8 keep their content in `Machine.vars`, and nothing in `src/render/` reads
> `Machine.vars`.** A node's `capacity`, a consumer's `draw`, a segment's `live`, a station's
> `deps`, a door's `stages`, `manual` and `fed:` — twenty-nine distinct keys carrying the actual
> substance of four worlds — all render as the identical machine sprite.

That is not the `0/8` bug exactly: a node *does* draw as a node, so the player sees a known unknown
and knows there is something to `probe`. It is the weaker cousin, and where it crosses into the
real thing is listed below.

Second, and cheaper to fix than anything else in this report: **the hover readout already computes
every field and then throws them away.** `describeTile` (`src/render/overlays.ts:429-467`) builds a
complete `label` — machine kind and state, ground stacks, `mark` — and `readoutLine`
(`src/ui/desk/monitor/feed.ts:36-45`) ignores `readout.label` and hand-rolls a poorer line from
four of the twelve fields. Everything the audit wants surfaced is already in the struct.

Third, **there is no legend anywhere in the game.** Nothing names a terrain, an item kind or a
machine kind for a player looking at a sprite. Hover gives one tile's terrain string; §11.7 says
hover-only is not enough, and here hover is also the *only* channel.

---

## Gaps, ranked

Severity: **1** = a level grades it and the board cannot show it; **2** = a level's solution depends
on it and the board cannot show it; **3** = a leg is missing but the level does not lean on it;
**4** = cosmetic or dead vocabulary.

### 1 — The airlock cranks eight times and the board never moves — severity 1

**The state.** `w8-05`'s airlock is a `Door` with
`cycle: ['sealed','1','2','3','4','5','6','7','8','open']` (`src/levels/world-8/w8-05.ts:72,409`).
Each `use()` advances `state` one step. `vars.stages` publishes the total (`w8-05.ts:408`).

**Which level depends on it.** `w8-05`, graded — the divergence at `w8-05.ts:596` reads
`expected: "open — 8 uses, with <feeder> on"`.

**What a player currently sees.** Nothing, for eight of the nine steps. The machine glow in
`src/render/` fires only for `state` in `on` / `open` / `busy`; `sealed`, `1` … `8` all draw the
identical unglowing door. A player cranking the airlock watches an unchanged tile until the ninth
`use()` flips it open — and that is `w2-04`'s `0/8` verbatim: a mechanic in progress drawn as a
mechanic that is not happening. It is worse than `0/8`, because `0/8` at least printed a number.

**API leg.** Present. `probe('airlock').state` returns `'3'` and `.vars.stages` returns `8`, so a
player *can* write the loop. The fiction leg is present too — the hint at `w8-05.ts:1010` names it.
This is a pure board-leg failure, and the only one in the audit that is a clean instance of the
`w2-04` precedent.

**Recommended fix.** A staged-progress overlay on any machine whose `cycle` has more than two
entries, keyed off `indexOf(state)` in `cycle` against `cycle.length - 1`. `w2-04`'s answer already
exists in `drawSprouting` (`src/render/overlays.ts:244-280`) — a ring plus a number, with the two
zoom cutoffs already tuned. Reuse that vocabulary rather than inventing one; it is the same
statement ("this is partway through, here is how far"). `w7-04`'s job levers
(`cycleFor(job.cost)`, `src/levels/world-7/w7-04.ts:110-115,329`) build the same shape —
`['open','1',…,'done']` — and get the same benefit for free.

**In-lore name.** `stages` is already the word `w8-05` uses. Draw it as *stages turned, of stages*.

---

### 2 — `readoutLine` discards two thirds of the readout it is handed — severity 1

**The state.** `TileReadout` (`src/render/overlays.ts:404-421`) carries `terrain, walkable, growth,
maxGrowth, sproutsIn, crop, items, botId, botName, machine {id,kind,state}, mark, label`.
`describeTile` (`overlays.ts:429-467`) fills all of them and, at `overlays.ts:444-452`, composes a
finished one-line `label` containing the machine's `kind:state`, every ground stack as
`kind xN`, and the tile's `mark` in quotes.

**What a player currently sees.** `readoutLine` (`src/ui/desk/monitor/feed.ts:36-45`) never reads
`readout.label`. It rebuilds a line from `at`, `terrain`, `growth`/`sproutsIn` and `botName` and
drops `machine`, `items`, `mark`, `crop` and `walkable` on the floor. Hovering a sink with twelve
crates in it, or a tile stencilled `charter registry`, reports the coordinate and the word `floor`.

**Which levels depend on it.** `tile.mark` is graded by `w3-02`, `w3-04` and `w4-02`, and authored
into the board by `w8-05:432-435` (`'charter registry'`, `'renewals tray'`) as the *only* thing
distinguishing two otherwise identical sinks. Ground stacks matter to all of world 3 and world 8.
Machine state matters to all of world 5.

**API leg.** Present for all of it — `scan()` returns `items` and `mark`, `probe()` returns `state`.

**Recommended fix.** `return readout.label`. The composition is already written, already tested for
width, and already in the right voice. This is the single cheapest fix in the report and it needs
no art. If the OSD strip is too narrow for the full label, that is a layout decision — but the
truncation should be the strip's, not a second hand-rolled formatter's.

*(Not applied: `src/ui/` is out of my authority.)*

---

### 3 — No legend exists — severity 2

**What a player currently sees.** There is no surface anywhere in the game that names a terrain, an
item kind or a machine kind against its sprite. The only thing called a legend is the medal key on
the campaign map. Terrain names reach the player through exactly one channel — the hover OSD strip
— and §11.7 says in terms that hover-only is not enough.

**Which levels depend on it.** Every level that places more than one terrain, which is every level
after `w1-01`. Sharpest at the world boundaries where a new terrain arrives: `Depot` first appears
in `w4-04`, `Cable` in `w5-01`, `Pit` in `w6-03`, `Ore` in `w4-05`. A player meeting a `depot` tile
for the first time has no way to learn the word `depot` from the board, and `refuel()` only works
while standing on one.

**Recommended fix.** A per-level legend listing only the terrains, item kinds and machine kinds
*this board actually contains*, each with its sprite and its API name, always visible in the rail
(not a tab, not a hover). Built from a scan of the initial world it needs no per-level authoring
and no new art — it reuses the sprites already drawn. This also solves the terrain confusions in
finding 8 below: `regolith` and `floor` need not be told apart by eye if the legend says which
cells are which.

---

### 4 — `Machine.vars` has no form on the board at all — severity 2

**The state.** Twenty-nine distinct keys across worlds 5-8 carry the substance of those worlds:
`capacity`, `draw` (`w5-04:300,313`); `index`, `feed` (`w5-01:218,227`); `segments`, `breakAt`,
`live`, `probeBudget` (`w5-02:141,153,163`); `travelBudget`, `stations`, `edges` (`w5-03:415,425`);
`mstWeight`, `cableBudget` (`w5-05:421,431`); `salt`, `key`, `tailKey`, `sent`
(`w6-02:266`, `w6-03:229`, `w6-04:252`, `w6-05:378`, `signal.ts:85`); `cost`, `seed`, `scouts`,
`workers`, `sites` (`w7-04:328,339`, `w7-05:299,357,368`); `deps`, `shift`, `bay`, `sections`,
`band`, `lane`, `classes`, `crates`, `stages` (`w8-02:105`, `w8-03:335,372`, `w8-04:390`,
`w8-05:316,375,398,408`).

Nothing in `src/render/` reads `Machine.vars`. Two nodes with `capacity: 12` and `capacity: 30`
draw as the same sprite.

**API leg.** Present and deliberate. `probe()` returns `vars` unfiltered
(`src/engine/sim.ts:318-332`), and `types.ts:118-141` says outright that `MANUAL_ONLY` and `FED_BY`
live in `vars` *because* `vars` is the one channel `probe` publishes — "a rule the player cannot
read before they break it is not a rule, it is a trap." The project already reasoned this through.

**Why this is severity 2 and not 1.** The machine is drawn. The player sees a node, knows a node is
a thing with `vars`, and one free `probe()` reads them. That is a known unknown, which is what
§11.8 asks for. It stops short of §11.7's "a form on the board" but it does not hit the `0/8`
failure — the board is not lying about whether anything is there.

**Where it crosses into severity 1** — two reserved keys, below.

**Recommended fix.** Not a sprite. A **numeric badge on the machine tile**, showing at most one
`vars` value, with the level naming which key to show (a `badge?: string` on the machine or on the
level def). `w5-04` shows `capacity` on feeders and `draw` on consumers and stops being a level
about typing `probe()` in a loop to find out what the board looks like. Monospace, per §8. Levels
that name no key get no badge, so nothing changes for worlds 1-4.

---

### 5 — `manual` and `fed:` draw as an ordinary machine — severity 1

**The state.** `MANUAL_ONLY` (`vars.manual = 1`) means `power()` refuses the machine and only a
`use()` at its tile moves it (`src/engine/types.ts:118-125`). `FED_BY` (`vars['fed:<id>'] = 1`)
means every `use()` costs its tick and returns `false` until the named machine reads `on`
(`types.ts:127-141`).

**Which levels depend on them.** `w8-03:335` puts `MANUAL_ONLY` on stations; `w8-05:349,408` puts
it on stations and on the airlock, and `w8-05:408` additionally makes the airlock `fed:` by a
substation. Both are load-bearing: `w8-05`'s stated solution is that the airlock's whole ancestry
must be energised before the errand east (`w8-05:1010`).

**What a player currently sees.** A station that will refuse `power()` is pixel-identical to one
that will accept it. A gate that will eat a tick and do nothing is pixel-identical to a gate that
will open. The failure is silent by design — `FED_BY` returns `false` rather than throwing,
precisely so it clears when the feeder comes on — which means the board is the only place the
distinction could have been drawn, and it is not drawn there.

This is the severity-1 corner of finding 4. The engine's own comments argue that a refusal the
player cannot read in advance is a trap; they then satisfy that argument on the API leg only.

**API leg.** Present. `probe(id).vars.manual` and the `fed:` key are both returned.

**Recommended fix.** Two marks, both small and both in the §8 vocabulary:
- `manual` — a **hand-crank glyph** on the machine's south face. It says "this one is turned, not
  switched," which is exactly the rule.
- `fed:<id>` — a **thin tether** from the fed machine toward its feeder, drawn `--ink-dim` while
  the feeder is off and `--accent` once it reads `on`. This doubles as the fix for finding 6.

---

### 6 — `Machine.links` is unreachable in code and undrawn on the board — severity 2

**The state.** `Machine.links` is the list of tiles whose terrain flips when the machine changes
state (`src/engine/types.ts:158`). Used once, by `w8-05:410` — the airlock's two gate tiles.

**What a player currently sees.** The *effect* is visible: `w8-05:266` notes that `links` only
repaints on a state change, so `build` paints the gates shut, and they read as wall until the door
opens. So the tiles are not invisible.

What is invisible is the *association*. Nothing on the board connects the airlock to the two tiles
it governs, and nothing tells a player those two wall tiles are ever going to move.

**API leg. Missing.** `MachineView` (`src/engine/sim.ts:74-81`) returns `id, kind, at, state, vars,
inventory` and no `links`. A player cannot ask which tiles the airlock opens. They can only open it
and look. That is two legs missing out of three, on a level that grades reaching what is behind the
gate.

**Recommended fix.** Both legs, following the `MANUAL_ONLY` precedent exactly: publish the linked
cells somewhere `probe` reaches (`vars` holds numbers only, so either add `links` to `MachineView`
or let the level write `gate:<x>,<y>: 1` keys the way `fed:` writes an id into a key), and draw a
**hairline from the machine to each linked tile**, plus a marking on the linked tile itself that
says "this moves." The same tether art serves finding 5.

---

### 7 — The antenna's unread packets are the one thing §11.8 names by example, and are not drawn — severity 1

**The state.** The inbound packet queue lives in the antenna tile's `meta` — `rx`, newline-joined,
and `rxNext`, the read cursor (`src/levels/world-8/shared.ts:299-325`, `src/levels/world-6/signal.ts:77`).
Outbound is `tx` on the same tile (`signal.ts:105`).

**Which levels depend on it.** All of world 6. `w6-01:31` grades `printedSequence(queued(...))` —
the objective *is* the queue's contents. `w6-02:58`, `w6-03:131`, `w6-04:188` and `w6-05` all grade
against `queued()`/`transmitted()`. `w8-04` and `w8-05` drain the same queue through `receive()`.

**What a player currently sees.** An antenna sprite. Identical whether the buffer holds zero packets
or twelve, and identical after every read. Nothing on the board or in the UI shows queue depth, read
position, or that a queue exists.

**API leg.** `receive()` works and is documented (`src/runtime/api-spec.ts:557-570`) — but it is a
strict destructive FIFO pop with **no peek and no count**. A player cannot ask how many packets are
waiting; the only way to learn the buffer is empty is to pop it and get `null`. `tile.meta` is not
in `TileView` at all (`sim.ts:1066-1101`), so `rx`/`rxNext` are unreachable by any other route.

**Why this is the sharpest finding in the report.** DESIGN §11.8 lists three examples of a known
unknown a preview must draw: "a fogged tile, **an unread packet**, a sensor edge." The unread packet
is one of the rule's own three worked examples, and it is the one thing in the game that is not
drawn. `receive()` returning `null` for a reason the board never showed is the `0/8` failure with a
different number on it.

**Recommended fix.** All three legs, in the `sproutsIn` shape:
- **Fiction:** the queue already has a name in the code — the *buffer*. `w6`'s briefs should say the
  listening post holds a buffer of a stated depth.
- **Board:** a **stack of packet cards on the antenna tile**, count drawn as a monospace number, read
  ones dimmed to `--ink-dim` and unread at `--ink`. That draws the known unknown *and* the cursor.
- **API:** a `queued()` or a `buffer` field — the count of unread packets, not their contents.
  Returning the count gives nothing away: `w6` is about deciphering the packets, never about
  guessing how many there are. `recv()` for bot inboxes has the identical gap and the identical fix.

---

### 8 — Bot capacity is stated but its edge is not drawn — severity 2

**The state.** `Bot.capacity` caps the inventory. `w3-01:183`, `w3-02:179` and `w3-04:266` all set
`capacity: 1` — a one-crate bot is the premise of three levels.

**API leg. Deliberately absent, and stated.** `api-spec.ts:348` says outright that "nothing on the
bot reports its own limit, so a return smaller than `count` is how that limit is found." Under
§11.9 that is a *limit*, not a secret, and it stays. `Sim.capacity()` exists (`sim.ts:280`) but has
no spec entry and no binder, which is consistent rather than an oversight.

**What a player currently sees.** §11.9's second half — "state the limit, **draw its edge**" — is
where this falls down. The bot draws a generic coloured cargo pip (`src/render/sprites.ts:478-491`)
that does not name the item kind and does not show `n/capacity`. A full bot and a half-full bot look
the same, and at capacity 1 that is the difference between the level working and not.

**Recommended fix.** Do **not** add a `capacity()` call — the API-side omission is a designed limit.
Draw the edge instead: `n/capacity` as a monospace pair on the bot, or `capacity` pips of which `n`
are filled. That keeps the puzzle (you must handle a short `pickup` return) while removing the
mystery (you can see you are full). Surface the same pair in the rail alongside the fuel gauge,
which already proves the pattern — `usesFuel()` (`types.ts:190`) gates the gauge to levels that opt
in, and a capacity readout gated on `capacity < Infinity` would mirror it exactly.

---

### 9 — A crop that has been ripe for thirty ticks draws exactly like one ripe for one — severity 2

**The state.** `w2-04`'s `crop-spoilage` bonus grades `owed = firstHarvestTick - (plantedAt +
maxGrowth)` summed per tile (`src/levels/world-2/shared.ts:442-459,487-491`). The graded quantity
is *how long a ripe crop sat unharvested*.

**What a player currently sees.** `maturity()` clamps at `maxGrowth` (`src/engine/sim.ts:106-113`),
and the sprite ladder has six stages ending at ripe. Past ripe the tile stops changing. A crop one
tick overdue and a crop thirty ticks overdue are the same pixels.

This is the same level as the §11.7 precedent. The `sproutsIn` fix drew the *near* side of the
growth clock — the part before it starts. The far side, after it finishes, was left undrawn, and
that is the side the bonus grades.

**API leg. Present, and this is why it is severity 2 rather than 1.** `scan()` returns `sproutsIn`
and `maxGrowth`, so `readyTick = now + sproutsIn + maxGrowth` is computable, and for crops already
ripe at tick 0 the ledger uses `ready = 0`. A player who has read the API docs can compute the
whole ledger. The running total is also always visible: the bonus has a `progress` of
`[spoilage, limit]` (`shared.ts:491`) which the objective rail draws.

What is missing is only the per-tile read. `shared.ts:438-440` says so in its own comment — "a plot
that owes twenty-four owes most of it to one tile and the player has no way to see which" — and
then answers that with divergence rows rather than with the board.

**Recommended fix.** Continue the growth ladder past ripe: a **wilt tint** deepening with ticks
overdue, capped so it stays readable, on the crop overlay. Not a new stage sprite — the six stages
are a maturity ladder and this is a different axis — a tint or a droop on the ripe sprite. It gives
the player at a glance the one thing the ledger is about: which tile is bleeding the score.

**In-lore name.** `w2-04` already says *spoilage*. Draw it as spoilage.

---

### 10 — Per-bot clocks never reach text, which DESIGN §8 requires by name — severity 2

**The state.** `BotTimeline` (`src/render/timeline.ts:218`) carries each bot's own clock, and
`TraceTimelines.bots` (`timeline.ts:389`) holds one per bot. It is exported from
`src/render/index.ts:90`.

**What a player currently sees.** Nothing textual. No file under `src/ui/` references `BotTimeline`
or `timelineFor`. The trace viewer has a single global playhead. All bots *are* drawn
simultaneously and blocked moves *are* strongly distinguished, so two of §8's three multi-bot
requirements are met.

The third is not: §8 says RENDER must draw "all bots simultaneously **with per-bot clocks in the
trace viewer**, and a *blocked* move visibly different from a successful one. Required by `w7-01`
and `w7-03`." The per-bot clocks are computed (`timeline.ts:298` carries a comment saying it is
"for the HUD") and then go nowhere.

**Which levels depend on it.** `w7-01` and `w7-03` by DESIGN's own naming; in practice all of world
7 and world 8, since DESIGN §4.3 makes every bot's clock private and `sync()` is the API a player
reasons about. `api-spec.ts:667` documents the whole causality rule in terms of clocks — "a bot only
sees a message once its own clock has reached the moment the message was sent" — and a player
debugging an empty inbox has no way to look at the two clocks that explain it.

**API leg.** Present. `bot(id).clock` is readable for any bot with no range limit once world 7
unlocks.

**Recommended fix.** A per-bot clock column in the trace viewer, one row per bot, monospace, with
the global playhead as a ruler across them. `BotTimeline` already holds everything needed; this is
a UI surface over existing render state, not new art.

---

### 11 — Bot inbox depth is invisible and unaskable — severity 2

**The state.** `Bot.inbox` is a queue of `Message { from, body, t }` (`src/engine/types.ts:163-169`).
`recv()` pops the oldest (`sim.ts:863`) and returns `null` when empty.

**What a player currently sees.** Nothing. No mail indicator on the bot, no count, nothing in the
UI. `src/render/` never reads `inbox`.

**API leg. Partial.** `recv()` is a destructive pop with no peek and no length — the same shape as
`receive()` in finding 7, and the same gap. `api-spec.ts:683` documents the failure mode honestly
("the inbox looks empty even though the message was sent") but that documentation is the only place
a player can meet it.

**Which levels depend on it.** All of world 7's messaging levels, and `w7-01`/`w7-03` where the
`send` → `sync` → `recv` ordering is the puzzle.

**Recommended fix.** Same as finding 7, same vocabulary: a **small envelope count on the bot**, and
an inbox depth in the API. Both `recv()` and `receive()` should gain a count; drawing a queue depth
gives away nothing about contents, and the ordering puzzle survives intact.

---

### 12 — `Machine.inventory` is never drawn — severity 3

**The state.** Every machine carries an `ItemStack[]`. `Sink` machines accept deliveries and the
`itemsDelivered` objective reads them (`src/engine/objectives.ts:319`).

**Which levels depend on it.** `w7-02`, `w8-01`, `w8-02`, `w8-04`, `w8-05` all place sinks;
`w8-05:415-428` places two sinks distinguished only by the `mark` on their tiles.

**What a player currently sees.** Nothing about what is in them. `src/render/` never reads
`Machine.inventory`, and `TileReadout` does not carry it either — so even fixing finding 2 does not
surface this one.

**API leg.** Present: `probe(id).inventory`.

**Recommended fix.** Severity 3 because progress toward `itemsDelivered` is already in the objective
rail, which is the number that matters. If a sprite is wanted, a **fill level on the sink** is the
cheap version. Adding `inventory` to `TileReadout` is the cheaper one and rides finding 2.

---

### 13 — The trail saturates at ten visits with no number — severity 3

**The state.** DESIGN §8 requires "how often each tile has been stood on, not merely that it has,"
because `w4-02`'s designed failure is a naive walker riding a loop.

**What a player currently sees.** `src/render/trail.ts` does draw a true count as a nine-step
colour and alpha ramp, so the requirement is met — a repeated tile is visibly hotter than a
once-crossed one. But the ramp saturates at ten and carries no numeric label, so fifteen visits and
a hundred visits look identical.

**Recommended fix.** Severity 3 because the failing run and the passing run *are* drawn differently,
which is what §8 asked for. If it is worth more, add the count as a monospace number on hover — it
would ride finding 2 for free if `TileReadout` gained a `visits` field.

---

### 14 — Conveyor is a mechanic with zero legs — severity 4, and a deletion candidate

**The state.** `Terrain.Conveyor` is declared (`src/engine/types.ts:47`) with a doc comment
promising it "carries `facing` in tile meta." `src/engine/world.ts:105` gives it `walkable: true`
and nothing else. `src/engine/sim.ts` never mentions it. No level places it. `tile.meta` is not in
`TileView`, so even if a level did place it, its `facing` would be unreachable in code.

The renderer *does* draw it — `drawConveyors` (`src/render/renderer.ts:1340-1355`) animates a
generic four-phase scroll with no rotation and no arrow, so it shows "something is moving here" and
never which way.

**Recommended fix.** Per §11.2 — explain it or cut it. Nothing depends on it, so **cut it**:
the terrain, the world.ts entry, the sprite and the animation. If it is wanted later it needs all
three legs designed together, and the `facing`-in-`meta` plan cannot work as written because
`TileView` has no `meta`.

---

### 15 — Dead vocabulary — severity 4

Never placed by any level:

- **Terrain:** `conveyor`, `rubble`, `regolith`, `ice`. (`void` appears only as the out-of-bounds
  sentinel, `sim.ts:1071`.)
- **ItemKind:** `regolith`.
- **MachineKind:** `furnace`, `press`, `source`, `charger`.

All of them have sprites in all three art directions. That art is not a bug, but if finding 3's
legend is built by scanning the level's own world it will never show them, which is the right
answer either way.

`ORE_STAGES` (`src/render/tiles.ts:276-281`) is a separate case: it is exported, vocabulary-tested,
and dead — never called from `terrainArt`'s `Ore` case, which picks a prop from a fixed per-cell
hash instead. Ore depletion has a sprite ladder and no code path. No level grades ore depletion, so
this is severity 4, but it is a trap for whoever adds the first level that does.

---

### 16 — Weak forms worth knowing about — severity 3-4

Reported for completeness; none is graded by a level today.

- **`regolith` vs `floor`** — regolith is a bare floor-texture swap with no prop, and in the cave
  biome its `floor.gravel` texture overlaps the ordinary floor's accent variant. Real confusability.
  Moot while no level places regolith; would bite immediately if one did. Finding 3's legend fixes it.
- **`void` vs hangar `floor`** — void falls back to `floor.metal` plus a tint, the same base tile as
  an ordinary hangar floor.
- **`cable` power state** — cable distinguishes straight from bend and nothing else. A cable
  carrying power and a dead one draw the same. World 5 grades what is energised
  (`machineState`/`machinesAllIn`), and the *node* does glow when `on` — so the graded state is
  drawn, just not on the cable between nodes. A pulse along energised cable would make the grid
  legible as a grid.
- **Machine `state` collisions** — the glow fires for `on`/`open`/`busy`; `idle`, `off` and `closed`
  all draw identically. Harmless today because no machine kind uses more than one of the three, but
  it is what makes finding 1's nine airlock states collapse into two.
- **Bot cargo** — a generic coloured pip (`src/render/sprites.ts:478-491`), not the item kind, with
  no count. See finding 8.
- **Machine `facing`** — honoured only by the `signal` and `deepsite` art directions; the `standard`
  direction ignores it for every machine kind. `facing` is also absent from `MachineView`, so it is
  unreachable in code. No level grades it.
- **`tile.occupant`** — maintained by the sim and read by nothing in `src/render/`; bots are drawn
  from trace timelines. Harmless, but zero consumers.

---

## Checked and clean — things that look like violations and are not

Recording these so the next pass does not re-open them.

- **`w5-02`'s broken segment.** `world.vars.breakAt` (`w5-02.ts:141`) holds the answer and is
  unreachable from player code, which is correct — it is the grader's copy. The player-facing truth
  is `relay-N.vars.live` (`w5-02.ts:163`), which `probe()` returns, against a stated
  `probeBudget: 10` on the reactor (`w5-02.ts:153`). The limit is real, published in `vars`, and
  the level is one of §11's two named exceptions. This is §11.9 done exactly right.
- **`w6-04`'s cipher key.** Deliberately in `world.vars` where `probe()` cannot see it. The fact
  card (`w6-04.ts:226-230`) states the search space outright — "the same whole number from 0 to 94.
  That is the whole space" — and a second card names the straggler's separate key. The limit is
  stated and its shape is known. Not a violation.
- **`Bot.capacity` having no getter.** Deliberate and documented at `api-spec.ts:348`. The *edge*
  is undrawn, which is finding 8; the API omission itself stays.
- **`world.vars` generally.** No player function reads it anywhere. That is correct — it is grader
  scratch. Every world.var a player actually needs is mirrored into a `machine.vars` where `probe()`
  reaches it: `w5-04` writes `capacity`/`draw` to both (`w5-04.ts:283-313`), `w5-05` writes
  `cableBudget`/`mstWeight` to both (`w5-05.ts:421-431`), `w5-03` writes `travelBudget`/`stations`/
  `edges` to both (`w5-03.ts:415-425`). The mirroring is consistent; I found no world.var a solution
  needs that is not mirrored.
- **Growth stages, the sprouting clock, blocked-vs-successful moves, the visit-count trail.** All
  four of DESIGN §8's "RENDER must draw" items are drawn. Finding 13 is a refinement of the fourth,
  not a failure of it.
- **All ten `MachineKind`s and all eleven `ItemKind`s** have distinct sprites in all three art
  directions. Pits were hardened against reading as rubble at some earlier point and now do not.

### Trace-only graded state — out of scope, noted

Worlds 1, 4 and 7 grade a lot that was never stored on a tile: visit order (`w4-04`), ray counts
(`w4-01`), idle ticks and bump counts (`w7-03`), per-bot harvest tallies (`w7-02`), and in `w7-05`
"who told whom" — where message *content* is never validated, only the recv/use sequencing. None of
this has a missing sprite, because none of it is world state. The surface for all of it is the trace
viewer, which is finding 10's subject.

---

## Recommended order of work

| # | Finding | Sev | Cost | Needs art? |
|---|---|---|---|---|
| 2 | `readoutLine` should return `readout.label` | 1 | one line | no |
| 1 | Staged machine progress (airlock, job levers) | 1 | small | reuses `drawSprouting` |
| 7 | Antenna buffer depth — board + `queued()` API | 1 | medium | yes, small |
| 5 | `manual` glyph and `fed:` tether | 1 | medium | yes |
| 3 | Per-level legend in the rail | 2 | medium | no, reuses sprites |
| 9 | Overripe wilt tint | 2 | small | yes, a tint |
| 8 | Draw `n/capacity` on the bot | 2 | small | yes, small |
| 10 | Per-bot clock column in the trace viewer | 2 | medium | no |
| 11 | Bot inbox count — board + API | 2 | small | yes, small |
| 6 | `Machine.links` — publish and tether | 2 | medium | shares finding 5 |
| 4 | Machine `vars` badge | 2 | medium | no, monospace |
| 12 | `inventory` on `TileReadout` | 3 | small | no |
| 13 | Trail visit count on hover | 3 | small | no |
| 14 | Cut `Terrain.Conveyor` | 4 | small | deletion |
| 15 | Dead vocabulary / `ORE_STAGES` | 4 | small | deletion |
| 16 | Weak forms | 3-4 | — | varies |

Findings 2, 12 and 13 are all the same file and the same struct, and together they turn the hover
readout into the tile inspector the game does not have. Findings 5 and 6 share one piece of art.
Finding 3 is the largest single win per unit of art, because it needs none.

## What was changed

**Nothing.** No file under `src/` was touched by me or by any of the five sub-agents. `src/render/`
and `src/ui/` are the user's call and several findings need art.

## Decisions left to the user

1. **Finding 4 — the `vars` badge.** Whether a machine should show one of its `vars` on the tile is
   a real design question, not an obvious fix. The counter-argument is that `probe()` is free and
   the fact cards name the keys, so the information is one line of code away and the board staying
   quiet is what makes worlds 5-8 feel like inspection problems. I lean toward the badge for
   `w5-04` specifically, where "which feeder is largest" is a comparison the player makes by eye in
   every other genre, and against it as a blanket rule.
2. **Finding 7's API half.** Adding a queue-depth read to `receive()`/`recv()` changes what a
   player can write, not just what they can see. I think it is required by §11.7 — the level
   depends on knowing when the buffer is empty and the only way to learn it is to consume a packet
   — but it is an API change and those are yours.
3. **Finding 14.** Cutting `Terrain.Conveyor` deletes a sprite and an animation someone drew. §11.2
   says explain it or cut it and nothing depends on it, but that is a call about the art, not about
   the rule.
