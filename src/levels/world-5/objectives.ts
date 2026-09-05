import type { Divergence, Machine, ObjectiveContext, Vec } from '../../engine/index.ts';

/**
 * Wording shared by World 5's divergences.
 *
 * Every level in the district addresses machines by id and every id is free to `probe`, so a
 * failure here names an id and — where the player has to go and look at it — the tile it sits on.
 * Nothing these helpers print is anything a `probe` would not have said for nothing.
 */

/** A coordinate, written the way the facts tables write one. */
export function at(pos: Vec): string {
  return `(${String(pos.x)}, ${String(pos.y)})`;
}

/** The first machine the run did not leave in `state`, named and placed. */
export function firstNotIn(machines: readonly Machine[], state: string): Divergence | undefined {
  const stray = machines.find((machine) => machine.state !== state);
  if (stray === undefined) return undefined;
  return { where: `${stray.id} · ${at(stray.at)}`, expected: state, received: stray.state };
}

/** One cable, as the run laid it. `from` and `to` are empty when the trace cannot name the ends. */
export interface CableLeg {
  from: string;
  to: string;
  amount: number;
  t: number;
}

/**
 * Every cable the run laid, in order, with what it drew off the drum.
 *
 * `link` writes the connection onto the source machine and spends separately, so the pair of ends
 * and the price arrive as two events; this walks them back together. A cable laid twice writes no
 * new key the second time, so its ends come back empty rather than wrong.
 */
export function cableLegs(ctx: ObjectiveContext): CableLeg[] {
  const legs: CableLeg[] = [];
  let pending: { from: string; to: string } | undefined;
  for (const event of ctx.trace.events) {
    if (event.kind === 'machineChange') {
      for (const key of Object.keys(event.after.vars)) {
        if (!key.startsWith('link:') || event.after.vars[key] !== 1) continue;
        if (event.before.vars[key] === 1) continue;
        pending = { from: event.id, to: key.slice('link:'.length) };
      }
      continue;
    }
    if (event.kind !== 'spend' || event.resource !== 'cable') continue;
    legs.push({
      from: pending?.from ?? '',
      to: pending?.to ?? '',
      amount: event.amount,
      t: event.t,
    });
    pending = undefined;
  }
  return legs;
}
