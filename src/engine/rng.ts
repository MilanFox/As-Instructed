/**
 * Seeded PRNG (mulberry32). Deterministic, serializable, cheap.
 *
 * Determinism is load-bearing: `LevelDef.build(seed)` must produce byte-identical worlds across
 * machines and across replays. The Sim itself never touches the Rng — see docs/ENGINE.md.
 */
export interface RngState {
  state: number;
}

export class Rng {
  state: number;

  constructor(seed: number) {
    // Force to uint32 so callers can pass any integer (including negatives) safely.
    this.state = seed >>> 0;
  }

  /**
   * Accepts either a live Rng or a bare `{ state }` — which is what a World becomes after crossing
   * `postMessage`, since structuredClone strips prototypes. Cheap and idempotent.
   */
  static of(value: Rng | RngState): Rng {
    return value instanceof Rng ? value : Rng.fromState(value);
  }

  static fromState(snapshot: RngState): Rng {
    const rng = new Rng(0);
    rng.state = snapshot.state >>> 0;
    return rng;
  }

  snapshot(): RngState {
    return { state: this.state };
  }

  clone(): Rng {
    return Rng.fromState(this.snapshot());
  }

  /** Uniform float in [0, 1). */
  next(): number {
    this.state = (this.state + 0x6d2b79f5) >>> 0;
    let t = this.state;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  }

  /** Uniform integer in [min, max], both inclusive. Returns `min` when `max < min`. */
  int(min: number, max: number): number {
    if (max < min) return min;
    return min + Math.floor(this.next() * (max - min + 1));
  }

  /** True with the given probability (0..1). */
  chance(p: number): boolean {
    return this.next() < p;
  }

  /** Uniform choice. Throws on an empty array rather than returning undefined. */
  pick<T>(items: readonly T[]): T {
    if (items.length === 0) throw new Error('Rng.pick called with an empty array');
    const chosen = items[this.int(0, items.length - 1)];
    return chosen as T;
  }

  /** Fisher-Yates. Returns a new array; the input is left untouched. */
  shuffle<T>(items: readonly T[]): T[] {
    const out = items.slice();
    for (let i = out.length - 1; i > 0; i--) {
      const j = this.int(0, i);
      const a = out[i] as T;
      const b = out[j] as T;
      out[i] = b;
      out[j] = a;
    }
    return out;
  }
}
