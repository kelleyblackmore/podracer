/**
 * Device capability probes. Used to pick sane defaults on phones, where the
 * desktop settings (shadows, antialiasing, a 1.75x pixel ratio and a full
 * scenery field) are enough to exhaust a mobile GPU and lose the WebGL context.
 */

/** True for phones and tablets — anything driven primarily by touch. */
export function isTouchPrimary(): boolean {
  if (typeof window === 'undefined') return false;
  return (
    window.matchMedia('(pointer: coarse)').matches ||
    (navigator.maxTouchPoints > 0 && window.matchMedia('(hover: none)').matches)
  );
}

/**
 * Conservative "this is a small or low-powered device" test. Errs toward the
 * cheaper renderer: a desktop user can switch to High in one tap, whereas a
 * phone that loses its context just looks broken.
 */
export function isLowPowerDevice(): boolean {
  if (typeof window === 'undefined') return false;

  const memory = (navigator as Navigator & { deviceMemory?: number }).deviceMemory;
  if (typeof memory === 'number' && memory <= 4) return true;
  if (typeof navigator.hardwareConcurrency === 'number' && navigator.hardwareConcurrency <= 4) {
    return true;
  }
  // A short edge under 500 CSS px is a phone in either orientation.
  const shortEdge = Math.min(window.innerWidth, window.innerHeight);
  return isTouchPrimary() && shortEdge < 900;
}

export function recommendedQuality(): 'low' | 'high' {
  return isLowPowerDevice() ? 'low' : 'high';
}

/**
 * Pixel-ratio ceiling. Rendering a phone's full 3x buffer is the single
 * biggest avoidable cost, and the difference is barely visible at arm's length.
 */
export function maxPixelRatio(quality: 'low' | 'high'): number {
  if (quality === 'low') return 1;
  return isTouchPrimary() ? 1.5 : 1.75;
}
