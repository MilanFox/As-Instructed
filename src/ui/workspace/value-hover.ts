import type { ApiCall, CallLog } from '../../engine/index.ts';
import { callLine } from './call-text.ts';

const GHOST_MAX = 48;
const HOVER_ROWS = 20;
const UNRECORDED = 'not recorded — call log full';

const ROW_MAX = 64;
const NBSP = '\u00a0';

const lastRecorded = new WeakMap<CallLog, number>();

function lastRecordedEvent(log: CallLog): number {
  const known = lastRecorded.get(log);
  if (known !== undefined) return known;
  let last = -1;
  for (const call of log.calls) last = Math.max(last, call.eventIndex, ...call.events);
  lastRecorded.set(log, last);
  return last;
}

export function pastCallLog(log: CallLog | undefined, eventIndex: number): boolean {
  return log !== undefined && log.dropped > 0 && eventIndex > lastRecordedEvent(log);
}

export function ghostText(
  calls: readonly ApiCall[],
  unrecorded: boolean,
  max: number = GHOST_MAX,
): string | null {
  const [first] = calls;
  if (first === undefined) return unrecorded ? UNRECORDED : null;
  const more = calls.length > 1 ? ` +${String(calls.length - 1)}` : '';
  return callLine(first, Math.min(max, GHOST_MAX) - more.length) + more;
}

// Monaco renders hovers as markdown, so a snapshot like `[1, 2]` or `a_b` must not become a
// link or emphasis.
function escapeMarkdown(text: string): string {
  return text.replace(/[\\`*_{}[\]()#+\-.!|<>~]/g, '\\$&');
}

export function seekTarget(call: ApiCall, eventCount: number): number | null {
  const index = call.events[0] ?? call.eventIndex;
  return index >= 0 && index < eventCount ? index : null;
}

interface HoverRow {
  text: string;
  link: string;
}

function hoverRows(calls: readonly ApiCall[], commandLink: (call: ApiCall) => string): HoverRow[] {
  const shown = calls.slice(0, HOVER_ROWS);
  const tickWidth = Math.max(...shown.map((call) => String(call.t).length));
  return shown.map((call) => {
    const tick = `t${String(call.t).padEnd(tickWidth, NBSP)}`;
    return { text: `${tick}${NBSP}${NBSP}${callLine(call, ROW_MAX)}`, link: commandLink(call) };
  });
}

export function lineHover(
  calls: readonly ApiCall[],
  unrecorded: boolean,
  commandLink: (call: ApiCall) => string,
): string | null {
  const count = calls.length;
  if (count === 0) return unrecorded ? `_${UNRECORDED}_` : null;
  const lines = [`**${String(count)} ${count === 1 ? 'call' : 'calls'} from this line**`];
  for (const row of hoverRows(calls, commandLink)) {
    lines.push(`[${escapeMarkdown(row.text)}](${row.link} "go to this call")`);
  }
  if (count > HOVER_ROWS) lines.push(`… ${String(count - HOVER_ROWS)} more`);
  if (unrecorded) lines.push(`_${UNRECORDED}_`);
  return lines.join('  \n');
}
