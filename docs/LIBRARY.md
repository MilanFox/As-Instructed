# The Library — Shared Subroutines Repository

The metagame. Unlocks at the end of World 3 (`w3-04`). Everything lives in `src/meta/`, with the
two-file linker and the module-aware error reporting in `src/runtime/`.

**The one rule: the whole system is optional.** A player who never opens the Repository finishes
the campaign with the same medals as one who lives in it. No work order is gated on a library
function; `unlock.ts` holds *hints*, never requirements, and every level named there stays solvable
by writing the same function inside the level.

---

## 1. What it does

1. Solve a work order → optionally publish a declaration into `lib.ts`.
2. Later work orders write `import { pathTo } from 'lib';`.
3. Library code costs **real ticks** wherever it is called — `meterExport` in
   `src/runtime/modules.ts` charges them against the Sim's own clock.
4. Making a library function faster therefore improves every work order that calls it. That is the
   **Cost** tab.
5. Editing the library re-runs every closed work order that imports from it. That is the
   **Regression** tab. A worse result is reported; a medal never moves without an explicit accept.
6. Rarely, a closed work order is re-run on a seed it never saw. That is the **Discrepancies** tab.
7. Subroutines built out of other subroutines are drawn as an indented call tree, with the ticks
   attributed down it. That is the **Structure** tab.

---

## 2. Module resolution

There is no module loader inside `new Function`, so linking is done by **text rewriting**, in
`src/runtime/modules.ts`.

| Step | Function | What it does |
|---|---|---|
| Scan | `findModuleStatements` | Top-level `import`/`export` spans, skipping strings, comments, templates and regexes |
| Library | `stripLibraryExports` | Removes `export` keywords, collects `{ name, local, mutable }` per export |
| Program | `rewriteProgramImports` | `import { a as b } from 'lib'` → `const { a: b } = __lib__;` |
| Link | `linkProgram` | Evaluates the library body, then the program, in two `new Function`s |

**The invariant everything rests on: a rewrite never changes a file's line count.** `export ` is
replaced by spaces of the same width; a multi-line import is replaced by a one-line binding plus
the newlines it consumed. Columns may move; lines never do.

Only `'lib'` resolves. Any other specifier is a `ModuleProblem` carrying the file and line, raised
as a `ModuleError` before a single tick is simulated.

### Line numbers and `//# sourceURL`

Each of the two `new Function` bodies carries a `//# sourceURL=` trailer
(`bootstrap:///program.ts`, `bootstrap:///lib.ts`). That is what makes a stack frame say *which
file* it came from; without it both compile to `<anonymous>` and an error inside `pathTo` is
indistinguishable from one in the level.

Resolving a thrown error is three subtractions, in this order:

1. `parseStackFrames` (`errors.ts`) reads the engine's frames and their source URLs.
2. `toPlayerLine(reported, wrapperOffset)` removes what `new Function` and the wrapper preamble
   added. `wrapperOffset` is **measured** at worker boot by `measureWrapperOffset`, never assumed.
3. `toSourceLine(emitted, lineMap)` (`sourcemap.ts`) maps the emitted line back to the line the
   player is looking at, using the source map TypeScript emitted. This is what survives an erased
   `interface` shifting everything below it.

`resolveModuleLocation` returns the **topmost frame belonging to either player file**, so an error
thrown three functions deep inside the library reports the library line, not the level line that
called in. `moduleStack(..., labelFiles = true)` renders the trimmed stack with file names, which
is what the console shows once a library is linked.

Tests: `src/meta/__tests__/modules.test.ts` → *line numbers across two files*. They throw for real
inside a real `new Function` and read the engine's own stack back; they never assert against a
hand-written stack string.

### Tick attribution

`meterExport` wraps each export and charges `sim.ticks` deltas.

- `usage.ticks` counts only **outermost** library calls, so the library can never report more ticks
  than the level spent in total.
- `usage.calls[name]` counts every call, including nested ones.
- **Intra-library calls are metered too.** The library's footer reassigns each mutable export to
  its wrapper (`step = __meter__("step", step);`), so `sweep()` calling `step()` resolves the
  wrapper at call time. To make that possible for `export const`, `stripLibraryExports` widens
  `const` to `let  ` — same width, same columns, same lines — but only when a meter is present.
  See *Gotchas*.
- Classes are never wrapped: a class wrapped in a function cannot be `new`-ed.

---

## 3. Save data

Own `localStorage` key, own version number:

```
key      bootstrap.library
version  LIBRARY_SAVE_VERSION = 1
```

Separate from `bootstrap.save` on purpose. Nesting it would make every library change a coordinated
migration across two owners, and the first time the two clocks disagreed somebody's `lib.ts` would
be the thing that got dropped.

```ts
interface LibrarySave {
  version: number;
  unlocked: boolean;              // false until w3-04
  briefed: boolean;               // player has read the unlock memo
  source: string;                 // current lib.ts. Sacred.
  revisions: LibraryRevision[];   // newest last, capped at MAX_REVISIONS (40)
  lastKnownGood?: string;         // revision id — the revert target
  published: PublishedFunction[];
  profiles: Record<string, LevelProfile>;   // measured, per work order
  cache: Record<string, CachedRun>;         // capped at MAX_CACHE_ENTRIES (400)
  discrepancies: Discrepancy[];
  publishDeclined: string[];
  publishMuted: boolean;
  discrepanciesMuted: boolean;
  updatedAt: number;
}
```

**Migration rule: no read path may discard source.** `migrateLibrary` rescues, in order: a bare
string (treated as the source itself), an unversioned object, a save from a *newer* build (keeps
the writing, drops only derived data), and a revision list of bare strings. Junk in `profiles`,
`cache`, `published` or `discrepancies` is dropped field by field and never takes `source` with it.
A library with revisions or publications in it is marked unlocked whatever the flag says.

`toFragment` / `mergeLibrary` exist so the campaign's JSON export can carry the library. On merge,
incoming source wins but **every revision from both sides is kept**.

Adding version 2: append a `MIGRATIONS[1]` entry in `src/meta/save.ts` and bump
`LIBRARY_SAVE_VERSION`. The rescue pass runs afterwards regardless, so a missing migration degrades
to "keeps the source, loses derived numbers" rather than to data loss.

---

## 4. The regression cache

Keyed by `runKey({ levelId, sourceHash, seeds, libraryHash, dependsOnLibrary })` in
`src/meta/hash.ts`. FNV-1a with the byte length mixed into the digest.

`libraryHash` is folded in **only when `dependsOnLibrary` is true**. Most of the campaign never
imports from `'lib'`, so most of the suite is answered from cache on every single edit — which is
the difference between a background task and a stall. `dependsOnLibrary` is decided by
`importsLibrary(code)`, a static scan of the saved source.

`runSuite` awaits the worker once per work order and yields to the host between them, so a suite
over forty work orders is slow but never janky.

`applySuite(save, result, { revisionId })` writes profiles and cache. It writes medals **only**
when called with `acceptMedals: true`, which happens on exactly one code path: the player pressing
`ACCEPT THE NEW RESULT`. `lastKnownGood` advances only when the suite was clean and uncancelled.

---

## 5. Exported surface

Everything below is re-exported from `src/meta/index.ts`. UI components come from
`src/meta/ui/index.ts`.

### Data and persistence — `types.ts`, `save.ts`, `hash.ts`
`LibrarySave`, `LibraryRevision`, `PublishedFunction`, `LevelProfile`, `CachedRun`,
`RegressionEntry`, `RegressionRun`, `RegressionState`, `Discrepancy`, `LevelFacts`, `ProgressFacts`
· `LIBRARY_SAVE_KEY`, `LIBRARY_SAVE_VERSION`, `MAX_REVISIONS`, `MAX_CACHE_ENTRIES`, `emptyLibrary`,
`loadLibrary`, `writeLibrary`, `parseLibrary`, `migrateLibrary`, `mergeLibrary`, `toFragment`,
`recordRevision`, `revisionOf`, `lastKnownGoodRevision` · `hashText`, `hashParts`, `runKey`

### Unlock — `unlock.ts`
`LIBRARY_UNLOCK_LEVEL` (`'w3-04'`), `LIBRARY_FIRST_WORLD` (`4`), `LIBRARY_REQUIREMENTS`,
`requirementsFor`, `isLibraryUnlocked`

### Publishing — `publish.ts`
`Declaration`, `PublishPlan`, `PublishRefusal`, `PublishSelection` ·
`publishableDeclarations(source, hardware)`, `planPublication`, `closureOf`, `libraryRefusals`,
`libraryExportNames`, `withLibraryImport`, `renameIdentifier`, `isValidName`

`Declaration.callable` is what the publish dialog offers: a `function`, a `class`, or a binding
whose value is a function. Data and scratch are still found — `closureOf` needs them — but they are
never checkboxes; ticking a routine takes its transitive `uses` closure with it.

`planPublication` composes `lib.ts` and then **verifies it before returning it**: every delimiter,
string, template and comment must close, and the composed file must scan back to the same
declarations, byte for byte. A plan with `refusals` returns both sources unchanged, so no caller
can write a damaged file. See `docs/FIX-LIBRARY.md`.

### Structure — `structure.ts`
`LibraryFunction`, `StructureRow`, `LibraryStructure` · `buildStructure`

### Cost analysis — `profile.ts`
`FunctionReport`, `CallerFact`, `Projection`, `MedalUpgrade` · `buildReports`, `projectSavings`,
`bestProjection`, `projectedTicks`, `medalThresholds`, `upgradeSummary`

### Regression — `regression.ts`
`MetaRunner`, `MetaRunRequest`, `MetaRunOutcome`, `RegressionTarget`, `SuiteOptions`,
`SuiteResult`, `RegressionSummary` · `runSuite`, `applySuite`, `summarise`, `summaryLine`,
`needsAttention`, `keyFor`, `cachedRun`, `withCachedRun`

### Incidents — `discrepancy.ts`
`DiscrepancyCandidate`, `ProbeResult` · `shouldProbe`, `pickCandidate`, `probe`, `offScheduleSeeds`,
`openDiscrepancies`, `withDiscrepancy`, `patchDiscrepancy`, `MIN_CLOSED_BEFORE_FIRST`,
`COMPLETIONS_PER_DISCREPANCY`

### Host seam — `adapters.ts`
`createMetaRunner({ monaco, runner, timeoutMs })`, `prepareLibrary(monaco, source)`,
`libraryHashOf`, `toOutcome`, `RunnerLike`

### Store — `store.ts`
`useLibrary` (zustand), `MetaHost`, `MetaState`, `MetaPanel`, `PublishOffer`, `suiteSummary`

### Copy — `copy.ts`
`REPOSITORY_NAME`, `UNLOCK_MEMO`, `UNLOCK_NOTE`, `LIBRARY_PANEL_HINT`, `LIBRARY_EMPTY_STARTER`,
`PUBLISH`, `REFACTOR`, `REGRESSION`, `DISCREPANCY`, `LIBRARY_FAILURE`, `NO_EXPORTS_WARNING`,
`MEDAL_WORDS`

### Runtime additions (in `src/runtime/index.ts`)
`LIB_SPECIFIER`, `LIB_BINDING`, `METER_BINDING`, `PROGRAM_SOURCE_URL`, `LIBRARY_SOURCE_URL`,
`SOURCE_LABELS`, `linkProgram`, `stripLibraryExports`, `rewriteProgramImports`,
`findModuleStatements`, `importsLibrary`, `importedLibraryNames`, `resolveModuleLocation`,
`moduleStack`, `ModuleError`, `MissingLibraryError` · `LIB_FILE_PATH`, `compileLibrary`,
`setLibraryTypes`, `toAmbientModule`, `emitOnly` · `measureWrapperOffset`, `toPlayerLine`,
`topFrameLine`, `parseStackFrames`, `decodeLineMap`, `toSourceLine`

---

## 6. Mount points

| Component | Where it goes | Notes |
|---|---|---|
| `<LibraryPanel />` | Workspace, as a sibling of `EditorPanel` — a second editor column or a slide-over drawer | Renders `null` until `save.unlocked`. Renders the unlock memo until `save.briefed`. Owns its own five tabs. |
| `<PublishDialog />` | Top level, next to `<Results />` in `App.tsx` | A modal. Renders `null` unless `useLibrary.getState().offer` is set. |
| `<UnlockMemo />` | Also exported standalone, if the integrator prefers to show it in the Results screen after `w3-04` | Calls `markBriefed()` on acknowledge. |
| `libraryStatusLine(state)` | Workspace status bar | One line: suite progress, or how many subroutines are published. |

`RefactorScreen`, `StructureScreen`, `RegressionReport`, `DiscrepancyList` and `LibraryEditor` are
exported too, if the integrator wants them somewhere other than inside `LibraryPanel`.

### Wiring, in order

```ts
// 1. once, at start-up
useLibrary.getState().hydrate();                        // localStorage
useLibrary.getState().attach({
  runner: createMetaRunner({ monaco, runner: theRunner }),
  targets: () => /* every completed level: { levelId, code, seeds, parTicks, medal, ticks } */,
  facts: () => /* every LevelDef as LevelFacts */,
  completed: () => /* [{ levelId, world }] */,
  applyMedals: (medals) => /* write to bootstrap.save. Only ever called from ACCEPT. */,
  setLevelCode: (levelId, code) => /* replace the saved source after a publish */,
  openLevel: (levelId) => useGame.getState().openLevel(levelId),
});
await prepareLibrary(monaco, useLibrary.getState().source);   // installs declare module 'lib'

// 2. on every Run, if the level imports from 'lib'
const { request } = await prepareLibrary(monaco, useLibrary.getState().source);
runner.run({ code, js, lineMap, levelId, seeds, library: request });

// 3. after a level is closed
useLibrary.getState().refreshUnlock();
useLibrary.getState().offerPublish(levelId, code, unlockedHardware(levelId));
void useLibrary.getState().recheckDiscrepancies();   // resolves any that now pass
void useLibrary.getState().probeForDiscrepancy();
```

Step 2 is the only integration that is not optional. Without it a level that imports from `'lib'`
throws `MissingLibraryError` — which is a correct, in-voice failure, but it is not the feature.

---

## 7. Gotchas

- **`export const` is widened to `let` when metering.** `stripLibraryExports(js, { mutableExports:
  true })` rewrites the keyword to `let  ` (same width) so the export can be reassigned to its
  metered wrapper from inside the library. The player never sees it: TypeScript still refuses an
  assignment to a `const` in the editor. Consequence: a runtime `TypeError: Assignment to constant`
  that the checker somehow missed will not fire inside `lib.ts`.
- **`export { a as b }` is not internally metered.** The local declaration's kind is unknown, so
  those exports are wrapped on the way out instead. Calls the *level* makes are still attributed;
  calls the library makes to itself through that binding are not.
- **`__lib__` and `__meter__` are reserved** inside the library's scope. A player declaring either
  shadows the linker's binding.
- **`prepareLibrary` mutates global Monaco state** (`setExtraLibs`). `configurePlayerLanguage`
  reinstalls both extra libs together, so calling it after a library change does not drop the
  `declare module 'lib'` declaration — but calling `setExtraLibs` from anywhere else would.
- **The regression suite compiles with `emitOnly`, not `compilePlayerCode`.** A World 7 solution
  re-checked while the player sits in World 4 would be full of `Cannot find name` errors that mean
  nothing; those errors were answered when the work order was closed. Syntax is still checked.
- **`profiles[].parTicks` is a snapshot.** If a level's `par.ticks` changes in a later build, old
  profiles carry the old par until the work order is re-run. `buildReports` prefers the profile's
  own value and falls back to `LevelFacts`.
- **`buildReports` needs `freshKeys`.** Only the caller knows which cache keys are current. Any
  profile outside that set is listed in `report.stale` and excluded from every number, including
  the projection. That is deliberate: a stale figure in the Cost tab is worse than no figure.
- **Anything a selector reads has to be referentially stable.** `reports()`, `structure()` and
  `suiteSummary` are all read as `useLibrary((state) => state.reports())`, so each caches its last
  answer against the `save` it was derived from. A derivation that allocates on every call is a
  `getSnapshot` that never compares equal, and React answers that by re-rendering until it unmounts
  the tree — which is a white page, not a broken panel.
- **The Structure tab's edges are static, its numbers are not.** Who calls whom is read out of the
  player's own `lib.ts` text, so it is known before anything has run. Ticks and call counts come
  only from measured profiles under the current library; an unmeasured subroutine shows a dash.
  `selfTicks` is `ticks` minus what its children carry, floored at zero and marked `≤` when the
  floor was needed, because a child called from two parents carries the same ticks under both.
- **The projection is arithmetic on measured call counts**, not a simulation. `delta × calls`,
  against the real medal thresholds. A faster `pathTo` that still walks the same tiles is not
  something the simulator can be asked to imagine, so the alternative is not a better estimate — it
  is no number at all. Everything it multiplies came from a run that happened.
- **`FakeRunner` in `src/game/ports.ts` does not link libraries.** Development-only shell testing
  against a level that imports from `'lib'` will fail; use the real `Runner`.

---

## 8. Tests

`src/meta/__tests__/` — 151 tests.

| File | Covers |
|---|---|
| `modules.test.ts` (40) | Statement scanning, import rewriting, export stripping, linking, **line-number correctness across both files**, tick attribution including nesting, cache-key behaviour, aliased exports, published classes, metering not moving a line |
| `publish.test.ts` (22) | Declaration discovery, doc comments travelling with their declaration, dependency and hardware warnings, identifier scanning, renaming without touching strings, the two-file rewrite, import merging |
| `regression.test.ts` (13) | Broken / degraded / improved / nominal classification, **no silent medal downgrade**, revert target never advancing past a bad revision, cache hits returning identical results and running nothing, independent work orders staying cached, cache cap, cancellation |
| `structure.test.ts` (9) | Call edges read out of `lib.ts`, cost attributed down the tree, roots, recursion and cycles, unrelated functions degrading to a parts list, stale profiles contributing no numbers |
| `store.test.ts` (5) | Referential stability of every derived selector (`reports`, `structure`, `suiteSummary`) |
| `profile.test.ts` (9) | Attribution roll-up, stale exclusion, medal-upgrade projection, cheapest useful saving, no-projection case |
| `save.test.ts` (21) | Migration from every shape that has ever plausibly been written, source never discarded, revision cap, merge, storage failure, discrepancy pacing and candidate selection |
| `pipeline.test.ts` (4) | The whole loop end to end: publish a declaration, import it from the next work order, run it, be charged for it, and get the right `lib.ts` line when it throws |
| `publish-roundtrip.test.ts` (24) | The corpus: one row per declaration shape, published, parsed with the real compiler, re-linked and asserted to behave exactly as it did before it moved. Plus the refusal gate, removal not damaging neighbours, and the offer rule |
