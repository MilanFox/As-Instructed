import { useEffect } from 'react';

// A row that unwraps in the last frames of a slide still reads as a move rather than a drop.
const GLIDE_FLOOR = 150;

function runningSlide(deck: HTMLElement): Animation | null {
  const sliding = deck
    .getAnimations()
    .filter((animation): animation is CSSTransition => animation instanceof CSSTransition);
  // A deck folding away or back is already moving vertically, and its reflow rides inside that.
  if (sliding.some((animation) => animation.transitionProperty === 'transform')) return null;
  return sliding.find((animation) => animation.transitionProperty === 'left') ?? null;
}

function easingOf(slide: Animation): string {
  const effect = slide.effect;
  if (!(effect instanceof KeyframeEffect)) return 'ease-out';
  const timed = effect.getTiming().easing;
  if (timed !== undefined && timed !== 'linear') return timed;
  return effect.getKeyframes()[0]?.easing ?? 'ease-out';
}

// The deck stands on the bottom edge, so when the flyout narrows it and the transport row wraps,
// the height it gains lands on its top edge in one frame. While the deck is sliding, the step is
// carried out over what is left of that slide instead.
export function useDeckGlide(): void {
  useEffect(() => {
    const deck = document.querySelector<HTMLElement>('.transport-deck');
    if (deck === null || typeof ResizeObserver === 'undefined') return;
    const still = window.matchMedia('(prefers-reduced-motion: reduce)');
    let height = deck.offsetHeight;
    const observer = new ResizeObserver(() => {
      const grown = deck.offsetHeight - height;
      height = deck.offsetHeight;
      const slide = runningSlide(deck);
      if (grown === 0 || slide === null || still.matches) return;
      const timing = slide.effect?.getComputedTiming();
      const left = Number(timing?.endTime ?? 0) - Number(slide.currentTime ?? 0);
      if (left <= 0) return;
      const glide = deck.animate([{ translate: `0 ${String(grown)}px` }, { translate: '0 0' }], {
        duration: Math.max(left, GLIDE_FLOOR),
        easing: left < GLIDE_FLOOR ? 'ease-out' : easingOf(slide),
        composite: 'add',
      });
      glide.startTime = document.timeline.currentTime;
    });
    observer.observe(deck);
    return () => {
      observer.disconnect();
    };
  }, []);
}
