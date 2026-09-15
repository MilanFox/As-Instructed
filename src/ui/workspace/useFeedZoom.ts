import { useCallback } from 'react';

import { useGame } from '../../game/store.ts';
import type { FeedRenderer } from '../feed/renderer.ts';

// One feed is mounted at a time, so the "the player drove the camera" latch can be module
// state; that is what lets useFeedZoom live outside the component that runs the auto-fit.
export const cameraHeld = { current: false };

export function useFeedZoom(): (rungs: number) => void {
  const renderer = useGame((state) => state.renderer);
  return useCallback(
    (rungs: number): void => {
      const port = renderer() as FeedRenderer;
      cameraHeld.current = true;
      if (rungs === 0) port.fit?.();
      else port.zoomBy?.(rungs);
      port.setFollow?.(null);
      port.setHover?.(null);
    },
    [renderer],
  );
}
