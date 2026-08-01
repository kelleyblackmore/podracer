import * as THREE from 'three';
import type { TrackGeometry } from './track';

/** Must match RUNOFF in engine.ts so what you see is what you collide with. */
export const RUNOFF_WIDTH = 55;
export const WALL_HEIGHT = 34;

/** Render heights, ordered to avoid z-fighting between the stacked surfaces. */
export const LAYER = {
  runoff: 0,
  road: 0.5,
  skid: 0.85,
  startLine: 1.0,
  edge: 1.15,
} as const;

export interface TrackMeshes {
  road: THREE.BufferGeometry;
  runoffLeft: THREE.BufferGeometry;
  runoffRight: THREE.BufferGeometry;
  edgeLeft: THREE.BufferGeometry;
  edgeRight: THREE.BufferGeometry;
  wallLeft: THREE.BufferGeometry;
  wallRight: THREE.BufferGeometry;
  /** Evenly spaced marker posts for a sense of speed. */
  posts: { x: number; z: number; angle: number }[];
  startLine: { x: number; z: number; angle: number };
}

/**
 * Builds a closed quad strip between two lateral offsets of the centre line.
 * When `verticalFrom`/`verticalTo` are given the strip stands up as a wall at a
 * fixed lateral offset instead of lying flat.
 */
function buildStrip(
  geometry: TrackGeometry,
  innerOffset: number,
  outerOffset: number,
  height: number,
  vertical?: { from: number; to: number },
): THREE.BufferGeometry {
  const { samples } = geometry;
  const count = samples.length;
  const positions = new Float32Array(count * 2 * 3);
  const normals = new Float32Array(count * 2 * 3);
  const uvs = new Float32Array(count * 2 * 2);
  const indices: number[] = [];

  for (let i = 0; i < count; i++) {
    const sample = samples[i];
    const a = vertical
      ? { x: sample.x + sample.nx * innerOffset, y: vertical.from, z: sample.z + sample.nz * innerOffset }
      : { x: sample.x + sample.nx * innerOffset, y: height, z: sample.z + sample.nz * innerOffset };
    const b = vertical
      ? { x: sample.x + sample.nx * outerOffset, y: vertical.to, z: sample.z + sample.nz * outerOffset }
      : { x: sample.x + sample.nx * outerOffset, y: height, z: sample.z + sample.nz * outerOffset };

    positions.set([a.x, a.y, a.z], i * 6);
    positions.set([b.x, b.y, b.z], i * 6 + 3);

    if (vertical) {
      // Wall faces inward, toward the racing surface.
      const side = Math.sign(innerOffset) || 1;
      normals.set([-sample.nx * side, 0, -sample.nz * side], i * 6);
      normals.set([-sample.nx * side, 0, -sample.nz * side], i * 6 + 3);
    } else {
      normals.set([0, 1, 0], i * 6);
      normals.set([0, 1, 0], i * 6 + 3);
    }

    const u = sample.s / 100;
    uvs.set([u, 0], i * 4);
    uvs.set([u, 1], i * 4 + 2);

    const next = (i + 1) % count;
    const i0 = i * 2;
    const i1 = i * 2 + 1;
    const i2 = next * 2;
    const i3 = next * 2 + 1;
    indices.push(i0, i1, i3, i0, i3, i2);
  }

  const geo = new THREE.BufferGeometry();
  geo.setAttribute('position', new THREE.BufferAttribute(positions, 3));
  geo.setAttribute('normal', new THREE.BufferAttribute(normals, 3));
  geo.setAttribute('uv', new THREE.BufferAttribute(uvs, 2));
  geo.setIndex(indices);
  geo.computeBoundingSphere();
  return geo;
}

export function buildTrackMeshes(geometry: TrackGeometry): TrackMeshes {
  const half = geometry.halfWidth;
  const outer = half + RUNOFF_WIDTH;

  const posts: TrackMeshes['posts'] = [];
  const postSpacing = 260;
  const postCount = Math.max(8, Math.floor(geometry.length / postSpacing));
  for (let i = 0; i < postCount; i++) {
    const index = Math.floor((i / postCount) * geometry.samples.length);
    const sample = geometry.samples[index];
    posts.push({ x: sample.x, z: sample.z, angle: Math.atan2(sample.tz, sample.tx) });
  }

  const start = geometry.samples[0];

  return {
    road: buildStrip(geometry, -half, half, LAYER.road),
    runoffLeft: buildStrip(geometry, -outer, -half, LAYER.runoff),
    runoffRight: buildStrip(geometry, half, outer, LAYER.runoff),
    edgeLeft: buildStrip(geometry, -half, -half + 6, LAYER.edge),
    edgeRight: buildStrip(geometry, half - 6, half, LAYER.edge),
    wallLeft: buildStrip(geometry, -outer, -outer, 0, { from: 0, to: WALL_HEIGHT }),
    wallRight: buildStrip(geometry, outer, outer, 0, { from: 0, to: WALL_HEIGHT }),
    posts,
    startLine: { x: start.x, z: start.z, angle: Math.atan2(start.tz, start.tx) },
  };
}

export function disposeTrackMeshes(meshes: TrackMeshes): void {
  for (const value of Object.values(meshes)) {
    if (value instanceof THREE.BufferGeometry) value.dispose();
  }
}
