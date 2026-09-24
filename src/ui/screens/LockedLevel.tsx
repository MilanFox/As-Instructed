import { useEffect, useRef } from 'react';
import type { JSX } from 'react';
import type { Campaign } from '../../game/campaign.ts';
import type { SaveFile } from '../../game/save.ts';
import type { BlockedLevel } from '../../game/store.ts';
import { lockReason, useGame } from '../../game/store.ts';
import { pathFor } from '../router.ts';
import { openOrder, orderLabel, pad } from './LevelSelect.tsx';
import '../styles/locked.css';

export function blockedHeading(blocked: BlockedLevel): string {
  return blocked.reason === 'unknown'
    ? `NO LEVEL ${blocked.levelId.toUpperCase()}`
    : `LEVEL ${blocked.levelId.toUpperCase()} — ON HOLD`;
}

export function blockedLines(save: SaveFile, blocked: BlockedLevel): string[] {
  if (blocked.reason === 'unknown') {
    return [`There is no level ${blocked.levelId}.`, 'The site map shows every level.'];
  }

  const lines = [`Level ${blocked.levelId} is on hold.`];
  const reason = lockReason(save, blocked.levelId);
  if (!reason) return lines;

  if (reason.opensOnClosing) lines.push(`Finish ${reason.opensOnClosing} to open it.`);
  if (reason.previousWorld !== null) {
    const left = reason.outstanding.length;
    lines.push(
      left === 1
        ? `Or finish the last open level in Site ${reason.previousWorld}.`
        : `Or finish all ${left} open levels in Site ${reason.previousWorld}.`,
    );
  }
  return lines;
}

// blockedLines names the orders that would open this one; those names are the useful click.
const ORDER_ID = /\b(w\d+-\d+)\b/;

function BlockedLine({
  text,
  campaign,
  here,
}: {
  text: string;
  campaign: Campaign;
  here: string;
}): JSX.Element {
  return (
    <>
      {text.split(ORDER_ID).map((part, index) => {
        const order =
          index % 2 === 1 ? campaign.orders.find((entry) => entry.id === part) : undefined;
        if (!order || order.id === here) return <span key={index}>{part}</span>;
        return (
          <a
            key={index}
            className="survey-interlock__jump"
            href={pathFor(order.id)}
            aria-label={orderLabel(order)}
            onClick={(event) => openOrder(event, order.id)}
          >
            {part}
          </a>
        );
      })}
    </>
  );
}

export function Interlock({
  blocked,
  campaign,
  onDismiss,
}: {
  blocked: BlockedLevel;
  campaign: Campaign;
  onDismiss: () => void;
}): JSX.Element {
  const save = useGame((state) => state.save);
  const plate = useRef<HTMLHeadingElement | null>(null);

  useEffect(() => {
    plate.current?.focus();
  }, [blocked.levelId, blocked.reason]);

  const site = campaign.sites.find((entry) =>
    entry.orders.some((order) => order.id === blocked.levelId),
  );

  return (
    <section className="survey-frame survey-interlock" aria-label={blockedHeading(blocked)}>
      <div className="survey-frame__body">
        <div className="survey-bar survey-bar--stop">
          <span>Level</span>
          <span className="survey-bar__tools">On hold</span>
        </div>
        <div className="survey-interlock__pad">
          <h2 className="survey-interlock__head" ref={plate} tabIndex={-1}>
            {blockedHeading(blocked)}
          </h2>
          <ul className="survey-interlock__lines">
            {blockedLines(save, blocked).map((entry) => (
              <li key={entry}>
                <BlockedLine text={entry} campaign={campaign} here={blocked.levelId} />
              </li>
            ))}
          </ul>
          {site ? (
            <>
              <p className="survey-interlock__kicker">
                Site {pad(site.world.id)} — {site.world.name}
              </p>
              <ul className="survey-interlock__orders" aria-label="Levels on this site">
                {site.orders.map((order) => (
                  <li key={order.id}>
                    <a
                      className="survey-interlock__order"
                      href={pathFor(order.id)}
                      data-status={order.status}
                      data-here={String(order.id === blocked.levelId)}
                      aria-current={order.id === blocked.levelId ? 'true' : undefined}
                      aria-label={orderLabel(order)}
                      onClick={(event) => openOrder(event, order.id)}
                    >
                      <span className="survey-interlock__id">{order.id}</span>
                      <span className="survey-interlock__what">{order.level.title}</span>
                      <span className="survey-interlock__state">{order.status}</span>
                    </a>
                  </li>
                ))}
              </ul>
            </>
          ) : null}
        </div>
        <div className="survey-interlock__foot">
          <button type="button" className="survey-ctl" onClick={onDismiss}>
            Back to the site map
          </button>
          <span className="survey-interlock__hint">Or pick any site.</span>
        </div>
      </div>
    </section>
  );
}
