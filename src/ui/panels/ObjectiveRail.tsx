import { useMemo } from 'react';
import type { Trace } from '../../engine/index.ts';
import { replayTo } from '../../engine/index.ts';
import { currentLevel, levelUsesFuel, useGame } from '../../game/store.ts';
import { countChars } from '../../game/score.ts';
import { FuelGauge } from '../components/FuelGauge.tsx';

interface ObjectiveRow {
  id: string;
  label: string;
  met: boolean;
  bonus: boolean;
  progress?: [number, number];
}

/**
 * Objective state as of the current playback tick, from the trace's `objective` events. Before a
 * run there are no events, so everything reads as outstanding — which is the truth.
 */
function stateAtTick(trace: Trace | null, tick: number): Map<string, boolean> {
  const state = new Map<string, boolean>();
  if (!trace) return state;
  for (const event of trace.events) {
    if (event.t > tick) break;
    if (event.kind === 'objective') state.set(event.id, event.state === 'met');
  }
  return state;
}

export function ObjectiveRail(): React.JSX.Element {
  const level = useGame(currentLevel);
  const verdict = useGame((state) => state.verdict);
  const trace = useGame((state) => state.trace);
  const tick = useGame((state) => state.tick);
  const code = useGame((state) => state.code);

  const flooredTick = Math.floor(tick);
  const live = useMemo(() => stateAtTick(trace, flooredTick), [trace, flooredTick]);
  const atEnd = !trace || flooredTick >= trace.endTick;

  const rows: ObjectiveRow[] = useMemo(() => {
    if (!level) return [];
    const bonusIds = new Set((level.bonus ?? []).map((objective) => objective.id));
    const reported = new Map(verdict?.objectives.map((o) => [o.id, o]) ?? []);
    const defs = [...level.objectives, ...(level.bonus ?? [])];
    return defs.map((objective) => {
      const result = reported.get(objective.id);
      const met = live.has(objective.id)
        ? (live.get(objective.id) ?? false)
        : atEnd && (result?.met ?? false);
      const row: ObjectiveRow = {
        id: objective.id,
        label: result?.label ?? objective.label,
        met,
        bonus: bonusIds.has(objective.id),
      };
      if (result?.progress) row.progress = result.progress;
      return row;
    });
  }, [level, verdict, live, atEnd]);

  const showFuel = useMemo(() => (level ? levelUsesFuel(level) : false), [level]);
  const fuel = useMemo(() => {
    if (!showFuel || !trace) return null;
    const world = replayTo(trace, flooredTick);
    const bot = world.bots.find((candidate) => Number.isFinite(candidate.fuelMax));
    return bot ? { fuel: bot.fuel, max: bot.fuelMax } : null;
  }, [showFuel, trace, flooredTick]);

  if (!level) return <div className="panel rail" />;

  const chars = countChars(code);
  const ticks = verdict?.stats.ticks;
  const met = rows.filter((row) => !row.bonus && row.met).length;
  const total = rows.filter((row) => !row.bonus).length;

  return (
    <section className="panel rail" aria-label="Objectives and targets">
      <header className="panel__head">
        <span>objectives</span>
        <span className="panel__head-spacer" />
        <span style={{ fontVariantNumeric: 'tabular-nums' }}>
          {met}/{total}
        </span>
      </header>

      <div className="rail__section">
        {rows
          .filter((row) => !row.bonus)
          .map((row) => (
            <ObjectiveItem key={row.id} row={row} />
          ))}
      </div>

      {rows.some((row) => row.bonus) ? (
        <div className="rail__section">
          <div className="rail__label">bonus — worth a star</div>
          {rows
            .filter((row) => row.bonus)
            .map((row) => (
              <ObjectiveItem key={row.id} row={row} />
            ))}
        </div>
      ) : null}

      <div className="rail__section">
        <div className="rail__label">targets</div>
        <div className="par-row">
          <span className="par-row__label">ticks</span>
          <span
            className={
              ticks === undefined
                ? undefined
                : ticks <= level.par.ticks
                  ? 'par-row__value--good'
                  : 'par-row__value--over'
            }
          >
            {ticks ?? '—'} / {level.par.ticks}
          </span>
        </div>
        <div className="par-row">
          <span className="par-row__label">chars</span>
          <span className={chars <= level.par.chars ? 'par-row__value--good' : 'par-row__value--over'}>
            {chars} / {level.par.chars}
          </span>
        </div>
        <div className="par-row">
          <span className="par-row__label">seeds</span>
          <span>{level.seeds.length}</span>
        </div>
      </div>

      {fuel ? (
        <div className="rail__section">
          <div className="rail__label">fuel</div>
          <FuelGauge fuel={fuel.fuel} max={fuel.max} />
        </div>
      ) : null}
    </section>
  );
}

function ObjectiveItem({ row }: { row: ObjectiveRow }): React.JSX.Element {
  const className = [
    'objective',
    row.met ? 'objective--met' : 'objective--pending',
    row.bonus ? 'objective--bonus' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className}>
      <span className="objective__mark" aria-hidden="true">
        {row.met ? '✓' : ''}
      </span>
      <span className="objective__label">{row.label}</span>
      {row.progress ? (
        <span className="objective__progress">
          {row.progress[0]}/{row.progress[1]}
        </span>
      ) : null}
      <span className="sr-only">{row.met ? 'met' : 'outstanding'}</span>
    </div>
  );
}
