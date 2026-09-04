/**
 * Just enough source-map decoding to map an emitted line back to the player's line.
 *
 * This is not optional polish. The TypeScript emitter *deletes* type-only lines: an `interface`
 * or a `type` alias in the middle of a program shifts every line below it, so a runtime error
 * would point at the wrong line for anyone who declares a type. Subtracting the wrapper offset
 * alone is only correct for programs with no erased lines.
 *
 * Only the line dimension is decoded, and only the first segment of each generated line — that is
 * all the error reporter needs, and it keeps this to one small pure function that a test can pin
 * down. No dependency: `source-map` would be a new package for forty lines of VLQ.
 */

const BASE64 = 'ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz0123456789+/';

const CHAR_TO_INT = new Map<string, number>();
for (let i = 0; i < BASE64.length; i++) CHAR_TO_INT.set(BASE64[i] as string, i);

const VLQ_CONTINUATION = 0x20;
const VLQ_VALUE_MASK = 0x1f;

interface Cursor {
  index: number;
}

function decodeVlq(text: string, cursor: Cursor): number | undefined {
  let result = 0;
  let shift = 0;
  let byte: number | undefined;

  do {
    const character = text[cursor.index];
    if (character === undefined) return undefined;
    byte = CHAR_TO_INT.get(character);
    if (byte === undefined) return undefined;
    cursor.index += 1;
    result += (byte & VLQ_VALUE_MASK) << shift;
    shift += 5;
  } while ((byte & VLQ_CONTINUATION) !== 0);

  const negative = (result & 1) === 1;
  result >>>= 1;
  return negative ? -result : result;
}

/**
 * `lineMap[generatedLine - 1]` is the 1-based original line, or `0` when the emitter produced
 * that line out of nothing.
 *
 * Accepts either the raw `mappings` string or a whole source-map JSON document.
 */
export function decodeLineMap(sourceMap: string): number[] {
  let mappings = sourceMap;
  const trimmed = sourceMap.trim();
  if (trimmed.startsWith('{')) {
    try {
      const parsed: unknown = JSON.parse(trimmed);
      const candidate =
        typeof parsed === 'object' && parsed !== null
          ? (parsed as { mappings?: unknown }).mappings
          : undefined;
      mappings = typeof candidate === 'string' ? candidate : '';
    } catch {
      return [];
    }
  }

  if (mappings === '') return [];

  const lineMap: number[] = [];
  let originalLine = 0;

  for (const group of mappings.split(';')) {
    if (group === '') {
      lineMap.push(0);
      continue;
    }

    let mapped = 0;
    let first = true;
    for (const segment of group.split(',')) {
      const cursor: Cursor = { index: 0 };
      const fields: number[] = [];
      while (cursor.index < segment.length) {
        const value = decodeVlq(segment, cursor);
        if (value === undefined) break;
        fields.push(value);
      }
      if (fields.length < 4) continue;
      originalLine += fields[2] as number;
      if (first) {
        mapped = originalLine + 1;
        first = false;
      }
    }
    lineMap.push(mapped);
  }

  return lineMap;
}

/**
 * Maps an emitted line to the player's line, walking forward if the emitter produced a line with
 * no origin (a helper it inserted). Returns the emitted line unchanged when there is no map, which
 * is exactly right for the common case of a program with nothing to erase.
 */
export function toSourceLine(emittedLine: number, lineMap: readonly number[] | undefined): number {
  if (!lineMap || lineMap.length === 0) return emittedLine;
  if (emittedLine < 1) return emittedLine;

  for (let i = emittedLine - 1; i < lineMap.length; i++) {
    const mapped = lineMap[i];
    if (mapped !== undefined && mapped > 0) return mapped;
  }
  for (let i = Math.min(emittedLine - 1, lineMap.length - 1); i >= 0; i--) {
    const mapped = lineMap[i];
    if (mapped !== undefined && mapped > 0) return mapped;
  }
  return emittedLine;
}
