# The Library needs a moment

Working notes for the item in `docs/OPEN-ITEMS.md` §"Decided, not yet started". Appended to on
disk as each unit of work lands, so the findings survive a lost session.

---

## 1. Verification — is the complaint true today?

The complaint was written against the 40-level campaign. `525ce7a` cut it to 34. Every number
below is measured against the current build.

### 1.1 Where the unlock actually fires

Campaign order today, from `campaignOrder()` over the eight `world-N/index.ts` registries:

| # | id | # | id | # | id |
|---|---|---|---|---|---|
| 1 | w1-01 | 13 | w4-04 | 25 | w7-01 |
| 2 | w1-03 | 14 | w4-05 | 26 | w7-02 |
| 3 | w1-05 | 15 | w5-01 | 27 | w7-03 |
| 4 | w2-01 | 16 | w5-02 | 28 | w7-04 |
| 5 | w2-02 | 17 | w5-03 | 29 | w7-05 |
| 6 | w2-04 | 18 | w5-04 | 30 | w8-01 |
| 7 | w2-05 | 19 | w5-05 | 31 | w8-02 |
| 8 | w3-01 | 20 | w6-01 | 32 | w8-03 |
| 9 | w3-02 | 21 | w6-02 | 33 | w8-04 |
| 10 | **w3-04 — LIBRARY_UNLOCK_LEVEL** | 22 | w6-03 | 34 | w8-05 |
| 11 | w4-01 | 23 | w6-04 | | |
| 12 | w4-02 | 24 | w6-05 | | |

`LIBRARY_UNLOCK_LEVEL = 'w3-04'` is **level 10 of 34 — 29% in**. Before the cut, World 1 had five
levels, World 2 five, World 3 four, so `w3-04` was level 14 of 40 — **35% in**.

**Finding: the cut already moved the unlock earlier, in proportion and in absolute level count.**
"It unlocks too late in the campaign" is stale as a positional claim.

### 1.2 What the player actually sees at that moment — traced

Confirmed by trace, not inference:

1. `src/ui/library.ts:208` — on `showResults` going true with a passing verdict, `refreshUnlock()`
   runs. `src/meta/store.ts:218` flips `save.unlocked` to `true` and persists.
2. Nothing observes `save.unlocked` except two components.
3. `src/ui/Workspace.tsx::StatusBar` returns `null` while locked, and once unlocked renders exactly
   one row: a `repository` toggle button and one `<span>` of status text.
4. That text is `libraryStatusLine()` (`src/meta/ui/LibraryPanel.tsx:115`), which with nothing
   published returns `REFACTOR.empty` — *"The Repository is empty. This is a supported configuration
   and no memo will be raised about it."*
5. `<LibraryPanel/>` returns `null` unless `panelOpen`, which only the status-bar button sets.
6. `UnlockMemo` — the memo, Dot's note, the legal footnote, the whole written introduction to the
   system — renders **only inside the panel**, only after the player has already clicked the grey
   toggle. A player who does not click never sees a word of it.

**Finding: "one grey status-bar line" is exactly, verbatim true today.** It is worse than the
phrase suggests, because the memo that would explain the system is gated behind discovering the
line that does not explain it.

For contrast, `wait()` — one function — arrives through `src/ui/screens/Requisition.tsx`: a modal,
a staged reveal with an audio cue per item, a signature, a spec line, an "opens" line, a link into
the reference, and a signed acknowledgement persisted to `seenRequisitions`.

### 1.3 The "six times" claim

Traced to its source: `docs/PLAYTEST-BEGINNER.md` §C2 —

> "I wrote the same generic serpentine sweep in w1-05, w2-03, w2-05, w3-01, w3-02, w3-03 — six
> levels, the same twelve lines — and the same greedy goTo(x,y) in four."

`w2-03` and `w3-03` were both deleted by the cut. **Four of the six survive** (w1-05, w2-05, w3-01,
w3-02), and all four are still before the unlock.

More importantly: **a sweep is not in the Library ladder at all.** `LIBRARY_REQUIREMENTS` names
`survey`, `pathTo`, `waves`, `unpack`, `findKey`, `deal`, `reach`, `dispatch`. No brief anywhere in
the campaign names a sweep. So the retyping the beginner actually suffered is not "the Library's
obvious contents" — it is retyping the Library was never scheduled to absorb.

**Finding: "six" is a pre-cut artefact and is four today; and the thing counted was never on the
ladder.** The complaint is directionally right about the player's experience and wrong about the
mechanism.

### 1.4 The real defect, which is worse than the one reported

Cross-referencing `LIBRARY_REQUIREMENTS`' own "earned in" column against the play order:

| Routine | Earned in | Level # | Distance from the unlock (level 10) |
|---|---|---|---|
| `survey` | w4-04 | 13 | +3 |
| `pathTo` | w4-04 | 13 | +3 |
| `waves` | w5-03 | 17 | +7 |
| `unpack` | w6-03 | 22 | +12 |
| `findKey` | w6-04 | 23 | +13 |
| `deal` | w7-04 | 28 | +18 |

**Zero of the six earned routines exists before the unlock.** Not one. The first brief that names
any routine is `w4-05`, level 14.

So the Repository is provisioned at level 10 and is **empty, unreferenced and inert for the next
three work orders** — w4-01, w4-02, w4-04 — with nothing on the ladder to hold and no brief asking
for anything. The dead panel is the defect, and the player's first impression of "the best idea in
the game" is an empty folder with a joke about being empty.

**This inverts half the instruction.** Moving the unlock earlier *on its own* makes the dead window
longer, not shorter. Earlier is only correct if the unlock also arrives with something true to say.

### 1.5 Why the beginner never even got a publish offer

`src/meta/store.ts:294` — `offerPublish` returns early unless
`publishableDeclarations(code, hardware)` finds a **callable top-level declaration** in the code the
player just closed the work order with.

A player who writes straight-line code in the work order body — which the starters model and which
the beginner did throughout — has no top-level function, so the offer never fires, ever. The
beginner's *"Publish offer never fired"* is not a bug; it is the discoverability chain being
conditional on the player having already independently adopted the habit the Repository exists to
teach.

**Finding: every route into the Repository is opt-in, and the one automatic route is gated on the
player not needing it.** The veteran, who factors by reflex, published at `w4-02` unprompted and
rated it 3/5. The beginner, who does not, never opened it and rated it 1/5. The system currently
only reaches players who would have kept a `lib.ts` anyway.

### 1.6 Verdict on the complaint

- "One grey status-bar line" — **true, verbatim.**
- "Unlocks too late in the campaign" — **stale.** It is level 10 of 34 and the cut already moved it.
- "After hand-writing its obvious contents six times" — **false as stated.** Four times post-cut,
  and the thing retyped was never on the ladder.
- The undiagnosed defect — **the Repository unlocks three levels before it has anything to hold, and
  its only non-optional entry point is gated on the player already writing top-level functions.**

The outcome the user wants is that players use it. Both halves of the fix follow from 1.4 and 1.5,
not from the literal complaint.

---

## 2. The decision, and the counter-argument it has to beat

**New unlock: the close of `w2-05`, the last work order of World 2 — level 7 of 34, 21% in.**
`LIBRARY_FIRST_WORLD` drops from 4 to 3.

### 2.1 Answering `unlock.ts`

The existing doc comment makes three claims. Taking them in order:

> "World 3 is where the player first writes code worth keeping."

**Accepted, and it is the argument for moving the unlock.** If World 3 is where keepable code is
first written, the file that keeps it has to exist *before* World 3, not after it. The current
setting provisions the Repository at the *close* of World 3 — after every line World 3 produced has
already been thrown away. That is an off-by-one against the comment's own criterion, and the level
cut widened it: World 3 lost `w3-03` and `w3-05`, so the unlock now sits at the end of a
three-level world where it used to sit at the end of a five-level one.

> "Handing the Repository over any sooner would put a second editor tab in front of a player who is
> still learning what a `while` loop does."

**This describes a World 1 player, not a World 3 one.** `while` is taught in World 1 (`w1-03`,
`w1-05`). By the close of `w2-05` the player has closed seven work orders and has written loops,
conditionals, a state machine and a resource cycle; `w2-05`'s objective is a quota fill. The move
keeps Worlds 1 and 2 — the entire on-ramp, seven levels — strictly one file. Nothing about the
first hour changes.

> "The on-ramp has to stay one file."

**Honoured, unchanged.** `LibraryPanel` still renders `null` unless `panelOpen`; the ceremony's
secondary action dismisses without opening anything; the status bar remains a toggle, not a tab;
and the campaign is still finishable by a player who never opens it (DESIGN.md's rule).

### 2.2 Why it must not move *later*, which the evidence also supports

§1.4 shows the ladder's first rung is `w4-04`, so an unlock timed to the ladder would land at level
13 — three levels *later* than today. That is the timing that would make the ceremony maximally
honest, and it is wrong anyway, because it would delete the one documented instance of the system
working: the veteran published `key`, `ahead` and `compass` at **`w4-02`** unprompted, reused them
at `w4-04`, and said `pathTo`/`reach` was the one thing he would use without being nudged. A
`w4-04` unlock takes that away.

So the unlock cannot follow the ladder. It has to follow the *retyping*, and the retyping starts at
`w1-05`.

### 2.3 Why `w2-05` specifically, and not one level either side

`w1-05` is `Floor Inspection`, whose objective is literally `inspectedEveryTile()`. `w2-05` is
`Harvest Quota`. `w3-01` is `Pick and Place` and `w3-02` is `Sorted by Colour` — the beginner wrote
the same twelve-line serpentine sweep in all four (§1.3). Unlocking at the close of `w2-05` puts
the file in the player's hands with **two of those sweeps behind them and two immediately ahead**.
It is the earliest point at which "you are about to write this again" is true of code the player
has *already written twice*, and it lands on a world boundary rather than mid-world.

One level earlier (`w2-04`) is mid-world and the player has swept once. One level later (`w3-01`)
buys nothing the current setting does not already have.

### 2.4 The cost, stated

Moving to the close of World 2 lengthens the window in which the **ladder** has nothing in it from
three work orders to six. That cost is real and it is paid off by the other half of the fix: the
panel is no longer *discovered* empty and unexplained, it is *delivered*, with what goes in it and
what will ask for it. An empty file you were handed is a different object from an empty file you
found.

### 2.5 Difficulty and the hard rules

- **Difficulty is not lowered.** A published subroutine is charged at the point of use, in full, on
  every call (`UNLOCK_MEMO`). Lifting a sweep into `lib.ts` costs exactly the ticks it cost inline.
  Medals are ticks. Nothing gets cheaper; only the typing moves.
- **No level becomes unsolvable without a published routine.** `LIBRARY_REQUIREMENTS` is untouched
  — same eight routines, same ten work orders, still hints about prose the briefs already contain.
- **No character count is introduced.** The ceremony deliberately does *not* show line or character
  counts of the player's own code, which was the first draft of the "show them their retyping"
  idea and was dropped for exactly this reason.

---

## 3. What was built

### 3.1 The unlock moved — `src/meta/unlock.ts`

`LIBRARY_UNLOCK_LEVEL` `'w3-04'` → `'w2-05'`; `LIBRARY_FIRST_WORLD` `4` → `3`. The file's doc
comment is rewritten to argue the new position against the old one rather than silently replacing
it, since the old argument was real and its premise is retained.

Three new exports, all pure:

- `isDeliveryNoteOwed(save)` — `save.unlocked && !save.briefed`. The ceremony's gate, extracted so
  it is testable without a React renderer (the repo has no component-test harness and adding one
  would mean a new dependency).
- `requirementLevelCount()` — how many work orders name a subroutine.
- `nextRequirementAfter(orderedLevelIds, currentLevelId)` — the next work order that will name one.
  The play order is an argument, not an import: `src/meta` still does not know `src/levels` exists.

### 3.2 The ceremony — `src/ui/screens/RepositoryIssue.tsx` (new)

Reused `Requisition`'s shape, as instructed, and for the reason given: the inconsistency *was* the
defect. Same `overlay` / `modal--requisition` / `crate` markup, same `useReveal` staged reveal,
same `audio.cue('spawn', n)` per stage, same footer. It lives in `src/ui/screens/` rather than
`src/meta/ui/` because it needs `useReveal` and `audio`, and `src/meta` must not import from
`src/ui`. Its copy lives in `src/meta/copy.ts` as `REPOSITORY_ISSUE`, which is the allowed
direction.

The three jobs the note had to do:

1. **Say a persistent second file now exists.** The crate's name is `lib.ts`, not a function.
   Spec: *"A second file, kept between work orders. It is not reset when one closes."*
2. **Show why, from data rather than prose.** A code line — `import { pathTo } from 'lib';` — with
   the name taken live from the next requirement, and one strip built from
   `requirementLevelCount()` and `nextRequirementAfter()`: *"10 later work orders name a subroutine
   they expect to find in it. The first is `w4-05`."* Both numbers are read out of
   `LIBRARY_REQUIREMENTS`, so neither can drift from the ladder.
3. **One click from opening it.** The primary button is `Open it`, which calls `markBriefed()` and
   `setPanel('library')` — the panel opens on the editor. `Sign for it` dismisses.

Total prose in the modal: one intro line, one spec line, one import caption, one asks line, one
charge line, one line from Dot. Nothing is explained; the file is shown.

Also promoted into it: **the per-call charge**. The veteran's §5 complaint was that
*"a subroutine is charged at the point of use, in full, on every call"* lived only in the memo he
read *after* publishing. It is now in the delivery note, before the first publish.

New CSS in `src/ui/screens/repository-issue.css` (new file). The three shared stylesheets another
agent owns were not touched — only their existing classes are reused, which requires no edit.

### 3.3 Queueing — no stacked modals

The veteran's other §5 complaint was three modals on one transition. `RepositoryIssue` renders
`null` while `showResults` is up (the medal goes first) and while a hardware `requisition` is
pending (the crate goes second), and only outside the workspace screen it renders nothing at all.

And `offerPublish` in `src/meta/store.ts` now returns early unless `save.briefed`. Offering to
publish into a Repository the player has not been told about was both the third modal and
incoherent; the offer fires from the next work order onward, unchanged.

Traced sequence at the close of `w2-05`:

| # | Event | What is on screen |
|---|---|---|
| 1 | verdict passes, `refreshUnlock()` | Results — `unlocked` becomes true |
| 2 | results dismissed, `advanceToNextLevel()` | `offerPublish` fires and returns early (`!briefed`) |
| 3 | `openLevel('w3-01')` | hardware requisition — `pickup`, `drop` |
| 4 | requisition signed | **the Repository delivery note** |
| 5 | `Open it` | workspace, panel open on `lib.ts` |

### 3.4 Files touched

| File | Change |
|---|---|
| `src/meta/unlock.ts` | unlock level, first world, rewritten rationale, three new exports |
| `src/meta/copy.ts` | `REPOSITORY_ISSUE` |
| `src/meta/store.ts` | `offerPublish` gated on `briefed` |
| `src/meta/index.ts` | re-exports |
| `src/ui/screens/RepositoryIssue.tsx` | **new** — the ceremony |
| `src/ui/screens/repository-issue.css` | **new** — two classes the crate does not have |
| `src/ui/App.tsx` | renders it |
| `src/meta/__tests__/unlock.test.ts` | **new** — 18 tests |
| `docs/LIBRARY.md`, `README.md`, `docs/OPEN-ITEMS.md` | the stale "end of World 3" claims |

`src/levels/**`, `src/ui/Workspace.tsx`, `src/ui/panels/**`, `src/render/**`, `app.css`,
`screens.css` and `tokens.css` were **not** touched.

One incidental diff: `npx prettier --write src/meta/unlock.ts` reflowed three pre-existing
`assumes:` lines that were one character over the print width on `main`. Confirmed pre-existing by
stashing and re-checking. Semantically identical; left in rather than reverted, so the file passes
`prettier --check`.

### 3.5 Tests — `src/meta/__tests__/unlock.test.ts`, 18 new

**Timing**, all measured against the real `campaignOrder()` rather than a fixture, so a future
level cut breaks the test rather than the game:

- the unlock is the last work order of World 2;
- every work order before it leaves the Repository locked — the on-ramp is asserted, not assumed;
- every work order from it on has it unlocked, and it never re-locks;
- it arrives strictly before the first work order that names a subroutine;
- every work order in `LIBRARY_REQUIREMENTS` is in `LIBRARY_FIRST_WORLD` or later.

**The note's stated reason**: names the right next work order from any starting point, answers with
itself on a requirement level, returns `null` past the last one rather than wrapping, falls back to
the first requirement for an unknown or absent level, and its count matches the ladder.

**Save compatibility**, which is the risky part of moving an unlock:

| Save | Expected | Asserted |
|---|---|---|
| passed the old `w3-04` | keeps its Repository | ✓ |
| already `unlocked` | `refreshUnlock` never re-locks it | ✓ |
| `unlocked` + `briefed` | does not sit through the note again | ✓ |
| `unlocked`, never briefed (the beginner's save) | **is still owed the note** | ✓ |
| abandoned mid-World-3 | provisioned, not left locked | ✓ |
| still in the on-ramp (`w2-04`) | left locked | ✓ |

**The publish gate**: no offer while unbriefed; the offer fires normally once briefed.

### 3.6 Green

- `npx tsc --noEmit` — clean.
- `npx vitest run` — **1416 passed, 50 files** (baseline 1398 + 18 new). No pre-existing test
  touched.
- `npx eslint src` — one error, `src/levels/world-5/__solutions__/w5-01.ts:32`, the
  `react-hooks/rules-of-hooks` false positive on `use()` already logged under Housekeeping in
  `OPEN-ITEMS.md`. Not in a file this work touched.

### 3.7 Driven in the real build, not just asserted

`npx vite build` then `vite preview`, with a seeded `localStorage` save, in Chrome. Four checks,
all passing:

1. **The on-ramp is still one file.** Save closed through `w2-04`, opened `w2-05`: no status bar,
   no note, no second column. Nothing about the first seven work orders changed.
2. **The queue holds.** Save closed through `w2-05`, opened `w3-01`: the hardware requisition for
   `pickup`/`drop` came up *first*, alone. The Repository note stayed suppressed behind it.
3. **The note lands.** Signing the hardware crate raised the delivery note, in the requisition's
   visual language, with both data-driven lines live: `import { survey } from 'lib';` and
   *"10 later work orders name a subroutine they expect to find in it. The first is `w4-05`."*
4. **One click opens it.** `Open it` put the player in the Repository panel on the `lib.ts` tab
   with the file open and the import hint above it. Reloading afterwards did **not** re-raise the
   note — `briefed` persisted — and the status bar took over as the standing affordance.

No console errors. The accessibility tree exposes the modal as
`dialog[aria-modal] aria-label="Shared Subroutines Repository provisioned"` with both buttons
named; it does not trap focus, which matches the existing `Requisition` exactly and was left
consistent rather than diverging.

`vite build` also confirms Monaco stayed out of the entry chunk: `RepositoryIssue` deep-imports
`meta/copy.ts`, `meta/store.ts` and `meta/unlock.ts` rather than `meta/ui/index.ts`, which is the
same precaution `App.tsx` already takes for `PublishDialog`.

---

## 4. Deliberately not changed

- **`LIBRARY_REQUIREMENTS`.** Not one entry. Same eight routines, same ten work orders. No level
  became gated, nothing became unsolvable without a published routine.
- **The Regression tab.** Both testers praised it; explicitly off-limits.
- **The publish dialog's nineteen checkboxes.** The veteran's "unit of publication is wrong"
  complaint is real and is the in-flight Library-integrity worktree's job, not this one.
- **`UnlockMemo` and the `!save.briefed` branch of `LibraryPanel`.** Still reachable — a player who
  opens the panel from the status bar while the note is queued behind a hardware crate gets the
  memo. Vance's writing survives, and the one load-bearing sentence in it now also appears in the
  note, where it is needed earlier.
- **The status-bar line.** It stays as the persistent affordance; it was never wrong as a *toggle*,
  only as an *introduction*.
- **Character count.** Nothing was added near scoring. The first draft of the note showed the
  player line counts of their own duplicated code as the "why"; it was cut for this reason.
- **Any brief.** `src/levels/**` is owned by three prose agents right now — see §5.

---

## 5. Brief changes for the orchestrator to apply after the prose merge

**None are required.** The fix is deliberately brief-free: every claim the delivery note makes is
computed from `LIBRARY_REQUIREMENTS`, so it stays true whatever the prose agents write.

Two things worth handing to the prose agents as *optional* follow-ups, both cheap and neither
blocking:

1. **`w3-01` and `w3-02` may now assume the Repository exists.** `LIBRARY_FIRST_WORLD` is 3, so a
   brief in World 3 is permitted — but not required — to mention that a routine is worth keeping.
   Nothing today does, and nothing has to. If a prose agent wants the ladder to start earlier, the
   natural rung is the floor-walk those two work orders and `w1-05` all want; it would need a new
   `LIBRARY_REQUIREMENTS` entry keyed to whichever of the two names it, and the entry must stay a
   hint, never a gate.
2. **`w4-04`'s brief is where `survey` and `pathTo` are earned.** Under the old timing the player
   met the Repository three levels before this and had forgotten it. Under the new timing they met
   it seven levels before and may have already published something. If `w4-04`'s brief currently
   reads as though `lib.ts` is a novelty, it can now read as though it is furniture.

