/**
 * What the feed's chrome takes, and what is therefore left for the grid.
 *
 * `docs/DESK-CONCEPT.md` §9 item 1 is the hard part of this concept: the prototype draws its
 * graticule *inside* the canvas, in a margin it leaves itself. The real renderer has a camera that
 * fits the whole canvas, so a margin that is not reserved by the element is a margin the camera
 * fills with tiles and the numerals then sit on top of — which re-opens the exact defect
 * `docs/FIX-HUD-OVERLAP.md` closed and the user reported personally.
 *
 * So the margin is reserved by insetting the canvas element, and every piece of the feed's chrome
 * lives in the strip that inset created. Nothing is positioned over the canvas at all. These are
 * the numbers both halves read: `Monitor.tsx` publishes them as custom properties and
 * `src/ui/styles/desk/monitor.css` sizes the canvas and the strips from them, which is what makes
 * `src/ui/__tests__/monitor-margin.test.ts` able to prove they cannot disagree.
 *
 * Design units, like everything else on the desk — multiplied by `--u`. Never by `--ts`: a type
 * scale that moved these would shrink the board, and the board's answer to "make it bigger" is its
 * own zoom ladder, on the transport.
 */

/**
 * The reserved strip on each side of the canvas.
 *
 * - `n` — the header strip (site and signal delay, and the hover readout between them) over the
 *   column ruler.
 * - `w` — the row ruler.
 * - `s` — the `LAST KNOWN STATE` stamp, the playhead timecode, and where a failed run's
 *   divergence is named.
 * - `e` — breathing room, so the last column's tick mark is not against the bezel.
 */
export const FEED_INSET = { n: 33, e: 10, s: 30, w: 24 } as const;

/** Ruler numerals every fifth cell, matching `drawGrid`'s own major rhythm. */
export const RULER_MAJOR = 5;

/**
 * Below this many CSS pixels per tile the numerals are dropped and only the ticks are drawn.
 *
 * A numeral every fifth cell needs about two characters' worth of room between its neighbours or
 * the row reads as a smear. The ticks stay, because a tick you can count is still a coordinate
 * system; the prototype uses the same rule at the same threshold.
 */
export const RULER_LABEL_MIN_TILE_PX = 7;

/**
 * The smallest tile, in device pixels, a work order is allowed to *open* at.
 *
 * `docs/DESK-CONCEPT.md` §7 sets this floor, and the desk's 656 x 438 picture cannot fit eight of
 * the campaign's thirty-three grids above it — five of them could not on a full-bleed screen
 * either, so it is a property of the approved composition and not of the graticule.
 *
 * The answer is not to open small. A first-time player handed an illegible board does not know the
 * board could be bigger; they conclude the game is like that. So the feed opens at the largest rung
 * that clears this floor even when that crops the grid, and `FIT` on the transport is the way back
 * to the whole board. `docs/AUDIT-UI.md` §7: readability is the ruling that outranks the desk
 * brief, and it outranks completeness with it.
 */
export const LEGIBLE_DEVICE_TILE_PX = 24;
