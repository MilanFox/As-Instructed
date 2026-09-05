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

---

## 2. `send()` — now throws, like every other verb reached with a bad bot id

**Moved to the throwing side.** `send()` returned `false` when `to` named no bot or a dead one.
Both states are permanent — no call in the API brings bot #99 into being, and nothing revives a bot
once `kill` has run — so by the deciding test both belong with the unknown bot id, not with the
wall.

### Why a throw, and why keeping `false` was wrong

This was never a design choice; it was an inconsistency, and `power()`'s own doc comment
(`sim.ts:624`) had already named the category out loud while ruling on a different verb: *"It is
the same category as an unknown bot id."* Every other verb routes a bot id through
`requireActiveBot`, which throws for exactly these two states. `move(99, Dir.North)` threw and
`send(0, 99, "x")` shrugged, for the same argument, in the same engine.

Keeping `false` fails the branch test in its purest form. `if (!send(99, "go"))` is a branch that
can never flip: nothing the program does afterwards makes 99 exist or brings a lost bot back. It
reads as a control-flow option and is a typo.

The alternative — a reason on the event — is unavailable here for the reason set out above: a trace
event is not a player channel, and unlike `plant()` there is no free call that recovers the answer
after the fact. `bots()` tells you which ids are live *before* the send; after a mute `false` the
player is left with a message that silently went nowhere and a receiver whose `recv()` returns
null, which is the World 7 symptom that is already hardest to attribute — the causal-delivery rule
produces an empty inbox for a *correct* program that merely forgot `sync()`. Silently dropping the
message adds a second cause to that one symptom. That is the incentive failure
`docs/AUDIT-INCENTIVES.md` finding 1 describes: the player learns to distrust `recv()`.

### What the player now reads

An id that never existed:

> `send(99): there is no bot #99 on this contract, so the message has nowhere to go. bots() returns every id that exists.`

A bot that has been lost:

> `send(2): bot #2 ("hauler-2") was lost at (4, 7) and cannot receive messages. bots() lists only the bots still running.`

Named object, the coordinate where it died, and the free check that answers it — `power()`'s shape,
one plain sentence each. The dead case carries `at`, so `Verdict.failure.at` points the viewport at
the wreck; both carry the player's own line number through the existing path.

### Difficulty is unmoved — checked before the change, not after

Every `send()` call in the campaign was read first. There are exactly **two live call sites**:
`w7-01.ts:19` and `w7-05.ts:151` in the reference solutions, and nothing else in `src/levels/**`.
Both take their target from `botIds()`, which filters on `alive`, and neither level authors hazard
terrain or fuel, so neither can hold a dead bot. **No reference solution branches on `send()`'s
return value** — both calls are bare statements — so nothing in the campaign can observe the change
except by hitting a bug it never had.

No par, medal threshold, budget, tick cost or objective changed. `send` still costs `costs.send` on
both paths, and the refused send is still **logged and charged before it throws**, so `applyEvent`
restores the same clock on replay that the live run spent (docs/ENGINE.md §6).

### What changed

| File | Change |
|---|---|
| `src/engine/sim.ts` | `send()` splits the unknown-id case from the dead-bot case and throws `IllegalActionError` for each, after logging the `ok: false` event and charging the tick. The doc comment was one line and described the old behaviour. |
| `src/engine/trace.ts` | `SendEvent`'s comment said the message "is never delivered" and stopped there; it now records that the send throws immediately after, and why the event still exists. |
| `src/runtime/api-spec.ts` | The `send` reference page promised a `false` that no longer happens. |
| `src/engine/__tests__/sim.test.ts` | The two tests asserting the old `false` now assert the throw, the message, the `at`, and that the tick is still charged and the event still written. |
| `src/runtime/__tests__/bot-handle.test.ts` | `'sending to a bot that is not there is refused, not thrown'` was a test of the defect. Inverted. |
| `src/runtime/__tests__/run-level.test.ts` | +1 end-to-end test: a real `w7-01` run whose `verdict.failure.message` is the sentence above, on the player's line 2. |

Net **+1 test** (1627 from 1626); three existing tests were rewritten in place rather than added,
because they asserted the contract that changed.

---

## 3. `spawn()` — the reason it already computed now survives

**Kept on the `-1` side.** The tile is transient: the neighbour walks off and the identical call
succeeds. `spawn()` still returns the child's id or `-1`, and still costs `costs.spawn` either way.

`spawn()` called `this.blockReason(...)`, used the answer to decide, and then threw it away —
pushing `{ kind: 'act', name: 'spawn', ok: false }` with no trace of *which* of the three rules
refused. `move()` makes the identical call and puts `reason` on its event. The `ActEvent` already
carries a `detail` field for exactly this (`power()` puts the machine id there), so the fix is one
argument and no type change.

### What the player now reads

The reference page for `spawn` named the three causes and stopped. It now says which free call
answers which, and admits the one it cannot:

> Creates a new bot on the adjacent tile in `dir` and returns its id. Returns -1 when that tile is
> out of bounds, not walkable, or held by another bot, and the failed spawn still costs the full
> price. `scan(dir)` reads the first two for free as `inBounds` and `walkable`; the third is the
> same rule `move` obeys, so a tile a neighbour is still stepping off can refuse a spawn even
> though it looks empty.

That last clause is the honest part and the reason `spawn` is not simply given a `canSpawn`.
`blockReason` is asked about arrival at `t + costs.spawn`, **not** `t + costs.move`, so `canMove`
is the nearest free test and not an exact one: where the two prices differ, the occupancy interval
resolves differently. Adding a free check that agreed with `spawn` would mean either a new verb or
changing which cost `spawn` measures arrival at — and the second would move `w7-02`'s fleet size,
which is difficulty. So the page tells the player the rule and where it bites, and the engine
records the answer for the trace.

### Difficulty is unmoved

`w7-02.ts:72` is the only `spawn()` in the campaign and it **depends on the `-1` sentinel**
(`if (child < 0) break;`) to stop growing the fleet. That contract is untouched: same return, same
conditions, same price. Only an optional `detail` string on a refusal event is new.

### What changed

| File | Change |
|---|---|
| `src/engine/sim.ts` | `spawn()` keeps `blockReason`'s answer and puts it on the event as `detail`. Doc comment was one line, said "if the tile is taken" — which is one of three cases — and did not mention the arrival-time subtlety that makes `canMove` inexact here. |
| `src/runtime/api-spec.ts` | The `spawn` reference page, as above. |
| `src/engine/__tests__/sim.test.ts` | +2 tests. |

The first new test drives all three refusals and asserts each records the reason a refused *move*
would have recorded — then feeds it to `describeBlock()` and asserts the rendered sentence, so the
field is demonstrably the one that turns into player-facing text rather than a private enum. The
second asserts `scan()` independently reports the same two causes it is documented to cover.

Full suite: **1629 passing across 64 files.**
