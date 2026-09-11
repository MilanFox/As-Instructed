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
import {
  FEED_INSET,
  LEGIBLE_DEVICE_TILE_PX,
  READOUT_CHARS_IN_THE_GAP,
  RULER_LABEL_MIN_TILE_PX,
} from './geometry.ts';
import type { FeedRenderer } from './feed.ts';
import { readoutLine } from './feed.ts';

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

  const world = useMemo<World | null>(
    () => trace?.initialWorld ?? (level ? level.build(level.seeds[0] as number) : null),
    [level, trace],
  );

  const playback = useMemo(() => playbackFor(level, trace), [level, trace]);
  const flooredTick = Math.floor(tick);
  const active = activeTrack(playback, flooredTick);
  const highlights = useMemo(() => highlightsAt(playback, flooredTick), [playback, flooredTick]);

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

  const signature = `${marking ? 'diverged' : (active?.id ?? 'done')}:${met ? 'met' : 'open'}:${cells
    .map((cell) => `${String(cell.x)},${String(cell.y)}`)
    .join(' ')}`;
  useEffect(() => {
    renderer().setHighlights(cells, met);
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

  useEffect(() => {
    return (renderer() as FeedRenderer).onHover?.(setReadout);
  }, [renderer]);

  useEffect(() => {
    const at = pointer.current;
    if (!at) return;
    setReadout((renderer() as FeedRenderer).readoutAt?.(at.x, at.y) ?? null);
  }, [renderer, flooredTick]);

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

  const onWheel = useCallback((): void => {
    held.current = true;
  }, []);

  const site = level ? (worldMeta(level.world)?.name ?? 'SITE').toUpperCase() : 'NO SITE';
  const grid = world ? `${String(world.w)}×${String(world.h)}` : '—';

  const line = readoutLine(readout);
  const wide = line.length > READOUT_CHARS_IN_THE_GAP;

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
          <div className={wide ? 'feed-osd feed-osd--long' : 'feed-osd'}>
            <span className="osd-id">
              {site} · GRID {grid}
            </span>
            <span className="osd-xy">{line}</span>
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
