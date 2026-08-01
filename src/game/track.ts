import * as THREE from 'three';
import type { Point, TrackData } from '../types';

/**
 * A single arc-length-uniform sample of the centre line.
 * `x`/`z` are world coordinates (the source data's 2D `y` becomes world `z`).
 */
export interface TrackSample {
  x: number;
  z: number;
  /** Unit tangent, pointing forward along the racing direction. */
  tx: number;
  tz: number;
  /** Unit normal (tangent rotated +90°). Positive lateral offsets lie this way. */
  nx: number;
  nz: number;
  /** Arc length from the start line to this sample. */
  s: number;
  /** Signed curvature, 1/radius. Positive turns toward the normal. */
  curvature: number;
  /** Physics speed cap for this sample, in units/tick (see engine.ts). */
  speedLimit: number;
  /** Centre-line height. Purely visual — the physics runs in the XZ plane. */
  y: number;
  /**
   * Height of a jump ramp above the road at this sample, 0 almost everywhere.
   * Unlike `y`, this one *is* load-bearing: leaving the lip launches a pod.
   */
  ramp: number;
  /** Rise per unit of arc length across the ramp. Negative past the lip. */
  rampSlope: number;
  /**
   * Non-zero only on the final sample of a ramp, holding the lip height. Launch
   * strength is derived from this rather than from `rampSlope`, which is a
   * finite difference across the cliff and so scales with sample spacing — that
   * made the same ramp launch differently on a long track than a short one.
   */
  rampLip: number;
  /**
   * Roll of the road cross-section, in radians. Positive lifts the outside of a
   * positive-curvature corner. Also purely visual.
   */
  bank: number;
}

export interface TrackGeometry {
  samples: TrackSample[];
  /** Total closed-loop arc length. */
  length: number;
  /** Distance between consecutive samples. */
  spacing: number;
  halfWidth: number;
  curve: THREE.CatmullRomCurve3;
  data: TrackData;
}

export interface TrackLocation {
  /** Index of the nearest sample. */
  index: number;
  /** Arc-length position along the loop, 0..length. */
  s: number;
  /** Signed distance from the centre line, along the sample normal. */
  lateral: number;
}

/** Samples per loop. Higher = finer collision + AI resolution. */
const SAMPLE_COUNT = 720;

/**
 * Lateral grip budget used to derive corner speeds, in units/s². Scales with
 * the square of the speed calibration in engine.ts (v² = grip · radius).
 */
const LATERAL_GRIP = 325;

/** Braking capability used when building the speed profile, in units/s². */
const BRAKE_DECEL = 165;

/**
 * Floor for the corner-speed profile, in units/tick. Where a centre line is
 * genuinely kinked — the figure-eight's crossover, for instance — the curvature
 * implies a limit near zero, which had the AI crawl to a stop mid-corner. A pod
 * can always get through at walking pace.
 */
const MIN_CORNER_SPEED = 2.5;

/**
 * Track authoring closes the loop by repeating the first point. A closed
 * Catmull-Rom curve closes itself, so the duplicate would create a degenerate
 * zero-length segment and a visible kink at the start line.
 */
function dropClosingDuplicate(points: Point[]): Point[] {
  if (points.length < 2) return points;
  const first = points[0];
  const last = points[points.length - 1];
  const closes = Math.hypot(first.x - last.x, first.y - last.y) < 1e-6;
  return closes ? points.slice(0, -1) : points;
}

/**
 * Precomputes everything the physics loop and the AI need: a uniform-arc-length
 * centre line, per-sample curvature, and a corner-speed profile with lookahead
 * braking. Done once per race, never per frame.
 */
export function buildTrackGeometry(data: TrackData): TrackGeometry {
  const control = dropClosingDuplicate(data.points).map((p) => new THREE.Vector3(p.x, 0, p.y));
  const curve = new THREE.CatmullRomCurve3(control, true, 'catmullrom', 0.5);

  // getSpacedPoints resamples by arc length, so `spacing` is constant.
  const raw = curve.getSpacedPoints(SAMPLE_COUNT);
  // getSpacedPoints returns count+1 points with the last duplicating the first.
  const positions = raw.slice(0, SAMPLE_COUNT);

  const samples: TrackSample[] = [];
  let length = 0;
  for (let i = 0; i < positions.length; i++) {
    const next = positions[(i + 1) % positions.length];
    length += positions[i].distanceTo(next);
  }
  const spacing = length / positions.length;

  for (let i = 0; i < positions.length; i++) {
    const prev = positions[(i - 1 + positions.length) % positions.length];
    const next = positions[(i + 1) % positions.length];
    let tx = next.x - prev.x;
    let tz = next.z - prev.z;
    const tLen = Math.hypot(tx, tz) || 1;
    tx /= tLen;
    tz /= tLen;
    samples.push({
      x: positions[i].x,
      z: positions[i].z,
      tx,
      tz,
      nx: -tz,
      nz: tx,
      s: i * spacing,
      curvature: 0,
      speedLimit: Infinity,
      y: 0,
      ramp: 0,
      rampSlope: 0,
      rampLip: 0,
      bank: 0,
    });
  }

  // Curvature from the turn rate of the tangent over arc length.
  for (let i = 0; i < samples.length; i++) {
    const a = samples[(i - 1 + samples.length) % samples.length];
    const b = samples[(i + 1) % samples.length];
    let dAngle = Math.atan2(b.tz, b.tx) - Math.atan2(a.tz, a.tx);
    while (dAngle > Math.PI) dAngle -= Math.PI * 2;
    while (dAngle < -Math.PI) dAngle += Math.PI * 2;
    samples[i].curvature = dAngle / (2 * spacing);
  }

  buildSpeedProfile(samples, spacing);
  buildElevationAndBanking(samples, data, length);
  buildRamps(samples, data, length, spacing);

  return { samples, length, spacing, halfWidth: data.width / 2, curve, data };
}

/** Peak roll of a banked corner, in radians (~16°). */
const MAX_BANK = 0.28;
const BANK_GAIN = 115;

/**
 * Height and cross-section roll. Both are cosmetic: the simulation stays in the
 * XZ plane, so adding elevation to a circuit can never change how it drives.
 */
function buildElevationAndBanking(
  samples: TrackSample[],
  data: TrackData,
  length: number,
): void {
  const profile = data.elevation;
  if (profile) {
    const phase = profile.phase ?? 0;
    // `waves` is a whole number, so the height closes seamlessly at the line.
    const waves = Math.max(1, Math.round(profile.waves));
    for (const sample of samples) {
      sample.y = profile.amplitude * Math.sin((sample.s / length) * Math.PI * 2 * waves + phase);
    }
  }

  const bankScale = data.banking ?? 0;
  if (bankScale > 0) {
    for (const sample of samples) {
      const raw = sample.curvature * BANK_GAIN * bankScale;
      sample.bank = Math.max(-MAX_BANK, Math.min(MAX_BANK, raw));
    }
    // Smooth so banking eases in and out rather than snapping at corner entry.
    smoothRing(samples, 10, (s) => s.bank, (s, v) => (s.bank = v));
  }
}

/**
 * Ramps rise on a smooth ease so a pod is pushed upward gradually, then stop
 * dead at the lip. The take-off speed comes from the slope at the lip, so a
 * faster approach means a longer jump.
 */
function buildRamps(
  samples: TrackSample[],
  data: TrackData,
  length: number,
  spacing: number,
): void {
  if (!data.ramps?.length) return;
  const count = samples.length;

  for (const ramp of data.ramps) {
    const startIndex = Math.round(((ramp.at % 1) * length) / spacing);
    const steps = Math.max(2, Math.round(ramp.length / spacing));
    for (let i = 0; i <= steps; i++) {
      const t = i / steps;
      // Smoothstep: flat at the bottom, steepest in the middle, flat at the lip.
      const eased = t * t * (3 - 2 * t);
      const index = (((startIndex + i) % count) + count) % count;
      samples[index].ramp = Math.max(samples[index].ramp, ramp.height * eased);
      if (i === steps) samples[index].rampLip = Math.max(samples[index].rampLip, ramp.height);
    }
  }

  for (let i = 0; i < count; i++) {
    const ahead = samples[(i + 1) % count];
    const behind = samples[(i - 1 + count) % count];
    samples[i].rampSlope = (ahead.ramp - behind.ramp) / (2 * spacing);
    samples[i].y += samples[i].ramp;
  }
}

/** In-place circular moving average over ±`radius` samples. */
function smoothRing(
  samples: TrackSample[],
  radius: number,
  get: (s: TrackSample) => number,
  set: (s: TrackSample, value: number) => void,
): void {
  const count = samples.length;
  const source = samples.map(get);
  for (let i = 0; i < count; i++) {
    let total = 0;
    for (let offset = -radius; offset <= radius; offset++) {
      total += source[(((i + offset) % count) + count) % count];
    }
    set(samples[i], total / (radius * 2 + 1));
  }
}

/**
 * Height of the driving surface `lateral` units off the centre line, accounting
 * for banking. Used to sit pods and the camera on the road.
 */
export function surfaceHeight(sample: TrackSample, lateral: number): number {
  return sample.y - lateral * Math.sin(sample.bank);
}

/**
 * Corner speed from grip, then a backward pass so a racer knows to brake
 * *before* the apex rather than at it. Two laps of the backward pass let the
 * constraint propagate across the start/finish seam.
 */
function buildSpeedProfile(samples: TrackSample[], spacing: number): void {
  for (const sample of samples) {
    const radius = Math.abs(sample.curvature) > 1e-7 ? 1 / Math.abs(sample.curvature) : Infinity;
    const perSecond = Number.isFinite(radius) ? Math.sqrt(LATERAL_GRIP * radius) : Infinity;
    // units/s -> units/tick. The floor survives the backward pass below, which
    // only ever takes a min against a value that is itself >= the floor.
    sample.speedLimit = Math.max(MIN_CORNER_SPEED, perSecond / 60);
  }

  const maxBrakeStep = Math.sqrt(2 * BRAKE_DECEL * spacing) / 60;
  for (let pass = 0; pass < 2; pass++) {
    for (let i = samples.length - 1; i >= 0; i--) {
      const ahead = samples[(i + 1) % samples.length];
      if (!Number.isFinite(ahead.speedLimit)) continue;
      // v² = v_next² + 2·a·ds, expressed in tick units.
      const reachable = Math.sqrt(ahead.speedLimit ** 2 + maxBrakeStep ** 2 * 2);
      samples[i].speedLimit = Math.min(samples[i].speedLimit, reachable);
    }
  }
}

/**
 * Nearest point on the centre line. Searching a window around `hint` (the
 * racer's previous index) rather than the whole loop keeps this O(window) and —
 * more importantly — makes self-crossing tracks like the figure-8 unambiguous:
 * a racer at the crossover stays on the branch it was already travelling.
 */
export function locate(
  geometry: TrackGeometry,
  x: number,
  z: number,
  hint: number | null,
  window = 60,
): TrackLocation {
  const { samples } = geometry;
  const count = samples.length;

  let bestIndex = 0;
  let bestDistSq = Infinity;

  if (hint === null) {
    for (let i = 0; i < count; i++) {
      const d = (samples[i].x - x) ** 2 + (samples[i].z - z) ** 2;
      if (d < bestDistSq) {
        bestDistSq = d;
        bestIndex = i;
      }
    }
  } else {
    for (let offset = -window; offset <= window; offset++) {
      const i = (((hint + offset) % count) + count) % count;
      const d = (samples[i].x - x) ** 2 + (samples[i].z - z) ** 2;
      if (d < bestDistSq) {
        bestDistSq = d;
        bestIndex = i;
      }
    }
  }

  // Refine to sub-sample precision by projecting onto the local tangent.
  const sample = samples[bestIndex];
  const dx = x - sample.x;
  const dz = z - sample.z;
  const along = dx * sample.tx + dz * sample.tz;
  const lateral = dx * sample.nx + dz * sample.nz;

  let s = sample.s + along;
  if (s < 0) s += geometry.length;
  if (s >= geometry.length) s -= geometry.length;

  return { index: bestIndex, s, lateral };
}

/** Sample `distance` units further along the track from `index`. */
export function sampleAhead(geometry: TrackGeometry, index: number, distance: number): TrackSample {
  const count = geometry.samples.length;
  const step = Math.round(distance / geometry.spacing);
  return geometry.samples[(((index + step) % count) + count) % count];
}

/**
 * Signed forward arc-length delta between two positions, resolving the
 * start/finish wrap by picking the shorter way around.
 */
export function arcDelta(geometry: TrackGeometry, from: number, to: number): number {
  let delta = to - from;
  const half = geometry.length / 2;
  if (delta > half) delta -= geometry.length;
  if (delta < -half) delta += geometry.length;
  return delta;
}

/** World position `lateral` units off the centre line at sample `index`. */
export function offsetPoint(sample: TrackSample, lateral: number): { x: number; z: number } {
  return { x: sample.x + sample.nx * lateral, z: sample.z + sample.nz * lateral };
}

/**
 * Same, but on the banked surface. The horizontal footprint deliberately
 * ignores the `cos(bank)` foreshortening so the visible road is never narrower
 * than the region the physics treats as track.
 */
export function offsetPoint3(
  sample: TrackSample,
  lateral: number,
): { x: number; y: number; z: number } {
  return {
    x: sample.x + sample.nx * lateral,
    y: surfaceHeight(sample, lateral),
    z: sample.z + sample.nz * lateral,
  };
}
