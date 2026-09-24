import { useEffect, useState } from 'react';

import type { Computing } from '../../game/store.ts';

const SHOW_AFTER_MS = 150;
const ELAPSED_STEP_MS = 100;

export function useSlowCompute(computing: Computing | null): boolean {
  const startedAt = computing?.startedAt ?? null;
  const [shownFor, setShownFor] = useState<number | null>(null);

  useEffect(() => {
    if (startedAt === null) return;
    const wait = Math.max(0, startedAt + SHOW_AFTER_MS - performance.now());
    const timer = setTimeout(() => setShownFor(startedAt), wait);
    return () => clearTimeout(timer);
  }, [startedAt]);

  return startedAt !== null && shownFor === startedAt;
}

function seconds(ms: number): string {
  return `${(ms / 1000).toFixed(1)}s`;
}

export function ComputeMeter({ computing }: { computing: Computing }): React.ReactElement {
  const [now, setNow] = useState(() => performance.now());

  useEffect(() => {
    const timer = setInterval(() => setNow(performance.now()), ELAPSED_STEP_MS);
    return () => clearInterval(timer);
  }, []);

  const { boardsDone, boards, boardStartedAt, limitMs } = computing;
  const elapsed = Math.min(limitMs, Math.max(0, now - boardStartedAt));
  const board = Math.min(boards, boardsDone + 1);

  return (
    <>
      <span className="scrubber compute-meter">
        {boards > 1 ? (
          <span className="compute-meter__label">{`board ${String(board)}/${String(boards)}`}</span>
        ) : null}
        <span
          className="compute-meter__track"
          role="progressbar"
          aria-label="Boards computed"
          aria-valuemin={0}
          aria-valuemax={boards}
          aria-valuenow={boardsDone}
          aria-valuetext={`${String(boardsDone)} of ${String(boards)} boards computed`}
        >
          {Array.from({ length: boards }, (_, index) => (
            <span
              key={index}
              className="compute-meter__board"
              data-state={index < boardsDone ? 'done' : index === boardsDone ? 'live' : 'queued'}
            />
          ))}
        </span>
      </span>
      <span className="readout" title="Time on this board so far, and its limit">
        {seconds(elapsed)}
        <span className="readout--dim">/{seconds(limitMs)}</span>
      </span>
    </>
  );
}
