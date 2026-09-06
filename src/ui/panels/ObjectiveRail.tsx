import { useMemo } from 'react';
import { replayTo } from '../../engine/index.ts';
import type { Budget, Meter } from '../../game/budgets.ts';
import { budgetFor, budgetReadout, overBudgetLine } from '../../game/budgets.ts';
import { activeTrack, metAt, playbackFor, progressAt } from '../../game/playback.ts';
import { isGraded } from '../../game/score.ts';
import { currentLevel, levelUsesFuel, useGame } from '../../game/store.ts';
import { BudgetBar } from '../components/BudgetBar.tsx';
import { FuelGauge } from '../components/FuelGauge.tsx';
import { setRailOpen, useRail } from '../hooks/useRail.ts';

const TICK_OBJECTIVE = /\bticks?\b/i;

interface ObjectiveRow {
  id: string;
  label: string;
  met: boolean;
  bonus: boolean;
  /** The one the run is working towards at this tick. Exactly one row has it, or none. */
  active: boolean;
  progress?: [number, number];
  /** Declared by the objective (DESIGN.md §11 A13). Without it `budgetFor` parses the label. */
  meter?: Meter;
  /** Declared by the objective. Without it the noun is taken from the label. */
  unit?: string;
  /** Set when this objective is something the run spends rather than something it completes. */
  budget?: Budget;
}

export function ObjectiveRail(): React.JSX.Element {
  const level = useGame(currentLevel);
  const verdict = useGame((state) => state.verdict);
  const trace = useGame((state) => state.trace);
  const tick = useGame((state) => state.tick);
  const open = useRail();

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
        ...(objective.meter ? { meter: objective.meter } : {}),
        ...(objective.unit ? { unit: objective.unit } : {}),
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

  if (!level) return open ? <div className="hud-card rail" /> : <RailTab met={0} total={0} />;

  const ticks = verdict?.stats.ticks;
  const met = rows.filter((row) => !row.bonus && row.met).length;
  const total = rows.filter((row) => !row.bonus).length;

  if (!open) return <RailTab met={met} total={total} />;

  const graded = isGraded(level);
  const gradesTicks = level.objectives.some(
    (objective) => objective.meter?.kind === 'ticks' || TICK_OBJECTIVE.test(objective.label),
  );
  const hardStop = gradesTicks ? undefined : level.budget?.maxTicks;
  /*
   * Two tick numbers, two words for them (docs/FIX-INCENTIVES.md §H).
   *
   * `w8-01` asks for 215 and pars at 165, and until this line both were called ticks — so the one
   * that ends the work order and the one that moves the medal were indistinguishable. The
   * objective keeps the number, because a limit is something the level asked for; `targets` keeps
   * par, because a medal is something the site awards. The note is only drawn where both are on
   * the screen at once, which is the only place the confusion exists.
   */
  const hasTickLimit = gradesTicks || level.budget?.maxTicks !== undefined;

  return (
    <section className="hud-card rail" aria-label="Objectives and targets">
      {/*
        The one number on the board that says how the run is going, sized to be read from the far
        side of the screen. Everything under it is detail, and it is set as detail.
      */}
      <header className="hud-card__head">
        <span className="hud-card__label">objectives</span>
        <span className="panel__head-spacer" />
        <span className="hud-card__count numeric">
          {met}
          <span className="hud-card__of">/{total}</span>
        </span>
        <button
          type="button"
          className="hud-card__fold"
          aria-expanded={true}
          aria-label="Fold the objectives away"
          title="Fold away (O) — the board takes the width"
          onClick={() => setRailOpen(false)}
        >
          <span aria-hidden="true">‹</span>
        </button>
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
        {/*
          On an ungraded work order (DESIGN.md §11 A7) par is not a target, so it is not drawn as
          one. The clock still shows — it is the number `personalBestLine` compares against, and
          both playtesters called that the best reward in the game — but there is no denominator
          to fall short of and no red for falling short of it. A `78 / 78` in green on the level
          whose only correct program costs 78 is the ladder in miniature, and it teaches exactly
          the lesson A7 exists to stop teaching.
        */}
        <div className="par-row">
          <span className="par-row__label">{graded ? 'par' : 'ticks'}</span>
          {graded ? (
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
          ) : (
            <span>{ticks ?? '—'}</span>
          )}
        </div>
        {hardStop !== undefined ? (
          <div className="par-row">
            <span className="par-row__label">shift ends at</span>
            <span
              className={
                ticks !== undefined && ticks > hardStop ? 'par-row__value--over' : undefined
              }
            >
              {hardStop}
            </span>
          </div>
        ) : null}
        {graded && hasTickLimit ? (
          <p className="par-note">par sets the medal. the limit ends the work order.</p>
        ) : null}
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
 * The folded read-out: the count, and the way back to the rest of it.
 *
 * It keeps the score visible, because "3/5" is the one thing on the card worth reading from across
 * the room and losing it would make folding a real cost rather than a trade. It sits in the strip
 * the layout still holds back, so pressing it never means hunting for a control over the grid.
 */
function RailTab({ met, total }: { met: number; total: number }): React.JSX.Element {
  return (
    <button
      type="button"
      className="rail-tab"
      aria-expanded={false}
      aria-label={`Objectives, ${met} of ${total} met — unfold`}
      title="Unfold the objectives (O)"
      onClick={() => setRailOpen(true)}
    >
      <span className="rail-tab__count numeric" aria-hidden="true">
        {met}/{total}
      </span>
      <span aria-hidden="true">objectives</span>
    </button>
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
      {!row.bonus && budget?.meter?.kind === 'ticks' ? (
        <span className="objective__gate">limit</span>
      ) : null}
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
