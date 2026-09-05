# FIX-DIVERGENCE — every objective can say where the run went wrong

`docs/AUDIT-INCENTIVES.md` finding 1: 31 of 34 work orders could report only the string `not met`,
so the *read* step of run → fail → read → revise was empty and the loop degraded to guessing.
Written as the work happened; each section was appended when its unit finished.

---

## 1. The mechanism

Three pieces, all in `src/engine/objectives.ts`.

### `Objectives.custom` gains a required report

```ts
export interface CustomReport {
  progress?(ctx: ObjectiveContext): [number, number];
  divergence(ctx: ObjectiveContext): Divergence | undefined;
}
```

`custom(id, label, fn, report)` is the shape every call site converts to. `divergence` is
required; `progress` is not. **The asymmetry is the whole change.** A count answers "how far off";
only a divergence answers "off where", and a level that ran the comparison already holds the answer
to the second. `divergence` may still return `undefined` at runtime for a failure with no single
point — what it may not do is not exist.

The old positional form (`custom(id, label, fn, progress?, divergence?)`) survives as a second
overload while the campaign converts, so the tree stays green and each world lands as its own
commit. It is deleted once the list in §2 empties, at which point the type system asks the question
at every call site on its own.

### `Objectives.checkbox(id, label, fn)`

Sets `binary: true` on the objective and nothing else — no `progress`, no `divergence`. It is a
*positive statement* that the objective asks a question whose only two answers are yes and no, and
whose label already says which one the run gave. It is deliberately not the default, and the test
below caps how many of them the campaign may hold.

### The builders that only counted now name a point

`allTilesAre` (first tile off spec), `tileCount`, `inventoryAtLeast`, `itemsDelivered`,
`machinesAllIn` (the first machine still in the wrong state), `withinTicks`, `withinSenses` and
`withinOps` all gained a `divergence`. `botAt`, `machineState` and `printedSequence` already had
one. So the invariant needs no builder-shaped exemption: **binary, or a divergence. No third
option.**

A progress tuple is explicitly *not* a third option. `0 of 5 — 5 short` is the exact readout
`docs/PLAYTEST-BEGINNER.md` §3 lost fifty-five minutes to.

## 2. The test that keeps it

`src/levels/__tests__/legibility.test.ts`, 38 tests. Two instruments:

**Static, four tests.** Every objective in every level's `objectives` and `bonus` is either
`binary` or carries a `divergence` function; none is both; a binary objective carries no progress
tuple either; and no more than `MAX_BINARY` objectives in the whole campaign are binary.

**Empirical, one test per level.** The empty program is driven through each level's first seed and
every objective it misses must come back with a filled-in `{where, expected, received}` whose
fields are non-empty and inside `DIVERGENCE_VALUE_CHARS`. This is the half that catches a
`divergence` that exists and returns `undefined` on the commonest failure there is — and the empty
program is precisely the run the audit measured `not met` on.

`AWAITING_A_DIFF` lists the objectives not yet converted. The assertion is a **subset** check, not
an equality one: an id may leave the list the moment its level converts, but nothing new may ever
join it. That is what makes the guard safe to land before the conversion finishes, and what makes
a partial conversion mergeable.

**Starting inventory, measured rather than estimated** — 98 objectives across 34 levels
(61 required, 37 bonus):

| | count |
|---|---|
| reported a real `Divergence` | 9 |
| progress tuple only | 55 |
| **nothing at all — `not met`** | **34** |

The audit's "only three levels can produce a Divergence" was true when it was written; `w8-03` and
`w8-05` gained theirs from `docs/FIX-POWER.md` the same day. The 55 progress-only ones are the
larger problem by count: they are not silent, but `2 of 3 — 1 short` on a level that knows *which*
one is the same defect wearing a number.

## 3. The two bundled fixes from `docs/FIX-PAR.md` §7

**A — the silver band.** `medalFor` in `src/engine/verdict.ts` now reads
`ticks <= Math.max(parTicks + 1, parTicks * SILVER_FACTOR)`. Behaviour-preserving for every par of
four or more, which is 32 of the 34 levels, so it can only move a medal on `w5-02` and `w6-01` —
which is what it is for. `graded` (DESIGN.md §11 A7) has not been adopted in the code, so the
widening was needed rather than optional.

`src/levels/__tests__/levels.test.ts` kept its list of the two small pars, because the arithmetic
that made the widening necessary is still worth naming and a third arrival is worth knowing about.
What it no longer claims is an unreachable rung: a new test grades the ladder directly instead,
walking every integer from 0 to `2 * par + 4` on every level and asserting all three medals are
awarded somewhere. All 34 pass.

**B — `SILVER_FACTOR`.** It now lives once, `export const SILVER_FACTOR = 1.25` in
`src/engine/verdict.ts`, is re-exported through `src/engine/index.ts`, and `src/game/score.ts`
re-exports the engine's copy rather than declaring its own. `medalFor` reads the constant instead
of an inline literal, so the live number and the named number are the same number. The assertion in
`levels.test.ts` that needed a name for it still has one.

## 4. The content deletions

Three rows of prose the game now says out loud, all of them the "told me" half of
`docs/PLAYTEST-BEGINNER.md` §9.

- **`w8-03.ts` and `w8-05.ts`** — the `power()` fact rows deleted rather than corrected, per the
  orchestrator's ruling. `power()` throws an explained `IllegalActionError` naming the machine and
  its tile, so a fact row explaining what an error message already says is a third telling.
- **`w4-02`'s brief** — Dot's *"what i can tell you is that the tunnels join up"* cut.
  `docs/FIX-PROSE.md` finding 4 made this conditional on a path trail landing; it has landed, and
  `docs/shots/w4-02/naive-tick1601-halted.jpg` shows the naive tunnel-follower painting the closed
  circuit as a solid red ring against bare rock.

  **What the player is left with.** The cut answers the counter-argument that the trail only speaks
  *after* a run, because the warning was never the only pre-run telling. The starter still opens
  with `// NOTE(4470): the tunnel joins back onto itself. more than once` and
  `// NOTE(4470): the junctions all look the same from inside`, in 4470's voice, at the exact place
  the player starts typing. Dot's line was the *third* statement of the same fact and the only one
  the player had no reason to act on yet. What remains of her line — survey's map is a photograph
  of a wiped whiteboard — still says the useful half: there is no map, so make one. The brief drops
  from 44 words to 28.

## 5. World 4 — converted, and the worked example

All 11 objectives across `w4-01`, `w4-02`, `w4-04` and `w4-05`. Two helpers added to
`src/levels/world-4/objectives.ts` because four levels needed the same two shapes: `endedOn`
(the goal tile against where the bot actually stopped) and `died` (the tick, tile and reason).

### `w4-04`'s bonus — what the player now reads

The failing bonus row reads, driving the worst of the six orders on seed 1:

> `(7, 21) → (25, 3) → (13, 21)`  **want** `224 steps`  **got** `448 steps`

`where` is the order the run actually took, recovered from the trace — the player's own output.
`expected` is the cost of the best of the six orders. `received` is the cost of theirs. Both are
*shortest-route* costs, so the comparison isolates the ordering: a player who took the right order
badly is not told they took the wrong one.

**It does not report the best order, and that is deliberate.** The audit proposed reporting both
the order taken and the best order. Six permutations of three stops is the entire content of the
bonus — hint 4 says so outright, *"There are six ways to order three stops. Six is a small enough
number to simply try all of them."* Printing the winning permutation is the answer key, and
`docs/FIX-POWER.md` set the standard that feedback is a diff, not an oracle. The cost is the diff:
it is a number the player could have computed and did not, it proves a better order exists, and it
says by how much. A test asserts `expected` and `received` contain no coordinate at all.

A run that never stood on all three gets a different point, because the ordering question does not
apply yet: `the collection points / want all 3, in some order / got 0 of 3`.

### The rest of World 4

| Objective | `where` | `want` / `got` |
|---|---|---|
| `w4-01/reach-tunnel-end` | `end of run` | the pad's coordinates / where the bot stopped |
| `w4-01/single-pass` | `tick 34 · (9, 7)` | `a tile the bot has not been on` / `stood here at tick 12` |
| `w4-02/reach-vein` | `end of run` | the vein / where the bot stopped |
| `w4-02/mark-budget` | `marks placed` | `fewer than 180` / `412` |
| `w4-04/collect-all` | the first point never reached | `stood on` / `never reached` |
| `w4-04/end-on-lift` | `end of run` | the lift / where the bot stopped |
| `w4-05/end-on-lift` | `end of run` | the lift / where the bot stopped |
| `w4-05/bot-recovered` | `tick 210 · (14, 9)` | `the bot still running` / the `die` event's own reason |
| `w4-05/fuel-reserve` | `fuel burned` | `96 of 120` / `118 of 120` |

`w4-05/ore-quota` already reports one: it is `Objectives.inventoryAtLeast`, which gained a
divergence with the other builders.

**Every goal in World 4 is randomized per seed**, which is why the coordinate pair matters more
here than anywhere: `not met` hid two different mistakes that look identical in the editor — a
route that stopped short, and a route that went to the wrong chamber. `w4-01/single-pass` reports
real ticks off the `move` events rather than a visit index, because a `where` that says "tick" and
means "the fourth tile" is worse than no `where`.

`src/levels/world-4/__tests__/divergence.test.ts`, 8 tests. Nothing in `w4-*` changed *what* an
objective checks — only what it says when it fails — and the four reference solutions pass
unedited.

## 6. `docs/FIX-REWARDS.md` §3 — tier 5's threshold

`min: 93 → 100` applied in `src/game/score.ts`. **FIX-REWARDS was wrong that no test depends on
it**: it checked `src/ui/screens/__tests__/review.test.ts` and missed
`src/game/__tests__/score.test.ts`, whose boundary test asserted `reviewTier(93).grade` is
`RETAINED`. That assertion now reads `99.9 → EXCEPTIONAL`, `100 → RETAINED`.

**The paired text change was not made.** Tier 5's body in `score.ts` is annotated *"verbatim from
NARRATIVE.md §7"*, and `docs/NARRATIVE.md` belongs to another agent, so changing the string here
would break the one invariant that keeps the two in step. `'Every work order on this site'` still
needs to become `'issued to you'` in **both** files, together.
