import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX, KeyboardEvent, MouseEvent } from 'react';
import { buildCampaign } from '../../game/campaign.ts';
import type { CampaignOrder, CampaignSite } from '../../game/campaign.ts';
import { exportSave } from '../../game/save.ts';
import { currentLevel, useGame } from '../../game/store.ts';
import { pathFor } from '../router.ts';
import { IconMap } from '../components/Icons.tsx';
import { Interlock } from './LockedLevel.tsx';
import '../styles/screens.css';

type Vars = CSSProperties & Record<`--${string}`, string>;

const PLAN_SEED = 0x5eed1a;

// Hand-placed, normalised into the plan area the dossier does not cover.
const SITE_SPOTS: readonly { x: number; y: number }[] = [
  { x: 0.045, y: 0.71 },
  { x: 0.175, y: 0.42 },
  { x: 0.3, y: 0.75 },
  { x: 0.425, y: 0.39 },
  { x: 0.55, y: 0.69 },
  { x: 0.67, y: 0.33 },
  { x: 0.805, y: 0.62 },
  { x: 0.935, y: 0.25 },
];

const CRATERS: readonly { x: number; y: number; r: number }[] = [
  { x: 0.22, y: 0.24, r: 0.16 },
  { x: 0.62, y: 0.82, r: 0.21 },
  { x: 0.87, y: 0.44, r: 0.13 },
  { x: 0.41, y: 0.57, r: 0.1 },
];

const MEDAL_MARK: Record<string, string> = {
  gold: 'G',
  silver: 'S',
  bronze: 'B',
  none: '·',
};

const NARROW = 1040;

interface Point {
  x: number;
  y: number;
}

const PLOT_MIN = 0.92;
const PLOT_SQUASH = 0.9;

interface Plot {
  path: string;
  cx: number;
  cy: number;
  r: number;
  pip: number;
  bracket: string;
  markers: Point[];
}

interface Plan {
  gridLight: string;
  gridHeavy: string;
  stations: string;
  dust: string;
  hatch: string;
  contours: string[];
  ridges: string[];
  ticks: string;
  legs: { to: number; path: string }[];
  plots: Plot[];
}

function mulberry(seed: number): () => number {
  let a = seed >>> 0;
  return () => {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

function round(value: number): string {
  return (Math.round(value * 10) / 10).toString();
}

// Markers are things sitting on the site, so they scatter rather than queue. Rejection sampling
// in the unit disc, then a relaxation pass, so N orders always read as N countable pips. Working
// in unit space and scaling afterwards keeps the arrangement identical at every viewport size.
const APART = 0.58;

function scatter(rnd: () => number, count: number): Point[] {
  const clamp = (spot: Point): Point => {
    const over = Math.hypot(spot.x, spot.y);
    return over <= 1 ? spot : { x: spot.x / over, y: spot.y / over };
  };
  const nearest = (spot: Point, others: readonly Point[]): number =>
    others.reduce(
      (least, other) => Math.min(least, Math.hypot(spot.x - other.x, spot.y - other.y)),
      Infinity,
    );

  const spots: Point[] = [];
  for (let k = 0; k < count; k++) {
    let best: Point = { x: 0, y: 0 };
    let bestGap = -1;
    for (let attempt = 0; attempt < 48; attempt++) {
      const angle = rnd() * Math.PI * 2;
      const pull = Math.sqrt(rnd());
      const spot = { x: Math.cos(angle) * pull, y: Math.sin(angle) * pull };
      const gap = nearest(spot, spots);
      if (gap >= APART) {
        best = spot;
        bestGap = gap;
        break;
      }
      if (gap > bestGap) {
        best = spot;
        bestGap = gap;
      }
    }
    spots.push(best);
  }

  for (let pass = 0; pass < 6; pass++) {
    for (let a = 0; a < spots.length; a++) {
      for (let b = a + 1; b < spots.length; b++) {
        const one = spots[a];
        const two = spots[b];
        if (!one || !two) continue;
        const dx = two.x - one.x;
        const dy = two.y - one.y;
        const gap = Math.hypot(dx, dy);
        if (gap >= APART) continue;
        const push = (APART - gap) / 2 + 0.01;
        const ux = gap === 0 ? 1 : dx / gap;
        const uy = gap === 0 ? 0 : dy / gap;
        spots[a] = clamp({ x: one.x - ux * push, y: one.y - uy * push });
        spots[b] = clamp({ x: two.x + ux * push, y: two.y + uy * push });
      }
    }
  }

  return spots;
}

// Narrow puts the dossier on the bottom edge instead of the right, so the sites move with it.
function buildPlan(w: number, h: number, counts: readonly number[], narrow: boolean): Plan {
  const rnd = mulberry(PLAN_SEED);
  const radius = narrow
    ? Math.max(30, Math.min(46, Math.min(w, h) * 0.07))
    : Math.max(42, Math.min(76, Math.min(w, h) * 0.088));
  const spanX = narrow ? Math.max(200, w - 196) : Math.max(300, w - 600);
  const spanY = narrow ? Math.max(120, h - Math.min(h * 0.42, 320) - 240) : Math.max(240, h - 250);
  const originX = narrow ? 98 : 104;
  const originY = narrow ? 92 : 78;

  const centres: Point[] = SITE_SPOTS.map((spot) => ({
    x: originX + spot.x * spanX,
    y: originY + spot.y * spanY,
  }));

  const step = 86;
  let gridLight = '';
  let gridHeavy = '';
  let stations = '';
  for (let x = step; x < w; x += step) {
    const line = `M${round(x)} 0V${round(h)}`;
    if ((x / step) % 4 < 0.5) gridHeavy += line;
    else gridLight += line;
  }
  for (let y = step; y < h; y += step) {
    const line = `M0 ${round(y)}H${round(w)}`;
    if ((y / step) % 4 < 0.5) gridHeavy += line;
    else gridLight += line;
  }
  // A crosshair sitting on a plot would be counted as a work order, so the plots clear them off.
  const clearOf = (x: number, y: number): boolean =>
    centres.every((centre) => Math.hypot(centre.x - x, centre.y - y) > radius * 1.5);
  for (let y = step * 2; y < h; y += step * 2) {
    for (let x = step * 2; x < w; x += step * 2) {
      if (!clearOf(x, y)) continue;
      stations += `M${round(x - 4)} ${round(y)}h8M${round(x)} ${round(y - 4)}v8`;
    }
  }

  let dust = '';
  const cell = 32;
  for (let y = cell / 2; y < h; y += cell) {
    for (let x = cell / 2; x < w; x += cell) {
      if (rnd() > 0.52) continue;
      const px = x + (rnd() - 0.5) * cell;
      const py = y + (rnd() - 0.5) * cell;
      dust += `M${round(px)} ${round(py)}h${round(1 + rnd() * 2)}`;
    }
  }

  let hatch = '';
  const hcell = 29;
  for (let y = 0; y < h; y += hcell) {
    for (let x = 0; x < w; x += hcell) {
      if (rnd() > (y / h) * 0.6 + 0.05) continue;
      const len = 9 + rnd() * 13;
      hatch += `M${round(x + rnd() * hcell)} ${round(y + rnd() * hcell)}l${round(len * 0.83)} ${round(-len * 0.56)}`;
    }
  }

  const walk = (base: number, amp: number): Point[] => {
    const points: Point[] = [];
    let y = base;
    let v = 0;
    for (let x = -40; x <= w + 40; x += 36) {
      v = v * 0.64 + (rnd() - 0.5) * amp * 0.55;
      y = base + (y - base) * 0.88 + v;
      points.push({ x, y });
    }
    return points;
  };

  const line = (points: readonly Point[]): string =>
    points.map((p, i) => `${i === 0 ? 'M' : 'L'}${round(p.x)} ${round(p.y)}`).join('');

  const crest = walk(h * 0.2, 54);
  const ridges = [line(crest), line(walk(h * 0.34, 38)), line(walk(h * 0.93, 30))];

  let ticks = '';
  crest.forEach((p, i) => {
    if (i % 2 === 1) return;
    ticks += `M${round(p.x)} ${round(p.y)}l${round(3 + rnd() * 2)} ${round(8 + rnd() * 7)}`;
  });

  const contours = CRATERS.flatMap((crater) => {
    const cx = crater.x * w;
    const cy = crater.y * h;
    const base = crater.r * Math.min(w, h);
    return [1, 0.72, 0.46].map((scale) => {
      const n = 30;
      const points: Point[] = [];
      for (let k = 0; k < n; k++) {
        const angle = (k / n) * Math.PI * 2;
        const rad = base * scale * (0.9 + rnd() * 0.2);
        points.push({ x: cx + Math.cos(angle) * rad, y: cy + Math.sin(angle) * rad * 0.74 });
      }
      return `${line(points)}Z`;
    });
  });

  const legs: { to: number; path: string }[] = [];
  for (let i = 0; i + 1 < centres.length; i++) {
    const a = centres[i];
    const b = centres[i + 1];
    if (!a || !b) continue;
    const mx = (a.x + b.x) / 2;
    const my = (a.y + b.y) / 2;
    const nx = -(b.y - a.y);
    const ny = b.x - a.x;
    const len = Math.hypot(nx, ny) || 1;
    const bend = (rnd() - 0.5) * 60;
    legs.push({
      to: i + 1,
      path: `M${round(a.x)} ${round(a.y)}L${round(mx + (nx / len) * bend)} ${round(my + (ny / len) * bend)}L${round(b.x)} ${round(b.y)}`,
    });
  }

  // The plot is a 9-gon whose vertices never fall below PLOT_MIN, so the ellipse with semi-axes
  // PLOT_MIN * cos(pi/9) (squashed in y) is provably inside it — that is where markers may land.
  const pip = Math.max(7, Math.min(11, radius * 0.15));
  const reachX = Math.max(pip, radius * PLOT_MIN * Math.cos(Math.PI / 9) - (pip / 2 + 3));
  const reachY = Math.max(pip, reachX * PLOT_SQUASH);

  const plots: Plot[] = centres.map((centre, i) => {
    const vertices = 9;
    const points: Point[] = [];
    for (let k = 0; k < vertices; k++) {
      const angle = (k / vertices) * Math.PI * 2 + rnd() * 0.16;
      const rad = radius * (PLOT_MIN + rnd() * 0.2);
      points.push({
        x: centre.x + Math.cos(angle) * rad,
        y: centre.y + Math.sin(angle) * rad * PLOT_SQUASH,
      });
    }

    const markers = scatter(rnd, counts[i] ?? 0).map((spot) => ({
      x: centre.x + spot.x * reachX,
      y: centre.y + spot.y * reachY,
    }));

    const bx = radius * 1.2;
    const by = radius * 1.04;
    const arm = 18;
    const corner = (sx: number, sy: number): string =>
      `M${round(centre.x + sx * bx - sx * arm)} ${round(centre.y + sy * by)}h${round(sx * arm)}v${round(-sy * arm)}`;

    return {
      path: `${line(points)}Z`,
      cx: centre.x,
      cy: centre.y,
      r: radius,
      pip,
      bracket: corner(-1, -1) + corner(1, -1) + corner(-1, 1) + corner(1, 1),
      markers,
    };
  });

  return { gridLight, gridHeavy, stations, dust, hatch, contours, ridges, ticks, legs, plots };
}

// Corner brackets, not a closed ring: at pip size a ring would be counted as another marker.
function reticle(x: number, y: number, size: number): string {
  const half = size / 2;
  const arm = size * 0.32;
  const corner = (sx: number, sy: number): string =>
    `M${round(x + sx * half - sx * arm)} ${round(y + sy * half)}h${round(sx * arm)}v${round(-sy * arm)}`;
  return corner(-1, -1) + corner(1, -1) + corner(-1, 1) + corner(1, 1);
}

export function pad(value: number): string {
  return value < 10 ? `0${String(value)}` : String(value);
}

export function siteLabel(site: CampaignSite): string {
  if (!site.unlocked) {
    return `Site ${pad(site.world.id)}, ${site.world.name}, unsurveyed, ${String(site.issued)} work orders on hold`;
  }
  return `Site ${pad(site.world.id)}, ${site.world.name}, ${String(site.closed)} of ${String(site.issued)} work orders closed`;
}

export function orderLabel(order: CampaignOrder): string {
  const medal = order.medal && order.medal !== 'none' ? `, ${order.medal}` : '';
  return `Work order ${order.id}, ${order.level.title}, ${order.status.toLowerCase()}${medal}`;
}

// The row is a real link; the router owns the URL, so the click only has to skip the reload.
export function openOrder(event: MouseEvent, levelId: string): void {
  if (event.metaKey || event.ctrlKey || event.shiftKey || event.button !== 0) return;
  event.preventDefault();
  useGame.getState().openLevel(levelId);
}

// The plots are scattered rather than queued, so up and down mean the nearest plot on that side;
// left and right walk the supply route in order.
function nextPin(key: string, from: number, plots: readonly Plot[]): number | null {
  const last = plots.length - 1;
  if (last < 0) return null;
  if (key === 'Home') return from === 0 ? null : 0;
  if (key === 'End') return from === last ? null : last;
  if (key === 'ArrowLeft' || key === 'ArrowRight') {
    const to = from + (key === 'ArrowRight' ? 1 : -1);
    return to < 0 || to > last ? null : to;
  }
  if (key !== 'ArrowUp' && key !== 'ArrowDown') return null;

  const origin = plots[from];
  if (!origin) return null;
  const want = key === 'ArrowDown' ? 1 : -1;
  let best = -1;
  let least = Infinity;
  for (let index = 0; index <= last; index++) {
    const plot = plots[index];
    if (!plot || Math.sign(plot.cy - origin.cy) !== want) continue;
    const gap = Math.hypot(plot.cx - origin.cx, plot.cy - origin.cy);
    if (gap >= least) continue;
    least = gap;
    best = index;
  }
  return best < 0 ? null : best;
}

function nextRow(key: string, from: number, count: number): number | null {
  const last = count - 1;
  if (last < 0) return null;
  if (key === 'Home') return from === 0 ? null : 0;
  if (key === 'End') return from === last ? null : last;
  if (key === 'ArrowUp') return from > 0 ? from - 1 : null;
  if (key === 'ArrowDown') return from < last ? from + 1 : null;
  return null;
}

function Stars({ order }: { order: CampaignOrder }): JSX.Element | null {
  if (order.maxStars === 0) return null;
  return (
    <span className="order-row__stars">
      {Array.from({ length: order.maxStars }, (_, k) => (
        <span key={k} className="order-row__star" data-on={String(k < order.stars)} />
      ))}
    </span>
  );
}

export function LevelSelect(): JSX.Element {
  const save = useGame((state) => state.save);
  const blocked = useGame((state) => state.blocked);
  const goto = useGame((state) => state.goto);
  const open = useGame(currentLevel);
  const importSaveFile = useGame((state) => state.importSaveFile);
  const frame = useRef<HTMLDivElement | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const pins = useRef(new Map<number, HTMLButtonElement>());
  const rows = useRef(new Map<number, HTMLAnchorElement>());
  const [box, setBox] = useState({ w: 1440, h: 860 });
  const [seals, setSeals] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [pinAt, setPinAt] = useState(0);
  const [rowAt, setRowAt] = useState(0);

  // Measured on mount as well as observed: inside a throttled frame the observer never delivers,
  // and a plan built for the wrong box is worse than one built a frame late.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = (): void => {
      const rect = node.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      setBox((was) => (was.w === w && was.h === h ? was : { w, h }));
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const campaign = useMemo(() => buildCampaign(save), [save]);
  const narrow = box.w < NARROW;
  const plan = useMemo(
    () =>
      buildPlan(
        box.w,
        box.h,
        campaign.sites.map((site) => site.orders.length),
        narrow,
      ),
    [box.w, box.h, campaign.sites, narrow],
  );

  const stopped = blocked
    ? campaign.sites.findIndex((site) => site.orders.some((order) => order.id === blocked.levelId))
    : -1;
  const upcoming = campaign.sites.findIndex((site) => site.orders.some((order) => order.isNext));
  const chosen = stopped >= 0 ? stopped : (picked ?? Math.max(upcoming, 0));
  const site = campaign.sites[chosen];
  const orders = site?.orders ?? [];
  const rowIndex = Math.min(rowAt, Math.max(0, orders.length - 1));

  const onPinKeys = useCallback(
    (event: KeyboardEvent<HTMLUListElement>): void => {
      const to = nextPin(event.key, pinAt, plan.plots);
      if (to === null) return;
      event.preventDefault();
      setPinAt(to);
      pins.current.get(to)?.focus();
    },
    [pinAt, plan.plots],
  );

  const onRowKeys = useCallback(
    (event: KeyboardEvent<HTMLUListElement>): void => {
      const to = nextRow(event.key, rowIndex, orders.length);
      if (to === null) return;
      event.preventDefault();
      setRowAt(to);
      rows.current.get(to)?.focus();
    },
    [rowIndex, orders.length],
  );

  // Picking a site while an interlock is up is one click: the refusal lifts and that site opens.
  const pickSite = (index: number): void => {
    setPicked(index);
    setPinAt(index);
    setRowAt(0);
    if (blocked) goto('levels');
  };

  const onExport = (): void => {
    const blob = new Blob([exportSave(save)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'bootstrap-progress.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (chosenFile: File | undefined): Promise<void> => {
    if (!chosenFile) return;
    importSaveFile(await chosenFile.text());
  };

  return (
    <div className="survey" ref={frame} data-narrow={String(narrow)}>
      <svg
        className="survey__plan"
        width={box.w}
        height={box.h}
        viewBox={`0 0 ${String(box.w)} ${String(box.h)}`}
        aria-hidden="true"
      >
        <path className="plan__grid" d={plan.gridLight} />
        <path className="plan__grid plan__grid--heavy" d={plan.gridHeavy} />
        <path className="plan__station" d={plan.stations} />
        <path className="plan__dust" d={plan.dust} />
        <path className="plan__hatch" d={plan.hatch} />
        {plan.contours.map((d, i) => (
          <path key={`c${String(i)}`} className="plan__contour" d={d} />
        ))}
        {plan.ridges.map((d, i) => (
          <path key={`r${String(i)}`} className="plan__ridge" d={d} />
        ))}
        <path className="plan__ticks" d={plan.ticks} />

        {plan.legs.map((leg) => (
          <path
            key={leg.to}
            className="plan__leg"
            data-open={String(campaign.sites[leg.to]?.unlocked ?? false)}
            d={leg.path}
          />
        ))}

        {plan.plots.map((plot, i) => {
          const entry = campaign.sites[i];
          if (!entry) return null;
          return (
            <g
              key={entry.world.id}
              className="plot"
              style={{ '--world': `var(--world-${String(i + 1)})` } as Vars}
              data-open={String(entry.unlocked)}
              data-on={String(i === chosen)}
              data-stop={String(i === stopped)}
            >
              <path className="plot__shape" d={plot.path} />
              {i === chosen ? <path className="plot__bracket" d={plot.bracket} /> : null}
              {plot.markers.map((mark, k) => {
                const order = entry.orders[k];
                if (!order) return null;
                return (
                  <g
                    key={order.id}
                    className="plot-mark"
                    data-status={order.status}
                    data-medal={order.medal ?? 'none'}
                  >
                    {order.isNext ? (
                      <>
                        <path
                          className="plot-mark__reticle"
                          d={reticle(mark.x, mark.y, plot.pip * 3)}
                        />
                        <rect
                          className="plot-mark__ping"
                          x={mark.x - plot.pip * 1.5}
                          y={mark.y - plot.pip * 1.5}
                          width={plot.pip * 3}
                          height={plot.pip * 3}
                        />
                      </>
                    ) : null}
                    <rect
                      className="plot-mark__pip"
                      x={mark.x - plot.pip / 2}
                      y={mark.y - plot.pip / 2}
                      width={plot.pip}
                      height={plot.pip}
                    />
                  </g>
                );
              })}
            </g>
          );
        })}
      </svg>

      <ul className="survey__pins" aria-label="Survey sites" onKeyDown={onPinKeys}>
        {campaign.sites.map((entry, i) => {
          const plot = plan.plots[i];
          if (!plot) return null;
          return (
            <li
              key={entry.world.id}
              className="pins__slot"
              style={
                {
                  '--world': `var(--world-${String(i + 1)})`,
                  left: `${String(plot.cx)}px`,
                  top: `${String(plot.cy)}px`,
                  width: `${String(plot.r * 2)}px`,
                  height: `${String(plot.r * 2)}px`,
                } as Vars
              }
            >
              <button
                type="button"
                className="pin"
                ref={(element) => {
                  if (element) pins.current.set(i, element);
                  else pins.current.delete(i);
                }}
                data-open={String(entry.unlocked)}
                data-on={String(i === chosen)}
                tabIndex={i === pinAt ? 0 : -1}
                aria-pressed={i === chosen}
                aria-label={siteLabel(entry)}
                onFocus={() => setPinAt(i)}
                onClick={() => pickSite(i)}
              >
                <span className="pin__plate" aria-hidden="true">
                  <span className="pin__no">Site {pad(entry.world.id)}</span>
                  <span className="pin__name">{entry.world.name}</span>
                  <span className="pin__tally">
                    {!entry.unlocked
                      ? 'plan not walked'
                      : narrow
                        ? `${String(entry.closed)}/${String(entry.issued)} closed`
                        : `${String(entry.closed)}/${String(entry.issued)} closed · ${String(entry.points)} pts`}
                  </span>
                </span>
              </button>
            </li>
          );
        })}
      </ul>

      <section className="survey-frame survey__tally" aria-label="Campaign survey totals">
        <div className="survey-frame__body">
          <div className="survey-bar">
            <span>Orbital survey</span>
            <span className="survey-bar__tools">
              <span>
                {campaign.closed}/{campaign.issued}
              </span>
              {open ? (
                <button
                  type="button"
                  className="survey-ctl survey-ctl--tight"
                  title={`Back to the station — ${open.id.toUpperCase()}`}
                  onClick={() => goto('workspace')}
                >
                  <IconMap />
                  <span>back to the station</span>
                </button>
              ) : null}
              <button
                type="button"
                className="survey-ctl survey-ctl--tight"
                title="Export progress"
                onClick={onExport}
              >
                export
              </button>
              <button
                type="button"
                className="survey-ctl survey-ctl--tight"
                title="Import progress"
                onClick={() => file.current?.click()}
              >
                import
              </button>
              <input
                ref={file}
                type="file"
                accept="application/json"
                className="sr-only"
                aria-label="Import a progress file"
                onChange={(event) => {
                  void onImport(event.target.files?.[0]);
                  event.target.value = '';
                }}
              />
            </span>
          </div>
          <dl className="survey-tally__grid">
            <div className="survey-tally__cell">
              <dt>Points</dt>
              <dd>
                {campaign.points}
                <span className="survey-tally__of">/{campaign.maxPoints}</span>
              </dd>
            </div>
            <div className="survey-tally__cell">
              <dt>Stars</dt>
              <dd>
                {campaign.stars}
                <span className="survey-tally__of">/{campaign.maxStars}</span>
              </dd>
            </div>
            <div className="survey-tally__cell">
              <dt>Medals</dt>
              <dd className="survey-tally__medals">
                <span data-medal="gold">{campaign.gold}</span>
                <span data-medal="silver">{campaign.silver}</span>
                <span data-medal="bronze">{campaign.bronze}</span>
              </dd>
            </div>
            <div className="survey-tally__cell">
              <dt>Next up</dt>
              <dd className="survey-tally__next">{campaign.next ? campaign.next.id : 'none'}</dd>
            </div>
          </dl>
        </div>
      </section>

      <section
        className="survey-frame dossier"
        aria-label="Site dossier"
        style={{ '--world': `var(--world-${String(chosen + 1)})` } as Vars}
        {...(blocked ? { inert: true } : {})}
      >
        <div className="survey-frame__body">
          <div className="survey-bar">
            <span>{site ? `Site ${pad(site.world.id)} — ${site.world.name}` : 'No site'}</span>
            <span className="survey-bar__tools">
              {site ? `${String(site.closed)}/${String(site.issued)}` : '—'}
            </span>
          </div>
          <div className="survey-bar survey-bar--sub">
            <span>{site ? site.world.subtitle : ''}</span>
            <span>{site ? `${String(site.points)}/${String(site.maxPoints)} pts` : ''}</span>
          </div>
          <div className="site-brief" data-open={String(site?.unlocked ?? false)}>
            <span className="site-brief__kicker">Briefing</span>
            <p className="site-brief__body">{site ? site.world.blurb : 'No briefing filed.'}</p>
          </div>
          <ul className="dossier__rows" aria-label="Work orders on this site" onKeyDown={onRowKeys}>
            {orders.map((order, i) => (
              <li key={order.id}>
                <a
                  className="order-row"
                  ref={(element) => {
                    if (element) rows.current.set(i, element);
                    else rows.current.delete(i);
                  }}
                  href={pathFor(order.id)}
                  data-status={order.status}
                  data-next={String(order.isNext)}
                  tabIndex={i === rowIndex ? 0 : -1}
                  aria-label={orderLabel(order)}
                  onFocus={() => setRowAt(i)}
                  onClick={(event) => openOrder(event, order.id)}
                >
                  <span className="order-row__no">{pad(order.index)}</span>
                  <span className="order-row__main">
                    <span className="order-row__title">{order.level.title}</span>
                    <span className="order-row__meta">
                      <span className="order-row__id">{order.id}</span>
                      <span className="order-row__status">{order.status}</span>
                      <Stars order={order} />
                    </span>
                  </span>
                  <span className="order-row__score">
                    <span className="order-row__medal" data-medal={order.medal ?? 'none'}>
                      {order.medal ? (MEDAL_MARK[order.medal] ?? '·') : '·'}
                    </span>
                    <span className="order-row__points">
                      {order.points}
                      <span className="order-row__of">/{order.maxPoints}</span>
                    </span>
                  </span>
                </a>
              </li>
            ))}
          </ul>
          <p className="dossier__foot">
            {site?.unlocked
              ? 'Every marker on the plan is one work order.'
              : 'Close the route behind this site and the plan fills in.'}
          </p>
        </div>
      </section>

      {blocked ? (
        <Interlock blocked={blocked} campaign={campaign} onDismiss={() => goto('levels')} />
      ) : null}

      <button
        type="button"
        className="survey-seals-tab"
        data-on={String(seals)}
        aria-expanded={seals}
        aria-controls="survey-seals"
        aria-label={`Commendations, ${String(campaign.earnedCount)} of ${String(campaign.commendations.length)} awarded`}
        onClick={() => setSeals((was) => !was)}
      >
        <span className="survey-seals-tab__text">
          Commendations {campaign.earnedCount}/{campaign.commendations.length}
        </span>
      </button>

      <section
        className="survey-frame survey-seals"
        id="survey-seals"
        data-on={String(seals)}
        aria-label="Commendations"
        {...(seals ? {} : { inert: true })}
      >
        <div className="survey-frame__body">
          <div className="survey-bar">
            <span>Commendations</span>
            <span className="survey-bar__tools">
              <span>
                {campaign.earnedCount}/{campaign.commendations.length} awarded
              </span>
              <button
                type="button"
                className="survey-ctl survey-ctl--tight"
                onClick={() => setSeals(false)}
              >
                Close
              </button>
            </span>
          </div>
          <ul className="survey-seals__grid">
            {campaign.commendations.map((entry) => {
              const won = entry.earnedAt !== null;
              return (
                <li key={entry.achievement.id} className="survey-seal" data-on={String(won)}>
                  <span className="survey-seal__disc" aria-hidden="true" />
                  <span className="survey-seal__main">
                    <span className="survey-seal__title">
                      {won ? entry.achievement.title : 'Not awarded'}
                    </span>
                    <span className="survey-seal__req">{entry.achievement.requirement}</span>
                  </span>
                </li>
              );
            })}
          </ul>
        </div>
      </section>
    </div>
  );
}
