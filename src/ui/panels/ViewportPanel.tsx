import { useEffect, useMemo, useRef } from 'react';
import type { World } from '../../engine/index.ts';
import { currentLevel, useGame } from '../../game/store.ts';
import { activeTrack, highlightsAt, playbackFor } from '../../game/playback.ts';

/**
 * `setPreview` is on the renderer and deliberately not on `RendererPort`.
 *
 * The port is shared with `FakeRenderer`, which exists so the store can be tested without a
 * canvas and would only ever no-op a preview. Narrowing structurally at the one call site that
 * wants it keeps a purely visual concern out of the contract the game logic is written against.
 */
type PreviewRenderer = { setPreview?(world: World | null): void };

/**
 * Hosts the renderer's canvas. The UI owns the clock and the renderer owns the pixels, so this
 * component does nothing but mount, size and re-seek.
 *
 * It is the whole workspace now, not a panel in it — everything else floats over the top — so
 * anything drawn here in DOM is an annotation in a margin and never a block in the middle.
 */
export function ViewportPanel({ world }: { world: World | null }): React.JSX.Element {
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
  const highlights = useMemo(() => highlightsAt(playback, flooredTick), [playback, flooredTick]);

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

  /*
   * The board before the first run.
   *
   * `setPreview` guards on the world's identity and re-fits the camera when it changes, so the
   * object has to be the same one between renders — `Workspace` memoises it and hands it down.
   */
  useEffect(() => {
    (renderer() as PreviewRenderer).setPreview?.(world);
  }, [renderer, world]);

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
        /*
         * A note in the corner the seed badge will take over, not a block in the middle of the
         * board: there is a board there now — terrain, goal brackets, bots at rest — and the
         * centre of it is the last place to put a paragraph saying nothing has run yet.
         */
        <div className="viewport__empty">
          <span className="viewport__empty-title">
            {runState === 'running' ? 'awaiting telemetry' : 'no trace on file'}
          </span>
          <span className="viewport__empty-note">
            {runState === 'running' ? 'the sim has it' : 'run to record one'}
          </span>
        </div>
      )}
    </div>
  );
}
