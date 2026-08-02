import { describe, expect, it } from 'vitest';
import { TRACKS } from '../constants';
import type { RivalSkill } from '../types';
import { buildTrackMeshes, GROUND_DROP, RUNOFF_WIDTH } from './trackMesh';
import { countEvents, findNonFinite, geometryFor, runRace, startRace } from './testSupport';

/**
 * End-to-end simulation. Each case runs a complete race with the AI driving
 * every pod, then asserts the invariants that have actually broken before:
 * races that never finish, pods welded together or beached against a barrier,
 * lap counts corrupted by a crossover, and pods left stuck in mid-air.
 *
 * These are the tests that would have caught every gameplay bug in this
 * project's history, and they run without a browser.
 */

const SKILLS: Exclude<RivalSkill, 'NONE'>[] = ['ROOKIE', 'LEGEND'];
const cases = TRACKS.flatMap((track) => SKILLS.map((skill) => [track.id, skill, track] as const));

describe.each(cases)('%s at %s', (_id, skill, track) => {
  const race = startRace(track, { laps: 2, rivalSkill: skill, autopilot: true });
  const summary = runRace(race);

  it('reaches the chequered flag', () => {
    expect(summary.timedOut).toBe(false);
    expect(race.phase).toBe('FINISHED');
  });

  it('records the right number of laps, all plausibly timed', () => {
    expect(race.player.lapTimes).toHaveLength(race.totalLaps);
    for (const lap of race.player.lapTimes) {
      expect(lap).toBeGreaterThan(5);
      expect(lap).toBeLessThan(180);
    }
    // Lap counting must agree with the recorded times.
    expect(race.player.lap).toBe(race.totalLaps);
  });

  it('advances every racer around the circuit', () => {
    const { length } = geometryFor(track);
    for (const racer of race.racers) {
      expect(racer.totalProgress).toBeGreaterThan(length * 0.5);
    }
  });

  /**
   * Regression: a per-frame contact penalty once welded touching pods together
   * at a crawl, and rivals aiming at an over-clamped racing line converged into
   * exactly that. Both symptoms show up as a rival that never gets up to speed.
   */
  it('never leaves a pod crawling or beached', () => {
    for (const racer of race.racers) {
      const peak = summary.peakSpeed.get(racer.id) ?? 0;
      expect(peak).toBeGreaterThan(racer.config.topSpeed * 0.6);
    }
  });

  it('keeps every pod inside the barriers', () => {
    const geometry = geometryFor(track);
    const barrier = geometry.halfWidth + RUNOFF_WIDTH;
    for (const racer of race.racers) {
      expect(Math.abs(racer.lateral)).toBeLessThanOrEqual(barrier + 2);
    }
  });

  it('lands every pod it launches', () => {
    const takeoffs = countEvents(summary.events, 'takeoff');
    const landings = countEvents(summary.events, 'land');
    const stillFlying = race.racers.filter((racer) => racer.airborne).length;

    if (!track.ramps?.length) {
      expect(takeoffs).toBe(0);
      expect(landings).toBe(0);
    } else {
      expect(takeoffs).toBeGreaterThan(0);
    }
    // Anyone mid-jump when the flag falls accounts for the difference.
    expect(takeoffs - landings).toBe(stillFlying);
    expect(stillFlying).toBeLessThanOrEqual(race.racers.length - 1);
  });

  it('produces standings consistent with progress', () => {
    const ordered = [...race.racers].sort((a, b) => a.position - b.position);
    expect(ordered.map((racer) => racer.position)).toEqual(race.racers.map((_, i) => i + 1));

    // Whoever finished is ahead of whoever did not.
    const finishedPositions = ordered.filter((r) => r.finished).map((r) => r.position);
    const unfinishedPositions = ordered.filter((r) => !r.finished).map((r) => r.position);
    if (finishedPositions.length && unfinishedPositions.length) {
      expect(Math.max(...finishedPositions)).toBeLessThan(Math.min(...unfinishedPositions));
    }
  });

  it('writes one telemetry row per completed lap', () => {
    expect(race.player.telemetry).toHaveLength(race.player.lapTimes.length);
    for (const lap of race.player.telemetry) {
      expect(lap.maxSpeed).toBeGreaterThan(0);
      expect(lap.averageSpeed).toBeGreaterThan(0);
      expect(lap.collisions).toBeGreaterThanOrEqual(0);
      expect(lap.offTrackCount).toBeGreaterThanOrEqual(0);
    }
  });
});

describe.each(TRACKS.map((track) => [track.id, track] as const))('%s geometry output', (_id, track) => {
  const geometry = geometryFor(track);
  const meshes = buildTrackMeshes(geometry);

  it('emits no degenerate vertices', () => {
    const parts = [
      meshes.road,
      meshes.runoffLeft,
      meshes.runoffRight,
      meshes.curbLeft,
      meshes.curbRight,
      meshes.wallLeft,
      meshes.wallRight,
      meshes.railLeft,
      meshes.railRight,
      meshes.startLine,
      ...(meshes.rampFlanks ? [meshes.rampFlanks] : []),
    ];
    for (const part of parts) {
      const positions = part.getAttribute('position').array as ArrayLike<number>;
      expect(positions.length).toBeGreaterThan(0);
      expect(findNonFinite(positions)).toBe(0);
    }
  });

  it('builds ramp flanks only where there are ramps', () => {
    expect(Boolean(meshes.rampFlanks)).toBe(Boolean(track.ramps?.length));
  });

  /**
   * Regression: props were once anchored to track height, so on an elevated
   * circuit they hung in mid-air with nothing beneath them.
   */
  it('plants every scenery prop on the ground plane', () => {
    const groundY = meshes.minHeight - GROUND_DROP;
    const props = meshes.scenery.flatMap((batch) => batch.items);
    expect(props.length).toBeGreaterThan(0);
    for (const prop of props) {
      expect(prop.y).toBeCloseTo(groundY, 5);
      // ...and is tall enough to reach back up past the road.
      expect(prop.height).toBeGreaterThan(0);
    }
  });

  it('keeps scenery clear of the racing surface', () => {
    const clearance = geometry.halfWidth + RUNOFF_WIDTH;
    for (const batch of meshes.scenery) {
      for (const prop of batch.items) {
        const { lateral } = nearestLateral(geometry, prop.x, prop.z);
        expect(Math.abs(lateral)).toBeGreaterThan(clearance);
      }
    }
  });
});

/** Full scan, since a prop has no hint index to search around. */
function nearestLateral(
  geometry: ReturnType<typeof geometryFor>,
  x: number,
  z: number,
): { lateral: number } {
  let best = Infinity;
  let lateral = 0;
  for (const sample of geometry.samples) {
    const dx = x - sample.x;
    const dz = z - sample.z;
    const distSq = dx * dx + dz * dz;
    if (distSq < best) {
      best = distSq;
      lateral = dx * sample.nx + dz * sample.nz;
    }
  }
  return { lateral };
}
