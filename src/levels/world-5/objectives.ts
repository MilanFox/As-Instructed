import type { Divergence, Machine, ObjectiveContext, Vec } from '../../engine/index.ts';

export function at(pos: Vec): string {
  return `(${String(pos.x)}, ${String(pos.y)})`;
}

export function firstNotIn(machines: readonly Machine[], state: string): Divergence | undefined {
  const stray = machines.find((machine) => machine.state !== state);
  if (stray === undefined) return undefined;
  return { where: `${stray.id} · ${at(stray.at)}`, expected: state, received: stray.state };
}

export interface CableLeg {
  from: string;
  to: string;
  amount: number;
  t: number;
}

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
