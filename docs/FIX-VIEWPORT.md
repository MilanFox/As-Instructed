# FIX — viewport aspect

Working log. Appended to on disk after each unit of work.

Branch: `worktree-agent-a3284c840b87fe85c`. Dev server for measurement: `http://localhost:5183`.

---

## 1. Diagnosis — what sets 891×393

Nothing hard-codes a canvas size. The number is the product of two independent fractions
applied on two different axes, and it is the *combination* that produces the letterbox.

**Width.** `src/ui/Workspace.tsx` sets the editor column to `layout.editorFraction * 100%`
and `.workspace__right` is `flex: 1`, so the right column gets the remainder minus the 5px
splitter. `DEFAULT_LAYOUT.editorFraction = 0.44` (`src/game/save.ts:92`), so at a 1600px
window the right column is `0.56 × 1600 − 5 = 891`. Exact match.

**Height.** The right column is a flex column: `.viewport` (`flex: 1`), `TimelineBar`
(`flex: none`), a 5px splitter, then `.workspace__lower` with an inline
`height: (1 − viewportFraction) * 100%`. `DEFAULT_LAYOUT.viewportFraction = 0.58`. At a
836px-tall window the workspace column is ~766px, so the viewport gets
`0.58 × 766 − timeline(~46) − 5 ≈ 393`.

So: **891 = editorFraction, 393 = viewportFraction.** Neither the canvas element nor the CSS
nor `src/render/camera.ts` imposes an aspect. `.viewport__canvas` is `width:100%; height:100%`
and the renderer sizes the backing store to the element's client box, so the canvas faithfully
reproduces whatever box the two fractions leave it. The camera then does an honest
letterbox fit (`Camera.fit()` takes `min(rawX, rawY)`), which is correct behaviour for the box
it is given.

### The important consequence

`tilePx = min(viewW/cols, viewH/rows)`. Because the box is 2.27:1 and every grid is at most
1.4:1 in practice, the viewport is **always height-bound**. Widening the viewport therefore
buys *zero* extra tile size — it only adds more empty background. **The only lever on tile
size is viewport height.** This kills the "narrow the right column and give the editor the
leftover" idea as a fix for legibility: it makes the box prettier and the tiles no bigger.

## 2. Diagnosis — the grids are not square

The OPEN-ITEMS entry assumes square grids. Measured by building every level at its first seed
(temporary vitest probe, since removed):

| aspect (w/h) | levels |
| --- | --- |
| 1.00 | w2-02 7×7, w4-01 23×23, w4-02 20×20, w4-04 30×30, w4-05 40×40, w6-03 20×20, w6-05 30×30, w8-04 30×30 |
| 1.20–1.40 | w1-05 10×8, w2-04 5×4, w5-03 24×18, w5-04 26×20, w5-05 30×24, w7-04 28×20, w7-05 36×28, w8-01 14×10, w8-02 34×26, w8-03 32×24, w8-05 48×40, w3-02 16×12 |
| 1.50–2.00 | w1-01 25×14, w2-05 14×8, w3-04 18×10, w6-01 10×6, w6-02 12×6, w6-04 12×6, w7-02 24×16 |
| 2.40–2.80 | w3-01 14×5, w7-01 12×5, w7-03 22×9 |
| ≥ 4.00 | w2-01 12×3, w5-01 22×5, w5-02 43×7, w1-03 30×3 |

8 of 34 are exactly square; 26 are wider than tall; median aspect ≈ 1.40. **But the levels
that actually stress the viewport are the big ones, and the big ones are square-ish:**
w4-05 40×40, w8-05 48×40, w4-04/w6-05/w8-04 30×30, w7-05 36×28, w8-02 34×26. The four
extreme-wide levels (≥ 4:1) are all small in the binding dimension (h ≤ 7) and are legible at
any layout. So the fix must serve ~1.0–1.4 without destroying ≥ 4:1, and it is judged on
w4-05 and w8-05.

## 3. Playtest evidence

Neither `docs/PLAYTEST-BEGINNER.md` nor `docs/PLAYTEST-VETERAN.md` mentions the viewport,
the canvas, panel sizes, scrolling or tile legibility at all. Recorded so the fix is not
oversold: this is a design/aesthetics defect found by measurement, not a reported pain point.
