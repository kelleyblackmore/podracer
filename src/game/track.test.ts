import { describe, expect, it } from 'vitest';
import { TRACKS } from '../constants';
import { arcDelta, locate, offsetPoint3, surfaceHeight } from './track';
import { geometryFor, trackById } from './testSupport';

describe('track geometry', () => {
  it.each(TRACKS.map((track) => [track.id, track] as const))(
    '%s resamples to a closed loop of uniform arc length',
    (_id, track) => {
      const geometry = geometryFor(track);
      const { samples, spacing, length } = geometry;

      expect(samples.length).toBeGreaterThan(100);
      expect(Number.isFinite(length)).toBe(true);
      expect(length).toBeGreaterThan(1000);

      // Consecutive samples are evenly spaced, including across the seam.
      for (let i = 0; i < samples.length; i++) {
        const next = samples[(i + 1) % samples.length];
        const step = Math.hypot(next.x - samples[i].x, next.z - samples[i].z);
        expect(step).toBeGreaterThan(spacing * 0.5);
        expect(step).toBeLessThan(spacing * 1.6);
      }
    },
  );

  it.each(TRACKS.map((track) => [track.id, track] as const))(
    '%s keeps a drivable minimum corner radius',
    (_id, track) => {
      const geometry = geometryFor(track);
      const peakCurvature = Math.max(...geometry.samples.map((s) => Math.abs(s.curvature)));
      const minRadius = 1 / peakCurvature;

      // Below roughly this the centre line folds into a cusp that the
      // corner-speed profile can only answer by crawling. Beggar's Canyon once
      // shipped at 26 and the whole field piled into the barrier there.
      expect(minRadius).toBeGreaterThan(230);
    },
  );

  it.each(TRACKS.map((track) => [track.id, track] as const))(
    '%s has a corner-speed profile a pod can actually drive',
    (_id, track) => {
      const geometry = geometryFor(track);
      const limits = geometry.samples.map((s) => s.speedLimit);
      expect(Math.min(...limits)).toBeGreaterThanOrEqual(2.5);
      expect(limits.every((limit) => Number.isFinite(limit))).toBe(true);
    },
  );

  it('closes the elevation profile seamlessly at the start line', () => {
    for (const track of TRACKS.filter((candidate) => candidate.elevation)) {
      const { samples } = geometryFor(track);
      const first = samples[0];
      const last = samples[samples.length - 1];
      // `waves` is a whole number, so height must meet itself around the loop.
      expect(Math.abs(first.y - last.y)).toBeLessThan(track.elevation!.amplitude * 0.2);
    }
  });

  it('marks exactly one lip per ramp, at the ramp height', () => {
    for (const track of TRACKS.filter((candidate) => candidate.ramps?.length)) {
      const { samples } = geometryFor(track);
      const lips = samples.filter((sample) => sample.rampLip > 0);
      expect(lips).toHaveLength(track.ramps!.length);
      for (const lip of lips) {
        expect(track.ramps!.some((ramp) => Math.abs(ramp.height - lip.rampLip) < 1e-6)).toBe(true);
      }
    }
  });

  it('leaves circuits without ramps completely flat', () => {
    for (const track of TRACKS.filter((candidate) => !candidate.ramps?.length)) {
      const { samples } = geometryFor(track);
      expect(samples.every((sample) => sample.ramp === 0 && sample.rampLip === 0)).toBe(true);
    }
  });
});

describe('locate', () => {
  it('finds the centre line from a known offset', () => {
    const geometry = geometryFor(trackById('mos-espa'));
    const sample = geometry.samples[120];
    const offset = 40;
    const point = offsetPoint3(sample, offset);

    const found = locate(geometry, point.x, point.z, 120);
    expect(found.index).toBe(120);
    expect(found.lateral).toBeCloseTo(offset, 4);
  });

  it('reports lateral sign consistently either side of the line', () => {
    const geometry = geometryFor(trackById('mos-espa'));
    const sample = geometry.samples[200];
    const left = offsetPoint3(sample, -60);
    const right = offsetPoint3(sample, 60);

    expect(locate(geometry, left.x, left.z, 200).lateral).toBeLessThan(0);
    expect(locate(geometry, right.x, right.z, 200).lateral).toBeGreaterThan(0);
  });

  /**
   * The reason `locate` takes a hint at all. At a crossover two branches of the
   * circuit occupy the same ground; a global nearest-point search would snap to
   * whichever happens to be marginally closer and corrupt the lap count.
   */
  it.each(['dune-sea', 'jundland-knot'])('disambiguates the crossover on %s', (id) => {
    const geometry = geometryFor(trackById(id));
    const { samples } = geometry;

    // Find the pair of far-apart indices whose positions are closest together:
    // that is the crossing point.
    let bestA = 0;
    let bestB = 0;
    let bestDist = Infinity;
    for (let i = 0; i < samples.length; i += 2) {
      for (let j = i + 120; j < samples.length; j += 2) {
        const dist = Math.hypot(samples[i].x - samples[j].x, samples[i].z - samples[j].z);
        if (dist < bestDist) {
          bestDist = dist;
          bestA = i;
          bestB = j;
        }
      }
    }
    expect(bestDist).toBeLessThan(120); // these circuits really do cross

    // Standing on the crossing, the hint decides which branch you are on. The
    // branches cross *between* samples, so the answer lands near the hint
    // rather than exactly on it — what matters is that the two hints resolve to
    // opposite sides of the loop instead of collapsing onto one branch.
    const point = samples[bestA];
    const fromA = locate(geometry, point.x, point.z, bestA).index;
    const fromB = locate(geometry, point.x, point.z, bestB).index;

    const ringGap = (a: number, b: number) => {
      const raw = Math.abs(a - b);
      return Math.min(raw, samples.length - raw);
    };

    expect(ringGap(fromA, bestA)).toBeLessThanOrEqual(3);
    expect(ringGap(fromB, bestB)).toBeLessThanOrEqual(3);
    // A global nearest-point search would return the same index for both.
    expect(ringGap(fromA, fromB)).toBeGreaterThan(100);
  });
});

describe('arcDelta', () => {
  it('takes the short way round the start/finish seam', () => {
    const geometry = geometryFor(trackById('mos-espa'));
    const { length } = geometry;

    expect(arcDelta(geometry, 100, 300)).toBeCloseTo(200, 6);
    // Forward across the line.
    expect(arcDelta(geometry, length - 50, 50)).toBeCloseTo(100, 6);
    // Backwards across the line.
    expect(arcDelta(geometry, 50, length - 50)).toBeCloseTo(-100, 6);
  });
});

describe('surfaceHeight', () => {
  it('tilts with the banking, raising the outside of the corner', () => {
    const geometry = geometryFor(trackById('mos-espa'));
    const banked = geometry.samples.find((sample) => Math.abs(sample.bank) > 0.05);
    expect(banked).toBeDefined();

    const outside = surfaceHeight(banked!, -100 * Math.sign(banked!.bank));
    const inside = surfaceHeight(banked!, 100 * Math.sign(banked!.bank));
    expect(outside).toBeGreaterThan(inside);
  });

  it('is flat across the road on an unbanked circuit', () => {
    const flat = TRACKS.find((track) => !track.banking);
    if (!flat) return;
    const { samples } = geometryFor(flat);
    expect(surfaceHeight(samples[0], -100)).toBeCloseTo(surfaceHeight(samples[0], 100), 6);
  });
});
