import { useMemo } from 'react';
import { replayTo } from '../../engine/index.ts';
import type { Budget } from '../../game/budgets.ts';
import { budgetFor, budgetReadout, overBudgetLine } from '../../game/budgets.ts';
import { activeTrack, metAt, playbackFor, progressAt } from '../../game/playback.ts';
import { currentLevel, levelUsesFuel, useGame } from '../../game/store.ts';
import { BudgetBar } from '../components/BudgetBar.tsx';
import { FuelGauge } from '../components/FuelGauge.tsx';

interface ObjectiveRow {
  id: string;
  label: string;
  met: boolean;
  bonus: boolean;
  /** The one the run is working towards at this tick. Exactly one row has it, or none. */
  active: boolean;
  progress?: [number, number];
  /** Set when this objective is something the run spends rather than something it completes. */
  budget?: Budget;
}

export function ObjectiveRail(): React.JSX.Element {
  const level = useGame(currentLevel);
  const verdict = useGame((state) => state.verdict);
  const trace = useGame((state) => state.trace);
  const tick = useGame((state) => state.tick);

  const flooredTick = Math.floor(tick);
  const playback = useMemo(() => playbackFor(level, trace), [level, trace]);
  const atEnd = !trace || flooredTick >= trace.endTick;
  const active = activeTrack(playback, flooredTick);

  /*
   * The rail is live during playback, not just afterwards.
   *
   * Objective state and progress both come from `src/game/playback.ts` — the run replayed forward
   * and evaluated as it goes — so a tick ticks over on screen at the moment the bot earned it,
   * and "7/12" counts up while you watch. At the very end the verdict wins: it is the record, and
   * it knows about ops and sense budgets that a partial replay cannot.
   */
  const rows: ObjectiveRow[] = useMemo(() => {
    if (!level) return [];
    const bonusIds = new Set((level.bonus ?? []).map((objective) => objective.id));
    const reported = new Map(verdict?.objectives.map((o) => [o.id, o]) ?? []);
    const tracks = new Map((playback?.tracks ?? []).map((track) => [track.id, track]));
    const defs = [...level.objectives, ...(level.bonus ?? [])];
    return defs.map((objective) => {
      const result = reported.get(objective.id);
      const track = tracks.get(objective.id);
      const met = atEnd ? (result?.met ?? false) : track ? metAt(track, flooredTick) : false;
      const row: ObjectiveRow = {
        id: objective.id,
        label: result?.label ?? objective.label,
        met,
        bonus: bonusIds.has(objective.id),
        active: !atEnd && active?.id === objective.id,
      };
      const live = track ? progressAt(track, flooredTick) : undefined;
      const progress = atEnd ? result?.progress : (live ?? result?.progress);
      if (progress) row.progress = progress;
      /*
       * The clamp in `progress()` is what makes an overrun invisible — 21 beams against a rating
       * of 16 reports 16/16 — so the real spend is recovered from the trace at this tick. Live and
       * at the end it is the same call, because the trace is the same evidence either way.
       */
      const budget = budgetFor(row, {
        trace,
        tick: flooredTick,
        ...(verdict ? { stats: verdict.stats } : {}),
        ...(track ? { history: track.progress } : {}),
      });
      if (budget) row.budget = budget;
      return row;
    });
  }, [level, verdict, playback, atEnd, active, flooredTick, trace]);

  /*
   * Objective credit is banked per objective, not per run (`LevelProgress.objectives`), and a
   * multi-seed level is the one place a player cannot see it any other way: an objective that has
   * held on every layout is closed work, even on a run where its neighbour failed. Without this
   * line the rail resets to the last run and five objectives read as one unfinished bit.
   */
  const banked = useGame((state) => (level ? state.save.levels[level.id]?.objectives : undefined));
  const bankedCount = useMemo(() => {
    if (!level || !banked) return 0;
    const ids = new Set(banked);
    return level.objectives.filter((objective) => ids.has(objective.id)).length;
  }, [level, banked]);

  const showFuel = useMemo(() => (level ? levelUsesFuel(level) : false), [level]);
  const fuel = useMemo(() => {
    if (!showFuel || !trace) return null;
    const world = replayTo(trace, flooredTick);
    const bot = world.bots.find((candidate) => Number.isFinite(candidate.fuelMax));
    return bot ? { fuel: bot.fuel, max: bot.fuelMax } : null;
  }, [showFuel, trace, flooredTick]);

  if (!level) return <div className="panel rail" />;

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
          <span className="par-row__label">seeds</span>
          <span>{level.seeds.length}</span>
        </div>
        {level.objectives.length > 1 ? (
          <div className="par-row">
            <span className="par-row__label">closed on every seed</span>
            <span className={bankedCount === total ? 'par-row__value--good' : undefined}>
              {bankedCount} / {level.objectives.length}
            </span>
          </div>
        ) : null}
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

/**
 * One objective, as a tick-box or as a gauge.
 *
 * A budget gets the bar and the unit-bearing readout; everything else keeps the box and the plain
 * "7/12". The two are deliberately different shapes, because they mean opposite things: a full box
 * is the goal and a full bar is the failure.
 */
function ObjectiveItem({ row }: { row: ObjectiveRow }): React.JSX.Element {
  const budget = row.budget;
  const over = budget !== undefined && budget.over > 0;
  const className = [
    'objective',
    row.met ? 'objective--met' : 'objective--pending',
    row.bonus ? 'objective--bonus' : '',
    row.active ? 'objective--active' : '',
    budget ? 'objective--budget' : '',
    over ? 'objective--over' : '',
  ]
    .filter(Boolean)
    .join(' ');
  return (
    <div className={className} aria-current={row.active ? 'step' : undefined}>
      <span className="objective__mark" aria-hidden="true">
        {over ? '!' : row.met && !budget ? '✓' : row.active ? '▸' : ''}
      </span>
      <span className="objective__label">{row.label}</span>
      {budget ? (
        <span className={`objective__progress${over ? ' objective__progress--over' : ''}`}>
          {budgetReadout(budget)}
        </span>
      ) : row.progress ? (
        <span className="objective__progress">
          {row.progress[0]}/{row.progress[1]}
        </span>
      ) : null}
      {budget ? <BudgetBar budget={budget} /> : null}
      <span className="sr-only">
        {over
          ? `over budget — ${overBudgetLine(budget)}`
          : row.met
            ? 'met'
            : row.active
              ? 'in progress'
              : 'outstanding'}
      </span>
    </div>
  );
}
