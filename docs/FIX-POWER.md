# FIX-POWER — `power()` on a manual machine now says so

`docs/OPEN-ITEMS.md` defect 1: `power()` against a machine publishing `vars.manual: 1` charged the
tick, returned `false` and explained nothing. `w8-03` and `w8-05` exist to teach *"this machine has
no grid connection, somebody has to stand there"* and could not teach it by failure, because the
failure was mute. Written as the work happened; each section was appended when its unit finished.

---

## The shape chosen: a hard, explained failure (`IllegalActionError`)

`Sim.power()` now **throws `IllegalActionError`** when it reaches a manual machine. It keeps
returning `false` for an unknown machine id — the two cases were conflated in one branch and are
now separate.

### Why a throw, and why the alternative was wrong

`docs/ENGINE.md` §2 states the house rule as two philosophies:

| Situation | Behaviour |
|---|---|
| The world says no (wall, empty tile, full inventory, no machine) | returns `false`, still charges the tick |
| The program is incoherent (unknown bot id, dead bot, negative count) | throws `IllegalActionError` |

The deciding question is therefore which side of that line a manual machine falls on, and there is
a clean test that separates the two lists: **can the identical call succeed later in the same
run?** For every `false` case, yes — walk somewhere else, empty the inventory, wait for the door.
For every throwing case, no: the argument is wrong and will stay wrong. `vars.manual` is authored
in `build(seed)` and nothing in the API can clear it, so `power("sub-3", "on")` is *permanently*
wrong for as long as that world exists. It belongs with the unknown bot id, not with the wall.

The same test explains why `false` was actively harmful rather than merely quiet. A `false` return
is a value worth branching on — `if (!move(...))` is a real program. A `power()` that can only ever
return `false` for a given id gives the player a branch that can never flip, which is a bug dressed
as a control-flow option.

**Option (a) — keep `false`, explain on the console/verdict surface — was rejected on plumbing, not
on taste.** The console carries exactly two things (`src/game/store.ts:451`): `print` events from
the trace, and one closing line built from `verdict.failure.message`. A non-fatal `power()` notice
has no home in either. Putting it in `print` would corrupt `Objectives.printedSequence`, which
compares print output exactly; giving it a new event kind and a new console line kind would be the
second, parallel error channel the brief forbids — and it would land in `src/ui/panels/**` and
`src/game/store.ts`, neither of which this change owns. A throw needs **no new plumbing at all**:
`runSeed` already catches it (`src/runtime/run-level.ts:82`), `toRuntimeFailure` already maps
`SimError.code` and `SimError.at`, `toVerdictFailure` carries them into `Verdict.failure`, the
console already renders that message as its error line, and the failure already carries the
player's own line number. That is the mechanism `LivelockError` uses, which is the precedent the
brief points at.

### What the player now reads

> `power("sub-3"): the machine at (7, 3) is hand-operated, so only a use() at that tile moves it.`
> `probe("sub-3").vars.manual is 1 on every machine like it.`

Named object, exact coordinates, the fix, and the free check that generalises the rule — with the
offending line highlighted in the editor, because `Verdict.failure.line` is populated by the
existing path. No `makespan`/`precedence`/`audit` register.

**Worth knowing for anyone writing failure copy here:** the result panel shows the `copy.ts`
flavour line and the failing objective's divergence, but **not** `Verdict.failure.message`. The
message appears only in the console panel. The first draft of the new `illegal-action` line said
*"the reason is the line above this one"*, which the browser check immediately showed to be false —
the line above it is the heading. It now points at the console, where the sentence actually is.

---

## What changed

| File | Change |
|---|---|
| `src/engine/sim.ts` | `power()` splits the unknown-id branch from the manual branch. Unknown id: unchanged, logs `ok: false`, charges, returns `false`. Manual: logs the same `ok: false` act event (now with `at`), charges the same tick, then throws `IllegalActionError` carrying `botId` and `at`. Doc comment rewritten — it described the old behaviour. |
| `src/runtime/api-spec.ts` | The `power` reference page now says the run stops and names the machine, instead of promising `false`. |
| `src/ui/copy.ts` | The `illegal-action` flavour line was *"The bot declined the instruction. The log says only that."* — no longer true, since the log now says a great deal. Replaced with two rotating lines that point at the real message. |
| `docs/ENGINE.md` §2 | The two-philosophies table listed the throwing cases and no longer covered this one. Row extended, plus the succeed-later test that draws the line between the two columns. |
| `src/engine/__tests__/sim.test.ts` | +3 tests. |
| `src/runtime/__tests__/run-level.test.ts` | +3 tests. |

**The refused call is still logged and still charged before it throws.** Charging matters for
replay: `applyEvent` restores `bot.clock` from each event's `dt`, so pushing an event whose ticks
were never charged would diverge the trace from the live world — the worst bug class in this
codebase (docs/ENGINE.md §6). Logging matters because the timeline should still show the attempt
at the tick it happened. It also means nothing about `Trace` shape changed, which is why
`finale.test.ts` still passes untouched.

### Difficulty is unmoved

No `par`, medal threshold, `budget` or `costs` value was touched, and no character count was
reintroduced. `power` still costs `costs.power` on both paths. Nothing that a *correct* solution
does changed: the World 8 reference solutions never call `power()` at all, and the World 5
solutions that do (`w5-02`, `w5-03`, `w5-05`) run in worlds that publish no `manual` flag anywhere.
All 86 reference-solution tests pass on every seed.

## Verification

- `npx vitest run` — **50 files / 1375 tests, all passing.** Baseline 1369, so **+6**: three engine
  unit tests and three runtime end-to-end tests, all new, none removed.
- `npx tsc --noEmit` — silent.
- `npm run build` — clean.
- `npx eslint src` — the one known pre-existing error
  (`src/levels/world-5/__solutions__/w5-01.ts:32`, the `use()` false positive). Nothing new.
- **Confirmed in a browser.** `w8-03` opened on a dev build, program replaced with
  `print('starting the grid from the desk'); power('sub-0', 'on');`, run. The console panel reads,
  in red, under the surviving `print`:

  > `Seed 1 of 5 (seed 1) failed. power("sub-0"): the machine at (9, 6) is hand-operated, so only`
  > `a use() at that tile moves it. probe("sub-0").vars.manual is 1 on every machine like it.`

  The result panel's **THIS IS WHY** block sits alongside it with the objective's own diff —
  *"sub-0 at (9, 6) / want on, switched by a use() at the tile / got never used; no bot stood on
  it"* — so the two halves of the story agree and neither is guessed at. `Jump to the failure`
  lands on line 2. Nothing was left behind: the test save was cleared from `localStorage` and the
  tab closed.

- `src/levels/__tests__/finale.test.ts` passes **unedited**. Its three bypass tests still hold:
  the bypass still produces `power` act events that are all `ok: false`, `grid-online` is still
  `0 / N` with its divergence intact, and the airlock gate tiles are still `Wall`. The only
  difference is that the bypass now stops at its first call instead of burning through all eight.

---

## Sibling verbs with the same mute-failure shape — found, not fixed

Every acting method in `src/engine/sim.ts` was read against one question: *when this fails, does
anything the player can reach say why?* Ranked by how much a player loses to the silence. **None of
these was changed** — none is the same line, and two of them want a design call rather than a
patch.

**1. `plant()` (`sim.ts:438`) — the worst of them, and the closest twin of this defect.** Three
unrelated causes collapse into one bit: the tile is not plantable, the tile already has a crop, or
the bot is not carrying that seed. The trace event is `{ kind: 'plant', ok: false }` with no
reason field at all, there is no free pre-check (`canMove` has no `canPlant` counterpart), and
World 2 is where the beginner meets it. The fix is not a throw — every one of the three causes is
transient and fixable mid-run, so `plant` sits correctly on the `false` side of the line — it is a
`reason` on the event, exactly as `move` already carries.

**2. `send()` (`sim.ts:740`) — inconsistent with the rule this change just applied.** It returns
`false` for an unknown *or dead* bot id. Every other verb routes an unknown bot id through
`requireBot`, which throws `IllegalActionError`: `move(99, …)` throws, `send(0, 99, "x")` shrugs.
Both target states are permanent — no API call creates bot #99 or revives a dead one — so by the
test used above, both belong on the throwing side. This is the strongest candidate for the next
change, and it is a genuinely small one, but it lands in World 7 and its tests, so it was left.

**3. `spawn()` (`sim.ts:783`) — the reason is computed and then thrown away.** It calls
`this.blockReason(...)` to decide, then pushes `{ kind: 'act', name: 'spawn', ok: false }` without
it, and returns `-1`. `move()` makes the identical call and *does* put `reason` on its event, which
is what makes `describeBlock()` usable. One field, already in hand.

**4. `pickup()` (`sim.ts:503`) — mute in a different type.** Returns `0`, charges the tick, and
folds together "nothing here", "nothing of that kind here" and "your inventory is full". The event
carries `item: target ?? null`, which distinguishes the first case from the other two but not the
other two from each other. `inventory()` and `capacity()` are free, so the full-inventory case is
pre-checkable; the wrong-kind case is not. `drop()` (`sim.ts:546`) is the same shape, one notch
milder because the player already knows what they are carrying.

**5. `applyMachineChange()` (`sim.ts:~875`) — the unknown-id half of `power`, uncorrected.** It is
the extension point World 5 and 6 commands are built on, so every level-defined verb inherits its
silence. Left deliberately: it takes the same `false` this change kept for `power`'s unknown-id
branch, so it is consistent, just terse.

**6. `refuel()` (`sim.ts:682`) — lowest, and arguably fine.** False off a depot tile, and the tick
is charged. It is positional and transient, the fuel gauge is on screen whenever a level uses fuel,
and the consequence eventually arrives as `OutOfFuelError`, which explains itself in full. The
silence here is covered by something louder downstream.

### Not a mute failure, but worse — flagging it while it is in view

**`use()` on a machine with an empty or absent `cycle` returns `true` and does nothing.**
`sim.ts:588`, and `Machine.cycle`'s own doc comment says so outright: *"Empty means `use()` is a
no-op that still costs ticks."* The trace records `ok: true`. A mute failure at least shows up as
`false`; a mute *success* cannot be detected by the player's program at all. No level appears to
rely on it, so it reads like an unowned edge rather than a design choice, but changing it is a
contract change and needs a ruling rather than a patch.

`use()`'s other failure — no machine on the tile — is well behaved: the event carries
`machineId: null`, the miss is positional and therefore transient, and `probe`/`scan` are free
pre-checks. `move()` is the best-behaved false in the whole API and is the model the rest should
copy: `reason` on the event, `describeBlock()` to render it, `canMove()` free beforehand, and
RENDER drawing a blocked move differently (DESIGN.md §11 A5).

---

## The three adjacent World 8 findings — confirmed or dismissed, none fixed

**1. Dead `docs` ids on `w8-05` — DISMISSED, already fixed, and the wider gap is now closed.**
`w8-05.ts:805` reads `['fuel', 'refuel', 'power', 'use', 'receive', 'probe']` and all six are real
`api-spec` function names, including `receive` (which is a separate function from `recv`).
`docs/FIX-PROSE.md` noted *"Other worlds were not audited for the same defect"* — that audit was
cheap from here and is done. All 34 `docs` arrays were checked against the union of `api-spec`
function names and `DocsPanel`'s four guide ids (`coordinates`, `memory`, `ticks`, `output`).
**Every id in every level resolves. No dead ids remain anywhere in the campaign.**

**2. Two `costs` overrides the reference page contradicts — CONFIRMED, and there are three.**
`DocsPanel.tsx:230` renders `costLabel(fn.cost)`, the flat `cost` from `api-spec`, with no access
to `level.costs`. So on these levels the reference page states the wrong price:

| Level | Override | `api-spec` says | Reference page is |
|---|---|---|---|
| `w7-02` | `costs: { spawn: SPAWN_COST }` → `spawn: 2` | `spawn: 5` | 2.5× too expensive |
| `w7-04` | `costs: { use: 1 }` | `use: 2` | 2× too expensive |
| **`w8-05`** | `costs: { use: 1 }` (`w8-05.ts:700`) | `use: 2` | 2× too expensive |

`w8-05` was not on the FIX-PROSE list and matters most of the three: it is the finale, `use` is the
*only* way to work a manual station, and a player budgeting the shift against a doubled price will
believe the deadline is out of reach. The fix belongs in `src/ui` — `DocsPanel` needs the level's
`costs` — and is therefore the viewport agent's file, not this change's.

**3. `w8-05`'s 16000-vs-3000 mismatch — CONFIRMED, and it is dead config rather than a
contradiction the player can see.** Measured on all three seeds:

| | value |
|---|---|
| `par.ticks` | 1050 |
| `deadline` objective | **3000 on seed 1, 4, and 7** — `deadlineFor()` is `max(SHIFT_FLOOR, …)` and the formula never clears the 3000 floor on any shipped instance, so the "per seed" deadline is in practice a constant |
| `budget.maxTicks` | 16000 |

`maxTicks` is 5.3× the deadline and 15× par, so it can never bite first: any run long enough to
reach it failed the `deadline` objective five thousand ticks earlier. It is not a *displayed*
contradiction — FIX-PROSE's rail change stands the "shift ends at N" row down whenever an objective
already grades ticks, so `w8-05` shows 3000 and only 3000. What it costs is time: a runaway program
grinds to 16000 before `HaltError` stops it, for a verdict that was already decided. Lowering
`budget.maxTicks` to something just above the deadline would change no correct solution's score,
but `budget` is difficulty surface and `src/levels/**` belongs to the par agent, so it is theirs to
rule on, not this change's to move.

---

## Changes for the orchestrator to apply

Everything below is in a file this change does not own. Nothing here is required for the fix to
work — the fix ships and passes without them — but two brief fact rows now state the old behaviour
and are, as written, wrong.

**`src/levels/world-8/w8-03.ts:265`** — the fact row promises a `false` that no longer happens:

```diff
-        'Every station publishes `vars.manual: 1`. `power()` returns false on them and still charges you. Somebody has to stand there.',
+        'Every station publishes `vars.manual: 1`. `power()` will not reach them — somebody has to stand there and `use()` it.',
```

**`src/levels/world-8/w8-05.ts:636`** — same, for the stations and the airlock:

```diff
-        'Stations and the airlock publish `vars.manual: 1`. `power()` returns false on them and still charges you. Only a `use()` at the tile moves them.',
+        'Stations and the airlock publish `vars.manual: 1`. `power()` will not reach them. Only a `use()` at the tile moves them.',
```

Both replacements were checked against the current build rather than against the brief: the engine
does now stop the run and does now name the machine and its tile, and `probe(id).vars.manual` does
read `1` on exactly the machines described. Neither line claims anything about what the UI displays
— that was the failure mode of `w8-05`'s previous brief.

**Optional, and the better version of both.** With the engine speaking at the moment it bites,
these two rows are now *telling* the player something the game will teach them
(`docs/PLAYTEST-BEGINNER.md` §9 — three tellings before one good failure is what killed `w1-03`'s
best moment). `docs/FIX-PROSE.md` kept them explicitly *because* the failure was mute, and recorded
that reason. That condition is gone, so **both rows could be deleted outright** and the levels would
teach the distinction the way `w8-03` and `w8-05` were built to. This is a content call, not an
engine one; it is the par/content owner's to make. The conservative rewrites above are offered so
that doing nothing still leaves true prose on screen.
