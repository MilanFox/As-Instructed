import { FailureCode, Medal } from '../engine/index.ts';
import type { RuntimeFailure } from '../runtime/index.ts';

function pick(lines: readonly string[], salt: number): string {
  return lines[Math.abs(salt) % lines.length] ?? lines[0] ?? '';
}

const BRONZE = [
  'It works. Nobody asks for more.',
  'Passed. That is enough for bronze.',
  'It works. Faster would earn more.',
];

const SILVER = [
  'Fast. Not quite fast enough for gold.',
  'Good time. Gold needs a better one.',
  'Silver. Gold needs fewer ticks.',
];

const GOLD = [
  'At par. Someone will think par is wrong.',
  'Gold. At par, and correct.',
  'Par met. The tick counter is not broken.',
];

const CLOSED = [
  'Level closed.',
  'Closed. You found the way.',
  'Closed. Nothing more to do.',
];

export const UNDER_PAR = 'Under par. We will have to set a new par.';
export const BONUS_MET = 'Bonus met. You get a star.';

export function successLine(medal: Medal | null, ticks: number, parTicks: number): string {
  if (medal === null) return pick(CLOSED, ticks);
  if (medal === Medal.Gold && ticks < parTicks) return UNDER_PAR;
  if (medal === Medal.Gold) return pick(GOLD, ticks);
  if (medal === Medal.Silver) return pick(SILVER, ticks);
  return pick(BRONZE, ticks);
}

export function personalBestLine(previous: number, now: number): string {
  const saved = previous - now;
  return `New personal best: ${saved} tick${saved === 1 ? '' : 's'} faster.`;
}

export function libraryUsageLine(routines: number, ticks: number): string {
  const called = `Used ${routines} function${routines === 1 ? '' : 's'} from your library`;
  return `${called}: ${ticks} tick${ticks === 1 ? '' : 's'} inside ${routines === 1 ? 'it' : 'them'}.`;
}

const HALT = [
  'Your program did not stop. We stopped it.',
  'Still running, but doing nothing new. We stopped it.',
  'Stopped at the tick limit.',
];

const UNMET = ['Run over. An objective is not met.', 'The run ended. The work is not done.'];

const BY_CODE: Partial<Record<FailureCode, readonly string[]>> = {
  [FailureCode.Halt]: HALT,
  [FailureCode.OpLimit]: ['Stopped at the instruction limit. Too much checking, too little doing.'],
  [FailureCode.Timeout]: HALT,
  [FailureCode.ObjectivesUnmet]: UNMET,
  [FailureCode.OutOfFuel]: [
    'Out of fuel. The bot stays where it stopped.',
    'No charge left. The bot cannot move.',
  ],
  [FailureCode.Crash]: ['The program stopped with an error. See the console.'],
  [FailureCode.BlockedLivelock]: ['Two bots are each waiting for the other. Forever.'],
  [FailureCode.BotLost]: ['The bot is lost.'],
  [FailureCode.IllegalAction]: [
    'The bot refused a command. The console says why.',
    'Command refused. The reason is in the console.',
  ],
  [FailureCode.Compile]: ['The program did not compile. Nothing ran.'],
};

export function failureLine(code: FailureCode | undefined, salt: number): string {
  const lines = code ? BY_CODE[code] : undefined;
  return pick(lines ?? UNMET, salt);
}

export function failureLineAt(code: FailureCode | undefined, cursor: number): string {
  const lines = (code ? BY_CODE[code] : undefined) ?? UNMET;
  return lines[Math.abs(Math.trunc(cursor)) % lines.length] ?? (lines[0] as string);
}

export function codeForKind(kind: RuntimeFailure['kind'] | undefined): FailureCode | undefined {
  switch (kind) {
    case 'timeout':
    case 'halt':
      return FailureCode.Halt;
    case 'oplimit':
      return FailureCode.OpLimit;
    case 'compile':
      return FailureCode.Compile;
    case 'runtime':
      return FailureCode.Crash;
    default:
      return undefined;
  }
}

export interface HardwareNote {
  spec: string;
}

const HARDWARE: Record<string, HardwareNote> = {
  move: { spec: 'Moves the bot one tile. Returns false if blocked. Costs 1 tick.' },
  pos: { spec: "Returns the bot's tile as { x, y }. Free." },
  canMove: { spec: 'Returns whether a move in a direction would work. Free.' },
  print: { spec: 'Writes one line to the console. Free.' },
  wait: { spec: 'Waits n ticks. Costs n ticks.' },
  scan: { spec: "Returns what is on the bot's tile or a tile next to it. Free." },
  harvest: { spec: "Takes the crop on the bot's tile. Costs 2 ticks." },
  plant: { spec: "Plants one seed on the bot's tile. Costs 2 ticks." },
  inventory: { spec: 'Returns how many items the bot carries. Free.' },
  mine: { spec: 'Mines a tile next to the bot. Costs 2 ticks.' },
  pickup: { spec: "Picks up an item from the bot's tile. Costs 1 tick." },
  drop: { spec: "Drops a carried item on the bot's tile. Costs 1 tick." },
  carrying: { spec: 'Returns what the bot is holding. Free.' },
  use: { spec: 'Uses the machine on or next to the bot. Costs 2 ticks.' },
  look: { spec: 'Returns the tiles the bot can see in one direction. Free.' },
  mark: { spec: "Writes text on the bot's tile. It stays for the run. Costs 1 tick." },
  readMark: { spec: "Returns the text on the bot's tile, or null. Free." },
  power: { spec: 'Sets a machine to a state, by id. Costs 2 ticks.' },
  probe: { spec: 'Returns the state of one node. Free, but a level may limit it.' },
  link: { spec: 'Connects two nodes with cable. Costs 2 ticks and uses cable.' },
  receive: { spec: 'Returns the next packet, or null when there is none. Free.' },
  buffered: { spec: 'Returns how many packets are waiting. Free.' },
  transmit: { spec: 'Sends one packet. Costs 1 tick.' },
  decode: { spec: 'Returns the message inside a packet. Free.' },
  refuel: { spec: 'Fills the bot to full charge. Only on a depot tile. Costs 2 ticks.' },
  fuel: { spec: 'Returns the charge the bot has left. Free.' },
  bot: { spec: 'Returns one bot by id. Each bot has its own clock.' },
  bots: { spec: 'Returns the id of every bot still running. Free.' },
  clock: { spec: "Returns the bot's own tick count. Free." },
  spawn: {
    spec: "Starts a new bot on a tile next to this one. Costs 5 ticks. Bots cannot share a tile.",
  },
  sync: { spec: 'Moves every clock forward to the latest one.' },
  send: { spec: 'Sends a message to another bot. Costs 1 tick.' },
  recv: { spec: 'Returns the next message for this bot, or null. Free.' },
};

export function hardwareNote(name: string): HardwareNote {
  return HARDWARE[name] ?? { spec: 'See the Manual for details.' };
}
