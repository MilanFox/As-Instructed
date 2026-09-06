# FIX-FINALE-INTEGRATE — coupling the airlock, a second star, and `w2-05`'s deadline

Three jobs, all three landed. Verification at the end of the work: `npx tsc --noEmit` clean,
`npm run build` clean, `npx eslint src` **1 error, pre-existing**
(`src/levels/world-5/__solutions__/w5-01.ts:32`), `npx vitest run` **1896 passed / 1 failed of
1897, across 90 files** — the one failure is a two-number ratchet in `src/__tests__/`, which is
yours to apply and is written out in §4 below. Nothing is committed.

---

## 1. The airlock draws from the grid

### What was wrong

`docs/PLAYTEST-VETERAN.md` §6.7 gave three specifics for *"accumulates rather than integrates"*.
Two died with `docs/FIX-FINALE.md`. The third was untouched: **the form leg depends on nothing
else.** `FIX-FINALE` itself proposed the repair — *"the airlock draws from the grid, so it will not
cycle until the substation that feeds it is on"* — and then did not make it. The airlock had no
`deps` of any kind.

It was not a small hole. `src/levels/__tests__/naive.ts` → **`formErrandOnly`** is that complaint
written as a program: survey with `look`, lift KD-0001-T off the marked tile, walk to the gate, pay
the nine-stage toll, drop the chip in the registry. It never probes a substation and never throws
a switch. Against the shipped level as it stood it closed `file-form` on **all three seeds in 92,
115 and 146 ticks** — a sixth of the reference's shift for a fifth of the required objectives.

### The mechanism

A new reserved `Machine.vars` key *prefix* in `src/engine/types.ts`:

```ts
export const FED_BY = 'fed:';
```

`vars['fed:<machineId>'] = 1` means *this machine draws from that one*. `Sim.use` refuses to
advance the cycle while the named machine is anything but `on`: it charges the tick, logs the
event with `ok: false`, and returns `false`.

Four decisions inside that, each of which had an alternative:

- **The id rides in the key, not the value.** `vars` holds numbers, and the fact has to ride
  somewhere `probe` publishes, because a door that refuses for a reason the player cannot read
  before they hit it is a trap rather than a rule — the same argument `MANUAL_ONLY` is made of.
  `link()` already writes `link:<toId>` into this map, so a keyed id is not a new shape in the
  engine.
- **`false`, not a throw.** `docs/ENGINE.md` §2's succeed-later test: energise the feeder and the
  identical call works. It joins the bucket `use` already had for a tile with nothing on it.
- **On the door, not on the command.** Same reasoning that kept World 5 working when `power` was
  closed: levels that want a dependency mark the machine. Nothing else in the campaign publishes a
  `fed:` key, so nothing else changes.
- **`use` still costs its tick when refused.** Walking to a gate you have not powered is a mistake
  the shift pays for, which is what makes reading `probe("airlock").vars` first worth doing.

### Which substation

`feederIndex()` in `src/levels/world-8/w8-05.ts` picks **the station furthest down the feeder DAG**,
breaking ties by proximity to the gate.

Not the nearest one, which was the obvious choice and is wrong: on seed 7 the nearest station to the
gate is `sub-9`, three tiles away, **with nothing behind it**. An airlock fed by a root is a form
leg that depends on one switch instead of on the shift, which is the defect rather than the repair.
The deepest station drags its whole ancestry with it, because `precedence` already forbids taking
that ancestry out of order.

| seed | grid | feeder | its depth | feeders it carries |
|---|---|---|---|---|
| 1 | 8 stations, branching | `sub-6` | 2 | 2 |
| 4 | 10 stations, **pure chain** | `sub-9` | 9 | **9 — the whole grid** |
| 7 | 12 stations, branching | `sub-7` | 4 | 4 |

There is a test asserting the chosen feeder has `vars.deps > 0` on every seed, so the rule cannot
silently degrade to a root if the DAG generator changes.

### Proof that it bites — run, not reasoned

`src/levels/__tests__/finale.test.ts` → **`the form leg cannot be run without the grid`**. It builds
`w8-05` twice, differing in nothing but the `fed:` key `build` writes onto the airlock, and drives
the same program through both. A fixture that walks into a wall looks identical to a fixture that
cannot walk; the second world is what makes the difference attributable to the coupling.

| seed | `formErrandOnly`, `fed:` key removed | `formErrandOnly`, shipped |
|---|---|---|
| 1 | `file-form` **met**, 146 ticks | `file-form` **unmet**, door `sealed`, chip in a hold |
| 4 | `file-form` **met**, 92 ticks | `file-form` **unmet**, door `sealed`, chip in a hold |
| 7 | `file-form` **met**, 115 ticks | `file-form` **unmet**, door `sealed`, chip in a hold |

The chip ending in a hold rather than on the ground is asserted, and it is the part worth having:
the program did the whole errand correctly and the *door* is what refused.

### The reference, and the cost of the coupling

Both halves of the reference — the `Sim` driver and the player-facing `source` — now read the
`fed:` key off the door and hold the errand until the feeder is lit, then re-check the door's state
before believing the toll was paid.

| seed | `Sim` driver, `fed:` key removed | `Sim` driver, shipped | `source` through the runtime | par |
|---|---|---|---|---|
| 1 | 560 | **514** | 636 | 1050 |
| 4 | 806 | **779** | 756 | 1050 |
| 7 | 917 | **894** | 970 | 1050 |

**The coupling cost nothing and gave ticks back** — 46, 27 and 23 of them — so there was nothing to
compensate for and I raised no other leg. The reason is that the reference already interleaved the
errand with the grid, and its opening move used to be eight errand steps that walked the carrier to
a door it could open immediately; it now holds the errand until the feeder is lit and spends those
passes on crates instead. Gold on every seed on both halves, with 80 ticks of headroom on the worst
of them, and `w8-05 passes every seed through the runtime` — the real worker path in
`src/runtime/__tests__/reference-solutions.test.ts` — is green with the rewritten `source`.

### Diagnosis

`file-form`'s divergence used to answer with the chip's address whatever had gone wrong, which on a
run that never got the grid as far as the gate names the symptom and hides the cause. It now leads
with the door when the door is the reason:

```
airlock at (40, 22) · want open — 9 uses, with sub-6 on · got sub-6 is off; the gate took the ticks
```

The brief, the `What opens it` facts row, a new hint and `use`'s page in `api-spec.ts` all say the
rule in the player's own words. The starter's `NOTE(4470)` used to read *"the airlock still runs on
its own clock. it does not care"*, which is now false and says so.

---

## 2. `mind-the-gate`, the second star

Written, because §1 landed. Refused it would have been padding.

**`gate <station> <n>`** — the substation the airlock draws from, and how long the door stood
powered and shut before anybody moved it. Formally, the first successful `use` at the airlock minus
the tick that substation's switch was thrown, both off the log.

Against the five requirements:

- **Report-shaped.** One printed line, in the house style `name-the-hold` established.
- **Earned by the reference on every seed** — `gate sub-6 12`, `gate sub-9 11`, `gate sub-7 4`.
  Asserted through `referenceEarns`, which grades the worst seed.
- **Tick-neutral.** `print`, `probe` and `clock` are free, and the reference's ticks are identical
  with and without the note.
- **Not satisfiable by a program that does nothing.** There is no such interval on a shift where
  nobody moved the gate. A program that only prints `gate sub-0 0` is refused on every seed, and
  there is a test for exactly that.
- **Evidence of a thing done, not absence of a thing done.** It is stronger than that here: on this
  site the gate does not move until the grid reaches it, so the star is **only reachable by a
  program that did the integration.** That is the property that makes it the level's actual idea
  rather than a second chore.

`name-the-hold` grades the grid against its own clock. This grades the *errand* against the grid —
the slack on the join that did not exist until the door needed power — and it is the number a
player who wants a shorter shift attacks, because every tick of it is the ending waiting on a walk
that could have started earlier. Neither end of it survives into the final world: the world knows
the gate is open and the grid is up, and knows nothing whatever about when.

**One question I got wrong first, recorded because the failure mode is general.** The first draft
asked for *how much of the grid was up when the gate first moved*. It measured cleanly and the
reference earned it on every seed — with the answers 8, 10 and 12, which are **exactly the station
counts**, free from `probe("desk").vars.stations`. Choosing the deepest feeder guarantees the whole
grid is up by the time the door can move, so the count was a constant wearing a measurement's
clothes. A bonus whose answer is derivable from the level's own facts row is not a bonus.

Six tests in `src/levels/world-8/__tests__/bonus.test.ts`, including the right figure under the
wrong station, the right station under a wrong figure, and that the two stars do not answer the
same question (dropping the `gate` line leaves `name-the-hold` earned).

---

## 3. `w2-05`'s shift — measured, then set to 62

`docs/CURRICULUM.md` promised *"prioritisation under a hard deadline — you cannot visit everything,
so choose."* Shipped, the shift was 84 and the naive serpentine cost 58–68, so nothing had to be
given up and the choosing only decided the medal. `docs/FIX-CONTENT.md` §4 proposed ~70.

Every number below is `runReference` against the shipped build with `budget.maxTicks` lifted out of
the way, so what is reported is each program's true cost rather than the point it was cut off.

| seed | hopper | reference (two lanes) | naive serpentine | margin at `SHIFT = 62` |
|---|---|---|---|---|
| 1 | 8 | **47** | 58 — passes | 15 |
| 2 | 9 | **52** | 64 — **fails** | 10 |
| 3 | 9 | **52** | 68 — **fails** | 10 |
| 4 | 9 | **55** | 61 — passes | **7** |
| 5 | 9 | **48** | 63 — **fails** | 14 |

### The sweep, run rather than reasoned

Both programs driven through all five seeds at each candidate `maxTicks`:

```
shift 56 | ref 5/5 pass (worst 55) | naive 0/5 pass
shift 57 | ref 5/5                | naive 0/5
shift 58 | ref 5/5                | naive 1/5   (seed 1 only)
shift 60 | ref 5/5                | naive 1/5
shift 62 | ref 5/5                | naive 2/5   (seeds 1 and 4)   <- set here
shift 65 | ref 5/5                | naive 4/5   (all but seed 3)
shift 68 | ref 5/5                | naive 5/5
shift 70 | ref 5/5                | naive 5/5   <- the previously proposed number
shift 84 | ref 5/5                | naive 5/5   <- shipped
```

**~70 was above the serpentine's worst seed (68).** It would have failed nothing on any seed. The
previous agent was right to escalate and its number would not have made the promise true.

### Why 62 and not 57

A level passes only when every seed passes, so the serpentine is defeated as a *solution* at any
shift below 68. Failing it on **every** seed needs 57 or less, and that costs two things that 62
keeps:

- **Margin.** At 57 the reference has **2 ticks in hand on seed 4**. That is not *comfortably*, and
  it is not a bar a player writing an honest lane route could aim at.
- **The medal ladder.** Par is 60. Any shift below 61 puts the whole silver band above the
  deadline, so every passing run golds and par stops discriminating — which is the same defect as
  the one being repaired, moved onto a different number.

62 is the tightest value in its failure class: 61 fails the same three seeds with one tick less
margin, and 63 lets seed 5 back through. Bronze is unreachable now (it needs 76+); silver is the
two ticks between par and the deadline. **That narrowing is a consequence of the decision, not an
accident, and it is the one part of this I would hand back to you** — if a wider silver band
matters more than a serpentine that fails three seeds in five, 65 fails only seed 3 and leaves the
reference 10 ticks.

The promise is now arithmetic rather than advice: a full hopper costs 16–18 of the 62 ticks before
the wheels turn, leaving about 44 tiles of ground affordable against a 72-tile field.

### What moved with it

- `SHIFT` 84 → 62, with the measurement in the constant's own docstring.
- The `The field` facts row names the shift, because a hard deadline the player cannot read is a
  trap. It is on the objective rail too (`ObjectiveRail`'s `hardStop`), which is where I checked it
  before adding the row.
- `levels.test.ts`'s *"serpentining all six rows is correct, and is not gold"* becomes *"runs out
  of shift on most seeds"*, asserting from both sides: at most two seeds close, at least one does,
  the reference golds, and the shift is at least seven ticks above the reference's worst seed.
- `world-2.test.ts`'s footprint test now expects the sweep to be powered down on three seeds and to
  miss the star on the two where it comes home — the half of the old assertion worth keeping, since
  it says the footprint budget is not the deadline wearing a different label.
- `CURRICULUM.md`'s `teaches`, `world`, `naive-fails`, `bonus` and `par` rows for `w2-05`.

Par is unchanged at 60. No other level's par, budget, threshold, medal or bonus was touched, and
`DEFAULT_ART` was not opened.

---

## 4. One edit that is yours — the ratchet

`src/__tests__/unused-exports.test.ts:147`

```ts
const KNOWN_TEST_ONLY: readonly [number, number] = [69, 32];
```

must become `[70, 32]`. One new export, `formErrandOnly` in `src/levels/__tests__/naive.ts`, read
only by `finale.test.ts` — which is what a counter-program is. The second number is unchanged
because the new name lives in a test file, and `KNOWN_DEAD` is unchanged: the draft of the fixture
used `followPath` and would have revived a listed dead export, so it was rewritten onto `follow`
rather than handing you a second edit.

Nothing was deleted, so no registered confession lost its evidence.

---

## 5. Files touched

| file | why |
|---|---|
| `src/engine/types.ts` | `FED_BY` |
| `src/engine/index.ts` | export it |
| `src/engine/sim.ts` | `use` refuses an unfed machine |
| `src/runtime/api-spec.ts` | `use`'s doc says so |
| `src/levels/world-8/w8-05.ts` | the feeder, the coupling, `file-form`'s divergence, `mind-the-gate`, two facts rows, a hint, brief, starter |
| `src/levels/world-8/__solutions__/w8-05.ts` | both halves hold the errand for the grid and file the gate note |
| `src/levels/world-8/__tests__/bonus.test.ts` | six tests for `mind-the-gate` |
| `src/levels/__tests__/finale.test.ts` | the coupling, pinned from both sides |
| `src/levels/__tests__/naive.ts` | `formErrandOnly` |
| `src/levels/__tests__/levels.test.ts` | `w2-05`'s sweep now runs out of shift |
| `src/levels/world-2/w2-05.ts` | `SHIFT` 84 → 62, facts, docstrings |
| `src/levels/world-2/__tests__/world-2.test.ts` | the footprint tests against the new shift |
| `docs/CURRICULUM.md` | `w2-05` and `w8-05` blocks |
