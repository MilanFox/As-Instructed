import type { ApiFunctionSpec, ApiTypeSpec, PlayerApiSpec } from './protocol.ts';

const TYPES: ApiTypeSpec[] = [
  {
    name: 'Vec',
    declaration: `interface Vec {
  x: number;
  y: number;
}`,
    doc: 'A grid position. `x` grows East, `y` grows South. North is `y - 1`.',
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
    doc: 'The four directions as numbers: `0` North, `1` East, `2` South, `3` West. So `(dir + 1) % 4` turns right.',
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
  | 'conveyor'
  | 'rack';
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
  readonly Rack: Terrain;
};`,
    doc: 'What a tile is made of. `void` is outside the grid. A bot that stops on a `pit` is lost. `ore`, `ice` and `regolith` are also item kinds: what `mine()` gives you.',
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
    doc: 'Every kind of item. The values are plain strings, so `plant("seed")` and `plant(ItemKind.Seed)` do the same thing.',
  },
  {
    name: 'ItemStack',
    declaration: `interface ItemStack {
  kind: ItemKind;
  count: number;
}`,
    doc: 'An amount of one item kind.',
  },
  {
    name: 'TileView',
    declaration: `interface TileView {
  at: Vec;
  inBounds: boolean;
  terrain: Terrain;
  walkable: boolean;
  lethal: boolean;
  growth: number;
  maxGrowth: number;
  sproutsIn: number;
  crop: ItemKind | null;
  items: ItemStack[];
  botId: number | null;
  machineId: string | null;
  mark: string | null;
}`,
    doc: 'What a bot sees on one tile. `lethal` is true where a bot that stops is lost (a pit is walkable but lethal). A crop is ripe when `growth >= maxGrowth`. A crop that has not started yet has `growth` 0 until `sproutsIn` reaches 0. Outside the grid: `inBounds: false` and `terrain: "void"`.',
  },
  {
    name: 'MachineView',
    declaration: `interface MachineView {
  id: string;
  kind: string;
  at: Vec;
  state: string;
  vars: Record<string, number>;
  inventory: ItemStack[];
  links: Vec[];
}`,
    doc: 'A read-only view of one machine. `state` is usually `idle`, `on`, `off`, `open`, `closed` or `busy`. `links` lists the tiles this machine changes, such as the gate tile of a door. It can be empty.',
  },
  {
    name: 'Message',
    declaration: `interface Message {
  from: number;
  body: string | number;
  t: number;
}`,
    doc: "One message in an inbox. `from` is the sender's id. `t` is the sender's clock when it was sent.",
  },
  {
    name: 'Console',
    declaration: `declare const console: {
  log(...values: unknown[]): void;
  info(...values: unknown[]): void;
  warn(...values: unknown[]): void;
  error(...values: unknown[]): void;
  debug(...values: unknown[]): void;
};`,
    doc: 'Every `console` method works like `print`.',
  },
];

const FUNCTIONS: ApiFunctionSpec[] = [
  {
    name: 'move',
    params: [{ name: 'dir', type: 'Dir', doc: 'The direction to step in.' }],
    returns: 'boolean',
    doc: 'Steps one tile in `dir` and returns true if the bot moved. It fails if the tile is outside the grid or not walkable. A failed move still costs 1 tick and turns the bot to face `dir`.',
    crewDoc: 'A tile taken by another bot blocks the move too.',
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
    doc: "Returns the bot's position as a new object. Free.",
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
    params: [
      {
        name: 'values',
        type: 'unknown[]',
        rest: true,
        doc: 'What to write. Values are joined with a space.',
      },
    ],
    returns: 'void',
    doc: 'Writes one line to the console, like `console.log`. Objects and arrays are written as JSON. Free. In the replay, the line appears at the tick it was printed. In a debug run you can expand objects and arrays.',
    example: `const here = pos();
print(\`starting at \${here.x},\${here.y}\`);
print('here is', here);`,
    cost: 0,
    unlockedBy: 'w1-01',
    world: 1,
    category: 'output',
    requiresTypes: ['Console'],
  },
  {
    name: 'wait',
    params: [
      {
        name: 'n',
        type: 'number',
        optional: true,
        defaultValue: '1',
        doc: 'How many ticks to wait.',
      },
    ],
    returns: 'void',
    doc: 'Does nothing for `n` ticks.',
    crewDoc: "Only this bot's clock moves.",
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
    doc: 'Returns whether a `move` in `dir` would work right now. Free.',
    crewDoc: 'Another bot may still take the tile first.',
    example: `if (!canMove(Dir.North)) {
  move(Dir.East);
}`,
    cost: 0,
    unlockedBy: 'w1-02',
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
        doc: "Leave out for the bot's own tile. Otherwise, the neighbouring tile in this direction.",
      },
    ],
    returns: 'TileView',
    doc: 'Returns the bot\'s own tile, or the neighbouring tile in `dir`. Never null: outside the grid it returns `inBounds: false` and `terrain: "void"`.',
    example: `const ahead = scan(Dir.South);
if (ahead.walkable && ahead.botId === null) {
  move(Dir.South);
}`,
    cost: 0,
    unlockedBy: 'w2-01',
    world: 2,
    category: 'sensing',
    requiresTypes: ['Dir', 'TileView'],
  },
  {
    name: 'mine',
    params: [{ name: 'dir', type: 'Dir', doc: 'Which neighbouring tile to mine.' }],
    returns: 'ItemKind | null',
    doc: 'Mines the neighbouring tile in `dir` and turns it into floor. Returns the item it gives: rock gives stone, rubble gives scrap, and ore, ice and regolith give their own kind. Returns null if the tile cannot be mined or the inventory is full. A null costs the same.',
    example: `const ore = mine(Dir.North);
if (ore === null) {
  move(Dir.East);
}`,
    cost: 2,
    unlockedBy: 'w4-04',
    world: 4,
    category: 'terraforming',
    requiresTypes: ['ItemKind', 'Dir'],
  },
  {
    name: 'harvest',
    params: [],
    returns: 'ItemKind | null',
    doc: "Harvests the ripe crop on the bot's tile and returns its item kind. Returns null if there is no crop, it is not ripe, or the inventory is full. A null costs the same.",
    example: `const picked = harvest();
if (picked === null) {
  wait(4);
}`,
    cost: 2,
    unlockedBy: 'w2-01',
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
    doc: "Plants one `kind` item on the bot's tile. It fails only if the ground is not soil (`scan().terrain`), something already grows there (`scan().crop`), or the bot has none. A failure costs the same, so check first.",
    example: `const here = scan();
if (here.terrain !== 'soil') print('not soil');
else if (here.crop !== null) print('already growing');
else plant();`,
    cost: 2,
    unlockedBy: 'w2-01',
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
        doc: 'Count only this kind. Leave out to count everything.',
      },
    ],
    returns: 'number',
    doc: 'Counts the items the bot carries: all of them, or only `kind`.',
    example: `harvest();
print(\`crops held: \${inventory('crop')}\`);`,
    cost: 0,
    unlockedBy: 'w2-02',
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
        doc: 'Take only this kind. Leave out to take anything.',
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
    doc: "Picks up items from the bot's tile and returns how many it took. This can be less than `count`: too few items are there, or the bot is full. `scan().items` shows what is there, for free. No command shows how much a bot can carry. If it takes fewer than are there, it is full. Taking fewer costs the same ticks.",
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
        doc: 'Drop only this kind. Leave out to drop from the first stack.',
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
    doc: "Drops items onto the bot's tile and returns how many it dropped. 0 means the bot carries none of that kind. `inventory(kind)` checks for free. A 0 costs the same.",
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
    doc: 'Lists the item kinds the bot holds, in the order it picked them up. Empty if it holds nothing.',
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
        doc: "Leave out for the machine on the bot's tile. Otherwise, the neighbouring one in this direction.",
      },
    ],
    returns: 'boolean',
    doc: "Switches the machine on the bot's tile, or next to it in `dir`, to its next state. Returns false if nothing changed: there is no machine, the machine cannot be switched (a delivery bay or a mast), or it needs power from a machine that is not `on` yet. A machine that needs power has a key `fed:<id>` in its `vars`, where `<id>` is the machine that powers it. A switch that changes nothing costs the same ticks.",
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
      { name: 'dir', type: 'Dir', doc: 'The direction to look in.' },
      {
        name: 'range',
        type: 'number',
        optional: true,
        defaultValue: 'Infinity',
        doc: 'The most tiles to return. The tile that blocks the view counts. Leave out to look until something blocks it.',
      },
    ],
    returns: 'TileView[]',
    doc: "Returns up to `range` tiles along `dir`, nearest first, without the bot's own tile. The view ends at the first tile that blocks it or is outside the grid. That tile is included. Every call costs the same, whatever the `range`.",
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
        doc: 'The text to write, or null to erase the mark.',
      },
    ],
    returns: 'void',
    doc: "Writes text on the bot's tile and replaces any old mark. A later pass reads it with `readMark`. For your own memory, normal variables are enough: they keep their values for the whole run.",
    crewDoc: 'Other bots can read it too.',
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
    doc: "Returns the text written on the bot's tile, or null if there is none.",
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
    doc: 'Returns the fuel the bot has left. In a level without fuel it returns `Infinity`.',
    example: `if (fuel() < 6) {
  refuel();
}`,
    cost: 0,
    unlockedBy: 'w4-04',
    world: 4,
    category: 'sensing',
  },
  {
    name: 'refuel',
    params: [],
    returns: 'boolean',
    doc: 'Fills the bot to full fuel. It works only on a depot tile. Anywhere else it returns false and costs the same. Each action uses 1 fuel per tick it costs. Sensing, waiting and refuelling use none.',
    example: `while (scan().terrain !== Terrain.Depot) {
  move(Dir.East);
}
refuel();`,
    cost: 2,
    unlockedBy: 'w4-04',
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
        doc: "Leave out for the machine under the bot or on the tile it faces. Or give any machine's id.",
      },
    ],
    returns: 'MachineView | null',
    doc: 'Returns a read-only view of a machine: the one under the bot or on the tile it faces, or `machineId` anywhere. Returns null if there is no such machine. `links` shows which tiles the machine changes, such as the gate of a door.',
    example: `const node = probe('node-1');
if (node !== null && node.state === 'off') {
  print(\`\${node.id} is off\`);
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
      { name: 'state', type: 'string', doc: "The state to set, usually 'on' or 'off'." },
    ],
    returns: 'boolean',
    doc: "Sets a machine's state directly, from anywhere. The run stops if no machine has this id, or if the machine has `vars.manual: 1` (then only `use()` on its tile switches it). The ticks are spent even then. `probe(id)` is free and returns null if no machine has that id.",
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
      { name: 'fromId', type: 'string', doc: 'The machine at the start of the link.' },
      { name: 'toId', type: 'string', doc: 'The machine at the end of the link.' },
    ],
    returns: 'boolean',
    doc: 'Links `fromId` to `toId`. The run stops if either id is not a machine. `probe(id)` returns null for such an id. Returns false for a pair the level does not allow. The level says which pairs are allowed and what a link carries.',
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
    doc: 'Takes the next packet from the queue, or returns null if it is empty. The level says what arrives and when. Under a reading limit it counts as one `receive` and one `probe`.',
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
    doc: 'Returns how many packets wait in the queue, without taking any. Only `receive()` lowers the count. With no antenna it returns 0. Under a reading limit it counts as one `buffered` and one `probe`.',
    example: `if (buffered() === 0) {
  print('no packets waiting');
}`,
    cost: 0,
    unlockedBy: 'w6-01',
    world: 6,
    category: 'signal',
  },
  {
    name: 'transmit',
    params: [{ name: 'text', type: 'string', doc: 'The text to send.' }],
    returns: 'boolean',
    doc: 'Sends `text` through the antenna. Returns false if the antenna has no power or the level refuses the text. In a level with no antenna, the run stops.',
    example: `const packet = receive();
if (packet !== null && !transmit(packet)) {
  print('antenna refused the packet');
}`,
    cost: 1,
    unlockedBy: 'w6-02',
    world: 6,
    category: 'signal',
  },
  {
    name: 'decode',
    params: [
      { name: 'text', type: 'string', doc: 'The coded text.' },
      { name: 'key', type: 'number', doc: "The level's decoding key." },
    ],
    returns: 'string',
    doc: 'Decodes `text` with `key` and returns the result. Free. The level says how the code works.',
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
    doc: "Returns one bot. Every bot command is a method on it and runs on that bot's own clock: `bot(0).move(...)` then `bot(1).move(...)` moves both in the same tick. Plain calls like `move()` command the first bot.",
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
    doc: "Returns this bot's clock, in ticks. Each bot has its own clock. The score is the highest clock at the end.",
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
    doc: 'Lists the ids of all living bots, lowest first, including this one.',
    example: `const crew = bots();
print(\`\${crew.length} bots running\`);`,
    cost: 0,
    unlockedBy: 'w7-01',
    world: 7,
    category: 'swarm',
  },
  {
    name: 'sync',
    params: [],
    returns: 'number',
    doc: "Moves every living bot's clock forward to the highest clock. Returns that tick. Free.",
    example: `const t = sync();
print(\`all bots at tick \${t}\`);`,
    cost: 0,
    unlockedBy: 'w7-01',
    world: 7,
    category: 'swarm',
  },
  {
    name: 'send',
    params: [
      { name: 'to', type: 'number', doc: 'The id of the receiving bot.' },
      { name: 'body', type: 'string | number', doc: 'The message.' },
    ],
    returns: 'boolean',
    doc: "Puts `body` in the inbox of bot `to`. The message's time is the sender's clock. Returns true. The run stops if `to` is not a living bot.",
    example: `for (const id of bots()) {
  if (id !== 0) {
    send(id, 'go');
  }
}`,
    cost: 1,
    unlockedBy: 'w7-01',
    world: 7,
    category: 'swarm',
  },
  {
    name: 'recv',
    params: [],
    returns: 'Message | null',
    doc: "Takes the oldest message from this bot's inbox. Returns null if the inbox is empty, or if that message's time is later than this bot's clock. Free.",
    example: `const msg = recv();
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
      { name: 'dir', type: 'Dir', doc: 'Where the new bot appears.' },
      {
        name: 'options',
        type: '{ name?: string; capacity?: number }',
        optional: true,
        doc: "A name and an inventory limit. By default the new bot gets this bot's limit and the name `bot-<id>`.",
      },
    ],
    returns: 'number',
    doc: 'Creates a new bot on the neighbouring tile in `dir` and returns its id. Returns -1 if the tile is outside the grid, not walkable, or taken by another bot. `scan(dir)` checks the first two for free. A tile another bot is still leaving counts as taken. A failed spawn costs the same.',
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

const FLEET_WIDE = new Set<string>(['bot', 'bots', 'sync']);

export function perBotApi(functions: readonly ApiFunctionSpec[] = FUNCTIONS): ApiFunctionSpec[] {
  return functions.filter((fn) => !FLEET_WIDE.has(fn.name));
}

export function renderParams(fn: ApiFunctionSpec): string {
  return fn.params
    .map(
      (param) =>
        `${param.rest ? '...' : ''}${param.name}${param.optional ? '?' : ''}: ${param.type}`,
    )
    .join(', ');
}

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
  doc: 'One bot, as returned by `bot(id)`. Every method commands only that bot, on its own clock.',
};

export const PLAYER_API: PlayerApiSpec = {
  version: 1,
  types: [...TYPES, BOT_TYPE],
  functions: FUNCTIONS,
};

export function hasCrew(functions: readonly ApiFunctionSpec[]): boolean {
  return functions.some((fn) => fn.category === 'swarm');
}

export function docFor(fn: ApiFunctionSpec, crew: boolean): string {
  return crew && fn.crewDoc !== undefined ? `${fn.doc} ${fn.crewDoc}` : fn.doc;
}

export function apiFunction(name: string): ApiFunctionSpec | undefined {
  return PLAYER_API.functions.find((fn) => fn.name === name);
}

export function apiForWorld(world: number): ApiFunctionSpec[] {
  return PLAYER_API.functions.filter((fn) => fn.world === world);
}

export function apiUnlockedAt(levelId: string): string[] {
  return PLAYER_API.functions.filter((fn) => fn.unlockedBy === levelId).map((fn) => fn.name);
}
