import type { CarConfig, Point, TrackData } from './types';

/**
 * Track authoring. Every generator emits a closed loop of centre-line points;
 * `buildTrackGeometry` resamples them to uniform arc length, so the number of
 * points here only controls the *shape*, not the physics resolution.
 */

const generateOval = (
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  segments: number,
): Point[] => {
  const points: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * 2 * Math.PI;
    points.push({
      x: centerX + (width / 2) * Math.cos(theta),
      y: centerY + (height / 2) * Math.sin(theta),
    });
  }
  return points;
};

/** Lemniscate — crosses over itself, which the localised track lookup handles. */
const generateFigure8 = (centerX: number, centerY: number, scale: number): Point[] => {
  const points: Point[] = [];
  const segments = 160;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    points.push({
      x: centerX + scale * Math.sin(t),
      y: centerY + scale * Math.sin(t) * Math.cos(t),
    });
  }
  return points;
};

/** Boomerang loop with a long straight and two very different hairpins. */
const generateCanyon = (centerX: number, centerY: number, scale: number): Point[] => {
  const points: Point[] = [];
  const segments = 220;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    points.push({
      x: centerX + scale * (Math.sin(t) + 0.3 * Math.sin(2 * t)),
      y: centerY + scale * (0.8 * Math.cos(t) - 0.4 * Math.cos(2 * t)),
    });
  }
  return points;
};

/** Technical circuit: alternating radii built from a summed harmonic series. */
const generateGrandPrix = (centerX: number, centerY: number, scale: number): Point[] => {
  const points: Point[] = [];
  const segments = 260;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    const radius = scale * (1 + 0.22 * Math.sin(3 * t) + 0.12 * Math.cos(5 * t));
    points.push({
      x: centerX + radius * Math.cos(t) * 1.25,
      y: centerY + radius * Math.sin(t),
    });
  }
  return points;
};

export const TRACKS: TrackData[] = [
  {
    id: 'mos-espa',
    name: 'Mos Espa Circuit',
    difficulty: 'Easy',
    width: 260,
    color: '#f59e0b',
    blurb: 'Wide open sweepers. Flat out almost everywhere — a good place to learn the boost.',
    points: generateOval(0, 0, 3000, 1800, 90),
  },
  {
    id: 'dune-sea',
    name: 'Dune Sea Loop',
    difficulty: 'Medium',
    width: 230,
    color: '#ef4444',
    blurb: 'A crossover figure-eight. Two fast loops joined by a blind, committed chicane.',
    points: generateFigure8(0, 0, 2000),
  },
  {
    id: 'beggars-canyon',
    name: "Beggar's Canyon",
    difficulty: 'Hard',
    width: 210,
    color: '#a855f7',
    blurb: 'Tight walls and a double apex. Brake early or meet the barrier.',
    points: generateCanyon(0, 0, 2200),
  },
  {
    id: 'boonta-eve',
    name: 'Boonta Eve Classic',
    difficulty: 'Hard',
    width: 220,
    color: '#22d3ee',
    blurb: 'The long one. Constantly changing radii reward a driver who can chain drifts.',
    points: generateGrandPrix(0, 0, 1900),
  },
];

/**
 * `handling` is the fraction of the velocity/heading gap closed per 1/60 s tick.
 * Higher = more grip and a sharper turn-in; lower = a looser, slidier pod that
 * carries more speed once it's pointed straight.
 */
export const CARS: CarConfig[] = [
  {
    id: 'pod-1',
    name: 'Titan Twin-Turbo',
    color: '#3b82f6',
    acceleration: 0.1,
    topSpeed: 8,
    handling: 0.12,
    blurb: 'The all-rounder. Balanced grip and punch — start here.',
  },
  {
    id: 'pod-2',
    name: 'Crimson Fury',
    color: '#ef4444',
    acceleration: 0.138,
    topSpeed: 9.5,
    handling: 0.075,
    blurb: 'Fastest thing on the grid and the hardest to point. Loves a long straight.',
  },
  {
    id: 'pod-3',
    name: 'Jade Speeder',
    color: '#10b981',
    acceleration: 0.088,
    topSpeed: 7.5,
    handling: 0.17,
    blurb: 'Glued to the track. Slower on paper, quicker through anything technical.',
  },
];

export const LAP_OPTIONS = [1, 3, 5] as const;
