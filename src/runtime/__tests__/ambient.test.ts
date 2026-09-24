import { describe, expect, test } from 'vitest';
import { PLAYER_API } from '../api-spec.ts';
import {
  apiFunctionsFor,
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
  test('declares exactly the unlocked functions', () => {
    const dts = buildAmbientDts(W1_01);
    expect(dts).toContain('declare function move(dir: Dir): boolean;');
    expect(dts).toContain('declare function pos(): Vec;');
    expect(dts).toContain('declare function print(');
    expect(dts).not.toContain('declare function canMove(');
    expect(dts).not.toContain('declare function scan(');
  });

  test('a locked function is absent, which is what makes calling it a type error', () => {
    const dts = buildAmbientDts(W1_01);
    for (const fn of PLAYER_API.functions) {
      if (W1_01.includes(fn.name)) continue;
      expect(dts, fn.name).not.toContain(`declare function ${fn.name}(`);
    }
  });

  test('pulls in the types a signature needs, and only those', () => {
    const dts = buildAmbientDts(W1_01);
    expect(dts).toContain('declare const Dir:');
    expect(dts).toContain('interface Vec');
    expect(dts).not.toContain('interface TileView');
    expect(dts).not.toContain('declare const ItemKind:');
  });

  test('drags in transitive types: TileView needs ItemStack, ItemKind and Terrain', () => {
    const dts = buildAmbientDts(W2_02);
    expect(dts).toContain('interface TileView');
    expect(dts).toContain('interface ItemStack');
    expect(dts).toContain('declare const ItemKind:');
    expect(dts).toContain('declare const Terrain:');
    expect(dts).toContain('interface Vec');
  });

  test('every type referenced by a declaration is itself declared, at every unlock point', () => {
    const ids = [...new Set(PLAYER_API.functions.map((fn) => fn.unlockedBy))].sort();
    for (const id of ids) {
      const names = unlockedApiNames(id);
      const dts = buildAmbientDts(names);
      const declared = requiredTypesFor(apiFunctionsFor(names)).map((type) => type.name);
      for (const fn of apiFunctionsFor(names)) {
        for (const required of fn.requiresTypes ?? []) {
          expect(declared, `${id}/${fn.name}`).toContain(required);
        }
        expect(dts, `${id}/${fn.name}`).toContain(renderSignature(fn));
      }
    }
  });

  test('carries the doc text as JSDoc so hover tooltips work', () => {
    const dts = buildAmbientDts(W1_01);
    expect(dts).toContain('Steps one tile in `dir`');
    expect(dts).toContain('@param dir The direction to step in.');
    expect(dts).toContain('@example');
    expect(dts).toContain('Costs 1 tick.');
    expect(dts).toContain('Free: costs no ticks');
  });

  test('spells out a default value in the parameter doc, since `declare` cannot carry one', () => {
    const dts = buildAmbientDts(unlockedApiNames('w4-01'));
    expect(dts).toContain('declare function look(dir: Dir, range?: number): TileView[];');
    expect(dts).toContain('Defaults to `Infinity`.');
  });

  test('never opens a JSDoc it does not close', () => {
    const dts = buildAmbientDts(unlockedApiNames('w8-05'));
    const opened = dts.split('/**').length - 1;
    const closed = dts.split('*/').length - 1;
    expect(closed).toBe(opened);
  });

  test('is a script, not a module: no import or export may appear', () => {
    const dts = buildAmbientDts(unlockedApiNames('w8-05'));
    expect(dts).not.toMatch(/^\s*(import|export)\b/m);
  });

  test('an empty unlock set still produces a valid, empty declaration file', () => {
    const dts = buildAmbientDts([]);
    expect(dts).not.toContain('declare function');
    expect(dts).not.toContain('interface Vec');
  });

  test('unknown names are ignored rather than emitted', () => {
    expect(buildAmbientDts(['move', 'teleport'])).not.toContain('teleport');
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
