# Par repairs — `w8-04`, `w8-03`, `w5-01`, and the `CustomReport` meter

Source material: `docs/FIX-PAR-3-8.md` (measurements) and `docs/FIX-BONUSES.md` (the handback).
Nothing here re-measures what those two already measured; every number below is a *new* run against
changed content.

---

## 1. `w8-04` — the cipher is the cheap route now

**Verdict: the intended route wins, and it wins on every seed.** Par 223 → **116**.

| program | seed 1 | 2 | 3 | 4 | 5 | worst | medal at par 116 |
|---|---:|---:|---:|---:|---:|---:|---|
| reference (decode, drive the plan, repair the falls) | 83 | 97 | 104 | 116 | 100 | **116** | **gold** |
| `frontierScavenger` — never receives, walks the frontier until the form is in view | 261 | 173 | 204 | 274 | 290 | **290** | **bronze** |
| `lockerCanvasser` — never receives, `probe`s every locker id, walks the list | 121 | 99 | 228 | 358 | 250 | **358** | **bronze** |

Before the repair those three rows read 101–223 for the reference and **5–65** for the scavenger:
gold with 158 ticks to spare, on every seed.

### What was actually wrong, and it was not the par

`FIX-PAR-3-8.md` §8b blamed free sensing. Free sensing is real (§6.4) but it was not the mechanism.
The mechanism was in `build`:

```
if (tileAt(world, at)?.terrain === Terrain.Floor) break;   // the old "old workings"
```

Fourteen stubs were driven off random route tiles and **stopped one tile short of any corridor they
ran into** — which leaves the stub's last tile *adjacent* to that corridor, i.e. joined to it. The
comment above them read *"they do not go anywhere, which is the point."* They went somewhere. They
were short cuts between legs of a route whose whole job was to wander, and they were what made the
locker five ticks from the lift on seed 3 while the filed plan cost 205.

So the plan was not being ignored because sensing is free. It was being ignored because **the plan
was the long way round.**

### The repair

**Every corridor on the site is now an induced path** (`clearOf`): two floor tiles are neighbours
only where they are consecutive on the same corridor. The route legs are laid under that constraint,
the ways round a fall are checked against it, and the old workings are driven under it too. The
consequence is the whole level:

- The workings are a **tree**. There is exactly one way from the lift to any tile.
- Therefore the filed route **is** the shortest walk to the locker. A program that throws the plan
  away cannot walk *less* than one that keeps it — it can only walk the same ground plus whichever
  dead ends it tried first.
- `build` asserts this rather than hoping for it: `worldDistance(LIFT, locker)` must equal the sum
  of the leg lengths plus six per collapse. Anything cheaper means a working joined two legs, and
  the build throws instead of shipping a free par.

Three supporting changes, each with a reason that is not "make it harder":

- **The old workings wind.** A straight stub is dismissed for nothing by one `look` down it, so a
  straight decoy costs a search zero. Only a corridor that bends can charge the walk in and the walk
  back. `TRUNK_LENGTH` 30, `TRUNK_MINIMUM` 9 — a working that came out shorter than nine tiles is
  reverted rather than left as free-to-dismiss scenery. They are anchored off the **near half** of
  the route first, so the first fork arrives before a search has any grounds to choose on.
- **The route legs stay inside the box; the workings may use the whole site.** The box exists so a
  collapse always has room for a way round it; the decoys never needed it, and holding them to it
  was starving them of ground.
- **Every working ends in a locker.** `probe(id)` reaches any machine anywhere for zero ticks, so a
  single machine called `locker` handed the answer over at tick zero — `lockerCanvasser` is that
  program and it was the *best* off-plan answer until this changed. Now the ids are `locker-0`
  upward in shuffled order, the decoys are marked with signed forms and hold nothing, and the
  coordinates all come back without saying which one the memo means. Canvassing them is now the
  *worst* of the three programs, at 358.

`legs` per seed went 13–16 → 11–12 and `stale` 0/2/3/6/4 → 0/2/3/5/3, because an induced route
packs differently; the drift *shape* (seed 1 perfect, seed 4 heavy) is unchanged, which is what
CURRICULUM.md §10 asks of the set.

### What did not change

Par is still a scalar. The cipher, the checksum, the packet format, the decoys, the section
encoding, the hints and both bonus objectives are untouched — `read-the-plan` was rewritten hours
ago and is settled. `form-recovered`'s *predicate* is untouched; only its label moved, from
`Come back up holding KD-0001-T` to `Finish the shift holding KD-0001-T`, because the run has never
been required to come back up and the label said it was. §8b called that the cheapest fix in the
document; making the label true is the honest half of it, and requiring the return leg would have
doubled every run on the level without separating anything, since the walk home is the same walk
home for both programs.

### Where the proof lives

`src/levels/__tests__/naive.ts` gains `frontierScavenger` and `lockerCanvasser`, next to
`literalPlanFollower`, which is where every other correct-but-lazy program in the campaign lives and
what that file's own header says it is for. **They are not in `__solutions__`** — that directory is
keyed one reference per level id and is loaded by `SOLUTIONS`; a second w8-04 entry there would have
to be excluded by name from three suites. `src/levels/__tests__/levels.test.ts` `par calibration`
pins all three medals and asserts the reference is cheaper *on the worst seed* than either refusal.

One test in `src/levels/world-8/__tests__/divergence.test.ts` was rewritten rather than re-seeded:
it used to get `still in the locker; the bot stood on it` out of the literal plan follower on seed 3,
which was only ever true because the old map let the follower blunder over the locker tile. It now
drives a program that walks the whole way and never reaches for what it is standing on, which is the
bug that branch exists to name.

---

## 2. `w8-03` — it was a seed problem, and the seed is fixed

**Par stays a scalar.** Par 128 → **84**. No per-seed par machinery was built and none is needed.

### Why seed 3's deadline was tight, measured rather than guessed

`deadlineFor` is `(criticalChain + lanes) × (USE_COST + hop) + hop`. Driven per seed:

| seed | layout | `criticalChain` | `lanes` | `hop` | deadline |
|---|---|---:|---:|---:|---:|
| 1 | 14 stations, 4 bots, 4 layers | 4 | 4 | 16 | 160 |
| 2 | 14 stations, 4 bots, **14** layers | 14 | 4 | 17 | 359 |
| 3 | 18 stations, 6 bots, **1** layer | **1** | 3 | 18 | **98** |
| 4 | 20 stations, 8 bots, 4 layers | 4 | 3 | 17 | 150 |
| 5 | 16 stations, 5 bots, 6 layers | 6 | 4 | 17 | 207 |

**The formula is not the defect and neither is the number.** Against the honest-but-unoptimised
program — layer barrier, nearest idle bot, one fleet-wide `sync` per band — the deadline is a
consistent **1.85× to 2.05× on every seed**: 160/80, 359/175, 98/53, 150/81, 207/103. It is
calibrated, and calibrated to the same thing everywhere.

**The defect is `layers: 1` on seed 3, and it is two defects wearing one number.**

1. A grid with no edges has no precedence, so **`precedence-held` is vacuously true on seed 3**. A
   required objective that cannot fail on a seed is a required objective that seed does not test,
   and this is the objective the level exists for.
2. `deadlineFor` is a function of the chain. No chain, so seed 3 drew the shortest shift in the
   set. **The level graded hardest on the one layout that had removed its own idea.**

That is the answer to "why is seed 3 so tight": not because the shift was miscomputed, but because
the seed contained almost no work and the formula correctly said so.

### The fix, and what it does to every number

`LAYOUTS[3].layers` **1 → 3**. Eighteen stations in three bands of six across six bots: still the
flattest, widest grid in the set, so the anti-hardcode axis survives — a program that assumes a
chain still breaks here — but now with something for `precedence-held` to hold.

| | seed 1 | 2 | 3 | 4 | 5 |
|---|---:|---:|---:|---:|---:|
| deadline (was) | 160 | 359 | **98** | 150 | 207 |
| deadline (now) | 160 | 359 | **138** | 150 | 207 |
| reference | 63 | 84 | 55 | 57 | 71 |
| layer-barrier (correct, unoptimised) | 80 | 175 | 62 | 81 | 103 |
| round-robin | 102 | 250 | 80 | **710 — fails** | 179 |

Par is then the reference's worst seed, **84**, which is where every other calibrated par in the
campaign sits and is the number `FIX-PAR-3-8.md` §7.1's own arithmetic points at. The ladder is
whole on every seed for the first time:

- **gold** ≤ 84 — the reference golds on all five.
- **silver** 85–105 (`floor(84 × 1.25)`), and 105 is now **below every seed's deadline**, where it
  used to be 160 against seed 3's 98.
- **bronze** 106 up to the shift: 33, 254, 33, 45 and 102 ticks wide. It used to be **empty on two
  seeds of five and truncated on a third.**

Difficulty moves **up**, not down, and in the two places it should: par tightens 128 → 84, and the
layer-barrier answer that used to gold on four seeds of five now golds on none of them and bronzes
at 175. Round-robin still fails outright on seed 4, so the program the level rejects is still
rejected — it is wrong, not slow, which is what `FIX-PAR-3-8.md` §6.3 recorded and what had to
survive the change.

### The invariant, written down where it can fail

`w8-03 grades and fails on one axis` in `src/levels/world-8/__tests__/divergence.test.ts` asserts,
per seed, that `max(par + 1, floor(par × SILVER_FACTOR))` is strictly below that seed's shift. It is
the general form of the bug: **par is flat, `deadlineFor` is not, and this is the only level in the
campaign where a medal ladder and a failing condition read the same clock.** Any future change to
`deadlineFor`, to a `LAYOUTS` row, or to par has to keep it true, and now finds out at once.

`PAR_TICKS` is named in the level rather than written inline, so the constant the invariant is about
has somewhere to hang its reason — the same shape `w8-01` already uses for `PAR_TICKS` /
`SHIFT_TICKS`, which `FIX-PAR-3-8.md` §4 calls the model.

---

## 3. `w5-01` — par 37 → 32, applied

Straight tuning, exactly as `FIX-PAR-3-8.md` §7 recommended, and the measurement reproduces:

| | seed 1 | seed 2 | seed 3 | worst |
|---|---:|---:|---:|---:|
| reference (`probe` the chain, then walk it once the right way) | 22 | 32 | 27 | **32** |

Gold on every seed at par 32, and the level is solvable before and after — `levels.test.ts` drives
the reference through all three seeds either way. The probe-free answer, which walks to one end,
discovers the reactor is at the other and walks back switching as it goes, costs **37** (§6.2), so
it moves from **gold with the par sitting exactly on it** to **silver**. The level's own hardware
now buys a medal. Difficulty rises.

The level's par comment justified 37 from a program that was not the reference; it now states both
numbers and which program each belongs to.

---

## 4. `CustomReport` — the four-line engine diff, applied, and the guard is empty

`src/engine/objectives.ts` gains `meter?: BudgetMeter` and `unit?: string` on `CustomReport`,
exactly as `docs/FIX-BONUSES.md` wrote it out, and `custom()` forwards both onto the options it
already hands `define`. Nothing else in the engine changed: `define` already preferred
`options.meter` over its own argument, so the whole conversion is one interface and one call site.

Both blocked objectives then converted:

- `w8-03 within-shift` — `meter: { kind: 'ticks' }, unit: 'ticks'`.
- `w8-05 deadline` — the same.

Both **dropped the `…, in ticks` tail** from their labels. That tail existed only to feed the
fallback parser: it is the workaround A13 was written to retire, and leaving it in player-facing
prose after the declaration lands is leaving a comment in the shop window.

`src/game/__tests__/budget-declarations.test.ts`'s `INFERRED_FROM_LABEL` goes **two rows → none**.
The set that still reads its meter out of its own English is now empty, which is the strongest form
this guard has been in: the next objective that counts something and does not say what fails on the
day it is written, rather than the day someone rewords it. The second test in the file, which used
to skip the pinned two, now covers the whole campaign with no exceptions.

`DESIGN.md` §11 A13 is amended in place — it said `Objectives.custom` *cannot* declare a meter and
called that "the gap to close first", which is now false, and a binding document that still
describes a closed gap is the A9 failure mode. The interim rule about keeping labels clear of the
parser's words is retired with the gap; the rule about omitting a wrong `progress()` bar survives,
because it was never about the parser.

---

## Verification

`npx tsc --noEmit` clean. `npm run build` clean. `npx eslint src` clean but for the known
`w5-01.ts:32` false positive. `npx vitest run`: **1831 passed, 2 failed**, and both failures are the
ratchet guards in `src/__tests__/**` that I am not allowed to edit.

### The two ratchet edits I need, exact

**`src/__tests__/unused-exports.test.ts:99`** — delete the line:

```
  'src/levels/world-8/shared.ts worldDistance',
```

`w8-04`'s build-time assertion that the filed route is the shortest walk to the locker reads it, so
it is no longer dead. This is the ratchet firing on a *deletion from the dead list*, which is the
direction you want it to fire in.

**`src/__tests__/unused-exports.test.ts:146`** — the pinned pair:

```
const KNOWN_TEST_ONLY: readonly [number, number] = [67, 32];   // becomes [69, 32]
```

Two new test-only exports, both in `src/levels/__tests__/naive.ts`: `frontierScavenger` and
`lockerCanvasser`, the two off-plan programs `w8-04`'s par is now proved against. The second figure
— the count that lives outside `__tests__`, which the guard's own comment calls the half worth
reading — **does not move**.

### One thing outside my files

`src/game/budgets.ts:164` still says *"`w8-04` allows four steps off-plan"*. `no-resurvey` was the
objective that allowed steps off-plan and it was deleted in the bonus rework, so the sentence now
describes an objective that does not exist. Not my file and not a behaviour change, so it is
reported rather than edited.
