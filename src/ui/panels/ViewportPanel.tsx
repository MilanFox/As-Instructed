import { useEffect, useMemo, useRef } from 'react';
import { currentLevel, useGame } from '../../game/store.ts';
import { activeTrack, highlightsAt, playbackFor } from '../../game/playback.ts';

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
  const celebrations = useGame((state) => state.save.settings.celebrations);
  const level = useGame(currentLevel);

  const playback = useMemo(() => playbackFor(level, trace), [level, trace]);
  const flooredTick = Math.floor(tick);
  const active = activeTrack(playback, flooredTick);
  const highlights = useMemo(
    () => highlightsAt(playback, flooredTick),
    [playback, flooredTick],
  );

  /*
   * The brackets follow the objective in progress, and move on as it closes.
   *
   * `setHighlights` is where the renderer's camera lean and its final flourish get their meaning:
   * without it they are pointed at the middle of the map. The signature keeps this to one call
   * per actual change rather than one per frame — the playhead ticks at 60Hz and the objective it
   * is working on does not.
   */
  const signature = `${active?.id ?? 'done'}:${highlights.met ? 'met' : 'open'}:${highlights.cells
    .map((cell) => `${cell.x},${cell.y}`)
    .join(' ')}`;
  useEffect(() => {
    renderer().setHighlights(highlights.cells, highlights.met);
    // The signature is the dependency on purpose: `highlights` is a fresh object every frame.
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [renderer, signature]);

  useEffect(() => {
    renderer().setCelebrationsEnabled(celebrations);
  }, [renderer, celebrations]);

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
        <>
          <div className="viewport__badge">
            <span>seed {seed ?? '—'}</span>
            <span aria-hidden="true">·</span>
            <span>tick {flooredTick}</span>
          </div>
          {/* The one line that tells you what you are looking at, under the bot that is doing it. */}
          <div className={active ? 'viewport__now' : 'viewport__now viewport__now--done'}>
            <span className="viewport__now-tag">{active ? 'working on' : 'closed'}</span>
            <span className="viewport__now-label">
              {active?.label ?? playback?.required[playback.required.length - 1]?.label ?? '—'}
            </span>
          </div>
        </>
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
