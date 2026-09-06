/**
 * The machine's account of the work order, tucked against the program's right edge.
 *
 * It is the old `ObjectiveRail`, moved onto the terminal's own screen and stripped of the fold.
 * The fold existed because the card floated over the board and the player sometimes wanted the
 * width back; inside the terminal it has a permanent home and takes nothing from
 * anybody, so there is nothing to fold away from.
 *
 * Two things the old card could not do are done here. `docs/AUDIT-UI.md` F22 recorded the label
 * and its readout as siblings on one row in a card clamped between 168 and 232px, so a label wrapped
 * mid-phrase — the column is taller and narrower now, and the readout sits *under* the label rather
 * than beside it. And DESIGN.md §11 A7's rule that an ungraded work order never prints "par" is
 * carried over word for word, because `src/ui/__tests__/limit-and-par.test.ts` is the record of
 * what those words have to be.
 */
import { useMemo } from 'react';
import { replayTo } from '../../../engine/index.ts';
import type { Budget, Meter } from '../../../game/budgets.ts';
import { budgetFor, budgetReadout, overBudgetLine } from '../../../game/budgets.ts';
import { activeTrack, metAt, playbackFor, progressAt } from '../../../game/playback.ts';
import { isGraded } from '../../../game/score.ts';
import { currentLevel, levelUsesFuel, useGame } from '../../../game/store.ts';
import { BudgetBar } from '../../components/BudgetBar.tsx';
import { FuelGauge } from '../../components/FuelGauge.tsx';

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

export function Rail(): React.JSX.Element {
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

  if (!level) return <aside className="rail" aria-label="Objectives and targets" />;

  const ticks = verdict?.stats.ticks;
  const met = rows.filter((row) => !row.bonus && row.met).length;
  const total = rows.filter((row) => !row.bonus).length;
  const bonus = rows.filter((row) => row.bonus);

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
    <aside className="rail" aria-label="Objectives and targets">
      <div className="rail-block">
        <h3>
          OBJECTIVES
          <em className="numeric">
            {met}/{total}
          </em>
        </h3>
        <ul className="objs">
          {rows
            .filter((row) => !row.bonus)
            .map((row) => (
              <ObjectiveItem key={row.id} row={row} />
            ))}
        </ul>
      </div>

      {bonus.length > 0 ? (
        <div className="rail-block">
          <h3>
            BONUS<em>worth a star</em>
          </h3>
          <ul className="objs objs--bonus">
            {bonus.map((row) => (
              <ObjectiveItem key={row.id} row={row} />
            ))}
          </ul>
        </div>
      ) : null}

      <div className="rail-block rail-block--targets">
        <h3>TARGETS</h3>
        {/*
          On an ungraded work order (DESIGN.md §11 A7) par is not a target, so it is not drawn as
          one. The clock still shows — it is the number `personalBestLine` compares against, and
          both playtesters called that the best reward in the game — but there is no denominator
          to fall short of and no red for falling short of it. A `78 / 78` in green on the level
          whose only correct program costs 78 is the ladder in miniature, and it teaches exactly
          the lesson A7 exists to stop teaching.

          Both numbers here are what the last run *cost*. The playhead is the transport's number
          and it is never printed twice (docs/AUDIT-UI.md F22).
        */}
        <dl className="targets">
          <dt>{graded ? 'par' : 'ticks'}</dt>
          {graded ? (
            <dd
              className={
                ticks === undefined
                  ? undefined
                  : ticks <= level.par.ticks
                    ? 'par-row__value--good'
                    : 'par-row__value--over'
              }
            >
              {ticks ?? '—'} / {level.par.ticks}
            </dd>
          ) : (
            <dd>{ticks ?? '—'}</dd>
          )}

          {hardStop !== undefined ? (
            <>
              <dt>shift ends at</dt>
              <dd className={ticks !== undefined && ticks > hardStop ? 'par-row__value--over' : ''}>
                {hardStop}
              </dd>
            </>
          ) : null}

          <dt>seeds</dt>
          <dd>{level.seeds.length}</dd>

          {level.objectives.length > 1 ? (
            <>
              <dt>closed on every seed</dt>
              <dd className={bankedCount === total ? 'par-row__value--good' : ''}>
                {bankedCount} / {level.objectives.length}
              </dd>
            </>
          ) : null}
        </dl>
        {graded && hasTickLimit ? (
          <p className="par-note">par sets the medal. the limit ends the work order.</p>
        ) : null}
      </div>

      {fuel ? (
        <div className="rail-block">
          <h3>FUEL</h3>
          <FuelGauge fuel={fuel.fuel} max={fuel.max} />
        </div>
      ) : null}
    </aside>
  );
}

/**
 * One objective, as a tick-box or as a gauge.
 *
 * A budget gets the bar and the unit-bearing readout; everything else keeps the box and the plain
 * "7/12". The two are deliberately different shapes, because they mean opposite things: a full box
 * is the goal and a full bar is the failure.
 *
 * The `objective*` marks are the same ones the run report draws, and they are the contract
 * `src/ui/__tests__/rail-report-agreement.test.ts` reads both surfaces through: a budget that read
 * as a gauge while the run played and as a tick-box in the report is two different claims about
 * the same number. What changed on the desk is only where the readout sits — under the label
 * rather than beside it (docs/AUDIT-UI.md F22) — which is layout, not a claim.
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
    <li className={className} aria-current={row.active ? 'step' : undefined}>
      <i className="objective__mark" aria-hidden="true">
        {over ? '!' : row.met && !budget ? '✓' : row.active ? '▸' : '☐'}
      </i>
      <span className="objective__body">
        <span className="objective__label">{row.label}</span>
        <span className="objective__read">
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
        </span>
        {budget ? <BudgetBar budget={budget} /> : null}
      </span>
      <span className="sr-only">
        {over
          ? `over budget — ${overBudgetLine(budget)}`
          : row.met
            ? 'met'
            : row.active
              ? 'in progress'
              : 'outstanding'}
      </span>
    </li>
  );
}
