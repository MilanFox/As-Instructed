/**
 * Stock player-facing lines, from NARRATIVE.md §5 and §6.
 *
 * These are read hundreds of times, so they are picked deterministically from the result rather
 * than at random: the same run always says the same thing, and a line never surprises anyone
 * twice. Do not add jokes outside this file's registers, and never inside the docs panel.
 */
import { FailureCode, Medal } from '../engine/index.ts';
import type { RuntimeFailure } from '../runtime/index.ts';

/** Stable pick, so re-opening a result never reshuffles the wording. */
function pick(lines: readonly string[], salt: number): string {
  return lines[Math.abs(salt) % lines.length] ?? lines[0] ?? '';
}

const BRONZE = [
  'It works. Kessler & Daughters asks for nothing further, and means it.',
  'Passed. Filed. Forwarded to somebody who will not read it.',
  'Work order closed. You may close it too.',
];

const SILVER = [
  'Under budget. Not the budget we hoped for. A budget.',
  'Efficient. Noted. Not, at this time, rewarded.',
  'Dot looked at your trace and said nothing. That is high praise.',
];

const GOLD = [
  'At par. Somebody upstairs will assume par was set wrong.',
  'Gold. The number is small and the number is correct.',
  'Par met. Facilities asked whether the meter is broken. It is not.',
];

export const UNDER_PAR = 'Under par. Par has been adjusted. This is how it has always worked.';
export const BONUS_MET = 'Bonus met. There is no bonus. There is a star.';

export function successLine(medal: Medal, ticks: number, parTicks: number): string {
  if (medal === Medal.Gold && ticks < parTicks) return UNDER_PAR;
  if (medal === Medal.Gold) return pick(GOLD, ticks);
  if (medal === Medal.Silver) return pick(SILVER, ticks);
  return pick(BRONZE, ticks);
}

/** Beating your own recorded time. Shown once, loudly, next to the two numbers. */
export function personalBestLine(previous: number, now: number): string {
  return `Your own record, lowered by ${previous - now}. The old figure has been retained.`;
}

export const STREAK_LABEL = 'consecutive closes, no failed runs';

/**
 * A failed run costs the player nothing but the time it took, and the report says so in as many
 * words. There is no penalty anywhere in this game and the player should never have to wonder.
 */
export const NO_PENALTY = 'Nothing was billed. Attempts are not recorded against you.';

const HALT = [
  'Your program did not halt. We stopped it. We would like this noted on the record.',
  'Still running. It has been running for some time. It has not been going anywhere.',
  'Stopped at the tick budget. It showed no sign of ever intending to stop on its own.',
];

const UNMET = [
  'Run complete. The objective that counts is still open.',
  'Shift ended. The work did not.',
];

const BY_CODE: Partial<Record<FailureCode, readonly string[]>> = {
  [FailureCode.Halt]: HALT,
  [FailureCode.OpLimit]: [
    'Stopped at the instruction budget. It sensed a great deal and did very little.',
  ],
  [FailureCode.Timeout]: HALT,
  [FailureCode.ObjectivesUnmet]: UNMET,
  [FailureCode.OutOfFuel]: [
    'Cell depleted. The bot is where it ran out, and that is where it is staying.',
    'Out of charge. Recovery has been scheduled for a date to be confirmed.',
  ],
  [FailureCode.Crash]: ['The program stopped itself. It did not say why. It rarely does.'],
  [FailureCode.BlockedLivelock]: [
    'Two bots have each yielded to the other. They are still yielding.',
  ],
  [FailureCode.BotLost]: ['The bot is not recoverable. Shipping have been informed.'],
  [FailureCode.IllegalAction]: ['The bot declined the instruction. The log says only that.'],
  [FailureCode.Compile]: ['It did not compile. Nothing was dispatched, so nothing was billed.'],
};

export function failureLine(code: FailureCode | undefined, salt: number): string {
  const lines = code ? BY_CODE[code] : undefined;
  return pick(lines ?? UNMET, salt);
}

/**
 * The failure line for the `cursor`-th failure of the session.
 *
 * Failure copy is read dozens of times in a row while somebody debugs a loop, and the same line
 * twice running is the moment it stops being funny and starts being wallpaper. Rotation fixes
 * that, but it must not be *random*: the store owns the cursor and only advances it when a run
 * actually fails, so re-rendering the report cannot reshuffle the wording under a player who is
 * still reading it.
 */
export function failureLineAt(code: FailureCode | undefined, cursor: number): string {
  const lines = (code ? BY_CODE[code] : undefined) ?? UNMET;
  return lines[Math.abs(Math.trunc(cursor)) % lines.length] ?? (lines[0] as string);
}

/**
 * A run that never reached the simulator has no `Verdict`, only a `RuntimeFailure.kind`. Map it
 * onto the engine's codes so a halt still reads as a halt rather than as an unmet objective.
 */
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

/** Generalization failure is the category that matters most. NARRATIVE.md §5. */
export function seedFailureLine(passedSeed: number, failedSeed: number): string {
  return `Passed on seed ${passedSeed}. Failed on seed ${failedSeed}. The field is not always the same field.`;
}

export const VERDICT_PASS = 'work order closed';
export const VERDICT_FAIL = 'work order open';

// ---------------------------------------------------------------------------
// Hardware requisitions
// ---------------------------------------------------------------------------

/**
 * What a piece of hardware is, and what having it changes.
 *
 * `spec` is documentation and obeys NARRATIVE.md §0: clean, factual, no personality. It is read by
 * somebody who has just been handed a new command and wants to know what it does. `opens` is the
 * delivery note's own sentence and lives in the brief's register — that is where the flavour is
 * allowed to be.
 */
export interface HardwareNote {
  spec: string;
  opens: string;
}

const HARDWARE: Record<string, HardwareNote> = {
  move: {
    spec: 'Moves the bot one tile in a direction. Returns false if the way is blocked. Costs 1 tick.',
    opens: 'The bot can be somewhere other than where it was left.',
  },
  pos: {
    spec: "Returns the bot's tile as { x, y }. Sensing is free.",
    opens: 'You can know where it is without anybody walking out to look.',
  },
  canMove: {
    spec: 'Returns whether a move in a direction would succeed. Sensing is free.',
    opens: 'The wall can be asked about before it is met.',
  },
  print: {
    spec: 'Writes one line to the console at the current tick. Sensing is free.',
    opens: 'The bot can tell you what it believes it is doing.',
  },
  wait: {
    spec: 'Holds the bot for n ticks. Costs n ticks.',
    opens: 'Doing nothing becomes something you can schedule.',
  },
  scan: {
    spec: "Returns what is on a neighbouring tile, or on the bot's own. Sensing is free.",
    opens: 'The bot stops needing to be told what is in front of it.',
  },
  harvest: {
    spec: "Takes the crop on the bot's tile into inventory. Costs 2 ticks.",
    opens: 'The fields can be worked without a person standing in one.',
  },
  plant: {
    spec: "Plants one seed from inventory on the bot's tile. Costs 2 ticks.",
    opens: 'What was taken can be put back, which Legal prefers we mention.',
  },
  inventory: {
    spec: 'Returns carried items and their counts. Sensing is free.',
    opens: 'The bot can check its own pockets.',
  },
  mine: {
    spec: "Breaks the deposit on the bot's tile into inventory. Costs 2 ticks.",
    opens: 'Rock becomes stock. The paperwork treats these as the same thing.',
  },
  pickup: {
    spec: "Lifts a loose item from the bot's tile. Costs 1 tick.",
    opens: 'Things on the ground stop being where they are.',
  },
  drop: {
    spec: "Places a carried item on the bot's tile. Costs 1 tick.",
    opens: 'A crate can end its day somewhere it was meant to.',
  },
  carrying: {
    spec: 'Returns what the bot is holding. Sensing is free.',
    opens: 'The manifest can be checked against the bot rather than against the manifest.',
  },
  use: {
    spec: 'Operates the machine on or beside the tile. Costs 2 ticks.',
    opens: 'The yard has machines. The machines have never had anyone to press them.',
  },
  look: {
    spec: 'Returns the tiles within line of sight. Sensing is free.',
    opens: 'The dark stops being uniformly dark.',
  },
  mark: {
    spec: "Writes a number onto the bot's current tile. Persists for the run. Costs 1 tick.",
    opens: 'The tunnels can be made to remember you were there.',
  },
  readMark: {
    spec: 'Returns the number written on a tile, or undefined. Sensing is free.',
    opens: 'A corridor you have already walked can say so.',
  },
  power: {
    spec: 'Returns the current draw and capacity of a grid node. Sensing is free.',
    opens: 'The grid can be read instead of guessed at.',
  },
  probe: {
    spec: 'Tests one node and reports its state. Sensing is free, but levels may budget it.',
    opens: 'You can ask the grid a question. The grid counts how often you ask.',
  },
  link: {
    spec: 'Runs cable between two adjacent nodes. Costs 2 ticks and spends cable.',
    opens: 'The map stops being fixed. You are now the one drawing it.',
  },
  receive: {
    spec: 'Returns the next frame on the listening band, or undefined. Sensing is free.',
    opens: 'Something on a dead band has been transmitting for some time.',
  },
  transmit: {
    spec: 'Sends one frame on the outbound band. Costs 1 tick.',
    opens: 'The listening post can, for the first time, answer.',
  },
  decode: {
    spec: 'Returns the decoded payload of a frame, or undefined on a checksum failure.',
    opens: 'Noise becomes a message, assuming it was ever noise.',
  },
  refuel: {
    spec: 'Restores the bot to full charge. Only at a depot tile. Costs 2 ticks.',
    opens: 'A bot that stops can be a bot that starts again.',
  },
  fuel: {
    spec: 'Returns remaining charge and capacity. Sensing is free.',
    opens: 'You find out how far it can go before it finds out.',
  },
  bot: {
    spec: 'Returns a handle to one bot by id. Every command on it is scheduled on its own clock.',
    opens: 'There is more than one bot now. They do not wait for each other.',
  },
  bots: {
    spec: 'Returns handles to every live bot. Sensing is free.',
    opens: 'The fleet can be addressed as a fleet.',
  },
  clock: {
    spec: "Returns the bot's own tick count. Sensing is free.",
    opens: 'Each bot keeps its own time. This is the whole difficulty and the whole opportunity.',
  },
  spawn: {
    spec: 'Brings a new bot online at a bay tile. Costs ticks on the spawning bot.',
    opens: 'Robots are cheap. This is the level at which the company means it.',
  },
  sync: {
    spec: 'Advances every clock to the latest one. Costs whatever the slowest bot still owed.',
    opens: 'A hundred independent clocks can be made to agree, at a price.',
  },
  send: {
    spec: 'Delivers a message to another bot. Costs 1 tick.',
    opens: 'Bots can tell each other things, which is how they stop queueing.',
  },
  recv: {
    spec: "Returns the next message in the bot's queue, or undefined. Sensing is free.",
    opens: 'Being told something becomes a thing a bot can do.',
  },
};

export function hardwareNote(name: string): HardwareNote {
  return (
    HARDWARE[name] ?? {
      spec: 'See the reference for the exact signature, cost, and edge behaviour.',
      opens: 'Fitted to the bot. Procurement have closed the requisition.',
    }
  );
}

export const REQUISITION_TITLE = 'HARDWARE REQUISITION — DELIVERED';
export const REQUISITION_FROM = 'Procurement, via Dep. Coordinator M. Vance';

/** One dry line under the header. Rotated by the number of items in the delivery. */
const REQUISITION_INTROS = [
  'The requisition has cleared. This is unusual and we would rather not examine it.',
  'Fitted to the bot before the paperwork cleared, which is the approved order of operations.',
  'Delivered, installed, and logged as a capability rather than as an asset. See Appendix C.',
  'Signed for on your behalf. The signature is not yours and the item is.',
];

export function requisitionIntro(salt: number): string {
  return pick(REQUISITION_INTROS, salt);
}

/** Dot, under the memo, as always. */
const REQUISITION_DOT = [
  'it works. it has always worked. nobody wrote down that it works',
  "read the reference before you trust it. i didn't, once",
  'this is the good one. you will use it more than they think',
  "it's cheaper than the last version and it is better. don't ask me why",
];

export function requisitionDot(salt: number): string {
  return pick(REQUISITION_DOT, salt);
}
