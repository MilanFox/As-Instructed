# FOCUS — a second view the player commands

The player said the in-game IDE was too small for the larger work orders and asked for a maximize /
focus mode. What shipped is a persistent station state called **FOCUS**, thrown from a switch on the
terminal's bezel and bound to `ctrl+shift+f`. In `desk` the approved composition is exactly where it
always was. In `program` the desk is gone and the screen is two objects: the terminal, and the site
feed as a preview.

Appended per unit of work as each landed. **Units 0, 3, 4 and 7 were written twice** — the brief
changed direction mid-implementation and the record of both is kept, because the first answer is why
the second one is shaped the way it is.

---

## Unit 0 — the contract, read first

`docs/DESIGN.md` §8, §10 and §11 were read in full before any code, along with the `Desk.tsx` header
comment.

**Nothing in DESIGN.md forbids FOCUS and nothing in it was worked around.** The one line in genuine
tension is not in DESIGN.md at all, it is the `Desk.tsx` header:

> The composition is a fixed arrangement on one unit, `--u`, fitted to the viewport. Every position
> in the stylesheets is written in design units against `DESK_FRAME`. It is not a responsive layout
> and it is not meant to be: the arrangement is the approved one and moving the furniture is not
> polish.

**My read: FOCUS does not break it, and the reason is the word *responsive*.** That sentence is
about the window not being allowed to rearrange the desk, and about "polish" not being a licence to
nudge things. FOCUS is neither. It is a second view the *player* asks for by throwing a physical
switch, and it does not move one piece of furniture — it takes the furniture off screen entirely and
lays two machines out against the window. Throw the switch back and every object is at the same
design-unit coordinate it was at before, because not one of the rules that place them was touched;
`desk-frame.test.ts` now asserts exactly that (`changes no box the desk composition states`). The
header comment has been extended to say so, rather than left to be read as contradicted.

The other rules that bear on it, and how the view answers each:

- **§8, one lamp due north-west, "no bloom, no CRT curvature".** FOCUS applies no `transform`, no
  `perspective`, no filter and no scale anywhere. Both bezels keep their four arrises, which are
  `--u`-based `box-shadow`s at the one lamp's angle, unchanged. The room, the lamp gradient and the
  vignette are *removed* rather than dimmed: there is no desk for a lamp to light, and a half-lit
  desk with no desk on it reads as a rendering bug. The background is the flat `--room` the desk
  already sits on.
- **§10.1 / §10.2.** `npm run typecheck` and `npm run lint` are clean; no `any` was introduced.
- **§10.5, playable from the keyboard.** FOCUS is bound and listed in `keys.ts`, so the REFERENCE
  manual prints it with the other nine bindings.
- **§10.6, no soft-lock.** This is the load-bearing one for this feature, and it is why the bezel
  plate matters more in FOCUS than anywhere else in the game: the switch on it is the only way back
  to the reference, the Repository, the site plan, the paperwork and the stamp block. There is also
  the key, which works from inside the editor. `desk-frame.test.ts` has a dedicated assertion that
  the plate is not hidden.
- **§11 Perfect Information.** Two calls to report, in unit 9.

---

## Unit 1 — `src/ui/desk/focus.ts`, the state

`scale.ts`'s shape, exactly: a module-level value, a private `Set` of listeners, `emit`, `subscribe`,
`useSyncExternalStore`, its own `localStorage` key and a `try`/`catch` around every touch of it with
the reasoning restated. Boolean, default off.

**Changed:**

- `src/ui/desk/focus.ts` — new. `FOCUS_KEY = 'bootstrap.deskFocus'`, `DEFAULT_FOCUS = false`,
  `deskFocus()`, `setDeskFocus()`, `toggleDeskFocus()`, `useDeskFocus()`.

The stored value is the word `on` or `off` rather than `true`/`false`, so a hand-edited key reads as
a switch position, and anything that is not `on` reads as off — an unknown value degrades to the
approved composition rather than to a coin flip.

---

## Unit 2 — `Desk.tsx` publishes it

**Changed:**

- `src/ui/desk/Desk.tsx` — `useDeskFocus()`, and `data-focus={focused ? 'program' : 'desk'}` on the
  `.desk` element beside `data-mode`, `data-art` and `data-doc`. `--u` and `--ts` untouched.
- Its header comment gains a paragraph, for the reason in unit 0.

`data-focus` is always written, in both positions, rather than being present only when on. A
stylesheet that keyed the resting composition off the *absence* of an attribute could not be read as
two views by the frame test, and the test is the reason FOCUS is allowed at all.

The view is built entirely in CSS on `.desk[data-focus='program']` and **not** by rendering a
shorter list of objects. `Desk.tsx` renders `STATION` and `DESKWARE` from lists precisely so there
is one place a `PanelBoundary` can be omitted, and `desk-boundaries.test.ts` fails if an object is
missing from the lists at all. A view that rendered a different set would be a second list to keep
in step with the first. Every object is mounted in both views, with its boundary; the stylesheet
decides what is on screen.

---

## Unit 3 (first pass, superseded) — the terminal, widened inside the desk

The original brief was "sideways only, nothing on the desk moves, no door is buried", and that was
built and measured: `.display--term` at `width: 1160u` with its left edge unchanged, right edge at
`+398u`, the feed shrunk to a `360u` preview at `+416u`, both compositions inside `DESK_FRAME`,
`.routines` following the glass at `1130u`. It worked. Measured at 1440×860 it gave **107 columns ×
27 lines against 63 × 22** — about 2.1× the code area.

**Why it was replaced.** 1160u is not a choice, it is a ceiling: it is all the glass that fits
between the terminal's left edge and the copy stand at `+470u`, and no arrangement of the furniture
gives the program more. The player's own answer was better and they said so plainly — *"The 'Focus
Mode' can be an entirely different view. Without all the clutter of the desk and stuff. Only
Terminal and preview. And for the ui elements that are hidden then you just exit focus mode
again."*

What survived the change: the state module, the `data-focus` attribute, the switch, the keybinding,
the log collapse, the feed preview's `360u` column and its two type knobs, and the argument for
relayout over `transform`. What was discarded: every frame-unit coordinate, and the idea that FOCUS
is a composition inside `DESK_FRAME`.

---

## Unit 3 (final) — the terminal, sized by the window

**Changed:**

- `src/ui/styles/desk/desk.css` — a `FOCUS` section: the room hidden, every piece of deskware
  hidden, and `.station` given a two-column grid against the viewport.
- `src/ui/styles/desk/terminal.css` — the `FOCUS` section rewritten: the terminal in flow, the
  bezel and screen as a flex column, the log collapse, `.ts-close`, `.routines` from the published
  glass, and the stands hidden.
- `src/ui/desk/terminal/OutputLog.tsx` — a `data-empty` attribute on `.term-log`.
- `src/ui/desk/terminal/Terminal.tsx` — the glass publishes its own box; the closing line.

**The layout.** `.station` is `position: fixed; inset: 0`, `display: grid`, columns
`minmax(0, 1fr) calc(360 * var(--u))`, `gap` and `padding` `26u`, `align-items: stretch`. The
terminal takes the flexible column and stops being *placed*: `left`, `top` and `width` are handed
back, the display becomes a flex column, `.bezel` is `flex: 1` and the screen inside it is
`height: auto; flex: 1`. The feed opts out of the stretch with `align-self: start`, because a
preview stretched to a window's height would be a 360u-wide letterbox of empty case.

**`--u` is untouched, and that is the whole point.** Everything inside the terminal is still tuned in
design units — the bezel's `15u` padding and its arrises, the rail's `224u`, `13.5u` type on a `21u`
line. Only the number of rows and columns of it changes. Verified: `--ts` and `--u` read identically
in both views at both viewports.

**The log.** `OutputLog.tsx` already knew everything needed and had no attribute for it, so it got
the smallest one. `data-empty` is computed from `all.length > 0 || suppressed > 0 || runState ===
'running'` — the *whole* console, not the filtered, playhead-clipped `shown` array the component
renders. That distinction is the point: filter to `print` with an error in the log, or scrub back to
tick 0 with a trace loaded, and `shown` is empty while the log is not. An error collapsed out of
sight is the failure this must not cause. A run in flight counts as content, so the body is open
before the first line lands rather than the code stepping down a notch under the player's hands.
Collapsed, the log is its head bar — still legended `OUTPUT`, still carrying the filter and `clear`.
Observed live: 25.5u collapsed, back to its full 128u the moment the run's first line arrived.

**`.routines`, and the one piece of new machinery.** `~/lib.ts` survives into FOCUS — it is the
player's own code drawn on the terminal's own glass, and its door is the file rail on the terminal
bar, which is inside the glass. On the desk its box is arithmetic and `desk-frame.test.ts`
recomputes it. In this view the glass is whatever the window left it after the grid, and no `calc()`
in `--u` can name that, so `Terminal.tsx` observes the screen with a `ResizeObserver` and publishes
`--glass-x/-y/-w/-h` onto `.desk`; the FOCUS rule for `.routines` is those four properties and
nothing else. It observes the `.desk` element as well as the screen, because throwing the switch
*moves* the glass without necessarily changing its size and a resize observer on the element alone
would hear nothing about that. Verified in the browser with a probe element carrying the class:
`31.83, 31.83, 1076.48, 696.75` against a glass of `31.83, 31.83, 1076.48, 696.75`.

---

## Unit 4 — the site feed, a preview

**Changed:**

- `src/ui/styles/desk/monitor.css` — a `FOCUS` section; `--feed-glass-ts` threaded through the five
  pieces of type drawn on the glass; a paragraph added to the reserved-margin comment.

**The geometry.** The feed takes the fixed `360u` column, `position: relative`, `align-self: start`,
screen height `226u` — `360:226` against the resting `700:438`, so the housing keeps its proportions
and reads as the same object seen smaller. Measured: bezel `360u`, screen `316u × 226u`, canvas
`282u × 163u`, at both viewports.

`360u` is not a round number, it is a floor. The transport strip's playback keys are `141u` of the
row and the zoom ladder another `134u`, both moulded case drawn in `--u` and neither of them type,
so a narrower column costs the player a control rather than a few pixels of tracking.

**No `transform`.** Everything the housing is made of is tuned in `--u` at the size it is drawn: the
bezel's four arrises are one hard rule plus a row of falloff per §8, the graticule's tick marks are
single physical pixels, and the canvas is a bitmap the renderer sizes to device pixels itself. A
`scale(0.51)` resamples all of it — the arris softens into the gradient §8 forbids, the ruler aliases
in and out, and the board goes blurry, which is the one thing a preview of the board may not be.

**The renderer re-fits, and needed no new code.** `src/render/renderer.ts:1729` installs a
`ResizeObserver` on the canvas in `observeSize()`, and `resize()` at line 1753 recomputes the device
backing store, calls `camera.setViewport(...)` and then `camera.fit(false)` whenever the box changed.
`#board` is sized in percentages of the screen, so a change to the screen's CSS box changes the
canvas's and the observer fires. Verified after a real run in FOCUS at 1280×720: canvas backing store
`202 × 117` device pixels against a CSS box of `202 × 117` at DPR 1 — an exact match, so the picture
is drawn at the size it is shown at, not scaled into it.

**Two type knobs, and why the brief's one was not enough.** The brief proposed `--feed-ts` on
`.station` consumed as `--ts` on `.display--feed`. That is implemented and it is right — but it only
reaches the type on the *case*. The type on the *glass* deliberately does not multiply by `--ts` at
all: `monitor.css` and `geometry.ts` both argue that a type scale which grew the OSD would take the
room out of the board, and `monitor-margin.test.ts` enforces it by refusing to find the SIZE dial
named anywhere above `.feed-controls`.

Inside the screen is exactly where it was needed. `geometry.ts` records that `SITE · GRID 24×18` and
`SIGNAL DELAY 41 MIN` take about 319u between them, and the FOCUS screen is 316u wide *in total*;
`LAST KNOWN STATE · NO TRACE ON FILE` at 10u with `.3em` tracking wants about 315u of a 296u strip.
The existing `.feed-osd--long` variant is the record of this crowding having bitten before. So there
is a second factor with a different owner: `--ts` is the player's, `--feed-glass-ts` is the
composition's. It defaults to `1` on `.desk .display--feed`, becomes `.72` under
`[data-focus='program']`, and multiplies `.feed-osd`, `.osd-xy`, `.feed-tick`, `.feed-stamp` and
`.feed-tick-mark b`. The SIZE dial still cannot cost the board a rung.

**The transport strip, on two rows.** Left alone it overflowed and did the worst available thing:
the scrub bar collapsed to *zero* width and the zoom ladder hung `164u` off the right of the case.
Measured: the strip wants `512u` and has `360u`. It now wraps, in DOM order, with `flex-wrap: wrap`,
`gap: 6u 8u`, and `.fc-scrub { flex: 1 1 140u }` — the scrub's basis is what stops it being squeezed
onto row one as a sliver and pushes the readout down. Keys and scrub on row one, readout, speed and
zoom on row two. **No `order` and no grid placement**, deliberately: both would have laid out
identically and both decouple visual order from focus order.

The mode lamp lands on a third short line of its own. Row two is already 240u of readout, speed and
zoom in 242u of strip, and the only column gap that pulls a 9u lamp up onto it is `4u` — between
three pieces of moulded case, which is not a gap, it is a join. So the lamp is given
`margin-left: auto` and takes the corner of the plate, which is where a mode lamp lives on a monitor
anyway. Confirmed on screen: it lights amber in the bottom-right of the transport case during a
replay.

**Legibility, read off the screen at both viewports.** The OSD's two chrome notes, the graticule
numerals, the `LAST KNOWN STATE` stamp, the four-digit tick readout, the `PLAYHEAD 0064 / 0064`
transport readout, the speed select, the `ZOOM OUT / FIT / IN` legends and the asset tag all fit and
are readable. Nothing is clipped and nothing overlaps.

---

## Unit 5 — the control

**Changed:**

- `src/ui/desk/terminal/BezelFoot.tsx` — a fifth control, `.focussw`, legended `FOCUS`, reading
  `PROGRAM` or `DESK`; two paragraphs added to the module comment.
- `src/ui/styles/desk/terminal.css` — `.focussw`, `.fsw-track`, `.fsw-track i`, `.fsw-legend`,
  matching `.dispsw` / `.repsw` declaration for declaration.

A throw switch and not a key, because a switch reads as *a position held* and this one is held across
sessions. It carries its own `i` marks rather than sharing `.dsw-track i`, for the reason `.repsw`
already documents: those state selectors are descendant rules and a shared mark would throw every
knob on the plate on one click. `aria-pressed` is the position; the `aria-label` says both where it
is and what pressing it does, in the phrasing the other two switches use — `Focus: desk. Switch to
program, the terminal and the site feed as a preview, with the desk off screen`.

**The plate had to be tightened, and here is the measurement.** The binding case is SIZE 1.5, where
type scales and hardware does not — the plate's existing comment already records that it found this
limit once with four controls. Measured at SIZE 1.5, in design units, with FOCUS reading `DESK`
(the wider of the two words is `PROGRAM`, but in FOCUS the plate is 1385u wide and has the room):

| | plate needs | plate has | slack | overflows? |
|---|---|---|---|---|
| four controls, as shipped | 783.2u | 805.8u | 22.5u | no |
| five, unchanged | 857.0u | 805.8u | −51.2u | **yes, and the row wraps onto the DISPATCH key** |
| five, as shipped here | 779.1u | 805.8u | 26.6u | no |

Three changes bought it back, and nothing was removed. The plate's `gap` goes `10u → 7u` and its side
padding `14u → 10u`, which is the plate's own spacing and costs no legend anything. The *readings*
drop from `.22em` to `.08em` — the readings only. `REPORTS`' reading is `ONE LINE AT A TIME`,
eighteen characters, and at `.22em` the tracking alone is a quarter of its width; the legends are
stacked, so that one string sets the width of its whole control. **The silkscreen labels keep `.22em`
untouched**, which is the part that reads as a moulded plate rather than as a toolbar: the label is
printed on the case, the reading is what the control is set to, and they were never the same kind of
type. Checked at every SIZE detent at both viewports: `scrollWidth === clientWidth` throughout.

The maker legend `ISOMER 21 · TERMINAL` was not touched and no existing control was removed.

---

## Unit 6 — the keybinding

**Changed:**

- `src/ui/desk/terminal/keys.ts` — a `'focus'` `KeyId` and its `KeyBinding`. `keys: 'ctrl+shift+f'`,
  `always: true`, `what: 'widen the terminal and shrink the site feed to a preview'`, and a `matches`
  accepting `(metaKey || ctrlKey) && shiftKey && (key === 'f' || key === 'F')`.
- `src/ui/hooks/useKeyboard.ts` — the `focus` action. The `Record<KeyId, …>` made this a compile
  error until it was written, as designed.

Meta and Control are both accepted and only Control is named, which is the rule the file already
states: a hint that names both modifiers names neither. `f` and `F` are both accepted because a held
Shift is what puts the letter in `key` uppercase. `always: true` because the entire point is to be
pressed with the caret in the program; Shift plus a letter with Meta or Control is not claimed by
Monaco's default keymap, so nothing is taken from the editor. The action is deliberately not gated on
`state.screen`: the view only exists on the desk, and a key that silently did nothing elsewhere is a
key the player learns not to trust.

**The REFERENCE manual needed no change.** `Manual.tsx:416` maps `KEY_LIST` straight into the `Keys`
section of the left page, keyed on `binding.keys`, so the new row prints itself.

Verified live: `ctrl+shift+f` with the caret in Monaco threw the switch and did not put an `f` in the
program.

---

## Unit 7 — the tests

**Changed:**

- `src/ui/__tests__/desk-frame.test.ts` — the resting half unchanged in substance; a second
  `describe` added that guards FOCUS by presence and by the way out. 6 tests became 14.
- `src/ui/desk/__tests__/focus.test.ts` — new, 8 cases.

**Why the FOCUS guard is a different kind of guard.** The first pass at this file bucketed rules into
two compositions and ran every extent assertion against both, which was right while FOCUS was a
second arrangement inside `DESK_FRAME`. It is wrong now: FOCUS is not in the frame, its terminal
column is `1fr` of an unknown window, and asserting an extent for it would be asserting nothing. So
the two halves guard different things, and the file's doc comment says so plainly.

- **The desk is guarded by extent**, exactly as before, measured off the rules that carry no
  `[data-focus=…]` predicate. `changes no box the desk composition states` states the other half out
  loud: a stray override without a predicate would move the approved geometry, and this catches it.
  `places nothing in the frame from a FOCUS rule` catches the reverse — a FOCUS rule that went back
  to centred `calc(50% ± N * var(--u))` coordinates would quietly put the view back in the frame with
  everything still rendering.
- **FOCUS is guarded by presence and by the way out.** Every object the desk places is on exactly one
  of two roll-calls, `FOCUS_KEEPS` (three entries) or `FOCUS_HIDES` (fourteen), each with its reason,
  and the stylesheet is checked to agree with both. A new piece of deskware fails this file until
  somebody decides which view it belongs to. Then: the bezel plate and the switch are asserted *not*
  to be hidden, because that plate is the only way out and losing it is DESIGN §10.6's soft-lock
  wearing a stylesheet; `.station` is asserted to be `inset: 0` and a grid; and `.routines` is
  asserted to take all four sides from the published glass properties, with `Terminal.tsx` checked to
  publish them.

**What did not need changing.**

- `desk-boundaries.test.ts` — no new `DeskObject`, and the view is CSS, so the lists are intact.
- `control-reachability.test.ts` — it skips any selector containing `[` or `:` by design ("a state is
  not a box"), and `.focussw` is in the plate's flow rather than positioned, so it is not in the
  roll-call of absolutely positioned controls.
- `paper-clearance.test.ts` — the FOCUS selectors do not match its `\.desk \.stand--feed` pattern,
  and in FOCUS there is no paper and no stand at all.
- `monitor-margin.test.ts` — one thing did change, and it was a comment. The guard reads
  `monitor.css` as raw text, comments included, and a sentence explaining `--feed-glass-ts` that
  named the SIZE dial in the form the stylesheet consumes tripped it. The comment now spells the dial
  out in words and says why it has to. The guard was doing its job; the wording was the bug.
- `confessed-invariants.test.ts` — no confession was written and none was needed. No value is
  restated: the second view derives its boxes from the grid or from the published glass rather than
  from a second copy of a number, and `--feed-glass-ts` is a factor rather than a duplicate of a size.

---

## Unit 8 — the measurement

Measured in Chrome against the running dev server. Two viewports are real measurements; 1440×860 is
computed from a model of the layout that reproduces both measured viewports **exactly**, because this
display cannot give a 1440-wide window more than 780px of viewport height (the browser chrome takes
177px of a 1080px screen). The model is
`u = min(W/1552, H/1004)`, `editorW = W − 438u − 30u − 224u`, `editorH = H − 52u − 25.25u − 30u −
83.67u`, advance `= 0.59943 × 13.5u`, line height `= round(21u)`.

| viewport | rest | FOCUS | code area |
|---|---|---|---|
| **1440 × 860** (computed) | **63 × 22** | **117 × 38** | **3.21×** |
| 1280 × 720 (measured) | 63 × 22 | 130 × 38 | 3.56× |
| 1440 × 780 (measured) | 63 × 23 | 138 × 39 | 3.71× |

Character size is identical between the two views at every one of those: at 1440×860 the font is
11.56px on an 18px line in both, at 1280×720 it is 9.68px on a 15px line in both. The extra area is
entirely extra rows and columns.

The counter-intuitive row is 1440×860 giving *fewer* columns than 1280×720. That is correct and worth
knowing: `--u` is `min(W/1552, H/1004)`, so on a 1440-wide window 860px of height makes the type
bigger while the width available for the program does not change. FOCUS pays off most on a window
that is wide relative to its height, which is the opposite of the desk, where the whole composition
scales together.

Everything else, measured in both views:

| | rest | FOCUS (1440 × 780) |
|---|---|---|
| objectives rail | 224u | 224u — unchanged, at unchanged type size |
| terminal glass | 776u × 660u | 1385u × 897u |
| OUTPUT log, idle | 128u | 25.5u (head bar only) |
| OUTPUT log, holding | 128u | 128u |
| feed bezel | 700u | 360u |
| feed screen | 656u × 438u | 316u × 226u |
| board canvas | 622u × 375u | 282u × 163u |

---

## Unit 9 — the two things FOCUS takes away, and what was decided

Both are DESIGN §11 problems rather than conveniences, and both are answered in one line of copy on
the terminal's own status strip. **No workaround was built** — the player accepted that hidden UI
means throwing the switch back, so there is no floating toolbar, no second dispatch key and no
in-view brief.

**1. Running — nothing added.** The DISPATCH key is on the desk, so `ctrl+enter` is the only way to
run in FOCUS. It always was the announced way: `always: true` in `keys.ts`, and `RUN_HINT` —
`ctrl+enter dispatches every seed` — is printed on the terminal's status strip, which is inside the
glass and therefore survives into this view. Verified on screen at both viewports, and verified by
actually running a program with `ctrl+enter` from inside Monaco in FOCUS: the run went out, the log
opened, the trace came back and replayed in the preview.

**2. Closing a work order — one sentence, on the status strip.** The stamp block is on the desk, so a
passing verdict in FOCUS lands on a surface the player cannot see, and §11 does not let the way to
finish a level be something you have to already know.

The strip was chosen over the log for three reasons. The log is a scrolling surface and this message
is the way out of a state, not an event that may scroll away. The strip is the terminal's own
statement of what the player can do now and already carries the game's one procedural hint, so a
second one is exactly parallel. And the strip is UI-owned, where a log line would have meant teaching
`src/game/store.ts` which view the shell is in.

The copy, rendered only when `focused && verdict?.passed`, in the strip's register — lowercase,
factual, no joke, per NARRATIVE §0 — and coloured `--ok`, matching the log's own `work order closed`
line, because the strip already reserves `--danger` for the program's problem count:

> `work order ready to close — ctrl+shift+f for the desk and the stamp block`

The key string is read from `KEY_LIST` rather than typed again, so the sentence cannot disagree with
the binding or with the REFERENCE. Verified live on `w1-01`: the strip printed it the moment the
verdict came back `CLOSED`, and it was gone again the moment the switch was thrown back to `DESK`,
where the stamp block is visible and the sentence would be noise.

**`~/lib.ts` survives into FOCUS.** It is the one thing on the `DESKWARE` list that is not deskware —
the player's own code, drawn on the terminal's own glass — and its door is the file rail on the
terminal bar, which is inside the glass. Hiding the panel while leaving the key that opens it would
have been a door onto nothing.

---

## Unit 10 — the checks

`npm run lint`, `npm run typecheck` and `npm run test:run` are clean: **103 files, 2211 tests, 0
failures.** No pre-existing failures were found, so none are being left behind.

Driven in Chrome against `npm run dev` at 1440×780 and 1280×720, resting and focused, toggled both
ways with the switch and with the key, with a failing run and a passing run watched through in the
preview. Confirmed by eye: no clipped bezel arris on either machine, no overlap with anything, the
plate not overflowing at any SIZE detent, Monaco re-laid-out to the real width (long comment lines
that wrap at rest sit on one line in FOCUS), the board sharp and whole, the transport legible, and the
objectives rail identical in both views.

One thing observed and left alone: a long `error` line in the OUTPUT log is clipped at the right
rather than wrapped, because `.log-body div` is `white-space: pre`. That is pre-existing behaviour and
FOCUS strictly improves it — the log is 1385u wide there against 776u at rest.

---

## Unit 11 — one thing I broke and undid, worth writing down

**`npm run format` rewrites 84 files in this repo, and I ran it.** `AGENTS.md` lists it as the
finishing step, but the tree at `HEAD` is not clean under the pinned Prettier: running it reformats
the whole of `src/` — 84 files, ~6,600 changed lines — including `furniture.css` (+1,560) and
`paper.css` (+1,737). Two causes, both visible in the diff:

- The desk stylesheets are hand-written many-declarations-to-a-line, ported that way from
  `docs/prototypes/desk/desk.css`, and Prettier explodes every rule to one declaration per line.
  That style is the whole reason those files are readable at their length, and it is not something a
  formatter should be allowed to have an opinion about here.
- Even in the TypeScript, `HEAD` and the pinned Prettier disagree about trailing commas and about
  where a 100-column line breaks, so files nobody has touched come back changed.

Every unintended file was restored to its `HEAD` content and my own edits were re-applied by hand in
each file's own style. **No git write command was used** — the restore read `git show HEAD:<path>`
and wrote the file, so nothing was staged, stashed, checked out or committed, and nothing outside
the diff below was touched. Verified: `git status` lists ten modified files and three new ones, all
mine, and every deleted line in `git diff` is either code I replaced or a comment sentence I
extended rather than removed.

**The recommendation, for whoever picks this up next:** do not run `npm run format` on this repo as a
finishing step. Match the adjacent style by hand and let `npm run lint` be the gate — it passes on
the hand-written style and it passed on this change. If the repo does want to be Prettier-clean,
that is its own commit, with `.prettierrc.json` given an override that leaves `src/ui/styles/desk/`
alone, and it is not something to land inside a feature.
