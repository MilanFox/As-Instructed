import { useEffect, useRef } from 'react';
import { currentLevel, useGame } from '../../game/store.ts';

/**
 * Hosts the renderer's canvas. The UI owns the clock and the renderer owns the pixels, so this
 * component does nothing but mount, size and re-seek.
 */
export function ViewportPanel(): React.JSX.Element {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const renderer = useGame((state) => state.renderer);
  const trace = useGame((state) => state.trace);
  const tick = useGame((state) => state.tick);
  const runState = useGame((state) => state.runState);
  const level = useGame(currentLevel);

  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    void Promise.resolve(renderer().mount(canvas)).catch(() => {
      // A renderer that cannot start must not take the shell down with it.
    });
  }, [renderer]);

  useEffect(() => {
    if (level) renderer().setWorld(level.world);
  }, [renderer, level]);

  const seed = level?.seeds[0];

  return (
    <div className="viewport scanlines">
      <canvas ref={canvasRef} className="viewport__canvas" aria-label="Site view" role="img" />
      {trace ? (
        <div className="viewport__badge">
          <span>seed {seed ?? '—'}</span>
          <span aria-hidden="true">·</span>
          <span>tick {Math.floor(tick)}</span>
        </div>
      ) : (
        <div className="viewport__empty">
          <span className="viewport__empty-title">
            {runState === 'running' ? 'awaiting telemetry' : 'no trace on file'}
          </span>
          <span className="viewport__empty-note">
            Run the program. The site replays from the trace, so you can scrub it afterwards.
          </span>
        </div>
      )}
    </div>
  );
}
