import { Component } from 'react';
import type { ErrorInfo, ReactNode } from 'react';

/**
 * Keeps one dialog's failure inside that dialog.
 *
 * `PanelBoundary` is the same idea for a panel, and this behaves the way it does — one label, the
 * fault logged with its component stack, and the thing taken offline for the session rather than
 * retried into the same loop that killed it. What a modal needs on top is a way out: a panel that
 * reports itself broken sits in its own column and the player carries on around it, while a modal
 * is drawn over the whole game and a notice with nothing to press is a dead screen.
 *
 * So the fallback is itself a dialog with one button, and pressing it closes the modal underneath
 * through that modal's own action — the store has to agree the dialog is shut, or the next run
 * raises the same broken thing again. After that this renders nothing at all for the session,
 * which is what makes the way out guaranteed: nothing here ever remounts the child that threw.
 */
export class ModalBoundary extends Component<
  { label: string; onDismiss: () => void; children: ReactNode },
  { failed: boolean; dismissed: boolean }
> {
  override state = { failed: false, dismissed: false };

  static getDerivedStateFromError(): { failed: boolean } {
    return { failed: true };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error(`${this.props.label} failed to render.`, error, info.componentStack);
  }

  private readonly dismiss = (): void => {
    try {
      this.props.onDismiss();
    } catch (error) {
      console.error(`${this.props.label} could not be closed cleanly.`, error);
    }
    this.setState({ dismissed: true });
  };

  override render(): ReactNode {
    if (this.state.dismissed) return null;
    if (!this.state.failed) return this.props.children;
    return (
      <div className="overlay" role="presentation">
        <div
          className="modal modal--narrow"
          role="alertdialog"
          aria-modal="true"
          aria-label={`${this.props.label} — unavailable`}
        >
          <header className="modal__head">
            <h2 className="modal__verdict modal__verdict--fail">WITHDRAWN</h2>
          </header>
          <div className="modal__body">
            <p className="modal__line">
              {this.props.label} stopped responding and has been taken offline for this session.
            </p>
            <p className="modal__line">Your program and your progress are where you left them.</p>
          </div>
          <footer className="modal__foot">
            <button
              type="button"
              className="btn btn--run"
              ref={(element) => element?.focus({ preventScroll: true })}
              onClick={this.dismiss}
            >
              Back to the program
            </button>
          </footer>
        </div>
      </div>
    );
  }
}
