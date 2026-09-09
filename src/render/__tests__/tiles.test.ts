import { readFileSync } from 'node:fs';
import { resolve } from 'node:path';
import { describe, expect, it } from 'vitest';

import { Terrain } from '../../engine/index.ts';
import type { Tile } from '../../engine/index.ts';
import {
  CODE_TILE_NAMES,
  PLANT_STAGES,
  TILE_VOCABULARY,
  biomeArt,
  biomeForWorld,
  cellHash,
  itemTileName,
  machineTileName,
  missingFrames,
  parseAtlas,
  plantStageIndex,
  plantStageName,
  terrainArt,
} from '../tiles.ts';

const atlasJson: unknown = JSON.parse(
  readFileSync(resolve('public/assets/tiles/bootstrap_tiles_48.json'), 'utf8'),
);
const atlas = parseAtlas(atlasJson);
const resolvable = new Set([...atlas.keys(), ...CODE_TILE_NAMES]);

const ALL_TERRAIN: Terrain[] = Object.values(Terrain);
const ALL_BIOMES = [1, 2, 3, 4, 5, 6, 7, 8].map(biomeForWorld);

function tile(terrain: Terrain): Tile {
  return { terrain };
}

describe('atlas parsing', () => {
  it('reads every frame from the shipped atlas', () => {
    expect(atlas.size).toBe(134);
    const floor = atlas.get('floor.metal');
    expect(floor).toEqual({ x: 0, y: 0, w: 48, h: 48 });
  });

  it('ignores malformed input rather than throwing', () => {
    expect(parseAtlas(null).size).toBe(0);
    expect(parseAtlas({ frames: { bad: { x: 1 } } }).size).toBe(0);
  });
});

describe('tile vocabulary', () => {
  it('resolves every semantic name against the atlas or a code painter', () => {
    expect(missingFrames(TILE_VOCABULARY, atlas)).toEqual([]);
  });

  it('has no duplicate entries', () => {
    expect(new Set(TILE_VOCABULARY).size).toBe(TILE_VOCABULARY.length);
  });

  it('does not claim a code tile that the atlas already provides', () => {
    const overlap = CODE_TILE_NAMES.filter((name) => atlas.has(name));
    expect(overlap).toEqual([]);
  });

  it('covers every frame the atlas ships', () => {
    const vocabulary = new Set(TILE_VOCABULARY);
    const unused = [...atlas.keys()].filter((name) => !vocabulary.has(name));
    expect(unused).toEqual([]);
  });
});

describe('terrainArt', () => {
  it('never yields an unresolvable name', () => {
    const seen = new Set<string>();
    for (const biome of ALL_BIOMES) {
      for (const terrain of ALL_TERRAIN) {
        for (let y = 0; y < 20; y++) {
          for (let x = 0; x < 20; x++) {
            const art = terrainArt(terrain, tile(terrain), biome, x, y);
            seen.add(art.base);
            if (art.prop) seen.add(art.prop);
          }
        }
      }
    }
    const bad = [...seen].filter((name) => !resolvable.has(name));
    expect(bad).toEqual([]);
    // A biome that only ever emits one floor would look like wallpaper.
    expect(seen.size).toBeGreaterThan(20);
  });

  it('is deterministic per cell', () => {
    const a = terrainArt(Terrain.Floor, tile(Terrain.Floor), 'hangar', 4, 9);
    const b = terrainArt(Terrain.Floor, tile(Terrain.Floor), 'hangar', 4, 9);
    expect(a).toEqual(b);
  });

  it('marks blocking terrain as solid', () => {
    const solids = [Terrain.Wall, Terrain.Rock, Terrain.Ore, Terrain.Rubble, Terrain.Void];
    for (const terrain of solids) {
      expect(terrainArt(terrain, tile(terrain), 'cave', 1, 1).solid).toBe(true);
    }
    expect(terrainArt(Terrain.Floor, tile(Terrain.Floor), 'cave', 1, 1).solid).toBe(false);
  });
});

describe('biomes', () => {
  it('maps worlds 1..8 and clamps outside that', () => {
    expect(biomeForWorld(1)).toBe('hangar');
    expect(biomeForWorld(8)).toBe('finale');
    expect(biomeForWorld(0)).toBe('hangar');
    expect(biomeForWorld(99)).toBe('finale');
  });

  it('gives every biome at least two floor variants', () => {
    for (const biome of ALL_BIOMES) {
      expect(biomeArt(biome).floors.length).toBeGreaterThanOrEqual(2);
      expect(biomeArt(biome).accents.length).toBeGreaterThanOrEqual(1);
    }
  });

  it('produces a stable, well-spread cell hash', () => {
    expect(cellHash(3, 4)).toBe(cellHash(3, 4));
    expect(cellHash(3, 4)).not.toBe(cellHash(4, 3));
    let sum = 0;
    for (let i = 0; i < 1000; i++) sum += cellHash(i, i * 7);
    expect(sum / 1000).toBeGreaterThan(0.4);
    expect(sum / 1000).toBeLessThan(0.6);
  });
});

describe('growth ladders', () => {
  it('maps maturity onto six distinct stages', () => {
    expect(plantStageIndex(0, 8)).toBe(0);
    expect(plantStageIndex(8, 8)).toBe(PLANT_STAGES.length - 1);
    expect(plantStageIndex(9, 8)).toBe(PLANT_STAGES.length - 1);
    const seen = new Set<number>();
    for (let g = 0; g <= 8; g++) seen.add(plantStageIndex(g, 8));
    expect(seen.size).toBe(PLANT_STAGES.length);
  });

  it('never reports "ready" before maturity', () => {
    for (let g = 0; g < 8; g++) {
      expect(plantStageName(g, 8)).not.toBe(PLANT_STAGES[PLANT_STAGES.length - 1]);
    }
  });

  it('treats an unauthored maxGrowth as fully grown', () => {
    expect(plantStageIndex(0, 0)).toBe(PLANT_STAGES.length - 1);
  });

  it('keeps every ladder entry resolvable', () => {
    for (const name of PLANT_STAGES) {
      expect(resolvable.has(name)).toBe(true);
    }
  });
});

describe('item and machine names', () => {
  const itemKinds = [
    'regolith',
    'stone',
    'ore',
    'ice',
    'scrap',
    'seed',
    'crop',
    'crate',
    'part',
    'cell',
    'chip',
  ];
  const machineKinds = [
    'door',
    'lever',
    'furnace',
    'press',
    'sink',
    'source',
    'node',
    'antenna',
    'charger',
    'router',
  ];

  it('resolves every ItemKind', () => {
    for (const kind of itemKinds) expect(resolvable.has(itemTileName(kind))).toBe(true);
    expect(resolvable.has(itemTileName('unknown-kind'))).toBe(true);
  });

  it('resolves every MachineKind in every state it can hold', () => {
    for (const kind of machineKinds) {
      for (const state of ['idle', 'on', 'off', 'open', 'closed', 'busy']) {
        expect(resolvable.has(machineTileName(kind, state))).toBe(true);
      }
    }
  });

  it('gives doors and levers a distinct look per state', () => {
    expect(machineTileName('door', 'open')).not.toBe(machineTileName('door', 'closed'));
    expect(machineTileName('lever', 'on')).not.toBe(machineTileName('lever', 'off'));
    expect(machineTileName('node', 'off')).not.toBe(machineTileName('node', 'on'));
  });
});
