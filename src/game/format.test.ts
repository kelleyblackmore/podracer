import { describe, expect, it } from 'vitest';
import { formatDelta, formatTime, ordinal } from './format';

describe('formatTime', () => {
  it('shows plain seconds under a minute', () => {
    expect(formatTime(23.4212)).toBe('23.421');
    expect(formatTime(0)).toBe('0.000');
  });

  it('shows minutes and zero-padded seconds over a minute', () => {
    expect(formatTime(83.4212)).toBe('1:23.421');
    expect(formatTime(65)).toBe('1:05.000');
    expect(formatTime(600)).toBe('10:00.000');
  });

  it('falls back to a placeholder for missing or invalid values', () => {
    expect(formatTime(null)).toBe('--.---');
    expect(formatTime(undefined)).toBe('--.---');
    expect(formatTime(Number.NaN)).toBe('--.---');
    expect(formatTime(Number.POSITIVE_INFINITY)).toBe('--.---');
    expect(formatTime(null, 'n/a')).toBe('n/a');
  });

  it('clamps negatives rather than printing a minus sign', () => {
    expect(formatTime(-5)).toBe('0.000');
  });
});

describe('formatDelta', () => {
  it('signs the gap explicitly', () => {
    expect(formatDelta(0.412)).toBe('+0.412');
    expect(formatDelta(-0.412)).toBe('-0.412');
    expect(formatDelta(0)).toBe('0.000');
  });

  it('returns null when there is nothing to compare', () => {
    expect(formatDelta(null)).toBeNull();
    expect(formatDelta(Number.NaN)).toBeNull();
  });
});

describe('ordinal', () => {
  it('uses the right English suffix', () => {
    expect(ordinal(1)).toBe('1st');
    expect(ordinal(2)).toBe('2nd');
    expect(ordinal(3)).toBe('3rd');
    expect(ordinal(4)).toBe('4th');
    expect(ordinal(11)).toBe('11th');
    expect(ordinal(12)).toBe('12th');
    expect(ordinal(13)).toBe('13th');
    expect(ordinal(21)).toBe('21st');
    expect(ordinal(22)).toBe('22nd');
    expect(ordinal(23)).toBe('23rd');
  });
});
