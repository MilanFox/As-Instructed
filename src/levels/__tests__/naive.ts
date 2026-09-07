import type { Dir as DirType, Sim, Vec } from '../../engine/index.ts';
import { Dir, ItemKind, Terrain, step } from '../../engine/index.ts';
import type { ReferenceSolution } from '../types.ts';
import { KEY_SPACE, KnownMap, drainAntenna, follow, readPacket } from '../world-8/shared.ts';

/** Every World 8 site is 30 x 30, and `look` is free, so a ray is never worth capping short. */
const SITE = 30;

/** Except the finale, which is 48 x 40. */
const FINALE = { w: 48, h: 40 };

/**
 * TEST FIXTURES. The first honest idea a player has on each of these levels, written out so the
 * suite can measure what the level does to it.
 *
 * None of these are the reference solution. Most are the *wrong* answers the level blocks say a
 * player will reach for first, and prove CURRICULUM.md §2 rule 2's claim that the randomization kills
 * them: each is expected to fail on at least one shipped seed.
 *
 * The last two are a different instrument and are marked as such. They are *correct* — they pass
 * every seed — and they exist so the suite can prove what medal a level hands to a program that
 * solved it without using the hardware it was issued for.
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
// Correct, and issued the hardware anyway.
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
 * w2-05: serpentine the field reading only the tile under the wheels, and stop when the hopper
 * refuses a crop.
 *
 * It filters ice properly, which is the level's stated ask, and it would fill the hopper on every
 * seed given the time. It costs 58-68 because it drives all six rows of a field the sensor can
 * survey from two of them, and the shift is 62, so on three seeds of five it is powered down with
 * the hopper still open. That is the level's whole subject: the ground you decline to cover.
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

/**
 * w8-04, the answer that never turns the radio on: walk the workings until the form is in view,
 * then go and lift it. Correct on every seed, and it is the program the level's par exists to
 * rank.
 */
export const frontierScavenger: ReferenceSolution = {
  levelId: 'w8-04',
  run(sim: Sim, botId: number): void {
    const map = new KnownMap({ w: SITE, h: SITE });
    const observe = (): void => {
      map.observe(sim, botId, SITE);
    };
    observe();
    for (let guard = 0; guard < 400; guard++) {
      const found = map.where((view) => view.items.some((held) => held.kind === ItemKind.Chip))[0];
      if (found && follow(sim, botId, map, found.at, { onStep: observe })) break;
      const outward = map.pathToFrontier(sim.pos(botId));
      if (outward === null || outward.length === 0) break;
      for (const dir of outward) {
        if (!sim.canMove(botId, dir)) break;
        sim.move(botId, dir);
        observe();
      }
    }
    sim.pickup(botId, ItemKind.Chip);
  },
  source: '',
};

/**
 * w8-04, the same refusal played better. `probe(id)` reaches any machine on the site for nothing,
 * so this one asks every locker where it is before it takes a step, and walks the list nearest
 * first. It is the strongest program that ignores the plan, and it is the reason the lockers are
 * numbered the way they are: the coordinates all come back, and not one of them says which locker
 * holds the form.
 */
export const lockerCanvasser: ReferenceSolution = {
  levelId: 'w8-04',
  run(sim: Sim, botId: number): void {
    const map = new KnownMap({ w: SITE, h: SITE });
    const observe = (): void => {
      map.observe(sim, botId, SITE);
    };
    const lockers: Vec[] = [];
    for (let n = 0; n < 12; n++) {
      const seen = sim.probe(botId, `locker-${String(n)}`);
      if (seen) lockers.push(seen.at);
    }
    observe();
    let goal: Vec = sim.pos(botId);
    for (let guard = 0; guard < 400; guard++) {
      observe();
      const found = map.where((view) => view.items.some((held) => held.kind === ItemKind.Chip))[0];
      if (found && follow(sim, botId, map, found.at, { onStep: observe })) break;

      const from = sim.pos(botId);
      const away = (at: Vec): number => Math.abs(at.x - from.x) + Math.abs(at.y - from.y);
      const next = lockers.filter((at) => !map.known(at)).sort((a, b) => away(a) - away(b))[0];
      goal = next ?? goal;
      if (map.passable(goal) && follow(sim, botId, map, goal, { onStep: observe })) continue;

      let outward: DirType[] | null = null;
      let nearest = Number.POSITIVE_INFINITY;
      for (const view of map.where((candidate) => map.isFrontier(candidate.at))) {
        const route = map.pathTo(from, view.at);
        if (route === null) continue;
        const score = route.length + Math.abs(view.at.x - goal.x) + Math.abs(view.at.y - goal.y);
        if (score < nearest) {
          nearest = score;
          outward = route;
        }
      }
      if (outward === null || outward.length === 0) break;
      for (const dir of outward) {
        if (!sim.canMove(botId, dir)) break;
        sim.move(botId, dir);
        observe();
      }
    }
    sim.pickup(botId, ItemKind.Chip);
  },
  source: '',
};

/**
 * w8-05, the form leg on its own: survey with the fleet, lift KD-0001-T, pay the airlock toll,
 * file it. **It never energises a substation, and it never looks at one.**
 *
 * This is the veteran's third specific written as a program. Their complaint was that the form leg
 * *"depends on nothing else"* — that deleting the grid from a solution changes no other line of it
 * — and the only honest way to answer that is to delete the grid from a solution and see whether
 * the form still gets filed. It did. The suite runs this against the same
 * seeds with and without the door's `fed:` key, which is the one difference between the two
 * worlds, and the star it is here to earn is the one it now cannot: `file-form`.
 *
 * It is deliberately not a good program. It fails `grid-online` and `quota` by construction and it
 * spends far more of the shift than the reference does, because efficiency is not what is on
 * trial — reachability is.
 */
export const formErrandOnly: ReferenceSolution = {
  levelId: 'w8-05',
  run(sim: Sim): void {
    const clerk = sim.botIds()[0] as number;
    const map = new KnownMap(FINALE);
    const look = (): void => {
      map.observe(sim, clerk, FINALE.w);
    };
    look();

    let form: Vec | null = null;
    for (const packet of drainAntenna(sim, clerk)) {
      const { fields, valid } = readPacket(packet);
      if (valid && fields[0] === 'FORM') form = { x: Number(fields[1]), y: Number(fields[2]) };
    }
    const airlock = sim.probe(clerk, 'airlock');
    const charter = sim.probe(clerk, 'slot-charter');
    if (!form || !airlock || !charter) return;

    const gap = (a: Vec, b: Vec): number => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);
    const fill = (): void => {
      for (let attempt = 0; attempt < 3; attempt++) {
        if (sim.refuel(clerk)) return;
        const here = sim.pos(clerk);
        const pump = map
          .where((view) => view.terrain === Terrain.Depot)
          .map((view) => view.at)
          .sort((a, b) => gap(here, a) - gap(here, b))[0];
        if (pump === undefined) return;
        if (!follow(sim, clerk, map, pump, { onStep: look })) return;
      }
    };
    /** One step of survey, chosen for being on the way to `to` rather than merely nearest. */
    const towards = (to: Vec): boolean => {
      if (sim.fuel(clerk) < 60) fill();
      const from = sim.pos(clerk);
      const edges = map
        .where((view) => map.isFrontier(view.at))
        .map((view) => view.at)
        .sort((a, b) => gap(from, a) + gap(a, to) - (gap(from, b) + gap(b, to)));
      for (const at of edges.slice(0, 4)) {
        if (gap(from, at) === 0) continue;
        if (follow(sim, clerk, map, at, { onStep: look })) return true;
      }
      return false;
    };
    /**
     * Walk there, buying map when the ground between is unseen, and give up when buying map stops
     * buying anything. Ground behind a sealed door is not a survey problem and no amount of
     * walking turns it into one.
     */
    const reach = (to: Vec): boolean => {
      let stalls = 0;
      for (let attempt = 0; attempt < 80 && stalls < 3; attempt++) {
        if (sim.fuel(clerk) < 60) fill();
        if (map.pathTo(sim.pos(clerk), to) !== null && follow(sim, clerk, map, to, { onStep: look })) {
          return true;
        }
        const before = map.size();
        if (!towards(to)) return false;
        stalls = map.size() > before ? 0 : stalls + 1;
      }
      return false;
    };

    if (!reach(form)) return;
    sim.pickup(clerk, ItemKind.Chip);
    if (!reach(airlock.at)) return;
    fill();
    if (!reach(airlock.at)) return;
    const stages = airlock.vars['stages'] ?? 0;
    for (let i = 0; i <= stages; i++) {
      if (sim.probe(clerk, 'airlock')?.state === 'open') break;
      if (sim.fuel(clerk) <= 1) break;
      sim.use(clerk);
    }
    look();
    if (!reach(charter.at)) return;
    sim.drop(clerk, ItemKind.Chip);
  },
  source: '',
};
