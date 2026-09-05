# A level may be ungraded

Working file for DESIGN.md §11 A7. Appended to per unit of work, in order.

## 1. Survey — every place a medal is assumed

`Medal`, `MEDAL_WEIGHT`, `SILVER_FACTOR` and `medalFor` live in `src/engine/verdict.ts`, which this
work does not own. So "ungraded" is **not** a fifth `Medal` value. It is `Medal | null`, minted
outside the engine, and `null` means *this work order carries no medal at all* — which is a
different fact from `Medal.None`, *this work order carries no medal yet*. Every site below had to
be sorted into one of those two.

| Site | What it assumed | Where it lands |
|---|---|---|
| `LevelDef` (`src/levels/types.ts`) | every level has `par`, and par is a ladder | gains `graded?: boolean`, default `true` |
| `store.applyResponse` | `medalFor(passed, ticks, par)` is the result | `medalForLevel` returns `null` on an ungraded level |
| `store.recordResult` | writes `medal` into the save | writes `Medal.None`; the save never records a medal for an ungraded level |
| `store.recordResult` → `worldMedals` | `medal !== None` means "closed" | replaced by `worldResults: {medal, closed}[]` |
| `achievements.within-budget` | gold on any order | `medal === Medal.Gold`; `null` never matches. No payout |
| `achievements.outside-tolerance` | ticks < par/2 | gated on `medal !== null`. **This was a live silent payout**: `w6-01` has par 1 and the only solution costs 0, so every close would have awarded it |
| `achievements.sector-nominal` | every medal in the world `!== None` | every result in the world `closed`. Would otherwise have become unattainable in worlds 1, 5 and 6 |
| `achievements.sector-gold` | every medal in the world `=== Gold` | every result `Gold` **or** ungraded-and-closed. Would otherwise have become unattainable in worlds 1, 5 and 6 |
| `save.rescueLevels` | a stored `medal` string is authoritative | dropped on read when the level is ungraded, exactly as the retired char-count field is |
| `save.MIGRATIONS[1]` → `reconstructAchievements` | reads medals out of a v1 save | reads them through `rescueLevels`, so it inherits the drop for free |
| `score.levelPoints` | `MEDAL_WEIGHT[medal]` | `null` weighs a gold's 3 (A7) |
| `ui/screens/review.reportFor` | `medal === None` → skip | **already correct, verified by test** — see below |
| `ui/panels/ObjectiveRail` | `ticks / par` with good/over colouring | par is not rendered as a target on an ungraded level |
| `meta/profile.projectSavings` | a cheaper subroutine upgrades a medal | ungraded callers are excluded from upgrades and from `bestProjection`'s thresholds |
| `meta/regression` | `medalFor` on every closed order | `RegressionTarget.graded` gates it |
| `ui/screens/LevelSelect` | counts, per-world totals, `ALL AT PAR` | **not owned** — diff at the end |
| `ui/screens/Results` | `MedalBadge`, `successLine`, points cell | **not owned** — diff at the end |

The six, from `docs/FIX-PAR.md` §1–§2: `w1-01`, `w1-03`, `w5-02`, `w6-01`, `w6-03`, `w6-05`.

## 2. The core landed — levels, score, save, store, commendations

`graded: false` on the six, `graded?: boolean` on `LevelDef`, `levelIsGraded(id)` on the levels
barrel, and in `src/game/score.ts` the four functions the rest of the game reads a medal through:
`isGraded`, `medalForLevel`, `medalOf`, `progressPoints`. `levelPoints` now takes `Medal | null`
and weighs `null` as a gold's three.

**No par, threshold, budget, tick cost, objective or bonus moved.** `w1-01` keeps its
`withinTicks(90)` objective, which is a hard requirement rather than a ladder rung and is not what
A7 is about. `w6-01`'s par stays 1. The 86 reference-solution tests were not edited and pass.

### The one silent payout that was already live

`outside-tolerance` — "Close a work order in under half its tick budget" — fires on
`ticks < par × 0.5`. `w6-01` has `par.ticks: 1` *because the registry test requires a positive par*
and its only solution costs 0 ticks, so `0 < 0.5` held on every single close. Every player was
being congratulated for restraint on the one level in the game where no other number was
available. It is now gated on `medal !== null`.

### The two that would have silently broken

`sector-nominal` and `sector-gold` both read `medal !== Medal.None` as "closed". On an ungraded
level that is false, and both commendations would have become **unattainable in worlds 1, 5 and
6** — a requirement printed in the public list and then quietly made impossible, which rule 2 of
that file's own header forbids. `RunFacts.worldMedals: Medal[]` is replaced by
`worldResults: { medal: Medal | null; closed: boolean }[]`; closure is read as closure, and an
ungraded close satisfies the gold sweep because A7 makes it worth a gold. `sector-gold`'s
requirement line is updated to say so.

### Test-count accounting so far

Baseline 1624 across 64 files. Now **1628 across 64**: four new cases in
`src/game/__tests__/achievements.test.ts` (ungraded closes a sector, an ungraded order on the
bench does not, no gold and no half-budget payout on an ungraded order, and `revised-downward`
still fires there).

Eight existing `save.test.ts` cases failed on the first run and every one of them was a fixture
using `w1-01` or `w1-03` as a stand-in for "some level with a medal". They now use `w1-05` and
`w2-01`, which still have one. **No assertion was weakened** — the medal-drop behaviour those
tests tripped over is the behaviour, and it gets its own fixture test rather than being asserted
by accident in a test about withdrawn work orders.

## 3. The meta layer — the Refactor screen was about to reinstate the ladder

`src/meta` grades independently of the campaign: `regression.ts` recomputes a medal from ticks on
every re-run, and `profile.ts` turns the gap to a threshold into the Refactor screen's headline —
*"make it two ticks cheaper and three work orders go silver to gold"*. On an ungraded level that
sentence is false twice over: there is no silver and no gold, and the saving is not available to
any correct program.

- `RegressionTarget.graded` and `LevelFacts.graded` (both optional, defaulting to `true`, so no
  existing fixture moved). `src/ui/library.ts` populates both from the level definition.
- `regression.ts` routes all three `medalFor` calls through one `medalAfter`, which returns
  `Medal.None` for an ungraded target. An ungraded order can still be reported **broken**,
  **degraded** or **improved** — those come from ticks, and the ticks are real. It just cannot
  change medal, having never had one.
- `RegressionReport.tsx` prints `before → after` only when the two differ, so an ungraded row
  falls silent on its own. No change needed there.
- `profile.ts` excludes ungraded callers from `projectSavings`' upgrades and from the thresholds
  `bestProjection` picks its target out of. Their ticks still show — that screen's job is telling
  the player where their time goes, and A7 does not make an ungraded level's time uninteresting.

## 4. Verified in the browser

Dev server on `:5199` in this worktree, save seeded through `localStorage`, driven in Chrome.
Per `docs/FIX-VIEWPORT.md` §4, measurements were taken *after* a screenshot, never before.

Two work orders, **both finishing at exactly 78 ticks**, which is what makes the pair worth
running rather than reasoning about:

| | `w1-01` (ungraded, par 78) | `w1-05` (graded, par 50) |
|---|---|---|
| objective rail, `TARGETS` | `ticks    78` | `ticks    78 / 50`, in over-budget amber |
| the level's own tick objective | `78 / 90 ticks`, bar drawn, unchanged | n/a |

The ungraded rail reports the clock; the graded rail grades it. That is the whole of A7 in two
lines, and it is the one player-facing surface this work owns.

**Three things the browser found that reading could not**, all in files this work does not own,
all detailed in the handover below: the site map paying an ungraded close **0 points**, the
top bar drawing `78 / 78`, and — pulled from the real accessibility tree rather than inferred
from the DOM — a closed ungraded order announced to a screen reader as
`"Work order w1-01, Cold Start. Closed. no medal."`, which is the *identical* medal phrasing an
**unclosed** `w1-05` gets: `"Open. no medal."` That is precisely the confusion A7 forbids, and it
is currently audible before it is visible.

## 5. Checks

- `npx tsc --noEmit` clean. `npm run build` clean. `npx eslint src` — exactly the one pre-existing
  `rules-of-hooks` false positive at `src/levels/world-5/__solutions__/w5-01.ts:32`, left alone.
- `npx vitest run` — **1653 passing across 65 files**. Baseline was 1624 across 64. The 29 new
  cases are 25 in the new `src/game/__tests__/ungraded.test.ts` and 4 in `achievements.test.ts`;
  the new file is the +1.
- The 86 reference-solution tests were not edited and pass.
- `src/levels/__tests__/legibility.test.ts` passes untouched. Ungrading does not interact with the
  divergence guard: `graded` changes how a *result* is presented, and a divergence is something an
  *objective* reports. Every objective on all six levels is unchanged.
- **On flakiness, honestly:** two full-suite runs during this session reported 1–2 failures with
  wildly inflated timings (`tests 223s` against a normal `13s`). Neither reproduced in isolation
  or on the next run, and the suite is green on a quiet box. Three other agents were running
  builds, test suites and a browser on this machine throughout. Treat those as contention, not as
  a result — but re-run before trusting this line.

## Changes for the orchestrator to apply

Four files, none owned by this work. Everything below is verified against the running app, not
inferred. `isGraded`, `medalOf`, `medalForLevel` and `progressPoints` are exported from
`src/game/score.ts` and are all that is needed.

### `src/ui/screens/review.ts` — no change needed

The brief asked this to be verified rather than trusted, so it was, by test rather than by
reading: `reportFor` skips on `progress.medal === Medal.None` before touching `points`,
`maxPoints` or `closed`, and the store now guarantees an ungraded level never records anything
else. Four cases in `src/game/__tests__/ungraded.test.ts` pin it — an ungraded close contributes
to neither side of the fraction, cannot drag a perfect record below 100%, cannot inflate a weak
one, and still has its bonus stars counted in the stars readout (which is not the yardstick).
**No filter in `reportFor` is required.** The file's own header already anticipated A7 correctly.

### `src/ui/screens/LevelSelect.tsx` — three defects, one of them audible

**1. An ungraded close is worth 0 points.** Measured live: with `w1-01` and `w1-03` both closed,
Boot Sector reads `0/11 pts · 2/3 closed` and the campaign reads `0/139 pts`. It should read
`6/11`. `levelPoints(progress.medal, …)` weighs the stored `none` as zero.

```ts
// worldRows(), the `points` reduce — replace levelPoints(...) with:
const points = levels.reduce(
  (sum, level) => sum + progressPoints(level, progressOf(save, level.id)),
  0,
);
```

`maxPoints` needs no change: `levelMaxPoints(bonusCount)` is already gold-plus-stars, which is
exactly what an ungraded level can reach.

**2. `ALL AT PAR` and the `gold` count.** `gold` counts `medal === Medal.Gold`, so a world holding
an ungraded level can never be `perfect` and its stamp can never read `ALL AT PAR` — unattainable
in worlds 1, 5 and 6, the same defect the sector commendations had. The top-bar aside
`{tally.gold} at par or under` under-reports for the same reason.

```ts
const gold = levels.filter((level) => {
  const progress = progressOf(save, level.id);
  return isGraded(level)
    ? progress.medal === Medal.Gold
    : progress.completed; // no ladder, and a close is worth a gold (§11 A7)
}).length;
```

The `GOLD` / `SILVER` / `BRONZE` columns in the campaign header should keep counting medals only —
those are medal counts and an ungraded level genuinely has none. Only `points` and the
at-par/`ALL AT PAR` reckoning change.

**3. The accessible name says "no medal" on finished work.** From the real accessibility tree:

```
button "Work order w1-01, Cold Start. Closed. no medal. 0 bonus stars."   ← closed, ungraded
button "Work order w1-05, Floor Inspection. Open. no medal. 0 bonus stars." ← not started
```

A closed ungraded order and an untouched one are announced identically. This is the "must not
render as a *missing* medal" requirement, failing in the one place sighted players never see:

```ts
function nodeLabel(node: WorkOrderNode): string {
  // ...
  const medal = medalOf(node.level, node.progress);
  const grade = medal === null ? 'Not graded.' : `${medalWord(medal)}.`;
  return `Work order ${name}. ${state}. ${grade} ${bonus}`;
}
```

The node ring itself is already correct — it draws `node--none`, which is unstyled, so nothing
visual implies a withheld medal.

### `src/ui/screens/Results.tsx` — the close ceremony still awards a gold

Measured live: closing `w1-01` at 78 ticks against par 78 shows a **gold medal badge**, the line
*"At par. Somebody upstairs will assume par was set wrong."*, and a score cell reading
`MEDAL / gold / 3 pts`. Every one of those is the ladder A7 removes.

```ts
const medal = medalForLevel(level, passed, ticks);   // Medal | null, was medalFor(...)
```

Then, at each use:
- `<MedalBadge medal={medal} />` — needs a `null` case. `MedalBadge` is in `src/ui/components/`
  and was left alone deliberately, since changing it alone accomplishes nothing while both its
  callers still pass a `Medal`. Suggest `medal: Medal | null` with `null` rendering the closed
  stamp rather than the `—` glyph, which is what `none` draws.
- `successLine(medal, ticks, par)` in `src/ui/copy.ts` — **held by the mute-verbs agent.** It
  needs an ungraded line that says the work order is closed without grading it. A7's own wording,
  "shows `CLOSED` on a pass", is the brief for that string.
- `audio.medal(medal)` / `renderer().celebrate(...)` — both already special-case `'none'`;
  `null` should take the same `'pass'` path, so the ceremony still fires and still feels like a
  close. **Do not silence it** — ungrading removes the grade, not the reward.
- the score cell — `levelPoints(medal, stars.length)` already returns **3** for `null`, so the
  points line is correct as soon as `medal` is. Only `MEDAL_WORD[medal]` needs a `null` arm.
- the `ON RECORD` cell reads `MEDAL_WORD[progress.medal]` for a previously closed order and will
  say "no medal"; it should say `CLOSED`, via `medalOf(level, progress)`.

### `src/ui/App.tsx` — the top bar draws par as a target

The workspace header renders `{ticks} / {level.par.ticks}` with a `stat__value--over` class past
par. On `w1-01` it reads `78 / 78`. Same treatment as the objective rail: on an ungraded level
show the tick count alone, with no denominator and no over-budget colour.

```tsx
{ticks ?? '—'}
{isGraded(level) ? <span className="stat__par"> / {level.par.ticks}</span> : null}
```

…and drop `stat__value--over` from the className when `!isGraded(level)`.
