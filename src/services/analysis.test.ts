import { describe, expect, it } from 'vitest';
import type { GameSessionStats, LapTelemetry } from '../types';
import { deriveStats, localAnalysis } from './analysis';

function lap(lapNumber: number, time: number, extra: Partial<LapTelemetry> = {}): LapTelemetry {
  return {
    lapNumber,
    time,
    maxSpeed: 300,
    averageSpeed: 260,
    offTrackCount: 0,
    collisions: 0,
    ...extra,
  };
}

function session(telemetry: LapTelemetry[], overrides: Partial<GameSessionStats> = {}): GameSessionStats {
  const times = telemetry.map((entry) => entry.time);
  return {
    trackId: 'mos-espa',
    trackName: 'Mos Espa Circuit',
    carId: 'pod-1',
    carName: 'Titan Twin-Turbo',
    totalLaps: telemetry.length,
    bestLap: times.length ? Math.min(...times) : null,
    totalTime: times.reduce((sum, time) => sum + time, 0),
    finishPosition: 1,
    fieldSize: 6,
    finished: true,
    rivalSkill: 'PRO',
    telemetry,
    timestamp: '2026-01-01T00:00:00.000Z',
    ...overrides,
  };
}

describe('deriveStats', () => {
  it('summarises a clean, consistent run', () => {
    const stats = deriveStats(session([lap(1, 20), lap(2, 20), lap(3, 20)]));
    expect(stats.lapCount).toBe(3);
    expect(stats.bestLap).toBe(20);
    expect(stats.averageLap).toBe(20);
    expect(stats.spread).toBeCloseTo(0, 6);
    expect(stats.consistency).toBe(100);
    expect(stats.improvement).toBe(0);
  });

  it('scores a ragged run lower than a tidy one', () => {
    const tidy = deriveStats(session([lap(1, 20), lap(2, 20.1), lap(3, 19.9)]));
    const ragged = deriveStats(session([lap(1, 20), lap(2, 26), lap(3, 22)]));
    expect(tidy.consistency).toBeGreaterThan(ragged.consistency);
    expect(ragged.spread).toBeGreaterThan(tidy.spread);
  });

  it('reports improvement as first lap minus last', () => {
    expect(deriveStats(session([lap(1, 24), lap(2, 22)])).improvement).toBeCloseTo(2, 6);
    expect(deriveStats(session([lap(1, 22), lap(2, 24)])).improvement).toBeCloseTo(-2, 6);
  });

  it('totals discipline across laps', () => {
    const stats = deriveStats(
      session([
        lap(1, 20, { collisions: 2, offTrackCount: 1.5, maxSpeed: 310 }),
        lap(2, 21, { collisions: 1, offTrackCount: 0.5, maxSpeed: 402 }),
      ]),
    );
    expect(stats.totalCollisions).toBe(3);
    expect(stats.totalOffTrack).toBeCloseTo(2, 6);
    expect(stats.topSpeed).toBe(402);
  });

  it('survives a session with no completed laps', () => {
    const stats = deriveStats(session([], { bestLap: null, totalTime: 0, totalLaps: 3 }));
    expect(stats.lapCount).toBe(0);
    expect(stats.bestLap).toBeNull();
    expect(stats.averageLap).toBeNull();
    expect(stats.consistency).toBe(0);
  });
});

describe('localAnalysis', () => {
  it('needs no API key and still returns a full debrief', () => {
    const text = localAnalysis(session([lap(1, 20), lap(2, 21), lap(3, 20.5)]));
    expect(text).toContain('Pace');
    expect(text).toContain('Consistency');
    expect(text).toContain('Discipline');
    expect(text.length).toBeGreaterThan(200);
  });

  /** Regression: the heading promised three tips but only two were emitted. */
  it('always delivers the three coaching points it promises', () => {
    const runs = [
      session([lap(1, 20), lap(2, 20), lap(3, 20)]), // flawless
      session([lap(1, 20, { collisions: 4 }), lap(2, 28, { offTrackCount: 6 })]), // messy
      session([lap(1, 20)]), // single lap
    ];
    for (const run of runs) {
      const text = localAnalysis(run);
      expect(text).toContain('Three things to work on');
      expect(text).toMatch(/^1\. /m);
      expect(text).toMatch(/^2\. /m);
      expect(text).toMatch(/^3\. /m);
      expect(text).not.toMatch(/^4\. /m);
    }
  });

  it('says something useful when no lap was completed', () => {
    const text = localAnalysis(session([], { bestLap: null, finished: false }));
    expect(text).toContain('did not complete a full lap');
  });

  it('reports the finishing position when the race was finished', () => {
    const text = localAnalysis(session([lap(1, 20)], { finishPosition: 3, fieldSize: 6 }));
    expect(text).toContain('P3 of 6');
  });
});
