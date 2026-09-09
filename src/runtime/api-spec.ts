import type { ApiFunctionSpec, ApiTypeSpec, PlayerApiSpec } from './protocol.ts';

/**
 * The player-callable API surface, as data.
 *
 * Three consumers read this file: RUNTIME binds one real implementation per entry, UI renders the
 * docs panel, and Monaco concatenates every `types[].declaration` into one ambient `.d.ts` before
 * transpiling the player's source. Nothing here is executable — this module holds no logic beyond
 * four lookup helpers.
 *
 * Bindings: the spec describes the SINGLE-BOT binding, where the acting bot id is already bound
 * away by the runtime. Player code never passes a bot id. World 7 additionally exposes the same
 * functions on the per-bot handle `bot(id)` returns; `FLEET_WIDE` below is the only thing that
 * decides which entries appear there, and the `Bot` interface the editor sees is generated from
 * that same list, so the handle cannot drift from the free functions.
 *
 * Specified, not yet implemented in `Sim`: `link`, `receive`, `buffered`, `transmit`, `decode`.
 * World 5 and 6 semantics are deliberately open in DESIGN.md, so these five are contracts for the
 * RUNTIME and CONTENT agents to satisfy on top of `Sim.applyMachineChange`; each `doc` says so.
 *
 * Unlock ordering: `functions` is stored in unlock order, and level ids (`w<world>-<index>`, both
 * single-digit world and zero-padded index) sort lexicographically in that same order, which is
 * what `apiUnlockedBy` relies on.
 */

const TYPES: ApiTypeSpec[] = [
  {
    name: 'Vec',
    declaration: `interface Vec {
  x: number;
  y: number;
}`,
    doc: 'A grid position. `x` grows East, `y` grows South, so North is `y - 1`.',
  },
  {
    name: 'Dir',
    declaration: `declare const Dir: {
  readonly North: Dir;
  readonly East: Dir;
  readonly South: Dir;
  readonly West: Dir;
};
type Dir = number;`,
    doc: 'The four cardinal directions. A plain frozen object, not a TypeScript enum, so `Dir.North` survives transpilation into your program. The values are `0` North, `1` East, `2` South, `3` West, and they are plain numbers on purpose: `(dir + 1) % 4` turns right, and `let facing = Dir.North` can be reassigned later.',
  },
  {
    name: 'Terrain',
    declaration: `type Terrain =
  | 'void'
  | 'floor'
  | 'wall'
  | 'pad'
  | 'regolith'
  | 'soil'
  | 'rock'
  | 'ore'
  | 'rubble'
  | 'ice'
  | 'pit'
  | 'cable'
  | 'depot'
  | 'conveyor';
declare const Terrain: {
  readonly Void: Terrain;
  readonly Floor: Terrain;
  readonly Wall: Terrain;
  readonly Pad: Terrain;
  readonly Regolith: Terrain;
  readonly Soil: Terrain;
  readonly Rock: Terrain;
  readonly Ore: Terrain;
  readonly Rubble: Terrain;
  readonly Ice: Terrain;
  readonly Pit: Terrain;
  readonly Cable: Terrain;
  readonly Depot: Terrain;
  readonly Conveyor: Terrain;
};`,
    doc: 'What a tile is made of. `void` is outside the playable area, `pit` is walkable but kills a bot that stops on it.',
  },
  {
    name: 'ItemKind',
    declaration: `type ItemKind =
  | 'regolith'
  | 'stone'
  | 'ore'
  | 'ice'
  | 'scrap'
  | 'seed'
  | 'crop'
  | 'crate'
  | 'part'
  | 'cell'
  | 'chip';
declare const ItemKind: {
  readonly Regolith: ItemKind;
  readonly Stone: ItemKind;
  readonly Ore: ItemKind;
  readonly Ice: ItemKind;
  readonly Scrap: ItemKind;
  readonly Seed: ItemKind;
  readonly Crop: ItemKind;
  readonly Crate: ItemKind;
  readonly Part: ItemKind;
  readonly Cell: ItemKind;
  readonly Chip: ItemKind;
};`,
    doc: 'Every kind of item a bot can hold, drop, plant or deliver. The values are plain strings, so `plant("seed")` and `plant(ItemKind.Seed)` are the same call.',
  },
  {
    name: 'ItemStack',
    declaration: `interface ItemStack {
  kind: ItemKind;
  count: number;
}`,
    doc: 'A quantity of one item kind. Tile and machine inventories are arrays of these.',
  },
  {
    name: 'TileView',
    declaration: `interface TileView {
  at: Vec;
  inBounds: boolean;
  terrain: Terrain;
  walkable: boolean;
  growth: number;
  maxGrowth: number;
  sproutsIn: number;
  crop: ItemKind | null;
  items: ItemStack[];
  botId: number | null;
  machineId: string | null;
  mark: string | null;
}`,
    doc: 'Everything a bot perceives about one tile. A crop is ready when `growth >= maxGrowth`. A crop can also be planted with its clock set to start in the future, in which case `growth` reads 0 and stays there until `sproutsIn` counts down to 0. Tiles outside the world come back with `inBounds: false` and `terrain: "void"`.',
  },
  {
    name: 'MachineView',
    /* Mirrors `MachineView` in `src/engine/sim.ts`. Every declaration in this file is a string, so
       `tsc` compares nothing here and a field added to the engine type and forgotten here is a
       field the editor refuses to let the player read. Guarded by
       `src/__tests__/confessed-invariants.test.ts`. */
    declaration: `interface MachineView {
  id: string;
  kind: string;
  at: Vec;
  state: string;
  vars: Record<string, number>;
  inventory: ItemStack[];
  links: Vec[];
}`,
    doc: "A read-only snapshot of one machine. `state` is free-form but stable per machine kind, typically one of `idle`, `on`, `off`, `open`, `closed` or `busy`. `links` lists the tiles this machine's state moves — the gate a door walls off, which turns back to floor when it opens — and is empty on a machine that moves none.",
  },
  {
    name: 'Message',
    declaration: `interface Message {
  from: number;
  body: string | number;
  t: number;
}`,
    doc: 'One message in a bot inbox. `from` is the sender id and `t` is the sender clock at the moment it was sent.',
  },
];

const FUNCTIONS: ApiFunctionSpec[] = [
  {
    name: 'move',
    params: [{ name: 'dir', type: 'Dir', doc: 'The cardinal direction to step in.' }],
    returns: 'boolean',
    doc: 'Steps one tile in `dir` and returns whether the step happened. A move fails when the target tile is out of bounds, not walkable, or held by another bot at an overlapping time; the failed move still costs a tick and the bot still ends up facing `dir`.',
    example: `for (let i = 0; i < 4; i++) {
  move(Dir.East);
}`,
    cost: 1,
    unlockedBy: 'w1-01',
    world: 1,
    category: 'movement',
    requiresTypes: ['Dir'],
  },
  {
    name: 'pos',
    params: [],
    returns: 'Vec',
    doc: "Returns the bot's current grid position as a fresh object. Free, and safe to call as often as you like.",
    example: `const here = pos();
if (here.x < 5) {
  move(Dir.East);
}`,
    cost: 0,
    unlockedBy: 'w1-01',
    world: 1,
    category: 'sensing',
    requiresTypes: ['Vec'],
  },
  {
    name: 'print',
    params: [{ name: 'text', type: 'string', doc: 'The line to write.' }],
    returns: 'void',
    doc: 'Writes one line to the console panel. It is free, and it is recorded in the trace, so the line reappears at the exact tick it was printed when you scrub the replay.',
    example: `const here = pos();
print(\`starting at \${here.x},\${here.y}\`);`,
    cost: 0,
    unlockedBy: 'w1-01',
    world: 1,
    category: 'output',
  },
  {
    name: 'wait',
    params: [
      {
        name: 'n',
        type: 'number',
        optional: true,
        defaultValue: '1',
        doc: 'How many ticks to burn.',
      },
    ],
    returns: 'void',
    doc: "Burns `n` ticks doing nothing, advancing only this bot's clock. Use it to let a crop mature or to let another bot clear a tile you need.",
    example: `wait(3);
move(Dir.East);`,
    cost: 'n',
    unlockedBy: 'w1-01',
    world: 1,
    category: 'movement',
  },
  {
    name: 'canMove',
    params: [{ name: 'dir', type: 'Dir', doc: 'The direction to test.' }],
    returns: 'boolean',
    doc: 'Reports whether a `move` in `dir` would succeed right now, without spending a tick or moving the bot. The answer reflects this instant only; another bot may take the tile before you get there.',
    example: `if (!canMove(Dir.North)) {
  move(Dir.East);
}`,
    cost: 0,
    unlockedBy: 'w1-03',
    world: 1,
    category: 'sensing',
    requiresTypes: ['Dir'],
  },
  {
    name: 'scan',
    params: [
      {
        name: 'dir',
        type: 'Dir',
        optional: true,
        doc: "Omit to scan the bot's own tile, otherwise the adjacent tile in this direction.",
      },
    ],
    returns: 'TileView',
    doc: 'Returns a view of the bot\'s own tile, or of the adjacent tile in `dir`. It never returns null: a tile outside the world comes back with `inBounds: false` and `terrain: "void"`.',
    example: `const ahead = scan(Dir.South);
if (ahead.walkable && ahead.botId === null) {
  move(Dir.South);
}`,
    cost: 0,
    unlockedBy: 'w2-02',
    world: 2,
    category: 'sensing',
    requiresTypes: ['Dir', 'TileView'],
  },
  {
    name: 'mine',
    params: [{ name: 'dir', type: 'Dir', doc: 'Which adjacent tile to cut into.' }],
    returns: 'ItemKind | null',
    doc: 'Cuts into the adjacent tile in the given direction, clearing it to bare floor and adding what it yielded to the inventory: rock gives stone, rubble gives scrap, and ore, ice and regolith each give their own kind. Returns the kind recovered, or null when that tile is not mineable or the inventory is already full, which still costs the full price.',
    example: `const ore = mine(Dir.North);
if (ore === null) {
  move(Dir.East);
}`,
    cost: 2,
    unlockedBy: 'w4-05',
    world: 4,
    category: 'terraforming',
    requiresTypes: ['ItemKind', 'Dir'],
  },
  {
    name: 'harvest',
    params: [],
    returns: 'ItemKind | null',
    doc: 'Harvests the mature crop on the tile under the bot and adds it to the inventory, returning the item kind gathered. Returns null when there is no crop, when it is not ripe yet, or when the inventory is already full, which still costs the full harvest price. The console flags the full-inventory case for you.',
    example: `const picked = harvest();
if (picked === null) {
  wait(4);
}`,
    cost: 2,
    unlockedBy: 'w2-02',
    world: 2,
    category: 'terraforming',
    requiresTypes: ['ItemKind'],
  },
  {
    name: 'plant',
    params: [
      {
        name: 'kind',
        type: 'ItemKind',
        optional: true,
        defaultValue: "'seed'",
        doc: 'Which carried item to plant.',
      },
    ],
    returns: 'boolean',
    doc: 'Plants one item of `kind` from the inventory into plantable ground under the bot. It refuses for exactly three reasons: the ground is not soil (`scan().terrain`), something is already growing there (`scan().crop`), or the bot carries none of that kind. The first two have a free check that tells them apart, and the third is the one you find out by paying for it — a refusal costs the full price, so it is worth asking first.',
    example: `const here = scan();
if (here.terrain !== 'soil') print('not soil');
else if (here.crop !== null) print('already growing');
else plant();`,
    cost: 2,
    unlockedBy: 'w2-02',
    world: 2,
    category: 'terraforming',
    requiresTypes: ['ItemKind'],
  },
  {
    name: 'inventory',
    params: [
      {
        name: 'kind',
        type: 'ItemKind',
        optional: true,
        doc: 'Count only this kind. Omit to count every item held.',
      },
    ],
    returns: 'number',
    doc: 'Counts what the bot is carrying: the total across all kinds, or just `kind` when you pass one.',
    example: `harvest();
print(\`crops held: \${inventory('crop')}\`);`,
    cost: 0,
    unlockedBy: 'w2-04',
    world: 2,
    category: 'inventory',
    requiresTypes: ['ItemKind'],
  },
  {
    name: 'pickup',
    params: [
      {
        name: 'kind',
        type: 'ItemKind',
        optional: true,
        doc: 'Take only this kind. Omit to take whatever is lying there.',
      },
      {
        name: 'count',
        type: 'number',
        optional: true,
        defaultValue: '1',
        doc: 'How many to take.',
      },
    ],
    returns: 'number',
    doc: "Picks loose items up off the bot's own tile and returns how many were actually taken. The result is clamped by what is on the ground and by the remaining inventory capacity, so it can be smaller than `count`, or zero. A zero has three causes: nothing is lying there, or none of the kind you named is — `scan().items` tells those two apart for free — or the bot is already full, and nothing on the bot reports its own limit, so a return smaller than `count` is how that limit is found. It costs the full price either way.",
    example: `const taken = pickup('ore', 5);
print(\`loaded \${taken} ore\`);`,
    cost: 1,
    unlockedBy: 'w3-01',
    world: 3,
    category: 'inventory',
    requiresTypes: ['ItemKind'],
  },
  {
    name: 'drop',
    params: [
      {
        name: 'kind',
        type: 'ItemKind',
        optional: true,
        doc: 'Drop only this kind. Omit to drop from the first stack held.',
      },
      {
        name: 'count',
        type: 'number',
        optional: true,
        defaultValue: '1',
        doc: 'How many to drop.',
      },
    ],
    returns: 'number',
    doc: "Drops items from the inventory onto the bot's own tile and returns how many actually left the inventory. A zero means the bot is carrying nothing at all, or none of the kind you named — `inventory()` counts everything held and `inventory(kind)` counts one kind, both free — and it still costs a tick.",
    example: `while (inventory() > 0) {
  drop();
  move(Dir.East);
}`,
    cost: 1,
    unlockedBy: 'w3-01',
    world: 3,
    category: 'inventory',
    requiresTypes: ['ItemKind'],
  },
  {
    name: 'carrying',
    params: [],
    returns: 'ItemKind[]',
    doc: 'Lists the distinct item kinds the bot currently holds, in the order they were first picked up. Returns an empty array when the inventory is empty.',
    example: `if (carrying().length === 0) {
  pickup();
}`,
    cost: 0,
    unlockedBy: 'w3-02',
    world: 3,
    category: 'inventory',
    requiresTypes: ['ItemKind'],
  },
  {
    name: 'use',
    params: [
      {
        name: 'dir',
        type: 'Dir',
        optional: true,
        doc: "Omit to use the machine on the bot's own tile, otherwise the adjacent one in this direction.",
      },
    ],
    returns: 'boolean',
    doc: "Operates a machine on the bot's tile, or the adjacent one in `dir`, advancing it one step through its state cycle. Returns true only when a machine actually moved: false means there is no machine on that tile, or the one there has no cycle for `use` to advance — a delivery bay or a mast, which are worked by `drop()` or by other hardware, or the one there draws its power from another machine that is not `on` yet, which `probe()` publishes as a `fed:<id>` key in its `vars`. `probe()` reads a machine's id, state and vars for free, and `use` costs the full price either way.",
    example: `if (!canMove(Dir.North)) {
  use(Dir.North);
  move(Dir.North);
}`,
    cost: 2,
    unlockedBy: 'w5-01',
    world: 5,
    category: 'machines',
    requiresTypes: ['Dir'],
  },
  {
    name: 'look',
    params: [
      { name: 'dir', type: 'Dir', doc: 'The direction to cast along.' },
      {
        name: 'range',
        type: 'number',
        optional: true,
        defaultValue: '8',
        doc: 'The most tile views to return. The tile that stops the cast counts as one of them.',
      },
    ],
    returns: 'TileView[]',
    doc: "Casts a ray from the bot along `dir` and returns at most `range` tile views, nearest first. The bot's own tile is excluded. The cast stops after the first sight-blocking or out-of-bounds tile, which is included in the result and counts against `range` — so a ray that runs off the edge of the site returns the tiles it crossed plus one view with `inBounds: false`.",
    example: `const corridor = look(Dir.East, 5);
const blockedAt = corridor.findIndex((tile) => !tile.walkable);
print(\`clear for \${blockedAt < 0 ? corridor.length : blockedAt} tiles\`);`,
    cost: 0,
    unlockedBy: 'w4-01',
    world: 4,
    category: 'sensing',
    requiresTypes: ['Dir', 'TileView'],
  },
  {
    name: 'mark',
    params: [
      {
        name: 'text',
        type: 'string | null',
        doc: 'The breadcrumb to write, or null to erase the existing one.',
      },
    ],
    returns: 'void',
    doc: "Writes a breadcrumb onto the bot's own tile, replacing whatever was there. Ordinary JavaScript values — objects, arrays, `Map`, `Set`, closures — already persist for the entire run, so use them for anything your own program needs to remember; `mark` is only for state that must live in the world itself, where another bot or a later pass can read it back with `readMark`.",
    example: `mark('visited');
move(Dir.East);`,
    cost: 1,
    unlockedBy: 'w4-02',
    world: 4,
    category: 'navigation',
  },
  {
    name: 'readMark',
    params: [],
    returns: 'string | null',
    doc: "Returns the breadcrumb written on the bot's own tile, or null when the tile carries no mark. Reading a mark is for state stored in the world; a `Set` or `Map` held in your own program persists for the whole run and needs no marks at all.",
    example: `if (readMark() === null) {
  mark('seen');
}`,
    cost: 0,
    unlockedBy: 'w4-02',
    world: 4,
    category: 'navigation',
  },
  {
    name: 'fuel',
    params: [],
    returns: 'number',
    doc: 'Returns the fuel the bot has left. Levels that do not use the fuel mechanic report `Infinity`, so a check like `fuel() < 4` is simply never true there.',
    example: `if (fuel() < 6) {
  refuel();
}`,
    cost: 0,
    unlockedBy: 'w4-05',
    world: 4,
    category: 'sensing',
  },
  {
    name: 'refuel',
    params: [],
    returns: 'boolean',
    doc: "Refills the bot to its maximum fuel. Only succeeds while the bot is parked on a depot tile; anywhere else it returns false and still costs the full price. Refuelling itself burns no fuel, and acting consumes fuel equal to the action's tick cost while sensing and waiting are free.",
    example: `while (scan().terrain !== Terrain.Depot) {
  move(Dir.East);
}
refuel();`,
    cost: 2,
    unlockedBy: 'w4-05',
    world: 4,
    category: 'machines',
    requiresTypes: ['Terrain', 'Dir'],
  },
  {
    name: 'probe',
    params: [
      {
        name: 'machineId',
        type: 'string',
        optional: true,
        doc: "Omit to probe the machine under the bot, or the one on the tile it faces, otherwise any machine's id.",
      },
    ],
    returns: 'MachineView | null',
    doc: "Returns a read-only snapshot of the machine under the bot, or of the one on the tile the bot faces, or of `machineId` anywhere in the world. Returns null when there is no such machine. The snapshot's `links` names the tiles that machine's state moves, so a gate can be routed to before anything has opened it.",
    example: `const node = probe('node-1');
if (node !== null && node.state === 'off') {
  print(\`\${node.id} is cold\`);
}`,
    cost: 0,
    unlockedBy: 'w5-01',
    world: 5,
    category: 'machines',
    requiresTypes: ['MachineView'],
  },
  {
    name: 'power',
    params: [
      { name: 'machineId', type: 'string', doc: 'The machine to set.' },
      { name: 'state', type: 'string', doc: "The state to force, typically 'on' or 'off'." },
    ],
    returns: 'boolean',
    doc: "Sets a machine's state directly instead of stepping through its cycle the way `use` does, from anywhere on the map. Two calls stop the run rather than report back, because neither could have gone differently later in the shift: an id belonging to no machine here, and a machine publishing `vars.manual: 1`, which is hand-operated and moves only for a `use()` at its tile. Both name what was asked for; `probe(id)` is the free check for the first. It costs the full price either way.",
    example: `power('node-1', 'on');
power('node-2', 'off');`,
    cost: 2,
    unlockedBy: 'w5-02',
    world: 5,
    category: 'machines',
  },
  {
    name: 'link',
    params: [
      { name: 'fromId', type: 'string', doc: 'The machine the connection starts at.' },
      { name: 'toId', type: 'string', doc: 'The machine the connection ends at.' },
    ],
    returns: 'boolean',
    doc: 'Connects two machines so that `fromId` feeds `toId`. The run stops and names the id when either one belongs to no machine here — no command builds a machine, so a bad id stays bad, and `probe(id)` returns null on one for free. It returns false only where a level says a pair is illegal, and its brief says so. What a connection carries is defined by the level too.',
    example: `link('node-1', 'node-2');
power('node-1', 'on');`,
    cost: 2,
    unlockedBy: 'w5-03',
    world: 5,
    category: 'machines',
  },
  {
    name: 'receive',
    params: [],
    returns: 'string | null',
    doc: 'Reads the next queued packet out of the listening post buffer, or null when the buffer is empty. Taking a packet is the only thing that shortens the buffer, so `buffered()` falls by one after every read that hands one back. What arrives, and when, is defined by the level and stated in its brief.',
    example: `let packet = receive();
while (packet !== null) {
  print(packet);
  packet = receive();
}`,
    cost: 0,
    unlockedBy: 'w6-01',
    world: 6,
    category: 'signal',
  },
  {
    name: 'buffered',
    params: [],
    returns: 'number',
    doc: 'Returns how many packets are still unread in the listening post buffer, and takes none of them out of it. `buffered() === 0` is how a program learns the band is quiet without spending a packet to find out, and the count is stable until `receive()` consumes one. A work order carrying no antenna reports 0.',
    example: `if (buffered() === 0) {
  print('nothing on the band this shift');
}`,
    cost: 0,
    unlockedBy: 'w6-01',
    world: 6,
    category: 'signal',
  },
  {
    name: 'transmit',
    params: [{ name: 'text', type: 'string', doc: 'The payload to send.' }],
    returns: 'boolean',
    doc: 'Sends `text` back out over the antenna and returns whether it was accepted. A false means the antenna is unpowered or the payload was refused; the exact acceptance rule is defined by the level. On a work order carrying no antenna at all the run stops instead, because powering one up is something you can do and installing one is not.',
    example: `const packet = receive();
if (packet !== null && !transmit(packet)) {
  print('antenna rejected the payload');
}`,
    cost: 1,
    unlockedBy: 'w6-02',
    world: 6,
    category: 'signal',
  },
  {
    name: 'decode',
    params: [
      { name: 'text', type: 'string', doc: 'The raw payload.' },
      { name: 'key', type: 'number', doc: "The level's decoding key." },
    ],
    returns: 'string',
    doc: "Applies the level's decoding scheme to `text` using `key` and returns the plain result. Free, because it is arithmetic rather than an action. The cipher itself is defined by the level and stated in its brief.",
    example: `const raw = receive();
if (raw !== null) {
  transmit(decode(raw, 7));
}`,
    cost: 0,
    unlockedBy: 'w6-03',
    world: 6,
    category: 'signal',
  },
  {
    name: 'bot',
    params: [
      {
        name: 'id',
        type: 'number',
        doc: 'Which bot to command, as reported by `bots()`.',
      },
    ],
    returns: 'Bot',
    doc: "Returns a handle to one bot in the fleet. Every command a bot can run is a method on the handle, and it acts on that bot alone against that bot's own clock, so `bot(0).move(...)` followed by `bot(1).move(...)` moves both of them in the same tick. The bare, unprefixed calls have not changed: they still command the first bot on site.",
    example: `for (const id of bots()) {
  bot(id).move(Dir.East);
}`,
    cost: 0,
    unlockedBy: 'w7-01',
    world: 7,
    category: 'swarm',
    requiresTypes: ['Bot', 'Dir'],
  },
  {
    name: 'clock',
    params: [],
    returns: 'number',
    doc: "Returns the tick this bot has reached. Every bot keeps its own clock and the level is scored on the highest one at the end, so comparing clocks is how you find the bot that is furthest behind and hand it the next job.",
    example: `let idle = bots()[0] as number;
for (const id of bots()) {
  if (bot(id).clock() < bot(idle).clock()) idle = id;
}`,
    cost: 0,
    unlockedBy: 'w7-01',
    world: 7,
    category: 'sensing',
  },
  {
    name: 'bots',
    params: [],
    returns: 'number[]',
    doc: 'Lists the ids of every living bot in ascending order, including the one running this program. Dead bots are omitted.',
    example: `const crew = bots();
print(\`\${crew.length} units online\`);`,
    cost: 0,
    unlockedBy: 'w7-01',
    world: 7,
    category: 'swarm',
  },
  {
    name: 'sync',
    params: [],
    returns: 'number',
    doc: 'Advances every living bot to the highest clock in the swarm and returns that tick, so the whole crew continues from the same moment. It costs nothing itself, but bots that were running ahead of the rest lose the lead they had built up.',
    example: `const t = sync();
print(\`swarm aligned at tick \${t}\`);`,
    cost: 0,
    unlockedBy: 'w7-01',
    world: 7,
    category: 'swarm',
  },
  {
    name: 'send',
    params: [
      { name: 'to', type: 'number', doc: 'The id of the receiving bot.' },
      { name: 'body', type: 'string | number', doc: 'The payload to deliver.' },
    ],
    returns: 'boolean',
    doc: "Queues a message in another bot's inbox, stamped with the sender's clock. The run stops and names the bot when `to` is an id that does not exist or one that has been lost — neither can start receiving later, so there is nothing to branch on. Delivery is causal: a bot only sees a message once its own clock has reached the moment the message was sent, so the working idiom is `send`, then `sync()`, then `recv()` on the receiving side. Skipping the `sync` leaves a receiver that is behind in virtual time with an empty inbox.",
    example: `for (const id of bots()) {
  if (id !== 0) {
    send(id, 'go');
  }
}
sync();`,
    cost: 1,
    unlockedBy: 'w7-01',
    world: 7,
    category: 'swarm',
  },
  {
    name: 'recv',
    params: [],
    returns: 'Message | null',
    doc: "Pops the oldest message from this bot's inbox, or null when the inbox is empty. Reading is free, so a bot can drain its whole inbox without spending a tick. Only messages the bot's own clock has caught up to are visible, so call `sync()` between the `send` and the `recv` when the receiver is running behind — otherwise the inbox looks empty even though the message was sent.",
    example: `sync();
const msg = recv();
if (msg !== null && msg.body === 'go') {
  move(Dir.North);
}`,
    cost: 0,
    unlockedBy: 'w7-01',
    world: 7,
    category: 'swarm',
    requiresTypes: ['Message'],
  },
  {
    name: 'spawn',
    params: [
      { name: 'dir', type: 'Dir', doc: 'Which adjacent tile the new bot appears on.' },
      {
        name: 'options',
        type: '{ name?: string; capacity?: number }',
        optional: true,
        doc: 'Optional name and inventory limit. Both default from the parent: the capacity is inherited and the name becomes `bot-<id>`.',
      },
    ],
    returns: 'number',
    doc: 'Creates a new bot on the adjacent tile in `dir` and returns its id. Returns -1 when that tile is out of bounds, not walkable, or held by another bot, and the failed spawn still costs the full price. `scan(dir)` reads the first two for free as `inBounds` and `walkable`; the third is the same rule `move` obeys, so a tile a neighbour is still stepping off can refuse a spawn even though it looks empty.',
    example: `const helper = spawn(Dir.East, { name: 'mule', capacity: 8 });
if (helper >= 0) {
  send(helper, 'harvest');
}`,
    cost: 5,
    unlockedBy: 'w7-02',
    world: 7,
    category: 'swarm',
    requiresTypes: ['Dir'],
  },
];

/**
 * Calls that address the whole fleet rather than one bot, and so are *not* methods on `Bot`.
 * Everything else is: a bot can do it, therefore `bot(id)` can be asked to do it.
 */
const FLEET_WIDE = new Set<string>(['bot', 'bots', 'sync']);

/** The entries `bot(id)` exposes as methods, in unlock order. */
export function perBotApi(
  functions: readonly ApiFunctionSpec[] = FUNCTIONS,
): ApiFunctionSpec[] {
  return functions.filter((fn) => !FLEET_WIDE.has(fn.name));
}

/** `dir: Dir, range?: number` — shared by the free-function and the `Bot` member renderers. */
export function renderParams(fn: ApiFunctionSpec): string {
  return fn.params
    .map((param) => `${param.name}${param.optional ? '?' : ''}: ${param.type}`)
    .join(', ');
}

/**
 * The `Bot` interface, generated from the specs that also bind the implementations.
 *
 * `members` is the unlocked subset, which is what makes the handle obey the same hardware gate as
 * the free functions: `bot(id).spawn(...)` must not type-check before the level that installs the
 * fabricator. `docFor` renders the JSDoc block above each member when the caller wants one.
 */
export function botHandleDeclaration(
  members: readonly ApiFunctionSpec[],
  docFor?: (fn: ApiFunctionSpec) => string,
): string {
  const lines = members.map((fn) => {
    const signature = `  ${fn.name}(${renderParams(fn)}): ${fn.returns};`;
    const doc = docFor?.(fn);
    if (doc === undefined) return signature;
    const indented = doc
      .split('\n')
      .map((line) => `  ${line}`)
      .join('\n');
    return `${indented}\n${signature}`;
  });
  return `interface Bot {\n${lines.join('\n')}\n}`;
}

const BOT_TYPE: ApiTypeSpec = {
  name: 'Bot',
  declaration: botHandleDeclaration(perBotApi()),
  doc: "A handle to one bot in the fleet, as returned by `bot(id)`. Every method commands that bot alone and is charged to that bot's own clock.",
};

export const PLAYER_API: PlayerApiSpec = {
  version: 1,
  types: [...TYPES, BOT_TYPE],
  functions: FUNCTIONS,
};

export function apiFunction(name: string): ApiFunctionSpec | undefined {
  return PLAYER_API.functions.find((fn) => fn.name === name);
}

export function apiForWorld(world: number): ApiFunctionSpec[] {
  return PLAYER_API.functions.filter((fn) => fn.world === world);
}

/** Every function unlocked at or before the given level id, in unlock order. */
export function apiUnlockedBy(levelId: string): ApiFunctionSpec[] {
  return PLAYER_API.functions.filter((fn) => fn.unlockedBy <= levelId);
}

/** Names unlocked exactly at this level id — feeds LevelDef.hardware. */
export function apiUnlockedAt(levelId: string): string[] {
  return PLAYER_API.functions.filter((fn) => fn.unlockedBy === levelId).map((fn) => fn.name);
}
