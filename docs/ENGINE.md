# ENGINE — how to call it

`docs/DESIGN.md` is the contract; this is the integration guide. Everything is in `src/engine/`
and is pure — no DOM, no React, no canvas — and runs unchanged in Node under Vitest.

**Import from `src/engine` (the barrel) and nowhere deeper.**

## 1. Coordinates

`x` grows East, **`y` grows South**. `Dir.North` is `y - 1`. Tiles are row-major,
`index = y * world.w + x`.

`Dir` is a frozen object plus a union type, **not** a TypeScript enum — same for `Terrain`,
`ItemKind`, `MachineKind`, `FailureCode`, `Medal`. A `const enum` erases at build time and the
player's transpiled program needs `Dir` as a real runtime value.

## 2. Driving the Sim

One `Sim` owns one `World`, one `Trace` builder, and the budgets. Every method takes the acting
`botId` first; the runtime binds that away before the player sees it.

```ts
const world = level.build(seed);
const initialWorld = cloneWorld(world);          // keep this: objectives get it
const sim = new Sim(world, { costs: level.costs, maxTicks: 20_000, maxOps: 2_000_000 });
try {
  runPlayerProgram(bindApi(sim, world.bots[0]!.id));   // synchronous, runs to completion
} catch (error) { /* HaltError | OpLimitError | IllegalActionError | the player's own throw */ }
const trace = sim.finish();                      // exactly once, even after a throw
const verdict = buildVerdict({ objectives: level.objectives, world: sim.world, trace,
                               initialWorld, ops: sim.ops, seeds: 1 });
```

`src/levels/harness.ts` already does this (`runLevel`, `runReference`). **The worker must produce
byte-identical results; where it does not, the harness is right.**

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

Every bot has its own `clock`. `b1.move()` then `b2.move()` means both moved in parallel; the score
is `max(bot.clock)` (`sim.ticks`, mirrored on `world.tick`). Single-bot worlds are the N=1 case.

Collisions use time intervals, not a snapshot: a bot holds its tile from arrival until the tick its
next move completes, and a move is blocked when any *other* bot's residence interval overlaps
`[t, t + costs.move)`. **A bot far behind on its own clock cannot walk through a tile someone else
occupied at that time, even though the tile looks empty in the live world.**

`sync()` raises every living bot to `max(clock)` and emits one `sync` event per bot that moved.

Contention at equal clocks resolves by **issue order**, not by ascending `botId`: the player API is
synchronous, so `move()` must return immediately and cannot be retracted. For the canonical
`for (const id of bots()) move(id, …)` the two are the same thing. Deterministic either way.

## 3a. Fuel, spend, livelock and medal weights

**Fuel.** `Bot.fuel` / `Bot.fuelMax` default to `Infinity`, so a level that ignores the mechanic
behaves as if it did not exist and `fuel() < 4` is never true. Opt in per bot:
`addBot(world, { at, fuel: 40, fuelMax: 40 })`. Acting burns fuel equal to the action's tick cost;
`wait`, `sync`, `refuel` and all sensing are free. **The authoritative list is the exported
`FUEL_BURNING` set in `trace.ts`** — `Sim` and `applyEvent` both read it, which is what keeps a live
run and its replay in agreement. `refuel()` restores to `fuelMax` and only succeeds on a
`Terrain.Depot` tile. `usesFuel(world)` tells the UI whether to draw a gauge.

**Spend.** `sim.spend('cable', 3)` accumulates into `sim.spendTotals()`, which the harness feeds
into `Verdict.stats.spend`. The engine never interprets the key. Each call emits a `spend` trace
event. Levels and world-specific commands call it; nothing in the core engine does.

**Livelock.** Blocked moves build a streak that any successful move resets. When the streak covers
every living bot and reaches `livelockRounds * livingBots` (default 8, via
`SimOptions.livelockRounds`), the Sim throws `LivelockError` naming the bots. A single-bot sim can
never trip it — a lone bot bumping a wall is an ordinary bug and hits `HaltError`.

**Medal weights.** `MEDAL_WEIGHT` in `verdict.ts` is gold 3, silver 2, bronze 1, none 0. A bonus
star is worth 1 on top, and the only copy of *that* number is `BONUS_STAR_POINTS` in
`src/game/score.ts`. The engine deliberately keeps no second copy.

## 3b. Sensing is free, but it is not invisible

Sensing costs **0 ticks** and **1 op**. On top of that every read tallies into `sim.senseTotals()`
(`{ probe: 7, scan: 240 }`, keyed by command name, surfaced as `Verdict.stats.senses`) and appends
a `sense` trace event `{ t, botId, dt: 0, kind: 'sense', name, ok, detail?, count }`. `ok` means the
read found something; `detail` is a small flat value.

That gives levels a second scoring axis beside ticks: **information**. Budget it with
`Objectives.withinSenses(name, n)` or the whole op count with `Objectives.withinOps(n)`.

`recv` and `botIds` are deliberately **not** senses — the first consumes a message and carries its
own event, the second reads the fleet roster rather than the site. Both still cost an op.

**Trace size.** `TraceBuilder.pushSense` folds identical back-to-back reads into one event with a
higher `count`, and past `MAX_SENSE_EVENTS` (20 000) collapses everything further into one running
aggregate per sense name. **The counts stay exact either way** — `senseTotals(trace)` always equals
`sim.senseTotals()`; only per-read `detail` and interleaving are lossy. Tune with
`SimOptions.maxSenseEvents`. `sense` events are not in `FUEL_BURNING` and `applyEvent` treats them
as no-ops, so replay is bit-identical with or without them.

## 4. Traces and `replayTo`

`Trace` (`src/engine/trace.ts`) is `initialWorld`, `events` sorted by `t` with a stable sort so ties
keep issue order, `keyframes` every 500 ticks, and `endTick`.

Every bot-scoped event carries `botId` **and `dt`**, the ticks charged; `dt` is what lets replay
restore `bot.clock` exactly. Events carry absolute after-state (`move` has `from`/`to`, `tileChange`
has `before`/`after`), so applying them in pure `t` order cannot diverge.

`replayTo(trace, tick)` is identical to replaying from `initialWorld` with the keyframes deleted,
and `replayTo(trace, trace.endTick)` deep-equals the Sim's final world. **Keyframes are a pure
optimisation and are safe to strip.**

`world.tick` on the result is `max(bot.clock)`, which can *lag* the tick you asked for when no bot
has acted yet. The renderer knows which tick it requested; do not read it back off the world.

Also available: `applyEvent(world, event)`, `eventIndexAt(trace, t)` (binary search, for scrubbing)
and `printsUpTo(trace, t)`.

**Treat a `Trace` as immutable.** `replayTo` clones before it mutates and keyframe worlds are
shared; mutating one corrupts every later scrub.

## 5. Writing a `LevelDef`

Full interface in `src/levels/types.ts`, worked example in `src/levels/world-1/w1-01.ts`, contract
in `docs/DESIGN.md` §5.

Build a world with `createWorld({ w, h, seed, fill })`, then `paintAscii(world, ROWS, legend)`,
`addBot(world, { at, facing })` and `addMachine(world, { id, kind, at, state, inventory, vars })`.

Enforced by the suite: unique ids, ``id === `w${world}-${String(index).padStart(2,'0')}` ``,
`seeds.length >= 3` from World 2 on, `build(seed)` pure and deterministic, and a reference solution
under `<world>/__solutions__/<id>.ts` passing on **every** seed within `par.ticks`. Register levels
in `src/levels/index.ts` (`LEVELS`) and solutions in the `SOLUTIONS` map in
`src/levels/__tests__/levels.test.ts`.

**Objective builders sit behind a namespace** — `Objectives.botAt(pad)` — because `botAt(world, pos)`
is a world query and having both flat is a trap. Available: `botAt`, `allTilesAre`, `tileCount`,
`inventoryAtLeast`, `machineState`, `itemsDelivered`, `printedSequence`, `withinTicks`,
`withinSenses`, `withinOps`, `machinesAllIn`, `custom`. Each takes an optional
`{ id, label, meter, unit }`, and every one that can show "7 / 12" implements `progress()`.

**A budget objective declares its `meter`** (`docs/DESIGN.md` §5). `src/game/budgets.ts` recovers
the unclamped spend behind a `[done, total]` pair — the `21 / 16 beams` a clamp reports as
`16 / 16` — and works out which of the run's totals to count. Given a `meter` it counts that one;
given nothing it parses the label. **The label is prose written for the player, so rewording one
moves an undeclared budget off its meter with nothing going red.** `withinTicks`, `withinOps` and
`withinSenses` declare for themselves; `custom` must say. `unit` overrides the readout's noun.

Solutions are test fixtures. `vite.config.ts` hard-fails the production build the moment a
`__solutions__` module becomes reachable from `src/main.tsx`.

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
