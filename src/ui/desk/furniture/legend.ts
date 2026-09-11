import type { World } from '../../../engine/index.ts';
import { ItemKind, MachineKind, TERRAIN_PROPS, Terrain } from '../../../engine/index.ts';

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
  [Terrain.Floor]: 'Bare decking. The default surface, and it does nothing else.',
  [Terrain.Wall]: 'Structure. The site was built around it.',
  [Terrain.Pad]: 'A marked spot. What an objective usually counts.',
  [Terrain.Regolith]: 'Loose dust — the ground rock this whole planet is made of.',
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
