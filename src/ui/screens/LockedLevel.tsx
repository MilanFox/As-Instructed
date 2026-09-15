import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import type { SaveFile } from '../../game/save.ts';
import type { BlockedLevel } from '../../game/store.ts';
import { lockReason, useGame } from '../../game/store.ts';
import '../styles/locked.css';

const KICKER: Record<BlockedLevel['reason'], string> = {
  locked: 'Filed, costed, and not yours yet.',
  unknown: 'Filing has nothing under that number.',
};

export function blockedHeading(blocked: BlockedLevel): string {
  return blocked.reason === 'unknown'
    ? `NO WORK ORDER ${blocked.levelId.toUpperCase()}`
    : `WORK ORDER ${blocked.levelId.toUpperCase()} — ON HOLD`;
}

export function blockedLines(save: SaveFile, blocked: BlockedLevel): string[] {
  if (blocked.reason === 'unknown') {
    return [
      `The campaign has no work order ${blocked.levelId}.`,
      'The site map lists every work order that exists.',
    ];
  }

  const lines = [`Work order ${blocked.levelId} is not open yet.`];
  const reason = lockReason(save, blocked.levelId);
  if (!reason) return lines;

  if (reason.opensOnClosing) lines.push(`Closing ${reason.opensOnClosing} opens it.`);
  if (reason.previousWorld !== null) {
    const left = reason.outstanding.length;
    lines.push(
      left === 1
        ? `Closing the last open work order in world ${reason.previousWorld} opens it as well.`
        : `Closing the ${left} open work orders in world ${reason.previousWorld} opens it as well.`,
    );
  }
  return lines;
}

export function LockedLevel({ blocked }: { blocked: BlockedLevel }): JSX.Element {
  const save = useGame((state) => state.save);
  const goto = useGame((state) => state.goto);
  const heading = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    heading.current?.focus();
  }, [blocked.levelId, blocked.reason]);

  return (
    <section className="locked" aria-label={blockedHeading(blocked)}>
      <div className="locked__card">
        <h1 className="locked__title" ref={heading} tabIndex={-1}>
          {blockedHeading(blocked)}
        </h1>
        <p className="locked__kicker">{KICKER[blocked.reason]}</p>
        <ul className="locked__lines">
          {blockedLines(save, blocked).map((line) => (
            <li key={line}>{line}</li>
          ))}
        </ul>
        <button type="button" className="btn locked__exit" onClick={() => goto('levels')}>
          back to the site map
        </button>
      </div>
    </section>
  );
}
