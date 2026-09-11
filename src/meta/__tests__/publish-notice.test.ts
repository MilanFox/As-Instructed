import { beforeEach, describe, expect, test } from 'vitest';
import { nestedRoutineNames } from '../publish.ts';
import { emptyLibrary } from '../save.ts';
import { useLibrary } from '../store.ts';

const STRAIGHT_LINE = 'move();\nmove();\nturn();\n';

const NESTED = `while (scan()) {
  const step = (n: number) => n + 1;
  drop(step(1));
}
`;

const FACTORED = 'export function sweep(): void {}\n';

function briefed(patch: Partial<ReturnType<typeof emptyLibrary>> = {}): void {
  useLibrary.setState({
    save: { ...emptyLibrary(), unlocked: true, briefed: true, ...patch },
    notice: null,
  });
}

describe('a work order with nothing publishable in it', () => {
  beforeEach(() => {
    useLibrary.getState().hydrate(null);
  });

  test('says so instead of going quiet', () => {
    briefed();
    useLibrary.getState().reviewForPublish('w3-01', STRAIGHT_LINE, []);
    const notice = useLibrary.getState().notice;
    expect(notice?.levelId).toBe('w3-01');
    expect(notice?.nested).toEqual([]);
    expect(useLibrary.getState().offer).toBeNull();
  });

  test('names the routine the player wrote but left nested', () => {
    briefed();
    useLibrary.getState().reviewForPublish('w3-01', NESTED, []);
    expect(useLibrary.getState().notice?.nested).toEqual(['step']);
  });

  test('opens no dialog — the offer stays silent when there is nothing to tick', () => {
    briefed();
    useLibrary.getState().offerPublish('w3-01', STRAIGHT_LINE, []);
    expect(useLibrary.getState().offer).toBeNull();
  });
});

describe('when the notice is not owed', () => {
  beforeEach(() => {
    useLibrary.getState().hydrate(null);
  });

  test('a factored work order gets the offer, not the notice', () => {
    briefed();
    useLibrary.getState().reviewForPublish('w3-01', FACTORED, []);
    expect(useLibrary.getState().notice).toBeNull();
    useLibrary.getState().offerPublish('w3-01', FACTORED, []);
    expect(useLibrary.getState().offer?.levelId).toBe('w3-01');
  });

  test('never before the delivery note', () => {
    useLibrary.setState({
      save: { ...emptyLibrary(), unlocked: true, briefed: false },
      notice: null,
    });
    useLibrary.getState().reviewForPublish('w3-01', STRAIGHT_LINE, []);
    expect(useLibrary.getState().notice).toBeNull();
  });

  test('never before the Repository exists at all', () => {
    useLibrary.setState({ save: emptyLibrary(), notice: null });
    useLibrary.getState().reviewForPublish('w3-01', STRAIGHT_LINE, []);
    expect(useLibrary.getState().notice).toBeNull();
  });

  test('a player who said no stays said-no, for that work order', () => {
    briefed({ publishDeclined: ['w3-01'] });
    useLibrary.getState().reviewForPublish('w3-01', STRAIGHT_LINE, []);
    expect(useLibrary.getState().notice).toBeNull();
    useLibrary.getState().reviewForPublish('w3-02', STRAIGHT_LINE, []);
    expect(useLibrary.getState().notice?.levelId).toBe('w3-02');
  });

  test('a player who said never stays said-never', () => {
    briefed({ publishMuted: true });
    useLibrary.getState().reviewForPublish('w3-01', STRAIGHT_LINE, []);
    expect(useLibrary.getState().notice).toBeNull();
  });

  test('it stops once anything has been published: the habit was the message', () => {
    briefed({ published: [{ name: 'sweep', fromLevel: 'w3-01', at: 0 }] });
    useLibrary.getState().reviewForPublish('w3-02', STRAIGHT_LINE, []);
    expect(useLibrary.getState().notice).toBeNull();
  });

  test('a stale notice is cleared by the next result', () => {
    briefed();
    useLibrary.getState().reviewForPublish('w3-01', STRAIGHT_LINE, []);
    expect(useLibrary.getState().notice).not.toBeNull();
    useLibrary.getState().reviewForPublish('w3-02', FACTORED, []);
    expect(useLibrary.getState().notice).toBeNull();
  });
});

describe('the off switch', () => {
  beforeEach(() => {
    useLibrary.getState().hydrate(null);
  });

  test('muting from the notice turns the whole prompt off', () => {
    briefed();
    useLibrary.getState().reviewForPublish('w3-01', STRAIGHT_LINE, []);
    useLibrary.getState().muteNotice();
    expect(useLibrary.getState().notice).toBeNull();
    expect(useLibrary.getState().save.publishMuted).toBe(true);
    useLibrary.getState().reviewForPublish('w3-02', STRAIGHT_LINE, []);
    expect(useLibrary.getState().notice).toBeNull();
  });
});

describe('nestedRoutineNames', () => {
  test('finds an indented function declaration', () => {
    expect(nestedRoutineNames('function main() {\n  function step() {}\n}\n')).toEqual(['step']);
  });

  test('finds an indented arrow bound to a const', () => {
    expect(nestedRoutineNames('function main() {\n  const step = (n) => n + 1;\n}\n')).toEqual([
      'step',
    ]);
  });

  test('ignores data, loop counters and column-zero declarations', () => {
    const source = [
      'const map = [1, 2, 3];',
      'function main() {',
      '  const best = 0;',
      '  for (const tile of map) drop(tile);',
      '  const label = `x${best}`;',
      '}',
    ].join('\n');
    expect(nestedRoutineNames(source)).toEqual([]);
  });

  test('ignores commented-out code', () => {
    expect(nestedRoutineNames('function main() {\n  // const step = () => 1;\n}\n')).toEqual([]);
  });

  test('reports each name once', () => {
    const source =
      'function a() {\n  const step = () => 1;\n}\nfunction b() {\n  const step = () => 2;\n}\n';
    expect(nestedRoutineNames(source)).toEqual(['step']);
  });
});
