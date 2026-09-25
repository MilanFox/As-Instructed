import { describe, expect, test } from 'vitest';
import { LEVELS } from '../../levels/index.ts';
import { PLAYER_API, apiForWorld, apiFunction, apiUnlockedAt } from '../api-spec.ts';
import { unlockedApiNames } from '../ambient.ts';
import { hardwareNote } from '../../ui/copy.ts';

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
    }
    expect(apiFunction('teleport')).toBeUndefined();
  });

  test('the unlocked set grows monotonically across the campaign', () => {
    const ids = [...new Set(PLAYER_API.functions.map((f) => f.unlockedBy))].sort();
    let previous = 0;
    for (const id of ids) {
      const count = unlockedApiNames(id).length;
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

describe('the reference names only calls its reader has', () => {
  const unlock = new Map(PLAYER_API.functions.map((fn) => [fn.name, fn.unlockedBy]));

  function called(text: string): string[] {
    return [...text.matchAll(/`([A-Za-z][A-Za-z0-9]*)\s*\(/g)].map((match) => match[1] ?? '');
  }

  test('every call the prose names is fitted by the time the entry is', () => {
    for (const fn of PLAYER_API.functions) {
      const prose = [fn.doc, ...fn.params.map((param) => param.doc)];
      for (const name of prose.flatMap(called)) {
        if (name === fn.name) continue;
        const at = unlock.get(name);
        expect(at, `${fn.name} names ${name}(), which no level installs`).toBeDefined();
        expect(
          (at ?? '') <= fn.unlockedBy,
          `${fn.name} unlocks at ${fn.unlockedBy} and names ${name}(), fitted at ${at ?? '?'}`,
        ).toBe(true);
      }
    }
  });

  test('no example calls hardware the entry has not been fitted with yet', () => {
    for (const fn of PLAYER_API.functions) {
      for (const match of fn.example.matchAll(/\b([A-Za-z][A-Za-z0-9]*)\s*\(/g)) {
        const name = match[1] ?? '';
        const at = unlock.get(name);
        if (at === undefined) continue;
        expect(
          at <= fn.unlockedBy,
          `the ${fn.unlockedBy} example for ${fn.name} calls ${name}(), fitted at ${at}`,
        ).toBe(true);
      }
    }
  });
});
