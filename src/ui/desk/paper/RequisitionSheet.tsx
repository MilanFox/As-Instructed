import { useGame } from '../../../game/store.ts';
import {
  REQUISITION_FROM,
  REQUISITION_TITLE,
  hardwareNote,
  requisitionDot,
  requisitionIntro,
} from '../../copy.ts';

function openReference(name: string): void {
  window.dispatchEvent(new CustomEvent('bootstrap:docs-focus', { detail: { name } }));
}

export function RequisitionSheet({
  levelId,
  hardware,
  signed,
}: {
  levelId: string;
  hardware: readonly string[];
  signed: boolean;
}): React.JSX.Element {
  const level = useGame((state) => state.currentLevelId);
  const salt = hardware.join('').length + levelId.length;

  return (
    <>
      <h1>
        <b>HARDWARE REQUISITION</b>
        <span>KD-{String(2200 + salt)}</span>
      </h1>
      <div className="kicker">{REQUISITION_FROM.toUpperCase()}</div>
      <p className="quiet">{REQUISITION_TITLE}</p>
      <p>{requisitionIntro(salt)}</p>

      {hardware.map((name) => {
        const note = hardwareNote(name);
        return (
          <div className="crate" key={name}>
            <div className="nm">
              <code>{name}()</code>
              <button
                type="button"
                className="act ghost"
                onClick={(event) => {
                  event.stopPropagation();
                  openReference(name);
                }}
              >
                reference
              </button>
            </div>
            <div>
              <div className="sp">{note.spec}</div>
              <div className="op">{note.opens}</div>
            </div>
          </div>
        );
      })}

      <div className="dot">dot: {requisitionDot(salt)}</div>

      <div className={signed ? 'sigline signed' : 'sigline'} data-signline>
        <div className="rule">
          <div className="hint">sign here — drag the pen across the line</div>
          <svg width="100%" height="100%" aria-hidden="true">
            <path data-sig-path d="" />
          </svg>
        </div>
        <div className="cap">
          <span>CONTRACTOR #4471</span>
          <span>{level ?? levelId}</span>
        </div>
      </div>

      <div className="foot">
        {signed
          ? 'Signed for. Fitted to the bot. Procurement have closed the requisition.'
          : 'Fitted to the bot already. Procurement would still like the signature.'}
      </div>
      <div className="ref">KD-{String(2200 + salt)} · DELIVERY NOTE</div>
    </>
  );
}
