/**
 * The site feed — a K&D asset from 2207, and the company's window onto the planet.
 *
 * It is its own physical screen, not a panel inside the terminal: pale grey-beige, thick housing,
 * transport keys screwed to the case, an inventory tag somebody stuck on and nobody removed. The
 * joke is meant to be visible in the object — the firm bought you a good machine to write on and a
 * twenty-year-old monitor to look at the planet through.
 *
 * Two rules shape everything below, and both of them are older than the desk:
 *
 * 1. **Nothing is drawn over the board.** The canvas is inset by `FEED_INSET` and every readout on
 *    this screen lives in the strip that inset created; the rest of the furniture is deliberately
 *    left unreserved. There is no chrome over the picture, so there is nothing for a guard to have
 *    to protect — see `src/ui/__tests__/monitor-margin.test.ts`.
 * 2. **The board is never non-rectilinear.** DESIGN §8's "no curvature" is a gameplay rule wearing
 *    an aesthetic hat and it applies to the chrome too, so the glass is a flat sheen and the mode
 *    change is a change of light, never of geometry.
 */
import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { World } from '../../../engine/index.ts';
import type { TileReadout } from '../../../render/index.ts';
import { ZOOM_LADDER, ladderIndex } from '../../../render/index.ts';
import { currentLevel, useGame } from '../../../game/store.ts';
import { activeTrack, highlightsAt, playbackFor } from '../../../game/playback.ts';
import { worldMeta } from '../../../levels/index.ts';
import type { BoardView } from '../../adapters.ts';
import { Graticule } from './Graticule.tsx';
import { Transport } from './Transport.tsx';
import { usePapers } from '../paper/papers.ts';
import { divergenceCells, divergenceLine } from './divergence.ts';
import { FEED_INSET, LEGIBLE_DEVICE_TILE_PX, RULER_LABEL_MIN_TILE_PX } from './geometry.ts';
import type { FeedRenderer } from './feed.ts';
import { readoutLine } from './feed.ts';

/** Reused, never rebuilt: the graticule reads it once a frame. */
const VIEW: BoardView = { originX: 0, originY: 0, tilePx: 0, cols: 0, rows: 0 };

export function Monitor(): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const screenRef = useRef<HTMLDivElement | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const renderer = useGame((state) => state.renderer);
  const trace = useGame((state) => state.trace);
  const tick = useGame((state) => state.tick);
  const runState = useGame((state) => state.runState);
  const previewState = useGame((state) => state.previewState);
  const playing = useGame((state) => state.playing);
  const endTick = useGame((state) => state.endTick);
  const docs = usePapers((state) => state.docs);
  const celebrations = useGame((state) => state.save.settings.celebrations);
  const level = useGame(currentLevel);

  const [readout, setReadout] = useState<TileReadout | null>(null);

  /*
   * The board before the first run. Memoised because `setPreview` guards on the world's identity
   * and re-fits the camera when it changes — a world rebuilt per render re-fits every frame and
   * cancels any lean with it.
   */
  const world = useMemo<World | null>(
    () => trace?.initialWorld ?? (level ? level.build(level.seeds[0] as number) : null),
    [level, trace],
  );

  const playback = useMemo(() => playbackFor(level, trace), [level, trace]);
  const flooredTick = Math.floor(tick);
  const active = activeTrack(playback, flooredTick);
  const highlights = useMemo(() => highlightsAt(playback, flooredTick), [playback, flooredTick]);

  /*
   * Where the run went wrong, kept after the report is put down.
   *
   * The certificate is paper and stays on the desk, so the sentence already outlives the ceremony;
   * this is the other half of the requirement — the two coordinates, on the site view, where they
   * are. It replaces the objective brackets only while the playhead is parked at the end of the
   * run, which is where a finished run leaves it: scrub back into the trace and the brackets go
   * back to following the objective, because during the replay the question is what the bot is
   * doing rather than how it ended.
   */
  const cause = useMemo(() => {
    if (!level) return null;
    for (let i = docs.length - 1; i >= 0; i--) {
      const payload = docs[i]?.payload;
      if (payload?.kind !== 'certificate' && payload?.kind !== 'halt') continue;
      if (payload.report.levelId !== level.id) continue;
      return payload.report.cause;
    }
    return null;
  }, [docs, level]);
  const failure = useMemo(() => divergenceCells(cause, world), [cause, world]);
  const marking = failure.length > 0 && !playing && endTick > 0 && flooredTick >= endTick;
  const cells = marking ? failure : highlights.cells;
  const met = marking ? false : highlights.met;

  /*
   * The brackets follow the objective in progress, and move on as it closes. The signature keeps
   * this to one call per actual change rather than one per frame — the playhead ticks at 60Hz and
   * the objective it is working on does not, and `setHighlights` leans the camera.
   */
  const signature = `${marking ? 'diverged' : (active?.id ?? 'done')}:${met ? 'met' : 'open'}:${cells
    .map((cell) => `${String(cell.x)},${String(cell.y)}`)
    .join(' ')}`;
  useEffect(() => {
    renderer().setHighlights(cells, met);
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

  useEffect(() => {
    (renderer() as FeedRenderer).setPreview?.(world);
  }, [renderer, world]);

  /*
   * The board opens at the largest legible rung, not at whatever fits — and the camera is handed
   * back the moment the player asks for it.
   *
   * Eight of the campaign's thirty-three grids cannot fit this picture above
   * `LEGIBLE_DEVICE_TILE_PX`, and five of them could not fit a full-bleed one either. Opening them
   * small is the reachability failure that runs through the whole audit: the capability to enlarge
   * exists, nothing tells the player about it, and a first-time player on `w4-05` concludes the
   * game is like that. So the camera climbs to the floor even when that crops the grid, and `FIT`
   * on the transport is the way back to the whole board — a key on the case, not a shortcut nobody
   * finds.
   *
   * `held` is the whole of the arbitration. The renderer re-fits on mount, on every resize and on
   * every `setTrace`, so the floor cannot be applied once and left; it is re-asserted on the frame
   * loop instead, and stops the instant the player touches the zoom or the wheel. Without that,
   * pressing `−` would be a control the desk immediately undid.
   */
  const held = useRef(false);
  useEffect(() => {
    held.current = false;
  }, [world, trace]);

  const zoom = useCallback(
    (rungs: number): void => {
      const port = renderer() as FeedRenderer;
      held.current = true;
      if (rungs === 0) port.fit?.();
      else port.zoomBy?.(rungs);
      port.setFollow?.(null);
      port.setHover?.(null);
    },
    [renderer],
  );

  /* The tile under the pointer, named in the header strip. */
  useEffect(() => {
    return (renderer() as FeedRenderer).onHover?.(setReadout);
  }, [renderer]);

  /*
   * The readout goes stale when the playhead moves under a still pointer — maturity is read at the
   * current tick — and `onHover` only fires on a change of cell. This is why `readoutAt` exists.
   */
  useEffect(() => {
    const at = pointer.current;
    if (!at) return;
    setReadout((renderer() as FeedRenderer).readoutAt?.(at.x, at.y) ?? null);
  }, [renderer, flooredTick]);

  /*
   * The graticule follows the camera by three custom properties, written only when they change.
   *
   * The renderer's frame loop is the heartbeat, so this adds no second clock. It is O(1) per frame
   * in the size of the grid: every tick mark positions itself off `--gx0`/`--gy0`/`--gt` in CSS.
   */
  useEffect(() => {
    const port = renderer() as FeedRenderer;
    if (!port.readView) return;
    let lastX = NaN;
    let lastY = NaN;
    let lastTile = NaN;
    const floor = ZOOM_LADDER.findIndex((rung) => rung >= LEGIBLE_DEVICE_TILE_PX);
    const sync = (): void => {
      const screen = screenRef.current;
      if (!screen || !port.readView) return;
      if (!held.current) {
        const climb = floor - ladderIndex(port.deviceTilePx?.() ?? LEGIBLE_DEVICE_TILE_PX);
        if (climb > 0) {
          port.zoomBy?.(climb);
          /*
           * A cropped replay the player cannot follow off the edge of the picture would be a worse
           * answer than the small board it replaced, so the camera takes the bot while the grid is
           * bigger than the screen. Everything that fits is left alone.
           */
          port.setFollow?.(trace ? (world?.bots[0]?.id ?? null) : null);
        }
      }
      const view = port.readView(VIEW);
      if (view.originX === lastX && view.originY === lastY && view.tilePx === lastTile) return;
      lastX = view.originX;
      lastY = view.originY;
      lastTile = view.tilePx;
      screen.style.setProperty('--gx0', `${String(view.originX)}px`);
      screen.style.setProperty('--gy0', `${String(view.originY)}px`);
      screen.style.setProperty('--gt', `${String(view.tilePx)}px`);
      screen.style.setProperty('--gnum', view.tilePx >= RULER_LABEL_MIN_TILE_PX ? '1' : '0');
    };
    sync();
    return renderer().onTick(sync);
  }, [renderer, world, trace]);

  const onPointerMove = useCallback((event: React.PointerEvent<HTMLCanvasElement>): void => {
    const rect = event.currentTarget.getBoundingClientRect();
    pointer.current = { x: event.clientX - rect.left, y: event.clientY - rect.top };
  }, []);

  const onPointerLeave = useCallback((): void => {
    pointer.current = null;
  }, []);

  /* The renderer's own wheel handler zooms the camera; this is how the desk hears about it. */
  const onWheel = useCallback((): void => {
    held.current = true;
  }, []);

  const site = level ? (worldMeta(level.world)?.name ?? 'SITE').toUpperCase() : 'NO SITE';
  const grid = world ? `${String(world.w)}×${String(world.h)}` : '—';

  return (
    <section className="display display--feed">
      <div className="bezel bezel--feed">
        <div
          className="screen screen--feed"
          ref={screenRef}
          style={
            {
              '--feed-n': `calc(${String(FEED_INSET.n)} * var(--u))`,
              '--feed-e': `calc(${String(FEED_INSET.e)} * var(--u))`,
              '--feed-s': `calc(${String(FEED_INSET.s)} * var(--u))`,
              '--feed-w': `calc(${String(FEED_INSET.w)} * var(--u))`,
            } as React.CSSProperties
          }
        >
          <div className="feed-osd">
            <span className="osd-id">
              {site} · GRID {grid}
            </span>
            <span className="osd-xy">{readoutLine(readout)}</span>
            <span className="osd-lag">SIGNAL DELAY 41 MIN</span>
          </div>

          <Graticule cols={world?.w ?? 0} rows={world?.h ?? 0} />

          <canvas
            id="board"
            ref={canvasRef}
            aria-label="Site view"
            role="img"
            onPointerMove={onPointerMove}
            onPointerLeave={onPointerLeave}
            onWheel={onWheel}
          />

          {/*
           * The empty state and the playhead timecode both live in the strip below the picture,
           * because anything placed over the board would reopen the overlap collision the guard
           * exists to prevent.
           */}
          {trace ? (
            <span className="feed-tick">{String(flooredTick).padStart(4, '0')}</span>
          ) : (
            <span className="feed-stamp">
              {runState === 'running' || previewState === 'running'
                ? 'AWAITING TELEMETRY'
                : 'LAST KNOWN STATE · NO TRACE ON FILE'}
            </span>
          )}
          {marking ? (
            <span className="feed-stamp feed-stamp--diff">{divergenceLine(cause, failure)}</span>
          ) : null}
        </div>
        <div className="glass glass--feed" />
      </div>

      <Transport onZoom={zoom} />

      <div className="asset-tag">
        <b>K&amp;D</b>
        <span>ASSET 41-2207-B</span>
        <span>SURVEY / DO NOT REMOVE</span>
      </div>
      <div className="stand stand--feed" />
    </section>
  );
}
