# FIX-BONUS-SEEDS — finding 11, the bonus star graded on one seed

**Ruling implemented: a bonus is a level objective and is graded on the same conjunction as every
other objective — every seed, worst result reported.**

Scope: `src/runtime/**`, `src/game/ports.ts`, `docs/DESIGN-REVIEW-RUBRIC.md`, this file.

---

## 1. The list — which bonuses change status

**Three, out of thirty-seven bonus objectives across the campaign's thirty-four levels.**

| level | bonus | seed 1 | every seed | verdict |
|---|---|---|---|---|
| `w7-02` | `within-ten-percent` | met | **missed on seed 3** | **star withdrawn** |
| `w7-04` | `within-bound` | met | **missed on seed 3** | **star withdrawn** |
| `w8-01` | `audit-tight` | met | **missed on seeds 2, 3 and 4** | **star withdrawn** |

Measured by running each level's own reference solution against every one of its seeds and
evaluating the level's bonus objectives per seed — the same evaluator the runtime now uses. The
full table is in §6; every other bonus reports identically under both gradings.

Two qualifications on that number, and they both push it up rather than down:

- The campaign is **34 levels, not 40** (`LEVELS` in `src/levels/index.ts`: 3 + 4 + 3 + 4 + 5 + 5 +
  5 + 5). Every one of them ships a reference solution, so coverage of the campaign is complete.
- **The reference solution is not the player.** It is one program per level, and it is deliberately
  *not* optimised for the bonus on several levels (`w3-02`'s reference says so in its own comment).
  The three above are the bonuses the *reference* was quietly winning on seed one. A player's
  program overfits differently, and the whole point of the fix is that the class of program which
  wins a star by memorising one layout is now refused it categorically — the survey measures the
  campaign's own solutions, not the size of that class.

There is a fourth, structural change that does not show as a status flip: `withBonus` in
`src/game/store.ts` evaluated bonuses with **no `ops` and no `senses` in the context**. An
`Objectives.withinOps` bonus reads `ctx.ops ?? 0`, so it was **always trivially met**, on every
seed, forever. The runtime now supplies both. No shipped bonus currently uses `withinOps`, so
nothing changes today; the trap is closed.

---

## 2. Does this alter what any existing bonus is *worth*?

**No.** Not one bonus objective's definition, label, threshold or star value is touched. This
change is entirely about *how* the existing predicates are evaluated: previously against one seed's
final world, now against every seed's, with the first miss reported.

For the bonus-and-par agent, the reconciliation rule is therefore simple and one-directional: **any
bonus you write is now a claim about every seed of the level, not about seed one.** A threshold
tuned by eye against seed one will be met less often than it looks. `w7-02`, `w7-04` and `w8-01`
above are exactly that failure mode already in the tree.

---

## 3. What changed, file by file

### `src/runtime/protocol.ts` — `PerSeedResult.bonus`

Added `bonus?: ObjectiveReport[]`, kept apart from `objectives` because a bonus must never move
`passed`. As proposed in FIX-INCENTIVES §E.

### `src/runtime/run-level.ts` — evaluate the bonus per seed

A second pass after `buildVerdict`, for the reason the proposal gives: `buildVerdict` derives
`passed` from every objective it is handed, and a missed bonus is not a failed run.

**Departure from the proposed patch.** The proposal called `buildVerdict` a second time. I used
`evaluateObjectives` directly. Reasons, verified against the real code:

- `ObjectiveContext` (`src/engine/objectives.ts:7`) is `{ world, trace, initialWorld, ops?, senses? }`.
  `spend` and `seeds` — two of the six arguments the proposal passes — are not in it; they only
  ever reach `Verdict.stats`, which is discarded. They were noise.
- A second `buildVerdict` also builds an `unmetMessage` failure for any missed bonus and throws it
  away.
- `evaluateObjectives` is the exact primitive `withBonus` used, so the substitution is behaviour-
  preserving by construction.

I also hoisted `senseTotals(trace)` to a local and passed it to both the verdict and the bonus
context. `buildVerdict` computed it internally already; hoisting it avoids walking the trace twice
and — the reason that matters — guarantees the bonus is graded against the *same* sense counts the
required objectives are.

### `src/runtime/aggregate.ts` — fold the bonus by the same rule

**Departure from the proposed patch.** The proposal added a second, near-identical
`bonusAcrossSeeds` function beside `worstPerObjective`. I generalised `worstPerObjective` to take
the reported list and the per-seed lists instead, and called it twice. Same output; one copy of the
rule rather than two that can drift.

I also used the **reported** run's bonus list as the template rather than `runs[0]`'s. That matches
what `worstPerObjective` already does for required objectives — when a seed failed, the reported
run is that seed — so the two halves of the objective list are now assembled from the same
reference point.

The file's header doc gained a paragraph. `aggregate.ts` documents its folding rules in prose at
the top and the rules changed; leaving it describing required objectives only would have made it
wrong.

### `src/game/ports.ts` — `FakeRunner`

See §4. It grades the bonus and reports it, with a comment stating plainly that it can only report
one seed.

---

## 4. `FakeRunner`, and whether today is the day `withBonus` dies

**What `FakeRunner` actually does**, established before concluding anything: `src/game/ports.ts:150`
takes `submission.seeds[0]`, runs that one seed, and then **fabricates a `PerSeedResult` for every
requested seed out of that single run** (`results: submission.seeds.map(...)`, all carrying the same
`passed`, `ticks`, `ops` and `objectives`). It has never been a multi-seed runner and it does not
claim to be — the class comment says "It is emphatically not the runtime."

So it was never `withBonus` that `FakeRunner` needed; it needed *somebody* to put the bonus rows
into `verdict.objectives`, and `withBonus` was who did it. `FakeRunner` can do it itself, with the
same evaluator, on the one seed it has — which is no worse than what the player saw before, because
before the fix the *real* runner was also grading the bonus on one seed. That is what I did.

**Today is the day.** With `run-level`/`aggregate` fixed and `FakeRunner` fixed, both
implementations of `RunnerPort` put bonus rows in `verdict.objectives`, so `withBonus`'s `missing`
filter is empty on every path and it returns the verdict untouched. It is dead code. The deletion
diff is in §7.

Nothing is in the way. The one thing to be aware of when applying it: `withBonus` is the last
consumer of `reviveTrace` and `replayTo` in `store.ts`, so those imports go with it.

---

## 5. One test outside my scope now fails

`src/levels/__tests__/finale.test.ts:143` — `an idle run banks the objectives it did hold on every
seed`. `src/levels/**` belongs to the bonus-and-par agent; I have not touched it. The diff is in
§7. Everything else is green.

---

## 6. The full survey

Method: for every level in `LEVELS`, run that level's own reference solution against **every** seed
the level declares, and evaluate the level's bonus objectives per seed with `evaluateObjectives` —
the same call the runtime now makes. `old` is what the seed-one grading reported; `new` is what
worst-seed grading reports.

| level | bonus | per-seed, in seed order | old | new |
|---|---|---|---|---|
| `w1-03` | `within-7-canMove` | `n n n` | no | no |
| `w1-05` | `one-move-per-tile` | `n Y n Y Y` | no | no |
| `w2-01` | `no-overshoot` | `Y Y Y Y` | star | star |
| `w2-02` | `no-wasted-fieldwork` | `Y Y Y Y` | star | star |
| `w2-04` | `crop-spoilage` | `n n n Y` | no | no |
| `w2-05` | `tile-footprint` | `Y Y Y Y Y` | star | star |
| `w3-01` | `clean-run` | `Y Y Y` | star | star |
| `w3-02` | `one-depot-at-a-time` | `n n n n` | no | no |
| `w3-04` | `aisle-discipline` | `n n n n` | no | no |
| `w4-01` | `single-pass` | `Y Y Y` | star | star |
| `w4-02` | `mark-budget` | `Y Y Y Y` | star | star |
| `w4-04` | `best-order` | `Y Y Y Y` | star | star |
| `w4-05` | `fuel-reserve` | `Y Y Y Y Y` | star | star |
| `w5-01` | `one-pass` | `Y Y Y` | star | star |
| `w5-02` | `eight-probes` | `Y Y Y Y Y` | star | star |
| `w5-03` | `tight-order` | `Y Y Y Y` | star | star |
| `w5-03` | `within-20-probe` | `Y Y Y Y` | star | star |
| `w5-04` | `largest-idle` | `Y Y Y Y Y` | star | star |
| `w5-05` | `tight` | `Y Y Y Y Y` | star | star |
| `w6-02` | `name-the-fault` | `Y Y Y Y` | star | star |
| `w6-03` | `shorter-encoding` | `Y Y Y Y` | star | star |
| `w6-04` | `straggler` | `Y Y Y Y` | star | star |
| `w6-05` | `repair-blocks` | `Y Y Y Y Y` | star | star |
| `w7-01` | `no-slack` | `Y Y Y` | star | star |
| **`w7-02`** | **`within-ten-percent`** | **`Y Y n Y`** | **star** | **no** |
| `w7-03` | `no-bumps` | `Y Y Y Y` | star | star |
| **`w7-04`** | **`within-bound`** | **`Y Y n Y Y`** | **star** | **no** |
| `w7-05` | `workers-busy` | `n n n n n` | no | no |
| **`w8-01`** | **`audit-tight`** | **`Y n n n`** | **star** | **no** |
| `w8-01` | `within-10-look` | `Y Y Y Y` | star | star |
| `w8-02` | `ship-while-you-look` | `Y Y Y Y Y` | star | star |
| `w8-03` | `tight-shift` | `Y Y Y Y Y` | star | star |
| `w8-03` | `within-26-probe` | `Y Y Y Y Y` | star | star |
| `w8-04` | `no-resurvey` | `Y Y Y Y Y` | star | star |
| `w8-05` | `under-budget` | `Y Y Y` | star | star |
| `w8-05` | `fleet-utilisation` | `n n n` | no | no |
| `w8-05` | `no-blocked-moves` | `Y Y Y` | star | star |

`w1-01` and `w6-01` declare no bonus. Thirty-seven bonus objectives across thirty-two levels;
three change.

**The shape of the change matters more than the count.** All three are *budget* bonuses — within
ten percent of the best makespan, under the bound, tight. A budget bonus is exactly the kind whose
margin varies seed to seed, so it is exactly the kind seed one can flatter. Every predicate bonus
in the campaign (`no-overshoot`, `no-bumps`, `single-pass`, `no-resurvey`) either holds
structurally on every layout or on none, and not one of them moved. That is the finding underneath
the list: **the seed-one grading was specifically softening the numeric bonuses** — the half of the
bonus layer where the number was supposed to be the challenge.

Caveat for the bonus-and-par agent: measured against the level definitions as they stand on `main`
today. It has to be re-measured after its rewrite lands, and those three rows are where to look
first.

---

## 7. Diffs for the orchestrator to route

### 7a. `src/game/store.ts` — delete `withBonus`

**Intent: `withBonus` is dead code and should go.** Both `RunnerPort` implementations now put the
bonus rows into `verdict.objectives` before the store ever sees them, so its `missing` filter is
empty on every path and it returns its argument unchanged. Its own comment asked for exactly this:
"Delete this the day the verdict carries them." The verdict carries them.

Safe on a later commit than the runtime change — that is what the filter buys — but it should not
be left indefinitely: a live `withBonus` would silently re-grade, on one seed, any future bonus the
runtime failed to report.

```diff
-import { Medal, evaluateObjectives, replayTo, reviveTrace, usesFuel } from '../engine/index.ts';
+import { Medal, usesFuel } from '../engine/index.ts';
```

```diff
-/**
- * Bonus objectives are worth a star (DESIGN.md §7) but the worker's verdict currently reports the
- * required objectives only. Evaluating the level's own bonus objectives against the returned
- * trace closes the gap without inventing a second scoring rule — it is the engine's evaluator,
- * run on the world the trace ends in. Delete this the day the verdict carries them.
- */
-function withBonus(level: LevelDef, verdict: Verdict, trace: Trace): Verdict {
-  const bonus = level.bonus ?? [];
-  const reported = new Set(verdict.objectives.map((objective) => objective.id));
-  const missing = bonus.filter((objective) => !reported.has(objective.id));
-  if (missing.length === 0) return verdict;
-  try {
-    const revived = reviveTrace(trace);
-    const context = {
-      world: replayTo(revived, revived.endTick),
-      trace: revived,
-      initialWorld: revived.initialWorld,
-    };
-    return {
-      ...verdict,
-      objectives: [...verdict.objectives, ...evaluateObjectives(missing, context)],
-    };
-  } catch {
-    return verdict;
-  }
-}
-
```

```diff
       function applyResponse(
         levelDef: LevelDef,
         trace: Trace,
-        rawVerdict: Verdict,
+        verdict: Verdict,
         results: PerSeedResult[],
       ): void {
-        const verdict = withBonus(levelDef, rawVerdict, trace);
         const cap = get().save.settings.consoleCap;
```

`levelDef` is still used further down `applyResponse` (`medalForLevel`, `recordResult`), so the
parameter stays. `Trace` is still imported as a type and still used elsewhere.

### 7b. `src/levels/__tests__/finale.test.ts:131` — the one red test

**Intent: `objectivesOnEverySeed` is asked about the required objectives only, so the list it is
compared against has to be the required ones too.** `banked === met` was true only while
`verdict.objectives` held nothing but required objectives. It now also holds the level's bonus
rows, and an idle run on `w8-05` meets two of the three. The test's subject — partial credit for
required work — is untouched.

This is the only red test in the suite. I did not apply it because `src/levels/**` belongs to the
bonus-and-par agent. I applied it locally to verify: with it, the suite is fully green.

```diff
-    const met = response.verdict.objectives.filter((entry) => entry.met).map((entry) => entry.id);
+    /* The verdict carries the level's bonus rows too (`src/runtime/aggregate.ts`), and a bonus is
+       not banked work: `objectivesOnEverySeed` is asked about the required list only. */
+    const required = new Set(level.objectives.map((objective) => objective.id));
+    const met = response.verdict.objectives
+      .filter((entry) => entry.met && required.has(entry.id))
+      .map((entry) => entry.id);
     const missed = response.verdict.objectives
```

A content finding that fell out of it, for the bonus-and-par agent rather than for this diff: **an
idle `print()` on `w8-05` satisfies two of that level's three bonuses.** `under-budget` and
`no-blocked-moves` are both met by a program that never moves. They are unreachable in practice
because the level does not pass, but a bonus a blank program satisfies is not asking for anything.

### 7c. `docs/DESIGN-REVIEW-RUBRIC.md` — the stale "five tiers"

**It is not in that file.** `docs/DESIGN-REVIEW-RUBRIC.md` mentions the Performance Review tiers
twice — lines 381 and 614 — and neither states a count. The stale claim is
`docs/FIX-REWARDS.md:225`: "a memo whose five tiers are the only content the player cannot get
elsewhere". That file is on nobody's do-not-touch list, so I fixed it there, `five` to `four`.
Revert that one word if you would rather route it.

---

## 8. Verification

Run after merging `main` (the discrepancy work: `src/meta/**` + `src/game/store.ts`).

| check | result |
|---|---|
| `npx tsc --noEmit` | clean |
| `npm run build` | clean |
| `npx vitest run` | **1743 / 1744 passed, 76 files** — the single failure is §7b, in a file I do not own |
| `npx eslint src` | clean but for the known `w5-01.ts:32` false positive |

`main` was at 1735 / 75 when I merged; `src/runtime/__tests__/bonus-seeds.test.ts` adds 9 tests in
1 file, giving 1744 / 76.

Both ratchet guards in `src/__tests__/` pass on my change. `PerSeedResult.bonus` is an interface
field rather than a new export, so `unused-exports` has nothing to say about it, and I added no
comment containing `verbatim`, `mirrors` or `authoritative`.

### The proof, in tests

`src/runtime/__tests__/bonus-seeds.test.ts` drives `w3-02`'s real level definition through the real
`runSeed` and the real `aggregate`, with three programs that differ only in when they group the
round by class:

- **grouped on every layout** — every seed meets the bonus; the star is granted.
- **grouped on no layout** — no seed meets it; the star was never there.
- **grouped only when the yard matches seed one** (`crates.length === 8 && depots.size === 4`) —
  seed one meets it and no other seed does. **The star is refused.** That is the hardcoded-route
  program the multi-seed conjunction exists to defeat, and the star was the last reward it could
  still take.

Two further tests pin the things that make this a fix rather than a code path: the reported ticks
and the reported star now come from the same seed, and an unmet bonus still does not cost the run
its pass.

### The proof, in a browser

Dev server on port 5391, my own, started and killed by PID. `w3-02`, the overfit program above in
the editor, Run.

`docs/shots/bonus-seeds/before-w3-02-star-on-seed-one.jpg` — the old grading, reproduced by
reverting only the aggregate's bonus fold so `withBonus` takes over again:

> `TICKS 332 · par 332 · best 332` — `gold` — **`4 pts · 1 star`**
> BONUS OBJECTIVES: met — Finish each depot before you start the next — **3/3**
> "Bonus met. There is no bonus. There is a star."
> SEEDS: seed 1 passed **218** ticks · seed 2 passed **332** · seed 3 passed 245 · seed 4 passed 300

Three numbers on one card that cannot all be true at once: the tick count is seed two's, the bonus
progress `3/3` is seed one's, and the seed table underneath prints both.

`docs/shots/bonus-seeds/after-w3-02-star-refused.jpg` — same program, same four seeds, after the
fix:

> `TICKS 332 · par 332` — `gold` — `3 pts`
> BONUS OBJECTIVES: unmet — Finish each depot before you start the next — **8/3**
> SEEDS: seed 1 passed 218 · seed 2 passed 332 · seed 3 passed 245 · seed 4 passed 300

`332` and `8/3` are both seed two's now. The card agrees with itself, and the star is gone.

Both shots are of the front end as it stands on `main` today, taken before the art-direction
rebuild lands. What they evidence is the data the screen is handed — `verdict.objectives` carrying
a bonus row folded across every seed — and that survives a rebuilt component.

---

## 9. Two things that are not mine to act on

1. **Stars already banked under the old rule are kept.** `LevelProgress.stars` is append-only by
   design — "Bonus objective ids ever met", and DESIGN.md §7.1 says nothing ever comes back off. A
   save that took `w7-02`'s or `w8-01`'s star on seed one keeps it. There is no shipped save, so
   this costs nothing today. If a migration is ever wanted it belongs to whoever owns
   `src/game/save.ts`, and it would be a deliberate decision to break the never-comes-off rule
   rather than a bug fix.

2. **`w8-05`'s idle-satisfiable bonuses**, in §7b. Content, not runtime.
