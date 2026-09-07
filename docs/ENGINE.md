# ENGINE — how to call it

`docs/DESIGN.md` is the contract; this is the integration guide. Coordinates and primitives are
DESIGN.md §4.1.

**Import from `src/engine` (the barrel) and nowhere deeper.**

## 2. Driving the Sim

One `Sim` owns one `World`, one `Trace` builder, and the budgets. Every method takes the acting
`botId` first; the runtime binds that away before the player sees it. `src/levels/harness.ts` is the
worked call site (`runLevel`, `runReference`) — clone the world before the Sim touches it, because
objectives are evaluated against that snapshot, and call `sim.finish()` exactly once even after the
player's program throws. **The worker must produce byte-identical results; where it does not, the
harness is right.**

Each acting method validates, mutates, advances the acting bot's clock, appends a timestamped
event, checks budgets, and returns the player-visible value.

**Two failure sides, and the test that sorts them: could the identical call succeed later in the
same run?**

| Situation | Behaviour |
|---|---|
| The world says no — wall, empty tile, full inventory, no machine here, antenna switched off | returns `false` / `null` / `0`, **and still charges the full tick cost** |
| The program is incoherent — unknown bot id, dead bot, negative count, `power` on a `vars.manual` machine, a machine id naming nothing, `transmit` where no antenna exists | throws `IllegalActionError` |
| Budget blown | throws `HaltError` / `OpLimitError` |
| Bot ran dry | throws `OutOfFuelError`, **before mutating anything** |
| Every bot blocked, forever | throws `LivelockError` |

A wall can open, an inventory can empty, an antenna can be powered up. An unknown bot id cannot
become known; nothing in the API clears `vars.manual`, builds a machine or installs an antenna. A
`false` the player could branch on would be a branch that can never flip. Every refusal on the
throwing side is still logged and still charged before it throws, so the trace and the live world
stay in step. Machine ids sit on the throwing side and have the same free pre-check: `probe(id)`
returns `null` for an id naming nothing and costs nothing to ask.

For World 5/6 verbs: `sim.applyMachineChange(botId, machineId, mutate, cost)` and
`sim.applyTileChange(at, mutate)` emit the right trace events for you. `applyMachineChange` throws
on an id naming no machine — it is for changing a machine you have already found. To *refuse* and
charge for the attempt, use `sim.refuseMachineAct(botId, detail, cost)` rather than passing a
knowingly-bad id to bill for it. **Never mutate `sim.world` directly**: an unrecorded mutation
makes replay diverge silently, which is the worst bug class in this codebase.

## 3. Multi-bot virtual clocks

Collisions use time intervals, not a snapshot: a bot holds its tile from arrival until the tick its
next move completes, and a move is blocked when any *other* bot's residence interval overlaps
`[t, t + costs.move)`. **A bot far behind on its own clock cannot walk through a tile someone else
occupied at that time, even though the tile looks empty in the live world.**

`sync()` raises every living bot to `max(clock)` and emits one `sync` event per bot that moved.

Contention at equal clocks resolves by **issue order**, not by ascending `botId`: the player API is
synchronous, so `move()` must return immediately and cannot be retracted. For the canonical
`for (const id of bots()) move(id, …)` the two are the same thing. Deterministic either way.

## 3a. Fuel, spend, livelock and medal weights

**Fuel** (DESIGN.md §4.4). Opt in per bot: `addBot(world, { at, fuel: 40, fuelMax: 40 })`. The
`Infinity` default means `fuel() < 4` is never true on a level that ignores the mechanic. **The
authoritative list of what burns is the exported `FUEL_BURNING` set in `trace.ts`** — `Sim` and
`applyEvent` both read it, which is what keeps a live run and its replay in agreement.
`usesFuel(world)` tells the UI whether to draw a gauge.

**Spend.** `sim.spend('cable', 3)` accumulates into `sim.spendTotals()`, which the harness feeds
into `Verdict.stats.spend`. The engine never interprets the key. Each call emits a `spend` trace
event. Levels and world-specific commands call it; nothing in the core engine does.

**Livelock.** Blocked moves build a streak that any successful move resets, and it must cover
every living bot to count. A single-bot sim can therefore never trip it — a lone bot bumping a wall
is an ordinary bug and hits `HaltError`.

**Medal weights.** `MEDAL_WEIGHT` in `verdict.ts` is gold 3, silver 2, bronze 1, none 0. A bonus
star is worth 1 on top, and the only copy of *that* number is `BONUS_STAR_POINTS` in
`src/game/score.ts`. The engine deliberately keeps no second copy.

## 3b. Sensing is free, but it is not invisible

Sensing costs **0 ticks** and **1 op**. On top of that every read tallies into `sim.senseTotals()`
(`{ probe: 7, scan: 240 }`, keyed by command name, surfaced as `Verdict.stats.senses`) and appends
a `sense` trace event. That gives levels a second scoring axis beside ticks: **information**. Budget
it with `Objectives.withinSenses(name, n)` or the whole op count with `Objectives.withinOps(n)`.

`recv` and `botIds` are deliberately **not** senses — the first consumes a message and carries its
own event, the second reads the fleet roster rather than the site. Both still cost an op.

**Trace size.** `TraceBuilder.pushSense` folds identical back-to-back reads into one event with a
higher `count`, and past `MAX_SENSE_EVENTS` collapses everything further into one running aggregate
per sense name. **The counts stay exact either way** — `senseTotals(trace)` always equals
`sim.senseTotals()`; only per-read `detail` and interleaving are lossy. `sense` events are not in
`FUEL_BURNING` and `applyEvent` treats them as no-ops, so replay is bit-identical with or without
them.

## 4. Traces and `replayTo`

Every bot-scoped event carries `botId` **and `dt`**, the ticks charged; `dt` is what lets replay
restore `bot.clock` exactly. Events carry absolute after-state (`move` has `from`/`to`, `tileChange`
has `before`/`after`), so applying them in pure `t` order cannot diverge.

`replayTo(trace, tick)` is identical to replaying from `initialWorld` with the keyframes deleted.
**Keyframes are a pure optimisation and are safe to strip.**

`world.tick` on the result is `max(bot.clock)`, which can *lag* the tick you asked for when no bot
has acted yet. The renderer knows which tick it requested; do not read it back off the world.

**Treat a `Trace` as immutable.** `replayTo` clones before it mutates and keyframe worlds are
shared; mutating one corrupts every later scrub.

## 5. Writing a `LevelDef`

Full interface in `src/levels/types.ts`, worked example in `src/levels/world-1/w1-01.ts`, contract
in `docs/DESIGN.md` §5. Build a world with `createWorld`, then `paintAscii`, `addBot` and
`addMachine`. Register levels in `LEVELS` (`src/levels/index.ts`) and solutions in the `SOLUTIONS`
map in `src/levels/__tests__/levels.test.ts`.

**Objective builders sit behind a namespace** — `Objectives.botAt(pad)` — because `botAt(world, pos)`
is a world query and having both flat is a trap.

**A budget objective declares its `meter`** (`docs/DESIGN.md` §5). `src/game/budgets.ts` recovers
the unclamped spend behind a `[done, total]` pair — the `21 / 16 beams` a clamp reports as
`16 / 16` — and works out which of the run's totals to count. Given a `meter` it counts that one;
given nothing it parses the label. **The label is prose written for the player, so rewording one
moves an undeclared budget off its meter with nothing going red.** `withinTicks`, `withinOps` and
`withinSenses` declare for themselves; `custom` must say. `unit` overrides the readout's noun.

## 6. Traps

1. **Keyframes are built by replaying, never by snapshotting the live world.** With per-bot clocks
   the live world is not "the world at tick T" — bot A may be at t=900 while bot B is at t=100, so a
   live snapshot would silently disagree with a replay. `TraceBuilder.build()` replays its own
   finished event list to cut keyframes.
2. **The Sim never touches `world.rng`.** All randomness belongs to `LevelDef.build(seed)`. A
   command that consumed the Rng would make traces unreplayable without re-running sim logic. For
   per-run variety, derive it from the seed in `build`.
3. **`tile.occupant` is maintained by the Sim, but `world.bots` is the source of truth.** After
   hand-building or hand-editing a world, call `rebuildOccupancy(world)`. `setTile` deliberately
   preserves an existing occupant so terrain edits do not drop a bot off the grid.
4. **Nothing ticks on its own.** There is no global update loop, so crop growth is *derived*:
   `plant` stamps `tile.meta.plantedAt` and `maturity(tile, t)` computes maturity against the
   observing bot's clock. A tile authored with a plain `growth` value and no `plantedAt` is always
   at that maturity. Design World 2 mechanics around derived state, not scheduled updates.
5. **`noUncheckedIndexedAccess` is on.** `world.tiles[i]` is `Tile | undefined`. Use `tileAt`, which
   returns `undefined` out of bounds on purpose.
6. **`move` charges a tick even when it fails**, and updates `facing` either way. That is what makes
   the free `canMove()` worth calling.
7. **`world.rng` is a class instance and `postMessage` strips prototypes.** A `Trace` returned from
   the worker has `initialWorld.rng` as a bare `{ state }`. `cloneWorld` heals it, but call
   `reviveTrace(trace)` once on receipt before touching a transferred World directly.
8. **Ordinary JavaScript state persists for the whole run.** The player's program is one synchronous
   execution, so a `Map` or closure survives every command; `mark`/`readMark` are only for state
   that must live *in the world*. The docs panel must say this outright (`docs/DESIGN.md` §5) —
   several World 4 levels are unsolvable until the player believes it.

## 7. Budgets, and the ways a runaway program dies

| Guard | Where | Surfaces as |
|---|---|---|
| `maxTicks` (default 20 000) | every acting command | `HaltError` |
| `maxOps` (default 2 000 000) | every command, sensing included | `OpLimitError` |
| `fuel` (default `Infinity`) | every acting command, before it mutates | `OutOfFuelError` |
| `livelockRounds` (default 8) | blocked moves in multi-bot levels | `LivelockError` |
| `WORKER_TIMEOUT_MS` (5 000) | main thread | `worker.terminate()`, "Your program did not halt." |

The last is the only thing that catches `while (true) {}` with no API call inside. It belongs to
RUNTIME and UI, not the engine; `WORKER_TIMEOUT_MS` is exported from `src/runtime/protocol.ts`.
