/**
 * THE LEGEND — what the words on this board mean, for the board actually in front of the player.
 *
 * Nothing in the game named a terrain, an item kind or a machine kind. A player meeting a `depot`
 * tile for the first time in `w4-04` had exactly one way to learn the word `depot`: put the pointer
 * on it and read the strip. DESIGN.md §11.7 says in terms that a form on the board is a leg a
 * mechanic ships on, and that hover alone is not it — `refuel()` only works while standing on a
 * depot, and a player who cannot name the tile cannot look the command up either.
 *
 * Two rules shape what is below, and they are the reason this is a table and not prose:
 *
 * 1. **It is built by scanning the level's own world, never authored per level.** A legend that
 *    listed the whole vocabulary would teach `conveyor` and `furnace`, which no level places, and
 *    would say nothing about which of the fourteen terrains are the three on this screen. Scanning
 *    also means it cannot fall behind a level that adds a terrain.
 * 2. **Every mechanical clause is derived from `TERRAIN_PROPS`, not written here.** "blocks
 *    movement", "mine it for stone", "a bot that stops here dies" are read out of the same table
 *    the simulator obeys, so the manual cannot come to disagree with the sim. Only the identity
 *    sentence — what the thing *is* — is copy, and it lives in this file because `src/ui/` owns all
 *    shipped player-facing copy (DESIGN.md §9).
 *
 * The names are the API's own spellings on purpose. `terrain` on a `TileView`, `kind` on a stack
 * and `kind` on a `probe()` result all hand back these exact strings, and the hover readout prints
 * them too, so the word in the manual is the word a program compares against.
 */
import type { World } from '../../../engine/index.ts';
import { ItemKind, MachineKind, TERRAIN_PROPS, Terrain } from '../../../engine/index.ts';

/** One named thing the player can meet on this board. */
export interface LegendRow {
  /** The API's spelling, which is also the hover readout's and the manual's. */
  name: string;
  /** What it is. The only authored sentence on the row. */
  what: string;
  /**
   * The mechanical clauses, derived rather than written — terrain traits from `TERRAIN_PROPS`, a
   * machine's states from the board. Empty where there is nothing mechanical to add.
   */
  traits: string[];
  /**
   * How many are on the board at the start of the shift. `null` where a count would mislead: an
   * item the board has not produced yet, or a terrain a mine will make more of.
   */
  count: number | null;
}

export interface LegendSection {
  id: string;
  title: string;
  rows: LegendRow[];
}

/**
 * What each terrain is, with the mechanics left out.
 *
 * The sentences are lifted from the engine's own doc comments wherever one exists, because that is
 * the definition the sim was written against and a second wording is a second claim. `floor`,
 * `wall` and `ice` had none and are new here.
 */
const TERRAIN_IS: Record<Terrain, string> = {
  [Terrain.Void]: 'Outside the playable area.',
  [Terrain.Floor]: 'Bare decking. The default surface, and it does nothing else.',
  [Terrain.Wall]: 'Structure. The site was built around it.',
  [Terrain.Pad]: 'A marked spot. What an objective usually counts.',
  [Terrain.Regolith]: 'Loose dust — the ground rock this whole moon is made of.',
  [Terrain.Soil]: 'Farmable ground. The only thing `plant()` accepts.',
  [Terrain.Rock]: 'Solid stone.',
  [Terrain.Ore]: 'An ore vein.',
  [Terrain.Rubble]: 'Collapsed rock. Cheaper to cut than the stone it came from.',
  [Terrain.Ice]: 'Frozen ground.',
  [Terrain.Pit]: 'An open shaft. Nothing stops a bot walking into one.',
  [Terrain.Cable]: 'Power run.',
  [Terrain.Depot]: 'Fuel depot. The only tile `refuel()` succeeds on.',
  [Terrain.Conveyor]: 'Item transport.',
};

/** What each item kind is. There is no props table for items, so all of this is copy. */
const ITEM_IS: Record<ItemKind, string> = {
  [ItemKind.Regolith]: 'Dust, cut out of regolith ground.',
  [ItemKind.Stone]: 'Rock, cut out of a stone face.',
  [ItemKind.Ore]: 'Raw ore, cut out of a vein.',
  [ItemKind.Ice]: 'Water ice.',
  [ItemKind.Scrap]: 'Salvage, pulled out of rubble.',
  [ItemKind.Seed]: 'Plant it on soil.',
  [ItemKind.Crop]: 'What a ripe plant is harvested into.',
  [ItemKind.Crate]: 'A shipping crate.',
  [ItemKind.Part]: 'A machine part.',
  [ItemKind.Cell]: 'A power cell.',
  [ItemKind.Chip]: 'A control chip.',
};

/**
 * What each machine kind is.
 *
 * Deliberately says what the machine is and not what any particular one of them will do — a
 * machine's behaviour is its level's business, and `probe()` is how a program asks. The states it
 * can be in are read off the board instead.
 */
const MACHINE_IS: Record<MachineKind, string> = {
  [MachineKind.Door]: 'A way through, when it is open.',
  [MachineKind.Lever]: 'A switch. `use()` throws it.',
  [MachineKind.Furnace]: 'A smelter.',
  [MachineKind.Press]: 'A press.',
  [MachineKind.Sink]: 'Accepts deliveries. What a delivery objective counts.',
  [MachineKind.Source]: 'Emits items.',
  [MachineKind.Node]: 'A node on the power grid.',
  [MachineKind.Antenna]: 'Sends and receives off-site.',
  [MachineKind.Charger]: 'Puts fuel back into a bot.',
  [MachineKind.Router]: 'Passes traffic on.',
};

/** The mechanical half of a terrain row, read out of the table the simulator obeys. */
function terrainTraits(terrain: Terrain): string[] {
  const props = TERRAIN_PROPS[terrain];
  if (!props) return [];
  const traits: string[] = [];
  traits.push(props.walkable ? 'walkable' : 'blocks movement');
  if (props.opaque) traits.push('blocks sight');
  if (props.lethal) traits.push('a bot that ends a move here dies');
  if (props.plantable) traits.push('plantable');
  if (props.mineable) traits.push(props.yields ? `mine it for ${props.yields}` : 'mineable');
  return traits;
}

/**
 * Everything the player can meet on this board, named.
 *
 * The item list is the union of four things and not just the stacks lying about, because a level
 * whose only ore arrives by mining a vein still owes the player the word `ore`: what is on the
 * ground, what is already in a bot's hold, what is planted and will be harvested, and what every
 * mineable terrain on the board yields.
 */
export function legendFor(world: World | null): LegendSection[] {
  if (!world) return [];

  const terrains = new Map<Terrain, number>();
  const items = new Map<ItemKind, number | null>();
  const machines = new Map<MachineKind, Set<string>>();

  const bump = (kind: ItemKind, by: number | null): void => {
    const seen = items.get(kind);
    if (seen === undefined) items.set(kind, by);
    else if (seen !== null && by !== null) items.set(kind, seen + by);
    else items.set(kind, null);
  };

  for (const tile of world.tiles) {
    if (tile.terrain === Terrain.Void) continue;
    terrains.set(tile.terrain, (terrains.get(tile.terrain) ?? 0) + 1);
    if (tile.crop) bump(tile.crop, null);
    const yields = TERRAIN_PROPS[tile.terrain]?.yields;
    if (yields) bump(yields, null);
  }
  for (const stack of world.items) bump(stack.kind, stack.count);
  for (const bot of world.bots) for (const stack of bot.inventory) bump(stack.kind, stack.count);
  for (const machine of world.machines) {
    const states = machines.get(machine.kind) ?? new Set<string>();
    for (const state of machine.cycle ?? [machine.state]) states.add(state);
    states.add(machine.state);
    machines.set(machine.kind, states);
  }

  const sections: LegendSection[] = [
    {
      id: 'terrain',
      title: 'Ground',
      /* Rarest first: the tile a player does not recognise is never the one there are eight
         hundred of. Floor and wall settle at the bottom on their own. */
      rows: [...terrains.entries()]
        .sort((a, b) => a[1] - b[1] || a[0].localeCompare(b[0]))
        .map(([terrain, count]) => ({
          name: terrain,
          what: TERRAIN_IS[terrain],
          traits: terrainTraits(terrain),
          count,
        })),
    },
    {
      id: 'items',
      title: 'Items',
      rows: [...items.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([kind, count]) => ({
        name: kind,
        what: ITEM_IS[kind],
        traits: [],
        count,
      })),
    },
    {
      id: 'machines',
      title: 'Machines',
      rows: [...machines.entries()]
        .sort((a, b) => a[0].localeCompare(b[0]))
        .map(([kind, states]) => ({
        name: kind,
        what: MACHINE_IS[kind],
        traits: states.size > 0 ? [`states: ${[...states].join(', ')}`] : [],
        count: world.machines.filter((machine) => machine.kind === kind).length,
      })),
    },
  ];

  return sections.filter((section) => section.rows.length > 0);
}
