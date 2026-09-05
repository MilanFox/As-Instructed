# FIX-MUTE-VERBS — finishing the sweep `power()` started

`docs/FIX-POWER.md` fixed one verb that failed, charged a tick and explained nothing, and ranked
the survivors it found in the same pass. This is that list, worked down in order. Written as the
work happened; each section was appended when its verb was finished and committed.

The deciding test is the one `power()` established and `docs/ENGINE.md` §2 now carries: **can the
identical call succeed later in the same run?** If yes, the verb belongs on the `false` side and
wants a *reason*. If no, the argument is wrong and will stay wrong, and a `false` the player could
branch on is a branch that can never flip — that verb belongs on the throwing side.

---

## The channel model, established first, because it decides every case below

Before touching anything I traced what a player can actually *read*. There are exactly two
channels, and no third:

1. **The throw channel.** `SimError` → `runSeed` catches → `toRuntimeFailure` → `toVerdictFailure`
   → `Verdict.failure.message` → the console panel's red closing line, with `code`, `at` and the
   player's own line number attached. This is the mechanism `LivelockError` and now `power()` use.
   It is **fatal**: it ends the run.
2. **The return-value channel.** What a verb hands back to the player's program, plus every free
   sense (`scan`, `inventory`, `probe`, `canMove`, …). The program reads it, and `print()` puts it
   on screen. This is **non-fatal**.

**A trace event is not a player channel.** `src/game/store.ts:451` builds the console from exactly
two things — `print` events, and one line from `verdict.failure.message`. Nothing in `src/ui/**`
or `src/render/**` reads an event's `reason`; `describeBlock()` is exported and tested and called
by nothing outside its own test. So `MoveEvent.reason` — the field FIX-POWER holds up as the model
— is today a field for replay, level objectives and tests, **not** something the player sees.

That is the constraint the whole sweep runs into: **a verb that stays on the `false` side can only
explain itself to the player's program.** Adding a reason to its event is necessary for parity with
`move` and useful to everything downstream, but on its own it is still mute. Each `false` case
below therefore had to answer a second question — *is the reason reachable by a free call?* — and
the fix is whatever makes the answer yes.

---

## 1. `plant()` — a reason on the event, and no `canPlant`

**Kept on the `false` side, as assessed.** All three causes are transient and fixable mid-run:
walk to soil, harvest what is growing, pick up a seed. `plant()` still returns `boolean` and still
charges `costs.plant` on every path.

### What changed

| File | Change |
|---|---|
| `src/engine/trace.ts` | `PlantEvent` gains `reason?: string`, documented `'terrain' \| 'occupied' \| 'seed'` — the same field, same shape and same comment style as `MoveEvent.reason`. |
| `src/engine/sim.ts` | A module-level `plantBlockReason(tile, seeds)` mirroring `blockReason`, and `plant()` now puts its answer on the refusal event. Doc comment rewritten; it described neither the reason nor the missing `canPlant`. |
| `src/runtime/api-spec.ts` | The `plant` reference page named the three causes in one run-on clause and never said how to tell them apart. It now pairs each cause with the free check that isolates it, and the example demonstrates all three. |
| `src/engine/__tests__/sim.test.ts` | +2 tests. |

Ordering is fixed at ground → crop → inventory, so the answer is stable when two causes hold at
once, and it is the order the player checks them in.

### Why there is deliberately no `canPlant()`

FIX-POWER lists the absence of `canPlant` as part of the defect, and `move` is the model it points
at: `reason` on the event, `canMove()` free beforehand. Measured against the code, that parity is
the wrong thing to copy, and the asymmetry is worth stating rather than papering over.

**`move` needs `canMove` because `blockReason` reads state the player cannot see.** A tile can look
empty in the live world and still be *reserved* — `this.occupancy` holds a half-open residence
interval per bot, and a bot lagging on its own clock is blocked by a tile someone else held at that
time (`sim.ts:999`, and `docs/ENGINE.md` §3 says so outright). No sense exposes that. Without
`canMove` the player could not reconstruct the answer at all.

**`plant` has no hidden state.** Every input to its decision is already free and already exact:

| Cause | Free check | Exact? |
|---|---|---|
| ground is not plantable | `scan().terrain !== 'soil'` | yes — `Soil` is the only terrain with `plantable: true` (`world.ts:97`) |
| something is already growing | `scan().crop !== null` | yes — `TileView.crop` is the tile's crop |
| carrying none of that kind | `inventory(kind) === 0` | yes |

A `canPlant()` returning a boolean would collapse the three causes back into the one bit that is
the defect, so it would be strictly worse than the two calls the player can already make. A
`canPlant()` returning the reason string would work, but it would be API surface for information
obtainable in two existing calls, and it would drop difficulty in World 2 by handing over a
consolidated answer the level is asking the player to assemble. Neither earns its place.

So the fix is the reason field for everything downstream of the trace, and — the part the player
actually reads — a reference page that names the three checks. The information was always free;
what was missing was the instruction to use it.

### What the player now reads

The reference page for `plant`, in the docs panel:

> Plants one item of `kind` from the inventory into plantable ground under the bot. It refuses for
> exactly three reasons, and each one has a free check that tells it from the other two: the ground
> is not soil (`scan().terrain`), something is already growing there (`scan().crop`), or the bot
> carries none of that kind (`inventory(kind)`). A refusal costs the full price, so it is worth
> asking first.

with an example that branches on all three and `print()`s which one it hit. 58 words on the page,
in the register the rest of the campaign uses; no `makespan`, no `precedence`, no `audit`.

### The tests

Two, and the second is the one that matters. The first asserts each of the three refusals stamps
its own `reason` on its event. The second builds the three worlds a player would actually be
standing in, calls `plant()`, gets `false`, and then **diagnoses the cause using only free calls**
— `scan()` and `inventory()`, asserting the tick cost did not move — and checks that the diagnosis
the program reached matches the reason the engine recorded. That is the claim worth defending: not
that the failure is labelled, but that the player can label it.

### Difficulty is unmoved

No par, medal threshold, budget, tick cost or objective changed. `plant()` returns the same
`boolean` on the same conditions and charges the same price; the only new thing in the world is an
optional field on a trace event and prose on a docs page. All 86 reference-solution tests pass
**unedited**. Full suite: **1626 passing across 64 files**, baseline 1624, so +2 and none removed.
`npx tsc --noEmit` silent.
