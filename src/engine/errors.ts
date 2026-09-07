import type { Vec } from './types.ts';

export const FailureCode = {
  /** `maxTicks` exceeded. */
  Halt: 'halt',
  /** `maxOps` exceeded: the program is looping over API calls without spending ticks. */
  OpLimit: 'oplimit',
  /** The program asked for something the world does not permit. */
  IllegalAction: 'illegal-action',
  /** The player's code threw. */
  Crash: 'crash',
  /** The worker never reported back; the main-thread watchdog killed it. */
  Timeout: 'timeout',
  /** The program ran cleanly but did not satisfy every objective. */
  ObjectivesUnmet: 'objectives-unmet',
  /** A bot was destroyed. */
  BotLost: 'bot-lost',
  /** The submitted source failed to transpile. */
  Compile: 'compile',
  /** A bot ran dry. DESIGN.md §4.4. */
  OutOfFuel: 'out-of-fuel',
  /** Every bot in a multi-bot level blocked every other, indefinitely. DESIGN.md §4.6. */
  BlockedLivelock: 'blocked-livelock',

  /**
   * DESIGN.md §4.6 spells these two in SCREAMING_CASE. Aliases so either name compiles; the
   * PascalCase keys above are canonical and both spellings share one value.
   */
  OUT_OF_FUEL: 'out-of-fuel',
  BLOCKED_LIVELOCK: 'blocked-livelock',
} as const;
export type FailureCode = (typeof FailureCode)[keyof typeof FailureCode];

export class SimError extends Error {
  readonly code: FailureCode;
  readonly at?: Vec;
  readonly botId?: number;

  constructor(code: FailureCode, message: string, details?: { at?: Vec; botId?: number }) {
    super(message);
    this.name = new.target.name;
    this.code = code;
    if (details?.at) this.at = details.at;
    if (details?.botId !== undefined) this.botId = details.botId;
  }
}

export class HaltError extends SimError {
  readonly maxTicks: number;

  constructor(maxTicks: number, botId?: number) {
    super(
      FailureCode.Halt,
      `Shift over. Your program burned through its ${maxTicks}-tick allowance and was powered down mid-task. ` +
        'Kessler & Daughters bills by the tick; consider a shorter route.',
      { botId },
    );
    this.maxTicks = maxTicks;
  }
}

export class OpLimitError extends SimError {
  readonly maxOps: number;

  constructor(maxOps: number, botId?: number) {
    super(
      FailureCode.OpLimit,
      `Your program issued more than ${maxOps} instructions without accomplishing much. ` +
        'This usually means a loop that senses forever but never acts.',
      { botId },
    );
    this.maxOps = maxOps;
  }
}

export class IllegalActionError extends SimError {
  constructor(message: string, details?: { at?: Vec; botId?: number }) {
    super(FailureCode.IllegalAction, message, details);
  }
}

export class OutOfFuelError extends SimError {
  readonly action: string;
  readonly required: number;
  readonly remaining: number;

  constructor(botId: number, botName: string, action: string, required: number, remaining: number) {
    super(
      FailureCode.OutOfFuel,
      `Bot #${botId} ("${botName}") ran out of fuel attempting ${action}: it needs ${required} ` +
        `and has ${remaining}. Fuel is restored by refuel() while parked on a depot tile. ` +
        'Kessler & Daughters does not operate a recovery service.',
      { botId },
    );
    this.action = action;
    this.required = required;
    this.remaining = remaining;
  }
}

export class LivelockError extends SimError {
  readonly botIds: number[];
  readonly rounds: number;

  constructor(botIds: readonly number[], rounds: number) {
    const names = botIds.map((id) => `#${id}`).join(', ');
    super(
      FailureCode.BlockedLivelock,
      `Livelock: every active bot (${names}) had its move blocked for ${rounds} consecutive ` +
        'rounds with nothing getting through. They are politely deadlocking each other. ' +
        'Stagger their routes, or use sync() and wait() to break the symmetry.',
    );
    this.botIds = botIds.slice();
    this.rounds = rounds;
  }
}

export function isSimError(value: unknown): value is SimError {
  return value instanceof SimError;
}
