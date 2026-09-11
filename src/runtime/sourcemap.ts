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
