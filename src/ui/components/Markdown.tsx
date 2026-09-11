import { useMemo } from 'react';
import type * as React from 'react';
import '../styles/docs.css';

type Block =
  | { kind: 'heading'; level: number; text: string }
  | { kind: 'paragraph'; lines: string[] }
  | { kind: 'code'; lines: string[] }
  | { kind: 'list'; ordered: boolean; start: number; items: string[] }
  | { kind: 'quote'; lines: string[] }
  | { kind: 'rule' };

const HEADING = /^ {0,3}(#{1,4})\s+(.*)$/;
const FENCE = /^ {0,3}```/;
const RULE = /^ {0,3}([-*_])(?:[ \t]*\1){2,}[ \t]*$/;
const QUOTE = /^ {0,3}>[ \t]?(.*)$/;
const BULLET = /^ {0,3}[-*][ \t]+(.*)$/;
const ORDERED = /^ {0,3}(\d+)[.)][ \t]+(.*)$/;
const HEADINGS = ['h1', 'h2', 'h3', 'h4'] as const;

function opensBlock(line: string): boolean {
  return (
    line.trim() === '' ||
    RULE.test(line) ||
    HEADING.test(line) ||
    FENCE.test(line) ||
    QUOTE.test(line) ||
    BULLET.test(line) ||
    ORDERED.test(line)
  );
}

function parse(source: string): Block[] {
  const lines = source.replace(/\r\n?/g, '\n').split('\n');
  const blocks: Block[] = [];
  let i = 0;
  while (i < lines.length) {
    const line = lines[i] ?? '';
    if (line.trim() === '') {
      i += 1;
    } else if (FENCE.test(line)) {
      const body: string[] = [];
      for (i += 1; i < lines.length && !FENCE.test(lines[i] ?? ''); i += 1)
        body.push(lines[i] ?? '');
      i += 1;
      blocks.push({ kind: 'code', lines: body });
    } else if (RULE.test(line)) {
      blocks.push({ kind: 'rule' });
      i += 1;
    } else if (HEADING.test(line)) {
      const heading = HEADING.exec(line);
      blocks.push({
        kind: 'heading',
        level: (heading?.[1] ?? '#').length,
        text: heading?.[2] ?? '',
      });
      i += 1;
    } else if (QUOTE.test(line)) {
      const body: string[] = [];
      for (let quoted = QUOTE.exec(lines[i] ?? ''); quoted; quoted = QUOTE.exec(lines[i] ?? '')) {
        body.push(quoted[1] ?? '');
        i += 1;
        if (i >= lines.length) break;
      }
      blocks.push({ kind: 'quote', lines: body });
    } else if (BULLET.test(line) || ORDERED.test(line)) {
      const ordered = ORDERED.test(line);
      const item = ordered ? ORDERED : BULLET;
      const items: string[] = [];
      for (let found = item.exec(lines[i] ?? ''); found; found = item.exec(lines[i] ?? '')) {
        items.push((ordered ? found[2] : found[1]) ?? '');
        i += 1;
        if (i >= lines.length) break;
      }
      blocks.push({ kind: 'list', ordered, start: Number(ORDERED.exec(line)?.[1] ?? 1), items });
    } else {
      const body: string[] = [];
      for (; i < lines.length && !opensBlock(lines[i] ?? ''); i += 1) body.push(lines[i] ?? '');
      blocks.push({ kind: 'paragraph', lines: body });
    }
  }
  return blocks;
}

function inline(text: string, key: string): React.ReactNode[] {
  const pattern = /`([^`]+)`|\*\*([\s\S]+?)\*\*|\*([^*\n]+)\*|_([^_\n]+)_|\[([^\]]*)\]\([^\s)]*\)/g;
  const out: React.ReactNode[] = [];
  let last = 0;
  for (let m = pattern.exec(text); m !== null; m = pattern.exec(text)) {
    if (m.index > last) out.push(text.slice(last, m.index));
    const id = `${key}:${m.index}`;
    if (m[1] !== undefined)
      out.push(
        <code className="md-code" key={id}>
          {m[1]}
        </code>,
      );
    else if (m[2] !== undefined) out.push(<strong key={id}>{inline(m[2], id)}</strong>);
    else if (m[3] !== undefined) out.push(<em key={id}>{inline(m[3], id)}</em>);
    else if (m[4] !== undefined) out.push(<em key={id}>{inline(m[4], id)}</em>);
    else out.push(m[5] ?? '');
    last = m.index + m[0].length;
  }
  if (last < text.length) out.push(text.slice(last));
  return out;
}

function flow(lines: string[], key: string): React.ReactNode[] {
  const out: React.ReactNode[] = [];
  let buffer: string[] = [];
  let segment = 0;

  const flush = (): void => {
    if (buffer.length === 0) return;
    out.push(...inline(buffer.join(' '), `${key}:${segment}`));
    buffer = [];
    segment++;
  };

  lines.forEach((line, index) => {
    buffer.push(line.replace(/([ \t]+|\\)$/, ''));
    if (index < lines.length - 1 && /([ \t]{2}|\\)$/.test(line)) {
      flush();
      out.push(<br key={`${key}:br${index}`} />);
    }
  });
  flush();
  return out;
}

function block(item: Block, key: string): React.ReactNode {
  switch (item.kind) {
    case 'heading': {
      const Tag = HEADINGS[item.level - 1] ?? 'h4';
      return (
        <Tag className={`md-h md-h${item.level}`} key={key}>
          {inline(item.text, key)}
        </Tag>
      );
    }
    case 'code':
      return (
        <pre className="md-pre" key={key}>
          <code>{item.lines.join('\n')}</code>
        </pre>
      );
    case 'list':
      return item.ordered ? (
        <ol className="md-list" key={key} start={item.start}>
          {item.items.map((text, index) => (
            <li key={`${key}:${index}`}>{inline(text, `${key}:${index}`)}</li>
          ))}
        </ol>
      ) : (
        <ul className="md-list" key={key}>
          {item.items.map((text, index) => (
            <li key={`${key}:${index}`}>{inline(text, `${key}:${index}`)}</li>
          ))}
        </ul>
      );
    case 'quote':
      return (
        <blockquote className="md-quote" key={key}>
          {flow(item.lines, key)}
        </blockquote>
      );
    case 'rule':
      return <hr className="md-rule" key={key} />;
    default:
      return (
        <p className="md-p" key={key}>
          {flow(item.lines, key)}
        </p>
      );
  }
}

export function InlineMarkdown({ source }: { source: string }): React.JSX.Element {
  const parts = useMemo(() => inline(source, 'i'), [source]);
  return <>{parts}</>;
}

export function Markdown({
  source,
  className,
}: {
  source: string;
  className?: string;
}): React.JSX.Element {
  const blocks = useMemo(() => parse(source), [source]);
  return (
    <div className={className ? `md ${className}` : 'md'}>
      {blocks.map((item, index) => block(item, `b${index}`))}
    </div>
  );
}
