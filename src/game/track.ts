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

  return { samples, length, spacing, halfWidth: data.width / 2, curve, data };
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
