# ENGINE — integration guide

For the RUNTIME, CONTENT, RENDER and UI agents. `docs/DESIGN.md` is still the contract; this is the
"how do I actually call it" companion. Everything lives in `src/engine/` and is pure: no DOM, no
React, no canvas. It runs unchanged in Node under Vitest.

**Import from `src/engine` (the barrel) and nowhere deeper.**

```ts
import { Sim, Dir, Objectives, replayTo, buildVerdict } from '../engine/index.ts';
```

---

## 1. Coordinates

`x` grows East. **`y` grows South.** `Dir.North` is `y - 1`. Tiles are row-major:
`index = y * world.w + x`.

`Dir` is a frozen object plus a union type, **not** a TypeScript enum:

```ts
export const Dir = { North: 0, East: 1, South: 2, West: 3 } as const;
export type Dir = (typeof Dir)[keyof typeof Dir];
```

Same pattern for `Terrain`, `ItemKind`, `MachineKind`, `FailureCode`, `Medal`. DESIGN.md §4.1 writes
`const enum`; that would be erased at build time and the player's transpiled program needs `Dir` as
a real runtime value, so it had to become an object. The `Dir.North` call site is unchanged.

---

## 2. Driving the Sim

One `Sim` owns one `World`, one `Trace` builder, and the budgets. Every method takes the acting
`botId` first — the runtime binds that away before the player ever sees it.

```ts
const world = level.build(seed);
const initialWorld = cloneWorld(world);          // keep this: objectives get it
const sim = new Sim(world, { costs: level.costs, maxTicks: 20_000, maxOps: 2_000_000 });
const botId = world.bots[0]!.id;

try {
  runPlayerProgram(bindApi(sim, botId));         // synchronous, runs to completion
} catch (error) {
  // HaltError | OpLimitError | IllegalActionError | whatever the player threw
}

const trace = sim.finish();                      // call exactly once, even after a throw
const verdict = buildVerdict({
  objectives: level.objectives,
  world: sim.world, trace, initialWorld,
  ops: sim.ops, seeds: 1,
});
```

`src/levels/harness.ts` already does all of that (`runLevel`, `runReference`). The worker should
produce byte-identical results; if it does not, the harness is right.

Each acting method validates, mutates, advances **the acting bot's clock**, appends a timestamped
event, checks budgets, and returns the player-visible value. Sensing (`pos`, `facing`, `clock`,
`canMove`, `scan`, `look`, `inventory`, `carrying`, `capacity`, `fuel`, `fuelMax`, `readMark`,
`probe`, `botIds`, `recv`, `print`) costs 0 ticks but still counts against `maxOps` — and, since
§3b, is counted and traced as well.

Two failure philosophies, applied consistently:

| Situation | Behaviour |
|---|---|
| The world says no (wall, empty tile, full inventory, no machine on this tile, an antenna switched off) | returns `false` / `null` / `0`, **still charges the full tick cost** |
| The program is incoherent (unknown bot id, dead bot, negative count, `power` on a `vars.manual` machine, a machine id that names nothing, `transmit` where no antenna exists) | throws `IllegalActionError` |

The line between the two is whether the identical call could succeed later in the same run. A wall
can open, an inventory can empty and an antenna can be powered up; an unknown bot id cannot become
known, nothing in the API clears `vars.manual`, and nothing in it builds a machine or installs an
antenna, so `power("sub-3", "on")` and `link("node-1", "ghost")` are wrong for the whole run rather
than wrong now. A `false` the player could branch on would be a branch that can never flip. Every
refusal on the throwing side is still logged and still charged before it throws, so the trace and
the live world stay in step.

Machine ids are on the throwing side for the same reason bot ids are, and they have the same free
pre-check: `probe(id)` returns `null` for an id that names nothing and costs nothing to ask, which
is the idiom the World 5 briefs already teach for finding where the substations stop.
| Budget blown | throws `HaltError` / `OpLimitError` |
| Bot ran dry | throws `OutOfFuelError` **before mutating anything** |
| Every bot blocked, forever | throws `LivelockError` |

Extension points for World 5/6 commands that DESIGN.md leaves unspecified:
`sim.applyMachineChange(botId, machineId, mutate, cost)` and `sim.applyTileChange(at, mutate)`.
`applyMachineChange` throws on an id that names no machine — it is for changing a machine you have
already found. When your verb wants to *refuse* and charge for the attempt, say so with
`sim.refuseMachineAct(botId, detail, cost)` and then report the refusal in your own words; passing
a knowingly-bad id to bill for it is what that method exists to replace.
Both emit the right trace events for you. **Do not mutate `sim.world` directly** — an unrecorded
mutation makes replay diverge silently, which is the single worst bug class in this codebase.

---

## 3. Multi-bot virtual clocks (DESIGN.md §4.3)

Every bot has its own `clock`. `b1.move()` then `b2.move()` means both moved in parallel; the
score is `max(bot.clock)` (`sim.ticks`, also mirrored on `world.tick`). Single-bot worlds are just
the N=1 case, so World 7 needs no retrofit.

Collisions use time intervals, not a snapshot. A bot holds its tile from the moment it arrives
until the tick its next move completes. A move into a tile is blocked when any *other* bot's
residence interval overlaps `[t, t + costs.move)`. Consequence worth knowing: a bot that is far
behind on its own clock **cannot** walk through a tile that someone else occupied at that time,
even though the tile looks empty in the live world.

`sync()` raises every living bot to `max(clock)` and emits one `sync` event per bot that moved.

**Deviation from DESIGN.md §4.3:** the spec says contention resolves by ascending `(clock, botId)`.
The player API is synchronous, so a `move()` must return `true`/`false` immediately and cannot be
retracted later — resolution is therefore by *issue order* at equal clocks. For the canonical
pattern (`for (const id of bots()) move(id, …)`) issue order **is** ascending `botId` at equal
clocks, so the observable behaviour matches. It is fully deterministic either way.

---

## 3a. Fuel, spend and livelock (DESIGN.md §11)

**Fuel (A1).** `Bot.fuel` / `Bot.fuelMax` default to `Infinity`, so a level that ignores the
mechanic behaves exactly as before and `fuel() < 4` is simply never true. Opt in per bot:
`addBot(world, { at, fuel: 40, fuelMax: 40 })`. Acting burns fuel equal to the action's tick cost.
Idling does not: `wait`, `sync`, `refuel` and all sensing are free. The authoritative list is the
exported `FUEL_BURNING` set in `trace.ts` — `Sim` and `applyEvent` both read it, which is what
keeps a live run and its replay in agreement. `refuel()` restores to `fuelMax` and only succeeds
on a `Terrain.Depot` tile. `usesFuel(world)` tells the UI whether to draw a gauge at all.

**Spend (A5).** `sim.spend('cable', 3)` accumulates into `sim.spendTotals()`, which the harness
feeds into `Verdict.stats.spend`. The engine never interprets the key. Each call also emits a
`spend` trace event, so the UI can show consumption over time. Levels and world-specific commands
call it; nothing in the core engine does.

**Livelock (A6).** Blocked moves build a streak that any successful move resets. When the streak
covers every living bot and reaches `livelockRounds * livingBots` (default 8, via
`SimOptions.livelockRounds`), the Sim throws `LivelockError` naming the bots. Single-bot sims can
never trip it — a lone bot bumping a wall is an ordinary bug and hits `HaltError` instead.

**Medals (A4).** `MEDAL_WEIGHT` = gold 3, silver 2, bronze 1, none 0, exported from `verdict.ts`.
A bonus star is worth 1 on top of that, and the one live copy of *that* number is
`BONUS_STAR_POINTS` in `src/game/score.ts` — the engine no longer keeps a second one. The
Performance Review tiers assume exactly these.

---

## 3b. Sensing is free, but it is not invisible

Sensing still costs **0 ticks** (DESIGN.md §4.4 is unchanged) and still counts **1 op**. On top of
that, every read now:

- tallies into `sim.senseTotals()` — `{ probe: 7, scan: 240 }`, keyed by command name — which
  `buildVerdict` surfaces as `Verdict.stats.senses`;
- appends a `sense` trace event: `{ t, botId, dt: 0, kind: 'sense', name, ok, detail?, count }`.
  `ok` means "the read found something" (a machine for `probe`, a mark for `readMark`, a tile in
  bounds for `scan`), and `detail` is a small flat value — `"3,4"`, a direction name, an id.

That gives levels a second scoring axis next to ticks: **information**. Budget it
with `Objectives.withinSenses(name, n)` (`progress()` reports `7 / 10`), or the whole op count with
`Objectives.withinOps(n)`.

`recv` and `botIds` are deliberately *not* senses: the first consumes a message and has carried its
own event since World 7, the second reads the fleet roster rather than the site. Both still cost
an op, as before.

**Trace size.** A tight `while (true) { scan(); }` would otherwise produce a million objects, so
`TraceBuilder.pushSense` folds. Identical back-to-back reads merge into one event with a higher
`count`; past `MAX_SENSE_EVENTS` (20 000) stored reads, everything further collapses into one
running aggregate per sense name. **The counts stay exact either way** — `senseTotals(trace)`
always equals `sim.senseTotals()`. Only per-read `detail` and interleaving are lossy, and only on
traces no human was going to scrub. Tune it per Sim with `SimOptions.maxSenseEvents`.

`sense` events are not in `FUEL_BURNING` and `applyEvent` treats them as no-ops, so replay is
bit-identical with or without them.

---

## 4. Traces and `replayTo`

```ts
interface Trace {
  initialWorld: World;
  events: TraceEvent[];    // sorted by t; ties keep issue order (the sort is stable)
  keyframes: Keyframe[];   // every 500 ticks
  endTick: number;
}
```

Every bot-scoped event carries `botId` **and `dt`**, the ticks charged. `dt` is what lets replay
restore `bot.clock` exactly. Events carry absolute after-state (`move` has `from`/`to`,
`tileChange` has `before`/`after`), so applying them in pure `t` order can never diverge.

```ts
const world = replayTo(trace, tick);   // world as of `tick`
```

**Guarantees.** `replayTo(trace, tick)` is identical to replaying from `initialWorld` with the
keyframes deleted. `replayTo(trace, trace.endTick)` deep-equals the Sim's final world. Keyframes
are a pure optimisation and are safe to strip. Both are covered by tests.

`world.tick` on the result is `max(bot.clock)`, which can *lag* the `tick` you asked for when no
bot has acted yet. The renderer knows which tick it requested; don't read it back off the world.

Also available: `applyEvent(world, event)` for stepping one event at a time, `eventIndexAt(trace, t)`
(binary search) for scrubbing, and `printsUpTo(trace, t)` for the console panel.

**Treat a `Trace` as immutable.** `replayTo` clones before it mutates, and keyframe worlds are
shared. Mutating one corrupts every later scrub.

---

## 5. Writing a `LevelDef`

See `src/levels/types.ts` for the full interface and `src/levels/world-1/w1-01.ts` for a worked
example. The shape you will use most:

```ts
export const w2_03: LevelDef = {
  id: 'w2-03', world: 2, index: 3,
  title: '…', brief: '…markdown…',
  hardware: ['plant'],
  build(seed) {
    const world = createWorld({ w: 12, h: 9, seed, fill: Terrain.Regolith });
    paintAscii(world, ROWS, { '#': Terrain.Wall, '.': Terrain.Floor, ',': Terrain.Soil });
    addBot(world, { at: vec(1, 1), facing: Dir.East });
    addMachine(world, { id: 'silo', kind: 'sink', at: vec(10, 7), state: 'idle', inventory: [], vars: {} });
    return world;
  },
  objectives: [Objectives.inventoryAtLeast('crop', 6)],
  seeds: [1, 2, 3],
  par: { ticks: 84 },
  starter: '…', hints: ['…'],
};
```

Rules that the test suite enforces: unique ids, `id === \`w${world}-${String(index).padStart(2,'0')}\``,
`seeds.length >= 3` from World 2 on, `build(seed)` pure and deterministic, and a reference solution
under `<world>/__solutions__/<id>.ts` that passes on **every** seed within `par.ticks`.

Register new levels in `src/levels/index.ts` (`LEVELS`) and new solutions in the `SOLUTIONS` map in
`src/levels/__tests__/levels.test.ts`.

Objective builders live behind a namespace — `Objectives.botAt(pad)` — because `botAt(world, pos)`
is a world query and having both flat would be a trap. Available: `botAt`, `allTilesAre`,
`tileCount`, `inventoryAtLeast`, `machineState`, `itemsDelivered`, `printedSequence`, `withinTicks`,
`withinSenses`, `withinOps`, `machinesAllIn`, `custom`. Each takes an optional
`{ id, label, meter, unit }`; every one that can show "7 / 12" implements `progress()`.

**An objective that is a budget should declare `meter`.** `src/game/budgets.ts` recovers the
unclamped spend behind a `[done, total]` pair — the `21 / 16 beams` a clamp would report as
`16 / 16` — and it works out *which* of the run's totals to count. Given a `meter` it counts that
one. Given nothing it reads the label: tick and op words, then the sense and resource names the run
produced, matched word by word. That fallback is kept for the levels that have not declared, but a
label is prose written for the player, and rewording one used to move a budget off its meter with
nothing going red. `withinTicks`, `withinOps` and `withinSenses` declare for themselves;
`custom` budgets have to say. `unit` overrides the plural noun in the readout and is only worth
setting where the meter's own name reads badly.

Solutions are **test fixtures**. `vite.config.ts` hard-fails the production build the moment a
`__solutions__` module becomes reachable from `src/main.tsx`.

---

## 6. Gotchas found while building this

1. **Keyframes are built by replaying, never by snapshotting the live world.** With per-bot clocks
   the live world is not "the world at tick T" — bot A may be at t=900 while bot B is still at
   t=100. A live snapshot would silently disagree with a replay. `TraceBuilder.build()` therefore
   replays its own finished event list to cut keyframes.
2. **The Sim never touches `world.rng`.** All randomness belongs to `LevelDef.build(seed)`. If a
   command consumed the Rng, a trace could not be replayed without re-running sim logic, and the
   whole replay architecture would collapse. If you need per-run variety, derive it from the seed
   in `build`.
3. **`tile.occupant` is maintained by the Sim, but `world.bots` is the source of truth.** After
   hand-building or hand-editing a world, call `rebuildOccupancy(world)`. `setTile` deliberately
   preserves an existing occupant so terrain edits don't drop a bot off the grid.
4. **Nothing ticks on its own.** There is no global update loop, so crop growth is *derived*:
   `plant` stamps `tile.meta.plantedAt`, and `maturity(tile, t)` computes maturity against the
   observing bot's clock. A tile authored with a plain `growth` value and no `plantedAt` is simply
   always at that maturity. Design World 2 mechanics around derived state, not scheduled updates.
5. **`noUncheckedIndexedAccess` is on.** `world.tiles[i]` is `Tile | undefined`. Use `tileAt`,
   which returns `undefined` out of bounds on purpose, rather than indexing and asserting.
6. **`move` charges a tick even when it fails**, and updates `facing` either way. That is
   deliberate — it is what makes `canMove()` (free) worth calling.
7. **`world.rng` is a class instance, and `postMessage` strips prototypes.** A `Trace` that comes
   back from the worker has `initialWorld.rng` as a bare `{ state }` with no methods. `cloneWorld`
   heals this automatically, but call `reviveTrace(trace)` once on receipt if you intend to touch a
   transferred World directly. This will bite RENDER and UI otherwise.
8. **Ordinary JavaScript state persists for the whole run.** The player's program is one
   synchronous execution, so a `Map` or closure survives across every command. `mark`/`readMark`
   are only for state that must live *in the world*. DESIGN.md §11 A3 requires the docs panel to
   say this outright — several World 4 levels are unsolvable until the player believes it.

---

## 7. Budgets and the three ways a runaway program dies

| Guard | Where | Surfaces as |
|---|---|---|
| `maxTicks` (default 20 000) | every acting command | `HaltError` |
| `maxOps` (default 2 000 000) | every command, sensing included | `OpLimitError` |
| `fuel` (default `Infinity`) | every acting command, before it mutates | `OutOfFuelError` |
| `livelockRounds` (default 8) | blocked moves in multi-bot levels | `LivelockError` |
| `WORKER_TIMEOUT_MS` (5 000) | main thread | `worker.terminate()`, "Your program did not halt." |

The third is the only thing that catches `while (true) {}` with no API call inside. It belongs to
RUNTIME + UI, not to the engine. `WORKER_TIMEOUT_MS` is exported from `src/runtime/protocol.ts`.
