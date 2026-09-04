/**
 * Tick cost of every action. DESIGN.md §4.4.
 *
 * Sensing is free. Acting costs ticks. Levels may override any entry via
 * `LevelDef`-supplied `costOverrides`, which is how a world can make (say) mining expensive.
 */
export interface CostTable {
  move: number;
  /** Charged when a move fails: out of bounds, wall, or another bot in the way. */
  moveBlocked: number;
  turn: number;
  harvest: number;
  mine: number;
  plant: number;
  pickup: number;
  drop: number;
  use: number;
  /** Multiplier: `wait(n)` costs `n * wait`. */
  wait: number;
  send: number;
  spawn: number;
  mark: number;
  link: number;
  power: number;
  transmit: number;
  refuel: number;
}

export const DEFAULT_COSTS: Readonly<CostTable> = Object.freeze({
  move: 1,
  moveBlocked: 1,
  turn: 0,
  harvest: 2,
  mine: 2,
  plant: 2,
  pickup: 1,
  drop: 1,
  use: 2,
  wait: 1,
  send: 1,
  spawn: 5,
  mark: 1,
  link: 2,
  power: 2,
  transmit: 1,
  refuel: 2,
});

export type CostOverrides = Partial<CostTable>;

export function resolveCosts(overrides?: CostOverrides): CostTable {
  if (!overrides) return { ...DEFAULT_COSTS };
  return { ...DEFAULT_COSTS, ...overrides };
}
