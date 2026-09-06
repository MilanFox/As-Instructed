# The Desk

> **The screen is the work. The paper is the company.**

A working prototype lives at `docs/prototypes/desk/index.html`. Plain HTML/CSS/JS, no build,
no dependencies, no network. Open it by double-clicking.

---

## 1. The one sentence

**The interface is a contractor's workstation seen from above: two physical screens where the
work happens, and the firm's paperwork lying on the desk around them.**

Nothing on screen is chrome. There is no tab bar, no panel grid, no settings dialog and no modal.
There is a terminal, a site monitor, a dispatch switch, a stamp block, a copy stand, a bound
Repository, a wire-bound reference, an in-tray, a keyboard, and loose paper.

---

## 2. The organising split, and why it is the joke the game already tells

| | **Digital — what you do** | **Paper — what the company does to you** |
|---|---|---|
| what | the program, the site feed, the trace, the numbers coming back | the work order, the requisition, the HALT notice, the closure certificate, the review, the record |
| where | two screens, upper half | loose on the desk, lower right |
| feels like | precise, responsive, yours | issued, filed, graded, not yours |

You are a remote programmer forty light-minutes from the site. Everything reaches you as data,
and Kessler & Daughters insists on wrapping it in process anyway. That is what the existing
writing already is; the interface was the only part not saying it.

**No paper texture ever touches the code.** The editor is a terminal, and it is the largest and
brightest object on the desk while you are writing.

---

## 3. Period

**A 1988 institutional workstation, still in service in 2209.** Committed to, not gestured at:
injection-moulded housings, screen-printed legends, brushed control plates, hard-edged bevels,
amber and green indicator lamps, an inventory asset tag.

The two screens are from **two different procurement eras**, and that is a joke in an object:

- **Your terminal** is the newer machine — dark charcoal, thin bezel, tight tolerances,
  `ISOMER 21 · TERMINAL` screen-printed on the chin.
- **The site feed** is a K&D asset from 2207 — pale grey-beige, thick housing, physical transport
  keys on the case, and a stuck-on tag reading `K&D · ASSET 41-2207-B · SURVEY / DO NOT REMOVE`.

The company gave you a good machine to write on and a twenty-year-old monitor to look at the
planet through.

---

## 4. The verbs, as objects

| verb | object | the act |
|---|---|---|
| run | **DISPATCH** — a guarded red key on the desk, with `READY / IN FLIGHT / RETURNED` lamps | you throw it. `ctrl+enter` throws it too |
| read the order | **paper**, lying lower-right | you pick it up |
| keep it while you write | **the copy stand** | you pin it |
| close a work order | **the stamp block** — `GOLD SILVER BRONZE CLOSED` on an ink pad | you press it onto the certificate |
| sign for hardware | **the pen** | you drag it along the signature line and ink follows |
| the record | **the Repository** — a bound volume with world tabs | you open it |
| the manual | **REFERENCE** — a wire-bound book, `K&D FORM 12 · REV 9` | you open it |
| settings | **the terminal's own bezel** — a `SIZE` dial and a `DISPLAY` switch | you turn them |

There is no menu anywhere. Every one of these is a thing on the desk with a reason to exist.

---

## 5. The three ways to read something (all three are built)

These are **three different mechanisms for three different reasons** and they are not
interchangeable.

**1 · Pick it up.** Click any sheet and it lifts off the desk to a size meant to be read — and it
gets *brighter*, because it is now nearer the lamp. Click the desk and it goes back exactly where
it was. This is the gesture, not a zoom control, and it costs no chrome. It is also why a sheet at
rest does not have to be legible: paper on a desk is a thing you pick up.

**2 · Pin it.** A red pin at the top-left corner of a document puts it on the **copy stand** — a
typist's copyholder standing on the desk to the right. What goes on the stand is deliberately not
the whole sheet: it is **the ask and the site data, set larger than the sheet itself carries**.
The flavour paragraph stays on the paper. *What you pin is the specification, not the memo.*
It stays there across runs, which is the point — this is for reading while your hands are on the
keyboard.

**3 · SIZE.** One dial, on the terminal's bezel, where a 1988 monitor carried H-SIZE and V-SIZE.
1.0 / 1.15 / 1.3 / 1.5. Persisted under `bootstrap.deskSize`.

> **Flag, and I want a ruling on it.** SIZE scales **type and line boxes**, not station geometry.
> A geometric scale is the wrong mechanism for this layout and I could not make it work: the
> station is already fitted to the viewport, so multiplying `--u` by 1.25 pushes the terminal's
> left edge off-screen and crops the thing the player is reading. Scaling type reflows inside
> panes that already exist and preserves the composition exactly, which is what the ruling
> actually asked for. If a geometric scale is wanted as well, the layout has to gain a reflow
> breakpoint and that *is* moving furniture.

---

## 6. What the desk fixes for free

Findings the desk answers by construction rather than by adding a feature:

- **The console and the board are simultaneously visible.** They are two different objects — the
  `OUTPUT` pane is under the code inside the terminal; the site is on the other monitor. The core
  debug loop (watch the number, watch the bot, correlate) is possible in one glance.
- **Paper persists until it is filed.** Nothing self-destructs. A closure certificate lies on the
  desk until you stamp it. A HALT notice lies there until you move it. There is no backdrop click
  that destroys a result, because there is no backdrop.
- **The work order never covers the site it describes.** Paper lives in the desk foreground; the
  board lives on a monitor at the back. They cannot occupy the same space.
- **Nothing is drawn over the board.** No HUD card, no chip, no sheet. The objective read-out is
  inside the terminal, on the terminal's own screen. The graticule is drawn in the bezel margin.
  There is no geometry to reserve because nothing is placed there.
- **The doors are objects with different weights**, not four identical 10px chips in a corner: a
  bound Repository, a wire-bound reference, a copy stand, loose paper.
- **Grade is text before it is colour.** The stamp die reads `GOLD` / `SILVER` / `BRONZE` /
  `CLOSED`. It survives hue removal, and it survives the Signal direction.
- **Level titles get room.** The Repository is a page of cards, not a `repeat(5)` rail at `15ch`.

---

## 7. The board still has to be legible, and the numbers

The site feed is a smaller surface than a full-bleed board. That is the cost of this concept and
it was measured, not assumed.

- Feed screen is **656 design units** wide. At a 1440×860 viewport, `--u` = 0.86, so the screen is
  **564 CSS px**.
- `w2-05` (14×8) → **~40 CSS px/tile**.
- `w4-05` (40×40) → **~14 CSS px/tile = 28 device px at dpr 2**. Above the 24-device-px floor.
- At a 2560×1440 viewport, `--u` = 1.33: `w4-05` → **~21 CSS px/tile = 42 device px**.

**Crop ripeness is carried by shape, not by colour**, so it survives the small end and it
survives Signal:

| state | mark |
|---|---|
| planted, not ready | a short stem and a single square bud |
| half grown | stem plus two splayed leaves |
| **ripe** | a **filled disc with a lit north-west quarter** — the only round filled mark on the board |
| ice-scrub (worth nothing) | a splayed three-prong, never a disc |

`docs/shots/desk/*/21-legibility-40x40*.png` is the honest test of this.

---

## 8. The lamp

The desk obeys `docs/LIGHT.md` — the same lamp as the board, due north-west, and it never moves.
Taken from the board agent's written spec rather than eyeballed:

- **Cast shadows have equal offsets on both axes** (`dx = dy`, i.e. 135°), never an ellipse and
  never a 0-x drop shadow. Offset ≈ 1.4 × the object's height.
- **One shadow ink**, `#04090f`, at **0.32** — sitting inside the same band as the board's own
  `UMBRA 0.32` and `SHADE 0.34`. Two shadow densities on one screen reads as two lamps.
- **A tight contact strip** at 0.30 against the south edge of every object. It is what makes paper
  read as *resting on* the desk rather than floating.
- **Picking a document up lengthens the umbra and tightens the contact strip.** The angle never
  changes. That is what lift looks like under a fixed lamp.
- **Arrises are hard rules, never gradients.** North `#dbe8f0` at 0.46, west at 0.30, east black
  at 0.32, south a multiply of the material's dark tone. The bezels were rebuilt flat with hard
  inset rules for exactly this reason — a gradient bevel reads as plastic.

The board this prototype draws was brought onto the same spec at the same time
(`board.js: paintSolidFace`, cast shadow, occlusion, bot shadow).

---

## 9. What is real and what is faked

**Real in the prototype:** the editor (textarea + highlighted mirror + gutter, no dependency),
the board renderer (ordered 4×4 Bayer dither pinned to *device* pixels, one fixed key light,
materials by texture, trail heat, graticule, hover coordinate readout), the two art directions,
document dragging with persistent position, pick-up, pin, stamping, pen signing, the Repository,
the SIZE dial, the DISPATCH sequence with lamps, WebAudio SFX synthesised with no assets,
`prefers-reduced-motion`.

**Faked, and honest about it:**

- **The run.** One recorded route per level, played back on a timer. No simulation.
- **The par for `w2-05` is invented** (`96`). Every other number is the real one —
  `w4-05` carries its real objectives, par 700, shift ends 2600.
- **Highlighting is regex.** The real editor is Monaco.
- **Signal** is a luminance→amber remap of the Deep Site palette, not the real direction.
- **The binder** is a static page of plausible records.

**Hard to build for real, flagged now:**

1. **Nothing may be drawn over the board — including the graticule.** This prototype draws ruler
   ticks and coordinate numerals in the *bezel margin* inside the canvas. In the real renderer
   that margin has to be reserved by the camera fit, or the numerals will eat tiles at `w8-05`.
2. **Pick-up must not be a modal.** It is a transform on a persistent element. If it is
   implemented as a portal/overlay it will reintroduce exactly the self-destroying-ceremony
   problem the desk exists to remove.
3. **The pinned form of a document is a second authored view of the same content.** It is not a
   CSS scale of the sheet. Levels will need a pinnable projection (`ask` + `facts`) — cheap,
   because `BriefPanel` already separates those, but it is real work and it must not be forgotten.
4. **The desk is a fixed composition on a `--u` unit.** It survives from about 1180×640 upward.
   Below that it needs a reflow that does not exist yet.
5. **The board's dither is a per-block `fillRect` loop and it does not obey `LIGHT.md` §7's
   cost rule in the aggregate.** The cell is correctly pinned to device pixels, so the count per
   tile *does* fall as the tile shrinks — but the total is still large: at a 40 device-px tile the
   prototype emits ~400 fills per tile, and `w4-05` at 1600 tiles is tens of thousands of calls a
   frame. In the real renderer the dither must be baked into an offscreen pattern once per zoom
   step, not emitted per block per frame. **Told to the board agent; recorded here so it is not
   rediscovered as a frame-rate bug.** The desk chrome itself is safe by construction — every
   bevel and every shadow is a single `box-shadow` declaration, so nothing is looping.

   **The pattern to copy is `src/render/terrain.ts`** — it keys on tile size and biome, rebuilds
   on a zoom step, and is the reason this direction can afford texture at all. The shipped
   `deepsite.ts` is already clean by this measure: all 23 of its `dither` call sites sit inside
   sheet-row painters that `buildSheet` composes, so the board pays one `drawImage` per frame for
   the whole terrain. This prototype's renderer is the naive version and should not be ported.

   The finding is now `docs/LIGHT.md` §7: a construct can pass a per-element cost test and still
   sink the frame, because **the tile count rises exactly as fast as the per-tile count falls**.
   Both halves have to be asserted — per mark *and* per whole board.

   **A third shape that neither half catches, recorded here because it is unconfirmed.** I sent
   this to the board lane but the message queued after its last tool round, so treat it as
   unreviewed rather than as agreed. A loop whose iteration count is a function of **elapsed
   ticks** rather than of zoom passes both tests and still sinks a specific level. The visited-tile
   trail is that shape: one fill per visited tile per frame, over a set that grows monotonically
   for the whole run. It is cheap at every tile size and cheap at tick 0, and expensive only at
   tick 1500 — on `w4-02`, which is the one level *designed* to ride a bot round a loop until the
   shift ends, and whose failure mode `DESIGN §11 A5` requires the trail to draw distinguishably.
   The cost test wants a third assertion: **count at two ticks, not only at two sizes.**

   I have not checked whether the shipped overlay has this shape. I own nothing under `src/`.

6. **WebAudio SFX are synthesised here.** The real game has an audio bus already; the stamp thud,
   the switch clunk and the paper slide should be authored there, not ported from this file.

---

## 10. What did not work

Recorded because a spike with no discarded attempts was not bold enough.

**The program as a fanfold listing.** The first build had the code on continuous green-bar
tractor-feed paper with sprocket holes, fold creases, and compile errors marked in red pen in the
margin. It looked wonderful and it was **wrong**, and the correction that killed it is the one
that made the whole concept coherent: *our product is digital, and a programming game rendered as
sheets of paper is dress-up.* The red-pen-in-the-margin idea for errors is the one piece worth
rescuing, but onto the terminal, not onto paper.

**A cramped Papers, Please desk.** Two rounds were spent making the surface scarce — stacks in the
way, shuffling as a cost. Papers, Please earns that because shuffling *is* its gameplay. Ours is
reading a board and writing a program, and every unit of clutter was a unit stolen from the code.
The desk is now deliberately tidy, well-lit and squared up, and the discomfort is that it is all
extremely correct.

**A depth-based mode change.** An early version pushed the monitor back and pulled the code
forward on a CSS `perspective`, so "writing" and "watching" were changes of depth rather than of
layout. It distorted the code and it broke the rule that the board is never non-rectilinear —
DESIGN §8's "no curvature" is a gameplay rule wearing an aesthetic hat, and it applies to the
chrome too. What survives is the *light* changing between the two modes rather than the geometry:
the lamp dims and the site feed throws light back onto the desk when a run is playing.

**A tile-fraction dither.** The board's ordered dither was initially `tile / 4`, which is a
checkerboard at 48px and honest noise at 12px — the same material looking like two materials.
Pinning the dither cell to **device pixels** fixed it, and that is the open item the art spike
itself flagged (§7, "the dither cell size should probably be pinned to device pixels").

**Per-element zoom.** Considered and rejected before it was built: scaling individual objects
destroys the composition, which is the only thing holding the fiction together.

**A geometric desk scale.** Built, measured, abandoned — see §5.

**The coffee mug.** Cut. The narrative has "a coffee that has gone cold" and it was a good detail,
but on a desk this tidy it was a dark blob with nowhere to be, and it was the weakest object on
screen. Subtraction beat placement.

---

## 11. Prototype controls

`docs/prototypes/desk/index.html` takes URL parameters so any state can be photographed
deterministically:

```
?scene=rest|order|write|run|halt|result|req|review|binder
&still=1          no idle redraw — required for headless capture
&nochrome=1       hide the scene director
&freeze=180       pause every animation at that millisecond
&tick=17          park the trace on a tick
&pin=order        pin a document to the copy stand
&up=order         pick a document up
&stamp=gold       land a stamp on the certificate
&stamping=gold    hold the stamp over the box, pre-strike
&size=1.3         SIZE dial
&art=signal       display mode
&big=1            switch to the 40x40 cave, the legibility floor
&flat             lights up, lamp and vignette off
```

Headless capture (the extension cannot open `file://`, and the window manager clamps the
viewport, so the shots are taken this way):

```sh
sh /tmp/deskshot.sh 1440 860 out.png "http://127.0.0.1:8791/desk/index.html?scene=rest&still=1&nochrome=1" 2600
```

Serve with `python3 -m http.server 8791` from `docs/prototypes/`. The prototype itself needs no
server — the fonts are inlined as `data:` URLs precisely so `file://` works.

---

## 12. RESUME POINT

*Written 2026-09-06 at the 5h window boundary. A stranger should be able to pick this up.*

### Built and working

- The approved composition, unchanged: terminal upper-left (program + `OUTPUT` beneath), site
  monitor upper-right as a separate physical screen, objectives/targets tucked against the
  terminal's right edge, paper loose and overlapping lower-right, and along the bottom edge the
  DISPATCH key, the medal stamp block and the Repository.
- Additions since that shot, all along the bottom edge or in the paper zone, none of them moves
  the approved furniture: the **copy stand** (right), the **REFERENCE** manual (bottom-left), the
  **keyboard** (bottom, cropped by the desk edge), and the **SIZE** + **DISPLAY** controls on the
  terminal bezel.
- Pick-up, pin, SIZE, stamping, signing, the Repository, the graticule, the coordinate readout,
  the Signal direction, the full lamp conformance pass.

### Stubbed

- The `REFERENCE` manual is clickable and plays its sound but does not open. **Next step.**
- The Repository binder opens to a static page; the medal stamp you land is pushed onto a `filed`
  array that nothing reads yet.
- The tray holds three decorative paper edges; documents do not actually arrive *into* it — they
  arrive from off-frame and land on the desk.

### Immediate next step, one thing

**Open the REFERENCE manual** — the wire-bound book at bottom-left — as a two-page spread with the
command reference set at readable size, and make it pinnable to the copy stand. That closes the
carried finding "the reference the player consults mid-program must be readable at length without
covering the program", and it is the last reading surface that still has no home.

### Rulings ledger

| ruling | state |
|---|---|
| the approved composition is the baseline; furniture does not move | **held** — everything added since is in the paper zone or along the bottom edge |
| pick-up-to-read | **done** |
| pin-to-side | **done** — copy stand, larger type, persists across runs |
| one global desk scale, never per-element | **done as a type scale**; see §5 — I could not make a geometric scale work and I want a ruling |
| paper persists until filed; no self-destroying modals; `Results` reopen path | **done in the prototype** — nothing is a modal and nothing self-destructs. The reopen path in the real app is a src change I do not own |
| console and board simultaneously visible | **done** |
| desk furniture must not cover a tile | **done** — nothing is placed over the feed at all. The graticule is inside the canvas but in the bezel margin; see §9 item 1 for what that costs the real camera |
| art picker, two entries, Deep Site default, Signal monochrome, cut `survey` | **shown in the prototype** as the `DISPLAY` switch on the bezel. Cutting `survey` and wiring `chooseArt` is a src change I do not own |
| the desk obeys `docs/LIGHT.md` | **done** — §8. Board and desk brought onto the same numbers together |
| the program is the biggest thing while writing | **held** — measured: the terminal screen is ~1.9× the area of the feed screen at every viewport size |
| the 17 CARRIED requirements in `AUDIT-UI.md` §2 | **partly** — §6 lists the seven the desk answers by construction. My worktree still has the pre-rewrite audit at `eb2b88d`; **the next session must pull main and walk §2 item by item** rather than trusting my §6 |

### Known rough edges

- The in-tray reads weakly as an object at laptop size.
- The copy stand's metal board is nearly hidden behind its page; the padding was widened once and
  probably needs one more pass.
- The board's `wall` south-face band was reduced from 0.13 to 0.085 of a tile and has not been
  re-checked at the 40×40 zoom.
- No shot set has yet been captured at a large-monitor viewport. The headless harness is the way
  to do it; the window manager on this machine clamps a real window to 1180×643.
