import { useEffect, useRef } from 'react';
import { IconClose } from './Icons.tsx';

export interface HudSheetProps {
  id: string;
  /** Which panel is in it. Only the width and the height of the card depend on this. */
  kind: string;
  /** Names the dialog. Short: the panel inside it carries its own headings. */
  title: string;
  /** Set when the player summoned this panel, which is the only time focus may move. */
  focusKey: string | null;
  onClose(): void;
  children: React.ReactNode;
}

/**
 * A reading panel, slid over the board and dismissible.
 *
 * Non-modal on purpose — the board carries on running behind it and the player is expected to
 * read the two against each other — so there is no scrim, no focus trap, and Tab walks out of it
 * the way it walks out of anything else. What a dismissible thing does owe the player is a way
 * back: Escape (handled globally, so it works from the editor too), a close button, and the
 * focus it borrowed returned to whatever opened it.
 */
export function HudSheet({
  id,
  kind,
  title,
  focusKey,
  onClose,
  children,
}: HudSheetProps): React.JSX.Element {
  const sheetRef = useRef<HTMLDivElement | null>(null);
  const openerRef = useRef<Element | null>(null);

  useEffect(() => {
    openerRef.current = document.activeElement;
    const sheet = sheetRef.current;
    return () => {
      const opener = openerRef.current;
      const active = document.activeElement;
      const strayed = active === null || active === document.body || sheet?.contains(active);
      if (!strayed) return;
      if (opener instanceof HTMLElement && opener.isConnected) opener.focus();
    };
  }, []);

  /*
   * Re-read the opener on every summon, not just on mount.
   *
   * The card outlives the panel inside it — asking for the console while the brief is up swaps the
   * contents and keeps the dialog — so a single capture at mount would hand focus back to whatever
   * opened the *first* panel, which by then is usually nothing at all.
   */
  useEffect(() => {
    if (!focusKey) return;
    openerRef.current = document.activeElement;
    sheetRef.current?.focus();
  }, [focusKey]);

  return (
    <div
      className={`sheet sheet--${kind}`}
      id={id}
      ref={sheetRef}
      role="dialog"
      aria-label={title}
      tabIndex={-1}
    >
      {/* A div, not a `header`: a `header` outside article/aside/main/nav/section is a banner
          landmark, and one page does not get two of those. */}
      <div className="sheet__head">
        <h2 className="sheet__title">{title}</h2>
        <span className="panel__head-spacer" />
        <button
          type="button"
          className="icon-btn"
          onClick={onClose}
          title={`Close the ${title.toLowerCase()} (Esc)`}
          aria-label={`Close the ${title.toLowerCase()}`}
        >
          <IconClose />
        </button>
      </div>
      <div className="sheet__body">{children}</div>
    </div>
  );
}
