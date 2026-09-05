# FIX — viewport aspect

Working log, appended to on disk as the work went. Branch `worktree-agent-a3284c840b87fe85c`,
rebuilt against main after the prose and Library agents landed (see §7).

---

## 1. Diagnosis — what sets 891×393

Nothing hard-codes a canvas size. The number is the product of two independent constants applied
on two different axes, and it is the *combination* that produces the letterbox.

**Width.** `src/ui/Workspace.tsx` sets the editor column to `layout.editorFraction * 100%` and
`.workspace__right` is `flex: 1`, so the right column gets the remainder minus the 5px splitter.
`DEFAULT_LAYOUT.editorFraction = 0.44` (`src/game/save.ts:92`), so at a 1600px window the right
column is `0.56 × 1600 − 5 = 891`. Exact match.

**Height.** The right column is a flex column: `.viewport` (`flex: 1`), `TimelineBar`
(`flex: none`, 46px), a 5px splitter, then `.workspace__lower` with an inline
`height: (1 − viewportFraction) * 100%`. `DEFAULT_LAYOUT.viewportFraction = 0.58`. At a
836px-tall window the workspace column is ~766px, so the viewport gets
`0.58 × 766 − 46 − 5 ≈ 393`.

So: **891 = editorFraction, 393 = viewportFraction.** Neither the canvas element, the CSS, nor
`src/render/camera.ts` imposes an aspect. `.viewport__canvas` is `width:100%; height:100%`,
`Renderer.resize()` sizes the backing store to the element's rect × dpr and re-fits, and
`Camera.fit()` does an honest letterbox fit. The canvas already fits its container correctly;
there was no bug to fix there. The box it is given is the whole problem.

### The consequence that decides the fix

`tilePx = min(viewW/cols, viewH/rows)`. Because the box is 2.27:1 and no level is wider than
1.4:1 in the range that matters, the viewport is **always height-bound**. Widening it buys zero
extra tile size — only more empty background. **Height is the only lever on legibility**, which
rules out "narrow the right column and hand the editor the leftover" as a fix for the tile-size
half of the complaint. It is still the fix for the wasted-width half.

## 2. Diagnosis — the grids are not square

The OPEN-ITEMS entry assumes square grids. Measured by building every level at its first seed
(temporary vitest probe, since removed; re-run after the merge, dimensions unchanged):

| aspect (w/h) | levels |
| --- | --- |
| 1.00 | w2-02 7×7, w4-01 23×23, w4-02 20×20, w4-04 30×30, w4-05 40×40, w6-03 20×20, w6-05 30×30, w8-04 30×30 |
| 1.20–1.40 | w2-04 5×4, w1-05 10×8, w8-05 48×40, w8-02 34×26, w5-05 30×24, w7-05 36×28, w3-02 16×12, w8-03 32×24, w5-03 24×18, w5-04 26×20, w7-04 28×20, w8-01 14×10 |
| 1.50–2.00 | w7-02 24×16, w6-01 10×6, w2-05 14×8, w1-01 25×14, w3-04 18×10, w6-02 12×6, w6-04 12×6 |
| 2.40–2.80 | w7-01 12×5, w7-03 22×9, w3-01 14×5 |
| ≥ 4.00 | w2-01 12×3, w5-01 22×5, w5-02 43×7, w1-03 30×3 |

8 of 34 are exactly square; 26 are wider than tall; median aspect ≈ 1.40. **But the levels that
stress the viewport are the big ones, and the big ones are square-ish:** w4-05 40×40, w8-05
48×40, w4-04/w6-05/w8-04 30×30, w7-05 36×28, w8-02 34×26. The four extreme-wide levels (≥ 4:1)
are all shallow (h ≤ 7) and legible at any layout. So the fix has to serve 1.0–1.4 without
costing ≥ 2.4 anything, and it is judged on w4-05 and w8-05.

## 3. Playtest evidence

Neither `docs/PLAYTEST-BEGINNER.md` nor `docs/PLAYTEST-VETERAN.md` mentions the viewport, the
canvas, panel sizes, scrolling or tile legibility at all. Recorded so the fix is not oversold:
this is an aesthetics defect found by measurement, not a reported pain point.

## 4. Method for the visual evidence

Dev server on `:5183` in this worktree, driven in Chrome. Save seeded with every work order
closed so `w4-05` (40×40, the worst case) can be opened, run to a 160-tick trace.

`resize_window` had no effect in this environment — the window stayed pinned (1600×780 inner,
later 1100×579) on a 1920×1080 screen, so 2560×1440 was not reachable at all. Window sizes are
therefore **simulated** by pinning `#root` to the target box and scaling it down with CSS `zoom`
on `<html>`. Element `clientWidth`/`clientHeight` then report the simulated CSS pixels, so **the
layout geometry in the shots is exact**; the canvas is rasterised at the zoom factor, so absolute
tile pixels *in the images* are not. Tile sizes are therefore computed from the real `Camera`
class instead (§6), not read off the screenshots.

One trap worth writing down for whoever measures next: the driven tab reports
`document.hidden === true`, and Chrome suspends rendering — and with it **all ResizeObserver
delivery** — in a hidden tab. Every "the DOM has not updated" reading in this session was that,
not the app. Taking a screenshot forces a frame and flushes the observer, so measure *after* a
screenshot, never before. Verified directly: a fresh `ResizeObserver` on `.workspace` fired zero
times across a size change, then fired once the instant a screenshot was taken, and the layout
re-derived correctly in the same frame.

The "before" shots are the current main layout reproduced in the same browser session: the saved
fractions nudged off the constants by 1e-11 (which bypasses the new derivation and restores
0.44/0.58 exactly) plus a style override restoring the pre-fix objective rail. Same build, same
trace, same window — only the layout differs.

## 5. Before — measured

| window | workspace | editor | site view | detail panel | brief / rail |
| --- | --- | --- | --- | --- | --- |
| 1440×900 | 1440×830 | 634 | **801×430** (1.86:1) | 801×349 | 398 / 398 |
| 1600×780 (real) | 1600×710 | 704 | **891×361** (2.47:1) | 891×298 | — |
| 2560×1440 | 2560×1370 | 1126 | **1429×744** (1.92:1) | 1429×575 | 711 / 711 |

The 891 is reproduced exactly. Two things stand out beyond the reported one:

- At 2560 the detail panel is handed **575px of height** for the same fixed amount of reading it
  gets at 1440, and every one of those pixels is taken off the site view.
- The objective rail is **398px wide at 1440 and 711px at 2560**, for a list of short rows that
  `app.css` declares as `width: 268px`. See §7.

Shots: `docs/shots/viewport/before-1440x900-w4-05.jpg`,
`docs/shots/viewport/before-2560x1440-w4-05.jpg`.

## 6. The change

Three edits. No panel moved, no control flow touched, no dependency added.

### `src/ui/hooks/useWorkspaceLayout.ts` (new)

`effectiveLayout(saved, box, gridAspect)` — a pure function plus a thin ResizeObserver hook.

1. **Height, capped and shape-aware.** The detail panel is capped at 340px; past that it only
   grows whitespace, so the surplus window height goes to the site view. But height is claimed
   only while the grid can *spend* it: the viewport is never taller than
   `widestAllowedWidth / gridAspect`, and never shorter than what the old constant gave it. A
   30×3 corridor therefore keeps exactly today's box and hands the extra height back to the
   brief instead of to background.
2. **Width, shape-aware.** The right column targets `viewportHeight × gridAspect` — the width
   the grid can actually use — clamped to `[268 + 392, the width the old constant already gave]`.
   The editor takes the leftover. A grid wider than it is tall hits the upper clamp and is left
   exactly as it was.

**Both apply only when the saved fraction is still the shipped default.** A fraction the player
has dragged is returned verbatim, so both splitters stay authoritative and no existing save is
stomped. No migration, no new save field. The derived values are clamped into the splitters' own
`min`/`max`, so `aria-valuenow` stays honest.

### `src/ui/Workspace.tsx`

Reads the grid aspect from `trace.initialWorld` (or `level.build(seeds[0])` when there is no
trace yet) and calls the hook. Everything downstream is unchanged.

### `src/ui/styles/app.css` — one rule

```css
.workspace__column > .panel,
.workspace__lower > .panel:not(.rail) {
```

`.rail` carries `.panel` as well, so the generic rule was overriding its own
`flex: none; width: 268px` (same specificity, declared later) and handing it **half the detail
panel**. Found while measuring, not looked for. It matters here because the width I am
redistributing was being spent on a 268px list sitting in a 400–711px column, with the brief
paying for it. Fixing it means the narrower detail panel still gives the brief the same reading
width it had before: 398 → 389 at 1440, 711 → 706 at 2560.

### Tests

`src/ui/hooks/__tests__/workspace-layout.test.ts`, 9 tests: never overrides a dragged fraction;
overrides only the axis still on its default; caps the detail height; frames a square grid
squarely; leaves a wide corridor the exact box it had; never gives the site view *less* room
than the old constants at any size or shape; stays inside the splitters' bounds.

## 7. After — measured, and the numbers

Tile sizes below are computed by driving the real `Camera` (`setViewport` → `setBounds` → `fit`)
over every level at each window size, so they include the zoom ladder and the fit padding.
"fill" is the drawn grid's area as a percentage of the canvas.

### Panel geometry, measured in the browser

| window | editor | site view | detail | brief / rail |
| --- | --- | --- | --- | --- |
| 1440×900 before | 634 | 801×430 (1.86:1) | 801×349 | 398 / 398 |
| 1440×900 **after** | 775 | **660×439** (1.50:1) | 660×340 | 389 / 266 |
| 2560×1440 before | 1126 | 1429×744 (1.92:1) | 1429×575 | 711 / 711 |
| 2560×1440 **after** | 1576 | **979×979** (1.00:1) | 979×340 | 706 / 265 |

Shots: `docs/shots/viewport/after-1440x900-w4-05.jpg`,
`docs/shots/viewport/after-2560x1440-w4-05.jpg`.

### Campaign-wide

| window | bigger tiles | smaller tiles | mean canvas fill |
| --- | --- | --- | --- |
| 1440×900 | 4 / 34 | **0** | 52% → 61% |
| 1600×836 (the OPEN-ITEMS window) | 0 / 34 | **0** | 48% → 60% |
| 2560×1440 | **19 / 34** | **0** | 48% → 69% |

**No level's tiles get smaller at any of the three sizes.**

The headline levels at 2560×1440:

| level | grid | before | after |
| --- | --- | --- | --- |
| `w4-05` | 40×40 | 1429×744, 18px, 49% fill | 979×979, **24px**, **96%** |
| `w8-05` | 48×40 | 1429×744, 18px, 59% | 1175×979, **24px**, **96%** |
| `w4-04` `w6-05` `w8-04` | 30×30 | 1429×744, 24px, 49% | 979×979, **32px**, **96%** |
| `w4-02` `w6-03` | 20×20 | 1429×744, 36px, 49% | 979×979, **48px**, **96%** |
| `w5-05` | 30×24 | 1429×744, 28px, 53% | 1224×979, **40px**, **96%** |
| `w8-03` | 32×24 | 1429×744, 28px, 57% | 1305×979, **40px**, **96%** |
| `w8-01` | 14×10 | 1429×744, 48px, 30% | 1371×979, **96px**, **96%** |
| `w1-03` | 30×3 | 1429×744, 44px, 16% | **unchanged** |
| `w5-02` | 43×7 | 1429×744, 32px, 29% | **unchanged** |

At 1440×900 the tile gains are `w3-02` 32→36, `w5-03` 20→24, `w5-05` 16→18, `w8-03` 16→18; the
rest keep their tile size and gain framing (`w4-05` 46%→55% fill, `w5-03` 50%→86%). A 13" laptop
is genuinely area-limited: a 40×40 grid needs 480px of viewport height for the next rung and
there are only 439 to be had once the brief has 340. That ceiling is real and this fix does not
move it.

At 1600×836 no tile size changes at all — the box was never width-bound there — but the mean
fill goes 48% → 60% and `w4-05` goes from using 36% of the canvas width to 48%.

### Known costs, stated plainly

- **Wide-thin levels lose a little fill at 2560.** `w1-01` 76%→71%, `w6-01` 52%→45%,
  `w3-02` 42%→35%, `w7-02` 70%→65% (its tiles go 44→48px). All are already pinned at the
  `MAX_FIT_CSS_TILE_PX = 96` ceiling or a width-bound rung, so the taller box cannot be spent.
  Nothing gets smaller; the background around them gets slightly larger.
- **The editor now carries the surplus at ≥2560.** 1576px of Monaco for a 40-line program is a
  lot of nothing. It is a better place for the surplus than the canvas background, but a
  max-width on the code column is the obvious next move and belongs to the UI-audit pass.
- **The objective rail scrolls at 2560 where it did not before** (it needs ~412px, it gets 337).
  It already scrolled at 1440×900 and at 1600×836 on main, and it is `overflow-y: auto` by
  design. Sizing the cap to fit it (410px) costs `w4-05` a whole ladder rung — 24px back down to
  20px — which is the wrong trade.
- **The ladder makes outcomes step, not slide.** `deviceTilePx` snaps to `ZOOM_LADDER`, so a
  window 20px shorter can drop a rung. The numbers above are exact for the sizes given.

## 8. Merged with main mid-flight

Main moved twice while this was in progress: the prose pass plus the Library unlock, then the
character-count removal. Both merged cleanly — the layout work is a new file plus a few lines of
`Workspace.tsx` and one CSS selector. Everything in §5–§7 was re-measured after the first merge
and re-checked after the second; grid dimensions were unchanged by both. The shorter briefs, the
new **Site data** facts table and the **shift ends at** rail row are what set the 340px cap and
made the 268px rail worth fixing.

## 9. Checks

`npx tsc --noEmit` clean. `npx vitest run` **1378 passing** (1369 on main after the
character-count removal, + 9 new). `npm run build` clean. Nothing outside the owned paths was
touched, and nothing was needed there — no proposed diffs for the orchestrator.

Merged main twice mid-flight (prose + Library, then the character-count removal). Both merged
without conflicts. Nothing here reads `par`, and nothing here displays or derives a character
count.
