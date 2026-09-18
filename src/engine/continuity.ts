import { FED_BY } from './types.ts';
import type { Machine, World } from './types.ts';

export const LIVE = 'live';

export const BROKEN = 'broken';

function feeders(machine: Machine): string[] {
  const found: string[] = [];
  for (const [name, value] of Object.entries(machine.vars)) {
    if (value === 1 && name.startsWith(FED_BY)) found.push(name.slice(FED_BY.length));
  }
  return found;
}

export function continuityReadings(world: World): Map<string, number> {
  const readings = new Map<string, number>();
  const carriers = world.machines.filter((machine) => LIVE in machine.vars);
  if (carriers.length === 0) return readings;

  const byId = new Map<string, Machine>();
  for (const machine of world.machines) byId.set(machine.id, machine);

  const settling = new Set<string>();
  const reading = (machine: Machine): number => {
    const known = readings.get(machine.id);
    if (known !== undefined) return known;
    if (settling.has(machine.id)) return 0;
    settling.add(machine.id);
    let carries = machine.state === BROKEN ? 0 : 1;
    if (carries === 1) {
      for (const id of feeders(machine)) {
        const feeder = byId.get(id);
        if (!feeder || !(LIVE in feeder.vars)) continue;
        if (reading(feeder) === 0) {
          carries = 0;
          break;
        }
      }
    }
    settling.delete(machine.id);
    readings.set(machine.id, carries);
    return carries;
  };

  for (const machine of carriers) reading(machine);
  return readings;
}

export function settleContinuity(world: World): void {
  const readings = continuityReadings(world);
  for (const machine of world.machines) {
    const carries = readings.get(machine.id);
    if (carries !== undefined) machine.vars[LIVE] = carries;
  }
}
