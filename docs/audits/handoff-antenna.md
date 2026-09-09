# Handoff — the antenna buffer needs drawing

Written by the agent that closed the API half of `renderer.md` finding 7. **Nothing here has been
acted on.** `src/render/` and `src/ui/` belong to another agent; this file is the request.

## What changed, so you know what is already true

`buffered()` now exists as player hardware, unlocked at `w6-01` alongside `receive()`.

- Spec: `src/runtime/api-spec.ts`, the entry directly after `receive`. Returns `number`, costs 0.
- Implementation: `bufferedPackets` in `src/runtime/api-bindings.ts`, beside `receivePacket`. It
  reads `rx` behind the `rxNext` cursor on the antenna tile and writes nothing.
- It is stated on the fact card of all five World 6 levels and is in each of their `docs` lists.
- One card was added to `HARDWARE` in `src/ui/copy.ts` (see "The one file of yours I touched").

So two of finding 7's three legs are now standing: the fiction calls it the **buffer**, and the API
returns its depth. The board still draws nothing.

## What the renderer is being asked for

The antenna tile currently draws one sprite, identical whether the buffer holds zero packets or
twelve, and identical after every read. DESIGN.md §11.8 names "an unread packet" as one of its own
three worked examples of a known unknown a preview must draw, so this is the rule failing on its own
example.

**The state to draw** (`src/levels/world-6/signal.ts:77`, and `src/levels/world-8/shared.ts` for
worlds 7-8): on the tile under the antenna machine, `meta.rx` is the packets newline-joined and
`meta.rxNext` is the read cursor. Unread depth is `rx.split('\n').length - rxNext`, floored at 0.
`meta.tx` on the same tile is the outbound log. None of this is in `TileView`, so `src/render/` has
to read the tile's `meta` directly — or `TileReadout` has to grow a field, which is finding 2's
business, not this one.

What I would want, in rough order of how much it is worth:

1. **A depth count on the antenna tile.** A small stack of packet cards with the unread count as a
   monospace number. This is the whole finding: it makes "the band is quiet this shift" —
   `w6-01`'s seed 3, where the correct program does nothing at all — visibly different from "there
   are twelve packets here and you have not looked". Right now those two boards are the same board.
2. **The cursor, not just the total.** Read packets dimmed to `--ink-dim`, unread at `--ink`. That
   draws the known unknown *and* how far through it the run is, which is what makes the replay
   scrubber worth scrubbing on `w6-02` (twenty to forty packets) and `w6-05`.
3. **The count falling, in the replay.** `receive()` already writes a `tileChange` event, so the
   drain is in the trace and the number can animate down as the player scrubs. `buffered()`
   deliberately writes no tile change — the count read must not make the drawing flicker.
4. **The outbound side, if it is cheap.** `tx` grows one line per accepted `transmit`. A second,
   quieter tally in the same cluster would make `w6-02`'s "relay the clean ones" legible as a
   before/after pair rather than as a number in the console.

**Do not gate it on World 6.** `w8-04` and `w8-05` drain the same queue through `receive()`, and
the fuel gauge's `usesFuel()` pattern (`src/engine/types.ts:190`) is the precedent for gating a
readout on the level actually having the state: draw the cluster where a machine of kind `antenna`
or `router` sits on a tile whose `meta.rx` is a non-empty string.

## The one file of yours I touched

`src/ui/copy.ts` gained a four-line `buffered` entry in `HARDWARE`, next to `receive`. It is not
optional: `src/runtime/__tests__/api-spec.test.ts` fails any `PLAYER_API` function with no
requisition card. If you have that file open, keep the entry. Reword it freely — the tests only
refuse a card naming a type the signature does not have, or quoting a price the spec does not
charge, and `buffered()` returns `number` and costs 0.

## One thing left alone on purpose

`buffered()` charges its op through `sim.probe`, exactly as `receive()` has always done, so both
land in the `probe` tally that `Objectives.withinSenses('probe', n)` budgets. No World 6 level sets
a sense budget, so nothing is affected today, but `w8-03` does budget probes and does have an
antenna. If a level ever wants to budget the band, that coupling wants breaking first — `Sim.sense`
is private and the runtime has no way to record a sense under its own name.
