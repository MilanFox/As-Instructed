# Library fixes — publish corruption, dialog scale, unhandled rejection

Three defects reported against the Repository, from `docs/PLAYTEST-VETERAN.md` §4.2, §4.5 and §5
and `docs/OPEN-ITEMS.md`. Baseline before any change: `tsc --noEmit` clean, 1402 tests green,
`eslint` reporting the two known `react-hooks/rules-of-hooks` false positives in `src/levels/`.

The Regression tab was not touched. Its behaviour and its wording are unchanged, and
`src/meta/__tests__/regression.test.ts` (13 tests) passes untouched; a new test in
`publish-roundtrip.test.ts` asserts its four load-bearing strings verbatim so a later edit to
`copy.ts` cannot quietly reword them.

---

## Defect 1 — publish truncated multi-line declarations

### Root cause

`declarationEnd` in `src/meta/publish.ts` decided where a declaration stopped by looking for a
line break:

```ts
else if (!braced && braces === 0 && brackets === 0 && (ch === ';' || ch === '\n')) {
  return ch === ';' ? i + 1 : i;
}
```

For a `const`/`let`/`var` it returned at the **first newline at bracket depth zero**. That is not
where a declaration ends; it is where one *may* end, and only when automatic semicolon insertion
says so. So

```ts
const ahead = (d: Dir, p: {x:number;y:number}) =>
  d === Dir.North ? { x: p.x, y: p.y - 1 } :
  …
```

closed its parameter list and its inline object type on line one, arrived at the newline with every
bracket balanced, and stopped — with the `=>` dangling. `lib.ts` received a declaration head and no
body. The dialog said "lines 4–4" because it was reporting the same wrong end.

This was never a bug about arrow functions. Every shape that carries an expression across a line
break at depth zero was cut in the same place: ternary chains, method chains, binary operators,
generic arrows, `async` arrows, and a `const` continued after a type annotation.

The `braced` branch was wrong in the mirror-image way. It returned at the first `}` that brought
the brace counter back to zero, without caring whether that brace was the function's *body*:

```ts
} else if (ch === '}') {
  braces--;
  if (braced && opened && braces === 0) return i + 1;
}
```

so `function f<T extends { id: number }>(…)` ended at the generic constraint, and
`function f({ x, y }) {}` ended at the destructured parameter list. Neither had ever been
reported, because neither had been published.

The sibling bug the brief mentions — `export // comment` — was the same class of mistake one level
up (the `export` keyword was pasted at offset zero rather than at the declaration head) and had
already been fixed by `declarationHead`. That fix is kept and now shares its implementation with
the new scanner.

### What was broken before

Every one of these produced a truncated or over-long extraction, and none of them said so:

| Shape | Old result |
|---|---|
| expression-bodied arrow across lines | cut at the `=>` |
| multi-line ternary chain | cut at the first line |
| method chain continued on the next line | cut before the chain |
| `async` arrow with the body below | cut at the `=>` |
| generic arrow `<T,>(…) =>` on two lines | cut at the `=>` |
| generic function with an object constraint | cut at the constraint's `}` |
| destructured parameters | cut at the parameter list's `}` |
| a return type that is an object type | cut at the return type's `}` |
| declarations written without semicolons | cut at the first line |
| a trailing `// comment` on the last line | left behind in the work order |
| a regex containing a brace | unbalanced the brace counter |
| a template literal holding `${ }` | unbalanced the brace counter |

### The fix

`declarationEnd` is now structural, and counts no lines at all.

- One shared low-level layer: `nextSignificant`, `skipLiteral` (templates walked properly, so a
  substitution can hold another template), `skipSubstitution`, `skipRegex`.
- **Unbraced** (`const`/`let`/`var`) ends at a `;` at depth zero, or at a line break where
  JavaScript would insert one. That is a real ASI test, in two halves: `CONTINUES_AFTER` (the line
  ends with `=>`, an operator, or a keyword that wants a right-hand side) and `CONTINUES_BEFORE`
  (the next line starts with `.`, `?`, `:`, `,`, an operator, or `extends`/`as`/`in`).
- **Braced** (`function`/`class`) ends at the `}` that returns every delimiter to depth zero *and*
  is not immediately followed by another `{`. The trailing `{` is what distinguishes a return-type
  annotation from a body; generic constraints and destructured parameters are handled because the
  scan tracks `(`/`[`/`{` in one stack rather than braces alone.
- A `//` run sharing the declaration's last line travels with it, the way a doc comment above it
  already did (`trailingComment`).
- `publishableDeclarations` no longer treats `export function f() {}` as an off-limits module
  statement, so the scanner can be pointed at `lib.ts` itself. That is what makes the round-trip
  check below possible.

### Silent corruption, made impossible

`planPublication` now composes `lib.ts`, then *verifies it before returning it*. Two questions,
in `libraryRefusals`:

1. **Does it close?** `balanceOf` walks the composed file and reports any delimiter, string,
   template, regex or block comment that never closes, or any closer that closes nothing. Each
   addition is checked on its own first, so the answer can name a declaration rather than a line.
2. **Does it round-trip?** The composed `lib.ts` is scanned again with the same
   `publishableDeclarations`, and every published name must come back **byte for byte** as the
   text that was appended. This is the check that catches truncation, over-swallowing, and a
   neighbour eating the newcomer — including the case where the *existing* `lib.ts` ends mid
   expression and would absorb whatever is appended after it.

The work order's own source is checked too (`balanceOf` on `levelSource`), so a removal that
damages what it leaves behind is refused as well.

When anything is refused, `PublishPlan.refusals` is non-empty **and both sources are returned as
the originals**. There is no code path on which a caller that ignores `refusals` can write a
damaged file. `confirmPublish` refuses, and `PublishDialog` disables the button and prints which
declaration failed (`PUBLISH.refusedDeclaration`, `PUBLISH.refusedLibrary`,
`PUBLISH.refusedRemoval`).

A refused publish costs the player one dialog. A corrupted `lib.ts` cost the tester a closed work
order and said "committed".

### Tests

`src/meta/__tests__/publish-roundtrip.test.ts`, 24 tests. Sixteen of them are the corpus: one row
per declaration shape, each of which is

1. run as a plain work order and its output recorded,
2. published,
3. asserted to produce no refusals,
4. compiled with the real TypeScript compiler (`ts.transpileModule` with `reportDiagnostics`) —
   both `lib.ts` and the rewritten work order must parse,
5. re-linked through `linkProgram` and run again, with the output asserted **equal to step 1**.

The reported defect is the first row. `typescript` is already a pinned devDependency and is
imported only from the test, exactly as `src/runtime/__tests__/fake-monaco.ts` does; nothing new
was added and nothing extra reaches the bundle.

The remaining eight cover the refusal gate (a truncated declaration is named; a `lib.ts` that does
not close is not appended to; a `lib.ts` whose last line would swallow the newcomer names the
newcomer), removal not damaging neighbours, the new offer rule, and the Regression tab's wording.

---

## Defect 2 — the publish dialog at scale

### What the tester saw

Nineteen checkboxes on `w4-04`. That is exactly right: the shipped solution for `w4-04` has
nineteen top-level declarations. Eight of them are data or scratch — `open`, `ground`, `start`,
`pads`, `lift`, `orders`, `best`, `bestCost` — and the tester named `bestCost` specifically.

### The new selection rule

**A declaration is offered when it is callable.** That means a `function` declaration, a `class`,
or a `const`/`let`/`var` bound to a function expression or an arrow. Nothing else is a checkbox.

The reasoning is that the Repository exists so that a later work order can write
`import { pathTo } from 'lib'` and *call* it. A tile map, a best-so-far accumulator or a loop
counter is real code the player wrote, and it is still not something another work order imports and
uses. It is part of a routine or it is nothing.

`w4-04` goes from 19 checkboxes to 11, and every one of the eight the tester complained about is
gone.

**Ticking a routine takes its closure with it.** `closureOf` walks the transitive `uses` graph, so
ticking `routeTo` selects `open`, `key`, `parse`, `around`, `routeTo` — the function, the helpers
it calls and the state it closes over. The dialog shows what came along as a quiet line under the
checkbox (`PUBLISH.brings`) rather than making the player find it.

That is the "one click" the directive asks for, and it answers §5's *"the unit of publication is
wrong … the dialog knows this (it warns about it) but still makes me assemble it by hand out of
nineteen checkboxes"* at the same time. Before the change, publishing `routeTo` correctly took five
ticks and a reading of the dependency warning. It now takes one.

### Why nothing is pre-ticked

Pre-ticking the offered set would make the default action publish eleven routines, which is a worse
trap than a wall of checkboxes: the tester's stated intent was to publish `pathTo` and nothing else.
The dialog is already one click to dismiss ("Not this time") and is now one click plus PUBLISH to
publish a complete, working routine. The list is short enough that the thing you came for is
visible without scrolling, which is the actual de-noising ask.

### Other de-noising

- The `kind` word is gone from each row: every row is a routine now, so it said nothing.
- The hardware warning is shown only once a routine is ticked. It is advice about a decision, not
  a label on an option.
- `PublishDialog` now previews against the real work order source rather than `''`, so the plan it
  shows is the plan that would be applied.
- `offerPublish` no longer raises the dialog when a work order has no callable declaration at all.

`Declaration.callable` is a new field; `closureOf`, `libraryRefusals` and `PublishRefusal` are new
exports from `src/meta/index.ts`. `publishableDeclarations` still finds everything, because the
closure needs it — the filter is at the offer, not at the scan.

---

## Defect 3 — unhandled promise rejection at `src/ui/library.ts` (`installTypes`)

### Root cause

Not a missing `.catch()`. The chain, verified against the installed `monaco-editor@0.52`:

1. `configurePlayerLanguage` (`src/runtime/compile.ts`) called `setCompilerOptions`,
   `setDiagnosticsOptions` and `setEagerModelSync` on **every level change**, even though every
   value in all three is a build-time constant that never differs between work orders. Only the
   ambient `.d.ts` varies.
2. All three fire `typescriptDefaults.onDidChange`
   (`node_modules/monaco-editor/esm/vs/language/typescript/monaco.contribution.js:182,189,209`).
3. Monaco's `WorkerManager` subscribes to that event and answers it with `_stopWorker()`, which
   disposes the TypeScript web-worker client and drops the cached client promise
   (`.../typescript/tsMode.js:34,45`).
4. `EditorWorkerClient.workerWithSyncedResources` opens with
   `if (this._disposed) { return Promise.reject(canceled()); }`
   (`.../editor/browser/services/editorWorkerService.js:340`). Anything in flight at that moment
   rejects with a `Canceled` error.
5. `installTypes` was exactly such a thing in flight. It runs from the `useGame` subscription,
   which fires **before** the workspace's effects do — so at that point `RuntimeRunner` had not yet
   been told which level the player just opened, `ready()` answered for the *previous* one, and the
   `configurePlayerLanguage` that arrived a beat later from `App`'s effect killed the compile that
   was already running. It is called as `void installTypes()`, so the rejection had no handler.

Every level open, once the Repository is unlocked. Invisible to the player because the next Run
recompiles the library anyway — which is why it survived.

It was also a correctness bug, and the comment above `installTypes` had already predicted it:
`lib.ts` was being compiled against the *previous* level's firmware. A World 4 library that calls
`look()` re-checked under World 3's declarations fails to build, `setLibraryTypes(monaco, undefined)`
drops `declare module 'lib'`, and every import in the editor goes red until the next Run.

### The fix

Both halves:

- `installLanguageOptions` in `src/runtime/compile.ts` compares the options against what it last
  pushed (per Monaco instance, through a `WeakMap`, so the test host in
  `src/runtime/__tests__/fake-monaco.ts` still gets its own) and returns without touching anything
  when they match. The TypeScript worker is now built once per page and never torn down on a level
  change. `setExtraLibs` — which is what actually changes per level — updates the live worker
  rather than replacing it, so nothing is lost. A level change no longer costs a full TypeScript
  program rebuild either.
- `installTypes` takes the level id and calls `activeRunner.prepare(levelId)` before awaiting
  `ready()`, so the language service is configured for the level being opened before `lib.ts` is
  compiled against it. `prepare` is idempotent; `App`'s own call becomes a no-op.

No `.catch()` was added. If one of these ever rejects again it should be loud.

---

## Verification

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **1426 passed / 1426**, 45 files. That is the 1402 from the baseline plus the
  24 new ones. No pre-existing failures were found, and none were left.
- `npx eslint .` — 2 errors, both the pre-existing `react-hooks/rules-of-hooks` false positives in
  `src/levels/world-5/__solutions__/w5-01.ts` and `src/levels/world-8/w8-05.ts`. Unchanged.

## Reported, not acted on

**Character count is still counted, persisted and displayed**, against the standing rule.

- `countChars` — `src/game/score.ts:28`.
- Displayed in the console line on every successful run:
  `` `work order closed — ${verdict.stats.ticks} ticks, ${chars} chars` `` — `src/game/store.ts:463`.
- Persisted as `bestChars` on the level record — `src/game/store.ts:515`, merged in
  `src/game/save.ts:386`.
- Carried into `Verdict` — `src/game/ports.ts:175` (`buildVerdict({ chars })`).
- Declared as `par.chars` on every level — `src/levels/types.ts:22`.

It does **not** feed a medal: `medalFor` reads ticks only. But it is on screen, in the save, and in
the level schema. `src/levels/`, `src/engine/verdict.ts` and `src/game/ports.ts` were out of scope
for this change in any case.
