# UI and visual audit — re-triaged for the desk

The original audit ran 2026-09-05 against `main` at `8e67604` and landed at `eb2b88d`
(*docs: UI and visual audit*). It found 23 defects in a UI that no longer exists: the art rebuild
(`a8cd0a6`) replaced the panel workspace with a board-first one, the objectives rail became a real
inset strip with a fold (`docs/FIX-HUD-OVERLAP.md`, `b66d73e`), and the whole interface is about to
be replaced again by the desk.

**This file is the re-triage.** Every finding is quoted and then ruled into exactly one bucket:

- **CLOSED** — fixed. Named against the commit or the file that closed it, and against what I read
  in the current tree to believe it.
- **DISSOLVED** — the redesign removes the surface *and* the need. There are none. §3 says why, and
  that section is the one to argue with rather than skip.
- **CARRIED** — a real requirement, restated as a requirement *on the desk* rather than as a
  complaint about a panel that is already deleted.
- **RULED** — a standing ruling, not a defect. There are none of these either; §7 lists the rulings
  that bind the carried items instead.

Counts: **6 closed, 0 dissolved, 17 carried, 0 ruled.**

Read §2 (the requirement index) if you are building the desk and read nothing else. Read §6 for the
six things this audit missed the first time and that matter more than half of what it caught.

**What was dropped in the rewrite.** The original carried a CSS diff for most findings. Those diffs
were written against `app.css`, `screens.css` and `theme.ts` as they stood before the art rebuild
and several of the selectors no longer exist; applying them now would be archaeology, not work.
They are in git at `eb2b88d` if a number in one is wanted. The screenshots under
`docs/shots/audit-ui/` are evidence for the *original* finding and are pictures of a UI that has
been deleted — do not measure the current build against them.

**Method, stated so it can be discounted.** This pass is a source-and-test re-read, not a browser
session: `npx vitest run` green at **1900 tests / 90 files**, plus reading `src/ui/**`,
`src/render/**` and `src/meta/ui/**` at `75e88f3`. Where the original measured a box in Chrome and I
could only read the rule that sizes it, I say so and give the rule. Nothing below is asserted from
the earlier audit's word alone.

**The direction.** `DEFAULT_ART` is `deepsite` (`src/ui/art.ts:19`). Everything ruled below is ruled
against Deep Site as shipped. Where a finding is fixed in `survey` or `signal` and not in `deepsite`
— F6 is the one — it is carried, because the direction the player gets is the one that counts.

---

## 2. The requirement index

The carried findings as one list, in the order I would build them. This is the hand-over.

1. **Draw the board's coordinate system.** The player is handed `want (23, 12)` and `19 East, 5
   South, 22 West` and given no way to name a tile. *(F6)*
2. **The divergence must survive the report.** It exists for the length of one modal and is then
   deleted from the game. *(F5)*
3. **The paper must not cover the machine it describes, and must be readable at length.** *(F4, F15,
   F16 residue)*
4. **The doors to the reading surfaces must be as prominent as what is behind them.** All four are
   10px chips in a corner today. *(F12)*
5. **The grade must be readable off the board without hue discrimination.** *(F1)*
6. **A work order's name must fit the space it is given, and no rail may run past the work on it.**
   *(F2)*
7. **The player's overall standing must exist somewhere permanent.** *(F18)*
8. **The result must be comparable to something the player owns.** *(F8)*
9. **An enabled control must not look disabled.** *(F11)*
10. **A preference must be set where preferences live, and its off-state must name the state it
    moves to.** *(F7, F19)*
11. **Every key the game binds must be findable in the game.** *(F17)*
12. **One quantity, one number, one word for it.** *(F22)*
13. **Restatement is not emphasis** — a failure stated three times in one card is still one failure.
    *(F5b, F10)*
14. **The commendation record must be reachable and must carry its date.** *(F14)*
15. **The board, the brief and the rail must not wait on the editor's chunk.** *(F23)*

---

## 3. Why nothing is dissolved

I was asked to be honest about this rather than generous, so: **zero of the 23 dissolve.**

The desk removes surfaces. It does not remove needs. Every finding below that survives is a finding
about something the player has to *be able to do* — name a tile, read a manual, find their grade,
tell an enabled button from a dead one — and moving that job from a panel to a piece of paper on a
desk changes where it is done, not whether it has to be done. "The docs panel goes away" is not a
fix for "the manual is unreadable"; it is a promise that the manual will be readable somewhere else,
and a promise is what this file exists to hold onto.

Two honest caveats.

**`docs/DESK-CONCEPT.md` does not exist yet.** It was being written in parallel with this pass and
was not on disk at `75e88f3`. So I am ruling against the organising rule as it was given to me —
*the screen is the work, the paper is the company* — and not against a design. I have deliberately
not credited the desk with fixing anything it has not written down. If the concept document lands
and genuinely deletes a need, that is a two-line amendment to this file and it should be made
against the specific finding rather than by waving at the redesign.

**Three findings are *close* to dissolved and are worth re-reading once the concept exists**: F15's
detail-panel cap (the panel is already gone; the disease came back on the brief sheet — see the
ruling), F4's duplicated hardware block (dissolved the moment the requisition stops being a modal
that fires once and becomes a document that stays), and F10's five identical seed rows (dissolved if
the per-seed list becomes a stamped schedule rather than a list of sentences). None of the three is
dissolved *today*.

---

## 4. CLOSED — six

### F3 — "The site view is empty until you press Run. This is the worst thing on the screen."

> `w1-01`, standing start, 1680×836. Measured: Monaco **945×734**, site view **727×407**. The site
> view contains the words `NO TRACE ON FILE / Run the program. The site replays from the trace, so
> you can scrub it afterwards.` and nothing else. **The player has not seen the map.** […] This is
> the single biggest gap against the genre bar. **Opus Magnum, TIS-100, Baba Is You and Factorio all
> open on the board.**

**CLOSED** by the art rebuild (`a8cd0a6`).

`Workspace.tsx` memoises `trace?.initialWorld ?? level.build(level.seeds[0])` and hands it to
`ViewportPanel`, which calls `renderer().setPreview(world)`; the renderer guards on world identity
and re-fits the camera. `src/render/__tests__/preview.test.ts` covers it. The `no trace on file`
copy still exists but is now `.viewport__empty` — a two-line note in the workspace's bottom-left
corner over a drawn board, with its own comment saying why it is a note and not a block.

The board is also no longer a panel: it is the whole workspace, and the rig, the read-out and the
sheets float over it. The finding's "largest, most expensive-looking region of the screen is dead on
arrival" is now the opposite problem — the largest region is the first thing drawn.

**For the desk:** this is the one thing in the current build that must survive the rewrite intact.
If the desk puts the site view inside a smaller frame to make room for paper, the establishing shot
goes with it.

### F9 — "The run report's last paragraph is drawn underneath its own footer."

> `.modal__body` is `overflow: visible` and its content is **113px taller than the box it is in**.
> […] The sentence `Nothing was billed. Attempts are not recorded against you.` — which exists
> specifically to stop a new player thinking a failed run costs them something — is rendered
> *behind an opaque bar*. `scrollHeight === clientHeight`, so nothing scrolls.

**CLOSED.** `src/ui/styles/app.css:1357`:

```css
.modal__body,
.requisition__body {
  flex: 1 1 auto;
  min-height: 0;
  overflow-y: auto;
}
```

Exactly the fix the finding asked for, applied to the requisition body as well. `NO_PENALTY` still
renders as the last line of `.failure-box` inside that scroller (`Results.tsx`), so the sentence is
reachable.

### F13 — "The Repository greets you with 37 words, in red, telling you off for a state it just put you in."

> The first line is **red** (`--danger`). It is 21 words of disapproval about a folder the player was
> handed four seconds ago and has not touched. The second line, directly underneath, says the state
> is *fine*. […] The standing directive is cut text, show don't tell, de-noise in doubt. This is the
> clearest violation of it in the game.

**CLOSED.** `src/meta/copy.ts:320` now carries the finding by number in its own comment, and the
warning is one line, not red, and conditional:

```js
const owed = result.exports.length === 0 && publishableDeclarations(source).length > 0;
warnRef.current.textContent = owed ? NO_EXPORTS_WARNING : '';
```

`NO_EXPORTS_WARNING` is *"lib.ts exports nothing. Add `export` to a declaration and any work order
can import it."* — 15 words, actionable, and only shown when there is something to export. It
renders in `.lib__note`, which is `--ink-dim`, not `--danger`. The duplicated status-bar sentence is
gone too: `REFACTOR.nothingToCost` is the tab's own empty state and cites F12 for why.

### F16 — "The manual for a programming game is displayed in a 390 × 290px box."

> **Eleven and a half thousand pixels of documentation, shown 290 at a time.** That is a
> thirty-nine-screen scroll through a window the size of a business card […] There is also **no way
> to make it bigger**. […] the top-bar book icon does not open an overlay — it calls
> `setPanel('docs')`, which switches the *same* 390×290 tab.

**CLOSED** by the sheet. `src/ui/styles/app.css:1717`:

```css
.sheet--docs { width: min(628px, calc(100% - var(--rig-w, 40%) - var(--space-6))); }
.sheet { height: calc(100% - var(--space-3) - 52px); }
```

The reference is now a 628px-wide, full-workspace-height card set to 78ch — roughly 628×700 at the
window the original measured 390×290 in, which is about five times the reading area. It is
positioned to the *right* of `--rig-w`, so it does not cover the program: the finding's real
requirement — *read the manual while the program is on screen* — is met, and met better than the
proposed "expand into the editor column" would have met it.

The top-bar book button and the `reference` chip are still two controls for one action, but they now
do the same visible thing, so the "the more prominent one implies a bigger surface that does not
exist" half is gone. What the reference now covers is the **board** — see §6.1, which is the version
of this problem the desk inherits.

### F20 — "Two unhandled promise rejections on every page load."

> Fires twice on a clean reload of the site map, before any interaction. […] It is a `void`-ed or
> un-`catch`-ed promise in `src/ui/library.ts` around line 87 and it should be handled either way.

**CLOSED** (`7a24e80`), and it was worse than the finding thought. The rejection value was the bare
string `'TypeScript not registered!'`; `installTypes` asked Monaco for the TypeScript worker in the
same tick as mount, before any editor existed, and lost the race on a cold module cache — twice,
because StrictMode mounts twice. The consequence was not cosmetic: the `declare module 'lib'` that
`installTypes` publishes was silently never installed on that pass, so **a player's own `import`
stayed red until the next Run.**

`src/ui/monaco-setup.ts:94` now holds a memoised `typescriptRegistered()` that polls for the worker
with a bounded retry and logs through `console.error` rather than rejecting; `LibraryEditor.tsx`
awaits it before `compileLibrary`, which closed the same race on the path the original guard was not
on. Covered by `src/ui/__tests__/typescript-registration.test.ts` and `monaco-registration.test.ts`.

### F21 — "The publish offer crashes the whole application to a black screen."

> `selection` is memoised on `offer`. The effect calls `setSelection`, which replaces `offer` with a
> **new object**. That invalidates the memo, which produces a new `selection` array, which re-fires
> the effect […] Unconditional infinite update loop on mount. […] **And put a boundary above the
> modal layer.**

**CLOSED**, both halves, and the cure is better than the proposed guard. `setSelection` no longer
exists in `src/meta/store.ts` at all — grep returns only `confirmPublish(selection)`. The selection
is local `useMemo` state in `PublishDialog.tsx` and is passed to `confirmPublish` at the point of
use, so there is no store round-trip to loop on (`f90f842`;
`src/meta/__tests__/publish-dialog.test.ts`).

The boundary landed separately: `src/ui/components/ModalBoundary.tsx` wraps all five modals in
`App.tsx` — `Results`, `PublishDialog`, `RepositoryIssue`, `Requisition`, `ReviewMemo` — each with
its own `onDismiss` so a fault in one hands the player back to the workspace rather than to
`--bg-void`. `src/ui/components/__tests__/modal-boundary.test.ts` asserts it catches, which is the
test the original containment pass shipped without.

**For the desk:** whatever replaces the modal layer keeps the boundary. A rendering fault in a piece
of paper must not be able to delete the desk.

---

## 5. CARRIED — seventeen

Each of these is restated as a requirement on the desk. "Satisfied by" is the test I would apply.

### F1 — the grade is a ring colour

> Seeded 12 work orders closed in a gold / silver / bronze cycle. […] On screen the only difference
> between them is the border colour of a 44px disc: `#ffd166`, `#c0cbd8`, `#cd8b52`. Every one of
> them carries the same word underneath — **`CLOSED`, in the same green, at the same weight** — and
> there is no legend anywhere on the screen. […] **Colour is the sole channel.** […] **The medal
> ring collides with the world identity ring.**

**Two thirds of this closed. The third is the finding.**

Closed: the collision. `src/levels/index.ts`'s eight literal accents are no longer read by the site
map — `LevelSelect.tsx` sets `'--world-accent': var(--world-${row.world.id})`, and `tokens.css`
defines the eight as one hue cooling across the campaign with `--danger` and `--gold` taken back.
Closed: the legend. `LevelSelect.tsx:333` renders a `medal-key` whose samples are *real nodes with
the real modifier classes*, so the key is drawn in whatever marks the loaded direction draws, and
`src/ui/screens/__tests__/medal-key.test.ts` holds it to the board and to being separable without
colour. `nodeLabel()` announces `gold medal` / `Not graded` in the accessibility tree.

Open, under Deep Site specifically: the node itself. `.node--gold/.node--silver/.node--bronze` set
`border-color` and a `box-shadow` tint and nothing else (`screens.css:311`), and `deepsite.css:652`
squares the disc without adding a mark. `signal` solved this properly — *"gold is the only inverted
badge on the screen, silver is a struck rule, bronze is a dotted one […] four weights, four
silhouettes, no hue"* — and that is the standard. A legend tells you what the colours mean; it does
not help you tell two warm rings apart at 44px across 33 of them.

**Requirement.** A work order's grade must be legible from the board without discriminating hue —
by shape, weight, fill or a glyph, redundantly with colour.
**Satisfied by:** rendering the board in greyscale and still being able to sort the closed orders
into three piles. `MedalBadge` already prints `I / II / III / — / ✓` and is used on exactly one
screen; that is still the cheapest answer.

### F2 — half the rail is empty, and titles truncate beside it

> `.world__nodes` is `grid-template-columns: repeat(5, minmax(0, 1fr))` — **hard-coded to five** […]
> The rail is the strongest horizontal line on the screen and on four of the eight worlds it runs
> 600px past the last thing on it, into nothing. […] Simultaneously, in a **246px-wide** node slot,
> `.node__title` carries `max-width: 15ch` (≈109px) with `text-overflow: ellipsis`. `The Sensor
> Package` renders as `The Sensor Packa…` **with 576px of blank rail immediately to its right.**

**CARRIED, and it has got worse since the audit.** Both rules are unchanged (`screens.css:239`,
`screens.css:374`), and the campaign is no longer 34 orders in even worlds — it is 33, distributed
**3, 3, 3, 4, 5, 5, 5, 5**. Three worlds now fill two fifths of their rail; the audit found two that
filled three fifths. Twelve of the surviving titles are longer than 15 characters; the longest is
`Map First, Move Second` at 22.

**Requirement.** Whatever draws the campaign must be sized by the work it holds, and a work order's
name must be readable in full where it is listed.
**Satisfied by:** World 1 (3 orders) and World 8 (5 orders) drawn at the same pitch with no dead
track, and every one of the 33 titles rendering without an ellipsis at the smallest window the game
supports.

### F4 — the brief hides the hint button

> Measured on `w1-01` at 1680×836: `.doc-pane.brief` has `clientHeight: 300`, `scrollHeight: 949`.
> **649px — 68% — is out of sight**, and macOS overlay scrollbars mean there is no scrollbar at
> rest. […] The hint system is the game's whole answer to "the player is stuck". It is the last
> element of a 949px document displayed 300px at a time. **Assume nobody reads: the hint button is
> hidden.** […] **Delete the `HARDWARE REQUISITION` block from the brief on the run where the
> requisition modal fired.**

**Partly closed.** The scroll cue is fixed: `docs.css:6` gives `.doc-pane` a real, always-present
scrollbar (`scrollbar-width: thin`, `scrollbar-color`, and a 10px `::-webkit-scrollbar` with a
`--border-strong` thumb), which overrides the macOS overlay behaviour the finding blamed. The pane
also grew: the brief is a 468px-wide sheet up to 600px tall rather than a 300px box.

Open, and unchanged in structure: `Request hint {n} of {n}` is still the **last element of the last
section** of `BriefPanel.tsx`, below the head, the body, `Site data`, `Hardware requisition`, the
already-fitted chips, the Repository routines and `Field notes`. On `w1-01` that document was 949px
in a 430px-wide pane; at 468px wide it is not going to fit in 600. Also unchanged: the brief still
prints `Hardware requisition — Delivered with this order` with the same chips the requisition
ceremony showed a minute earlier.

**Requirement.** The escape hatch for a stuck player must be reachable without reading to the end of
a document. The work order must not deliver the same four chips twice inside a minute.
**Satisfied by:** the hint control being visible at the moment the work order is opened, at every
window size, without scrolling — and the hardware block appearing on a *return* visit rather than on
the visit where the ceremony fired. If the desk makes the requisition a card that stays on the desk,
the second half closes by construction; say so when it does.

### F5 — the divergence is thrown away, and stated four times before it is

> **The modal is the only place the divergence exists.** Dismiss it and there is nothing. I clicked
> *Jump to the failure* — the button whose name promises exactly this — and got the workspace at
> tick 1 with **nothing marked on the map, nothing in the rail** […] `grep` for `divergence` across
> `src/ui`: it appears in `Results.tsx` and nowhere else. […] **The same failure is stated four
> times in a 633px box.**

**CARRIED, both halves, and the grep still gives the same answer.** `divergence` appears in
`src/ui/screens/Results.tsx` and in no other file under `src/ui/` or `src/render/`.
`ObjectiveRail.tsx` builds `ObjectiveRow` out of `label / met / bonus / active / progress / meter /
unit / budget` — there is no divergence field. `drawBrackets` in `src/render/overlays.ts` is used
for goals and hover and never for a want/got pair.

The presentation is still the best block in the report and still should not be touched: `cause__diff`
sets `where` dim above a `want` / `got` pair aligned in mono, in a red-bordered card at the top.

The restatement count is down from four to three: the header flavour line, the `this is why` cause
row, and the `failure-box` at the bottom repeating the engine's sentence. The report now leads with
the cause instead of the flavour and ranks multiple causes worst-first, which is a real improvement,
but a single-seed failure still prints the objective's name in the cause row, again in the
objectives list, and again in the failure box.

**Requirement.** The one piece of feedback the game computes about *where* a run went wrong must
outlive the document that announces it, and must land on the site view where the two coordinates
are. Saying it once is enough.
**Satisfied by:** dismissing the report and still being able to see where `want` and `got` are —
marked on the board, and named on the failing objective's row — with the report itself naming the
failure once.
**Bound by:** feedback is a diff and never an oracle (`docs/OPEN-ITEMS.md`). Marking two cells the
engine already computed is a diff. Drawing the route between them that the player *should* have
taken is an oracle. Do not cross that line.

### F6 — you cannot count tiles, and the game is about counting tiles

> 18% and 30% of a mid-slate over a mid-grey floor sprite. […] the every-fifth-line major rhythm
> that `drawGrid(…, major = 5, …)` deliberately builds […] cannot be perceived. […] The brief's
> *Site data* table says `ROUTE AFTER IT: 19 East, 5 South, 22 West, 5 South, 22 East`; the failure
> report says `want (23, 12)`. Both require the player to count cells. There are no axis labels, no
> ruler, and no coordinate readout on the canvas. **The player is given coordinates and no
> coordinate system.**

**Half closed, and the half that closed is not the half that matters.**

Closed: the lattice. Deep Site's overlay is `grid: rgba(214,231,240,0.14)` against `gridMajor:
rgba(214,231,240,0.34)` at `gridMajorWidth: 1.5` versus `gridWidth: 1` — separated by weight *and*
alpha rather than by twelve points of alpha alone. `metrics.gridMinTilePx` is 8, so the
`if (tile < 10 * dpr) return` cliff that erased the grid entirely on a 13" laptop now bites two
rungs later, and the art pass doubled tiles on `w4-05` and `w8-05` with a test that no level shrinks.

Open: the coordinate system. `survey` built one — a margin ruler with numbers every fifth cell,
whose own comment cites this finding — and **Deep Site did not**. `deepsite.ts`'s `post()` draws
vignette and motes and no furniture. And the hover readout the finding asked for is *built and not
wired*: `renderer.readoutAt(x, y)` and an `onHover` option both exist and return a `TileReadout`;
grep across `src/ui/` and `src/game/` for either returns nothing. The numbers are still being
computed and thrown away, exactly as the audit said, one layer further along.

**Requirement.** A player handed a coordinate must be able to find that cell, and a player counting
a route must be able to count it. Under the direction that ships.
**Satisfied by:** pointing at any cell on `w4-05` at the smallest supported window and being able to
say which one it is — a ruler, axis numbers, a hover readout, or all three. `readoutAt` is one wire
away from the last of those.
**Bound by:** readability beats beauty. A desk that puts the board under a lamp and a coffee ring
and still cannot be counted has failed the only constraint that outranks the brief.

### F7 — `skip the ceremony` is a permanent settings change wearing a footnote's clothes

> It is rendered as `modal__quiet`: 11px, dim, dotted underline, bottom-left corner […] **It reads
> as "skip *this* animation" and it is not.** It writes `save.settings.celebrations = false` for the
> rest of the campaign. […] Once `celebrations` is off, the label becomes `ceremony off` — which
> reads as a *status line*, not as the button that turns it back on.

**CARRIED, verbatim.** `Results.tsx` still renders both buttons as `modal__quiet` with the same two
labels and the same two `title` tooltips. Nothing changed.

**Requirement.** A control that changes a setting for the rest of the campaign must be recognisable
as a control and must name the state it moves to. There must be a route back that a player who hit
it by accident would recognise as one.
**Satisfied by:** the pair reading `Show reports all at once` / `Show reports one line at a time`,
styled as buttons, and reachable from wherever the desk keeps its settings — see F19; these two are
one job.

### F8 — the participation awards get more room than the result

> **35% of the modal is three commendations, all three of which fired on the player's first ever
> work order** […] The medal — the thing the whole screen exists to deliver — is the word `gold` in
> 20px lowercase mono inside a stats tile, styled identically to `78` and `1` either side of it. […]
> **The report never compares you to anything but par.** `par 78 · best 78` is the whole of it. […]
> The genre's answer to "how did I do" is a distribution.

**Two of the three closed; the third is the finding, and it is the one the audit ranked highest.**

Closed: the hierarchy inversion. `MedalBadge size="lg"` now sits in `.modal__head` beside the
verdict, above everything, with a `medal-land--in` reveal. The medal is the first thing on the card.

Closed by ruling rather than by code: the commendation flood. DESIGN §11 A9 cut the list from
fifteen to five and deleted attendance and completion outright — `FILED — One work order closed` and
`NO CONTACT REPORTED` are both gone, the latter under A10. Three commendations firing on a first
work order is no longer reachable.

Open: comparison. The report gained a `RECORD` row (`personal best`, `now` against `was`, with
`personalBestLine`), which is a real answer and both playtesters rated it the best reward in the
game. It is still the *only* one. `par 78 · best 78` plus one previous figure is the whole of the
feedback, and the game holds 33 levels of ticks and seeds and no per-run history at all —
`showResults` is set by a run and by nothing else, and a dismissed report is gone (see §6.6).

**Requirement.** Closing a work order must place the result against something other than a single
threshold — the player's own runs on this order over time, at minimum.
**Satisfied by:** a player who has run an order six times being able to see the shape of those six.
**Bound by:** character count does not exist (DESIGN §7, and it is a standing ruling — no char par,
no char stat, no ranking by size). A distribution over ticks or over ops is in scope; a distribution
over program length is not, and neither is anything that ranks the player against other players.

### F10 — five identical seed rows

> Five rows, character-for-character identical, 115px of the modal — and this is the *common* case
> […] The per-seed list earns its space only when the seeds **disagree**, which is exactly the case
> it is there to reveal.

**CARRIED, reduced.** `Results.tsx` still prints one `seed-row` per seed under `multiSeed` with no
collapse. The rows are better than they were — each names the objective and its shortfall rather
than repeating a bare sentence — so five identical rows are now five identical *informative* rows,
which is a smaller crime and the same one.

**Requirement.** The per-seed breakdown must cost space in proportion to what it reveals. Identical
outcomes collapse; disagreement expands.
**Satisfied by:** an empty program on `w4-05` producing one line about five seeds, and a program
that passes seed 3 and fails the rest producing the list.

### F11 — `--ink-dim` fails AA everywhere, and a ghost button is indistinguishable from a disabled one

> `--ink-dim` fails AA **on all three surfaces**, and it is used 111 times across `src/ui` and
> `src/meta`. […] **An enabled ghost button is the disabled colour at full opacity.** That is the
> entire visual difference between "you can press this" and "you cannot". `.btn--ghost` is not a
> rare treatment — it is the class on **export**, **import**, the editor's **revert**, and this
> modal's **Sign for it**.

**The contrast half is closed. The button half is untouched.**

Closed: Deep Site's palette sets `inkDim: '#93a7b2'` with its own comment recording *"5.1:1 on
`bgRaised`, 6.9:1 on `bgPanel`"*, and `applyArtDirection` writes it onto `:root` so the stylesheet
takes its value from the direction. `tokens.css` still carries the failing `#6a7a8c` as the
`standard` baseline, which is correct — `standard` is the thing being judged against, not the thing
that ships.

Open: `app.css:171` is unchanged —

```css
.btn:disabled { color: var(--ink-dim); opacity: 0.5; cursor: not-allowed; }
.btn--ghost   { border-color: transparent; background: transparent; color: var(--ink-dim); }
```

An enabled ghost button is still the disabled colour with a transparent border, separated from a
dead one by opacity alone. `export` and `import` in the top bar are both `.btn--ghost`.

**Requirement.** An enabled control must be visibly a control at rest, without hover, and must not
share its treatment with a disabled one.
**Satisfied by:** screenshotting the top bar and being able to say which of the controls can be
pressed. Contrast is a floor and it is now met; this is the affordance above it.

### F12 — the Repository hides the program, and the only way back is 10px tall

> **Ten pixels, seventy-eight wide, bottom-left corner of an 836px window.** It is the smallest type
> in the application and it is the only door in or out of the game's largest meta-feature. […] **Two
> `textbox "Editor content"`.** […] **Four of the five tabs are an empty sentence in the corner of a
> 930×680 void.**

**The small parts closed. The big part generalised.**

Closed: the two identically-named editors — `LibraryEditor.tsx` passes `ariaLabel: 'lib.ts'` with a
comment naming the reason. Closed: the duplicated empty state — `REFACTOR.nothingToCost` says what
the tab will show once it has something, and the status-bar copy stays where it was. Closed: losing
the whole screen — the Repository is now `position: absolute; inset: 0` inside `.rig`, so it takes
the program column and the board stays drawn beside it.

Not closed, and now bigger: **the door.** `.hud-chip` is `font-size: 10px`, 24px tall, uppercase,
`--ink-dim`, in a chip row in the bottom-right corner of the board — and the Repository is no longer
the only thing behind one. The **work order**, the **console**, the **reference** and the
**Repository** are now four 10px chips in a corner, and they are the only way to reach any of the
four. The audit found the game's largest meta-feature behind the smallest type on the screen; the
rebuild put three more of the game's information surfaces behind the same type.

**Requirement.** The control that summons a reading surface must be proportionate to the surface.
Four of the game's five information surfaces cannot all live behind 10px of dim uppercase in a
corner.
**Satisfied by:** a player who has never seen the game finding the work order, the console and the
reference without being told they exist — and, if the Repository still takes the program's column,
being able to get back to their program without hunting.

### F14 — the commendation shelf is at the bottom of an eight-screen scroll and nothing points at it

> Getting there means scrolling past ~2,900px of site map. There is **no link to it, no tab, no
> anchor, and no keyboard shortcut.** The header stat strip does print `COMMENDATIONS 6` — and that
> number is not a link. […] **Print the date.** `save.achievements` stores the epoch ms each
> commendation was earned and the shelf shows none of it.

**CARRIED.** `CommendationShelf` is still rendered last inside `.sitemap__route` after all eight
worlds; the header's `COMMENDATIONS {n}` is still a `<dd>`; there is no anchor and no id. The shelf
head lost its fraction on purpose (A9's list moved from fifteen to five and a moving denominator is
not actionable) and the earned/unearned copy swap the audit praised is intact.

The date is still dropped: `achievements[id]` holds the epoch ms and the component reads only
`!== undefined`.

**Requirement.** The record of what the player has been noticed for must be reachable from where its
count is printed, and an earned commendation must say when.
**Satisfied by:** pressing the count and arriving at the shelf; an earned card reading `earned 3
Sept`.

### F15 — across three window sizes, the brief is the panel that always loses

> **The 340px detail-panel cap was set against the wrong measurement.** […] at 2560×1440 the brief
> pane is **307px tall holding 1108px of content**. Trebling the window height buys the brief
> **nothing** […] while the editor column goes 945 → 1572. […] **Yes, put a max-width on the code
> column.** Measured at 2560×1440: Monaco is 1572px wide […] **198 characters of measure.**

**Two closed. The disease came back on a different element, which is why this is carried and not
dissolved.**

Closed: the 198ch measure. `useWorkspaceLayout.ts` caps the rig at `RIG_MAX = 640` — *"past this the
rig is carrying surplus the code cannot spend either, so the board keeps it"* — which is inside the
45–90ch band the finding asked for and gives the reclaimed width to the board, exactly as proposed.
Closed: the missing grid at 13", under F6's ruling.

Gone: the 340px detail cap, with the detail panel itself.

**Back:** `.sheet--brief` is `max-height: min(600px, calc(100% - var(--space-3) - 52px))`. On a
2560×1440 display the reference and the console take the full workspace height and the **work order
stops at 600px** while its content is around 900. That is the same trade the finding named — surplus
height goes to everything except the document the player is reading — re-created in the new layout
with a different literal.

**Requirement.** A document the player reads at length gets height when the window has height. No
reading surface may be capped below its own content while the window has room to spare.
**Satisfied by:** opening the work order at 2560×1440 and finding no scrollbar on `w1-01`.

### F17 — eight keyboard shortcuts exist, three are mentioned, in tooltips

> There is no shortcut list, no help overlay, and no "press ? for help" line anywhere on the screen.
> […] `Space` and `Shift+arrow` — the two that make scrubbing a 700-tick trace bearable — are
> announced nowhere at all. […] Note also a **direct contradiction on screen**: the RUN button's
> glyph reads `⌘⏎` and the status bar 700px below it reads `ctrl+enter to run`.

**CARRIED, improved at the edges.** `useKeyboard.ts` now binds *ten* things: Ctrl/Cmd+Enter, Escape,
Space, ←/, →/., Shift+arrow, Home, End, **B**, **C**, **O**, ?/F1. The chips announce three of them
— `SheetChip` prints `B`, `C`, `F1` in a `hud-chip__key` — which is a genuine improvement and the
model for the rest. `O` is announced only in a `title` on the fold control. Space, Shift+arrow, Home
and End are announced nowhere.

The contradiction is intact, and moved: `App.tsx:267` renders `⌘⏎` on the RUN button while
`EditorPanel.tsx:128` renders `ctrl+enter to run` in the editor's status line, on the same screen.

**Requirement.** Every key the game binds is findable from inside the game, and the game states one
modifier for its most important action.
**Satisfied by:** a key list the player can reach (a reference entry is enough — `?` already opens
the reference), and the two run hints agreeing on the same platform modifier.
**Note on difficulty:** this is interface, not puzzle. Nothing about the campaign gets easier if the
player knows that Shift+→ steps ten ticks.

### F18 — your grade is shown once, ever, and then it is unreachable

> Then you click **Acknowledge receipt** and it is gone forever. […] The words `RETAINED`, `GRADE`
> and `100%` do not appear anywhere on it. […] Since that cut, **the game has no surface at all that
> tells a player how they are doing overall**, except for one modal that self-destructs.

**The header contradiction closed. The grade is still nowhere.**

Closed: `POINTS 102/139` no longer sits beside a bar claiming 100%. `campaignPercent` is now
`closed / issued` and its caption says what it counts — `100% of the site closed · 33 at par or
under` — while `POINTS` reads in `pts` and not in per cent. Two clearly-named quantities rather than
two disagreeing percentages.

Open: `LevelSelect.tsx` renders `POINTS · CLOSED · GOLD · SILVER · BRONZE · STARS · COMMENDATIONS`
and no grade. `reportFor(save)` computes it on the site map already, for the memo's delivery check.
`save.reviewedRanks` still guarantees a memo fires once per grade and never again.

**Requirement.** The player's standing must exist on a surface they can return to. A grade delivered
once and then deleted is not a grade, it is an event.
**Satisfied by:** the standing readable from the site map — or, on the desk, a document that stays
on it — at any time, and the last memo re-readable.
**Bound by:** the ruling already made (`docs/OPEN-ITEMS.md`, 2026-09-05 23:10) — **the header follows
`reportFor`**. A second denominator beside points is the disagreeing-tick-counter bug in miniature.
A8 also stands: the Performance Review is a memo, not a screen. This is a persistent readout, not a
resurrected screen.

### F19 — Settings is called `SOUND` and only does sound

> It is `aria-label="Sound settings"`, titled `SOUND`, and it is **the only settings screen in the
> application**. […] `celebrations` — a dim link in the corner of the run report. `consoleCap` —
> nowhere. `layout` splitter fractions — drag-only, no reset. […] `sound enabled` and `mute` are two
> checkboxes for one player-visible outcome.

**CARRIED, verbatim.** `AudioSettings.tsx` is unchanged: title `SOUND`, `aria-label="Sound
settings"`, both `sound enabled` and `mute` still present. The audit's compliment stands too — it is
still the best-composed dialog in the game and the desk should steal its layout.

The list of homeless settings has grown by one, and it is the biggest: **the art direction.** Four
directions ship as selectable modules, `DEFAULT_ART` is `deepsite`, and `chooseArt` is registered in
`src/__tests__/unused-exports.test.ts:136` as *"what a direction picker would call, and no picker
has been built"*. There is no way for a player to change it. See §6.4.

**Requirement.** There is one place a player looks for preferences, and everything configurable is
in it.
**Satisfied by:** one dialog named `SETTINGS` with `SOUND` as its first section, `celebrations`
(F7) in it, and a decision recorded about the art direction.

### F22 — three tick counters, two current values, 700px apart

> The top bar reads `TICKS 78 / 78` while the transport reads `0055 / 78` and the rail reads `55 /
> 90 ticks`. Three tick counters, two different current values, within 700px. The top-bar counter is
> showing the *result*, the transport the *playhead*. Both are called `TICKS`. […] The objective
> label wraps mid-phrase […] `combobox "1x"` has **no accessible name**.

**Two of four closed.**

Closed, and it was the deepest one: the rail no longer calls a limit and a par by the same word.
`ObjectiveRail.tsx` tags a tick budget `limit`, prints `par` under `targets`, adds `shift ends at`
for a hard stop, and draws the seven-word note *"par sets the medal. the limit ends the work order."*
only where both are on screen (`docs/FIX-INCENTIVES.md` §H, merged in `7a24e80`).

Closed by measurement, not by change: the speed control. It already has an associated
`<label class="sr-only" htmlFor="speed">Playback speed</label>`; the accessibility tree prints
`combobox "1x"` because that is the control's *value*, proved at the time by setting a probe
`aria-label` and re-reading the tree. Adding the attribute would have been a second name for a
control that has one. The original finding was read off the tree and was wrong about this one.

Closed: the trail's low heat steps, marked *Suspected* in the original. The trail ramp is now
calibrated per direction against each direction's own `referenceFloor`, with a regression test
holding the contrast rather than the old "the cold end is a darkening" prose.

Open: the top bar still prints `ticks {result} / {par}` while the transport prints the playhead, and
both are called ticks. Open: the objective label and its readout are still siblings on one row in a
card now clamped between 168 and 232px, so the wrap the audit photographed is if anything more
likely.

**Requirement.** One quantity, one number, one word for it. Where two numbers share a noun, they are
either distinguished in words or one of them is not shown.
**Satisfied by:** scrubbing to tick 55 of 78 and finding no surface that disagrees about what "the
tick count" currently is.

### F23 — the whole workspace waits for Monaco

> One Suspense boundary around the entire workspace, whose lazy chunk carries Monaco. […] The site
> view, the brief, the objective rail and the transport have no dependency on the editor and all
> four sat behind it.

**CARRIED, verbatim.** `App.tsx:67` still wraps `<Workspace />` in one `Suspense` with
`opening the terminal…` as the fallback. The cost went **up**, not down: the board is now the whole
workspace and the first thing worth seeing, and it is still behind the editor's chunk.

**Requirement.** The board paints before the editor loads. The loading state belongs to the thing
that is loading.
**Satisfied by:** throttling the network and watching the site draw with `opening the terminal…` in
the program's column beside it.

---

## 6. What the audit did not catch

Six, found reading the current tree. They are ordered by what they cost the desk build, and every
one of them is about the *new* UI rather than the old one.

### 6.1 The console and the board are mutually exclusive

`print()` is the only debugging channel the game gives the player, and `visibleConsole(all, filter,
tick)` filters its output to the playhead so a line and the frame it belongs to line up. Then
`Workspace.tsx` renders exactly one `HudSheet` at a time and puts it **over the board**. So the game
has built a careful correspondence between two surfaces and made it impossible to look at both.

Scrubbing to the tick where a bot went wrong and reading what it printed at that tick is the core
debugging loop of this genre, and it currently requires closing one thing to see the other.

**For the desk:** whatever the terminal is, its output belongs to it. A console that has to cover
the site is not a terminal, it is another sheet of paper.

### 6.2 Every ceremony is a modal that destroys itself

`Requisition`, `RepositoryIssue`, `ReviewMemo`, `PublishDialog` and `Results` all take the screen,
say something once, and are then unreachable. `save.seenRequisitions` and `save.reviewedRanks` exist
specifically to guarantee they never fire twice. F18 catches this for the memo; it is true of all
five.

This is the finding the desk concept most directly bears on, and in the concept's favour: *the work
orders, requisitions, memos and performance review are physical documents arranged around the
machine.* A document on a desk is a thing you can pick up again. The requirement the desk has to
honour is that **it actually keeps them** — a memo that arrives as paper and is then binned on
acknowledgement is the same defect in a nicer costume.

### 6.3 The work order covers the site it describes, and closes itself when you start work

`useOverlayRequests` opens the brief on entry to every work order and closes it on the first
keystroke or the first Run. The brief sheet sits over the board. So the game's establishing shot —
the thing F3 was fixed to deliver — and the description of what the player is looking at are
alternatives, and the moment the player starts working the description leaves the screen.

The auto-close is a good instinct badly served by the geometry. Under *the screen is the work, the
paper is the company*, the work order is paper and should be beside the machine, not on top of the
picture it is captioning. If it is beside the machine it does not need to leave when the player
starts typing.

### 6.4 Four art directions ship and there is no way to choose one

`src/render/art/` holds `standard`, `survey`, `signal` and `deepsite` — roughly 4,500 lines of
authored mark-making, all four in the bundle. `chooseArt` in `src/ui/art.ts` is the write half of
the pair and is registered as a known-unused export because no picker exists. `DEFAULT_ART` is the
only vote anyone gets.

This is a decision the desk build cannot avoid: either it commits to Deep Site and the other three
become dead weight to be deleted or moved behind a build flag, or the picker gets built and becomes
the second thing in the settings dialog F19 asks for. Note that the tests were deliberately written
so that **no test can veto the choice** — the palette guard names `DIRECTIONS.standard` explicitly
for exactly that reason — so this is a design call and nothing in the suite constrains it.

### 6.5 The strip solved the objective card only; the rest of the furniture is still unreserved

`docs/FIX-HUD-OVERLAP.md` §8 says it plainly and names it a decision rather than an oversight: the
chip row (`.hud-tools`, bottom-right) and the empty-state note (`.viewport__empty`, bottom-left) are
positioned over the board with nothing held back for them, because reserving a second strip would
cost the board another 256px to protect four buttons.

That is the right trade for four buttons. It stops being the right trade the moment the desk adds
desk furniture — a lamp, a tray, a stack of paper, a clock — in the board's corners. The collision
the strip closed was closed *for one card* by making the canvas inset real. Anything else placed
over the board re-opens it, and the guard (`the objective read-out is never over the drawn grid`)
will not catch it, because it is stated about the card.

### 6.6 The run report is destroyed by a click on the backdrop and there is no way back

`Results.tsx` renders `<div className="overlay" role="presentation" onClick={dismiss}>` around the
dialog. A click inside the dialog is stopped and finishes the staged reveal; a click *outside* it
dismisses the report. `showResults` is set true by a run and by nothing else — grep across the store
and the UI — so there is no reopen path. The most information-dense card in the game (the medal, the
cause, the divergence, the objectives, the record, the seeds) is one stray click from gone, and the
player's only route back to any of it is to run the program again.

The audit caught the memo doing this (F18) and missed that the report does it too. On the desk this
is the same requirement as §6.2: **the paper stays until it is filed.**

---

## 7. The rulings that bind this file

No finding in the 23 turned out to be a re-litigation of a standing ruling, so there is no RULED
bucket. These are the rulings the carried items must be built to, and an implementation that
violates one is wrong however well it satisfies the requirement above it:

- **Character count does not exist** (DESIGN §7). No char par, no char stat on a `Verdict`, nothing
  scored, ranked or displayed by program size. Binds F8's comparison.
- **Feedback is a diff and never an oracle** (`docs/OPEN-ITEMS.md`). Binds F5's divergence marking.
- **Prose stays minimal; assume nobody reads.** Binds F17's key list and F4's brief.
- **Readability beats beauty, every time.** Binds F6, and it outranks the desk brief.
- **i18n is scratched, permanently.**
- **The campaign must be finishable without the Repository.** Binds anything F12 moves.
- **DESIGN §11 A7** — a level may be ungraded; six work orders carry no medal, and any medal display
  needs an honest `CLOSED` state. Binds F1.
- **DESIGN §11 A8** — the Performance Review is a memo, not a screen. Binds F18: a persistent
  standing readout is not permission to rebuild the review screen.
- **DESIGN §11 A9** — five commendations, and any proposed sixth must name a specific thing the
  player did that they would be pleased to have noticed. Binds F14.
- **Difficulty does not drop.** Every carried item above is interface, not puzzle. If a desk change
  makes a level easier to *solve* rather than easier to *read*, it is out of scope for this file.

---

## 8. What was checked, and what was not

Checked in the current tree at `75e88f3`, suite green at 1900 tests / 90 files:

- `src/ui/**` in full — `App.tsx`, `Workspace.tsx`, all seven panels, all six screens, the
  components, the five hooks, `art.ts`, `library.ts`, `monaco-setup.ts`.
- `src/ui/styles/**` — `tokens.css`, `app.css`, `screens.css`, `docs.css`, and `art/deepsite.css`
  and `art/signal.css` where a direction overrides the base rule.
- `src/render/theme.ts`, `overlays.ts`, `art/types.ts`, `art/deepsite.ts` and the parts of
  `art/survey.ts` that draw the ruler.
- `src/meta/ui/**` and `src/meta/store.ts` for F12, F13 and F21.
- `docs/DESIGN.md` §11 in full, `docs/OPEN-ITEMS.md` from 2026-09-05 22:45 to the end, and
  `docs/FIX-HUD-OVERLAP.md`.

**Not checked, and where that matters.** This pass drove no browser, so every claim about a *box* is
read off the rule that sizes it rather than off `getBoundingClientRect`. Three rulings would be
stronger with one measurement each, and none of them changes the bucket:

- **F4** — the exact overflow of `w1-01`'s brief inside a 468 × ≤600 sheet. The hint button is the
  last element either way; the number is what tells you how badly.
- **F15** — the brief's content height at 2560×1440 against the 600px cap.
- **F6** — Deep Site's grid at `w4-05` on a 1280×800 laptop, now that `gridMinTilePx` is 8. The
  lattice is drawn; whether it can be *counted* at that size is a photograph, not a rule.

`docs/DESK-CONCEPT.md` did not exist when this was written. If it exists now, three findings should
be re-read against it before the build starts: F4 (the duplicated hardware block), F10 (the seed
list) and §6.2 (the ceremonies). Nothing else in this file is waiting on it.
