import { useSyncExternalStore } from 'react';
import { achievementToasts, dismissToast, subscribeToasts } from '../toasts.ts';

export function AchievementToasts(): React.JSX.Element {
  const toasts = useSyncExternalStore(subscribeToasts, achievementToasts, achievementToasts);

  return (
    <div className="toasts" role="status" aria-live="polite">
      {toasts.map((toast) => (
        <button
          key={toast.id}
          type="button"
          className="toast"
          onClick={() => dismissToast(toast.id)}
          title="Dismiss"
        >
          <span className="toast__seal" aria-hidden="true">
            ★
          </span>
          <span className="toast__text">
            <span className="sr-only">Achievement unlocked: </span>
            <span className="toast__title">
              {toast.title}
              {toast.hidden ? <span className="hidden-tag">Hidden</span> : null}
            </span>
            <span className="toast__note">{toast.note}</span>
          </span>
        </button>
      ))}
    </div>
  );
}
