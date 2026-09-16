import { useCallback, useEffect, useMemo, useRef, useState } from 'react';

import type { World } from '../../engine/index.ts';
import { activeTrack, highlightsAt, playbackFor } from '../../game/playback.ts';
import { currentLevel, useGame } from '../../game/store.ts';
import type { TileReadout } from '../../render/index.ts';
import { ZOOM_LADDER, ladderIndex } from '../../render/index.ts';
import type { BoardView } from '../adapters.ts';
import { divergenceCells } from '../feed/divergence.ts';
import { LEGIBLE_DEVICE_TILE_PX } from '../feed/geometry.ts';
import type { FeedRenderer } from '../feed/renderer.ts';
import { readoutLine } from '../feed/renderer.ts';
import { usePapers } from '../paper/papers.ts';
import { cameraHeld } from './useFeedZoom.ts';

const VIEW: BoardView = { originX: 0, originY: 0, tilePx: 0, cols: 0, rows: 0 };

export interface FeedCanvasProps {
  onReadout?: (line: string | null) => void;
  onView?: (view: BoardView) => void;
}

export function FeedCanvas({ onReadout, onView }: FeedCanvasProps): React.ReactElement {
  const canvasRef = useRef<HTMLCanvasElement | null>(null);
  const pointer = useRef<{ x: number; y: number } | null>(null);

  const renderer = useGame((state) => state.renderer);
  const trace = useGame((state) => state.trace);
  const tick = useGame((state) => state.tick);
  const playing = useGame((state) => state.playing);
  const endTick = useGame((state) => state.endTick);
  const celebrations = useGame((state) => state.save.settings.celebrations);
  const level = useGame(currentLevel);
  const surveySeed = useGame((state) => state.surveySeed);
  const docs = usePapers((state) => state.docs);

  const [readout, setReadout] = useState<TileReadout | null>(null);

  const readoutRef = useRef(onReadout);
  readoutRef.current = onReadout;
  const viewRef = useRef(onView);
  viewRef.current = onView;

  const world = useMemo<World | null>(
    () =>
      trace?.initialWorld ?? (level ? level.build(surveySeed ?? (level.seeds[0] as number)) : null),
    [level, trace, surveySeed],
  );

  const flooredTick = Math.floor(tick);
  const playback = useMemo(() => playbackFor(level, trace), [level, trace]);
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
    if (!level) return;
    renderer().setWorld(level.world);
    (renderer() as FeedRenderer).fit?.();
  }, [renderer, level]);

  useEffect(() => {
    (renderer() as FeedRenderer).setPreview?.(world);
  }, [renderer, world]);

  useEffect(() => {
    cameraHeld.current = false;
  }, [level?.id]);

  useEffect(() => {
    return (renderer() as FeedRenderer).onHover?.(setReadout);
  }, [renderer]);

  useEffect(() => {
    const at = pointer.current;
    if (!at) return;
    setReadout((renderer() as FeedRenderer).readoutAt?.(at.x, at.y) ?? null);
  }, [renderer, flooredTick]);

  useEffect(() => {
    const line = readoutLine(readout);
    readoutRef.current?.(line === '' ? null : line);
  }, [readout]);

  useEffect(() => {
    const port = renderer() as FeedRenderer;
    if (!port.readView) return;
    let lastX = NaN;
    let lastY = NaN;
    let lastTile = NaN;
    const floor = ZOOM_LADDER.findIndex((rung) => rung >= LEGIBLE_DEVICE_TILE_PX);
    const sync = (): void => {
      if (!port.readView) return;
      if (!cameraHeld.current) {
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
      viewRef.current?.({ ...view });
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
    cameraHeld.current = true;
  }, []);

  return (
    <canvas
      id="board"
      ref={canvasRef}
      aria-label="Site view"
      role="img"
      style={{ display: 'block', width: '100%', height: '100%' }}
      onPointerMove={onPointerMove}
      onPointerLeave={onPointerLeave}
      onWheel={onWheel}
    />
  );
}
