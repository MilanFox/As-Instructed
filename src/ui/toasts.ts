import { getAchievement } from '../game/achievements.ts';
import { useGame } from '../game/store.ts';

const TOAST_LIFETIME_MS = 4000;

export interface AchievementToast {
  id: string;
  title: string;
  note: string;
  hidden: boolean;
}

let showing: readonly AchievementToast[] = [];
const listeners = new Set<() => void>();
const timers = new Map<string, ReturnType<typeof setTimeout>>();

function publish(next: readonly AchievementToast[]): void {
  showing = next;
  for (const listener of listeners) listener();
}

export function subscribeToasts(listener: () => void): () => void {
  listeners.add(listener);
  return () => {
    listeners.delete(listener);
  };
}

export function achievementToasts(): readonly AchievementToast[] {
  return showing;
}

export function dismissToast(id: string): void {
  const timer = timers.get(id);
  if (timer !== undefined) clearTimeout(timer);
  timers.delete(id);
  if (!showing.some((toast) => toast.id === id)) return;
  publish(showing.filter((toast) => toast.id !== id));
}

export function mountToasts(): () => void {
  const announced = new Set<string>();
  const detach = useGame.subscribe((state, previous) => {
    if (state.freshAchievements === previous.freshAchievements) return;
    const arrivals: AchievementToast[] = [];
    for (const id of state.freshAchievements) {
      if (announced.has(id)) continue;
      announced.add(id);
      const achievement = getAchievement(id);
      if (!achievement) continue;
      arrivals.push({
        id,
        title: achievement.title,
        note: achievement.note,
        hidden: achievement.hidden === true,
      });
    }
    if (arrivals.length === 0) return;
    for (const toast of arrivals) {
      timers.set(
        toast.id,
        setTimeout(() => dismissToast(toast.id), TOAST_LIFETIME_MS),
      );
    }
    publish([...showing, ...arrivals]);
  });
  return () => {
    detach();
    for (const timer of timers.values()) clearTimeout(timer);
    timers.clear();
    publish([]);
  };
}
