import * as THREE from 'three';
import { offsetPoint3, surfaceHeight, type TrackGeometry, type TrackSample } from './track';

/** Must match RUNOFF in engine.ts so what you see is what you collide with. */
export const RUNOFF_WIDTH = 55;
export const WALL_HEIGHT = 34;
export const CURB_WIDTH = 9;
/** How far the ground plane sits below the lowest point of the circuit. */
export const GROUND_DROP = 46;

/**
 * Render offsets above the driving surface, ordered to avoid z-fighting between
 * the stacked strips. These are local to the (possibly banked) road plane.
 */
export const LAYER = {
  runoff: 0,
  road: 0.5,
  skid: 0.85,
  startLine: 1.05,
  curb: 1.2,
} as const;

export interface SceneryInstance {
  x: number;
  y: number;
  z: number;
  scale: number;
  height: number;
  rotation: number;
  /** 0..1 brightness jitter applied to the theme's scenery colour. */
  tint: number;
}

export interface TrackMeshes {
  road: THREE.BufferGeometry;
  runoffLeft: THREE.BufferGeometry;
  runoffRight: THREE.BufferGeometry;
  curbLeft: THREE.BufferGeometry;
  curbRight: THREE.BufferGeometry;
  wallLeft: THREE.BufferGeometry;
  wallRight: THREE.BufferGeometry;
  /** Thin emissive line capping each barrier. */
  railLeft: THREE.BufferGeometry;
  railRight: THREE.BufferGeometry;
  startLine: THREE.BufferGeometry;
  posts: { x: number; y: number; z: number; angle: number }[];
  scenery: SceneryInstance[];
  gantry: { x: number; y: number; z: number; angle: number };
  /** Lowest point of the circuit, so the ground plane can sit beneath it. */
  minHeight: number;
}

interface StripOptions {
  /** Lateral offsets of the strip's two edges. */
  from: number;
  to: number;
  /** Height above the banked road surface. */
  lift?: number;
  /** Arc length per texture repeat along the strip. */
  uScale?: number;
  /**
   * When set, the strip stands vertically at lateral offset `from`, spanning
   * from the road surface up by this many units.
   */
  wallHeight?: number;
  /** Vertical offset applied before extruding a wall. */
  wallBase?: number;
}

/** Builds a closed quad strip that follows the banked, elevated centre line. */
function buildStrip(geometry: TrackGeometry, options: StripOptions): THREE.BufferGeometry {
  const { samples } = geometry;
  const count = samples.length;
  const positions = new Float32Array(count * 2 * 3);
  const normals = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const indices: number[] = [];
  const uScale = options.uScale ?? 100;
  const lift = options.lift ?? 0;

  for (let i = 0; i < count; i++) {
    const sample = samples[i];
    let a: { x: number; y: number; z: number };
    let b: { x: number; y: number; z: number };

    if (options.wallHeight !== undefined) {
      const base = offsetPoint3(sample, options.from);
      const y0 = base.y + (options.wallBase ?? 0);
      a = { x: base.x, y: y0, z: base.z };
      b = { x: base.x, y: y0 + options.wallHeight, z: base.z };
    } else {
      a = offsetPoint3(sample, options.from);
      b = offsetPoint3(sample, options.to);
      // Lift along the banked surface normal, not straight up.
      const cos = Math.cos(sample.bank);
      const sin = Math.sin(sample.bank);
      a.y += lift * cos;
      b.y += lift * cos;
      a.x += sample.nx * lift * sin;
      a.z += sample.nz * lift * sin;
      b.x += sample.nx * lift * sin;
      b.z += sample.nz * lift * sin;
    }

    positions.set([a.x, a.y, a.z], i * 6);
    positions.set([b.x, b.y, b.z], i * 6 + 3);

    if (options.wallHeight !== undefined) {
      // Barrier faces inward, toward the racing surface.
      const side = Math.sign(options.from) || 1;
      normals.set([-sample.nx * side, 0, -sample.nz * side], i * 6);
      normals.set([-sample.nx * side, 0, -sample.nz * side], i * 6 + 3);
    } else {
      // Tilt the surface normal with the banking so lighting reads correctly.
      const ny = Math.cos(sample.bank);
      const lateralComponent = Math.sin(sample.bank);
      const nx = sample.nx * lateralComponent;
      const nz = sample.nz * lateralComponent;
      normals.set([nx, ny, nz], i * 6);
      normals.set([nx, ny, nz], i * 6 + 3);
    }

    const u = sample.s / uScale;
    uvs.set([u, 0], i * 4);
    uvs.set([u, 1], i * 4 + 2);

    const next = (i + 1) % count;
    indices.push(i * 2, i * 2 + 1, next * 2 + 1, i * 2, next * 2 + 1, next * 2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

/** A short chequered band across the road at the start line. */
function buildStartBand(geometry: TrackGeometry, halfWidth: number): THREE.BufferGeometry {
  const bandLength = 26;
  const steps = Math.max(2, Math.round(bandLength / geometry.spacing) + 1);
  const count = geometry.samples.length;
  const positions: number[] = [];
  const uvs: number[] = [];
  const indices: number[] = [];

  // The chequer texture is 8x8 cells, so UV span x 8 = cells along that axis.
  // Scaling both axes off a target cell size keeps the squares square instead
  // of smearing them into stripes across a road 10x wider than the band.
  const cell = 13;
  const uSpan = bandLength / (cell * 8);
  const vSpan = (halfWidth * 2) / (cell * 8);

  for (let i = 0; i < steps; i++) {
    const sample = geometry.samples[(count - Math.floor(steps / 2) + i + count) % count];
    const left = offsetPoint3(sample, -halfWidth);
    const right = offsetPoint3(sample, halfWidth);
    const lift = LAYER.startLine * Math.cos(sample.bank);
    positions.push(left.x, left.y + lift, left.z, right.x, right.y + lift, right.z);
    const t = i / (steps - 1);
    uvs.push(t * uSpan, 0, t * uSpan, vSpan);
    if (i < steps - 1) {
      indices.push(i * 2, i * 2 + 1, i * 2 + 3, i * 2, i * 2 + 3, i * 2 + 2);
    }
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.Float32BufferAttribute(positions, 3));
  geo.setAttribute('uv', new THREE.Float32BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeVertexNormals();
  geo.computeBoundingSphere();
  return geo;
}

/** Deterministic pseudo-random in [0,1) so a circuit looks identical each load. */
function rand(seed: number): number {
  const n = Math.sin(seed * 12.9898) * 43758.5453;
  return n - Math.floor(n);
}

/**
 * Scatters props outside the barriers. Positions are pushed well clear of the
 * outer wall so nothing intersects the racing surface.
 */
function buildScenery(
  geometry: TrackGeometry,
  density: number,
  groundY: number,
): SceneryInstance[] {
  if (density <= 0) return [];
  const items: SceneryInstance[] = [];
  const clearance = geometry.halfWidth + RUNOFF_WIDTH + 70;
  const slots = Math.floor((geometry.length / 240) * density);

  for (let i = 0; i < slots; i++) {
    const sample = geometry.samples[Math.floor(rand(i * 3.1) * geometry.samples.length)];
    for (const side of [-1, 1]) {
      if (rand(i * 7.3 + side) < 0.35) continue;
      const seed = i * 13.7 + side * 2.3;
      const distance = clearance + rand(seed) * 620;
      const scale = 0.55 + rand(seed + 1.1) * 1.5;
      const point = offsetPoint3(sample, side * distance);
      // Props are planted on the ground plane and grown up past the road, so
      // they never hang in mid-air above an elevated section of circuit.
      const peak = sample.y + 90 + rand(seed + 2.2) * 320;
      items.push({
        x: point.x,
        y: groundY,
        z: point.z,
        scale,
        height: Math.max(60, peak - groundY),
        rotation: rand(seed + 3.3) * Math.PI * 2,
        tint: rand(seed + 4.4),
      });
    }
  }
  return items;
}

export function buildTrackMeshes(geometry: TrackGeometry): TrackMeshes {
  const half = geometry.halfWidth;
  const outer = half + RUNOFF_WIDTH;
  const theme = geometry.data.theme;

  const posts: TrackMeshes['posts'] = [];
  const postCount = Math.max(10, Math.floor(geometry.length / 300));
  for (let i = 0; i < postCount; i++) {
    const sample = geometry.samples[Math.floor((i / postCount) * geometry.samples.length)];
    posts.push({
      x: sample.x,
      y: sample.y,
      z: sample.z,
      angle: Math.atan2(sample.tz, sample.tx),
    });
  }

  const start = geometry.samples[0];
  let lowest = Infinity;
  for (const sample of geometry.samples) {
    lowest = Math.min(lowest, surfaceHeight(sample, -outer), surfaceHeight(sample, outer));
  }
  const minHeight = Number.isFinite(lowest) ? lowest : 0;
  const groundY = minHeight - GROUND_DROP;

  return {
    road: buildStrip(geometry, { from: -half, to: half, lift: LAYER.road, uScale: 110 }),
    runoffLeft: buildStrip(geometry, { from: -outer, to: -half, uScale: 70 }),
    runoffRight: buildStrip(geometry, { from: half, to: outer, uScale: 70 }),
    curbLeft: buildStrip(geometry, {
      from: -half - CURB_WIDTH,
      to: -half,
      lift: LAYER.curb,
      uScale: 26,
    }),
    curbRight: buildStrip(geometry, {
      from: half,
      to: half + CURB_WIDTH,
      lift: LAYER.curb,
      uScale: 26,
    }),
    wallLeft: buildStrip(geometry, { from: -outer, to: -outer, wallHeight: WALL_HEIGHT, uScale: 60 }),
    wallRight: buildStrip(geometry, { from: outer, to: outer, wallHeight: WALL_HEIGHT, uScale: 60 }),
    railLeft: buildStrip(geometry, {
      from: -outer,
      to: -outer + 4,
      lift: WALL_HEIGHT + 1,
      uScale: 60,
    }),
    railRight: buildStrip(geometry, {
      from: outer - 4,
      to: outer,
      lift: WALL_HEIGHT + 1,
      uScale: 60,
    }),
    startLine: buildStartBand(geometry, half),
    posts,
    scenery: buildScenery(geometry, theme.sceneryDensity, groundY),
    gantry: { x: start.x, y: start.y, z: start.z, angle: Math.atan2(start.tz, start.tx) },
    minHeight,
  };
}

export function disposeTrackMeshes(meshes: TrackMeshes): void {
  for (const value of Object.values(meshes)) {
    if (value instanceof THREE.BufferGeometry) value.dispose();
  }
}

/** Surface height under a racer, for sitting pods and the camera on the road. */
export function racerHeight(sample: TrackSample, lateral: number): number {
  return surfaceHeight(sample, lateral);
}
