import type { Dir, Sim, Vec } from '../../../engine/index.ts';
import { ALL_DIRS, ItemKind, Terrain, manhattan, step } from '../../../engine/index.ts';
import type { ReferenceSolution } from '../../types.ts';
import {
  KEY_SPACE,
  KnownMap,
  distancesOn,
  drainAntenna,
  key,
  pathOn,
  readPacket,
} from '../shared.ts';

/**
 * TEST FIXTURE. Never imported from src/main.tsx — vite.config.ts fails the build if it is.
 *
 * The shift, run by a fleet with roles.
 *
 * One experiment on the band recovers the shift and the checksums throw away the packets that
 * lie, which turns the site from a search into a list of coordinates. Walking the workings is
 * then the single most expensive thing left, so nobody does it alone: the whole fleet spreads
 * out until every coordinate the band handed over is joined to the bay, and only then does
 * anybody start work.
 *
 * After that the shift runs as three interleaved streams. The grid is taken one dependency rank
 * at a time with a `sync` either side of the rank, which makes precedence true by construction
 * rather than by scheduling and still lets whichever bots are nearest throw the switches. The
 * form is one errand carried a step at a time by whoever was going that way, because the toll at
 * the airlock is the same size whoever pays it. Everybody else hauls.
 *
 * Three things keep it from seizing up, and each of them was a way it seized up:
 *  - the crew is terrain. A parked bot holds its tile for good, so a route goes around the fleet
 *    where it can and shoves it where it cannot, and shoving is recursive because a queue in a
 *    one-wide passage clears from the front.
 *  - nobody stops on a working tile. A bot parked on a pad, a station or — fatally — the
 *    airlock's approach is a wall there for the rest of the shift.
 *  - fuel is priced into every leg rather than checked when it runs out. A bot only takes a
 *    route it can come back from, tops up at the pump nearest wherever it is going next, and
 *    picks that pump so that being interrupted half way still leaves it able to move.
 *
 * Deliberately not the fastest shape available. A player who batches crates by class into a
 * six-slot hold and sends the clerk out with a hauler's load will beat it, which is where the
 * twenty-percent bonus lives.
 */

const WIDTH = 48;
const HEIGHT = 40;
/** Spare ticks of fuel kept in hand on top of the trip home. */
const RESERVE = 18;
/** Fuel a bot keeps back when it picks which pump to fill at. */
const MARGIN = 8;

interface Station {
  id: string;
  at: Vec;
  deps: string[];
}

interface Crate {
  at: Vec;
  kind: string;
}

export const solution: ReferenceSolution = {
  levelId: 'w8-05',
  run(sim: Sim): void {
    const fleet = sim.botIds();
    /* Every bot starts full, and `fuelMax` is not part of the player's hardware, so the size of
       a full tank is simply what the first bot has before anybody has moved. */
    const tank = sim.fuel(fleet[0] as number);
    const map = new KnownMap({ w: WIDTH, h: HEIGHT });
    const index = (at: Vec): number => at.y * WIDTH + at.x;
    const passable = (at: Vec): boolean => map.passable(at);
    for (const id of fleet) map.observe(sim, id, WIDTH);

    // ---- the band --------------------------------------------------------
    const unshift = (text: string, cipherKey: number): string => {
      const by = ((-cipherKey % KEY_SPACE) + KEY_SPACE) % KEY_SPACE;
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

    const raw = drainAntenna(sim, fleet[0] as number);
    let cipherKey = 0;
    let bestCount = -1;
    for (let candidate = 0; candidate < KEY_SPACE; candidate++) {
      let count = 0;
      for (const packet of raw) if (readPacket(unshift(packet, candidate)).valid) count++;
      if (count > bestCount) {
        bestCount = count;
        cipherKey = candidate;
      }
    }

    const crates: Crate[] = [];
    let form: Vec | null = null;
    for (const packet of raw) {
      const { fields, valid } = readPacket(unshift(packet, cipherKey));
      if (!valid) continue;
      const at = { x: Number(fields[1]), y: Number(fields[2]) };
      if (fields[0] === 'CRATE') crates.push({ at, kind: String(fields[3]) });
      else if (fields[0] === 'FORM') form = at;
    }

    // ---- the site --------------------------------------------------------
    const anyBot = fleet[0] as number;
    const desk = sim.probe(anyBot, 'desk');
    const stations: Station[] = [];
    for (let i = 0; i < (desk?.vars['stations'] ?? 0); i++) {
      const view = sim.probe(anyBot, `sub-${String(i)}`);
      if (!view) continue;
      const deps: string[] = [];
      for (let n = 0; n < (view.vars['deps'] ?? 0); n++) {
        deps.push(`sub-${String(view.vars[`dep${String(n)}`] ?? 0)}`);
      }
      stations.push({ id: view.id, at: view.at, deps });
    }

    const sinks = new Map<string, Vec>();
    for (const kind of [ItemKind.Ore, ItemKind.Ice, ItemKind.Scrap, ItemKind.Part, ItemKind.Cell]) {
      const view = sim.probe(anyBot, `depot-${kind}`);
      if (view) sinks.set(kind, view.at);
    }
    const airlock = sim.probe(anyBot, 'airlock');
    const charter = sim.probe(anyBot, 'slot-charter');

    // ---- the crew is terrain --------------------------------------------
    // A bot that has stopped holds its tile for good, so a route goes around the rest of the
    // fleet where it can and asks them to shift where it cannot.
    const spot = (id: number): Vec => sim.pos(id);
    const who = (at: Vec): number => {
      for (const other of fleet) {
        const where = spot(other);
        if (where.x === at.x && where.y === at.y) return other;
      }
      return -1;
    };
    const route = (from: Vec, to: Vec, skip: Set<string> | null): Dir[] | null =>
      pathOn(map, (at) => map.passable(at) && (skip === null || !skip.has(key(at))), from, to);
    const crewAt = (id: number, to: Vec): Set<string> => {
      const taken = new Set<string>();
      for (const other of fleet) if (other !== id) taken.add(key(spot(other)));
      taken.delete(key(to));
      return taken;
    };

    /**
     * Tiles nobody may stop on: every crate, pad and station, and the airlock's approach.
     *
     * The approach earns its place by shape. It is a dead end with walls on three sides, so one
     * bot that stops in it corks the only bottle on the site and the form never gets out.
     */
    const precious = new Set<string>(stations.map((station) => key(station.at)));
    for (const at of sinks.values()) precious.add(key(at));
    for (const crate of crates) precious.add(key(crate.at));
    if (airlock) {
      for (let dx = -2; dx <= 2; dx++) {
        for (let dy = -2; dy <= 2; dy++) {
          if (Math.abs(dx) + Math.abs(dy) > 2) continue;
          precious.add(key({ x: airlock.at.x + dx, y: airlock.at.y + dy }));
        }
      }
    }

    /** A queue in a one-wide passage clears from the front, so shoving is recursive. */
    const aside = (id: number, depth = 0): boolean => {
      if (sim.fuel(id) <= 1) return false;
      const here = spot(id);
      const options = ALL_DIRS.filter((dir) => map.passable(step(here, dir)));
      const order = options
        .filter((dir) => !precious.has(key(step(here, dir))))
        .concat(options);
      for (const dir of order) {
        if (!sim.canMove(id, dir)) continue;
        sim.move(id, dir);
        return true;
      }
      if (depth >= 2) return false;
      for (const dir of order) {
        const other = who(step(here, dir));
        if (other < 0 || other === id || !aside(other, depth + 1)) continue;
        if (!sim.canMove(id, dir)) continue;
        sim.move(id, dir);
        return true;
      }
      return false;
    };

    // ---- fuel ------------------------------------------------------------
    const pumps = (): Vec[] =>
      map.where((view) => view.terrain === Terrain.Depot).map((view) => view.at);

    /** Hops from the nearest pump to everywhere seen: the price of a leg is the trip back. */
    const homeward = (): Map<number, number> => {
      const out = new Map<number, number>();
      const queue: Vec[] = pumps();
      for (const at of queue) out.set(index(at), 0);
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head] as Vec;
        const base = out.get(index(at)) ?? 0;
        for (const dir of ALL_DIRS) {
          const next = step(at, dir);
          if (out.has(index(next)) || !map.passable(next)) continue;
          out.set(index(next), base + 1);
          queue.push(next);
        }
      }
      return out;
    };

    /** Steps actually taken. A short answer means somebody was in the way and it is time to re-plan. */
    const drive = (id: number, path: readonly Dir[]): number => {
      let taken = 0;
      for (const dir of path) {
        if (sim.fuel(id) <= 1) return taken;
        let waited = 0;
        while (!sim.canMove(id, dir) && waited < 3) {
          sim.wait(id, 1);
          waited++;
        }
        if (!sim.canMove(id, dir)) return taken;
        sim.move(id, dir);
        map.observe(sim, id, WIDTH);
        taken++;
      }
      return taken;
    };

    /**
     * Fills at the pump nearest wherever the bot is going next, and keeps trying from wherever
     * the walk actually got to.
     *
     * Which pump is the whole of the fuel decision: the cheapest round trip to anywhere is out
     * from its closest pump and back to the same one. The two margins are the other half — a
     * pump the tank can reach with something in hand, and only if there is none, the nearest
     * pump on a way that is clear of the crew right now. Arriving dry is survivable; stopping
     * dry in a passage is not, because the bot is then a wall for the rest of the shift.
     */
    const fill = (id: number, to: Vec | null): boolean => {
      if (!Number.isFinite(sim.fuel(id))) return true;
      for (let attempt = 0; attempt < 5; attempt++) {
        if (sim.refuel(id)) return true;
        const here = spot(id);
        const crew = new Set<string>();
        for (const other of fleet) if (other !== id) crew.add(key(spot(other)));
        let best: Dir[] | null = null;
        let score = Number.POSITIVE_INFINITY;
        for (const margin of [MARGIN, 1]) {
          const ways: (Set<string> | null)[] = margin > 1 ? [crew, null] : [crew];
          for (const skip of ways) {
            for (const pump of pumps()) {
              const path = route(here, pump, skip);
              if (path === null || path.length + margin > sim.fuel(id)) continue;
              const cost = to === null ? path.length : manhattan(pump, to);
              if (cost >= score) continue;
              score = cost;
              best = path;
            }
            if (best !== null) break;
          }
          if (best !== null) break;
        }
        if (best === null) return false;
        if (drive(id, best) > 0 || best.length === 0) continue;
        const blocker = who(step(spot(id), best[0] as Dir));
        if (blocker >= 0 && blocker !== id) aside(blocker);
        else sim.wait(id, 1);
      }
      return sim.refuel(id);
    };

    /** Walks to a place already on the map, filling up first when the return trip needs it. */
    const goTo = (id: number, to: Vec): boolean => {
      const back = homeward();
      let stalled = 0;
      for (let attempt = 0; attempt < 8; attempt++) {
        const from = spot(id);
        if (from.x === to.x && from.y === to.y) return true;
        if (!map.passable(to)) return false;
        const sitting = who(to);
        if (sitting >= 0 && sitting !== id) aside(sitting);
        const path = route(from, to, crewAt(id, to)) ?? route(from, to, null);
        if (path === null) return false;
        // A full tank is as good as it gets: refusing the leg then would refuse it for ever.
        const need = path.length + (back.get(index(to)) ?? path.length) + RESERVE;
        if (sim.fuel(id) < need && sim.fuel(id) < tank) {
          if (!fill(id, to)) return false;
          continue;
        }
        const walked = drive(id, path);
        if (walked === path.length) return true;
        if (walked > 0) {
          stalled = 0;
          continue;
        }
        if (stalled >= 2) return false;
        stalled++;
        const blocker = who(step(spot(id), path[0] as Dir));
        if (blocker >= 0 && blocker !== id) aside(blocker);
        else sim.wait(id, 2);
      }
      return false;
    };

    /** One step out to the edge of the known map, chosen for being on the way to `to`. */
    const hop = (id: number, to: Vec): boolean => {
      const out = distancesOn(map, passable, spot(id));
      const edges: { at: Vec; score: number }[] = [];
      for (const view of map.where((tile) => map.isFrontier(tile.at))) {
        const there = out.get(index(view.at));
        if (there === undefined || there === 0) continue;
        // Never stop on a working tile unless it is the one this bot is going to.
        if (precious.has(key(view.at)) && manhattan(view.at, to) > 2) continue;
        edges.push({ at: view.at, score: there + manhattan(view.at, to) });
      }
      edges.sort((a, b) => a.score - b.score);
      // The best edge is often the one somebody else is already standing on. Try a few.
      for (const edge of edges.slice(0, 5)) if (goTo(id, edge.at)) return true;
      return false;
    };

    /**
     * `goTo`, but willing to buy more map when the ground between is still unseen.
     *
     * Ground the fleet has seen is a routing problem, and the answer to a routing problem is to
     * try it again once the traffic has moved. Ground it has not seen is a survey problem, and
     * only that is worth walking away from the destination for.
     */
    const reach = (id: number, to: Vec): boolean => {
      if (sim.fuel(id) < tank * 0.3) fill(id, to);
      for (let attempt = 0; attempt < 20; attempt++) {
        // Falling behind is itself a reason a route fails, so catch the fleet up before deciding
        // the ground is impassable.
        if (attempt > 0) sim.sync();
        if (goTo(id, to)) return true;
        if (route(spot(id), to, null) !== null) continue;
        if (!hop(id, to)) return fill(id, to) && goTo(id, to);
      }
      return false;
    };

    /** A bot needs something in the tank to work when it arrives, not merely to get there. */
    const ready = (id: number): boolean => {
      if (sim.fuel(id) > 20) return true;
      fill(id, null);
      return sim.fuel(id) > 1;
    };

    // ---- survey, with everybody -----------------------------------------
    // The airlock is deliberately not on this list. Its approach is the one place on the site
    // where a parked bot cannot be walked around, and the carrier finds it for itself.
    const marks: Vec[] = [
      ...stations.map((station) => station.at),
      ...sinks.values(),
      ...crates.map((crate) => crate.at),
    ];
    if (form) marks.push(form);

    let stalledRounds = 0;
    for (let round = 0; round < 90 && stalledRounds < 4; round++) {
      const known = distancesOn(map, passable, spot(anyBot));
      const missing = marks.filter((at) => !known.has(index(at)));
      if (missing.length === 0) break;
      sim.sync();
      const claimed = new Set<string>();
      let moved = false;
      for (const id of fleet) {
        const from = spot(id);
        let want = missing[0] as Vec;
        let nearest = Number.POSITIVE_INFINITY;
        for (const at of missing) {
          if (claimed.has(key(at))) continue;
          const distance = manhattan(from, at);
          if (distance >= nearest) continue;
          nearest = distance;
          want = at;
        }
        claimed.add(key(want));
        if (hop(id, want)) moved = true;
      }
      stalledRounds = moved ? 0 : stalledRounds + 1;
    }

    // Everybody starts the shift proper full, and nobody starts it standing on a working tile.
    sim.sync();
    for (const id of fleet) fill(id, null);
    for (const id of fleet) if (precious.has(key(spot(id)))) aside(id);

    // ---- roles -----------------------------------------------------------
    const electrician = fleet[0] as number;
    const clerk = fleet.length > 1 ? (fleet[1] as number) : electrician;
    const haulers = fleet.length > 2 ? fleet.slice(2) : fleet;

    // Ranked by how deep into the graph each station sits. A rank is fenced by a sync either
    // side of it, so everything a station feeds off has finished before any of it starts — which
    // makes precedence true by construction rather than by scheduling, and still lets the rank
    // itself be thrown by whichever bots are nearest.
    const rank = new Map<string, number>();
    const byId = new Map(stations.map((station) => [station.id, station]));
    const depthOf = (station: Station, guard: number): number => {
      const known = rank.get(station.id);
      if (known !== undefined) return known;
      if (guard > stations.length) return 0;
      let deep = 0;
      for (const dep of station.deps) {
        const feeder = byId.get(dep);
        if (feeder) deep = Math.max(deep, depthOf(feeder, guard + 1) + 1);
      }
      rank.set(station.id, deep);
      return deep;
    };
    const ranks: Station[][] = [];
    for (const station of stations) {
      const deep = depthOf(station, 0);
      while (ranks.length <= deep) ranks.push([]);
      (ranks[deep] as Station[]).push(station);
    }

    /** The cycle wraps, so a station that is already on is left alone: using it twice is off. */
    const lit = (station: Station): boolean =>
      sim.probe(anyBot, station.id)?.state === 'on';
    const light = (station: Station): boolean => {
      if (lit(station)) return true;
      const order = fleet
        .slice()
        .sort((a, b) => manhattan(spot(a), station.at) - manhattan(spot(b), station.at));
      for (const id of order) {
        if (!ready(id) || !reach(id, station.at)) continue;
        sim.use(id);
        if (lit(station)) return true;
      }
      return false;
    };

    // ---- the form --------------------------------------------------------
    // The toll at the airlock is the same size whoever pays it and whenever it is paid, so it is
    // paid once, by whoever was going that way. One step per pass, alongside everything else.
    let carrier = clerk;
    let stage = 0;
    let fumbled = 0;
    let errandTries = 0;

    const errandStep = (): boolean => {
      if (!form || !airlock || !charter || stage >= 3 || errandTries >= 40) return false;
      errandTries++;
      if (stage === 0) {
        // Whoever is nearest with a tank worth the trip, and never the bot holding the grid.
        let score = Number.POSITIVE_INFINITY;
        for (const id of fleet) {
          if (id === electrician || sim.fuel(id) <= 30) continue;
          const cost = manhattan(spot(id), form) - sim.fuel(id);
          if (cost >= score) continue;
          score = cost;
          carrier = id;
        }
        if (reach(carrier, form) && ready(carrier)) {
          sim.pickup(carrier, ItemKind.Chip);
          stage = 1;
          fumbled = 0;
        }
        return true;
      }
      const target = stage === 1 ? airlock.at : charter.at;
      const sitting = who(target);
      if (sitting >= 0 && sitting !== carrier) {
        aside(sitting);
        sim.sync();
      }
      if (reach(carrier, target) && ready(carrier)) {
        if (stage === 1) {
          // The cycle wraps here too, so ask the door what state it is in rather than counting
          // on having been the one who started it.
          const stages = airlock.vars['stages'] ?? 0;
          for (let i = 0; i <= stages && sim.fuel(carrier) > 1; i++) {
            if (sim.probe(carrier, 'airlock')?.state === 'open') break;
            sim.use(carrier);
          }
          map.observe(sim, carrier, WIDTH);
        } else {
          sim.drop(carrier, ItemKind.Chip);
        }
        stage++;
        fumbled = 0;
        return true;
      }
      if (++fumbled >= 3 && sim.fuel(carrier) > 1) {
        // Boxed in with the form in hand. Put it down here and let somebody else carry it.
        sim.drop(carrier, ItemKind.Chip);
        form = spot(carrier);
        aside(carrier);
        stage = 0;
        fumbled = 0;
      }
      return true;
    };

    // The tunnels are never emptier than they are right now, and the airlock stand is one tile
    // wide. Get the form moving before the hauling starts.
    for (let i = 0; i < 8 && stage < 3; i++) errandStep();

    // ---- the shift -------------------------------------------------------
    // The three streams run interleaved rather than one after another. A bot standing still is a
    // wall to everybody else, so the cheapest way to keep the site passable is to keep the whole
    // fleet in motion at once.
    const outstanding = crates.slice();
    const working = haulers.slice();
    const strikes = new Map<number, number>();
    let grid = 0;
    let refills = 8;
    let gridTries = 0;

    for (let guard = 0; guard < 800; guard++) {
      // Pull the fleet back onto one clock every few passes. A bot holds a tile from the moment
      // it arrives until its next move completes, so a bot a long way behind in virtual time
      // cannot walk through ground the rest of the crew was standing on at that moment — the
      // site turns into other people's history. Syncing every pass would fix that and hand the
      // whole fleet the slowest bot's clock, which is the thing being scored.
      if (guard % 3 === 0) sim.sync();
      let acted = false;

      if (grid < ranks.length) {
        sim.sync();
        let whole = true;
        for (const station of ranks[grid] as Station[]) if (!light(station)) whole = false;
        sim.sync();
        if (whole || ++gridTries >= 3) {
          grid++;
          gridTries = 0;
        }
        acted = true;
      }

      if (errandStep()) acted = true;

      if (outstanding.length > 0 && working.length === 0 && refills > 0) {
        refills--;
        strikes.clear();
        working.push(...haulers);
      }

      if (outstanding.length > 0 && working.length > 0) {
        let pick = working[0] as number;
        let earliest = Number.POSITIVE_INFINITY;
        for (const id of working) {
          const clock = sim.clock(id);
          if (clock >= earliest) continue;
          earliest = clock;
          pick = id;
        }
        const from = spot(pick);
        let choice = 0;
        let nearest = Number.POSITIVE_INFINITY;
        outstanding.forEach((crate, at) => {
          const distance = manhattan(from, crate.at);
          if (distance >= nearest) return;
          nearest = distance;
          choice = at;
        });
        const crate = outstanding.splice(choice, 1)[0] as Crate;
        const sink = sinks.get(crate.kind);
        if (sink) {
          const fumble = (): void => {
            const missed = (strikes.get(pick) ?? 0) + 1;
            strikes.set(pick, missed);
            // Four failed errands and the bot is boxed in or dry for good. Until then it is
            // just unlucky, and the crate goes back on the board for somebody else.
            if (missed >= 4) working.splice(working.indexOf(pick), 1);
            fill(pick, null);
          };
          if (!reach(pick, crate.at) || !ready(pick)) {
            outstanding.push(crate);
            fumble();
          } else {
            sim.pickup(pick, crate.kind as ItemKind);
            if (reach(pick, sink) && ready(pick)) {
              sim.drop(pick, crate.kind as ItemKind);
              aside(pick);
              strikes.set(pick, 0);
            } else if (sim.fuel(pick) > 1) {
              // Never end a shift holding a crate. Put it down where the bot got stuck and
              // book it back onto the board at its new address.
              sim.drop(pick, crate.kind as ItemKind);
              outstanding.push({ at: spot(pick), kind: crate.kind });
              fumble();
            } else {
              fumble();
            }
          }
        }
        acted = true;
      }

      if (!acted) break;
    }

    // Last sweep. Anything still on the board gets offered to the whole fleet, one bot at a time,
    // because at this point the only thing left to optimise is whether the job is finished.
    let stubborn = 0;
    while (grid < ranks.length && stubborn < 4) {
      sim.sync();
      let whole = true;
      for (const station of ranks[grid] as Station[]) if (!light(station)) whole = false;
      sim.sync();
      if (whole) {
        grid++;
        stubborn = 0;
      } else {
        stubborn++;
      }
    }

    // Run off the map rather than off the plan: anything the fleet has seen lying on the ground
    // that is not already on a pad is a crate somebody dropped or never reached.
    const pads = [...sinks.values()];
    for (let round = 0; round < 4; round++) {
      sim.sync();
      const loose = map
        .where((view) => view.items.length > 0)
        .map((view) => view.at)
        .filter((at) => !pads.some((pad) => pad.x === at.x && pad.y === at.y));
      if (loose.length === 0) break;
      let shifted = false;
      for (const at of loose) {
        for (const id of fleet) {
          if (!reach(id, at) || !ready(id)) continue;
          const here = sim.scan(id);
          map.record(here);
          const stack = here.items[0];
          if (!stack) break;
          const sink = sinks.get(stack.kind);
          if (!sink) break;
          sim.pickup(id, stack.kind);
          if (reach(id, sink) && ready(id)) {
            sim.drop(id, stack.kind);
            aside(id);
            shifted = true;
          } else if (sim.fuel(id) > 1) {
            sim.drop(id, stack.kind);
          }
          break;
        }
      }
      if (!shifted) break;
    }
  },
  source: [
    '// Roles, not a rota: one electrician, one clerk, everybody else on crates.',
    'const fleet = bots();',
    'const tank = bot(fleet[0]).fuel();',
    '',
    'const raw = [];',
    'for (let p = receive(); p !== null; p = receive()) raw.push(p);',
    'const sum = (t) => {',
    '  let n = 0;',
    '  for (const c of t) n += c.charCodeAt(0);',
    '  return n % 1000;',
    '};',
    'const holds = (t) => {',
    "  const parts = t.split('|');",
    "  if (parts.length < 3 || parts[0] !== 'KD4470') return null;",
    "  const body = parts.slice(0, -1).join('|');",
    '  return String(sum(body)) === parts[parts.length - 1] ? parts.slice(1, -1) : null;',
    '};',
    'let shift = 0;',
    'let most = -1;',
    'for (let c = 0; c < 95; c++) {',
    '  const n = raw.filter((p) => holds(decode(p, c))).length;',
    '  if (n > most) { most = n; shift = c; }',
    '}',
    'const crates = [];',
    'let form = null;',
    'for (const p of raw) {',
    '  const f = holds(decode(p, shift));',
    '  if (!f) continue;',
    '  const at = { x: Number(f[1]), y: Number(f[2]) };',
    "  if (f[0] === 'CRATE') crates.push({ at, kind: f[3] });",
    "  else if (f[0] === 'FORM') form = at;",
    '}',
    '',
    "const desk = probe('desk');",
    'const subs = [];',
    'for (let i = 0; i < desk.vars.stations; i++) {',
    '  const v = probe(`sub-${i}`);',
    '  const deps = [];',
    "  for (let n = 0; n < v.vars.deps; n++) deps.push(`sub-${v.vars['dep' + n]}`);",
    '  subs.push({ id: v.id, at: v.at, deps });',
    '}',
    'const sinks = new Map();',
    "for (const kind of ['ore', 'ice', 'scrap', 'part', 'cell']) {",
    '  const v = probe(`depot-${kind}`);',
    '  if (v) sinks.set(kind, v.at);',
    '}',
    "const airlock = probe('airlock');",
    "const charter = probe('slot-charter');",
    '',
    '// The only map anybody has is the one the fleet has looked at.',
    'const seen = new Map();',
    'const k = (p) => `${p.x},${p.y}`;',
    'const dirs = [Dir.North, Dir.East, Dir.South, Dir.West];',
    'const to = (p, d) => ({',
    '  x: p.x + (d === Dir.East ? 1 : d === Dir.West ? -1 : 0),',
    '  y: p.y + (d === Dir.South ? 1 : d === Dir.North ? -1 : 0),',
    '});',
    'const gap = (a, b) => Math.abs(a.x - b.x) + Math.abs(a.y - b.y);',
    'const open = (p) => seen.get(k(p))?.walkable === true;',
    'const spot = (id) => bot(id).pos();',
    'const look4 = (id) => {',
    '  seen.set(k(spot(id)), bot(id).scan());',
    '  for (const d of dirs) for (const v of bot(id).look(d, 48)) seen.set(k(v.at), v);',
    '};',
    'const flood = (from, skip) => {',
    '  const via = new Map([[k(from), null]]);',
    '  const q = [from];',
    '  for (let i = 0; i < q.length; i++) {',
    '    for (const d of dirs) {',
    '      const n = to(q[i], d);',
    '      if (via.has(k(n)) || !open(n) || (skip && skip.has(k(n)))) continue;',
    '      via.set(k(n), { at: q[i], dir: d });',
    '      q.push(n);',
    '    }',
    '  }',
    '  return via;',
    '};',
    'const trail = (via, from, dest) => {',
    '  if (!via.has(k(dest))) return null;',
    '  const out = [];',
    '  let at = dest;',
    '  while (!(at.x === from.x && at.y === from.y)) {',
    '    const back = via.get(k(at));',
    '    out.push(back.dir);',
    '    at = back.at;',
    '  }',
    '  return out.reverse();',
    '};',
    'const route = (from, dest, skip) => trail(flood(from, skip), from, dest);',
    '',
    '// A parked bot holds its tile for good, so the crew is terrain: go around it, or ask it to move.',
    'const who = (p) => {',
    '  for (const o of fleet) { const q = spot(o); if (q.x === p.x && q.y === p.y) return o; }',
    '  return -1;',
    '};',
    'const others = (id, dest) => {',
    '  const s = new Set();',
    '  for (const o of fleet) if (o !== id) s.add(k(spot(o)));',
    '  s.delete(k(dest));',
    '  return s;',
    '};',
    'const precious = new Set(subs.map((s) => k(s.at)));',
    'for (const at of sinks.values()) precious.add(k(at));',
    'for (const c of crates) precious.add(k(c.at));',
    '// The airlock stand is a dead end with walls on three sides, so anything that stops in its',
    '// approach corks the only bottle on the site. The approach counts as working tile too.',
    'for (let dx = -2; dx <= 2; dx++) {',
    '  for (let dy = -2; dy <= 2; dy++) {',
    '    if (Math.abs(dx) + Math.abs(dy) <= 2) {',
    '      precious.add(k({ x: airlock.at.x + dx, y: airlock.at.y + dy }));',
    '    }',
    '  }',
    '}',
    '// A queue in a one-wide passage clears from the front, so shoving is recursive.',
    'const aside = (id, depth = 0) => {',
    '  if (bot(id).fuel() <= 1) return false;',
    '  const here = spot(id);',
    '  const ok = dirs.filter((d) => open(to(here, d)));',
    '  const order = ok.filter((d) => !precious.has(k(to(here, d)))).concat(ok);',
    '  for (const d of order) if (bot(id).canMove(d)) { bot(id).move(d); return true; }',
    '  if (depth >= 2) return false;',
    '  for (const d of order) {',
    '    const other = who(to(here, d));',
    '    if (other < 0 || other === id || !aside(other, depth + 1)) continue;',
    '    if (bot(id).canMove(d)) { bot(id).move(d); return true; }',
    '  }',
    '  return false;',
    '};',
    '',
    '// Fuel is priced into the leg: never walk out further than the walk back to a pump.',
    'const pumps = () => [...seen.values()].filter((v) => v.terrain === Terrain.Depot).map((v) => v.at);',
    'const homeward = () => {',
    '  const d = new Map();',
    '  const q = pumps();',
    '  for (const p of q) d.set(k(p), 0);',
    '  for (let i = 0; i < q.length; i++) {',
    '    for (const dir of dirs) {',
    '      const n = to(q[i], dir);',
    '      if (d.has(k(n)) || !open(n)) continue;',
    '      d.set(k(n), d.get(k(q[i])) + 1);',
    '      q.push(n);',
    '    }',
    '  }',
    '  return d;',
    '};',
    'const drive = (id, path) => {',
    '  let n = 0;',
    '  for (const d of path) {',
    '    if (bot(id).fuel() <= 1) return n;',
    '    let waited = 0;',
    '    while (!bot(id).canMove(d) && waited < 3) { bot(id).wait(1); waited++; }',
    '    if (!bot(id).canMove(d)) return n;',
    '    bot(id).move(d);',
    '    look4(id);',
    '    n++;',
    '  }',
    '  return n;',
    '};',
    '// Fills at the pump nearest wherever the bot is going next, and keeps trying from wherever the',
    '// walk actually got to: a bot that gives up half way is a bot that strands itself in a passage.',
    'const fill = (id, dest) => {',
    '  for (let attempt = 0; attempt < 5; attempt++) {',
    '    if (bot(id).refuel()) return true;',
    '    const here = spot(id);',
    '    const crew = new Set();',
    '    for (const o of fleet) if (o !== id) crew.add(k(spot(o)));',
    '    let best = null;',
    '    let score = Infinity;',
    '    // Two passes: a pump the tank can reach with something in hand, and only if there is none,',
    '    // the nearest pump at all. Arriving dry is survivable; stopping dry in a passage is not.',
    '    for (const margin of [8, 1]) {',
    '      // The desperate pass only considers a way that is clear of the crew right now: a walk on',
    '      // fumes that gets interrupted half way is exactly how a bot becomes a wall.',
    '      for (const via of margin > 1 ? [flood(here, crew), flood(here, null)] : [flood(here, crew)]) {',
    '        for (const p of pumps()) {',
    '          const r = trail(via, here, p);',
    '          if (r === null || r.length + margin > bot(id).fuel()) continue;',
    '          const s = dest ? gap(p, dest) : r.length;',
    '          if (s < score) { score = s; best = r; }',
    '        }',
    '        if (best !== null) break;',
    '      }',
    '      if (best !== null) break;',
    '    }',
    '    if (best === null) return false;',
    '    if (drive(id, best) === 0) {',
    '      const blocker = who(to(here, best[0]));',
    '      if (blocker >= 0 && blocker !== id) aside(blocker);',
    '      else bot(id).wait(1);',
    '    }',
    '  }',
    '  return bot(id).refuel();',
    '};',
    'const goTo = (id, dest) => {',
    '  const back = homeward();',
    '  let stalled = 0;',
    '  for (let attempt = 0; attempt < 8; attempt++) {',
    '    const p = spot(id);',
    '    if (p.x === dest.x && p.y === dest.y) return true;',
    '    if (!open(dest)) return false;',
    '    const sitting = who(dest);',
    '    if (sitting >= 0 && sitting !== id) aside(sitting);',
    '    const r = route(p, dest, others(id, dest)) ?? route(p, dest, null);',
    '    if (r === null) return false;',
    '    // A full tank is as good as it gets: refusing the leg then would refuse it for ever.',
    '    const need = r.length + (back.get(k(dest)) ?? r.length) + 18;',
    '    if (bot(id).fuel() < need && bot(id).fuel() < tank) {',
    '      if (!fill(id, dest)) return false;',
    '      continue;',
    '    }',
    '    const walked = drive(id, r);',
    '    if (walked === r.length) return true;',
    '    if (walked > 0) { stalled = 0; continue; }',
    '    if (stalled >= 2) return false;',
    '    stalled++;',
    '    const blocker = who(to(spot(id), r[0]));',
    '    if (blocker >= 0 && blocker !== id) aside(blocker);',
    '    else bot(id).wait(2);',
    '  }',
    '  return false;',
    '};',
    'const hop = (id, dest) => {',
    '  const via = flood(spot(id), null);',
    '  const edges = [];',
    '  for (const [key, v] of seen) {',
    '    // Never stop on a working tile unless it is the one this bot is going to: a bot parked on',
    '    // a pad, a station or the airlock approach is a wall there for the rest of the shift.',
    '    if (!v.walkable || !via.has(key) || key === k(spot(id))) continue;',
    '    if (precious.has(key) && gap(v.at, dest) > 2) continue;',
    '    if (!dirs.some((d) => !seen.has(k(to(v.at, d))))) continue;',
    '    edges.push({ at: v.at, s: gap(spot(id), v.at) + gap(v.at, dest) });',
    '  }',
    '  edges.sort((a, b) => a.s - b.s);',
    '  for (const e of edges.slice(0, 5)) if (goTo(id, e.at)) return true;',
    '  return false;',
    '};',
    '// Ground the fleet has seen is a routing problem; ground it has not is a survey problem, and',
    '// only the second one is worth walking away from the destination for.',
    'const reach = (id, dest) => {',
    '  if (bot(id).fuel() < tank * 0.3) fill(id, dest);',
    '  for (let attempt = 0; attempt < 20; attempt++) {',
    '    if (attempt > 0) sync();',
    '    if (goTo(id, dest)) return true;',
    '    if (route(spot(id), dest, null) !== null) continue;',
    '    if (!hop(id, dest)) return fill(id, dest) && goTo(id, dest);',
    '  }',
    '  return false;',
    '};',
    'const ready = (id) => {',
    '  if (bot(id).fuel() > 20) return true;',
    '  fill(id, null);',
    '  return bot(id).fuel() > 1;',
    '};',
    '',
    '// Nobody walks the workings alone: spread out until every coordinate is joined to the bay.',
    'for (const id of fleet) look4(id);',
    'const marks = subs.map((s) => s.at).concat([...sinks.values()], crates.map((c) => c.at));',
    'if (form) marks.push(form);',
    'let quiet = 0;',
    'for (let round = 0; round < 90 && quiet < 4; round++) {',
    '  const via = flood(spot(fleet[0]), null);',
    '  const missing = marks.filter((at) => !via.has(k(at)));',
    '  if (missing.length === 0) break;',
    '  sync();',
    '  const claimed = new Set();',
    '  let moved = false;',
    '  for (const id of fleet) {',
    '    let want = missing[0];',
    '    let nearest = Infinity;',
    '    for (const at of missing) {',
    '      if (claimed.has(k(at))) continue;',
    '      const g = gap(spot(id), at);',
    '      if (g < nearest) { nearest = g; want = at; }',
    '    }',
    '    claimed.add(k(want));',
    '    if (hop(id, want)) moved = true;',
    '  }',
    '  quiet = moved ? 0 : quiet + 1;',
    '}',
    'sync();',
    'for (const id of fleet) fill(id, null);',
    'for (const id of fleet) if (precious.has(k(spot(id)))) aside(id);',
    '',
    'const electrician = fleet[0];',
    'const clerk = fleet.length > 1 ? fleet[1] : electrician;',
    'const haulers = fleet.length > 2 ? fleet.slice(2) : fleet;',
    '',
    '// Ranked by depth, then walked on one clock: precedence comes out true by construction.',
    'const rank = new Map();',
    'const byId = new Map(subs.map((s) => [s.id, s]));',
    'const depth = (s, guard) => {',
    '  if (rank.has(s.id)) return rank.get(s.id);',
    '  if (guard > subs.length) return 0;',
    '  let deep = 0;',
    '  for (const d of s.deps) {',
    '    const f = byId.get(d);',
    '    if (f) deep = Math.max(deep, depth(f, guard + 1) + 1);',
    '  }',
    '  rank.set(s.id, deep);',
    '  return deep;',
    '};',
    'const ranks = [];',
    'for (const s of subs) {',
    '  const d = depth(s, 0);',
    '  while (ranks.length <= d) ranks.push([]);',
    '  ranks[d].push(s);',
    '}',
    '',
    '// A station is thrown by whoever is nearest and can still get there. The cycle wraps, so a',
    '// station that is already on is left alone: using it twice would turn it back off.',
    'const light = (s) => {',
    "  if (probe(s.id).state === 'on') return true;",
    '  const order = fleet.slice().sort((a, b) => gap(spot(a), s.at) - gap(spot(b), s.at));',
    '  for (const id of order) {',
    '    if (!ready(id) || !reach(id, s.at)) continue;',
    '    bot(id).use();',
    "    if (probe(s.id).state === 'on') return true;",
    '  }',
    '  return false;',
    '};',
    '',
    '// The toll at the airlock is the same size whoever pays it, so it is paid once, by whoever',
    '// was going that way. One step of the errand per pass, alongside everything else.',
    'let carrier = clerk;',
    'let stage = 0;',
    'let fumbled = 0;',
    'let tries = 0;',
    'const errand = () => {',
    '  if (!form || stage >= 3 || tries >= 40) return false;',
    '  tries++;',
    '  if (stage === 0) {',
    '    // Whoever is nearest with a tank worth the trip, not whoever is next in the list.',
    '    let score = Infinity;',
    '    for (const id of fleet) {',
    '      if (id === electrician) continue;',
    '      const s = gap(spot(id), form) - bot(id).fuel();',
    '      if (bot(id).fuel() > 30 && s < score) { score = s; carrier = id; }',
    '    }',
    '    if (reach(carrier, form) && ready(carrier)) {',
    '      bot(carrier).pickup(ItemKind.Chip);',
    '      stage = 1;',
    '      fumbled = 0;',
    '    }',
    '    return true;',
    '  }',
    '  const target = stage === 1 ? airlock.at : charter.at;',
    '  const sitting = who(target);',
    '  if (sitting >= 0 && sitting !== carrier) { aside(sitting); sync(); }',
    '  if (reach(carrier, target) && ready(carrier)) {',
    '    if (stage === 1) {',
    '      for (let i = 0; i <= airlock.vars.stages && bot(carrier).fuel() > 1; i++) {',
    "        if (bot(carrier).probe('airlock').state === 'open') break;",
    '        bot(carrier).use();',
    '      }',
    '      look4(carrier);',
    '    } else {',
    '      bot(carrier).drop(ItemKind.Chip);',
    '    }',
    '    stage++;',
    '    fumbled = 0;',
    '    return true;',
    '  }',
    '  if (++fumbled >= 3 && bot(carrier).fuel() > 1) {',
    '    bot(carrier).drop(ItemKind.Chip);',
    '    form = spot(carrier);',
    '    aside(carrier);',
    '    stage = 0;',
    '    fumbled = 0;',
    '  }',
    '  return true;',
    '};',
    'for (let i = 0; i < 8 && stage < 3; i++) errand();',
    '',
    '// Three streams interleaved: a bot standing still is a wall to everybody else.',
    'const todo = crates.slice();',
    'const working = haulers.slice();',
    'const strikes = new Map();',
    'let grid = 0;',
    'let refills = 8;',
    'let gridTries = 0;',
    'for (let guard = 0; guard < 800; guard++) {',
    '  if (guard % 3 === 0) sync();',
    '  // A bot that runs dry in a passage is a wall for the rest of the shift, so nobody is allowed',
    '  // to get that low: top up whoever is close to it before handing anybody the next job.',
    '',
    '  let acted = false;',
    '',
    '  if (grid < ranks.length) {',
    '    // One rank at a time, with a sync either side of it: everything this rank feeds off has',
    '    // finished before any of it starts, whichever bot happens to throw which switch.',
    '    sync();',
    '    let whole = true;',
    '    for (const s of ranks[grid]) if (!light(s)) whole = false;',
    '    sync();',
    '    if (whole || ++gridTries >= 3) { grid++; gridTries = 0; }',
    '    acted = true;',
    '  }',
    '',
    '  if (errand()) acted = true;',
    '',
    '  if (todo.length > 0 && working.length === 0 && refills > 0) {',
    '    refills--;',
    '    strikes.clear();',
    '    working.push(...haulers);',
    '  }',
    '',
    '  if (todo.length > 0 && working.length > 0) {',
    '    let pick = working[0];',
    '    let earliest = Infinity;',
    '    for (const id of working) {',
    '      if (bot(id).clock() < earliest) { earliest = bot(id).clock(); pick = id; }',
    '    }',
    '    let choice = 0;',
    '    let nearest = Infinity;',
    '    todo.forEach((c, i) => {',
    '      const g = gap(spot(pick), c.at);',
    '      if (g < nearest) { nearest = g; choice = i; }',
    '    });',
    '    const crate = todo.splice(choice, 1)[0];',
    '    const sink = sinks.get(crate.kind);',
    '    const fumble = () => {',
    '      const missed = (strikes.get(pick) ?? 0) + 1;',
    '      strikes.set(pick, missed);',
    '      if (missed >= 4) working.splice(working.indexOf(pick), 1);',
    '      fill(pick, null);',
    '    };',
    '    if (!sink) {',
    '      // nothing to do with it',
    '    } else if (!reach(pick, crate.at) || !ready(pick)) {',
    '      todo.push(crate);',
    '      fumble();',
    '    } else {',
    '      bot(pick).pickup(crate.kind);',
    '      if (reach(pick, sink) && ready(pick)) {',
    '        bot(pick).drop(crate.kind);',
    '        aside(pick);',
    '        strikes.set(pick, 0);',
    '      } else if (bot(pick).fuel() > 1) {',
    '        bot(pick).drop(crate.kind);',
    '        todo.push({ at: spot(pick), kind: crate.kind });',
    '        fumble();',
    '      } else {',
    '        fumble();',
    '      }',
    '    }',
    '    acted = true;',
    '  }',
    '',
    '  if (!acted) break;',
    '}',
    '',
    '// Last sweeps: anything still owed is offered to the whole fleet, one bot at a time.',
    'let stubborn = 0;',
    'while (grid < ranks.length && stubborn < 4) {',
    '  sync();',
    '  let whole = true;',
    '  for (const s of ranks[grid]) {',
    '    let lit = false;',
    '    for (const id of fleet) {',
    '      if (!reach(id, s.at) || !ready(id)) continue;',
    '      bot(id).use();',
    '      lit = true;',
    '      break;',
    '    }',
    '    if (!lit) whole = false;',
    '  }',
    '  sync();',
    '  if (whole) { grid++; stubborn = 0; } else stubborn++;',
    '}',
    '',
    'const pads = [...sinks.values()];',
    'for (let round = 0; round < 4; round++) {',
    '  sync();',
    '  const loose = [...seen.values()]',
    '    .filter((v) => v.items.length > 0 && !pads.some((p) => p.x === v.at.x && p.y === v.at.y))',
    '    .map((v) => v.at);',
    '  if (loose.length === 0) break;',
    '  let shifted = false;',
    '  for (const at of loose) {',
    '    for (const id of fleet) {',
    '      if (!reach(id, at) || !ready(id)) continue;',
    '      const here = bot(id).scan();',
    '      seen.set(k(here.at), here);',
    '      const stack = here.items[0];',
    '      if (!stack) break;',
    '      const sink = sinks.get(stack.kind);',
    '      if (!sink) break;',
    '      bot(id).pickup(stack.kind);',
    '      if (reach(id, sink) && ready(id)) {',
    '        bot(id).drop(stack.kind);',
    '        aside(id);',
    '        shifted = true;',
    '      } else if (bot(id).fuel() > 1) {',
    '        bot(id).drop(stack.kind);',
    '      }',
    '      break;',
    '    }',
    '  }',
    '  if (!shifted) break;',
    '}',
  ].join('\n'),
};
