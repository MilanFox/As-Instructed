# FIX — the objectives overlay over the map, and no way to move it

Reported: *"The objectives overlay sometimes overlaps the map preview and can't be moved."*
Both halves are real. This file is written as the work goes, so a partial run still leaves the
findings behind.

## 1. Reproduced

Dev server on `:5199`, Chrome, workspace box **1920 x 726** CSS px, art `survey`, splitter at the
**default** 0.44 — nothing dragged, nothing unusual.

| level | grid | fitted tile | card over grid |
|---|---|---|---|
| `w1-01` Cold Start | 25 x 14 | 48 px | **104 x 210 px** |
| `w1-03` Length Unknown | 30 x 3 | 48 px | 224 px horizontally, misses by 13 px vertically |
| `w5-05` Blackout, splitter dragged to 0.58 | 30 x 24 | 24 px | **232 x 339 px** — the whole card |

`docs/shots/hud-overlap/before-w1-01-survey-1920x780.jpg` — the first work order of the game. The
map's top-left corner, its ruler and its first tiles are behind the objectives card.

`docs/shots/hud-overlap/before-w5-05-signal-splitter-0.58.jpg` — `signal`, the monochrome
direction, after the player drags the splitter. The card sits squarely on the district.

Measured in-page against the *real* camera (`renderer.camera.originX()`, `cols * tilePx`) rather
than by eye, so "over the grid" is the drawn grid rect, not an impression.

## 2. What actually varies — why it is "sometimes"

The card is `position: absolute; left: calc(var(--rig-w) + 12px); width: 232px`. The grid is drawn
by the camera's `fit()` into the canvas, **centred**. So the collision is the intersection of two
rectangles, and *four* independent things move them:

1. **Whether the gutter survives the clamp.** `useWorkspaceLayout` derives the default split as
   `rig = clamp(boxW - (boxH * aspect + HUD_GUTTER * 2), 440, 640)`. When `boxW - board` falls
   below `RIG_MIN = 440` the clamp bites, the rig takes 440 anyway, and the two gutters are
   whatever is left — often nothing. The workspace-layout suite says so out loud already:
   *"The reservation is a preference, not a promise: it is the first thing given up when the
   program's own floor binds… and the objective card ends up over the corner of a 40x40 grid."*
2. **The splitter.** A dragged fraction bypasses the derivation completely
   (`dragged ? saved.editorFraction : …`) and is only clamped to `max`, which allows the board
   down to `BOARD_MIN = 420` — less than two card-widths. Drag right and the card is over the map
   at any window size, forever, on every level.
3. **Grid aspect against workspace height.** `fit()` is `min(viewW/cols, viewH/rows)` snapped to a
   zoom-ladder rung. A wide grid is width-limited and spreads to the canvas edges; a tall one is
   height-limited and leaves gutters. Same window, different level, different answer.
4. **How tall the card is** — i.e. how many objectives the level has and whether their labels
   wrap. The grid is centred *vertically* too, so a short card can clear a wide-but-short grid
   entirely. `w1-03` (2 rows in the card, a 3-row corridor) misses by 13 px; `w5-05` (5 objectives
   + a bonus, a 420 px card) is straight through it. This is why the same window and the same
   splitter give an overlap on one level and not on its neighbour.

**The card's width is not one of the four.** That is the whole point: `HUD_GUTTER` and
`.hud-card`'s width can agree perfectly, as they do, and every one of the four still fires.

## 3. Why the guard passed while the defect shipped

`src/__tests__/confessed-invariants.test.ts` asserted `HUD_GUTTER === .hud-card { width }`. Both
were 232. They still are. The equality was never the mechanism:

- the reservation it guards is a **default**, discarded the moment `RIG_MIN` binds or the player
  touches the splitter;
- it reserves a gutter but says nothing about the grid actually being *drawn* inside it — the
  camera, the zoom ladder and the fit padding are not in the guard's field of view at all;
- and it is one-dimensional, while the collision is two rectangles.

Even at the design point the guard was already off by a margin: the card starts at
`--rig-w + var(--space-3)` and is 232 wide, so its right edge is 12 px *past* the 232 px gutter
the hook reserved. A number-equality guard cannot see a `calc()`.

The same repo had already written the truth down somewhere else. `workspace-layout.test.ts` said,
in a comment above a passing test: *"The reservation is a preference, not a promise… the objective
card ends up over the corner of a 40x40 grid — which is still the better half of a trade."* The
defect was documented as a known cost in one file and guarded as an impossibility in another.

## 4. The fix — the collision is unreachable, and the card can still be got out of the way

**Half one: the strip is real.** `.viewport__canvas` is now inset by `--hud-gutter`, so the drawn
board *starts* where the read-out's strip ends. The camera observes the canvas, so it re-fits into
what is left with nothing to tell it. `--hud-gutter`, `--hud-card-w` and `--hud-card-inset` are all
set inline on `.workspace` from one `WorkspaceLayout`, alongside the `--rig-w` that was already
there — so the strip and the card are the same arithmetic and the stylesheet holds no geometry
literal of its own. Widening the card widens the strip and moves the board; it cannot move the card
onto the grid. That kills all four variables at once, including the splitter: drag it as far right
as it goes and the card still ends before the canvas begins.

The card's width now follows the window (`clamp(round(width * 0.14), 168, 232)`). A fixed 232 px is
a fair share of a 1920 px workspace and nearly a third of the board on a 1280 px one, which cost
`w1-01` a rung and a half of zoom — and the whole point of the rework was that the board is the
screen. See §5 for what the strip does cost.

**Half two: the fold.** The card's header carries a fold control (`O`, or the chevron). Folded, the
strip narrows to a 24 px tab carrying `3/5 · objectives`, and everything it gives up goes to the
drawn board — on `w1-01` at 1180 px the tile goes 20 → 28 device px. So the control is a trade the
player is *rewarded* for, not a repair for a layout that failed them. The tab lives inside the
strip, so the way back is never itself over the grid. The choice is remembered in its own
`localStorage` key (`bootstrap.rail`), which is the precedent `src/ui/art.ts` set — no save
migration, and nothing here can touch anybody's progress.

I did not add a drag-the-card affordance. A "move it yourself" control is a workaround the player
only finds after being blocked, and with the strip in place there is nothing to move away from.

## 5. What it costs, stated rather than hidden

A strip is width the camera no longer has. Fitted with the real `Camera` against every level and
the layout this one replaced:

| workspace | levels that lose a zoom rung |
|---|---|
| 1680 x 734 and up | none |
| 1440 x 854 | 4 of 33, one rung each (`w1-01`, `w3-04`, `w5-01`, `w7-03`) |
| 1280 x 674 | 4 of 33, one rung each (`w3-01`, `w5-01`, `w5-02`, `w7-03`) |
| any, read-out folded | none — every level is at least as large as before |

So the old promise ("never fewer device pixels per tile than the layout it replaced") is *bounded*
rather than dropped, and both halves are now tests:
`never costs a level more than one rung of zoom against the layout it replaced` and
`gives every level at least as many device pixels per tile once the read-out is folded`.

The splitter's right-hand limit tightened for the same reason: it now leaves `gutter + 420 px`
rather than `420 px`, because 420 px of board of which 244 was under the card was never 420 px of
board.

## 6. The retargeted guard

`the objective read-out is never over the drawn grid` replaces the constant comparison. Six
workspace sizes x eight grid shapes x six splitter positions x folded and unfolded, each one fitted
with the real `Camera` — zoom ladder, fit padding and step-back-up rung included — asserting the
card's right edge never passes the grid's left edge.

It is stated **horizontally** on purpose. How tall the card is depends on the level's objective
count and how the labels wrap, which is the variable that made the bug read as *sometimes*; a
guarantee that does not depend on it is the stronger one.

Written first, against the code as it stood. It failed on 200+ combinations, including every grid
shape at the untouched default split on 1024, 1280 and 1440 px windows:

```
30x3  at 1280x674 split 0.44: card ends at 684, grid starts at 440
25x14 at 1280x674 split 0.44: card ends at 684, grid starts at 460
48x40 at 2560x1394 split 0.68: card ends at 1985, grid starts at 1766
```

A second test, `the stylesheet takes the strip and the card from the layout`, holds the structural
half: `app.css` has to take the canvas inset and the card's box from the custom properties, and
`Workspace.tsx` has to set all three. Without it the geometry above is arithmetic that proves
nothing about what renders.

The `useWorkspaceLayout.ts` entry is gone from the confessed-invariant registry, because the
duplicate it confessed is gone: there is one number now and it is in TypeScript.

## 7. Verified in the browser

Chrome, `:5199`, workspace 1180 x ~645. Overlap measured against `camera.originX()` and
`cols * tilePx`, not by eye.

| case | before | after |
|---|---|---|
| `w1-01`, `survey`, default split | card over grid | card ends 620, grid starts 656 |
| `w5-05`, `signal`, splitter dragged 0.58 | 232 x 339 px overlap | card ends 748, grid starts 764 |
| `w1-03`, 30x3 corridor, splitter at its limit | card over grid | card ends 748, grid starts 760 |
| `w8-03`, `deepsite`, 32x24 | — | card ends 620, grid starts 662 |

All four art directions, folded and unfolded, swept in-page: clear in every combination. The
accessibility tree (pulled, not inferred) gives `button "Fold the objectives away"` open and
`button "Objectives, 0 of 2 met — unfold"` folded. `O` toggles it; the choice survives a reload.

Shots in `docs/shots/hud-overlap/`:
`before-w1-01-survey-1920x780.jpg`, `before-w5-05-signal-splitter-0.58.jpg`,
`after-w1-01-survey-1180x699.jpg`, `after-w1-01-survey-folded.jpg`,
`after-w5-05-signal-splitter-0.58.jpg`, `after-w8-03-deepsite-open.jpg`,
`after-w8-03-deepsite-folded.jpg`, `after-tab-signal-monochrome.png`.

## 8. Left alone, on purpose

- **The chips, bottom-right.** `.hud-tools` is a 24 px ornament in a corner and the derivation
  still only *prefers* a margin for it. Reserving a second strip would cost the board another 256 px
  to protect four buttons. Named here so it is a decision and not an oversight.
- **`.viewport__empty`** ("no trace on file") hangs off the workspace's bottom-left and can still
  spill past the strip onto the grid. Same reasoning, and it is the note that disappears the moment
  a run exists.
- **The sheet** (`work order` / `console` / `reference`) covers the board by design — it is
  summoned and dismissed, and the player is meant to read it against the run behind it.

## 9. Files

- `src/ui/hooks/useWorkspaceLayout.ts` — the strip, the card's box, the retargeted splitter limit.
- `src/ui/hooks/useRail.ts` — new; folded-or-not, remembered.
- `src/ui/hooks/useKeyboard.ts` — `O`.
- `src/ui/Workspace.tsx` — the three custom properties.
- `src/ui/panels/ObjectiveRail.tsx` — the fold control and the tab.
- `src/ui/styles/app.css`, `src/ui/styles/art/signal.css`.
- `src/ui/hooks/__tests__/workspace-layout.test.ts` — the bounded promise, the fold's payment.
- `src/__tests__/confessed-invariants.test.ts` — the geometry guard only.

`npx tsc --noEmit` clean · `npm run build` clean · `npx vitest run` **1888 passed / 90 files**
(baseline 1885; +3 net) · `npx eslint src` only the known `w5-01.ts:32` false positive.

Note for the orchestrator: the dev browser profile's `bootstrap.save` had `seenRequisitions` and
`reviewedRanks` filled in so the sweep could open every level without a modal in the way. The save
was already 33/33 complete, so nothing was gated by it either way.
