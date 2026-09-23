# Campaign

Eight sites climb from basics (01–02) through data (03) and algorithms (04–06) to systems (07) and synthesis (08). Each site teaches one concept, named by its chip in `src/levels/index.ts`.

Within a site, early levels grant API, middle levels tighten a constraint, and the last level (the climax) recombines the site with no new API. Site 04 deviates: its climax grants `mine`, `fuel` and `refuel`, adding a fuel budget on top of the site's search.

Passing is the lesson; `par.ticks` and the bonus stars grade optimisation across the game.

## 01 Boot Sector — Control Flow

- **w1-01 Cold Start** — grants `move`, `pos`, `print`, `wait`; a known route becomes counted repetition.
- **w1-02 Length Unknown** — grants `canMove`; loop on a runtime condition until a sensor says stop.
- **w1-03 Floor Inspection** (climax) — no grant; cover a grid with a snake sweep built from helpers.

## 02 Regolith Fields — State Tracking

- **w2-01 Rotation** — grants `scan`, `harvest`, `plant`; read a tile's state and branch before acting.
- **w2-02 Capacity** — grants `inventory`; track what is done across passes under hopper capacity and countdowns.
- **w2-03 Harvest Quota** (climax) — no grant; filter, stop on a full buffer, pick a lane by look-ahead.

## 03 The Sorting Yards — Data Structures

- **w3-01 Pick and Place** — grants `pickup`, `drop`; sweep into position lists and pair them into trips.
- **w3-02 Sorted by Colour** — grants `carrying`; route by a lookup table built from a sweep.
- **w3-03 First In, First Out** (climax) — no grant; read the yard into a table, then process in key order.

## 04 Cave Systems — Pathfinding

- **w4-01 Headlamp** — grants `look`; follow a path, remember the heading, re-sense only at bends.
- **w4-02 Breadcrumbs** — grants `mark`, `readMark`; depth-first search with backtracking.
- **w4-03 Map First, Move Second** — no grant; map the cave, then BFS and order the stops.
- **w4-04 The Deep Shaft** (climax) — grants `mine`, `fuel`, `refuel`; explore within a fuel budget, never past the point of no return.

## 05 The Grid — Graphs

- **w5-01 Mains** — grants `probe`, `use`; enumerate ids until null and walk a line in key order.
- **w5-02 Continuity Test** — grants `power`; binary search for a break under a probe budget.
- **w5-03 Order of Operations** — grants `link`; energise in dependency waves, laid out on rings.
- **w5-04 Load Balance** — no grant; place load on a tree under segment ceilings, heaviest first, keeping a reserve.
- **w5-05 Blackout** (climax) — no grant; lay a spanning tree within the drum and name the cut vertex.

## 06 Deep Signal — Encoding

- **w6-01 Carrier Wave** — grants `receive`, `buffered`; drain a queue until null.
- **w6-02 Checksum** — grants `transmit`; relay only packets whose checksums verify.
- **w6-03 Compression** — grants `decode`; decode run-length groups and drive the route move for move.
- **w6-04 The Cipher** — no grant; brute-force the key against a known header.
- **w6-05 Telemetry** (climax) — no grant; verify, unshift and expand nested blocks, then drive the route.

## 07 Swarm — Concurrency

- **w7-01 Two Bots** — grants `bot`, `bots`, `clock`, `sync`, `send`, `recv`; per-bot clocks, messages, barriers.
- **w7-02 Divide the Field** — grants `spawn`; split work by count so the slowest worker finishes early.
- **w7-03 Right of Way** — no grant; share a one-lane tunnel without deadlock, batching convoys.
- **w7-04 Dispatch** — no grant; greedy job scheduling against a posted deadline.
- **w7-05 Chain of Command** (climax) — no grant; scouts explore, a dispatcher raises and orders workers.

## 08 The Kessler Contract — Synthesis

- **w8-01 Efficiency Audit** — no grant; sites 02 and 04: survey once under rationed senses, then plan full loads.
- **w8-02 Full Stack** — no grant; sites 03 and 04: sort crates in an unmapped cave, interleaving survey and haul.
- **w8-03 The Grid Goes Down** — no grant; sites 05 and 07: schedule a feeder graph onto a fleet.
- **w8-04 Signal from 4470** — no grant; sites 06 and 04: crack the cipher, follow a stale route, repair blocked legs.
- **w8-05 The Kessler Contract** (climax) — no grant; sites 02–07 at once, fleet and fuel, ending on the charter choice.
