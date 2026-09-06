# FIX-RAIL-METER — the rail reads the objective the report reads

`docs/FIX-UI-COVERAGE.md` reported a real bug and did not patch it: the objective rail threw away an
objective's declared `meter` and `unit` and re-derived them from the label, so DESIGN.md §11 A13 —
*"`meterFor` / `budgetFor` prefer a declaration over the label"* — was not in force on the rail at
all. This is that fix, the agreement test that pins it, and two pieces of test-suite maintenance
that came with it.

Written incrementally as each piece landed.

---

## 1. The fix — `src/ui/panels/ObjectiveRail.tsx`

Applied as `docs/FIX-UI-COVERAGE.md` wrote it, after checking it against the source. Three lines:
`ObjectiveRow` gains `meter?` and `unit?`, the row literal carries `objective.meter` /
`objective.unit` where the objective declared them, and `Meter` joins the existing
`import type { Budget }`.

The row is built from the **level definition**, not from the verdict's copy — which is the right
source, because the rail is live during playback and there is no verdict yet at tick 40.
`evaluateObjectives` copies the same two fields onto `ObjectiveReport`, so the two call sites now
read one declaration.

`npx tsc --noEmit` clean.

---

## 2. The agreement test — `src/ui/__tests__/rail-report-agreement.test.ts`

4 tests. The coverage agent declined to write this one because the honest version was red; it is
red no longer, and it was watched go red first.

**It asserts the campaign, not the three known cases.** Two sweeps over `campaignOrder()`, each
driving every work order through `runLevel` — the same build/drive/grade path the worker takes —
and grading the bonuses in the second pass `src/game/ports.ts` makes. The store then holds a verdict
the game could really have produced, the playhead sits at `trace.endTick` where the rail is when the
report opens over it, and both components are rendered from that one state. Per objective, four
things are compared: gauge or tick-box, over or not, the `limit` tag, and the readout itself.
Nothing in the file names a level, a number or a unit — both sides are read off the same render.

The two run shapes are chosen, not arbitrary:

- **A program that does nothing** — what a first Run does on an unsolved level. It is the state
  where a declared budget is *neither underspent nor overrun*, which are the only two shapes
  `budgetFor` can recognise without a declaration.
- **The reference solution** — a real pass, which reaches the shapes an idle run cannot: a budget
  met with its progress exactly full.

### Red against the unfixed rail

Checked out `HEAD`'s `ObjectiveRail.tsx` under the finished test: **3 of 4 red.**

| sweep | what disagreed |
| --- | --- |
| did-nothing | `w8-03 within-shift` and `w8-05 deadline` — report `0 / 160 ticks` with the `LIMIT` tag, rail `0 / 160` with neither |
| reference | `w5-02 eight-probes` — report `8 / 8 probes` as a gauge, rail `8 / 8` as a tick-box |

**The sweep found more than was reported.** `docs/FIX-UI-COVERAGE.md` measured three disagreements
against a synthetic empty source; against real runs the reachable set is different and larger.
`w8-03` and `w8-05` are the two `Objectives.custom` budgets that `docs/FIX-PAR-REPAIRS.md` §4
converted to declared meters — and, having declared, **dropped the `…, in ticks` tail they were only
carrying to feed the parser.** That is A13's promised freedom taken, and it is exactly the trap: the
rail lost the unit *and* the `LIMIT` tag on the two levels that took it, on the ordinary first run of
a level nobody has solved yet. The three cases in the report were the symptom; this was the cost
already being paid.

The fourth test — that the two screens do not agree by drawing no gauge at all — passes both ways,
and is stated here rather than hidden. It pins that objectives with minted ids were always gauges, so
"they agree" cannot become true by everything going blank. It could not have failed against the old
code and it is not a regression test; it is the floor under the other three.

---

## 3. Unblocking Monaco under node (job 3)

**The diff in `docs/FIX-UI-COVERAGE.md` does not work, and it says so itself — it was never run.**
`resolve.mainFields` configures vite's *client* environment. Vitest resolves through the **SSR**
environment, which has its own `resolve` and its own defaults, so the setting landed on the wrong
side of the wall and `Failed to resolve entry for package "monaco-editor"` was unchanged. Measured
both ways before believing either.

What works is the same idea one level down:

```diff
 export default defineConfig({
+  ssr: {
+    resolve: {
+      mainFields: ['module', 'main'],
+    },
+  },
   test: {
```

**One correction to the report's account of the wall.** On vitest 3.2.7 a file whose entire body is
`vi.mock('monaco-editor', () => ({}))` **collects fine** — the mock registry never resolves a
specifier nothing imports. The wall is real one step further in: the failure comes when a module
that *imports* `monaco-editor` is loaded, which is what any test of `monaco-setup.ts` has to do.

### What it cost

**Nothing.** Full suite green, `npm run build` clean, `npx tsc --noEmit` clean, `npx eslint src`
clean but for the known `w5-01.ts:32` false positive. It cannot reach the build at all:
`npm run build` reads `vite.config.ts`, and this is `vitest.config.ts`. It cannot reach the browser
either — the field only chooses which entry a node-side resolver picks.

### What it bought — `src/ui/__tests__/typescript-registration.test.ts`

5 tests, against a fake Monaco whose `getTypeScriptWorker()` rejects with the **bare string**
`'TypeScript not registered!'`, as the real one does, and whose `createModel` throws on a second
model at one URI, as the real one does.

- The wait does not finish while the service is still rejecting, and the whole event order is read
  off one log: `create typescript` → `ask` → … → `dispose`.
- The bare-string rejection never escapes as a rejection of its own.
- A **`typescript`** model is created before the first ask and disposed after the last. Polling
  *without* asking for the language would sit out the whole budget and then give up, which is the
  same silent failure with a longer fuse.
- One model and one wait however many callers — StrictMode mounts twice and three subsystems call
  `ready()`.
- The budget expires rather than hanging: 100 asks, one `console.error`, model disposed.

**Mutation-checked rather than asserted to be meaningful.** Three defects were introduced into
`monaco-setup.ts` one at a time and the file was watched go red for each, then the source restored
byte for byte:

| defect | red |
| --- | --- |
| `registration ??=` → `registration =` (no memo) | 1 |
| the warm-up model replaced by a bare `{ dispose() {} }` | 2 |
| `model.dispose()` dropped from the `finally` | 3 |

`src/meta/ui/LibraryEditor.tsx` is now loadable under node too, by the same change. Not covered
here — it is a component, and the coverage owed to it is a different job from this one.

---

## 4. One driver, four files (job 4)

`src/ui/__tests__/react-driver.ts` is new and holds the hand-cranked React. The four copies in
`modal-dismissal`, `library-usage`, `limit-and-par` and `medal-key` are gone; each file now carries
an aliased import and its own two `vi.mock` registrations, which cannot move (`vi.mock` is hoisted
per test file).

**Nothing was weakened.** Diffing the four copies, they were byte-identical but for one hook: three
had a `useState` setter taking a value, `modal-dismissal`'s took a value *or* an updater function.
The shared module is that superset, so no file lost a semantic and one gained the updater path it
was not using. `Object.is` dependency comparison, slot ordering and the never-flushed effects are
unchanged.

**`modal-boundary.test.ts` was not touched and does not share it.** Its driver is a different
instrument — classes, `getDerivedStateFromError`, `componentDidCatch`, `setState`,
render-until-stable, and no hooks at all — and its first test is the fidelity floor: *a throw in a
modal without a boundary takes the whole screen*. That test only means anything if errors propagate
out of the root render. Nothing in the hooks driver could carry it, and merging the two would have
put an error path into a driver whose other four callers never take one. Two drivers that do two
jobs is not the duplication the ratchet is for.

**`src/meta/__tests__/publish-dialog.test.ts` still carries its own**, and that is a scope
boundary rather than a judgement: it is not a file I own. Its copy is a strict superset again —
it queues effects, tracks a dirty flag and exposes `renderUntilStable`, which is the instrument its
whole argument rests on. Folding it in would mean either exporting a fifth-wheel `renderUntilStable`
that four files never call, or giving the shared driver effect semantics the four files rely on
*not* having. If the orchestrator wants it shared, the honest shape is a second export beside this
one, not a widened first.

`KNOWN_TEST_ONLY` moved `[69, 32]` → `[70, 32]`: one new export (`reactDriver`), read only by
tests. That is the only edit made anywhere in `src/__tests__/`, and the run before the bump printed
exactly `[70, 32]`, so the number is measured rather than guessed.

**Left duplicated on purpose, and named so it is not mistaken for an oversight.** `medal-key`'s
tree walk and the one in the new agreement test are structurally similar and are not the same
function: `medal-key` keeps every node and its marks so it can ask whether a key sample shares a
class with a board node; the agreement walk collapses a row to the four things two screens both
claim. Hoisting both into one walker would mean exporting a `Node` shape and three helpers — four
more names on the test-only count — to share twenty lines that answer different questions. The
driver was worth it because all four copies were byte-identical and it is the instrument, not the
question.

---

## 5. In a real browser

`w5-02`, driven by a program that spends exactly eight probes and never patches — the shape that
reaches the reported defect, because the bonus is then met with its progress exactly full:

| | before | now |
| --- | --- | --- |
| report | `8 / 8 probes`, gauge | `8 / 8 probes`, gauge |
| rail | `8/8`, tick-box | `8 / 8 probes`, gauge |

`docs/shots/rail-meter/w5-02-rail.jpg`, `w5-02-report.jpg`.

And `w8-03` — the case the sweep found and the report did not — on its own starter program:

| | before | now |
| --- | --- | --- |
| report | `LIMIT  0 / 160 ticks` | `LIMIT  0 / 160 ticks` |
| rail | `0 / 160` | `LIMIT  0 / 160 ticks` |

`docs/shots/rail-meter/w8-03-rail-limit.jpg`, `w8-03-report-limit.jpg`. This is the one that matters
for the next author: `w8-03` and `w8-05` declared their meters last week and dropped the
`…, in ticks` tail they had only been carrying to feed the parser, exactly as A13 invites. The rail
lost the unit *and* the `LIMIT` tag for it, on the first run of a level nobody has solved yet.

No console errors on either run.

---

## Verification

`npx tsc --noEmit` clean · `npm run build` clean · `npx eslint src` clean but for the known
pre-existing false positive at `src/levels/world-5/__solutions__/w5-01.ts:32` · `npx vitest run`
**90 files, 1904 tests, green** (baseline 88 / 1895; +2 files, +9 tests). Both ratchets in
`src/__tests__` pass, one of them at a bumped constant.

Prettier: the repo is not prettier-clean and was not before — 59 files fail on `main`. Every file
touched here was formatted, so that number did not move.
