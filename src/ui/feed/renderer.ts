import type { Vec, World } from '../../engine/index.ts';
import type { InspectTarget } from '../../game/debug-values.ts';
import type { ArtId, CameraInset, TileReadout } from '../../render/index.ts';
import type { BoardView } from '../adapters.ts';

export interface FeedRenderer {
  setPreview?(world: World | null): void;
  onHover?(listener: (readout: TileReadout | null) => void): () => void;
  readoutAt?(cssX: number, cssY: number): TileReadout | null;
  setHover?(cell: Vec | null): void;
  setInspected?(cell: Vec | null, botId?: number | null): void;
  fit?(): void;
  setViewInset?(inset: CameraInset): void;
  zoomBy?(steps: number): void;
  deviceTilePx?(): number;
  setFollow?(botId: number | null): void;
  readView?(out: BoardView): BoardView;
  setArt?(id: ArtId): void;
}

const CLICK_TRAVEL_PX = 4;

export function readoutLine(readout: TileReadout | null, inspectable = false): string {
  const label = readout?.label ?? '';
  return inspectable && label !== '' ? `${label} · click to inspect` : label;
}

export function isClick(down: Vec, up: Vec): boolean {
  return Math.hypot(up.x - down.x, up.y - down.y) < CLICK_TRAVEL_PX;
}

export function inspectTargetAt(readout: TileReadout | null): InspectTarget | null {
  if (!readout) return null;
  if (readout.botId !== null) return { kind: 'bot', id: readout.botId };
  if (readout.machine) return { kind: 'machine', id: readout.machine.id };
  return { kind: 'tile', at: { x: readout.at.x, y: readout.at.y } };
}
