# FIX-UI-COVERAGE — tests for the UI pass that shipped without any

The UI pass of 2026-09-06 (`1a987de`, `7a24e80`) landed six real fixes and was verified by hand in
a browser. Hand verification is not durable. This is the missing coverage. No behaviour changed.

Every file here is a regression test in the strict sense: it was run against the pre-fix source and
watched go red before it was believed. The per-section notes record exactly which assertions fail
against the old code and which do not, because a test that passes both ways is not a regression
test and saying so is the point of the exercise.

---

## 1. `ModalBoundary` — `src/ui/components/__tests__/modal-boundary.test.ts`

14 tests. The component's whole purpose is to catch a crash and nothing asserted that it caught
one.

### The driver

Vitest runs in node; there is no DOM and no new dependency is allowed. `src/meta/__tests__/publish-dialog.test.ts`
set the precedent — a hand-cranked React with real semantics — and **it does not fit this case**:
its driver implements hooks and has no error path at all, and `ModalBoundary` is a class component
with no hooks whose entire behaviour lives on the error path. So this file carries a second driver
in the same spirit and with no overlap: classes, `getDerivedStateFromError`, `componentDidCatch`
with an honestly-rebuilt component stack, `setState`, and render-until-stable.

The first test in the file is the floor under the rest:

> `a throw in a modal without a boundary takes the whole screen`

With no boundary in the tree the throw comes out of the root render — the original defect
reproduced. A driver that quietly swallowed errors would pass every later assertion while proving
nothing, so that one is checked first.

### What is asserted

- The render completes rather than tearing the tree down.
- The fault is announced: `role="alertdialog"`, `aria-modal`, an accessible name carrying the
  failed modal's label, and prose naming it.
- `componentDidCatch` logs the label, the error and a component stack that names the component that
  **threw** (not the one that caught).
- **The rest of the game is still mounted** — the site map is still drawn.
- **And still interactive** — the RUN button behind the fault still runs its handler and the change
  it makes shows up on the next render. This is the assertion that matters; the defect was a blank
  background, not an ugly dialog.
- A second, healthy modal in the same layer is untouched.
- The fallback offers **exactly one** control and it is pressable — the difference from
  `PanelBoundary`, which is asserted directly in the same file (`buttons(tree)` is empty for a
  panel): a panel sits in its own column and is walked around, a modal covers the game, so a notice
  with nothing to press is a dead screen.
- Pressing it calls the dismissal exactly once, and a dismissal that itself throws still lets the
  player out.

### The pinned degradation

`the dismissed modal stays gone for the session` pins, deliberately, that after a dismissal the
boundary renders nothing for the rest of the session. The test proves the child *would* render
cleanly if it were put back — it renders a healthy instance of the same child first — and then
asserts that after dismissal nothing takes its place. **This is intended.** The child threw during
render; rendering it again is the same throw, which is a loop the player cannot leave, and the
guaranteed way out exists only because nothing here ever remounts it. Anyone "fixing" this into a
remount is rebuilding the defect.

### Red against the old code

| pre-fix source | result |
| --- | --- |
| `1a987de^` (no `ModalBoundary` at all — App used `PanelBoundary`) | **all 14 red**, the module does not resolve |
| `ModalBoundary` replaced by the pre-fix `PanelBoundary` body | **7 red, 7 pass** |

The 7 that go red against `PanelBoundary` are every assertion about the way out: the `alertdialog`
announcement, the single control, the dismissal, the throwing dismissal, and all three
session-degradation tests.

The 7 that pass both ways are the containment ones — completion, the log, the game still being
drawn and still interactive, the untouched sibling. **That is correct and is stated here rather
than hidden:** `PanelBoundary` was already an error boundary, so containment was already fixed by
`docs/AUDIT-UI.md` F21. Those assertions go red against the code *before* F21, which is the state
the first test in the file reproduces synthetically on every run.

---

## 1b. Each boundary's close — `src/ui/__tests__/modal-dismissal.test.ts`

8 tests. `ModalBoundary`'s own docstring says the design rests on this: *the store has to agree the
dialog is shut, or the next run raises the same broken thing again.* A boundary wired to a
dismissal that closes nothing hands the player a button that puts the same fault straight back.

So the assertion is not "the callback ran". It takes the dismissal `App` really hands each
boundary, calls it, and renders that modal's **own component** again — it must now draw nothing.
Five modals, five dismissals: the run report, the publish offer, the Repository note, the delivery
note, the performance memo. The memo gets an extra test, because its close is not a single store
call — it is filed *by rank*, and a boundary that guessed would file the wrong memo and withhold
one the player has never read (DESIGN.md §11 A12).

Driver: the hooks-and-zustand one from `src/meta/__tests__/publish-dialog.test.ts`, which is what
it was built for. Effects are never flushed — `App`'s mount effect builds a `RuntimeRunner` and a
canvas renderer, and this file is about what `App` renders, not what it mounts.

**Red against the old code:** with `1a987de^`'s `App.tsx` — five `PanelBoundary`s and no
`onDismiss` anywhere — **all 8 fail**.

---

## 2. The Monaco race — `src/ui/__tests__/monaco-registration.test.ts`

6 tests, all of them ordering.

The guarantee has one statement and one place it holds: **`RuntimeRunner.ready()` does not hand
Monaco to anybody until the TypeScript language service will answer.** Every path into Monaco in
this app is downstream of `ready()` — `installTypes`, the transpile, the library compile, the
regression suite — so pinning it there pins all of them.

- `ready()` stays pending while the service is still installing, and the whole event order is
  asserted: editor configured → waiting on the language service → service up → ready.
- The editor is wired first and waited on second.
- A warm load still goes *through* the wait rather than around it.
- **A level prepared on a cold load installs no declarations until the service is up.** The bug
  restated as an ordering: `configurePlayerLanguage` pushes the ambient `.d.ts` — and on the
  Repository's path `declare module 'lib'` — into the language service, and landing it before the
  service exists is landing it in nothing, which is what the player saw as a red `import` that
  cleared itself on the next Run.
- One registration, however many callers: StrictMode mounts twice and three subsystems call
  `ready()`, and a second race against the first is what the memo is for.

Nothing here watches `console.error`. A test that did would go green the moment someone wrapped the
same race in a `catch`, with the declaration still not installed.

**Red against the old code:** with `1a987de^`'s `adapters.ts`, where `ready()` resolved on
`setupMonaco()` alone, **all 6 fail**.

### The one thing this does not cover, and the exact change that would

The polling loop, the warm-up model and the give-up inside `typescriptRegistered` itself are not
covered, and it is a module-resolution problem rather than a design one. `monaco-editor` ships
`module` and no `main`, so vite cannot resolve it under node. That is not "the test is hard to
write" — **no test file in this repo can even `vi.mock('monaco-editor')`**, because vitest resolves
the specifier before it consults the mock registry. Confirmed directly: a file whose entire body is
`vi.mock('monaco-editor', () => ({}))` fails to collect with
`Failed to resolve entry for package "monaco-editor"`.

The change that would open it up. **Not applied — `vitest.config.ts` is not mine, and this is your
call:**

```diff
 export default defineConfig({
+  resolve: {
+    // `monaco-editor` declares `module` and no `main`, so node resolution cannot find its entry
+    // and a test cannot so much as name it. Nothing outside a test imports it under node.
+    mainFields: ['module', 'main'],
+  },
   test: {
     environment: 'node',
```

With that in place the second file would assert, against a fake Monaco whose
`getTypeScriptWorker` rejects on the bare string exactly as the real one does: that the wait does
not finish while the service is still rejecting; that the bare-string rejection never escapes as a
rejection of its own; that a `typescript` model is created before the first ask and disposed after,
because polling *without* asking for the language would sit out the whole budget and then give up,
which is the same silent failure with a longer fuse; and that the model is made once however many
callers wait, since a second model at the same URI is something Monaco throws on outright.

`src/meta/ui/LibraryEditor.tsx`'s share of the fix (`7a24e80`) is blocked by the same wall: it
imports `monaco-setup.ts` statically, so the file cannot be loaded under node at all.

---

## 3. A limit and a par stop looking like the same number — `src/ui/__tests__/limit-and-par.test.ts`

11 tests, over the objective rail and the run report.

`w8-01` asks the run to close inside 215 ticks and pars at 165. Both were printed as "ticks" with
nothing to say which one ends the work order and which one moves the medal, and a player reading the
wrong one either rewrites a passing program or watches a good one fail.

**Nothing in the file hardcodes 215 or 165.** Both are read off the level, and the limit is asked of
the objective rather than of a copy of it — a tick budget's `progress()` reports `[spent, deadline]`,
so sampling it at tick zero is the objective naming its own limit. A par repair moves the
expectation with the level.

- Both numbers are on the rail.
- The one that ends the work order is printed under the word **limit**; the one that moves the medal
  under the word **par**.
- **The two are not introduced by the same word.** The test extracts the token immediately before
  each readout and asserts they differ, which is the defect stated directly: before the fix both
  read `ticks`.
- One line says which does what, and it is drawn only where both numbers are on screen — a graded
  level with no tick limit gets no note.
- An ungraded work order's rail calls the clock `ticks` and never `par`.
- **The report prints no par at all on an ungraded work order**, while still printing it on a graded
  one and still reporting the clock on both.

**Red against the old code** — `1a987de^`'s `ObjectiveRail.tsx` and `7a24e80^`'s `Results.tsx`:
**6 of 11 fail**, including every labelling assertion and the ungraded-report one.

Passing both ways, and correctly so: the fixture check; "both numbers are on the rail" (they always
were — the defect was the labelling, not the absence); "the report prints par on a graded work
order" and "the clock is still reported either way", which are the guards against over-correcting
the ungraded fix into a suppression of everything.

---

## 4. `LibraryUsage`, spent and paying nothing — `src/ui/__tests__/library-usage.test.ts`

13 tests, over the run report and the Structure tab.

The measurement rode on every run that linked `lib.ts` and was thrown away unread. Half the file
asserts the numbers are the real ones; the other half asserts nothing on any scoreboard moves.

**The numbers are real:**
- The routines counted are the ones that were **actually called** — the fixture includes a routine
  present in `calls` with `calls: 0`, so a naive `Object.keys` count reports three and fails.
- The line is read off **the seed the report is describing**, not seed one. Seed one carries a decoy
  with a distinctive number and the test asserts it never appears.
- A run that linked the library and called nothing prints nothing — a zero is a scoreline, and this
  is not one. A run that never linked it prints nothing either.
- One routine and one tick are written as one of each.
- The Structure tab's `Work orders` column prints the count of work orders that import each routine.
  The fixture makes the reuse count (3) and the call count (9) **different numbers**, so a row that
  prints the reuse count in the wrong column — or omits it — is caught by position rather than by a
  `3` appearing somewhere on the screen. A routine no work order imports prints `—`, not `0`. A
  fourth importing order moves the number.

**It pays nothing:**
- Rendering the report with and without heavy usage produces text that is identical once the usage
  line is removed — asserted as an equality, not as an absence.
- The score grid (clock, par, medal, points) is byte-identical across the two.
- The site map's campaign totals and the performance grade are unchanged by a Repository full of
  reuse.

**Red against the old code:** with `1a987de^`'s `Results.tsx`, `StructureScreen.tsx`, `src/ui/copy.ts`
and `src/meta/copy.ts`, **8 of 13 fail**. The five that pass both ways are the negatives — "says
nothing", "pays nothing" — which are guards against a future regression rather than against the old
code, and could not have failed before the feature existed.

---

## 5. The medal key, under a monochrome direction — `src/ui/screens/__tests__/medal-key.test.ts`

10 tests.

Every medal in the game is drawn as a ring on a node and was named nowhere, so the three words the
scoring ladder runs on were on the site map forty times over and defined zero times. The key is
drawn in the loaded direction's own marks, and that is the part with a way to be wrong.

**Does the key say what the board says?** The samples are matched against the board *in the same
render*: a save is built with a gold, a silver and a bronze in Boot Sector, and the test asserts each
key sample shares a mark with the node holding that medal and shares none with the other two. **No
medal class name is written down anywhere in the file** — the marks are a relation between two parts
of one screen, so an art rebuild that renames every medal modifier keeps this green while a key that
drifts from the board turns it red. The one literal class the file names is `node` itself, which is
what identifies a mark as a mark.

**Can the three be told apart without colour?**
- `signal` is pinned as genuinely monochrome first: its gold, silver and bronze sit within 1.4° of
  hue of each other. Without that the rest of the section would pass for a reason that no longer
  holds.
- So `signal` has to separate them by lightness, and does — 0.712 / 0.350 / 0.163 by the repo's own
  `luminance`, every gap over 0.1.
- **Every** direction separates each medal pair by hue *or* by lightness. `survey` and `standard`
  separate gold from silver by hue (42° against 212°) where their luminances are 0.02 apart; `signal`
  does the reverse. Neither channel alone is enough for all four, and the test says so.
- And the words work when neither does: three distinct medal names, three distinct rules, and the
  rules are checked against `medalForLevel` and `SILVER_FACTOR` rather than taken on trust — a key
  that lies is worse than no key.
- The samples are hidden from the accessibility tree and the words carry the meaning, so the row
  reads as "gold — at par or under" rather than as a decoration with a caption.

**Red against the old code:** with `1a987de^`'s `LevelSelect.tsx`, **7 of 10 fail** — every
assertion about the key. The three that pass are the palette-separability ones, which pin the
constraint the key has to satisfy rather than the key itself; they were true before the key existed
and the key is what makes them load-bearing.

---

## A real bug, found by writing these and **not** fixed

**The objective rail throws away an objective's declared meter and unit, and re-derives them from the
label.** This predates the UI pass. It is reported, not patched.

`ObjectiveRow` in `src/ui/panels/ObjectiveRail.tsx` carries `id`, `label`, `met`, `bonus`, `active`,
`progress` and `budget` — and no `meter` or `unit`. It hands that row straight to `budgetFor`, which
takes `objective.meter === undefined` at face value and falls back to parsing the prose. So on the
rail, **every objective in the campaign is treated as undeclared**, and DESIGN.md §11 A13's rule —
"`meterFor` / `budgetFor` prefer a declaration over the label; label parsing survives only as a
fallback" — is not in force there at all. The report is fine: `ReportObjective` is handed the verdict
objective, which does carry `meter`.

Measured against the campaign as it stands, with a source that has sensed nothing yet
(`{ trace: { events: [] } }`, no `stats` — the rail's state early in playback, and its state for the
whole of a run that never called the sense in question), three objectives disagree between the two
call sites. In each case the rail computes **no budget at all** where the report computes one:

| level | objective | rail | report |
| --- | --- | --- | --- |
| `w1-01` | `bay-booking` | `null` | ticks budget |
| `w5-02` | `eight-probes` | `null` | `probe` sense budget |
| `w8-01` | `shift-budget` | `null` | ticks budget |

Two of those three are unreachable in practice today: a `withinTicks` objective is *met* during
playback (the clock has not run out yet), which makes it "underspent" and gives the rail its budget
by a different route. `w5-02`'s is reachable — on a failed run that did not locate the break, the
report draws a gauge reading `3 / 8 probes` and the rail, replaying the same run, draws a plain
`3/8` counter. That contradicts `ReportObjective`'s own docstring: *"The rail and the report have to
agree — a budget that read as a gauge while the run played and as a tick-box in the report is two
different claims about the same number."*

**The larger cost is the trap laid for the next author.** A13 says a new objective "whose progress
counts anything must declare its meter", explicitly so that "its label is free to say whatever reads
best". Take that freedom today and the rail silently loses the gauge, the unit and — for a tick
budget — the `limit` tag that §3 above exists to protect, while the report shows all three.
`src/game/__tests__/budget-declarations.test.ts` reads as though the declaration is authoritative
everywhere. It is not.

The change, which I have **not** applied:

```diff
--- a/src/ui/panels/ObjectiveRail.tsx
+++ b/src/ui/panels/ObjectiveRail.tsx
@@
 interface ObjectiveRow {
   id: string;
   label: string;
   met: boolean;
   bonus: boolean;
   /** The one the run is working towards at this tick. Exactly one row has it, or none. */
   active: boolean;
   progress?: [number, number];
+  /** Declared by the objective (DESIGN.md §11 A13). Without it `budgetFor` parses the label. */
+  meter?: Meter;
+  /** Declared by the objective. Without it the noun is taken from the label. */
+  unit?: string;
   /** Set when this objective is something the run spends rather than something it completes. */
   budget?: Budget;
 }
@@
       const row: ObjectiveRow = {
         id: objective.id,
         label: result?.label ?? objective.label,
         met,
         bonus: bonusIds.has(objective.id),
         active: !atEnd && active?.id === objective.id,
+        ...(objective.meter ? { meter: objective.meter } : {}),
+        ...(objective.unit ? { unit: objective.unit } : {}),
       };
```

with `Meter` added to the existing `import type { Budget } from '../../game/budgets.ts'` line. It is
three lines and it makes the rail and the report read the same objective the same way.

I did not add a test that pins rail-against-report agreement, because the honest version of that test
is **red today** on `w5-02` and I was told not to change behaviour. Say the word and it goes in with
the diff above.

---

## Two things about the shape of this work

**Four hand-written renderers, not one shared fixture.** `src/__tests__/unused-exports.test.ts` pins
`KNOWN_TEST_ONLY = [67, 32]` as an exact pair, so a fixture module in a `__tests__` directory
exporting a driver read only by tests takes the first number to 68 and fails the suite. I cannot edit
`src/__tests__`. The hooks driver is therefore repeated in
`modal-dismissal`, `limit-and-par`, `library-usage` and `medal-key`, trimmed in each to the hooks that
file needs; `modal-boundary` carries a different one entirely (classes and the error contract, no
hooks). If you want them sharing one `src/ui/__tests__/react-driver.ts`, the ratchet line becomes:

```diff
-const KNOWN_TEST_ONLY: readonly [number, number] = [67, 32];
+const KNOWN_TEST_ONLY: readonly [number, number] = [68, 32];
```

one bump per exported name in the shared file.

**Accessibility.** Where a test asserts a role or an accessible name it is asserting the ARIA
contract the component publishes, not inferring a tree from markup — there is no DOM in this suite to
pull a tree from. The browser-side check that the UI pass already did stands; nothing here replaces
it, and nothing here should be read as having done it.

## Verification

`npx tsc --noEmit` clean · `npm run build` clean · `npx eslint src` clean but for the known
pre-existing false positive at `src/levels/world-5/__solutions__/w5-01.ts:32` · `npx vitest run`
**88 files, 1893 tests, green** (baseline 82 / 1831; this adds 6 files and 62 tests). Both ratchet
guards in `src/__tests__` pass untouched.
