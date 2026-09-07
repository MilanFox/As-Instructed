/**
 * The axis ruler, in the strip the canvas gave up — never on a tile.
 *
 * The game hands the player `want (23, 12)` and `19 East, 5 South, 22 West`
 * and no way to name the cell they are looking at. `survey` drew a margin ruler; the direction
 * that ships did not. This is that ruler, rebuilt as DOM outside the canvas so that the margin
 * the camera fit must reserve — otherwise the numerals eat tiles at `w8-05` — is answered by
 * construction rather than by hoping the camera leaves room.
 *
 * It is built this way rather than drawn for a draw-cost reason. A ruler painted per
 * cell per frame is precisely the shape the cost rule is looking for: its per-tile count falls as
 * the tile shrinks and its total does not, because the cell count rises exactly as fast. So the
 * marks are elements, created once per grid size, and a camera move writes **three numbers** — the
 * origin and the tile size — onto the container. Every mark's position is a `calc()` off those.
 * The per-frame cost is O(1) in the size of the grid, and it is paid in style writes rather than
 * in draw calls.
 */
import { RULER_MAJOR } from './geometry.ts';

interface RulerProps {
  cols: number;
  rows: number;
}

function marks(count: number): number[] {
  const all: number[] = [];
  for (let i = 0; i <= count; i++) all.push(i);
  return all;
}

export function Graticule({ cols, rows }: RulerProps): React.ReactElement {
  return (
    <>
      <div className="feed-rule feed-rule--x" aria-hidden="true">
        {marks(cols).map((index) => (
          <span
            key={index}
            className={index % RULER_MAJOR === 0 ? 'feed-tick-mark is-major' : 'feed-tick-mark'}
            style={{ ['--i' as string]: index }}
          >
            {index % RULER_MAJOR === 0 && index < cols ? <b>{index}</b> : null}
          </span>
        ))}
      </div>
      <div className="feed-rule feed-rule--y" aria-hidden="true">
        {marks(rows).map((index) => (
          <span
            key={index}
            className={index % RULER_MAJOR === 0 ? 'feed-tick-mark is-major' : 'feed-tick-mark'}
            style={{ ['--i' as string]: index }}
          >
            {index % RULER_MAJOR === 0 && index < rows ? <b>{index}</b> : null}
          </span>
        ))}
      </div>
      {/* The origin corner, north-west, which is also where the lamp is. */}
      <span className="feed-origin" aria-hidden="true" />
    </>
  );
}
