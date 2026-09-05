import {
  Fragment,
  useCallback,
  useDeferredValue,
  useEffect,
  useMemo,
  useRef,
  useState,
} from 'react';
import type * as React from 'react';
import type { CostOverrides } from '../../engine/index.ts';
import type { ApiFunctionSpec, ApiTypeSpec } from '../../runtime/protocol.ts';
import { ApiCategory } from '../../runtime/protocol.ts';
import { PLAYER_API, apiForWorld } from '../../runtime/api-spec.ts';
import { currentLevel, unlockedHardware, useGame } from '../../game/store.ts';
import { campaignOrder } from '../../levels/index.ts';
import { Markdown } from '../components/Markdown.tsx';
import '../styles/docs.css';

declare global {
  interface WindowEventMap {
    'bootstrap:docs-focus': CustomEvent<{ name: string }>;
  }
}

const CATEGORIES: { id: ApiCategory; label: string }[] = [
  { id: ApiCategory.Movement, label: 'Movement' },
  { id: ApiCategory.Sensing, label: 'Sensing' },
  { id: ApiCategory.Inventory, label: 'Inventory' },
  { id: ApiCategory.Terraforming, label: 'Terraforming' },
  { id: ApiCategory.Machines, label: 'Machines' },
  { id: ApiCategory.Navigation, label: 'Navigation' },
  { id: ApiCategory.Signal, label: 'Signal' },
  { id: ApiCategory.Swarm, label: 'Swarm' },
  { id: ApiCategory.Output, label: 'Output' },
];

interface GuidePage {
  id: string;
  aliases: string[];
  title: string;
  body: string;
  example?: string;
  caption?: string;
}

const MEMORY: GuidePage = {
  id: 'memory',
  aliases: ['state', 'set', 'map', 'variables', 'remember'],
  title: 'Memory',
  body: [
    'Your program runs once, from the first line to the last, and it finishes before a single',
    'frame of the replay is drawn. Everything it declares is still there the whole way through.',
    '',
    'Objects, arrays, `Map`, `Set`, closures and module-level variables **persist for the entire',
    'run**. Nothing is cleared between moves, between ticks, or between API calls. A `Set` you',
    'fill on the way out is still full on the way back.',
    '',
    '`mark` and `readMark` are not how a program remembers things. They write a string onto a',
    'tile — into the world — so that a later pass, or a different bot, can read it back. That is',
    'the only job they have, and they cost a tick to write.',
    '',
    '- State your own program needs: ordinary JavaScript values.',
    '- State that must live in the world, or be visible to another bot: `mark` and `readMark`.',
    '',
    'Each seed is a separate run. Values do not carry across from one seed to the next; every run',
    'starts from your source exactly as written.',
  ].join('\n'),
  example: `const visited = new Set<string>();

function key(): string {
  const here = pos();
  return \`\${here.x},\${here.y}\`;
}

visited.add(key());
for (let step = 0; step < 20; step++) {
  if (move(Dir.East)) visited.add(key());
}
print(\`\${visited.size} distinct tiles\`);`,
  caption:
    'The Set is declared once and holds every coordinate added to it until the program ends.',
};

const GUIDES: GuidePage[] = [
  {
    id: 'coordinates',
    aliases: ['coords', 'grid', 'position', 'vec', 'north'],
    title: 'Coordinates',
    body: [
      'A position is `{ x, y }`. `x` grows East. `y` grows South. North is `y - 1`.',
      '',
      'Tile `(0, 0)` is the North-West corner of the site. `pos()` hands back a fresh object, so',
      'writing to it changes nothing.',
      '',
      '- `Dir.North` moves to `y - 1`',
      '- `Dir.East` moves to `x + 1`',
      '- `Dir.South` moves to `y + 1`',
      '- `Dir.West` moves to `x - 1`',
      '',
      'Tiles outside the grid are not an error. `scan` and `look` return a view with',
      '`inBounds: false` and `terrain: "void"`, so the same check works at the edge and in the',
      'middle.',
    ].join('\n'),
    example: `const here = pos();
const north = { x: here.x, y: here.y - 1 };
print(\`\${here.x},\${here.y} -> \${north.x},\${north.y}\`);`,
  },
  {
    id: 'ticks',
    aliases: ['par', 'ticks and par', 'score', 'medal', 'clock', 'cost'],
    title: 'Ticks and par',
    body: [
      'Sensing is free. Acting costs ticks.',
      '',
      "Every bot carries its own clock. An action advances that bot's clock by the action's cost.",
      'The score for a work order is `max(bot.clock)` across every living bot, so with one bot the',
      'score is simply that bot’s clock.',
      '',
      'A failed action still costs. A `move` into a wall spends its full tick and the bot ends up',
      'facing the wall.',
      '',
      'Par is the tick budget for the order. Medals come straight off it:',
      '',
      '- Gold: ticks at or under par.',
      '- Silver: ticks at or under par multiplied by 1.25.',
      '- Bronze: every objective met.',
    ].join('\n'),
  },
  {
    id: 'output',
    aliases: ['console', 'console.log', 'log', 'debug', 'print'],
    title: 'Printing and debugging',
    body: [
      '`print(text)` writes one line to the console panel. It is free and it is recorded in the',
      'trace, so the line reappears at the exact tick it was written when you scrub the replay.',
      '',
      '`console.log` is bound to the same function. It accepts the same argument, writes the same',
      'trace event, and works on every work order — including the ones issued before `print` is',
      'installed. Use whichever you prefer.',
      '',
      'The console is capped. A program that prints inside a tight loop will have the overflow',
      'suppressed rather than freezing the page, and the console says how many lines it dropped.',
    ].join('\n'),
    example: `print('starting');
console.log('same channel, same tick');`,
  },
];

/**
 * What this function costs *on the level the player is looking at*.
 *
 * `api-spec` carries the campaign-wide price, but a level may override any entry in the
 * `CostTable` and three do — `w7-02` halves `spawn`, `w7-04` and `w8-05` halve `use`. Showing the
 * flat number there told the finale's player that working a manual station costs twice what it
 * does, which is enough to make its deadline look unreachable. `wait` is left alone: its cost is
 * the string `'n'`, a multiplier rather than a price.
 */
export function levelCost(fn: ApiFunctionSpec, costs: CostOverrides | undefined): number | string {
  if (typeof fn.cost !== 'number') return fn.cost;
  return costs?.[fn.name as keyof CostOverrides] ?? fn.cost;
}

function costLabel(cost: number | string): string {
  if (cost === 0) return 'free';
  if (typeof cost === 'number') return `${cost} tick${cost === 1 ? '' : 's'}`;
  return `${cost} ticks`;
}

function Signature({ fn }: { fn: ApiFunctionSpec }): React.JSX.Element {
  return (
    <code className="sig">
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

interface CardProps {
  focused: string;
  register: (key: string) => (node: HTMLElement | null) => void;
}

function GuideCard({
  page,
  required,
  focused,
  register,
}: CardProps & { page: GuidePage; required?: boolean }): React.JSX.Element {
  const key = `page:${page.id}`;
  const hit = focused === page.id || focused === key;
  return (
    <article
      className={`docs-card docs-card--guide${required ? ' docs-card--required' : ''}${hit ? ' is-focused' : ''}`}
      ref={register(key)}
    >
      <div className="docs-card-head">
        <h3 className="docs-card-title">{page.title}</h3>
        {required ? <span className="docs-flag">required reading</span> : null}
      </div>
      <Markdown source={page.body} className="docs-prose" />
      {page.example ? (
        <pre className="code-block">
          <code>{page.example}</code>
        </pre>
      ) : null}
      {page.caption ? <p className="docs-caption">{page.caption}</p> : null}
    </article>
  );
}

function FunctionCard({
  fn,
  costs,
  focused,
  register,
}: CardProps & { fn: ApiFunctionSpec; costs: CostOverrides | undefined }): React.JSX.Element {
  const cost = levelCost(fn, costs);
  const free = cost === 0;
  return (
    <article
      className={`docs-card docs-entry${focused === fn.name ? ' is-focused' : ''}`}
      ref={register(fn.name)}
    >
      <div className="docs-card-head">
        <Signature fn={fn} />
        <span className={free ? 'cost cost--free' : 'cost'}>{costLabel(cost)}</span>
      </div>
      <Markdown source={fn.doc} className="docs-prose" />
      {fn.params.length > 0 ? (
        <dl className="params">
          {fn.params.map((param) => (
            <Fragment key={param.name}>
              <dt>
                <code>{param.name}</code>
              </dt>
              <dd>
                <Markdown source={param.doc} className="docs-prose" />
              </dd>
            </Fragment>
          ))}
        </dl>
      ) : null}
      <pre className="code-block">
        <code>{fn.example}</code>
      </pre>
      <p className="docs-meta numeric">Installed by work order {fn.unlockedBy}</p>
    </article>
  );
}

function scrollBehavior(): ScrollBehavior {
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches ? 'auto' : 'smooth';
}

function matches(haystack: string, needle: string): boolean {
  return needle === '' || haystack.includes(needle);
}

export function DocsPanel(): React.JSX.Element {
  const level = useGame(currentLevel);
  const save = useGame((state) => state.save);
  const [query, setQuery] = useState('');
  const [focus, setFocus] = useState<{ name: string; nonce: number } | null>(null);
  const deferred = useDeferredValue(query).trim().toLowerCase();
  const entries = useRef(new Map<string, HTMLElement>());

  useEffect(() => {
    const onFocus = (event: WindowEventMap['bootstrap:docs-focus']): void => {
      const name = event.detail?.name;
      if (!name) return;
      setQuery('');
      setFocus({ name, nonce: performance.now() });
    };
    window.addEventListener('bootstrap:docs-focus', onFocus);
    return () => window.removeEventListener('bootstrap:docs-focus', onFocus);
  }, []);

  useEffect(() => {
    if (!focus) return undefined;
    const node =
      entries.current.get(focus.name) ??
      entries.current.get(`page:${focus.name}`) ??
      entries.current.get(`type:${focus.name}`);
    node?.scrollIntoView({ block: 'nearest', behavior: scrollBehavior() });
    const timer = window.setTimeout(() => setFocus(null), 1800);
    return () => window.clearTimeout(timer);
  }, [focus]);

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
      .filter((page) => matches(`${page.title} ${page.body}`.toLowerCase(), deferred));
  }, [referenced, deferred]);

  const shown = useMemo(
    () =>
      functions.filter((fn) =>
        matches(`${fn.name} ${fn.doc} ${fn.category} ${fn.returns}`.toLowerCase(), deferred),
      ),
    [functions, deferred],
  );

  const shownTypes = useMemo(
    () =>
      types.filter((type) =>
        matches(`${type.name} ${type.doc} ${type.declaration}`.toLowerCase(), deferred),
      ),
    [types, deferred],
  );

  const register = useCallback(
    (key: string) =>
      (node: HTMLElement | null): void => {
        if (node) entries.current.set(key, node);
        else entries.current.delete(key);
      },
    [],
  );

  function jumpTo(name: string): void {
    setQuery('');
    setFocus({ name, nonce: performance.now() });
  }

  const focusedName = focus?.name ?? '';
  const jumps = referenced.filter(
    (id) =>
      functions.some((fn) => fn.name === id) ||
      [MEMORY, ...GUIDES].some((page) => page.id === id || page.aliases.includes(id)),
  );

  return (
    <section className="doc-pane docs">
      <header className="docs-head">
        <div className="docs-head-row">
          <h2 className="docs-heading">Reference</h2>
          <span className="docs-count numeric">{functions.length} installed</span>
        </div>
        <input
          className="docs-search"
          type="search"
          value={query}
          placeholder="Search the reference"
          aria-label="Search the reference"
          spellCheck={false}
          onChange={(event) => setQuery(event.target.value)}
        />
        {jumps.length > 0 ? (
          <div className="docs-jump">
            <span className="docs-jump-label">For this order</span>
            {jumps.map((id) => (
              <button type="button" className="docs-jump-chip" key={id} onClick={() => jumpTo(id)}>
                {id}
              </button>
            ))}
          </div>
        ) : null}
      </header>

      <div className="docs-body">
        <GuideCard page={MEMORY} required focused={focusedName} register={register} />
        {guides.map((page) => (
          <GuideCard key={page.id} page={page} focused={focusedName} register={register} />
        ))}

        {CATEGORIES.map(({ id, label }) => {
          const group = shown.filter((fn) => fn.category === id);
          if (group.length === 0) return null;
          return (
            <section className="docs-group" key={id}>
              <h3 className="docs-group-title">{label}</h3>
              {group.map((fn) => (
                <FunctionCard
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
          <section className="docs-group" key="types">
            <h3 className="docs-group-title">Types</h3>
            {shownTypes.map((type: ApiTypeSpec) => (
              <article
                className={`docs-card docs-entry${focusedName === type.name ? ' is-focused' : ''}`}
                key={type.name}
                ref={register(`type:${type.name}`)}
              >
                <div className="docs-card-head">
                  <code className="sig sig-type">{type.name}</code>
                </div>
                <pre className="code-block">
                  <code>{type.declaration}</code>
                </pre>
                <Markdown source={type.doc} className="docs-prose" />
              </article>
            ))}
          </section>
        ) : null}

        {deferred !== '' && guides.length === 0 && shown.length === 0 && shownTypes.length === 0 ? (
          <p className="docs-empty">
            Nothing installed matches that. Hardware arrives with the work order that requisitions
            it.
          </p>
        ) : null}
      </div>
    </section>
  );
}
