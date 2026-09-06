/**
 * The half of the renderer that is not on `RendererPort`, narrowed structurally.
 *
 * `ViewportPanel` established this shape for `setPreview`, and the same reasoning applies here: the
 * port is shared with `FakeRenderer`, which exists so the store can be tested without a canvas and
 * would only ever no-op every method below. Narrowing at the call site keeps purely visual
 * concerns out of the contract the game logic is written against, and keeps the headless path
 * from growing methods that mean nothing to it.
 *
 * `src/ui/adapters.ts` is the implementation; `src/game/ports.ts` is deliberately unchanged.
 */
import type { Vec, World } from '../../../engine/index.ts';
import type { ArtId, TileReadout } from '../../../render/index.ts';
import type { BoardView } from '../../adapters.ts';

export interface FeedRenderer {
  setPreview?(world: World | null): void;
  onHover?(listener: (readout: TileReadout | null) => void): () => void;
  readoutAt?(cssX: number, cssY: number): TileReadout | null;
  setHover?(cell: Vec | null): void;
  fit?(): void;
  zoomBy?(steps: number): void;
  deviceTilePx?(): number;
  setFollow?(botId: number | null): void;
  readView?(out: BoardView): BoardView;
  setArt?(id: ArtId): void;
}

/**
 * The coordinate, and the one other fact about the tile that is worth the width.
 *
 * `docs/AUDIT-UI.md` F6 asks for the ability to *name* a tile, so the numbers lead. Crop maturity
 * follows where there is a crop, because `docs/DESK-CONCEPT.md` §7 makes ripeness a shape at small
 * tile sizes and a shape is exactly the thing a player wants a second opinion on.
 */
export function readoutLine(readout: TileReadout | null): string {
  if (!readout) return '';
  const at = `${String(readout.at.x)}, ${String(readout.at.y)}`;
  if (readout.growth !== null && readout.maxGrowth !== null) {
    return `${at} · ${readout.terrain} · ${String(readout.growth)}/${String(readout.maxGrowth)}`;
  }
  if (readout.botName) return `${at} · ${readout.botName}`;
  return `${at} · ${readout.terrain}`;
}
