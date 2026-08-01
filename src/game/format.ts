/** 83.4212 -> "1:23.421"; under a minute -> "23.421". */
export function formatTime(seconds: number | null | undefined, placeholder = '--.---'): string {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return placeholder;
  const safe = Math.max(0, seconds);
  const minutes = Math.floor(safe / 60);
  const rest = safe - minutes * 60;
  if (minutes === 0) return rest.toFixed(3);
  return `${minutes}:${rest.toFixed(3).padStart(6, '0')}`;
}

/** Signed delta against a reference lap, e.g. "-0.412" / "+1.088". */
export function formatDelta(seconds: number | null | undefined): string | null {
  if (seconds === null || seconds === undefined || !Number.isFinite(seconds)) return null;
  const sign = seconds > 0 ? '+' : seconds < 0 ? '-' : '';
  return `${sign}${Math.abs(seconds).toFixed(3)}`;
}

export function ordinal(position: number): string {
  const rules = new Intl.PluralRules('en-US', { type: 'ordinal' });
  const suffixes: Partial<Record<Intl.LDMLPluralRule, string>> = {
    one: 'st',
    two: 'nd',
    few: 'rd',
    other: 'th',
  };
  return `${position}${suffixes[rules.select(position)] ?? 'th'}`;
}
