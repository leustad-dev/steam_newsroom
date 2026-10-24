import { useEffect, useRef, useState, type MouseEvent } from 'react';

/** Page-owned feedback survives removal of the clicked Favorites card. */
export function useFavoriteFeedback() {
  const sequence = useRef(0);
  const [pulse, setPulse] = useState<{ id: number; x: number; y: number; symbol: string; removing: boolean }>();
  useEffect(() => {
    if (!pulse) return;
    const timer = window.setTimeout(() => setPulse(undefined), 450);
    return () => window.clearTimeout(timer);
  }, [pulse]);
  return {
    onClickCapture(event: MouseEvent<HTMLElement>) {
      const target = event.target instanceof Element ? event.target : undefined;
      const button = target?.closest<HTMLButtonElement>('button.nr-favorite-control');
      if (!button || button.disabled) return;
      const panel = event.currentTarget;
      const bounds = panel.getBoundingClientRect();
      const rect = button.getBoundingClientRect();
      setPulse({ id: ++sequence.current,
        x: rect.left + rect.width / 2 - bounds.left + panel.scrollLeft,
        y: rect.top + rect.height / 2 - bounds.top + panel.scrollTop,
        symbol: button.textContent?.trim() || '★',
        removing: button.classList.contains('nr-favorite-remove') || button.getAttribute('aria-pressed') === 'true',
      });
    },
    feedback: pulse && <span key={pulse.id} aria-hidden="true" className={`nr-favorite-pop ${pulse.removing ? 'nr-favorite-pop-remove' : ''}`}
      style={{ left: pulse.x, top: pulse.y }}>{pulse.symbol}</span>,
  };
}
