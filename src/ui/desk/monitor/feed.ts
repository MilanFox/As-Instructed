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
 * Everything `describeTile` found, in the voice it already wrote.
 *
 * This used to be the coordinate plus the one other fact judged worth the width — the strip is
 * narrow, and naming a tile mattered more than listing it. DESIGN §11.7 reverses that tradeoff:
 * the renderer is player-facing text exactly as the brief is, and under the old rule a sink
 * holding twelve crates, or the tile stencilled `charter registry` that is the only thing telling
 * two identical sinks apart, both reported themselves as the word `floor`. Nine of the twelve
 * fields never reached a player at all.
 *
 * `describeTile` composes the full line already, so the honest formatter here is no formatter.
 * The width is the strip's problem and the strip now solves it: `.osd-id` and `.osd-lag` in
 * `monitor.css` are chrome and give their room up first, so the readout keeps its head.
 */
export function readoutLine(readout: TileReadout | null): string {
  return readout?.label ?? '';
}
