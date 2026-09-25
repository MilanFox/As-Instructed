import { describe, expect, test } from 'vitest';
import { PLAYER_API } from '../api-spec.ts';
import { LEVELS } from '../../levels/index.ts';
import {
  buildAmbientDts,
  renderSignature,
  requiredTypesFor,
  unlockedApiNames,
} from '../ambient.ts';
import { implementedApiNames } from '../api-bindings.ts';

const W1_01 = ['move', 'pos', 'print', 'wait'];
const W2_02 = unlockedApiNames('w2-01');

describe('unlockedApiNames', () => {
  test('grows with the campaign and never goes backwards', () => {
    expect(unlockedApiNames('w1-01')).toEqual(W1_01);
    expect(unlockedApiNames('w1-02')).toEqual(['move', 'pos', 'print', 'wait', 'canMove']);
    expect(W2_02).toEqual([...unlockedApiNames('w1-02'), 'scan', 'harvest', 'plant']);
    expect(unlockedApiNames('w8-05')).toEqual(PLAYER_API.functions.map((fn) => fn.name));
  });

  test('an unknown, earlier level id unlocks nothing', () => {
    expect(unlockedApiNames('w0-01')).toEqual([]);
  });
});

describe('buildAmbientDts', () => {
  const dts = buildAmbientDts();

  test('declares every function and every type, whatever level is open', () => {
    for (const fn of PLAYER_API.functions) expect(dts, fn.name).toContain(renderSignature(fn));
    for (const type of PLAYER_API.types) {
      if (type.name !== 'Bot') expect(dts, type.name).toContain(type.declaration);
    }
    expect(buildAmbientDts()).toBe(dts);
  });

  test('every type a signature needs is declared', () => {
    const declared = requiredTypesFor(PLAYER_API.functions).map((type) => type.name);
    for (const fn of PLAYER_API.functions) {
      for (const required of fn.requiresTypes ?? []) expect(declared, fn.name).toContain(required);
    }
  });

  test('carries the doc text as JSDoc so hover tooltips work', () => {
    expect(dts).toContain('Steps one tile in `dir`');
    expect(dts).toContain('@param dir The direction to step in.');
    expect(dts).toContain('@example');
    expect(dts).toContain('Costs 1 tick.');
    expect(dts).toContain('Free: costs no ticks');
  });

  test('says in the hover which level installs each command', () => {
    expect(dts).toContain('Unlocked in level w2-01.');
  });

  test('spells out a default value in the parameter doc, since `declare` cannot carry one', () => {
    expect(dts).toContain('declare function look(dir: Dir, range?: number): TileView[];');
    expect(dts).toContain('Defaults to `Infinity`.');
  });

  test('never opens a JSDoc it does not close', () => {
    expect(dts.split('*/').length).toBe(dts.split('/**').length);
  });

  test('is a script, not a module: no import or export may appear', () => {
    expect(dts).not.toMatch(/^\s*(import|export)\b/m);
  });
});

describe('unlockedApiNames reads the level definitions', () => {
  test('and agrees with the level each spec entry names', () => {
    for (const level of LEVELS) {
      const expected = PLAYER_API.functions
        .filter((fn) => fn.unlockedBy <= level.id)
        .map((fn) => fn.name);
      expect(unlockedApiNames(level.id), level.id).toEqual(expected);
    }
  });
});

describe('the spec, the declarations and the implementations agree', () => {
  test('every declared function has a real implementation behind it', () => {
    const implemented = new Set(implementedApiNames());
    for (const fn of PLAYER_API.functions) {
      expect(implemented.has(fn.name), fn.name).toBe(true);
    }
  });
});
