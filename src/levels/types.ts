import type { CostOverrides, Objective, Sim, World } from '../engine/index.ts';

/**
 * One mechanical fact the player needs and the brief should not be carrying.
 *
 * Numbers, units, reaches, dimensions, formats — anything a player has to look up again halfway
 * through writing a program. Prose is read once; a row stays on screen.
 */
export interface LevelFact {
  label: string;
  /** Inline markdown. Short enough to sit on one line next to its label. */
  value: string;
}

/** DESIGN.md §5. */
export interface LevelDef {
  /** 'w1-03'. Stable forever — it is the save key and the hardware-unlock key. */
  id: string;
  /** 1..8 */
  world: number;
  /** Order within the world, 1-based. */
  index: number;
  title: string;
  /** Markdown. Two or three lines of flavour, then the ask. Jokes live here, numbers do not. */
  brief: string;
  /** The numbers and formats the brief used to spell out. Rendered as a table, not as prose. */
  facts?: LevelFact[];
  /** API names unlocked BY this level. Cumulative across the campaign. */
  hardware: string[];
  /** Must be pure and deterministic given `seed`. */
  build(seed: number): World;
  /** Evaluated against the final world + trace. All must be met to pass. */
  objectives: Objective[];
  /** ALL must pass. `length > 1` demands a general solution. `>= 3` from World 2 on. */
  seeds: number[];
  par: { ticks: number };
  /**
   * Whether this work order carries a medal at all. Defaults to `true`. DESIGN.md §7.
   *
   * `false` where no correct program can cost fewer ticks than another correct program: par is
   * then not a budget, it is the price of the only solution the level admits, and a ladder built
   * on it grades noise. An ungraded level still closes, still runs its objectives and bonuses
   * unchanged, and is still worth a gold's three points — `par` stays exactly where it is, and
   * `graded` changes only how the result is presented and counted.
   */
  graded?: boolean;
  /** Pre-filled editor content. */
  starter: string;
  /** Progressive nudges. Never code, never a full solution. */
  hints: string[];
  /** Extra doc page ids to surface in the reference panel. */
  docs?: string[];
  /** Optional challenges worth an extra star. */
  bonus?: Objective[];
  /** Per-level overrides of the `src/engine/costs.ts` defaults. DESIGN.md §4.4. */
  costs?: CostOverrides;
  /** Per-level budget. Defaults come from `Sim`. */
  budget?: { maxTicks?: number; maxOps?: number };
}

/**
 * A reference solution. Test fixture only — never bundled, never shown in the UI (DESIGN.md §5).
 *
 * `run` drives a `Sim` directly so engine tests can prove solvability without the runtime worker.
 * `source` is the same solution written as player-facing TypeScript; once the runtime exists it is
 * transpiled and executed to prove the two agree.
 */
export interface ReferenceSolution {
  levelId: string;
  run(sim: Sim, botId: number): void;
  source: string;
}

export interface WorldMeta {
  id: number;
  name: string;
  subtitle: string;
  blurb: string;
  /** CSS colour, used for the world's chrome. Drawn from the DESIGN.md §8 palette family. */
  accent: string;
}
