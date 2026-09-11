import { useMemo } from 'react';
import type { World } from '../../../engine/index.ts';
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
  active: boolean;
  progress?: [number, number];
  meter?: Meter;
  unit?: string;
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

  const banked = useGame((state) => (level ? state.save.levels[level.id]?.objectives : undefined));
  const bankedCount = useMemo(() => {
    if (!level || !banked) return 0;
    const ids = new Set(banked);
    return level.objectives.filter((objective) => ids.has(objective.id)).length;
  }, [level, banked]);

  const board = useMemo<World | null>(() => {
    if (trace) return replayTo(trace, flooredTick);
    return level ? level.build(level.seeds[0] as number) : null;
  }, [level, trace, flooredTick]);

  const showFuel = useMemo(() => (level ? levelUsesFuel(level) : false), [level]);
  const fuel = useMemo(() => {
    if (!showFuel || !trace || !board) return null;
    const bot = board.bots.find((candidate) => Number.isFinite(candidate.fuelMax));
    return bot ? { fuel: bot.fuel, max: bot.fuelMax } : null;
  }, [showFuel, trace, board]);

  const crew = useMemo(() => {
    if (!board) return [];
    return board.bots.map((bot) => {
      const carrying = bot.inventory.reduce((total, stack) => total + stack.count, 0);
      const kinds = new Set(bot.inventory.filter((stack) => stack.count > 0).map((s) => s.kind));
      return {
        id: bot.id,
        name: bot.name,
        alive: bot.alive,
        clock: Math.round(bot.clock),
        carrying,
        capacity: bot.capacity,
        cargo: kinds.size === 1 ? ([...kinds][0] ?? null) : null,
        waiting: bot.inbox.length,
      };
    });
  }, [board]);

  const manyBots = crew.length > 1;
  const showHold = crew.some((row) => Number.isFinite(row.capacity));

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

      {manyBots || showHold ? (
        <div className="rail-block">
          <h3>
            BOTS
            {manyBots ? <em className="numeric">{crew.length}</em> : null}
          </h3>
          <ul className="crew">
            {crew.map((row) => (
              <CrewItem key={row.id} row={row} clocks={manyBots} hold={showHold} />
            ))}
          </ul>
        </div>
      ) : null}
    </aside>
  );
}

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

interface CrewRow {
  id: number;
  name: string;
  alive: boolean;
  clock: number;
  carrying: number;
  capacity: number;
  cargo: string | null;
  waiting: number;
}

function CrewItem({
  row,
  clocks,
  hold,
}: {
  row: CrewRow;
  clocks: boolean;
  hold: boolean;
}): React.JSX.Element {
  const capped = hold && Number.isFinite(row.capacity);
  const full = capped && row.carrying >= row.capacity;
  return (
    <li className={`crew__bot${row.alive ? '' : ' crew__bot--lost'}`}>
      <span className="crew__name">{row.name}</span>
      {row.alive ? (
        <span className="crew__reads numeric">
          {clocks ? <span className="crew__clock">clock {row.clock}</span> : null}
          {capped ? (
            <span className={`crew__hold${full ? ' crew__hold--full' : ''}`}>
              {row.cargo ?? 'hold'} {row.carrying}/{row.capacity}
              {full ? ' full' : ''}
            </span>
          ) : null}
          {clocks ? <span className="crew__inbox">inbox {row.waiting}</span> : null}
        </span>
      ) : (
        <span className="crew__reads">lost</span>
      )}
      <span className="sr-only">
        {row.alive
          ? [
              clocks ? `clock ${String(row.clock)}` : '',
              capped
                ? `carrying ${String(row.carrying)} of ${String(row.capacity)}${full ? ', full' : ''}`
                : '',
              clocks ? `${String(row.waiting)} messages waiting` : '',
            ]
              .filter(Boolean)
              .join(', ')
          : 'lost'}
      </span>
    </li>
  );
}
