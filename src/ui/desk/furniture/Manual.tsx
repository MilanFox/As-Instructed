import { Fragment, useEffect, useMemo, useRef, useState } from 'react';

import { currentLevel, unlockedHardware, useGame } from '../../../game/store.ts';
import { campaignOrder } from '../../../levels/index.ts';
import { PLAYER_API, apiForWorld } from '../../../runtime/api-spec.ts';
import type { ApiFunctionSpec, ApiTypeSpec } from '../../../runtime/protocol.ts';
import { Markdown } from '../../components/Markdown.tsx';
import { closeOverlay, openOverlay, useOverlay } from '../../hooks/useOverlay.ts';
import { KEY_LIST } from '../terminal/keys.ts';
import type { LegendSection } from './legend.ts';
import { legendFor } from './legend.ts';
import { CATEGORIES, GUIDES, MEMORY, costLabel, levelCost, matches } from './reference.ts';
import type { GuidePage } from './reference.ts';

declare global {
  interface WindowEventMap {
    'bootstrap:docs-focus': CustomEvent<{ name: string }>;
  }
}

const HIGHLIGHT_MS = 1800;

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function Signature({ fn }: { fn: ApiFunctionSpec }): React.JSX.Element {
  return (
    <code className="mo-sig">
      <span className="sig-fn">{fn.name}</span>
      <span className="sig-punct">(</span>
      {fn.params.map((param, index) => (
        <Fragment key={param.name}>
          {index > 0 ? <span className="sig-punct">, </span> : null}
          <span className="sig-param">{param.name}</span>
          {param.optional && param.defaultValue === undefined ? (
            <span className="sig-punct">?</span>
          ) : null}
          <span className="sig-punct">: </span>
          <span className="sig-type">{param.type}</span>
          {param.defaultValue !== undefined ? (
            <>
              <span className="sig-punct"> = </span>
              <span className="sig-lit">{param.defaultValue}</span>
            </>
          ) : null}
        </Fragment>
      ))}
      <span className="sig-punct">)</span>
      <span className="sig-punct">: </span>
      <span className="sig-type">{fn.returns}</span>
    </code>
  );
}

function Legend({ sections }: { sections: LegendSection[] }): React.JSX.Element | null {
  if (sections.length === 0) return null;
  return (
    <section className="mo-legend">
      <h3 className="mo-entry-title">On this board</h3>
      {sections.map((section) => (
        <div className="mo-legend-group" key={section.id}>
          <h4 className="mo-legend-title">{section.title}</h4>
          <dl>
            {section.rows.map((row) => (
              <Fragment key={row.name}>
                <dt>
                  <code className="sig-type">{row.name}</code>
                  {row.count === null ? null : (
                    <span className="mo-legend-count numeric">×{row.count}</span>
                  )}
                </dt>
                <dd>
                  {row.what}
                  {row.traits.length > 0 ? (
                    <span className="mo-legend-traits"> {row.traits.join(' · ')}</span>
                  ) : null}
                </dd>
              </Fragment>
            ))}
          </dl>
        </div>
      ))}
    </section>
  );
}

interface Marked {
  focused: string;
  register: (key: string) => (node: HTMLElement | null) => void;
}

function GuideEntry({
  page,
  required,
  focused,
  register,
}: Marked & { page: GuidePage; required?: boolean }): React.JSX.Element {
  const key = `page:${page.id}`;
  const hit = focused === page.id || focused === key;
  return (
    <article className={`mo-entry mo-entry--guide${hit ? ' is-focused' : ''}`} ref={register(key)}>
      <div className="mo-entry-head">
        <h3 className="mo-entry-title">{page.title}</h3>
        {required ? <span className="mo-flag">required reading</span> : null}
      </div>
      <Markdown source={page.body} className="mo-prose" />
      {page.example ? (
        <pre className="mo-code">
          <code>{page.example}</code>
        </pre>
      ) : null}
      {page.caption ? <p className="mo-caption">{page.caption}</p> : null}
    </article>
  );
}

function FunctionEntry({
  fn,
  costs,
  focused,
  register,
}: Marked & { fn: ApiFunctionSpec; costs: Parameters<typeof levelCost>[1] }): React.JSX.Element {
  const cost = levelCost(fn, costs);
  return (
    <article
      className={`mo-entry${focused === fn.name ? ' is-focused' : ''}`}
      ref={register(fn.name)}
    >
      <div className="mo-entry-head">
        <Signature fn={fn} />
        <span className={cost === 0 ? 'mo-cost mo-cost--free' : 'mo-cost'}>{costLabel(cost)}</span>
      </div>
      <Markdown source={fn.doc} className="mo-prose" />
      {fn.params.length > 0 ? (
        <dl className="mo-params">
          {fn.params.map((param) => (
            <Fragment key={param.name}>
              <dt>
                <code>{param.name}</code>
              </dt>
              <dd>
                <Markdown source={param.doc} className="mo-prose" />
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
      <pre className="mo-code">
        <code>{fn.example}</code>
      </pre>
      <p className="mo-meta">Installed by work order {fn.unlockedBy}</p>
    </article>
  );
}

export function Manual(): React.ReactElement {
  const overlay = useOverlay();
  const level = useGame(currentLevel);
  const save = useGame((state) => state.save);
  const trace = useGame((state) => state.trace);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<{ name: string; nonce: number } | null>(null);
  const entries = useRef(new Map<string, HTMLElement>());
  const open = overlay.open === 'docs';
  const needle = query.trim().toLowerCase();

  useEffect(() => {
    const onFocus = (event: WindowEventMap['bootstrap:docs-focus']): void => {
      const name = event.detail?.name;
      if (!name) return;
      openOverlay('docs');
      setQuery('');
      setFocus({ name, nonce: performance.now() });
    };
    window.addEventListener('bootstrap:docs-focus', onFocus);
    return () => window.removeEventListener('bootstrap:docs-focus', onFocus);
  }, []);

  useEffect(() => {
    if (!focus || !open) return undefined;
    const node =
      entries.current.get(focus.name) ??
      entries.current.get(`page:${focus.name}`) ??
      entries.current.get(`type:${focus.name}`);
    node?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
    const timer = window.setTimeout(() => setFocus(null), HIGHLIGHT_MS);
    return () => window.clearTimeout(timer);
  }, [focus, open]);

  const legend = useMemo(
    () => legendFor(trace?.initialWorld ?? (level ? level.build(level.seeds[0] as number) : null)),
    [level, trace],
  );

  const installed = useMemo(() => {
    if (level) return unlockedHardware(level.id);
    const cleared = campaignOrder().filter((entry) => save.levels[entry.id]?.completed);
    const last = cleared[cleared.length - 1];
    return last ? unlockedHardware(last.id) : apiForWorld(1).map((fn) => fn.name);
  }, [level, save]);

  const functions = useMemo(
    () => PLAYER_API.functions.filter((fn) => installed.includes(fn.name)),
    [installed],
  );

  const types = useMemo(() => {
    const wanted = new Set<string>();
    for (const fn of functions) for (const name of fn.requiresTypes ?? []) wanted.add(name);
    for (let grew = true; grew;) {
      grew = false;
      for (const type of PLAYER_API.types) {
        if (!wanted.has(type.name)) continue;
        for (const other of PLAYER_API.types) {
          if (wanted.has(other.name)) continue;
          if (new RegExp(`\\b${other.name}\\b`).test(type.declaration)) {
            wanted.add(other.name);
            grew = true;
          }
        }
      }
    }
    return PLAYER_API.types.filter((type) => wanted.has(type.name));
  }, [functions]);

  const referenced = useMemo(() => level?.docs ?? [], [level]);

  const guides = useMemo(() => {
    const rank = (page: GuidePage): number => {
      const index = referenced.findIndex((id) => page.id === id || page.aliases.includes(id));
      return index < 0 ? referenced.length : index;
    };
    return GUIDES.slice()
      .sort((a, b) => rank(a) - rank(b))
      .filter((page) => matches(`${page.title} ${page.body}`.toLowerCase(), needle));
  }, [referenced, needle]);

  const shown = useMemo(
    () =>
      functions.filter((fn) =>
        matches(`${fn.name} ${fn.doc} ${fn.category} ${fn.returns}`.toLowerCase(), needle),
      ),
    [functions, needle],
  );

  const shownTypes = useMemo(
    () =>
      types.filter((type) =>
        matches(`${type.name} ${type.doc} ${type.declaration}`.toLowerCase(), needle),
      ),
    [types, needle],
  );

  const register =
    (key: string) =>
    (node: HTMLElement | null): void => {
      if (node) entries.current.set(key, node);
      else entries.current.delete(key);
    };

  const focusedName = focus?.name ?? '';
  const jumps = referenced.filter(
    (id) =>
      functions.some((fn) => fn.name === id) ||
      [MEMORY, ...GUIDES].some((page) => page.id === id || page.aliases.includes(id)),
  );
  const shownLegend = useMemo(
    () =>
      legend
        .map((section) => ({
          ...section,
          rows: section.rows.filter((row) =>
            matches(`${row.name} ${row.what} ${row.traits.join(' ')}`.toLowerCase(), needle),
          ),
        }))
        .filter((section) => section.rows.length > 0),
    [legend, needle],
  );

  const nothing =
    needle !== '' &&
    guides.length === 0 &&
    shown.length === 0 &&
    shownTypes.length === 0 &&
    shownLegend.length === 0;

  return (
    <>
      <button
        type="button"
        className="manual"
        aria-expanded={open}
        aria-label="Open the reference"
        onClick={() => openOverlay('docs')}
      >
        <div className="mn-block" />
        <div className="mn-cover">
          <b>REFERENCE</b>
          <span>
            COMMANDS FITTED
            <br />
            TO THIS BOT
          </span>
          <em>K&amp;D FORM 12 · REV 9</em>
        </div>
        <div className="mn-coil">
          {Array.from({ length: 8 }, (_, ring) => (
            <i key={ring} />
          ))}
        </div>
      </button>

      {open ? (
        <div className="manual-open" role="dialog" aria-label="Reference">
          <div className="mo-spread">
            <div className="mo-page mo-page--left">
              <header className="mo-head">
                <b>REFERENCE</b>
                <span>K&amp;D FORM 12 · REV 9 — commands fitted to this bot</span>
                <em>{functions.length} installed</em>
              </header>

              <input
                className="mo-search"
                type="search"
                value={query}
                placeholder="Search the reference"
                aria-label="Search the reference"
                spellCheck={false}
                onChange={(event) => setQuery(event.target.value)}
              />

              {jumps.length > 0 ? (
                <div className="mo-jump">
                  <span className="mo-jump-label">For this order</span>
                  {jumps.map((id) => (
                    <button
                      type="button"
                      className="mo-jump-chip"
                      key={id}
                      onClick={() => {
                        setQuery('');
                        setFocus({ name: id, nonce: performance.now() });
                      }}
                    >
                      {id}
                    </button>
                  ))}
                </div>
              ) : null}

              <Legend sections={shownLegend} />

              <GuideEntry page={MEMORY} required focused={focusedName} register={register} />
              {guides.map((page) => (
                <GuideEntry key={page.id} page={page} focused={focusedName} register={register} />
              ))}

              <section className="mo-keys">
                <h3 className="mo-entry-title">Keys</h3>
                <dl>
                  {KEY_LIST.map((binding) => (
                    <Fragment key={binding.keys}>
                      <dt>
                        <kbd>{binding.keys}</kbd>
                      </dt>
                      <dd>{binding.what}</dd>
                    </Fragment>
                  ))}
                </dl>
              </section>
            </div>

            <div className="mo-page mo-page--right">
              {CATEGORIES.map(({ id, label }) => {
                const group = shown.filter((fn) => fn.category === id);
                if (group.length === 0) return null;
                return (
                  <section className="mo-group" key={id}>
                    <h3 className="mo-group-title">{label}</h3>
                    {group.map((fn) => (
                      <FunctionEntry
                        key={fn.name}
                        fn={fn}
                        costs={level?.costs}
                        focused={focusedName}
                        register={register}
                      />
                    ))}
                  </section>
                );
              })}

              {shownTypes.length > 0 ? (
                <section className="mo-group">
                  <h3 className="mo-group-title">Types</h3>
                  {shownTypes.map((type: ApiTypeSpec) => (
                    <article
                      className={`mo-entry${focusedName === type.name ? ' is-focused' : ''}`}
                      key={type.name}
                      ref={register(`type:${type.name}`)}
                    >
                      <div className="mo-entry-head">
                        <code className="mo-sig sig-type">{type.name}</code>
                      </div>
                      <pre className="mo-code">
                        <code>{type.declaration}</code>
                      </pre>
                      <Markdown source={type.doc} className="mo-prose" />
                    </article>
                  ))}
                </section>
              ) : null}

              {nothing ? (
                <p className="mo-empty">
                  Nothing installed matches that. Hardware arrives with the work order that
                  requisitions it.
                </p>
              ) : null}
            </div>

            <button type="button" className="mo-close" onClick={closeOverlay}>
              shut the manual
            </button>
          </div>
        </div>
      ) : null}
    </>
  );
}
