/**
 * The Site Map — the assignment board of Kessler & Daughters Terraforming Ltd.
 *
 * Eight worlds, strung along a route. CONTENT owns the level list and a world does not have to
 * hold five: six work orders were withdrawn and the survivors kept their ids, so the number on a
 * disc is the order's position on the board rather than anything read out of its id.
 */
import { useCallback, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX, KeyboardEvent } from 'react';
import { emptyProgress } from '../../game/save.ts';
import type { LevelProgress, SaveFile } from '../../game/save.ts';
import {
  Medal,
  isGraded,
  levelMaxPoints,
  medalOf,
  progressPoints,
  starsFor,
} from '../../game/score.ts';
import { isLevelUnlocked, useGame } from '../../game/store.ts';
import { campaignOrder, levelsByWorld } from '../../levels/index.ts';
import { CommendationShelf, SHELF_ID } from '../components/CommendationShelf.tsx';
import { MedalBadge } from '../components/MedalBadge.tsx';
import type { LevelDef, WorldMeta } from '../../levels/index.ts';
import '../styles/screens.css';

type StyleVars = CSSProperties & Record<`--${string}`, string>;

type WorkOrderStatus = 'CLOSED' | 'OPEN' | 'ON HOLD';

interface WorkOrderNode {
  id: string;
  world: number;
  /** Position on the board, 1-based. Not `LevelDef.index`, which skips a withdrawn order. */
  index: number;
  level: LevelDef;
  progress: LevelProgress;
  status: WorkOrderStatus;
  playable: boolean;
  isNext: boolean;
}

interface WorldRow {
  world: WorldMeta;
  nodes: WorkOrderNode[];
  issued: number;
  closed: number;
  points: number;
  maxPoints: number;
  /** At par or under: gold, or closed where the level carries no ladder (DESIGN.md §7). */
  gold: number;
  /** Every issued work order in this world is closed. The sector is done. */
  complete: boolean;
  /** Every issued work order in this world is at par or under. */
  perfect: boolean;
}

interface Tally {
  points: number;
  maxPoints: number;
  /**
   * Medals held, and nothing else. An ungraded work order genuinely has no medal, so it belongs in
   * none of these three columns however it was closed (DESIGN.md §7).
   */
  gold: number;
  silver: number;
  bronze: number;
  /** Work orders closed at par or under, which an ungraded close is by definition. */
  atPar: number;
  stars: number;
  issued: number;
  closed: number;
}

function progressOf(save: SaveFile, levelId: string): LevelProgress {
  return save.levels[levelId] ?? emptyProgress();
}

/** DESIGN.md §7: gold at par, silver inside `SILVER_FACTOR`, bronze for finishing at all. */
const MEDAL_KEY = [
  { medal: 'gold', rule: 'at par or under' },
  { medal: 'silver', rule: 'up to a quarter over par' },
  { medal: 'bronze', rule: 'a pass' },
  /*
   * The fourth mark, and the only one that is not a rung. The first two work orders on the site
   * are ungraded (DESIGN.md §7), so a first-time player's opening hour draws `✓` on the board
   * and leaves gold, silver and bronze reading zero — and a key that stopped at bronze explained
   * three of the four marks in front of them and none of the three zeros.
   */
  { medal: 'closed', rule: 'not graded' },
] as const;

function medalWord(medal: Medal): string {
  return medal === Medal.None ? 'no medal' : `${medal} medal`;
}

export function buildRows(save: SaveFile): WorldRow[] {
  const nextUp = campaignOrder().find(
    (level) => isLevelUnlocked(save, level.id) && !progressOf(save, level.id).completed,
  );

  return levelsByWorld().map(({ world, levels }) => {
    const nodes: WorkOrderNode[] = levels.map((level, position) => {
      const progress = progressOf(save, level.id);
      const unlocked = isLevelUnlocked(save, level.id);
      return {
        id: level.id,
        world: world.id,
        index: position + 1,
        level,
        progress,
        status: progress.completed ? 'CLOSED' : unlocked ? 'OPEN' : 'ON HOLD',
        playable: unlocked,
        isNext: level.id === nextUp?.id,
      };
    });

    const issued = levels.length;
    const closed = nodes.filter((node) => node.status === 'CLOSED').length;
    const points = levels.reduce(
      (sum, level) => sum + progressPoints(level, progressOf(save, level.id)),
      0,
    );
    const maxPoints = levels.reduce(
      (sum, level) => sum + levelMaxPoints(level.bonus?.length ?? 0),
      0,
    );

    // A world holding an ungraded level could otherwise never be `perfect`, and `ALL AT PAR` would
    // be unattainable in worlds 1, 5 and 6 — a close there is worth a gold (DESIGN.md §7).
    const gold = levels.filter((level) => {
      const progress = progressOf(save, level.id);
      return isGraded(level) ? progress.medal === Medal.Gold : progress.completed;
    }).length;
    const complete = issued > 0 && closed === issued;

    return {
      world,
      nodes,
      issued,
      closed,
      points,
      maxPoints,
      gold,
      complete,
      perfect: complete && gold === issued,
    };
  });
}

export function campaignTally(rows: WorldRow[]): Tally {
  const tally: Tally = {
    points: 0,
    maxPoints: 0,
    gold: 0,
    silver: 0,
    bronze: 0,
    atPar: 0,
    stars: 0,
    issued: 0,
    closed: 0,
  };

  for (const row of rows) {
    tally.points += row.points;
    tally.maxPoints += row.maxPoints;
    tally.issued += row.issued;
    tally.closed += row.closed;
    tally.atPar += row.gold;
    for (const node of row.nodes) {
      tally.stars += starsFor(node.level.bonus, node.progress.stars);
      if (node.progress.medal === Medal.Gold) tally.gold++;
      else if (node.progress.medal === Medal.Silver) tally.silver++;
      else if (node.progress.medal === Medal.Bronze) tally.bronze++;
    }
  }

  return tally;
}

export function nodeLabel(node: WorkOrderNode): string {
  const name = `${node.id}, ${node.level.title}`;
  if (!node.playable) return `Work order ${name}. On hold. Locked.`;
  const stars = starsFor(node.level.bonus, node.progress.stars);
  const bonus = stars === 1 ? '1 bonus star.' : `${stars} bonus stars.`;
  const state = node.progress.completed ? 'Closed' : 'Open';
  // `no medal` on a closed ungraded order announces finished work as unfinished, in the identical
  // words an untouched graded order gets. An absent medal is not a missing one (DESIGN.md §7).
  const medal = medalOf(node.level, node.progress);
  const grade = medal === null ? 'Not graded' : medalWord(medal);
  return `Work order ${name}. ${state}. ${grade}. ${bonus}`;
}

function LockGlyph(): JSX.Element {
  return (
    <svg className="node__lock" viewBox="0 0 12 14" aria-hidden="true" focusable="false">
      <path d="M3 6V4.2a3 3 0 0 1 6 0V6" fill="none" stroke="currentColor" strokeWidth="1.2" />
      <rect
        x="1.6"
        y="6"
        width="8.8"
        height="6.6"
        rx="1"
        fill="none"
        stroke="currentColor"
        strokeWidth="1.2"
      />
    </svg>
  );
}

export function LevelSelect(): JSX.Element {
  const save = useGame((state) => state.save);
  const openLevel = useGame((state) => state.openLevel);
  const commendations = Object.keys(save.achievements).length;

  const rows = useMemo(() => buildRows(save), [save]);
  const tally = useMemo(() => campaignTally(rows), [rows]);
  const flat = useMemo(() => rows.flatMap((row) => row.nodes), [rows]);

  const campaignPercent = tally.issued > 0 ? (tally.closed / tally.issued) * 100 : 0;
  const campaignStyle: StyleVars = { '--campaign-fill': `${campaignPercent}%` };

  const firstStop =
    flat.find((node) => node.isNext) ?? flat.find((node) => node.playable) ?? flat[0];
  const [roving, setRoving] = useState<string>(firstStop ? firstStop.id : '');
  const buttons = useRef(new Map<string, HTMLButtonElement>());

  const registerNode = useCallback((id: string, element: HTMLButtonElement | null) => {
    if (element) buttons.current.set(id, element);
    else buttons.current.delete(id);
  }, []);

  /** Where each node sits on the board. Rows are no longer all the same length. */
  const seat = useMemo(() => {
    const map = new Map<string, { row: number; column: number; flat: number }>();
    let cursor = 0;
    rows.forEach((row, index) => {
      row.nodes.forEach((node, column) => {
        map.set(node.id, { row: index, column, flat: cursor });
        cursor++;
      });
    });
    return map;
  }, [rows]);

  const onKeyDown = useCallback(
    (event: KeyboardEvent<HTMLDivElement>) => {
      const deltas: Record<string, number> = { ArrowRight: 1, ArrowLeft: -1 };
      const step = deltas[event.key];
      const rowStep = event.key === 'ArrowDown' ? 1 : event.key === 'ArrowUp' ? -1 : 0;
      const home = event.key === 'Home';
      const end = event.key === 'End';
      if (step === undefined && rowStep === 0 && !home && !end) return;

      const from = flat.findIndex((node) => node.id === roving);
      if (from < 0) return;

      const direction = home ? 1 : end ? -1 : rowStep !== 0 ? rowStep : (step as number);
      let cursor = home ? 0 : end ? flat.length - 1 : from + (step ?? 0);

      if (rowStep !== 0) {
        const here = seat.get(roving);
        const target = here ? rows[here.row + rowStep] : undefined;
        const landing = target?.nodes[Math.min(here?.column ?? 0, target.nodes.length - 1)];
        if (!landing) {
          event.preventDefault();
          return;
        }
        cursor = seat.get(landing.id)?.flat ?? from;
      }

      while (cursor >= 0 && cursor < flat.length) {
        const candidate = flat[cursor];
        if (candidate && candidate.playable) {
          event.preventDefault();
          setRoving(candidate.id);
          buttons.current.get(candidate.id)?.focus();
          return;
        }
        cursor += direction;
      }
      event.preventDefault();
    },
    [flat, roving, rows, seat],
  );

  return (
    <div className="sitemap">
      <header className="sitemap__header">
        <div className="screen-ident">
          <h1 className="screen-title">SITE MAP</h1>
          <p className="screen-org">Kessler &amp; Daughters Terraforming Ltd. — Contractor #4471</p>
          <p className="screen-aside">
            Work orders are listed in the order Finance prefers them closed.
          </p>
        </div>

        <dl className="sitemap__stats numeric">
          <div className="screen-stat">
            <dt>POINTS</dt>
            <dd>
              {tally.points}/{tally.maxPoints} pts
            </dd>
          </div>
          <div className="screen-stat">
            <dt>CLOSED</dt>
            <dd>
              {tally.closed}/{tally.issued}
            </dd>
          </div>
          <div className="screen-stat">
            <dt>GOLD</dt>
            <dd className="screen-stat__gold">{tally.gold}</dd>
          </div>
          <div className="screen-stat">
            <dt>SILVER</dt>
            <dd className="screen-stat__silver">{tally.silver}</dd>
          </div>
          <div className="screen-stat">
            <dt>BRONZE</dt>
            <dd className="screen-stat__bronze">{tally.bronze}</dd>
          </div>
          <div className="screen-stat">
            <dt>STARS</dt>
            <dd>{tally.stars}</dd>
          </div>
          {/*
            The count is the door to the shelf. It used to be a `<dd>` printing a number against a
            record 2,900px further down the scroll with no link, no tab and no anchor to it
            (AUDIT-UI F14) — a control proportionate to what is behind it costs one anchor.
          */}
          <div className="screen-stat">
            <dt>COMMENDATIONS</dt>
            <dd>
              <a className="screen-stat__link" href={`#${SHELF_ID}`}>
                {commendations}
              </a>
            </dd>
          </div>
        </dl>

        {/*
          The key to the discs.
          Every medal in the game is drawn as a ring on a node and named nowhere, so the three
          words the whole scoring ladder runs on were on the screen forty times over and defined
          zero times. The samples are real nodes with the real modifier classes, so whichever art
          direction is loaded, the key is drawn in the same marks the board is.
        */}
        <ul className="medal-key" aria-label="Medal key">
          {MEDAL_KEY.map((entry) => (
            <li className="medal-key__row" key={entry.medal}>
              <span className="medal-key__sample" aria-hidden="true">
                {entry.medal === 'closed' ? (
                  <MedalBadge medal={null} />
                ) : (
                  <span className={`node node--${entry.medal}`}>
                    <span className="node__disc" />
                  </span>
                )}
              </span>
              <span className="medal-key__word">{entry.medal}</span>
              <span className="medal-key__rule">{entry.rule}</span>
            </li>
          ))}
        </ul>

        <div className="sitemap__progress">
          <div className="campaign-bar" style={campaignStyle}>
            <span className="campaign-bar__fill" />
          </div>
          <p className="campaign-bar__caption numeric">
            {Math.round(campaignPercent)}% of the site closed
            <span className="campaign-bar__aside"> · {tally.atPar} at par or under</span>
          </p>
        </div>
      </header>

      <div className="sitemap__scroll">
        <div className="sitemap__route" onKeyDown={onKeyDown}>
          <div className="sitemap__worlds">
            {rows.map((row) => {
              const fill = row.issued > 0 ? (row.closed / row.issued) * 100 : 0;
              /*
               * The world's colour comes from the art direction, not from the level definition.
               *
               * `WORLDS` carries eight literal accents, three of which are not in the palette at
               * all and two of which *are* reserved semantic tokens — World 7 is `--danger` and
               * World 8 is `--gold`, so on `w8-05` the world's colour and the medal being chased
               * are the same colour. Eight decorative hues on top of a six-colour semantic palette
               * is how a palette stops meaning anything (AUDIT-UI F1). Indirecting through
               * `--world-N` leaves the level data untouched and hands the decision to whichever
               * direction is loaded.
               */
              const style: StyleVars = {
                '--world-accent': `var(--world-${row.world.id})`,
                '--rail-fill': `${fill}%`,
              };

              return (
                <section
                  key={row.world.id}
                  className={row.complete ? 'world world--complete' : 'world'}
                  style={style}
                  aria-label={`World ${row.world.id}, ${row.world.name}`}
                >
                  <div className="world__meta">
                    <div className="world__head">
                      <span className="world__num numeric">
                        {String(row.world.id).padStart(2, '0')}
                      </span>
                      <div>
                        <h2 className="world__name">{row.world.name}</h2>
                        <p className="world__subtitle">{row.world.subtitle}</p>
                      </div>
                    </div>
                    <p className="world__blurb">{row.world.blurb}</p>
                    <p className="world__tally numeric">
                      {row.maxPoints > 0 ? `${row.points}/${row.maxPoints} pts` : '—/— pts'}
                      <span className="world__issued">
                        {' · '}
                        {row.closed}/{row.issued} closed
                      </span>
                    </p>
                    {row.complete ? (
                      <p
                        className={row.perfect ? 'world__stamp world__stamp--gold' : 'world__stamp'}
                      >
                        {row.perfect ? 'ALL AT PAR' : 'SECTOR NOMINAL'}
                      </p>
                    ) : null}
                  </div>

                  <div className="world__track">
                    <div className="world__rail" aria-hidden="true">
                      <span className="world__rail-fill" />
                    </div>
                    <ul className="world__nodes">
                      {row.nodes.map((node) => (
                        <li className="node-slot" key={node.id}>
                          <button
                            type="button"
                            ref={(element) => registerNode(node.id, element)}
                            className={[
                              'node',
                              `node--${node.progress.medal}`,
                              node.playable ? 'node--live' : 'node--locked',
                              node.isNext ? 'node--next' : '',
                            ]
                              .filter(Boolean)
                              .join(' ')}
                            disabled={!node.playable}
                            aria-disabled={!node.playable}
                            aria-label={nodeLabel(node)}
                            tabIndex={node.id === roving ? 0 : -1}
                            onFocus={() => setRoving(node.id)}
                            onClick={() => openLevel(node.id)}
                          >
                            <span className="node__disc">
                              {node.playable ? (
                                <span className="node__index numeric">
                                  {String(node.index).padStart(2, '0')}
                                </span>
                              ) : (
                                <LockGlyph />
                              )}
                            </span>
                          </button>

                          <span className="node__pips" aria-hidden="true">
                            {Array.from(
                              { length: starsFor(node.level.bonus, node.progress.stars) },
                              (_, pip) => (
                                <span className="node__pip" key={pip} />
                              ),
                            )}
                          </span>

                          <span className="node__id numeric">{node.id}</span>
                          <span className="node__title">
                            {node.playable ? node.level.title : ' '}
                          </span>
                          <span
                            className={`node__status status--${node.status.replace(' ', '-').toLowerCase()}`}
                          >
                            {/*
                              The grade in a glyph, beside the word. Colour was the sole channel
                              across 33 discs at 44px (AUDIT-UI F1), and a legend does not help you
                              tell two warm rings apart. `MedalBadge` prints `I / II / III / ✓`,
                              which survives greyscale and survives Signal. `✓` is the ungraded
                              close — the mark of finished work, not a fourth medal (DESIGN.md §7).
                              The button above already announces the grade, so this is for the
                              eye only.
                            */}
                            {node.progress.completed ? (
                              <span className="node__medal" aria-hidden="true">
                                <MedalBadge medal={medalOf(node.level, node.progress)} />
                              </span>
                            ) : null}
                            {node.status}
                          </span>
                        </li>
                      ))}
                    </ul>
                  </div>
                </section>
              );
            })}
          </div>

          <CommendationShelf achievements={save.achievements} />
        </div>
      </div>
    </div>
  );
}
