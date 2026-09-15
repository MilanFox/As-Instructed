import type { Vec, World } from '../../engine/index.ts';
import type { ArtId, TileReadout } from '../../render/index.ts';
import type { BoardView } from '../adapters.ts';

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

export function readoutLine(readout: TileReadout | null): string {
  return readout?.label ?? '';
}
