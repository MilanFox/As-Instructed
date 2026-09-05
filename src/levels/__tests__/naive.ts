import type { Dir as DirType, Sim, Vec } from '../../engine/index.ts';
import { Dir, ItemKind, step } from '../../engine/index.ts';
import type { ReferenceSolution } from '../types.ts';
import { KEY_SPACE, drainAntenna, readPacket } from '../world-8/shared.ts';

/**
 * TEST FIXTURES. The first honest idea a player has on each of these levels, written out so the
 * suite can measure what the level does to it.
 *
 * None of these are the reference solution. Most are the *wrong* answers the level blocks say a
 * player will reach for first, and prove CURRICULUM.md §14's claim that the randomization kills
 * them: each is expected to fail on at least one shipped seed.
 *
 * The last two are a different instrument and are marked as such. They are *correct* — they pass
 * every seed — and they exist so the suite can prove what medal a level hands to a program that
 * solved it without using the hardware it was issued for. See `docs/FIX-PAR.md` §3.
 */

const HEADING: Record<string, Dir> = {
  N: Dir.North,
  E: Dir.East,
  S: Dir.South,
  W: Dir.West,
};

/** w6-04: relay the band exactly as it arrives, on the assumption that it is already plain. */
export const rawRelay: ReferenceSolution = {
  levelId: 'w6-04',
  run(sim: Sim, botId: number): void {
    for (const packet of drainAntenna(sim, botId, 'mast')) {
      sim.applyMachineChange(
        botId,
        'mast',
        (machine) => {
          machine.vars['sent'] = (machine.vars['sent'] ?? 0) + 1;
        },
        1,
      );
      void packet;
    }
  },
  source: '',
};

/**
 * w6-05: a reader that handles one level of nesting and no more. It sorts the band correctly and
 * expands every move group it meets, but a call to another block is a token it does not know, so
 * it walks a truncated route.
 */
export const flatReader: ReferenceSolution = {
  levelId: 'w6-05',
  run(sim: Sim, botId: number): void {
    const salt = sim.probe(botId, 'mast')?.vars['salt'] ?? 0;
    const sums = (text: string): [number, number] => {
      let plain = salt;
      let skew = salt;
      for (let i = 0; i < text.length; i++) {
        plain += text.charCodeAt(i);
        skew += (i + 1) * text.charCodeAt(i);
      }
      return [plain % 256, skew % 256];
    };
    const sound = (packet: string): boolean => {
      const star = packet.lastIndexOf('*');
      if (star < 0) return false;
      const claimed = packet.slice(star + 1).split(',').map(Number);
      const [plain, skew] = sums(packet.slice(0, star));
      return plain === claimed[0] && skew === claimed[1];
    };
    const shift = (text: string, key: number): string => {
      const by = ((-key % KEY_SPACE) + KEY_SPACE) % KEY_SPACE;
      let out = '';
      for (const character of text) {
        const code = character.charCodeAt(0);
        out +=
          code < 32 || code > 126
            ? character
            : String.fromCharCode(((code - 32 + by) % KEY_SPACE) + 32);
      }
      return out;
    };

    const blocks = new Map<string, string>();
    for (const packet of drainAntenna(sim, botId, 'mast')) {
      let settled: string | null = sound(packet) ? packet : null;
      for (let key = 1; key < KEY_SPACE && settled === null; key++) {
        const candidate = shift(packet, key);
        if (sound(candidate)) settled = candidate;
      }
      if (settled === null) continue;
      const body = settled.slice(0, settled.lastIndexOf('*'));
      const bar = body.indexOf('|');
      blocks.set(body.slice(0, bar), body.slice(bar + 1));
    }

    for (const entry of (blocks.get('main') ?? '').split(',')) {
      if (entry.includes('*')) continue;
      const letter = entry[entry.length - 1] as string;
      const dir = HEADING[letter];
      if (dir === undefined) continue;
      for (let i = 0; i < Number(entry.slice(0, -1)); i++) sim.move(botId, dir);
    }
  },
  source: '',
};

/**
 * w7-04: deal the board out in advance, one job to each bot in turn. Correct on a flat cost
 * distribution and disastrous on a skewed one, which is the whole level.
 */
export const roundRobinDispatch: ReferenceSolution = {
  levelId: 'w7-04',
  run(sim: Sim): void {
    const fleet = sim.botIds();
    const board = sim.probe(fleet[0] as number, 'board');
    const jobs: { at: Vec; cost: number }[] = [];
    for (let i = 0; i < (board?.vars['jobs'] ?? 0); i++) {
      const job = sim.probe(fleet[0] as number, `job-${String(i)}`);
      if (job) jobs.push({ at: job.at, cost: job.vars['cost'] ?? 0 });
    }
    jobs.forEach((job, i) => {
      const id = fleet[i % fleet.length] as number;
      for (let guard = 0; guard < 200; guard++) {
        const at = sim.pos(id);
        if (at.x === job.at.x && at.y === job.at.y) break;
        const wanted: Dir[] = [];
        if (at.x < job.at.x) wanted.push(Dir.East);
        else if (at.x > job.at.x) wanted.push(Dir.West);
        if (at.y < job.at.y) wanted.push(Dir.South);
        else if (at.y > job.at.y) wanted.push(Dir.North);
        const open =
          wanted.find((dir) => sim.canMove(id, dir)) ??
          [Dir.North, Dir.South, Dir.East, Dir.West].find((dir) => sim.canMove(id, dir));
        if (open === undefined) sim.wait(id, 1);
        else sim.move(id, open);
      }
      for (let n = 0; n < job.cost; n++) sim.use(id);
    });
  },
  source: '',
};

/** w8-04: decode the filed plan and drive it, on the assumption that it is still true. */
export const literalPlanFollower: ReferenceSolution = {
  levelId: 'w8-04',
  run(sim: Sim, botId: number): void {
    const raw = drainAntenna(sim, botId);
    const shift = (text: string, key: number): string => {
      const by = ((-key % KEY_SPACE) + KEY_SPACE) % KEY_SPACE;
      let out = '';
      for (const character of text) {
        const code = character.charCodeAt(0);
        out +=
          code < 32 || code > 126
            ? character
            : String.fromCharCode(((code - 32 + by) % KEY_SPACE) + 32);
      }
      return out;
    };
    let key = 0;
    let best = -1;
    for (let candidate = 0; candidate < KEY_SPACE; candidate++) {
      const count = raw.filter((packet) => readPacket(shift(packet, candidate)).valid).length;
      if (count > best) {
        best = count;
        key = candidate;
      }
    }
    const sections = new Map<number, string>();
    for (const packet of raw) {
      const { fields, valid } = readPacket(shift(packet, key));
      if (valid && fields[0] === 'SEC') sections.set(Number(fields[1]), fields[2] ?? '');
    }
    for (const index of [...sections.keys()].sort((a, b) => a - b)) {
      let digits = '';
      for (const character of sections.get(index) ?? '') {
        if (character >= '0' && character <= '9') {
          digits += character;
          continue;
        }
        const dir = HEADING[character];
        if (dir === undefined) continue;
        for (let i = 0; i < Number(digits); i++) sim.move(botId, dir);
        digits = '';
      }
    }
    sim.pickup(botId, ItemKind.Chip);
    void step;
  },
  source: '',
};

/**
 * w8-01: the World 2 answer, on a World 8 work order. Sweep every row of the field, scan the tile
 * underfoot, harvest whatever is ripe, and run the load back to the silo whenever the arms fill.
 *
 * It is correct, it never wastes a beam because it never casts one, and it is exactly what the
 * two budgets exist to reject: the walk alone is longer than the shift.
 */
export const fieldSweep: ReferenceSolution = {
  levelId: 'w8-01',
  run(sim: Sim, botId: number): void {
    const silo = sim.probe(botId, 'silo')?.at ?? sim.pos(botId);
    const across = silo.x === 0 ? Dir.East : Dir.West;
    const back = across === Dir.East ? Dir.West : Dir.East;
    const along = silo.y === 0 ? Dir.South : Dir.North;

    const go = (to: Vec): void => {
      while (sim.pos(botId).x !== to.x) {
        sim.move(botId, sim.pos(botId).x < to.x ? Dir.East : Dir.West);
      }
      while (sim.pos(botId).y !== to.y) {
        sim.move(botId, sim.pos(botId).y < to.y ? Dir.South : Dir.North);
      }
    };

    let held = 0;
    let heading = across;
    for (;;) {
      const tile = sim.scan(botId);
      if (tile.crop !== null && tile.growth >= tile.maxGrowth && sim.harvest(botId)) {
        held++;
        if (held === sim.capacity(botId)) {
          const resume = sim.pos(botId);
          go(silo);
          sim.drop(botId, ItemKind.Crop, held);
          held = 0;
          go(resume);
        }
      }
      if (sim.canMove(botId, heading)) {
        sim.move(botId, heading);
        continue;
      }
      if (!sim.canMove(botId, along)) break;
      sim.move(botId, along);
      heading = heading === across ? back : across;
    }
    if (held > 0) {
      go(silo);
      sim.drop(botId, ItemKind.Crop, held);
    }
  },
  source: '',
};

// ---------------------------------------------------------------------------
// Correct, and issued the hardware anyway. docs/FIX-PAR.md §3.
// ---------------------------------------------------------------------------

/**
 * w1-03: ask before every single step.
 *
 * The answer with no idea in it, and it is *tick-optimal* — sensing is free, so polling the wall
 * before each tile costs exactly the tiles. Kept so the suite can say why w1-03's par cannot be
 * lowered: there is nothing below it. The stride the bonus asks for is strictly more expensive,
 * because it pays for the tiles the corridor turned out not to have.
 */
export const corridorPoll: ReferenceSolution = {
  levelId: 'w1-03',
  run(sim: Sim, botId: number): void {
    while (sim.canMove(botId, Dir.East)) sim.move(botId, Dir.East);
  },
  source: '',
};

/**
 * w2-01: read every tile in the row, then drive back to the highest reading.
 *
 * Correct on every seed, and the answer the level's own hints walk a player to. It costs the trip
 * out plus most of the trip back — 18 on the worst seed — because it never uses the one thing the
 * facts table states outright: exactly one tile sits at `maxGrowth`, so a reading that hits the
 * ceiling has nothing left to be compared against.
 */
export const rowSweep: ReferenceSolution = {
  levelId: 'w2-01',
  run(sim: Sim, botId: number): void {
    let bestGrowth = -1;
    let bestX = sim.pos(botId).x;
    for (;;) {
      const here = sim.scan(botId);
      if (here.crop !== null && here.growth > bestGrowth) {
        bestGrowth = here.growth;
        bestX = sim.pos(botId).x;
      }
      if (!sim.canMove(botId, Dir.East)) break;
      sim.move(botId, Dir.East);
    }
    while (sim.pos(botId).x > bestX) sim.move(botId, Dir.West);
  },
  source: '',
};

/**
 * w2-05: serpentine the field reading only the tile under the wheels, and stop when the hopper
 * refuses a crop.
 *
 * Correct on every seed, and it filters ice properly, which is the level's stated ask. It costs
 * 58-68 because it drives all six rows of a field the sensor can survey from two of them.
 */
export const serpentineHarvest: ReferenceSolution = {
  levelId: 'w2-05',
  run(sim: Sim, botId: number): void {
    let full = false;
    const service = (): void => {
      if (full) return;
      const here = sim.scan(botId);
      if (here.crop !== ItemKind.Crop || here.growth < here.maxGrowth) return;
      if (sim.harvest(botId) === null) full = true;
    };
    const sweep = (dir: DirType): void => {
      while (!full && sim.canMove(botId, dir)) {
        sim.move(botId, dir);
        service();
      }
    };

    let dir: DirType = Dir.East;
    service();
    sweep(dir);
    while (!full && sim.canMove(botId, Dir.South)) {
      sim.move(botId, Dir.South);
      service();
      dir = dir === Dir.East ? Dir.West : Dir.East;
      sweep(dir);
    }
  },
  source: '',
};
