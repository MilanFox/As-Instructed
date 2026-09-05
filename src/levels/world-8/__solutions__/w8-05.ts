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
 * anybody start work. After that, one bot walks the grid in dependency order — which makes
 * precedence true by construction instead of by scheduling — one bot takes the form out through
 * the airlock, because the toll is the same size whoever pays it, and everybody else hauls.
 *
 * Fuel is priced into every leg rather than checked when it runs out: a bot only takes a route
 * it can also come back from, and tops up at the depot nearest wherever it is going next.
 *
 * Deliberately not the fastest shape available. A player who splits the grid across several
 * electricians, batches crates by class into a six-slot hold, and sends the clerk out with a
 * hauler's load will beat it, which is where the twenty-percent bonus lives.
 */

const WIDTH = 48;
const HEIGHT = 40;
/** Spare ticks of fuel kept in hand on top of the trip home. */
const RESERVE = 10;

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

    // ---- fuel ------------------------------------------------------------
    /** Hop count from the nearest known refuelling tile to everywhere seen. Cached per map size. */
    let fieldAt = -1;
    let field = new Map<number, number>();
    const depotField = (): Map<number, number> => {
      if (fieldAt === map.size()) return field;
      const out = new Map<number, number>();
      const queue: Vec[] = [];
      for (const view of map.where((tile) => tile.terrain === Terrain.Depot)) {
        out.set(index(view.at), 0);
        queue.push(view.at);
      }
      for (let head = 0; head < queue.length; head++) {
        const at = queue[head] as Vec;
        const base = out.get(index(at)) ?? 0;
        for (const dir of ALL_DIRS) {
          const next = step(at, dir);
          if (!map.passable(next) || out.has(index(next))) continue;
          out.set(index(next), base + 1);
          queue.push(next);
        }
      }
      field = out;
      fieldAt = map.size();
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
     * A route that goes around wherever the rest of the fleet is standing right now. A bot that
     * has stopped holds its tile indefinitely, so treating the crew as terrain and re-planning
     * beats queuing behind them.
     */
    const planPath = (id: number, to: Vec): Dir[] | null => {
      const taken = new Set<number>();
      for (const other of fleet) {
        if (other !== id) taken.add(index(sim.pos(other)));
      }
      taken.delete(index(to));
      const around = pathOn(
        map,
        (at) => map.passable(at) && !taken.has(index(at)),
        sim.pos(id),
        to,
      );
      return around ?? map.pathTo(sim.pos(id), to);
    };

    /**
     * Fills up at the pump *nearest the destination* that the tank can still reach — not the one
     * nearest the bot. Which pump you use is the whole of the fuel decision: the cheapest round
     * trip to anywhere is out from its closest pump and back to the same one.
     */
    const refuel = (id: number, to: Vec | null): boolean => {
      if (!Number.isFinite(sim.fuel(id))) return true;
      if (sim.refuel(id)) return true;
      const from = sim.pos(id);
      const out = distancesOn(map, passable, from);
      const toward = to === null ? null : distancesOn(map, passable, to);
      const tank = sim.fuel(id);
      let stop: Vec | null = null;
      let best = Number.POSITIVE_INFINITY;
      for (const view of map.where((tile) => tile.terrain === Terrain.Depot)) {
        const there = out.get(index(view.at));
        if (there === undefined || there + 1 >= tank) continue;
        const score = toward === null ? there : (toward.get(index(view.at)) ?? there + WIDTH);
        if (score >= best) continue;
        best = score;
        stop = view.at;
      }
      if (!stop) return false;
      const path = planPath(id, stop);
      if (path === null || drive(id, path) < path.length) return false;
      return sim.refuel(id);
    };

    /** True when the bot could walk this leg and still have a way back to a pump afterwards. */
    const affordable = (id: number, to: Vec, length: number): boolean => {
      const tank = sim.fuel(id);
      if (!Number.isFinite(tank)) return true;
      const home = depotField().get(index(to));
      return tank >= length + (home ?? length) + RESERVE;
    };

    /** Walks to a place already on the map, filling up first when the return trip needs it. */
    const goTo = (id: number, to: Vec): boolean => {
      let stalled = 0;
      for (let attempt = 0; attempt < 24; attempt++) {
        const at = sim.pos(id);
        if (at.x === to.x && at.y === to.y) return true;
        if (!map.passable(to)) return false;
        // A crate under a bot that has finished for the day is a crate nobody can ever reach.
        // The fleet is ours, so the answer is to ask it to shift rather than to give up.
        const sitting = occupant(to);
        if (sitting !== null && sitting !== id) {
          standAside(sitting);
          if (occupant(to) === sitting) {
            sim.sync();
            standAside(sitting);
          }
        }
        const path = planPath(id, to);
        if (path === null) return false;
        if (!affordable(id, to, path.length)) {
          if (!refuel(id, to)) return false;
          continue;
        }
        const walked = drive(id, path);
        if (walked > 0) {
          stalled = 0;
          continue;
        }
        if (stalled >= 2) return false;
        stalled++;
        const blocking = occupant(step(sim.pos(id), path[0] as Dir));
        if (blocking !== null && blocking !== id) standAside(blocking);
        else sim.wait(id, 2);
      }
      return false;
    };

    /** One step out to the edge of the known map, chosen for being on the way to `to`. */
    const hop = (id: number, to: Vec): boolean => {
      const from = sim.pos(id);
      const out = distancesOn(map, passable, from);
      const edges: { at: Vec; score: number }[] = [];
      for (const view of map.where((tile) => map.isFrontier(tile.at))) {
        const there = out.get(index(view.at));
        if (there === undefined || there === 0) continue;
        edges.push({ at: view.at, score: there + manhattan(view.at, to) });
      }
      edges.sort((a, b) => a.score - b.score);
      // The best edge is often the one somebody else is already standing on. Try a few.
      for (const edge of edges.slice(0, 5)) {
        if (key(edge.at) !== key(from) && goTo(id, edge.at)) return true;
      }
      return false;
    };

    /** `goTo`, but willing to buy more map when the ground between is still unseen. */
    const reach = (id: number, to: Vec): boolean => {
      // Somewhere already on the map is a routing problem and a short one. Somewhere the fleet
      // has never seen is a survey problem, and worth more patience.
      const patience = map.passable(to) ? 6 : 25;
      // Top up on the way past rather than on the way back. The pumps are dense enough on this
      // site that a half-empty cell is never worth the risk of a bot stopping in a tunnel.
      const tank = sim.fuel(id);
      if (Number.isFinite(tank) && tank < sim.fuelMax(id) * 0.3) refuel(id, to);
      for (let attempt = 0; attempt < patience; attempt++) {
        // Falling behind is itself a reason a route fails, so catch the fleet up before deciding
        // the ground is impassable.
        if (attempt > 0) sim.sync();
        if (goTo(id, to)) return true;
        if (!hop(id, to)) return refuel(id, to) && goTo(id, to);
      }
      return false;
    };

    /** A bot needs something in the tank to work when it arrives, not merely to get there. */
    const ready = (id: number): boolean => {
      if (sim.fuel(id) > 15) return true;
      refuel(id, null);
      return sim.fuel(id) > 1;
    };

    const occupant = (at: Vec): number | null => {
      for (const other of fleet) {
        const where = sim.pos(other);
        if (where.x === at.x && where.y === at.y) return other;
      }
      return null;
    };

    /**
     * A bot that has stopped holds its tile for good, so nobody parks on a working tile — and
     * "working tile" includes every crate, pad, station and pump on the site, not just the one
     * it happens to be standing on.
     */
    const precious = new Set<number>();
    const standAside = (id: number): void => {
      if (sim.fuel(id) <= 1) return;
      const from = sim.pos(id);
      const options = ALL_DIRS.filter((dir) => map.passable(step(from, dir)));
      const clear = options.filter((dir) => !precious.has(index(step(from, dir))));
      for (const dir of clear.concat(options)) {
        if (!sim.canMove(id, dir)) continue;
        sim.move(id, dir);
        return;
      }
    };

    for (const station of stations) precious.add(index(station.at));
    for (const at of sinks.values()) precious.add(index(at));
    for (const crate of crates) precious.add(index(crate.at));
    if (airlock) precious.add(index(airlock.at));

    // ---- survey, with everybody -----------------------------------------
    const marks: Vec[] = [
      ...stations.map((station) => station.at),
      ...sinks.values(),
      ...crates.map((crate) => crate.at),
    ];
    if (form) marks.push(form);
    if (airlock) marks.push(airlock.at);

    let stalledRounds = 0;
    for (let round = 0; round < 90 && stalledRounds < 4; round++) {
      const known = distancesOn(map, passable, sim.pos(anyBot));
      const missing = marks.filter((at) => !known.has(index(at)));
      if (missing.length === 0) break;
      sim.sync();
      const claimed = new Set<string>();
      let moved = false;
      for (const id of fleet) {
        const from = sim.pos(id);
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

    // Nobody spends the shift parked on a crate, a pad, a station or the airlock stand. A bot
    // that stopped somewhere useful during the survey is a bot in everybody else's way.
    sim.sync();
    for (const id of fleet) {
      if (precious.has(index(sim.pos(id)))) standAside(id);
    }

    // ---- roles -----------------------------------------------------------
    const electrician = fleet[0] as number;
    const clerk = fleet.length > 1 ? (fleet[1] as number) : electrician;
    const haulers = fleet.length > 2 ? fleet.slice(2) : fleet;

    // Ranked by how deep into the graph each station sits, then walked on one clock. A single
    // bot working in rank order cannot start a station before its feeders finished, because it
    // was the thing that finished them — precedence comes out true without anybody scheduling
    // it. Splitting the ranks across several bots is faster and is where the bonus lives.
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

    const outstanding = crates.slice();
    const working = haulers.slice();
    const strikes = new Map<number, number>();
    let grid = 0;
    let refills = 8;
    let gridTries = 0;
    // The form is one bot's errand, taken a step at a time alongside everything else. The toll
    // at the airlock is the same size whoever pays it and whenever it is paid, so it is paid
    // once, by whoever was going that way.
    let carrier = clerk;
    let stage = 0;
    let fumbled = 0;
    let errandTries = 0;

    /** One step of the form's journey. Returns false once it is filed or hopeless. */
    const errandStep = (): boolean => {
      if (!form || !airlock || !charter || stage >= 3 || errandTries >= 40) return false;
      errandTries++;
      if (stage === 0) {
        carrier = fleet[errandTries % fleet.length] as number;
        if (reach(carrier, form) && ready(carrier)) {
          sim.pickup(carrier, ItemKind.Chip);
          stage = 1;
          fumbled = 0;
        }
        return true;
      }
      const target = stage === 1 ? airlock.at : charter.at;
      const sitting = occupant(target);
      if (sitting !== null && sitting !== carrier) {
        standAside(sitting);
        sim.sync();
      }
      if (reach(carrier, target) && ready(carrier)) {
        if (stage === 1) {
          // The cycle wraps, so a second bot working the lever would shut the gates again.
          // Ask the door what state it is in rather than counting on having been first.
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
        form = sim.pos(carrier);
        standAside(carrier);
        stage = 0;
        fumbled = 0;
      }
      return true;
    };

    // The tunnels are never emptier than they are right now, and the airlock stand is one tile
    // wide. Get the form moving before the hauling starts.
    for (let i = 0; i < 8 && stage < 3; i++) errandStep();

    // The three streams run interleaved rather than one after another. A bot standing still is a
    // wall to everybody else, so the cheapest way to keep the site passable is to keep the whole
    // fleet in motion at once.
    for (let guard = 0; guard < 800; guard++) {
      // Pull the fleet back onto one clock every few passes. A bot holds a tile from the moment
      // it arrives until its next move completes, so a bot a long way behind in virtual time
      // cannot walk through ground the rest of the crew was standing on at that moment — the
      // site turns into other people's history. Syncing every pass would fix that and hand the
      // whole fleet the slowest bot's clock, which is the thing being scored.
      if (guard % 3 === 0) sim.sync();
      let acted = false;

      if (grid < ranks.length) {
        const group = ranks[grid] as Station[];
        let whole = true;
        for (const station of group) {
          if (reach(electrician, station.at) && ready(electrician)) sim.use(electrician);
          else whole = false;
        }
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
        const from = sim.pos(pick);
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
            // Three failed errands and the bot is boxed in or dry for good. Until then it is
            // just unlucky, and the crate goes back on the board for somebody else.
            if (missed >= 4) working.splice(working.indexOf(pick), 1);
            refuel(pick, null);
          };
          if (!reach(pick, crate.at)) {
            outstanding.push(crate);
            fumble();
          } else {
            if (!ready(pick)) {
              outstanding.push(crate);
              fumble();
            } else {
              sim.pickup(pick, crate.kind as ItemKind);
              if (reach(pick, sink) && ready(pick)) {
                sim.drop(pick, crate.kind as ItemKind);
                standAside(pick);
                strikes.set(pick, 0);
              } else if (sim.fuel(pick) > 1) {
                // Never end a shift holding a crate. Put it down where the bot got stuck and
                // book it back onto the board at its new address.
                sim.drop(pick, crate.kind as ItemKind);
                outstanding.push({ at: sim.pos(pick), kind: crate.kind });
                fumble();
              } else {
                fumble();
              }
            }
          }
        }
        acted = true;
      }

      if (!acted) break;
    }

    // Last sweep. Anything still on the board gets offered to the whole fleet, one bot at a time,
    // because at this point the only thing left to optimise is whether the job is finished.
    // Stations are still taken in dependency order — the audit compares start times against
    // finish times, and skipping one to come back later is what makes that comparison fail.
    let stubborn = 0;
    while (grid < ranks.length && stubborn < 4) {
      sim.sync();
      const group = ranks[grid] as Station[];
      let whole = true;
      for (const station of group) {
        let lit = false;
        for (const id of fleet) {
          if (!reach(id, station.at) || !ready(id)) continue;
          sim.use(id);
          lit = true;
          break;
        }
        if (!lit) whole = false;
      }
      sim.sync();
      if (whole) {
        grid++;
        stubborn = 0;
      } else {
        stubborn++;
      }
    }

    // Last sweep, run off the map rather than off the plan: anything the fleet has seen lying
    // on the ground that is not already on a pad is a crate somebody dropped or never reached.
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
            standAside(id);
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
    'const raw = [];',
    'for (let p = receive(); p !== null; p = receive()) raw.push(p);',
    'const sum = (t) => {',
    '  let n = 0;',
    '  for (const c of t) n += c.charCodeAt(0);',
    '  return n % 1000;',
    '};',
    'const holds = (t) => {',
    "  const parts = t.split('|');",
    "  const body = parts.slice(0, -1).join('|');",
    "  if (parts.length < 3 || parts[0] !== 'KD4470') return null;",
    '  return String(sum(body)) === parts[parts.length - 1] ? parts.slice(1, -1) : null;',
    '};',
    'let key = 0;',
    'let most = -1;',
    'for (let c = 0; c < 95; c++) {',
    '  const n = raw.filter((p) => holds(decode(p, c))).length;',
    '  if (n > most) { most = n; key = c; }',
    '}',
    'const crates = [];',
    'let form = null;',
    'for (const p of raw) {',
    '  const f = holds(decode(p, key));',
    '  if (!f) continue;',
    '  const at = { x: Number(f[1]), y: Number(f[2]) };',
    "  if (f[0] === 'CRATE') crates.push({ at, kind: f[3] });",
    "  else if (f[0] === 'FORM') form = at;",
    '}',
    'const desk = probe("desk");',
    'const stations = [];',
    'for (let i = 0; i < desk.vars.stations; i++) {',
    '  const v = probe(`sub-${i}`);',
    '  const deps = [];',
    '  for (let n = 0; n < v.vars.deps; n++) deps.push(`sub-${v.vars["dep" + n]}`);',
    '  stations.push({ id: v.id, at: v.at, deps });',
    '}',
    'const sinks = new Map();',
    "for (const kind of ['ore', 'ice', 'scrap', 'part', 'cell']) {",
    '  const v = probe(`depot-${kind}`);',
    '  if (v) sinks.set(kind, v.at);',
    '}',
    'const airlock = probe("airlock");',
    'const charter = probe("slot-charter");',
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
    'const look4 = (id) => {',
    '  seen.set(k(bot(id).pos()), bot(id).scan());',
    '  for (const d of dirs) for (const v of bot(id).look(d, 48)) seen.set(k(v.at), v);',
    '};',
    'const flood = (from) => {',
    '  const via = new Map([[k(from), null]]);',
    '  const q = [from];',
    '  for (let i = 0; i < q.length; i++) {',
    '    for (const d of dirs) {',
    '      const n = to(q[i], d);',
    '      if (via.has(k(n)) || !open(n)) continue;',
    '      via.set(k(n), { at: q[i], dir: d });',
    '      q.push(n);',
    '    }',
    '  }',
    '  return via;',
    '};',
    'const route = (from, dest) => {',
    '  const via = flood(from);',
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
    'const pumps = () => [...seen.values()].filter((v) => v.terrain === Terrain.Depot);',
    '// Distance from the nearest pump to everywhere: the price of every leg is the trip back.',
    'const homeward = () => {',
    '  const d = new Map();',
    '  const q = pumps().map((v) => v.at);',
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
    '  for (const d of path) {',
    '    if (bot(id).fuel() <= 1) return false;',
    '    let waited = 0;',
    '    while (!bot(id).canMove(d) && waited < 4) { bot(id).wait(1); waited++; }',
    '    if (!bot(id).canMove(d)) return false;',
    '    bot(id).move(d);',
    '    look4(id);',
    '  }',
    '  return true;',
    '};',
    'const fill = (id, dest) => {',
    '  if (bot(id).refuel()) return true;',
    '  let best = null;',
    '  let score = Infinity;',
    '  for (const v of pumps()) {',
    '    const r = route(bot(id).pos(), v.at);',
    '    if (!r || r.length + 1 >= bot(id).fuel()) continue;',
    '    const s = r.length + (dest ? gap(v.at, dest) : 0);',
    '    if (s < score) { score = s; best = r; }',
    '  }',
    '  return best !== null && drive(id, best) && bot(id).refuel();',
    '};',
    'const goTo = (id, dest) => {',
    '  const back = homeward();',
    '  for (let attempt = 0; attempt < 4; attempt++) {',
    '    const at = bot(id).pos();',
    '    if (at.x === dest.x && at.y === dest.y) return true;',
    '    const r = route(at, dest);',
    '    if (!r) return false;',
    '    if (bot(id).fuel() >= r.length + (back.get(k(dest)) ?? r.length) + 4) return drive(id, r);',
    '    if (!fill(id, dest)) return false;',
    '  }',
    '  return false;',
    '};',
    'const hop = (id, dest) => {',
    '  const via = flood(bot(id).pos());',
    '  let edge = null;',
    '  let score = Infinity;',
    '  for (const [id2, v] of seen) {',
    '    if (!v.walkable || !via.has(id2) || !dirs.some((d) => !seen.has(k(to(v.at, d))))) continue;',
    '    const s = gap(bot(id).pos(), v.at) + gap(v.at, dest);',
    '    if (s > 0 && s < score) { score = s; edge = v.at; }',
    '  }',
    '  return edge !== null && goTo(id, edge);',
    '};',
    'const reach = (id, dest) => {',
    '  for (let attempt = 0; attempt < 40; attempt++) {',
    '    if (goTo(id, dest)) return true;',
    '    if (!hop(id, dest)) return fill(id, dest) && goTo(id, dest);',
    '  }',
    '  return false;',
    '};',
    'const aside = (id) => {',
    '  for (const d of dirs) {',
    '    if (open(to(bot(id).pos(), d)) && bot(id).canMove(d)) { bot(id).move(d); return; }',
    '  }',
    '};',
    '',
    '// Nobody walks the workings alone. Spread out until every coordinate is joined to the bay.',
    'for (const id of fleet) look4(id);',
    'const marks = stations.map((s) => s.at).concat([...sinks.values()], crates.map((c) => c.at));',
    'marks.push(form, airlock.at);',
    'for (let round = 0; round < 60; round++) {',
    '  const via = flood(bot(fleet[0]).pos());',
    '  const missing = marks.filter((at) => !via.has(k(at)));',
    '  if (missing.length === 0) break;',
    '  const claimed = new Set();',
    '  let moved = false;',
    '  for (const id of fleet) {',
    '    let want = missing[0];',
    '    let nearest = Infinity;',
    '    for (const at of missing) {',
    '      if (claimed.has(k(at))) continue;',
    '      if (gap(bot(id).pos(), at) < nearest) { nearest = gap(bot(id).pos(), at); want = at; }',
    '    }',
    '    claimed.add(k(want));',
    '    if (hop(id, want)) moved = true;',
    '  }',
    '  if (!moved) break;',
    '}',
    'for (const id of fleet) fill(id, null);',
    '',
    'const electrician = fleet[0];',
    'const clerk = fleet[1];',
    'const haulers = fleet.slice(2);',
    '// One clock walks the grid, so precedence is true by construction.',
    'const done = new Set();',
    'const queue = stations.slice();',
    'while (queue.length > 0) {',
    '  const i = queue.findIndex((s) => s.deps.every((d) => done.has(d)));',
    '  if (i < 0) break;',
    '  const station = queue.splice(i, 1)[0];',
    '  if (reach(electrician, station.at)) bot(electrician).use();',
    '  done.add(station.id);',
    '}',
    'aside(electrician);',
    '',
    '// The toll at the airlock is the same size whoever pays it, so one bot pays it.',
    'if (reach(clerk, form)) bot(clerk).pickup(ItemKind.Chip);',
    'if (reach(clerk, airlock.at)) {',
    '  for (let i = 0; i < airlock.vars.stages; i++) bot(clerk).use();',
    '  look4(clerk);',
    '  reach(clerk, charter.at);',
    '  bot(clerk).drop(ItemKind.Chip);',
    '}',
    '',
    'const outstanding = crates.slice();',
    'const working = haulers.slice();',
    'while (outstanding.length > 0 && working.length > 0) {',
    '  let pick = working[0];',
    '  let earliest = Infinity;',
    '  for (const id of working) {',
    '    if (bot(id).clock() < earliest) { earliest = bot(id).clock(); pick = id; }',
    '  }',
    '  let choice = 0;',
    '  let nearest = Infinity;',
    '  outstanding.forEach((c, i) => {',
    '    const g = gap(bot(pick).pos(), c.at);',
    '    if (g < nearest) { nearest = g; choice = i; }',
    '  });',
    '  const crate = outstanding.splice(choice, 1)[0];',
    '  if (!reach(pick, crate.at)) {',
    '    outstanding.push(crate);',
    '    working.splice(working.indexOf(pick), 1);',
    '    continue;',
    '  }',
    '  bot(pick).pickup(crate.kind);',
    '  if (!reach(pick, sinks.get(crate.kind))) {',
    '    working.splice(working.indexOf(pick), 1);',
    '    continue;',
    '  }',
    '  bot(pick).drop(crate.kind);',
    '  aside(pick);',
    '}',
  ].join('\n'),
};