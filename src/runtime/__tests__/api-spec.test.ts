import { describe, expect, test } from 'vitest';
import { LEVELS } from '../../levels/index.ts';
import { PLAYER_API, apiForWorld, apiFunction, apiUnlockedAt, apiUnlockedBy } from '../api-spec.ts';
import { hardwareNote } from '../../ui/copy.ts';

/**
 * The API spec is the contract three agents depend on. These tests guard the properties they will
 * assume: unique names, complete metadata, and agreement with `LevelDef.hardware`.
 */
describe('PLAYER_API', () => {
  test('function names are unique', () => {
    const names = PLAYER_API.functions.map((f) => f.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('type names are unique', () => {
    const names = PLAYER_API.types.map((t) => t.name);
    expect(new Set(names).size).toBe(names.length);
  });

  test('every function is complete', () => {
    for (const fn of PLAYER_API.functions) {
      expect(fn.name, fn.name).toMatch(/^[a-z][A-Za-z]*$/);
      expect(fn.returns.length, fn.name).toBeGreaterThan(0);
      expect(fn.doc.length, fn.name).toBeGreaterThan(20);
      expect(fn.example.trim().length, fn.name).toBeGreaterThan(0);
      expect(fn.unlockedBy, fn.name).toMatch(/^w[1-8]-\d{2}$/);
      expect(fn.world, fn.name).toBe(Number(fn.unlockedBy[1]));
      for (const param of fn.params) {
        expect(param.name.length, `${fn.name}.${param.name}`).toBeGreaterThan(0);
        expect(param.type.length, `${fn.name}.${param.name}`).toBeGreaterThan(0);
        expect(param.doc.length, `${fn.name}.${param.name}`).toBeGreaterThan(0);
      }
    }
  });

  test('required parameters never follow optional ones', () => {
    for (const fn of PLAYER_API.functions) {
      const firstOptional = fn.params.findIndex((p) => p.optional);
      if (firstOptional === -1) continue;
      expect(
        fn.params.slice(firstOptional).every((p) => p.optional),
        fn.name,
      ).toBe(true);
    }
  });

  test('every type a signature mentions is declared', () => {
    const declared = new Set(PLAYER_API.types.map((t) => t.name));
    for (const fn of PLAYER_API.functions) {
      for (const required of fn.requiresTypes ?? []) {
        expect(declared.has(required), `${fn.name} requires ${required}`).toBe(true);
      }
    }
  });

  test('costs are non-negative numbers or a named argument', () => {
    for (const fn of PLAYER_API.functions) {
      if (typeof fn.cost === 'number') expect(fn.cost, fn.name).toBeGreaterThanOrEqual(0);
      else
        expect(
          fn.params.some((p) => p.name === fn.cost),
          fn.name,
        ).toBe(true);
    }
  });

  test('lookups agree with the data', () => {
    for (const fn of PLAYER_API.functions) {
      expect(apiFunction(fn.name)).toBe(fn);
      expect(apiForWorld(fn.world)).toContain(fn);
      expect(apiUnlockedAt(fn.unlockedBy)).toContain(fn.name);
      expect(apiUnlockedBy(fn.unlockedBy).map((f) => f.name)).toContain(fn.name);
    }
    expect(apiFunction('teleport')).toBeUndefined();
  });

  test('apiUnlockedBy grows monotonically across the campaign', () => {
    const ids = [...new Set(PLAYER_API.functions.map((f) => f.unlockedBy))].sort();
    let previous = 0;
    for (const id of ids) {
      const count = apiUnlockedBy(id).length;
      expect(count, id).toBeGreaterThan(previous);
      previous = count;
    }
    expect(previous).toBe(PLAYER_API.functions.length);
  });
});

describe('agreement with the level registry', () => {
  test('every registered level unlocks exactly what the spec says it does', () => {
    for (const level of LEVELS) {
      expect(level.hardware.slice().sort(), level.id).toEqual(apiUnlockedAt(level.id).sort());
    }
  });

  test('every spec unlock id is a level that exists or is still to be written', () => {
    const known = new Set(LEVELS.map((l) => l.id));
    for (const fn of PLAYER_API.functions) {
      if (!known.has(fn.unlockedBy)) continue;
      const level = LEVELS.find((l) => l.id === fn.unlockedBy);
      expect(level?.hardware, fn.name).toContain(fn.name);
    }
  });
});

/**
 * The requisition card is the last thing a player reads before writing the line, and it is written
 * by hand in `src/ui/copy.ts` rather than generated, so it can drift from the signature it
 * describes. It once promised a `number` from `mark`, which the compiler refused. These tests do
 * not police the wording: they only refuse a card that names a type the signature does not have,
 * or a price the spec does not charge.
 */
describe('the requisition card agrees with the spec', () => {
  const TYPE_WORDS = ['string', 'number', 'boolean', 'undefined', 'null'];

  test('every unlockable command has a card of its own', () => {
    const fallback = hardwareNote('no-such-hardware').spec;
    for (const fn of PLAYER_API.functions) {
      expect(hardwareNote(fn.name).spec, fn.name).not.toBe(fallback);
    }
  });

  test('no card names a type the signature does not have', () => {
    for (const fn of PLAYER_API.functions) {
      const spec = hardwareNote(fn.name).spec.toLowerCase();
      const signature = [fn.returns, ...fn.params.map((p) => p.type)].join(' ').toLowerCase();
      for (const word of TYPE_WORDS) {
        if (!new RegExp(`\\b${word}\\b`).test(spec)) continue;
        expect(signature.includes(word), `${fn.name} card says "${word}"`).toBe(true);
      }
    }
  });

  test('every price a card quotes is the price the spec charges', () => {
    for (const fn of PLAYER_API.functions) {
      const spec = hardwareNote(fn.name).spec;
      const quoted = /costs (\d+) tick/i.exec(spec);
      if (quoted) expect(Number(quoted[1]), fn.name).toBe(fn.cost);
      if (/\bfree\b/i.test(spec)) expect(fn.cost, fn.name).toBe(0);
    }
  });
});
