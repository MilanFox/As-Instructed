# The desk, built

The panel workspace is gone. In its place is the diegetic desk from `docs/DESK-CONCEPT.md`, wired
to real state: a terminal, a site monitor, a dispatch key, a stamp block, a copy stand, a bound
Repository, a wire-bound reference, a site plan, an in-tray, a keyboard, and loose paper.

**The organising rule: the screen is the work, the paper is the company.**

*Written for a stranger. Assume no context. §7 is the unfinished list and it is the section to read
if you are picking this up.*

---

## 1. What a player can do, end to end

Open a work order from the site map and you are at your station. The **work order** is on the desk,
lower-right, and its specification is already on the **copy stand** beside the terminal so it stays
readable while you type. You write a program in **Monaco**, inside the terminal, with the
objectives, the bonus and the targets tucked against its right edge on the same screen and the
`OUTPUT` log underneath. You throw the **DISPATCH** key — or `ctrl+enter` — and watch the run on the
**site feed**, which is a separate physical monitor with its own transport keys, a scrub track, a
coordinate graticule and a zoom control on its case.

When the run comes back, paper arrives. A pass leaves a **certificate of closure**; a failure leaves
a **HALT notice** carrying the `want` / `got` diff. Neither is a modal, neither can be dismissed,
and neither disappears. The certificate lies on the desk until you pick up the **CLOSED** die and
stamp it, which files it into the Repository. A **standing sheet** sits on the desk permanently and
never files. The **site plan** takes you back to the campaign, and the site map has a
`back to the station` control that brings you straight back to the order you were writing.

Once the Repository is provisioned the terminal holds a **second file**. A file rail across the top
of its screen names both — `~/orders/w2-05` and `~/lib.ts`, with the count of what is published in
it — and pressing `~/lib.ts` loads the routines onto the same glass. `esc` puts the work order back.
See §9.

Settings are objects: a **SIZE** dial, a **DISPLAY** switch (Deep Site / Signal), a **REPORTS**
switch and a **SOUND** key, all screen-printed on the terminal's chin, where a 1988 monitor carried
H-SIZE and V-SIZE.

---

## 2. Architecture

| thing | where |
|---|---|
| the shell, the room, the mode, the object lists | `src/ui/desk/Desk.tsx` |
| the file rail and `~/lib.ts` on the terminal | `terminal/FileRail.tsx`, `furniture/Routines.tsx` |
| the scale and the design frame | `src/ui/desk/scale.ts` |
| terminal, rail, output log, settings bezel, key list | `src/ui/desk/terminal/` |
| site monitor, transport, graticule, board geometry | `src/ui/desk/monitor/` |
| the paper store, the issuer, and every document | `src/ui/desk/paper/` |
| dispatch, stamps, pen, Repository, reference, site plan | `src/ui/desk/furniture/` |
| the stylesheets, ported from the prototype | `src/ui/styles/desk/` |

**Two custom properties are the whole layout contract. Nothing is written in pixels.**

- `--u` — the design unit, `min(innerWidth / 1552, innerHeight / 1004)` px. All geometry is
  `calc(N * var(--u))`; positions are offsets from the centre: `left: calc(50% + X * var(--u))`.
- `--ts` — the SIZE dial. All font sizes are `calc(N * var(--u) * var(--ts))`, and **nothing else**
  multiplies by it. That is what makes the dial unable to shrink the board.

`data-mode` (`write` / `run` / `watch`) changes the **light**, never the geometry.

**The stylesheets** are `docs/prototypes/desk/desk.css` ported whole — 332 rules reconciled, nothing
re-tuned. The two `@font-face` blocks were dropped (they held the 164KB of inlined base64; the app
already self-hosts the same two variable fonts). Every selector is scoped under `.desk`, every
`@keyframes` is prefixed `desk-`, and the prototype's `.desk` surface graphic became
`.desk-surface`.

**Deleted:** `Workspace.tsx`, `HudSheet`, `Splitter`, `useRail`, `useWorkspaceLayout`, and the seven
panels (`EditorPanel`, `ConsolePanel`, `ObjectiveRail`, `TimelineBar`, `ViewportPanel`,
`BriefPanel`, `DocsPanel`), plus `Results`, `Requisition`, `RepositoryIssue`, `ReviewMemo` and
`src/ui/styles/art/survey.css` (560 lines that shipped to every player).

---

## 3. The nine rulings

**1. Pick a paper up to read it — satisfied, then superseded.** Built as click-to-lift; the user
reported it as a bug (see §5) and it is now an explicit **enlarge** control on the sheet.

**2. Pin a document to the side — satisfied.** The copy stand carries a *second authored view* — the
ask and the site data, larger than the sheet itself carries — not a CSS scale. Verified live
projecting real level facts. The sheet carries a labelled `pin to the copy stand` control, and the
empty stand says what it is for rather than reading as decoration — the user could not find pinning
when the affordance was an unlabelled pin head, which is the same lesson as the CLOSED die and the
site plan. The work order does **not** pin itself on arrival; that would be three lines in
`deliverPaperwork` if it is wanted.

**3. One global desk scale — satisfied as a type scale, by amendment.** `src/ui/desk/scale.ts`,
stops 1.0 / 1.15 / 1.3 / 1.5, persisted at `bootstrap.deskSize` following `src/ui/art.ts` — own key,
no save migration.

A geometric scale was **measured and refused**. The desk is a fixed frame fitted to the viewport, so
multiplying `--u` does not enlarge it, it crops it: at 1440×860 `--u` is 0.857 and the terminal's
left edge is at `50% − 762u`, so at 1.25× it lands at −97px and takes the program's line-number
gutter off screen. Recovering that needs a reflow, and a reflow is moving the furniture.

A geometric component on large monitors was **also measured and refused**, because there is nothing
to grow into: `--u` has no cap and already scales without limit, so a 2560×1440 player already gets
a desk 1.68× the linear size of a 1440×860 player's. The frame has ~1% horizontal headroom and
negative vertical headroom. See §4.

The board is the exception a type scale cannot serve — a picture is not type — and its answer is its
own zoom rungs, which is why zoom is a control on the monitor's case.

**4. Paper persists until it is filed — satisfied.** Nothing self-destructs, nothing has a backdrop,
nothing is dismissed. `src/ui/__tests__/closure-ceremony.test.ts` drives a real passing run through
the reference solution and asserts the certificate issues unstamped, that stamping files it with
mark `closed`, that it moves out of the loose set and into the filed set, and that it **outlives the
run that produced it** — the snapshot is the point, because the store's `verdict` is overwritten by
the next run.

**5. Console and board visible at once — satisfied by construction.** The `OUTPUT` log is under the
code inside the terminal; the board is on the other monitor. The tick alignment
(`visibleConsole(all, filter, tick)`) was kept — it was a good feature defeated by layout, not a bad
one.

**6. Nothing the player needs is under a document — satisfied, with a stronger guard.**
`src/ui/__tests__/monitor-margin.test.ts` replaces the `useWorkspaceLayout` guard and is strictly
stronger: it proves the stylesheet takes the canvas box from `geometry.ts` so the two cannot drift,
proves the real `Camera` never draws outside that box **for every level in the campaign at both
supported viewports**, and mechanically forbids `--ts` inside the feed screen. The old guard proved
one rectangle missed one card.

**7. Art picker, two entries, `survey` cut — satisfied.** The `DISPLAY` switch on the bezel offers
**Deep Site** (default) and **Signal**. It calls `chooseArt()` for the CSS half and the renderer's
`setArt()` for the canvas half. `survey.css` is deleted.

**8. `docs/LIGHT.md` — satisfied, carried over intact.** Cast shadows with equal offsets on both
axes (135°, never a 0-x drop shadow), one shadow ink `#04090f` at 0.32, a contact strip at 0.30
against every south edge, arrises as hard rules via `--arris-*` rather than gradients.

**9. The board must not wait on Monaco — satisfied, and measured.**

| chunk | raw | gzip |
|---|---|---|
| `index` — desk, board, rail, log, paper | 404 kB | 132 kB |
| `MonacoProgram` — the lazy boundary | 2.3 kB | 1.3 kB |
| `monaco` | **3,904 kB** | **988 kB** |

Timed against a real build: entering a work order, the desk, the rail with populated targets, the
log and the painted board were all present with `opening the terminal…` in the program's pane, and
**Monaco arrived 3,319 ms later**.

---

## 4. Two bugs worth recording, because both were assumptions

**The frame did not contain the furniture.** `DESK_FRAME` is the denominator of `--u`, so a frame
smaller than the composition crops it. The prototype's 1560×1000 was four units short vertically
against a terminal whose top edge is at `50% − 502u`, needing 1004 — so the terminal's lit north
arris, the one hard rule `LIGHT.md` §1 spends on a top edge, clipped by ~1.5px on every laptop.

The real extents, pulled from the stylesheets:

| axis | binding object | reach from centre | frame needs |
|---|---|---|---|
| horizontal | the copy stand's right edge | 776 | 1552 |
| vertical | the terminal's top edge | 502 | 1004 |

`DESK_FRAME` is now **1552 × 1004**, and `src/ui/__tests__/desk-frame.test.ts` **recomputes both
numbers from the stylesheets** rather than restating them. It also asserts every centre-anchored
object is classified as must-contain or deliberately-cropped, so a new object cannot be added
without a decision. Mutation-tested: reverting the constant fails with `.display--term reaches 502
units from the centre, so the frame needs 1004`.

**Worth the note:** the first extent derived by hand was 1544 and it was **wrong** — it took the
in-tray as the widest object and missed the copy stand in front of it. The confident hand-derived
number was wrong within one message of deriving it. That is the third instance on this project of
geometry being asserted rather than measured.

**A desk object took the whole desk down.** A `<Binder>` mid-edit threw and blanked the screen —
`docs/AUDIT-UI.md` F21 returning in furniture rather than in a modal. Every object is now rendered
from two exported lists through `PanelBoundary`, so there is exactly one place a boundary can be
omitted, and `src/ui/__tests__/desk-boundaries.test.ts` holds the lists against the furniture
barrel's own exports — the barrel is the file that grows when someone adds an object, so a hand
roll-call would rot and the barrel will not. The player's program is safe independently: `setCode`
writes through to `localStorage` on **every keystroke**.

---

## 5. What the user found, playing it

Seven findings in two short sessions, worth more than any audit. **Every one is a reachability
failure** — something exists and the player cannot get to it. That is the same axis as F12 (doors as
10px chips), F14 (the shelf behind 2,900px of scroll), F4 (the hint at the bottom of a document
nobody scrolls) and §6.6 (the report with no reopen path): **six of the seventeen CARRIED items are
one problem.**

| what they said | ruling | state |
|---|---|---|
| "why can I pick up the Gold/Silver/Bronze stamps?" | the three grade dies are the company's and inert; **CLOSED is the player's and stamping is how you file** | done |
| "how do I pin something to the copy stand?" | pinning gets a visible control on the sheet | done |
| "close button to the repo needs scrolling" | whatever opens closes without scrolling; swept every openable surface | done |
| "started me on this screen which I can never go back to" | **the site plan, an object on the desk**, plus `back to the station` on the site map | done |
| "where are my instructions?" | the work order was never issued — a `clearLevelPaper()` in the shell raced the issuer | done |
| "drag no longer works, moves on its own, upscaled on clicking" | **drag is the only gesture**; enlarge and pin become explicit controls | §7 |
| "the closed stamp needs to be told" | the instruction is **printed on the certificate**; the die reacts only when one is unstamped | §7 |

**The drag diagnosis, because it explains the wording.** Click-to-lift was overloaded onto the
sheet. Pressing a sheet meaning to drag it lifted it instead, animating it across the desk at 1.23×
over 0.3s — *"moves around on the screen on its own, showing an upscaled version on clicking"*. And
`onPointerUp` bails on `lifted`, so **one accidental click permanently disabled dragging that
sheet.** They said "no longer works" rather than "sometimes works" because they had genuinely
bricked it. Measured, not guessed: on a clean load nothing auto-lifts, positions are stable across 8
samples, and the transitions are on `transform`, not `left`/`top` — so it was never a layout race.

---

## 6. The 17 CARRIED requirements

| | requirement | state |
|---|---|---|
| F1 | grade legible without hue | **closed** — four silhouettes on the site map, copying `signal`'s solution |
| F2 | titles fit, no dead rail | **outstanding** — cut under the budget ruling |
| F4 | hint reachable without scrolling; no duplicate hardware block | **closed** — the hint is on the face of the work order; the requisition is its own sheet |
| F5 | divergence outlives the report | **partly** — the `want`/`got` block is on the HALT notice and persists; board marking cut |
| F6 | a coordinate system | **closed** — hover readout in the header strip, graticule in the bezel margin |
| F7 | a setting must look like a control and name its state | **closed** — the `REPORTS` switch on the bezel |
| F8 | compare the result to something the player owns | **outstanding** — run history cut |
| F10 | seed rows collapse when identical | **outstanding** — cut |
| F11 | an enabled control must not look disabled | **partly** — the desk's own controls are moulded hardware; `.btn--ghost` untouched |
| F12 | doors proportionate to what is behind them | **closed** — a bound Repository, a wire-bound manual, a folded site plan |
| F14 | the record reachable, and dated | **closed** — the count is a link; dates print |
| F15 | reading surfaces get height | **closed** — enlarge is the answer; no cap re-introduced |
| F17 | every bound key findable, one modifier stated once | **closed** — `useKeyboard` is *built from* the announced key list, so drift is a compile error |
| F18 | standing on a permanent surface | **closed** — the standing sheet, never filed |
| F19 | one place for preferences | **closed** — the bezel: SIZE, DISPLAY, REPORTS, SOUND |
| F22 | one quantity, one number, one word | **closed** — the transport says `PLAYHEAD`, the rail says `par` / `ticks`; the playhead exists on exactly one surface |
| F23 | the board must not wait on the editor | **closed** — measured at 3,319 ms |

---

## 7. Unfinished — read this first if you are picking this up

**The routines feature's missing door is closed** — `~/lib.ts` is a second file on the terminal.
See §9. What follows is what is still open.

**Other stated gaps.**

- **Crop and ice-scrub are not visually separable at all**, found by the monitor lane:
  `Renderer.drawCrops` never reads `tile.crop`, so no art direction can draw them differently.
  `w2-05`'s entire ask is telling them apart. This is a `src/render/**` change, reported not fixed,
  and it is a *solvability* issue rather than a legibility one. Maturity **is** separable, by shape.

- **The paper explosion is fixed, and the rule is guarded.** A player opening `w1-03` was handed
  five documents at once, stacked over the terminal. Now **one sheet lies out** — the work order —
  and everything else arrives in the **in-tray** with a count, opened deliberately. Every sheet
  carries `enlarge`, `pin to the copy stand` and `put it away`; away means the tray, and the tray
  means retrievable, so paper still persists until it is filed. Five of seven `DOC_HOME` entries had
  been sitting *above the monitor's bottom edge*; all seven are now below both machines, and
  `src/ui/__tests__/paper-clearance.test.ts` recomputes the screen extents from the stylesheets and
  fails if one rises. `src/ui/__tests__/modal-dismissal.test.ts` asserts the one-sheet rule and that
  taking a document out of the tray loses nothing. Shot:
  `docs/shots/desk/18-w1-03-on-entry-one-sheet.jpg`.
- **Four of the seven documents are unexercised.** The work order, the standing sheet and the HALT
  notice are watched working; the **certificate** is proven by test (§3 ruling 4). The
  **requisition**, the **Repository note** and the **performance memo** are built and placed but
  have not been driven. They share `Sheet.tsx` and one `issueOnce` call each with the three that
  work, so they are probable — but probable is not proven and they are not claimed here.
- **`docs/DESK-CONCEPT.md` §7 is wrong and needs correcting.** Its board-legibility numbers are
  derived from the feed screen's **width**, but the screen is 656 × 438 design units, so a square
  grid is fitted by **height**. §7 claims ~14 CSS px / 28 device px for `w4-05` at 1440×860; the
  height-bound figure is materially smaller. **The document's central defence of the smaller board
  does not hold as written** and will be cited later as if it were measured.
- **Eight levels cannot show the whole board legibly at 1280×800** — `w4-04, w4-05, w5-02, w6-05,
  w7-05, w8-02, w8-04, w8-05` — and the graticule margin moves three of them. Pinned as a ratchet in
  `monitor-margin.test.ts`; a level joining that list is a regression to be argued for, not
  absorbed. **`w2-02` is not on it**, which matters: it is the level that becomes literally
  unsolvable if ripeness is not tellable.
- **Signal restyles the board but not the desk chrome.** `src/ui/styles/art/*.css` target old-UI
  class names and `.desk` redefines `--ink` / `--accent` / `--scr` locally, so `applyArtDirection`'s
  palette does not reach the desk. Legible and usable; not beautiful.
- **F2, F8, F10 and the `.btn--ghost` half of F11** were cut under the budget ruling.
- **F5's board marking** was cut — marking `want` and `got` on the board needs a `src/render/**`
  change this lane does not own.
- The bezel foot clears the DISPATCH key by **5px at 1280×800**. Tight; check it if anything on
  that plate widens.
- `src/game/store.ts` keeps `trace` / `verdict` across a level change in at least one path — a
  freshly opened order can read `RETURNED`. The desk surfaces agree with each other; the store is
  stale.

---

### Found by a fresh-eyes playtest, and fixed

*A tester who had never seen the game closed the first two work orders and recorded every moment
they got stuck. Five of the six things they hit were real. The sixth was not, and it is recorded
below with the evidence, because a wrong finding acted on is worse than a finding.*

- **The in-tray could not be clicked, and `put it away` was a one-way door.** The tab was an
  unstyled button in the corner of a box that sits at the desk edge behind the copy stand, so
  `document.elementFromPoint` at its centre returned the copy stand — whose box reaches 38 units
  below everything it draws — and the panel it opened flowed *downward*, off the bottom of the
  frame, as a single white line. The tray was the only route back to a document that had been put
  away, so the button nobody could hit was also the way out of a one-way door; the tester escaped by
  leaving to the site map and re-entering the level. Fixed as a hit area and a panel placement, with
  no furniture moved: the copy stand gives back the space it does not paint (`pointer-events: none`
  on the box, `auto` on the board, clip, post and foot), the tab is a plate on the strip of the
  tray's back rail that is both drawn and clear — above the foot at y 466, right of the post at
  x 631 — and the panel opens *upward*, promoting the tray above the copy stand only while it is
  open. `src/ui/__tests__/control-reachability.test.ts` is the guard, and it is the class rather
  than the instance: it recomputes every control's box and every object's box from the stylesheets
  and fails if anything that paints above a control overlaps it. Mutation-tested — putting the tab
  back down into the tray fails with `.cs-foot (z 10) covers .tray-tab (z 7)`.

- **The CLOSED die did nothing, four presses in a row.** Not a dead handler: a certificate is issued
  *to the in-tray*, because one sheet lies out and that sheet is the work order — so the die went
  live with nothing on the desk carrying a stamp box. And a certificate at its own `DOC_HOME` puts
  its box at y 893 in an 839px window, so taking it out is not enough on its own either. Picking the
  die up now takes the certificate out of the tray **and** brings it up to reading size, which is
  what the copy on the die already said it would do. The row still reads `GOLD SILVER BRONZE CLOSED`
  and the three grade dies are still the company's and still inert; the live one prints
  `PRESS TO FILE` above itself, in the accent, and `CLICK THE BOX` once it is in hand. Watched end
  to end by mouse: die → certificate up → box → filed with mark `closed`.

- **A requested hint was one line above the bottom of the window.** Measured on `w1-01`: the hint
  landed at y 812..838 in an 839px window and the *next* `Request hint` button then sat at y 855,
  off screen. Raising SIZE made it worse. Requesting a hint is a deliberate act of reading and F15's
  answer to reading is enlarge, so the order now comes up to reading size on reveal — the field
  notes strip is the first thing under the addressing block, so the hint you asked for is what you
  are looking at.

- **The board-zoom controls were three unlabelled ~10px glyphs beside a 6px legend.** The tester
  spent about two minutes unable to read the walls, resized the browser three times, and found `FIT`
  **by reading the accessibility tree**; it solved their problem the moment they pressed it. That is
  F12 exactly. Same place on the case, no furniture moved: a legended key cluster, `ZOOM` over
  `OUT` `FIT` `IN`, 112 x 45 CSS px at 1440x839 against 85 x 17 before. The scrub track absorbs the
  width (147 -> 120 px). Drag already panned the board and nothing said so; `#board` now carries
  `cursor: grab`.

- **The editor inserted a brace the player did not type.** Monaco's auto-closing pairs put a `}`
  after the cursor, the player typed their own on a new line, and a program written in the style
  that worked on `w1-01` came back with a stray trailing `}` and `Declaration or statement expected`.
  Reproduced first try. `autoClosingBrackets`, `autoClosingQuotes`, `autoClosingOvertype` and
  `autoSurround` are all `never` on both editors — `MonacoProgram.tsx` and `LibraryEditor.tsx`, which
  holds player code too — and `wordWrap` is `on`, because the tester's fallback was one long line
  they then could not read.

### Reported and refused: the hints were never in the DOM

The finding was *"the browser's page-text extraction returned all five of `w1-01`'s hints,
unrequested, including the literal route"*. It does not hold. `WorkOrder.tsx` renders
`hints.slice(0, revealed)` and nothing else; the extraction on a fresh save returns
`Request hint 1 of 5` and no hint text, and with one hint revealed `document.body.innerText` still
does not contain hint 2. What the tester read was the **site data table**, which is `level.facts` —
and `w1-01`'s facts do print the route, in the level's own words, on purpose:
`ROUTE AFTER IT — 19 East, 5 South, 22 West, 5 South, 22 East.` That is the company telling you the
job, not a hint leaking. Every other reveal-on-request surface was checked and there is only this
one. **If the route on the face of the work order is too much, that is a level-copy decision about
`w1-01.facts`, not a DOM defect, and it is a different argument.**

### Still open, from the same session

- **The board is unreadable before you run anything.** A fresh player sees a 25x14 grid of
  near-black tiles, `NO TRACE ON FILE`, no bot, no pad and no legend. They found their bearings only
  by pressing DISPATCH and getting `WANT (23, 12) · GOT (2, 2)` back. That is a design question
  about the resting state of the feed, not a bug.
- **Scoring is opaque.** They closed `w1-01` at exactly 90/90 ticks, were given 3/11 points, saw
  GOLD/SILVER/BRONZE all reading 0, and the site map header saying `1 AT PAR OR UNDER`. They never
  worked out what par was or how to earn a medal.
- **The tile inspector is undiscovered.** Hovering the board prints `13, 5 · wall` in the panel
  header; they found it by accident while dragging.

## 8. Conflicts raised rather than decided

**Ruling 3, geometric versus type scale.** Raised, measured, and amended by the orchestrator: the
type scale satisfies it, and the original wording had been aimed at forbidding *per-element*
scaling.

**Ruling 3's large-monitor half.** Directed to add a geometric component where the window has
surplus; measured, found to yield ~1% on one axis and less than nothing on the other, dropped with
the numbers rather than built.

**An instruction that would have re-created the defect it was issued to fix.** The terminal lane was
told the rail should print `ticks — / 96` for par — lifted from the prototype's static mock text.
`limit-and-par.test.ts` pins that par must be called `par`, and calling par "ticks" *is* the F22
defect. **The lane refused with evidence and was right.** The standing instruction given to every
lane — *if I am wrong, show me the pixels and refuse* — has now caught the prototype, the lane
briefs and the orchestrator, in three separate places.

---

## 9. `~/lib.ts` — the routines get a door

*Written after §7 was reduced by one item. Read §7 first; this is the item that left it.*

### What the object is

**The terminal holds two files, and `~/lib.ts` is the second one.** The routines a player publishes
are *code*, and §2 of `docs/DESK-CONCEPT.md` decides where code goes: the screen is the work and the
paper is the company, and no paper texture ever touches a program. So the routines are not a
document, not a bound volume and not a modal. They are a second file on the machine the player
already writes in, and the door is the machine saying which file is loaded.

`Binder.tsx` had already ruled this in its own first paragraph, before anything rendered it: the
routines "keep their name inside the terminal". This is that sentence, built.

**It is not the bound Repository volume, and the two are still apart.** The volume is the company's
record of closed work orders; this is the contractor's own accumulated subroutines. The campaign
must stay finishable by a player who never opens the volume, so no route into a work order may live
inside it — and none does.

Shot: `docs/shots/desk/19-lib-ts-loaded-on-the-terminal.jpg`.

### The door

A **file rail** across the top of the terminal's screen: two moulded, screen-printed keys, each
carrying its whole path and a legend saying what the file is. `~/orders/w2-05 · WORK ORDER` and
`~/lib.ts · YOUR SUBROUTINES · 2 PUBLISHED`. The loaded one is lit and carries the accent rule; the
other is recessed. It is a rail and not a chip because of `docs/AUDIT-UI.md` F12 — a door weighs
what is behind it, and behind this one is every routine the player has written. At 1440×783 the rail
is about 290 × 34 CSS px; at SIZE 1.5 it is 541 design units of the 776 available and still does not
wrap.

**The count is the notification.** A player who has just published sees the number on the key go up,
on the machine they are already looking at. Before the Repository is provisioned there is no second
file and the rail is not drawn at all — `src/meta/unlock.ts` keeps Worlds 1 and 2 strictly a one-file
game and the whole on-ramp depends on that.

Three ways in, and they all set the same bit:

- the `~/lib.ts` key on the rail
- `esc` comes back out, one rung above leaving the work order (`src/ui/hooks/useKeyboard.ts`)
- the provisioning notice's own `open it` button, which called `setPanel('library')` into nothing
  for the whole life of the desk and now opens the file

**Nothing was moved.** The composition is untouched: no furniture shifted, nothing was added to the
desk floor, and the frame numbers are unchanged. The reason is measurement rather than restraint —
the desk floor has no free box larger than about 125 × 53 design units, and every candidate site
between the binder and the copy stand is where loose paper lands.

### Where it lives

| thing | where |
|---|---|
| the rail, on both surfaces | `src/ui/desk/terminal/FileRail.tsx` |
| the second file, and its boundary | `src/ui/desk/furniture/Routines.tsx` |
| the panel and the status line, behind the lazy boundary | `src/ui/desk/furniture/RoutinesFile.tsx` |
| the geometry | `src/ui/styles/desk/terminal.css`, `.tb-file` / `.routines` |
| the way out | `src/ui/hooks/useKeyboard.ts`, the `escape` ladder |

**It is a `DESKWARE` object with its own `PanelBoundary`, and that is not bookkeeping.**
`PanelBoundary`'s own docstring was written for this panel. It compiles TypeScript, mounts a second
Monaco model and runs a regression suite, so it is the likeliest thing on the desk to throw. Inside
the terminal's tree a fault would take the program, the objectives rail and the output log with it —
`docs/AUDIT-UI.md` F21. From the list it costs the routines and nothing else.

**The layer is the terminal's glass exactly**, and that is asserted rather than trusted:
`desk-frame.test.ts` recomputes `.routines` from the bezel's padding and the terminal screen's own
height and fails if the two drift, which is what makes it impossible for the file to reach the desk,
the paper or the site feed. Mutation-tested: widening the layer fails with
`expected { left: -760, … } to deeply equal { left: -747, … }`.

**Monaco stayed behind its boundary.** `RoutinesFile.tsx` is the only module on the desk side that
reaches `src/meta/ui`, and it is loaded through `lazy()`. Measured on a real build: `RoutinesFile`
is its own 12.79 kB chunk (3.85 kB gzip), `monaco` is unchanged at 3,904 kB, and the `index` chunk
did not absorb it.

### Two things found on the way, both reported rather than absorbed

**The desk's reset was flattening the panel.** `desk.css` carried `.desk, .desk * { margin: 0;
padding: 0 }` at specificity (0,1,1), and every rule in `src/meta/ui/library.css` is (0,1,0) — so the
tab strip, the hint line and the commit bar all rendered with zero padding and ran together. The
reset now stops at `.routines`, wrapped in `:where()` so it contributes no specificity and every
other rule on the desk keeps the weight it was tuned against.

**The covered terminal was still in the accessibility tree.** With `~/lib.ts` loaded the whole
terminal screen is behind the layer, and a screen reader still walked the program, the rail, the log
and a second copy of the file rail. `.display--term .screen` now carries `inert` while the file is
loaded. Verified behaviourally, not by inference: a button under the layer refuses focus and the
live one takes it.

### Two known limitations, stated

- **`library.css` is sized in fixed pixels**, so the SIZE dial does not reach inside the panel. It is
  legible at every supported viewport and it was not restyled, because hosting an existing surface
  is a door and restyling it is a rebuild. If the dial is wanted in there it is a pass over about
  forty declarations in one file.
- **The word "Repository" now names two things in the shipped copy**, and it did before this change
  too. `src/meta/copy.ts` carries `REPOSITORY_NAME = 'Shared Subroutines Repository'`, which is the
  panel's `aria-label` and prints on the Structure tab as *"Nothing in the Repository calls anything
  else in it"*; the bound volume on the desk is screen-printed `THE REPOSITORY · CLOSED WORK
  ORDERS`. The desk's own new copy avoids the collision entirely — the door says `~/lib.ts` and
  `your subroutines`, never "Repository" — but `src/meta/copy.ts` is outside this lane and the
  collision is **reported, not fixed**. It is a naming defect and it wants a ruling.
