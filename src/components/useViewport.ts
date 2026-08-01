import { useEffect, useState } from 'react';

export interface Viewport {
  width: number;
  height: number;
  portrait: boolean;
  /**
   * Too little room for the full HUD. On a landscape phone the width is often
   * generous (800+) while the height is not, so this keys off the short edge
   * rather than a plain width breakpoint.
   */
  compact: boolean;
}

function read(): Viewport {
  const width = window.innerWidth;
  const height = window.innerHeight;
  return {
    width,
    height,
    portrait: height > width,
    compact: Math.min(width, height) < 500 || width < 640,
  };
}

/** Tracks viewport size and orientation. Resize and rotation both fire `resize`. */
export function useViewport(): Viewport {
  const [viewport, setViewport] = useState<Viewport>(() =>
    typeof window === 'undefined'
      ? { width: 1280, height: 720, portrait: false, compact: false }
      : read(),
  );

  useEffect(() => {
    let frame = 0;
    const update = () => {
      cancelAnimationFrame(frame);
      // Mobile browsers fire resize repeatedly as the toolbar collapses.
      frame = requestAnimationFrame(() => setViewport(read()));
    };
    window.addEventListener('resize', update);
    window.addEventListener('orientationchange', update);
    return () => {
      cancelAnimationFrame(frame);
      window.removeEventListener('resize', update);
      window.removeEventListener('orientationchange', update);
    };
  }, []);

  return viewport;
}
