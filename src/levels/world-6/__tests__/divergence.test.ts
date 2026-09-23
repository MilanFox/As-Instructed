import { describe, expect, test } from 'vitest';
import type { Objective, ObjectiveContext, Sim, World } from '../../../engine/index.ts';
import { NOTHING, evaluateObjectives } from '../../../engine/index.ts';
import { must } from '../../../engine/__tests__/helpers.ts';
import { runLevel } from '../../harness.ts';
import { flatReader } from '../../__tests__/naive.ts';
import type { LevelDef } from '../../types.ts';
import { playerApi } from '../__solutions__/_api.ts';
import { additive, postVar, queued, weighted } from '../signal.ts';
import { w6_01 } from '../w6-01.ts';
import { w6_02 } from '../w6-02.ts';
import { w6_03 } from '../w6-03.ts';
import { w6_04 } from '../w6-04.ts';
import { w6_05 } from '../w6-05.ts';

function diverge(
  level: LevelDef,
  seed: number,
  id: string,
  drive: (sim: Sim, bot: number) => void,
) {
  const result = runLevel(level, seed, drive);
  const pool: Objective[] = [...level.objectives, ...(level.bonus ?? [])];
  const objective = must(
    pool.find((each) => each.id === id),
    id,
  );
  const ctx: ObjectiveContext = {
    world: result.world,
    trace: result.trace,
    initialWorld: result.initialWorld,
    ops: result.ops,
  };
  const [report] = evaluateObjectives([objective], ctx);
  return must(report, id);
}

describe('w6-01 names the line the log first got wrong', () => {
  test('a program that prints nothing is told what the first packet said', () => {
    const first = must(queued(w6_01.build(1))[0], 'a packet');
    const report = diverge(w6_01, 1, 'log-the-band', () => undefined);

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'line 1',
      expected: first,
      received: NOTHING,
    });
  });

  test('a log with no ping line is told one was wanted, and never where the ping sat', () => {
    const band = queued(w6_01.build(1));
    const report = diverge(w6_01, 1, 'name-the-ping', (sim, botId) => {
      const { receive, print } = playerApi(sim, botId, 'w6-01');
      for (let packet = receive(); packet !== null; packet = receive()) print(packet);
    });
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown).toEqual({
      where: 'the ping line',
      expected: 'one line naming the ping',
      received: NOTHING,
    });
    expect(band.indexOf('SESS 4470 ACTIVE')).toBeGreaterThanOrEqual(0);
    expect(`${shown.where} ${shown.expected} ${shown.received}`).not.toContain(
      String(band.indexOf('SESS 4470 ACTIVE')),
    );
  });
});

interface Corrupt {
  index: number;
  bytes: number[];
}

function sortBand(world: World): { clean: string[]; corrupt: Corrupt[] } {
  const salt = postVar(world, 'salt');
  const clean: string[] = [];
  const corrupt: Corrupt[] = [];
  queued(world).forEach((text, index) => {
    const star = text.indexOf('*');
    const bytes = text.slice(0, star).split(',').map(Number);
    const claimed = text
      .slice(star + 1)
      .split(',')
      .map(Number);
    if (additive(bytes, salt) === claimed[0] && weighted(bytes, salt) === claimed[1]) {
      clean.push(text);
      return;
    }
    corrupt.push({ index, bytes });
  });
  return { clean, corrupt };
}

describe('w6-02 names the packet the relay handled the wrong way', () => {
  test('a run that relays the whole band is told which packet should have been held', () => {
    const first = must(sortBand(w6_02.build(1)).corrupt[0], 'a corrupt packet');
    const report = diverge(w6_02, 1, 'relay-clean', (sim, botId) => {
      const { receive, transmit } = playerApi(sim, botId, 'w6-02');
      for (let packet = receive(); packet !== null; packet = receive()) transmit(packet);
    });

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: `packet ${String(first.index)} on the band`,
      expected: 'held back',
      received: 'relayed',
    });
  });

  test('a run that relays nothing is told which packet should have gone first', () => {
    const report = diverge(w6_02, 1, 'relay-clean', () => undefined);

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'packet 0 on the band',
      expected: 'relayed',
      received: 'nothing more was sent',
    });
  });

  test('a run that skips one clean packet is told which one it dropped', () => {
    const clean = sortBand(w6_02.build(1)).clean;
    const report = diverge(w6_02, 1, 'relay-clean', (sim, botId) => {
      const { receive, transmit } = playerApi(sim, botId, 'w6-02');
      const band: string[] = [];
      for (let packet = receive(); packet !== null; packet = receive()) band.push(packet);
      for (const packet of band) {
        if (packet === clean[0]) continue;
        if (clean.includes(packet)) transmit(packet);
      }
    });

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'packet 0 on the band',
      expected: 'relayed',
      received: 'not relayed',
    });
  });

  test('a fault report that names the wrong byte is told only that it is the wrong byte', () => {
    const { corrupt } = sortBand(w6_02.build(1));
    const first = must(corrupt[0], 'a corrupt packet');
    const guess = (packet: Corrupt): number => (packet.bytes.length - 1) % packet.bytes.length;
    const report = diverge(w6_02, 1, 'name-the-fault', (sim, botId) => {
      const { print } = playerApi(sim, botId, 'w6-02');
      for (const packet of corrupt) {
        print(`bad ${String(packet.index)} ${String(guess(packet))}`);
      }
    });

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: `packet ${String(first.index)} on the band`,
      expected: 'the byte that explains both checks',
      received: `byte ${String(guess(first))}`,
    });
  });

  test('the fault report never contains the altered byte itself', () => {
    const { corrupt } = sortBand(w6_02.build(1));
    const report = diverge(w6_02, 1, 'name-the-fault', () => undefined);
    const shown = must(report.divergence, 'a divergence');

    expect(shown.expected).toBe('a line naming its altered byte');
    expect(corrupt.length).toBeGreaterThan(0);
    expect(shown.received).toBe(NOTHING);
  });

  test('a clean shift with no report at all is told the nil return was wanted', () => {
    expect(sortBand(w6_02.build(2)).corrupt).toEqual([]);
    const report = diverge(w6_02, 2, 'name-the-fault', () => undefined);

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'the fault report',
      expected: 'bad none',
      received: NOTHING,
    });
  });
});

describe('w6-03 prices the return packet against the shortest the format allows', () => {
  test('a route sent straight back is told how long it is and how long it may be', () => {
    const report = diverge(w6_03, 1, 'shorter-encoding', (sim, botId) => {
      const { receive, transmit, probe, decode } = playerApi(sim, botId, 'w6-03');
      const key = probe('mast')?.vars.key ?? 0;
      transmit(decode(receive() ?? '', key));
    });
    const shown = must(report.divergence, 'a divergence');
    const characters = (field: string): number => Number(field.split(' ')[0]);

    expect(report.met).toBe(false);
    expect(shown.where).toBe('characters on the wire');
    expect(shown.expected).toMatch(/^\d+ characters$/);
    expect(shown.received).toMatch(/^\d+ characters$/);
    expect(characters(shown.received)).toBeGreaterThan(characters(shown.expected));
  });

  test('a route that is not the route is told the first move it disagrees on', () => {
    const report = diverge(w6_03, 1, 'shorter-encoding', (sim, botId) => {
      playerApi(sim, botId, 'w6-03').transmit('17E14S6N');
    });

    expect(report.met).toBe(false);
    expect(report.divergence).toEqual({
      where: 'move 2 of the route',
      expected: 'S',
      received: 'E',
    });
  });

  test('a line that is not a route at all is told the format', () => {
    const report = diverge(w6_03, 1, 'shorter-encoding', (sim, botId) => {
      playerApi(sim, botId, 'w6-03').transmit('nonsense');
    });

    expect(report.divergence).toEqual({
      where: 'the return packet',
      expected: 'a count then N, E, S or W',
      received: 'nonsense',
    });
  });

  test('a run that sends nothing is told one line was wanted', () => {
    const report = diverge(w6_03, 1, 'shorter-encoding', () => undefined);

    expect(report.divergence).toEqual({
      where: 'the return packet',
      expected: '1 line',
      received: 'nothing sent',
    });
  });
});

describe('w6-04 names the packet the relay sent in the wrong alphabet', () => {
  test('a band relayed untouched is told the first packet did not open with the header', () => {
    const report = diverge(w6_04, 1, 'relay-plain', (sim, botId) => {
      const { receive, transmit } = playerApi(sim, botId, 'w6-04');
      for (let packet = receive(); packet !== null; packet = receive()) transmit(packet);
    });
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toBe('packet 0');
    expect(shown.expected).toBe('plain text opening "KD//"');
    expect(shown.received).not.toContain('KD//');
  });

  test('a straggler read with the headed key is told which shift that was', () => {
    const report = diverge(w6_04, 1, 'straggler', (sim, botId) => {
      const { receive, transmit, decode } = playerApi(sim, botId, 'w6-04');
      const band: string[] = [];
      for (let packet = receive(); packet !== null; packet = receive()) band.push(packet);
      const headed = band.slice(0, -1);
      let key = 0;
      for (let candidate = 0; candidate < 95; candidate++) {
        if (decode(headed[0] as string, candidate).startsWith('KD//')) key = candidate;
      }
      for (const packet of headed) transmit(decode(packet, key));
      transmit(decode(band[band.length - 1] as string, key));
    });
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toBe('the straggler');
    expect(shown.expected).toBe('the one shift in the stated alphabet');
    expect(shown.received).toMatch(/^shift \d+$/);
  });

  test('the straggler report never contains a word of the straggler', () => {
    const report = diverge(w6_04, 1, 'straggler', () => undefined);
    const shown = must(report.divergence, 'a divergence');

    expect(shown).toEqual({
      where: 'the headed packets',
      expected: 'all 8 in plain text first',
      received: '0 of 8',
    });
    expect(`${shown.expected} ${shown.received}`).not.toContain('repeater');
  });
});

describe('w6-05 names the pad and the block the repair report got wrong', () => {
  test('a bot that never drove is told the pad and where it stopped', () => {
    const world = w6_05.build(1);
    const start = must(world.bots[0], 'the bot').at;
    const report = diverge(w6_05, 1, 'reach-pad', () => undefined);
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toBe('end of run');
    expect(shown.received).toBe(`(${String(start.x)}, ${String(start.y)})`);
    expect(shown.expected).toMatch(/^\(\d+, \d+\)$/);
    expect(shown.expected).not.toBe(shown.received);
  });

  test('the flat reader clears the depth-1 seed and is still short a repair report', () => {
    const report = diverge(w6_05, 2, 'repair-blocks', (sim, botId) => {
      flatReader.run(sim, botId);
    });
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toMatch(/^block \d+ on the band$/);
    expect(shown.expected).toBe('a repair for it');
    expect(shown.received).toBe(NOTHING);
  });

  test('a wrong repair is told it is wrong and not what the right one says', () => {
    const report = diverge(w6_05, 1, 'repair-blocks', (sim, botId) => {
      playerApi(sim, botId, 'w6-05').print('fix main|1E');
    });
    const shown = must(report.divergence, 'a divergence');

    expect(report.met).toBe(false);
    expect(shown.where).toMatch(/^block \d+ on the band$/);
    expect(shown.expected).toBe('the line it was sent as, repaired');
    expect(shown.received).toBe('fix main|1E');
  });
});
