import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import type { CSSProperties, JSX, KeyboardEvent, MouseEvent, PointerEvent } from 'react';
import { buildCampaign } from '../../game/campaign.ts';
import type { CampaignOrder, CampaignSite } from '../../game/campaign.ts';
import { exportSave } from '../../game/save.ts';
import { currentLevel, useGame } from '../../game/store.ts';
import { useLibrary } from '../../meta/index.ts';
import { pathFor } from '../router.ts';
import { IconMap } from '../components/Icons.tsx';
import { GAME_TITLE, GameMark, GameWordmark } from '../components/GameMark.tsx';
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
  gold: '✓',
  silver: 'S',
  bronze: 'B',
  none: '·',
  closed: '✓',
};

function medalMark(order: CampaignOrder): string {
  return order.medal ?? (order.progress.completed ? 'closed' : 'none');
}

const NARROW = 1040;

// A phone gets one site per screen: the plan is laid out a page per site and the view pans along
// the route. The width is the workspace's phone breakpoint.
const PAGED = 600;
const SWIPE_SLOP = 12;
const SWIPE_FLING = 0.18;

// The lockup is centred in the gap the tally and the dossier leave along the top. The tally is
// sized by its own contents, so that gap is measured rather than derived from the viewport; below
// the width the lockup needs, the title is dropped instead of run underneath either panel.
const MARK_WIDTH = 340;
const MARK_GUTTER = 32;
const MARK_BAND = 72;

interface Point {
  x: number;
  y: number;
}

const PLOT_MIN = 0.92;
const PLOT_SQUASH = 0.9;

interface Plot {
  path: string;
  stipple: string;
  ink: string;
  rings: string;
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

const INK_STEP = 0.17;
const STIPPLE_STEP = 0.15;
const CONTOUR_RINGS = [0.74, 0.52, 0.31];

function centreOf(points: readonly Point[]): Point {
  const sum = points.reduce((total, point) => ({ x: total.x + point.x, y: total.y + point.y }), {
    x: 0,
    y: 0,
  });
  return { x: sum.x / points.length, y: sum.y / points.length };
}

function inside(point: Point, polygon: readonly Point[]): boolean {
  let within = false;
  for (let i = 0; i < polygon.length; i++) {
    const a = polygon[i];
    const b = polygon[(i + 1) % polygon.length];
    if (!a || !b) continue;
    if (a.y > point.y === b.y > point.y) continue;
    if (point.x < ((b.x - a.x) * (point.y - a.y)) / (b.y - a.y) + a.x) within = !within;
  }
  return within;
}

// A closed parcel is stippled: dots on a jittered grid, so the texture is even without reading as
// a screen pattern. The grid is walked in place of rejection sampling because the plot is small.
function stipplePlot(points: readonly Point[], radius: number, rnd: () => number): string {
  const centre = centreOf(points);
  const inset = points.map((point) => ({
    x: centre.x + (point.x - centre.x) * 0.9,
    y: centre.y + (point.y - centre.y) * 0.9,
  }));
  const step = radius * STIPPLE_STEP;
  let path = '';
  for (let y = centre.y - radius; y <= centre.y + radius; y += step) {
    for (let x = centre.x - radius; x <= centre.x + radius; x += step) {
      const dot = { x: x + (rnd() - 0.5) * step, y: y + (rnd() - 0.5) * step };
      if (!inside(dot, inset)) continue;
      path += `M${round(dot.x)} ${round(dot.y)}h0.01`;
    }
  }
  return path;
}

// Contours are the parcel's own boundary drawn in, so a mastered site reads as high ground rather
// than as a second outline of some other shape.
function contourPlot(points: readonly Point[], rnd: () => number): string {
  const centre = centreOf(points);
  return CONTOUR_RINGS.map(
    (scale) =>
      points
        .map((point, i) => {
          const pull = scale * (0.94 + rnd() * 0.12);
          const x = centre.x + (point.x - centre.x) * pull;
          const y = centre.y + (point.y - centre.y) * pull;
          return `${i === 0 ? 'M' : 'L'}${round(x)} ${round(y)}`;
        })
        .join('') + 'Z',
  ).join('');
}

// Inking a closed site in is a fill, and a fill on a survey plan is hatching. The plot is an
// arbitrary polygon, so each 45-degree line is cut against every edge and the crossings paired off
// — half-open on the upper end so a vertex is counted once and the crossings always come in twos.
function hatchPlot(points: readonly Point[], radius: number): string {
  const level = (point: Point): number => point.x - point.y;
  const levels = points.map(level);
  const step = radius * INK_STEP;
  let path = '';
  for (let c = Math.min(...levels) + step / 2; c < Math.max(...levels); c += step) {
    const crossings: Point[] = [];
    for (let i = 0; i < points.length; i++) {
      const from = points[i];
      const to = points[(i + 1) % points.length];
      if (!from || !to) continue;
      const a = level(from);
      const b = level(to);
      if (c < Math.min(a, b) || c >= Math.max(a, b)) continue;
      const t = (c - a) / (b - a);
      crossings.push({ x: from.x + (to.x - from.x) * t, y: from.y + (to.y - from.y) * t });
    }
    crossings.sort((one, two) => one.x - two.x);
    for (let k = 0; k + 1 < crossings.length; k += 2) {
      const from = crossings[k];
      const to = crossings[k + 1];
      if (!from || !to) continue;
      path += `M${round(from.x)} ${round(from.y)}L${round(to.x)} ${round(to.y)}`;
    }
  }
  return path;
}

// Paged, each site sits alone in the strip between the tally and the pager, its plate below it.
const PAGE_GAP = 14;
const PAGE_FOOT = 102;
const PLATE_ROOM = 72;

function pagedCentres(page: number, h: number, head: number): { radius: number; centres: Point[] } {
  const top = head + PAGE_GAP;
  const bottom = h - Math.min(h * 0.42, 320) - PAGE_FOOT;
  const room = Math.max(120, bottom - top);
  const radius = Math.max(36, Math.min(76, page * 0.2, (room - PLATE_ROOM) / 2.2));
  const slack = Math.max(0, room - PLATE_ROOM - radius * 2.1);
  const centres = SITE_SPOTS.map((spot, i) => ({
    x: page * i + page / 2,
    y: top + radius * 1.1 + slack * spot.y,
  }));
  return { radius, centres };
}

// Narrow puts the dossier on the bottom edge instead of the right, so the sites move with it.
// `band` is the strip the title lockup occupies along the top; the sites start below it rather
// than under it, which is also what keeps the pins clear of it. A `page` width lays the plan out
// one site per page instead, `w` then being every page end to end.
function buildPlan(
  w: number,
  h: number,
  counts: readonly number[],
  narrow: boolean,
  band: number,
  page = 0,
  head = 0,
): Plan {
  const rnd = mulberry(PLAN_SEED);
  const spanX = narrow ? Math.max(200, w - 196) : Math.max(300, w - 600);
  const spanY = narrow
    ? Math.max(120, h - Math.min(h * 0.42, 320) - 240)
    : Math.max(240, h - 250 - band);
  const originX = narrow ? 98 : 104;
  const originY = narrow ? 92 : 78 + band;

  const { radius, centres } =
    page > 0
      ? pagedCentres(page, h, head)
      : {
          radius: narrow
            ? Math.max(30, Math.min(46, Math.min(w, h) * 0.07))
            : Math.max(42, Math.min(76, Math.min(w, h - band) * 0.088)),
          centres: SITE_SPOTS.map((spot) => ({
            x: originX + spot.x * spanX,
            y: originY + spot.y * spanY,
          })),
        };

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
      stipple: stipplePlot(points, radius, rnd),
      ink: hatchPlot(points, radius),
      rings: contourPlot(points, rnd),
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

// A marker with every bonus met is promoted to a triangulation station: a ring around the dot with
// four cardinal ticks crossing it, all one path. The ticks stop inside PING_REACH so that an order
// that is both up next and fully starred reads as a pulse leaving a station, not as one shape.
const PING_REACH = 1.5;

function station(x: number, y: number, size: number): string {
  const ring = size * 1.15;
  const from = size * 0.75;
  const to = size * 1.45;
  const arc = `M${round(x - ring)} ${round(y)}a${round(ring)} ${round(ring)} 0 1 0 ${round(ring * 2)} 0a${round(ring)} ${round(ring)} 0 1 0 ${round(-ring * 2)} 0`;
  const ticks = [
    `M${round(x)} ${round(y - from)}V${round(y - to)}`,
    `M${round(x)} ${round(y + from)}V${round(y + to)}`,
    `M${round(x - from)} ${round(y)}H${round(x - to)}`,
    `M${round(x + from)} ${round(y)}H${round(x + to)}`,
  ].join('');
  return arc + ticks;
}

function allBonusMet(order: CampaignOrder): boolean {
  return order.maxStars > 0 && order.stars === order.maxStars;
}

export function pad(value: number): string {
  return value < 10 ? `0${String(value)}` : String(value);
}

export function siteLabel(site: CampaignSite): string {
  if (!site.unlocked) {
    return `Site ${pad(site.world.id)}, ${site.world.name}, unsurveyed, ${String(site.issued)} work orders on hold`;
  }
  const walked = `Site ${pad(site.world.id)}, ${site.world.name}, ${String(site.closed)} of ${String(site.issued)} work orders closed`;
  if (!site.complete) return walked;
  const tiers = [
    'site complete',
    ...(site.perfect ? ['every work order at par'] : []),
    ...(site.starred ? ['every bonus objective met'] : []),
  ];
  return `${walked}, ${tiers.join(', ')}`;
}

export function orderLabel(order: CampaignOrder): string {
  const medal = order.medal && order.medal !== 'none' ? `, ${order.medal}` : '';
  const bonus = allBonusMet(order) ? ', all bonus objectives met' : '';
  return `Work order ${order.id}, ${order.level.title}, ${order.status.toLowerCase()}${medal}${bonus}`;
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
  const librarySave = useLibrary((state) => state.save);
  const importLibrary = useLibrary((state) => state.importLibrary);
  const frame = useRef<HTMLDivElement | null>(null);
  const file = useRef<HTMLInputElement | null>(null);
  const pins = useRef(new Map<number, HTMLButtonElement>());
  const rows = useRef(new Map<number, HTMLAnchorElement>());
  const tally = useRef<HTMLElement | null>(null);
  const dossier = useRef<HTMLElement | null>(null);
  const [box, setBox] = useState({ w: 1440, h: 860, aside: 0, flank: 1440, head: 0 });
  const [seals, setSeals] = useState(false);
  const [picked, setPicked] = useState<number | null>(null);
  const [pinAt, setPinAt] = useState(0);
  const [rowAt, setRowAt] = useState(0);
  const [drag, setDrag] = useState(0);
  const swipe = useRef<{ id: number; x: number; y: number; live: boolean } | null>(null);

  // Measured on mount as well as observed: inside a throttled frame the observer never delivers,
  // and a plan built for the wrong box is worse than one built a frame late.
  useEffect(() => {
    const node = frame.current;
    if (!node) return;
    const measure = (): void => {
      const rect = node.getBoundingClientRect();
      const w = Math.round(rect.width);
      const h = Math.round(rect.height);
      const aside = Math.round(tally.current?.getBoundingClientRect().right ?? 0);
      const head = Math.round(tally.current?.getBoundingClientRect().bottom ?? 0);
      const flank = Math.round(dossier.current?.getBoundingClientRect().left ?? w);
      setBox((was) =>
        was.w === w &&
        was.h === h &&
        was.aside === aside &&
        was.flank === flank &&
        was.head === head
          ? was
          : { w, h, aside, flank, head },
      );
    };
    measure();
    const observer = typeof ResizeObserver === 'undefined' ? null : new ResizeObserver(measure);
    observer?.observe(node);
    if (tally.current) observer?.observe(tally.current);
    if (dossier.current) observer?.observe(dossier.current);
    window.addEventListener('resize', measure);
    return () => {
      observer?.disconnect();
      window.removeEventListener('resize', measure);
    };
  }, []);

  const campaign = useMemo(() => buildCampaign(save), [save]);
  const narrow = box.w < NARROW;
  const paged = box.w <= PAGED;
  const titled = !narrow && box.flank - box.aside >= MARK_WIDTH + 2 * MARK_GUTTER;
  const span = paged ? box.w * campaign.sites.length : box.w;
  const head = paged ? box.head : 0;
  const plan = useMemo(
    () =>
      buildPlan(
        span,
        box.h,
        campaign.sites.map((site) => site.orders.length),
        narrow,
        titled ? MARK_BAND : 0,
        paged ? box.w : 0,
        head,
      ),
    [span, box.w, box.h, campaign.sites, narrow, titled, paged, head],
  );

  const stopped = blocked
    ? campaign.sites.findIndex((site) => site.orders.some((order) => order.id === blocked.levelId))
    : -1;
  const upcoming = campaign.sites.findIndex((site) => site.orders.some((order) => order.isNext));
  const chosen = stopped >= 0 ? stopped : (picked ?? Math.max(upcoming, 0));
  const site = campaign.sites[chosen];
  const orders = site?.orders ?? [];
  const rowIndex = Math.min(rowAt, Math.max(0, orders.length - 1));

  // Picking a site while an interlock is up is one click: the refusal lifts and that site opens.
  const pickSite = useCallback(
    (index: number): void => {
      setPicked(index);
      setPinAt(index);
      setRowAt(0);
      if (blocked) goto('levels');
    },
    [blocked, goto],
  );

  const last = campaign.sites.length - 1;
  const turnPage = useCallback(
    (by: number): void => {
      const to = Math.max(0, Math.min(last, chosen + by));
      if (to !== chosen) pickSite(to);
    },
    [chosen, last, pickSite],
  );

  const onPinKeys = useCallback(
    (event: KeyboardEvent<HTMLUListElement>): void => {
      const to = nextPin(event.key, pinAt, plan.plots);
      if (to === null) return;
      event.preventDefault();
      if (paged) pickSite(to);
      else setPinAt(to);
      pins.current.get(to)?.focus();
    },
    [pinAt, plan.plots, paged, pickSite],
  );

  // The pin and row lists claim their own arrows first; what reaches the window turns the page.
  useEffect(() => {
    if (!paged) return;
    const onKey = (event: globalThis.KeyboardEvent): void => {
      if (event.defaultPrevented || event.altKey || event.metaKey || event.ctrlKey) return;
      if (event.key !== 'ArrowLeft' && event.key !== 'ArrowRight') return;
      const target = event.target;
      if (target instanceof HTMLElement && target.closest('input, textarea, [contenteditable]')) {
        return;
      }
      event.preventDefault();
      turnPage(event.key === 'ArrowRight' ? 1 : -1);
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [paged, turnPage]);

  // A swipe only starts on the plan itself, so the sheet still scrolls and its rows still tap.
  // Past the slop the pointer is captured, which also keeps the release from landing as a tap.
  const onSwipeStart = (event: PointerEvent<HTMLDivElement>): void => {
    if (!paged || !event.isPrimary || event.button !== 0) return;
    if (
      event.target instanceof Element &&
      event.target.closest('.survey-frame, .survey-seals-tab, .survey-pager')
    ) {
      return;
    }
    swipe.current = { id: event.pointerId, x: event.clientX, y: event.clientY, live: false };
  };

  const onSwipeMove = (event: PointerEvent<HTMLDivElement>): void => {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    const dx = event.clientX - start.x;
    if (!start.live) {
      if (Math.abs(dx) < SWIPE_SLOP) return;
      if (Math.abs(event.clientY - start.y) > Math.abs(dx)) {
        swipe.current = null;
        return;
      }
      start.live = true;
      event.currentTarget.setPointerCapture(event.pointerId);
    }
    const atEdge = (dx > 0 && chosen === 0) || (dx < 0 && chosen === last);
    setDrag(atEdge ? dx / 3 : dx);
  };

  const onSwipeEnd = (event: PointerEvent<HTMLDivElement>): void => {
    const start = swipe.current;
    if (!start || start.id !== event.pointerId) return;
    swipe.current = null;
    if (!start.live) return;
    const dx = event.clientX - start.x;
    setDrag(0);
    if (event.type === 'pointerup' && Math.abs(dx) >= box.w * SWIPE_FLING)
      turnPage(dx < 0 ? 1 : -1);
  };

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

  const onExport = (): void => {
    const blob = new Blob([exportSave(save, librarySave)], { type: 'application/json' });
    const url = URL.createObjectURL(blob);
    const anchor = document.createElement('a');
    anchor.href = url;
    anchor.download = 'as-instructed-save.json';
    anchor.click();
    URL.revokeObjectURL(url);
  };

  const onImport = async (chosenFile: File | undefined): Promise<void> => {
    if (!chosenFile) return;
    const text = await chosenFile.text();
    importSaveFile(text);
    importLibrary(text);
  };

  const actions = (
    <>
      {open ? (
        <button
          type="button"
          className="survey-ctl survey-ctl--tight"
          title={`Back to the station — ${open.id.toUpperCase()}`}
          aria-label={paged ? 'Back to the station' : undefined}
          onClick={() => goto('workspace')}
        >
          <IconMap />
          <span>{paged ? 'station' : 'back to the station'}</span>
        </button>
      ) : null}
      <button
        type="button"
        className="survey-ctl survey-ctl--tight"
        title="Export progress and shared subroutines"
        onClick={onExport}
      >
        export
      </button>
      <button
        type="button"
        className="survey-ctl survey-ctl--tight"
        title="Import progress and shared subroutines"
        onClick={() => file.current?.click()}
      >
        import
      </button>
      <input
        ref={file}
        type="file"
        accept="application/json"
        className="sr-only"
        aria-label="Import a save file"
        onChange={(event) => {
          void onImport(event.target.files?.[0]);
          event.target.value = '';
        }}
      />
    </>
  );

  return (
    <div
      className="survey"
      ref={frame}
      data-narrow={String(narrow)}
      data-paged={String(paged)}
      data-dragging={String(drag !== 0)}
      style={paged ? ({ '--survey-pan': `${String(drag - chosen * box.w)}px` } as Vars) : undefined}
      onPointerDown={onSwipeStart}
      onPointerMove={onSwipeMove}
      onPointerUp={onSwipeEnd}
      onPointerCancel={onSwipeEnd}
    >
      <svg
        className="survey__plan"
        width={span}
        height={box.h}
        viewBox={`0 0 ${String(span)} ${String(box.h)}`}
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
              data-done={String(entry.complete)}
              data-par={String(entry.perfect)}
              data-starred={String(entry.starred)}
            >
              <path className="plot__shape" d={plot.path} />
              {entry.complete && !entry.perfect ? (
                <path className="plot__stipple" d={plot.stipple} />
              ) : null}
              {entry.perfect ? <path className="plot__ink" d={plot.ink} /> : null}
              {entry.starred ? <path className="plot__rings" d={plot.rings} /> : null}
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
                    data-station={String(allBonusMet(order))}
                  >
                    {order.isNext ? (
                      <rect
                        className="plot-mark__ping"
                        x={mark.x - plot.pip * PING_REACH}
                        y={mark.y - plot.pip * PING_REACH}
                        width={plot.pip * PING_REACH * 2}
                        height={plot.pip * PING_REACH * 2}
                      />
                    ) : null}
                    {allBonusMet(order) ? (
                      <path className="plot-mark__station" d={station(mark.x, mark.y, plot.pip)} />
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

      {titled ? (
        <h1
          className="survey__title"
          style={{ left: `${String(box.aside)}px`, right: `${String(box.w - box.flank)}px` }}
        >
          <span className="sr-only">{GAME_TITLE}</span>
          <GameWordmark height={46} />
          <GameMark size={56} />
        </h1>
      ) : null}

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
                data-done={String(entry.complete)}
                data-par={String(entry.perfect)}
                data-starred={String(entry.starred)}
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

      {paged ? (
        <nav className="survey-pager" aria-label="Site pager">
          <button
            type="button"
            className="survey-ctl survey-ctl--tight"
            aria-label="Previous site"
            aria-disabled={chosen === 0}
            onClick={() => turnPage(-1)}
          >
            ‹
          </button>
          <span className="survey-pager__at" aria-live="polite">
            <span className="sr-only">Site </span>
            {chosen + 1} / {campaign.sites.length}
          </span>
          <button
            type="button"
            className="survey-ctl survey-ctl--tight"
            aria-label="Next site"
            aria-disabled={chosen === last}
            onClick={() => turnPage(1)}
          >
            ›
          </button>
        </nav>
      ) : null}

      <section
        className="survey-frame survey__tally"
        aria-label="Campaign survey totals"
        ref={tally}
      >
        <div className="survey-frame__body">
          <div className="survey-bar">
            <span>Orbital survey</span>
            <span className="survey-bar__tools">
              <span>
                {campaign.closed}/{campaign.issued}
              </span>
              {paged ? null : actions}
            </span>
          </div>
          {paged ? (
            <div className="survey-bar survey-bar--sub survey-tally__actions">{actions}</div>
          ) : null}
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
        ref={dossier}
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
            {site && site.world.concepts.length > 0 ? (
              <ul className="site-brief__concepts" aria-label="Concepts on this site">
                {site.world.concepts.map((concept) => (
                  <li key={concept} className="site-brief__concept">
                    {concept}
                  </li>
                ))}
              </ul>
            ) : null}
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
                    <span
                      className="order-row__medal"
                      data-medal={medalMark(order)}
                      title={
                        medalMark(order) === 'closed' ? 'closed, no par on this order' : undefined
                      }
                    >
                      {MEDAL_MARK[medalMark(order)] ?? '·'}
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
        aria-label={`Achievements, ${String(campaign.earnedCount)} of ${String(campaign.achievements.length)} awarded`}
        onClick={() => setSeals((was) => !was)}
      >
        <span className="survey-seals-tab__text">
          Achievements {campaign.earnedCount}/{campaign.achievements.length}
        </span>
      </button>

      <section
        className="survey-frame survey-seals"
        id="survey-seals"
        data-on={String(seals)}
        aria-label="Achievements"
        {...(seals ? {} : { inert: true })}
      >
        <div className="survey-frame__body">
          <div className="survey-bar">
            <span>Achievements</span>
            <span className="survey-bar__tools">
              <span>
                {campaign.earnedCount}/{campaign.achievements.length} awarded
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
            {campaign.achievements.map((entry) => {
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
