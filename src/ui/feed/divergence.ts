import type { Vec, World } from '../../engine/index.ts';

const COORDINATE = /\((\d{1,3}),\s*(\d{1,3})\)/g;

export interface ReportCause {
  where: string;
  want: string;
  got: string;
}

export function divergenceCells(cause: ReportCause | null, world: World | null): Vec[] {
  if (!cause || !world) return [];
  const cells: Vec[] = [];
  const seen = new Set<string>();
  const scan = (text: string): void => {
    COORDINATE.lastIndex = 0;
    let match = COORDINATE.exec(text);
    while (match && cells.length < 2) {
      const x = Number(match[1]);
      const y = Number(match[2]);
      const key = `${String(x)},${String(y)}`;
      if (x < world.w && y < world.h && !seen.has(key)) {
        seen.add(key);
        cells.push({ x, y });
      }
      match = COORDINATE.exec(text);
    }
  };
  scan(cause.want);
  scan(cause.got);
  if (cells.length === 0) scan(cause.where);
  return cells;
}

export function divergenceLine(cause: ReportCause | null, cells: readonly Vec[]): string {
  if (!cause || cells.length === 0) return '';
  const at = (cell: Vec): string => `(${String(cell.x)}, ${String(cell.y)})`;
  if (cells.length === 1) return `HERE ${at(cells[0] as Vec)}`;
  return `WANT ${at(cells[0] as Vec)} · GOT ${at(cells[1] as Vec)}`;
}
