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
      <span className="feed-origin" aria-hidden="true" />
    </>
  );
}
