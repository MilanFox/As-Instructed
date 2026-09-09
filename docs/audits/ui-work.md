# The UI half of the preview audit — `src/ui/`

Implementing `docs/audits/renderer.md` findings 2, 3, 8, 10 and 11. `src/render/` is a sibling
agent's this wave and is read-only here; findings 4-7, 9 and 13-16 are theirs.

Appended per finding as each lands.

---

## Finding 2 — `readoutLine` discards two thirds of the readout it is handed
**Verdict:** fixed

**What was wrong.** `describeTile` (`src/render/overlays.ts:444-452`) composes a complete one-line
`label` — coordinate, terrain, crop state, bot name, `machine kind:state`, every ground stack as
`kind xN`, and the tile's `mark` in quotes. `readoutLine` never read it, and rebuilt a poorer line
from four of the twelve fields. Hovering a sink holding twelve crates reported the word `floor`;
so did the tile stencilled `charter registry`, which in `w8-05` is the only thing distinguishing
two otherwise identical sinks.

**The nuance the audit missed, and why it is reversed anyway.** The comment above `readoutLine`
was not an oversight — it stated a deliberate tradeoff: "the coordinate, and the one other fact
about the tile that is worth the width", chosen because the strip is narrow and naming a tile beat
listing it. DESIGN §11.7 overrides it: the renderer is player-facing text exactly as the brief is,
and nine fields never reaching a player is not a width decision, it is missing information. The
comment is rewritten to say what changed and why, not deleted.

**Changed:**
- `src/ui/desk/monitor/feed.ts:29-45` — `readoutLine` is now `readout?.label ?? ''`. Comment
  rewritten to record the reversed tradeoff.
- `src/ui/desk/monitor/geometry.ts` — new `READOUT_CHARS_IN_THE_GAP = 44`, with the arithmetic
  behind it (638u strip, 319u of static chrome, 7.22u per character at `.16em` tracking).
- `src/ui/styles/desk/monitor.css:190-199` — `.osd-xy` gains `min-width: 0` and
  `text-overflow: ellipsis`; new `.feed-osd--long` modifier.
- `src/ui/desk/monitor/Monitor.tsx:246-249,266` — computes `wide` from the label length and sets
  the modifier.

**The layout choice, stated.** The strip has two modes.

- **Short (≤ 44 characters).** Unchanged: site and grid at the left, `SIGNAL DELAY 41 MIN` at the
  right, the readout centred between them.
- **Long.** The strip belongs to the readout. The two static notes stand down (they are chrome and
  true whether or not anyone reads them; the readout is the only live text up there), the readout
  goes left-aligned from the coordinate, and its tracking drops from `.16em` to `.04em`. That
  carries about 104 characters across the full 638u strip. The worst line the composition can
  produce today — coordinate, terrain, `kind:state`, a stack and a quoted mark — is 61.

That headroom is deliberate: the sibling agent in `src/render/` is adding fields to the same
`parts` array (a crop ripe-age, probably a machine `vars` value), and they surface through this
change automatically. Nothing here hard-codes a field list, so nothing here has to be revisited
when they land. Past ~104 characters the strip truncates with an ellipsis at the end — the
truncation is the strip's, as the audit asked, and no second formatter exists.

**Tests.** Nothing under `src/ui/__tests__/` asserted the old readout behaviour, so nothing
encoded the old tradeoff and nothing needed updating. `monitor-margin.test.ts` guards strip
*heights* against `geometry.ts`, not widths, and is unaffected. 201 UI tests pass.

**For the user:** nothing outstanding.

---

## Finding 3 — no legend exists anywhere in the game
**Verdict:** fixed

**What was wrong.** Nothing in the game named a terrain, an item kind or a machine kind. Terrain
names reached the player through exactly one channel, the hover strip, which DESIGN §11.7 says in
terms is not enough. The sharp cases are the world boundaries: `depot` first appears in `w4-04` and
`refuel()` only works standing on one, `cable` in `w5-01`, `pit` in `w6-03`, the `ore` vein in
`w4-05`. A player who cannot name the tile cannot look the command up either.

**Home chosen: the manual, as the first section of the left page.** The audit recommended the rail,
"always visible, not a tab". I put it in `REFERENCE` (`K&D FORM 12 · REV 9`) instead, and the
reasons are:

- The rail is 224 design units wide and already carries OBJECTIVES, BONUS, TARGETS, FUEL and now
  BOTS. A twelve-row table with a sentence per row does not fit there without becoming a scroll,
  and a legend you have to scroll is worse than a page you open.
- The manual is *the* reading surface, it is already fitted per level ("commands fitted to this
  bot"), it is already keyboard-reachable through the `reference` binding in `keys.ts`, and its
  search now narrows the legend along with everything else. A legend is reference material and this
  is the reference.
- It is not hover, which is the actual §11.7 requirement. The hover strip (finding 2) now names
  everything on a tile; the manual says what those names mean. The two halves close the loop.

It is the first thing on the left page, above `Memory`, because it is the page a player opens the
book *for* the first time they meet a tile they do not recognise.

**Built by scanning, never authored.** `legendFor(world)` walks the level's own world. A legend
listing the whole vocabulary would teach `conveyor`, `furnace`, `press`, `source`, `charger` and
`regolith` — six kinds no level places — and would say nothing about which three of the fourteen
terrains are the ones on screen. Scanning also means it cannot fall behind a level that adds a
terrain.

The item list is the union of four things, not just the stacks lying about: what is on the ground,
what is already in a bot's hold, what is planted and will be harvested, and what every mineable
terrain on the board yields. That last one is why `w4-05` gets both `ore` the vein and `ore` the
item, which is exactly the distinction a player needs and could not previously make.

**Every mechanical clause is derived, not written.** "walkable", "blocks movement", "blocks sight",
"a bot that ends a move here dies", "plantable", "mine it for stone" all come out of
`TERRAIN_PROPS` — the same table the simulator obeys — so the manual cannot come to disagree with
the sim. Machine rows list the states seen on the board, unioned with `Machine.cycle`, which is
also derived. Only the identity sentence is copy.

Sample output, `w8-05`: `door ×1 — A way through, when it is open. states: sealed, 1, 2, 3, 4, 5,
6, 7, 8, open`. That is finding 1's airlock, named in text, as a side effect of deriving rather
than authoring.

**No sprite swatches, deliberately.** The audit asked for "each with its sprite". I did not draw
one, for three reasons, and this is the one decision here I would want reviewed:

1. The default art direction is `deepsite`, which does not use the tile atlas at all — only
   `standard` does. An atlas swatch would look nothing like the board on the direction the game
   ships in.
2. Drawing a true swatch means going through `artDirection()` in `src/render/theme.ts` and, for
   terrain, building a 1×1 world because `paintTerrain` takes a whole `World` and there is no
   single-cell terrain painter. That is a new coupling into `src/render/` internals, and a sibling
   agent owns that directory this wave.
3. The missing thing was the *word*. The sprite is already on screen and hover now names it; the
   legend explains what the name means. Each row carries a count on this board (`depot ×1`,
   `pad ×4`), which anchors the word to something the player can go and find.

**Ordering.** Ground is sorted rarest-first — the tile you do not recognise is never the one there
are eight hundred of, so `pad ×1` and `depot ×1` lead and `floor` and `wall` settle at the bottom.
Items and machines are alphabetical.

**Changed:**
- `src/ui/desk/furniture/legend.ts` — new. `LegendRow`, `LegendSection`, `legendFor`, and the three
  authored name tables (`TERRAIN_IS`, `ITEM_IS`, `MACHINE_IS`, exhaustive `Record`s so a new kind in
  the engine is a compile error here).
- `src/ui/desk/furniture/Manual.tsx` — the `Legend` component, the `legend` memo, search filtering,
  and `shownLegend` folded into the "nothing matches" condition.
- `src/ui/styles/desk/furniture.css` — `.mo-legend*`, in the paper palette the rest of the spread
  uses.

**For the user:** the swatch decision above is reversible and cheap once `src/render/` settles —
the hook would be a `drawSwatch(kind, canvas)` on the barrel rather than the UI reaching past it.

---

## Findings 8, 10 and 11 — capacity's edge, per-bot clocks, inbox depth
**Verdict:** fixed (the UI half of all three; the API half of 11 is written up below)

These three are one block on the rail, `BOTS`, under `FUEL`. They are the same question — what is
each bot doing right now — and splitting them across three surfaces would have been three places to
look for one answer.

**Where the data comes from.** `replayTo(trace, tick)` returns a real `World` at the playhead, with
`clock`, `inventory`, `capacity` and `inbox` on every bot, maintained exactly by `applyEvent`. The
rail already called it once a tick for the fuel gauge; that call is now hoisted into a `board` memo
the whole block shares, so a second world is not cloned per tick. Before the first run there is no
trace and the board is the first seed — the same expression the feed uses.

### Finding 10 — per-bot clocks
DESIGN §8 requires "all bots simultaneously **with per-bot clocks in the trace viewer**" by name for
`w7-01` and `w7-03`. They were computed and went nowhere: nothing under `src/ui/` referenced
`BotTimeline`, and the viewer had a single global playhead.

Each bot row now prints `clock N`, live, moving with the playhead. `api-spec.ts` explains causality
entirely in terms of these clocks — "a bot only sees a message once its own clock has reached the
moment the message was sent" — and a player debugging an empty inbox can now look at both numbers
at once.

I used `Bot.clock` off the replayed world rather than `BotTimeline`, which the audit pointed at.
`BotTimeline` carries pose, not state, and `BotPose.clock` is a fractional-tick interpolation for
drawing; `Bot.clock` is the discrete clock after the last completed action, which is the number
`sync()` is reasoned about in. It also avoids the UI building a second `TraceTimeline` (the
renderer's is private) and avoids a new import out of `src/render/` in the week a sibling owns it.

**The clock column is drawn only where there is more than one bot.** On a single-bot order the
bot's clock is the playhead, and the rail's own rule is that the playhead is the transport's number
and is never printed twice.

### Finding 8 — the edge of `capacity`
`Bot.capacity` having no getter is deliberate and documented (`api-spec.ts:348`) and it stays: under
§11.9 that is a limit, not a secret. What §11.9's second half asks for — *draw its edge* — was
missing. A full bot and a half-full bot were the same picture, and at `capacity: 1`, the premise of
`w3-01`, `w3-02` and `w3-04`, that is the difference between the level working and not.

Each row prints the hold as `crate 1/1 full`, in amber when full. Three choices in that:

- **The kind is named.** The audit notes the cargo pip "does not name the item kind". Where the hold
  holds exactly one kind the rail names it; where it holds several it reads `hold 3/4`.
- **The word `full`, not just the ratio.** `1/1` is the number; `full` is the edge. A word is the
  cheapest possible form for a state that has none, and it is what the screen reader gets too.
- **It shows from tick zero, and on every level.** Capacity is a real limit on every board, §11.9
  says the player knows the limit exists and plans around it, and a limit first stated at the moment
  you trip over it is the thing §11 forbids. The puzzle — handling a short `pickup` return — is
  untouched, because the API still does not report the limit.

### Finding 11 — inbox depth (UI half)
`recv()` is a destructive pop with no peek and no length, and nothing anywhere showed the queue. Each
row now prints `inbox N`, gated to multi-bot orders for the same reason the clock is. Drawing the
depth gives away nothing about contents and the `send` → `sync` → `recv` ordering puzzle survives
whole.

### One thing neither finding asked for
A bot that walked into a pit keeps its row and reads `lost` in red. A crew that silently got shorter
is the same defect one layer up, and `w6-03` and `w6-05` are boards that are mostly pit.

**Changed:**
- `src/ui/desk/terminal/Rail.tsx` — the `board` memo (hoisted `replayTo`), the `crew` memo, the
  `BOTS` block, and the `CrewItem` component with its `sr-only` line.
- `src/ui/styles/desk/terminal.css` — `.crew*`, including `.crew__hold--full` in amber and
  `.crew__bot--lost` in danger.

**For the user — the API half of finding 11, which I did not take.**

`src/runtime/` is not mine and I did not touch it. The gap the audit names is real and this is what
I would ask for:

> `recv()` should keep its destructive-pop shape and gain a sibling that reports depth — a
> `inboxDepth(): number`, or a `recv()` that also fills a count. The same applies to `receive()`
> (finding 7). Depth is not contents: a player can see three messages are waiting without knowing
> what any of them says, so the ordering puzzle in `w7-01`/`w7-03` is untouched, while "the inbox
> looks empty even though the message was sent" — which `api-spec.ts:683` currently documents as a
> failure mode and nothing else — becomes something a program can test for rather than something a
> player has to have read the manual footnote about.

Until that lands the rail is the only channel, which means a player can *see* the depth and cannot
*ask* for it — two of the three legs, not three.

**No API change for finding 8**, and that is on purpose: the audit is explicit that
`capacity()`'s absence is designed, and the rail readout is the whole fix.

