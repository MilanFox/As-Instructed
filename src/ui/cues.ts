import { useGame } from '../game/store.ts';

const AWARD_BEAT = 0.12;
const AWARD_LADDER_RUNGS = 5;

interface AwardCueSinks {
  achievement(index: number, after: number): void;
  pulse(): void;
}

export function mountCues(cues: AwardCueSinks): () => void {
  return useGame.subscribe((state, previous) => {
    if (state.freshAchievements === previous.freshAchievements) return;
    const gained = state.freshAchievements.filter((id) => !previous.freshAchievements.includes(id));
    if (gained.length === 0) return;

    cues.pulse();
    const rungs = Math.min(gained.length, AWARD_LADDER_RUNGS);
    for (let index = 0; index < rungs; index++) cues.achievement(index, index * AWARD_BEAT);
  });
}
