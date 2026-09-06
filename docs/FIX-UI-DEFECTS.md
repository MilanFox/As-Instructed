# UI defects — nine items, eight changed, one already fixed

Worktree `agent-a9929ba3a09569214`. Every change is direction-independent and was checked in a
browser under **survey**, **signal**, **deepsite** and **standard** — the medal key under all four,
everything else under survey and signal. `DEFAULT_ART` untouched, no palette touched, no direction
deleted. Shots in `docs/shots/ui-defects/`.

**Verification.** `npx tsc --noEmit` clean. `npm run build` clean. `npx vitest run` **1772 tests /
77 files**, green — the stated baseline, unchanged. `npx eslint src` reports only the known
pre-existing `src/levels/world-5/__solutions__/w5-01.ts:32`. Both ratchet guards
(`confessed-invariants`, `unused-exports`) pass without amendment; nothing in this report needs a
guard's expected set changed.

---

## 1. `Uncaught (in promise)` from `installTypes` — **fixed at the cause**

### What it actually is

The rejection value is the bare **string** `'TypeScript not registered!'`. That is why the console
printed `Uncaught (in promise)` with nothing after it: the reason is not an `Error`, so it carries
no message, no stack and no own properties, and DevTools has nothing to render.

`monaco-editor/esm/vs/language/typescript/tsMode.js`:

```js
function getTypeScriptWorker() {
  return new Promise((resolve, reject) => {
    if (!typeScriptWorker) return reject("TypeScript not registered!");
    …
```

`typeScriptWorker` is assigned by `setupTypeScript`, which `monaco.contribution.js` runs from
`languages.onLanguage('typescript', …)` — **one dynamic import (`tsMode.js`) after** the language is
first encountered. `prepareLibrary` creates the `lib.ts` model and asks for the worker in the same
tick, from `mountLibrary`'s `runner.ready().then(…)`, which fires before any editor has mounted. On
a cold module cache the ask loses that race.

**Twice per entry, and now the "twice" is explained too.** Both rejections carried `levelId ===
undefined`, which is only the mount path — and `main.tsx` renders in `StrictMode`, so the App effect
runs, tears down, and runs again. Two mounts, two `void installTypes()`, two rejections. Captured
under a forced-cold Vite dep cache:

```json
[{ "str": "TypeScript not registered!", "own": null },
 { "str": "TypeScript not registered!", "own": null }]
```

### Why it mattered beyond the console

`installTypes` exists to install `declare module 'lib'`. When it lost the race the declaration was
**silently never installed**, so a player whose program imports from the Repository saw their own
`import` underlined in red until the next Run or the next `lib.ts` edit re-triggered it. The console
noise was the symptom; the dropped declaration was the defect.

### The fix

`src/ui/monaco-setup.ts` gains `typescriptRegistered()`: it creates one throwaway TypeScript model
(so the language *is* asked for — nothing sets the service up until something wants it), then waits
on `getTypeScriptWorker()`, retrying on the rejection until it answers, and disposes the model.
`RuntimeRunner.ready()` in `src/ui/adapters.ts` awaits it, which makes `ready()` mean what its own
comment already claimed: Monaco, loaded and configured. Every caller downstream — Run, the library
compile, the metagame's regression runner — gets a language service that exists.

No `.catch`. The one terminal path — the service genuinely never registering inside the budget —
logs a named `console.error` and lets the caller fail as it does today; it does **not** reject,
because `ready()` is awaited inside `RuntimeRunner.run()` with no handler above it and a rejection
there would hang the run in `running` forever, which is DESIGN §10.6.

**Verified**: `npx vite --force` (cold dep cache), fresh load, enter `w8-01` — zero unhandled
rejections, three times running. Before the fix the same procedure reproduced it every time.

## 2. A modal-layer error boundary — **new `ModalBoundary`**

`src/ui/App.tsx` already wrapped each of the five modals in `PanelBoundary` (F21 landed earlier), so
a throw no longer unmounts the app. What it did not have was a way out. `PanelBoundary`'s fallback
is a notice sized for the Repository's column that says *"Reload the page to bring it back"* — which
for a modal means the player loses the run they were looking at, and the notice itself never goes
away, so the strip sits under the game for the rest of the session.

`src/ui/components/ModalBoundary.tsx` behaves the way `PanelBoundary` does — one label, the fault
logged with its component stack, the thing taken offline for the session rather than retried into
the loop that killed it — and adds the two things a modal needs:

- The fallback is **itself a dialog** (`role="alertdialog"`, focus on the button), in the same
  `.modal` shape as the thing it replaced, so it is not a dead screen.
- Pressing it **closes the modal underneath through that modal's own store action**, then renders
  nothing for the rest of the session. Each boundary in `App.tsx` is handed its own close —
  `dismissResults`, `skipPublish(false)`, `markBriefed`, `signRequisition`, `fileReview(rank)` —
  because a modal the store still thinks is open is a modal the next run raises again. Rendering
  `null` afterwards is what makes the way out *guaranteed*: nothing remounts the child that threw.

`PanelBoundary` stays, unchanged, for the Repository panel in `Workspace.tsx`. The now-dead
`.modal-layer .panel-boundary` rule in `app.css` is deleted and its comment rewritten.

**Verified** by temporarily making `ResultsReport` throw: the report was replaced by `WITHDRAWN —
The run report stopped responding…`, the site map, editor, board and rail behind it were untouched,
`Back to the program` returned the player to a working workspace, and a second Run worked normally
without re-raising the broken dialog. The probe was reverted.

## 3. The retired `award('no-regressions')` — **deleted**

`src/ui/library.ts`. The `state.suite` block is gone and the surviving comment says why a clean
regression pass is no longer recognised (§11 A9: refactoring is supposed to break things so you find
out). `award('repository')` is untouched.

## 4. A limit and a budget are not the same object (FIX-INCENTIVES §H) — **two words**

**par** is the medal boundary. **limit** is the number that ends the work order. Neither is "ticks"
any more.

- `src/ui/panels/ObjectiveRail.tsx` — the `targets` row is labelled **`par`** on a graded work
  order (it stays `ticks` on an ungraded one, where it is the clock and has no denominator).
- A required objective whose budget meter is `ticks` gets a small **`LIMIT`** tag beside its
  readout, in the rail and in the run report. **Never on a bonus** — a bonus threshold costs a star
  and ends nothing, and tagging it would be the same confusion pointed the other way.
- One caption, seven words, drawn only where both numbers are on screen at once:
  *"par sets the medal. the limit ends the work order."*

`gradesTicks` now reads `objective.meter?.kind === 'ticks'` as well as the old label regex, which is
exact rather than textual; the `||` keeps every existing level's behaviour and adds precision.

`w8-01` now reads `LIMIT 9 / 215 ticks` in the objectives and `TICKS 9 · par 165` in the score
cell. Shots under both directions.

**Left alone deliberately:** the run report's ticks note still reads `par N` on an ungraded work
order. `docs/FIX-UNGRADED-UI.md` §4 flagged that and left it on purpose; it is one ternary and it is
the orchestrator's call, not a change to make sideways.

## 5. The Repository, in the numbers (FIX-INCENTIVES §I) — **both halves**

**5.1 — the run report.** `src/ui/screens/Results.tsx` reads `libraryUsage` off the seed the report
is describing (`seedResults.find(r => r.seed === traceSeed)`) and renders one quiet line:

> 2 routines from the Repository, 9 ticks inside them.

`libraryUsage` is on `PerSeedResult`, which the game store already holds — **no change to
`src/game/**` was needed**. A run that linked the library and never called it says nothing rather
than `0 routines`, because a zero is a scoreline and this is not one. Copy is
`libraryUsageLine` in `src/ui/copy.ts`.

**5.2 — the Repository panel.** The Structure tab's table gains a **`Work orders`** column, sourced
from `LibraryFunction.levels` (imports, read off the save — static, so it survives a routine no run
has been through). The Cost tab already had a callers count, but only for routines a run had
measured; and Structure's `Imported by 3 work orders: …` sentence only ever printed for tree
*roots*. The column gives the number for every published routine including nested ones —
`pathTo 3`, `step 2` in the verification save.

**Neither adds a point to anything.** No new save field, no new score, no new commendation.

*Scope note:* 5.2 touches `src/meta/copy.ts` and `src/meta/ui/StructureScreen.tsx`. That is outside
the `src/ui/**` I was given, but §I names the Repository panel specifically and `src/meta` was not on
the do-not-touch list. Two files, one column, no logic.

## 6. The commendation shelf — **the fraction is gone**

`src/ui/components/CommendationShelf.tsx` no longer renders `{earned}/{ACHIEVEMENTS.length}`. The
count was *arithmetically* honest — the list is five and `ACHIEVEMENTS.length` is five — but it is a
completion bar against a denominator that has been fifteen and is now five, on a layer where nothing
is gated and `1/5` reads as failing at something the game never asks for. FIX-INCENTIVES §A calls
this the one judgement it would insist on. The list is the readout; five rows say five.
`.shelf__count` deleted from `screens.css`.

## 7. `.screen-stat__streak` — **verified dead, deleted**

Nothing in `src/` renders `screen-stat__streak`; the only `screen-stat__*` modifiers in use are
`__gold`, `__silver`, `__bronze`. Rule deleted from `src/ui/styles/screens.css`.

**Found next to it and left:** `.sitemap .screen-stat__best` is dead by the same test — no `.tsx`
renders that class. It is not the streak and it was not on my list, so it is flagged rather than
taken.

## 8. F22 and F9

**F22 (`aria-label="Playback speed"`) — already fixed. No change made.** `TimelineBar.tsx` has
`<label className="sr-only" htmlFor="speed">Playback speed</label>` and `select.labels` in the live
page returns `["Playback speed"]`, so the name is computed. The accessibility tree prints the
combobox as `combobox "1x"`, which is its **value**, not its name — proven by setting
`aria-label="ZZPROBE"` on the element and re-reading the tree, which still printed `"1x"`. Adding
the attribute would have been a redundant second name for a control that already has one.

**F9 (`.modal__body { min-height: 0; overflow-y: auto }`) — live, and fixed.** Confirmed in the
browser at an 800px window before touching anything: the run report drew `Nothing was billed…`
underneath its own footer with no way to reach it, and the hardware requisition drew its last crate
under `Sign for it`. `.modal` is now a flex column with `overflow: hidden`, `.modal > *` is
`flex: none`, and `.modal__body, .requisition__body` are `flex: 1 1 auto; min-height: 0;
overflow-y: auto`. Head and foot stay pinned; the body scrolls. `.requisition__body` is in the same
rule because the three ceremony dialogs (`Requisition`, `RepositoryIssue`, `ReviewMemo`) use it
instead of `.modal__body`, and F9 was worse there. `PublishDialog` uses `.lib-modal` and is
unaffected.

## 9. A medal legend on the site map — **added**

Three medals were drawn as forty rings on the board and named nowhere. `LevelSelect.tsx` renders a
`medal-key` beside the GOLD/SILVER/BRONZE tallies:

> ● **GOLD** at par or under  ● **SILVER** up to a quarter over par  ● **BRONZE** a pass

The samples are **real `.node` markup with the real modifier classes**, so the key is drawn in
whatever marks the loaded direction draws — a ring under standard, a hatched square under survey, a
filled/outlined/dotted square under signal. That is what makes it direction-independent: under
signal the three are distinguishable with **no colour at all**, because that is how signal already
draws them.

They are **scaled with a transform, not resized**, after the first attempt broke under signal:
`[data-art='signal'] .node__disc { width: 46px }` outranked a `.medal-key .node__disc` width and the
samples overlapped their own labels. A transform shrinks whatever the direction draws and cannot be
outranked by a future one.

---

## Files changed

| file | items |
|---|---|
| `src/ui/monaco-setup.ts` | 1 — `typescriptRegistered()` |
| `src/ui/adapters.ts` | 1 — `ready()` awaits it |
| `src/ui/library.ts` | 3 — the retired award |
| `src/ui/components/ModalBoundary.tsx` | 2 — new |
| `src/ui/App.tsx` | 2 — five boundaries, each with its own close |
| `src/ui/panels/ObjectiveRail.tsx` | 4 — `par`, the `LIMIT` tag, the caption |
| `src/ui/screens/Results.tsx` | 4, 5.1 — the `LIMIT` tag, the Repository line |
| `src/ui/copy.ts` | 5.1 — `libraryUsageLine` |
| `src/ui/components/CommendationShelf.tsx` | 6 — the fraction |
| `src/ui/screens/LevelSelect.tsx` | 9 — the medal key |
| `src/ui/styles/app.css` | 2, 4, 5.1, 8 |
| `src/ui/styles/screens.css` | 6, 7, 9 |
| `src/meta/copy.ts` | 5.2 — the column head |
| `src/meta/ui/StructureScreen.tsx` | 5.2 — the column |

Two files were reformatted by `npx prettier --write` (`App.tsx`, `copy.ts`) after checking that both
were prettier-clean at HEAD, so the only reformatting is of lines this work added. The repo as a
whole is not prettier-clean (54 files); nothing else was touched.

## Not fixed, and routed

1. **`.sitemap .screen-stat__best` is dead CSS**, one rule below the streak rule I was sent for
   (item 7). Same test, same result, not on my list — say the word.
2. **`src/meta/ui/LibraryEditor.tsx` has the same Monaco race as item 1**: it calls `setupMonaco()`
   and then `compileLibrary` directly, bypassing `RuntimeRunner.ready()` and therefore
   `typescriptRegistered()`. It is behind a 400ms debounce and the panel cannot open before the
   workspace editor has mounted, so it does not reproduce — but the guard is on the other path, and
   the honest fix is for `LibraryEditor` to await `typescriptRegistered()` too. `src/meta` was
   outside my brief; one line if you want it.
3. **The run report prints `par N` on an ungraded work order.** Pre-existing, deliberately left by
   `FIX-UNGRADED-UI` §4, and it is the one remaining place where item 4's two numbers can still read
   as one kind of thing. One ternary.
4. **`ModalBoundary` renders `null` for the session after a dismissal**, which means a player who
   hits a broken run report gets no run reports until they reload. That is deliberate — remounting
   the child that threw is a loop — but it is a real degradation and worth knowing about.

## Shots

`docs/shots/ui-defects/`

| file | what |
|---|---|
| `sitemap-medal-key-signal.jpg` | the key under signal — filled / outlined / dotted, no colour needed |
| `sitemap-medal-key-survey.jpg` | the key under survey |
| `report-limit-and-repository-signal.jpg` | `LIMIT 9 / 215 ticks`, `par 165`, the Repository line |
| `report-limit-and-repository-survey.jpg` | the same under survey, with the footer pinned (F9) |
| `repository-reuse-signal.jpg` | the Structure tab's `WORK ORDERS` column |
| `modal-body-scrolls-survey.jpg` | the requisition, head and foot pinned, body scrolling |
