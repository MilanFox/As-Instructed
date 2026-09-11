import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';
import { describe, expect, it } from 'vitest';

import { DESK_FRAME } from '../desk/scale.ts';

const STYLE_DIR = join(process.cwd(), 'src/ui/styles/desk');
const DESK_DIR = join(process.cwd(), 'src/ui/desk');

interface Rule {
  selector: string;
  body: string;
}

interface Box {
  x1: number;
  x2: number;
  y1: number;
  y2: number;
}

const CONTROLS: Record<string, { in: string; z: number; why: string }> = {
  'tray-tab': {
    in: 'tray',
    z: 7,
    why: 'the in-tray. the only route back to a document that was put away',
  },
  'tray-list': {
    in: 'tray',
    z: 40,
    why: 'what is in the tray. it opens upward because the tray itself is at the desk edge',
  },
};

const NOT_ON_THE_DESK: Record<string, string> = {
  'fc-mark': 'an act marker on the transport track, positioned per tick. inside the feed housing',
  'cs-unpin': 'inside the copy stand board, on the page it unpins',
  'mo-close': 'on the manual, which is a full-bleed spread while it is open',
};

const LAYERS = new Set(['paper-layer', 'binder-open', 'room', 'desk']);

function readDeskCss(): Rule[] {
  const found: Rule[] = [];
  const css = readdirSync(STYLE_DIR)
    .filter((name) => name.endsWith('.css') && name !== 'director.css')
    .map((name) => readFileSync(join(STYLE_DIR, name), 'utf8'))
    .join('\n')
    .replace(/\/\*[\s\S]*?\*\//g, '');
  const pattern = /\.desk([^{}]*)\{([^}]*)\}/g;
  let rule: RegExpExecArray | null;
  while ((rule = pattern.exec(css)) !== null) {
    found.push({ selector: (rule[1] ?? '').trim(), body: rule[2] ?? '' });
  }
  return found;
}

const rules = readDeskCss();

function rulesFor(name: string): Rule[] {
  return rules.filter((rule) => {
    if (/[[:]/.test(rule.selector)) return false;
    const classes = rule.selector.match(/\.[\w-]+/g);
    return classes?.length === 1 && classes[0] === `.${name}`;
  });
}

function declaration(name: string, property: string): string | undefined {
  for (const rule of [...rulesFor(name)].reverse()) {
    const found = new RegExp(`(?:^|;)\\s*${property}:\\s*([^;]+)`).exec(rule.body);
    if (found?.[1]) return found[1].trim();
  }
  return undefined;
}

function length(value: string | undefined, span: number): number | undefined {
  if (value === undefined) return undefined;
  const units = /^calc\(\s*(-?[\d.]+)\s*\*\s*var\(--u\)\s*\)$/.exec(value);
  if (units?.[1]) return Number(units[1]);
  const percent = /^(-?[\d.]+)%$/.exec(value);
  if (percent?.[1]) return (Number(percent[1]) / 100) * span;
  if (/^-?0(px)?$/.test(value)) return 0;
  return undefined;
}

function centred(value: string | undefined): number | undefined {
  if (value === undefined) return undefined;
  const found = /calc\(\s*50%\s*([-+])\s*([\d.]+)\s*\*\s*var\(--u\)\s*\)/.exec(value);
  if (!found?.[2]) return undefined;
  return Number(found[2]) * (found[1] === '-' ? -1 : 1);
}

function inset(name: string): (string | undefined)[] | undefined {
  const value = declaration(name, 'inset');
  if (value === undefined) return undefined;
  const parts = value.match(/calc\([^)]*\)|-?[\d.]+%|-?0(?:px)?/g);
  if (!parts) return undefined;
  const [top, right = top, bottom = top, left = right] = parts;
  return [top, right, bottom, left];
}

interface Furniture extends Box {
  z: number;
  dead: boolean;
}

function furniture(): Map<string, Furniture> {
  const found = new Map<string, Furniture>();
  for (const rule of rules) {
    if (/[[:]/.test(rule.selector)) continue;
    const classes = rule.selector.match(/\.[\w-]+/g);
    if (classes?.length !== 1 || !classes[0]) continue;
    const name = classes[0].slice(1);
    if (LAYERS.has(name) || found.has(name)) continue;
    const left = centred(declaration(name, 'left'));
    const top = centred(declaration(name, 'top'));
    if (left === undefined || top === undefined) continue;
    const width = length(declaration(name, 'width'), 0) ?? 0;
    const height = length(declaration(name, 'height'), 0) ?? 0;
    found.set(name, {
      x1: left,
      x2: left + width,
      y1: top,
      y2: top + height,
      z: Number(declaration(name, 'z-index') ?? 0),
      dead: declaration(name, 'pointer-events') === 'none',
    });
  }
  return found;
}

function childBox(name: string, parent: Box): Box | undefined {
  const width = parent.x2 - parent.x1;
  const height = parent.y2 - parent.y1;
  const sides = inset(name);
  const left = length(sides?.[3] ?? declaration(name, 'left'), width);
  const right = length(sides?.[1] ?? declaration(name, 'right'), width);
  const top = length(sides?.[0] ?? declaration(name, 'top'), height);
  const bottom = length(sides?.[2] ?? declaration(name, 'bottom'), height);
  const own = length(declaration(name, 'width'), width);
  const tall =
    length(declaration(name, 'height'), height) ?? length(declaration(name, 'max-height'), height);
  const shifted = /translateX?\(\s*-50%/.test(declaration(name, 'transform') ?? '');

  let x1: number | undefined;
  let x2: number | undefined;
  if (left !== undefined && own !== undefined) [x1, x2] = [left, left + own];
  else if (left !== undefined && right !== undefined) [x1, x2] = [left, width - right];
  else if (right !== undefined && own !== undefined)
    [x1, x2] = [width - right - own, width - right];
  if (x1 === undefined || x2 === undefined) return undefined;
  if (shifted) {
    const half = (x2 - x1) / 2;
    [x1, x2] = [x1 - half, x2 - half];
  }

  let y1: number | undefined;
  let y2: number | undefined;
  if (top !== undefined && tall !== undefined) [y1, y2] = [top, top + tall];
  else if (top !== undefined && bottom !== undefined) [y1, y2] = [top, height - bottom];
  else if (bottom !== undefined && tall !== undefined) {
    [y1, y2] = [height - bottom - tall, height - bottom];
  }
  if (y1 === undefined || y2 === undefined) return undefined;

  return { x1: parent.x1 + x1, x2: parent.x1 + x2, y1: parent.y1 + y1, y2: parent.y1 + y2 };
}

function overlaps(a: Box, b: Box): boolean {
  return a.x1 < b.x2 && b.x1 < a.x2 && a.y1 < b.y2 && b.y1 < a.y2;
}

function livingParts(): Map<string, string[]> {
  const parts = new Map<string, string[]>();
  let dead: string | null = null;
  for (const rule of rules) {
    const classes = rule.selector.match(/\.[\w-]+/g) ?? [];
    if (/pointer-events:\s*none/.test(rule.body) && classes.length === 1 && classes[0]) {
      dead = classes[0].slice(1);
      parts.set(dead, []);
      continue;
    }
    if (!dead || !/pointer-events:\s*auto/.test(rule.body)) continue;
    const taken = parts.get(dead) ?? [];
    for (const each of classes) {
      const name = each.slice(1);
      if (name !== 'desk' && name !== dead) taken.push(name);
    }
    parts.set(dead, taken);
  }
  return parts;
}

const objects = furniture();
const revived = livingParts();

describe('every desk control is the thing the pointer lands on', () => {
  it('knows every control that is taken out of its housing flow', () => {
    const buttons = new Set<string>();
    const walk = (dir: string): void => {
      for (const entry of readdirSync(dir, { withFileTypes: true })) {
        const path = join(dir, entry.name);
        if (entry.isDirectory()) walk(path);
        else if (entry.name.endsWith('.tsx')) {
          const source = readFileSync(path, 'utf8');
          for (const tag of source.match(/<button\b[\s\S]*?>/g) ?? []) {
            for (const found of tag.matchAll(
              /className=(?:"([^"]*)"|\{`([^`]*)`\}|\{([^}]*)\})/g,
            )) {
              const text = found[1] ?? found[2] ?? found[3] ?? '';
              for (const word of text.match(/[\w-]+/g) ?? []) buttons.add(word);
            }
          }
        }
      }
    };
    walk(DESK_DIR);

    const unclassified = [...buttons]
      .filter((name) => rulesFor(name).some((rule) => /position:\s*absolute/.test(rule.body)))
      .filter((name) => !(name in CONTROLS) && !(name in NOT_ON_THE_DESK))
      .sort();
    expect(unclassified, 'these are positioned controls nobody has ruled on').toEqual([]);
  });

  it('places every desk control inside the frame', () => {
    for (const [name, control] of Object.entries(CONTROLS)) {
      const housing = objects.get(control.in);
      expect(housing, `.${control.in} is not a piece of furniture`).toBeDefined();
      if (!housing) continue;
      const box = childBox(name, housing);
      expect(box, `.${name} declares no resolvable box`).toBeDefined();
      if (!box) continue;
      expect(
        [box.x1 >= -DESK_FRAME.w / 2, box.x2 <= DESK_FRAME.w / 2],
        `.${name} reaches x ${String(box.x1)}..${String(box.x2)} and the frame is ${String(DESK_FRAME.w)} wide`,
      ).toEqual([true, true]);
      expect(
        [box.y1 >= -DESK_FRAME.h / 2, box.y2 <= DESK_FRAME.h / 2],
        `.${name} reaches y ${String(box.y1)}..${String(box.y2)} and the frame is ${String(DESK_FRAME.h)} tall`,
      ).toEqual([true, true]);
    }
  });

  it('lets nothing paint over a desk control', () => {
    const covered: string[] = [];
    for (const [name, control] of Object.entries(CONTROLS)) {
      const housing = objects.get(control.in);
      const box = housing ? childBox(name, housing) : undefined;
      if (!housing || !box) continue;
      for (const [other, object] of objects) {
        if (other === control.in || object.z < control.z) continue;
        const drawn: [string, Box][] = object.dead
          ? (revived.get(other) ?? [])
              .map((part) => [part, childBox(part, object)] as [string, Box | undefined])
              .filter((pair): pair is [string, Box] => pair[1] !== undefined)
          : [[other, object]];
        for (const [part, area] of drawn) {
          if (!overlaps(box, area)) continue;
          covered.push(
            `.${part} (z ${String(object.z)}) covers .${name} (z ${String(control.z)}): ` +
              `x ${String(area.x1)}..${String(area.x2)} y ${String(area.y1)}..${String(area.y2)} ` +
              `against x ${String(box.x1)}..${String(box.x2)} y ${String(box.y1)}..${String(box.y2)}`,
          );
        }
      }
    }
    expect(covered, 'a control under something else is a control that does not exist').toEqual([]);
  });
});
