import type { World } from '../../engine/index.ts';
import { ItemKind, MachineKind, TERRAIN_PROPS, Terrain } from '../../engine/index.ts';

export interface LegendRow {
  name: string;
  what: string;
  traits: string[];
  count: number | null;
}

export interface LegendSection {
  id: string;
  title: string;
  rows: LegendRow[];
}

const TERRAIN_IS: Record<Terrain, string> = {
  [Terrain.Void]: 'Outside the playable area.',
  [Terrain.Floor]: 'Plain floor.',
  [Terrain.Wall]: 'A wall.',
  [Terrain.Pad]: 'A target tile. Objectives often count these.',
  [Terrain.Regolith]: 'Loose dust.',
  [Terrain.Soil]: 'Farm ground. `plant()` works only here.',
  [Terrain.Rock]: 'Solid stone.',
  [Terrain.Ore]: 'An ore vein.',
  [Terrain.Rubble]: 'Broken rock. Cheaper to mine than rock.',
  [Terrain.Ice]: 'Frozen ground.',
  [Terrain.Pit]: 'A hole. A bot that stops here is lost.',
  [Terrain.Cable]: 'A power cable.',
  [Terrain.Depot]: 'Fuel depot. `refuel()` works only here.',
  [Terrain.Conveyor]: 'Moves items along.',
  [Terrain.Rack]: 'A storage slot. Bots can walk on it.',
};

const ITEM_IS: Record<ItemKind, string> = {
  [ItemKind.Regolith]: 'Dust, mined from regolith.',
  [ItemKind.Stone]: 'Mined from rock.',
  [ItemKind.Ore]: 'Mined from an ore vein.',
  [ItemKind.Ice]: 'Water ice.',
  [ItemKind.Scrap]: 'Mined from rubble.',
  [ItemKind.Seed]: 'Plant it on soil.',
  [ItemKind.Crop]: 'What you get from harvesting a ripe plant.',
  [ItemKind.Crate]: 'A shipping crate.',
  [ItemKind.Part]: 'A machine part.',
  [ItemKind.Cell]: 'A power cell.',
  [ItemKind.Chip]: 'A control chip.',
};

const MACHINE_IS: Record<MachineKind, string> = {
  [MachineKind.Door]: 'You can pass when it is open.',
  [MachineKind.Lever]: 'A switch. `use()` flips it.',
  [MachineKind.Furnace]: 'A furnace.',
  [MachineKind.Press]: 'A press.',
  [MachineKind.Sink]: 'Takes deliveries. Delivery objectives count these.',
  [MachineKind.Source]: 'Puts out items.',
  [MachineKind.Node]: 'A node on the power grid.',
  [MachineKind.Antenna]: 'Sends and receives radio packets.',
  [MachineKind.Charger]: 'Refuels a bot.',
  [MachineKind.Router]: 'Holds values. `probe()` reads them.',
};

function terrainTraits(terrain: Terrain): string[] {
  const props = TERRAIN_PROPS[terrain];
  if (!props) return [];
  const traits: string[] = [];
  traits.push(props.walkable ? 'walkable' : 'blocks movement');
  if (props.opaque) traits.push('blocks the view');
  if (props.lethal) traits.push('a bot that stops here is lost');
  if (props.plantable) traits.push('can be planted');
  if (props.mineable) traits.push(props.yields ? `mine it for ${props.yields}` : 'can be mined');
  return traits;
}

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
