import type { CarConfig, Point, TrackData, TrackTheme } from './types';

/**
 * Track authoring. Every generator emits a closed loop of centre-line points;
 * `buildTrackGeometry` resamples them to uniform arc length, so the number of
 * points here only controls the *shape*, not the physics resolution.
 *
 * Keep the minimum corner radius comfortably above ~180 units. Tighter than
 * that and the derived corner-speed profile drops below what a pod can drive,
 * which reads as the AI crawling through the corner.
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

/** Lemniscate — crosses over itself once, which the localised lookup handles. */
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

/**
 * Boomerang loop with a long straight and two very different hairpins. The
 * second-harmonic weights are tuned so the tightest corner stays above a
 * ~230-unit radius; stronger harmonics fold the centre line into a near-cusp
 * that no pod can actually drive around.
 */
const generateCanyon = (centerX: number, centerY: number, scale: number): Point[] => {
  const points: Point[] = [];
  const segments = 220;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    points.push({
      x: centerX + scale * (Math.sin(t) + 0.16 * Math.sin(2 * t)),
      y: centerY + scale * (0.9 * Math.cos(t) - 0.22 * Math.cos(2 * t)),
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

/**
 * Paperclip: two long parallel straights joined by 180° hairpins. Rewards
 * top speed and heavy braking rather than cornering finesse.
 */
const generateStadium = (
  centerX: number,
  centerY: number,
  straight: number,
  radius: number,
): Point[] => {
  const points: Point[] = [];
  const straightSteps = 40;
  const arcSteps = 46;

  for (let i = 0; i < straightSteps; i++) {
    const t = i / straightSteps;
    points.push({ x: centerX - straight / 2 + straight * t, y: centerY - radius });
  }
  for (let i = 0; i < arcSteps; i++) {
    const angle = -Math.PI / 2 + (i / arcSteps) * Math.PI;
    points.push({
      x: centerX + straight / 2 + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }
  for (let i = 0; i < straightSteps; i++) {
    const t = i / straightSteps;
    points.push({ x: centerX + straight / 2 - straight * t, y: centerY + radius });
  }
  for (let i = 0; i < arcSteps; i++) {
    const angle = Math.PI / 2 + (i / arcSteps) * Math.PI;
    points.push({
      x: centerX - straight / 2 + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }
  return points;
};

/** Two big lobes pinched in the middle — long, flowing direction changes. */
const generateSerpentine = (centerX: number, centerY: number, scale: number): Point[] => {
  const points: Point[] = [];
  const segments = 240;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    const radius = scale * (1 + 0.38 * Math.cos(2 * t));
    points.push({
      x: centerX + radius * Math.cos(t) * 1.35,
      y: centerY + radius * Math.sin(t),
    });
  }
  return points;
};

/** Trefoil projection — crosses itself three times. */
const generateTrefoil = (centerX: number, centerY: number, scale: number): Point[] => {
  const points: Point[] = [];
  const segments = 300;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    points.push({
      x: centerX + scale * (Math.sin(t) + 2 * Math.sin(2 * t)),
      y: centerY + scale * (Math.cos(t) - 2 * Math.cos(2 * t)),
    });
  }
  return points;
};

/** A ring of repeated corners — rhythm and consistency over outright pace. */
const generateLobed = (
  centerX: number,
  centerY: number,
  scale: number,
  lobes: number,
  depth: number,
): Point[] => {
  const points: Point[] = [];
  const segments = 300;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * 2 * Math.PI;
    const radius = scale * (1 + depth * Math.sin(lobes * t));
    points.push({ x: centerX + radius * Math.cos(t), y: centerY + radius * Math.sin(t) });
  }
  return points;
};

// --- Art direction -----------------------------------------------------------

const DESERT_DUSK: TrackTheme = {
  road: '#2c2c33',
  runoff: '#8a5a22',
  wall: '#4b4640',
  ground: '#2a1a0c',
  sky: '#120c08',
  accent: '#f59e0b',
  curb: '#dc2626',
  scenery: 'mesa',
  sceneryColor: '#7c4a21',
  sceneryDensity: 1,
  fogNear: 1100,
  fogFar: 6500,
  starCount: 1200,
  light: '#ffd9a0',
};

const DEEP_DESERT: TrackTheme = {
  road: '#26262c',
  runoff: '#7c5a2e',
  wall: '#44403c',
  ground: '#1a1408',
  sky: '#0a0a12',
  accent: '#ef4444',
  curb: '#ef4444',
  scenery: 'dune',
  sceneryColor: '#8a6a3a',
  sceneryDensity: 1.3,
  fogNear: 900,
  fogFar: 5800,
  starCount: 1800,
  light: '#cbd5e1',
};

const RED_CANYON: TrackTheme = {
  road: '#2a2428',
  runoff: '#7c3a20',
  wall: '#5b3a2e',
  ground: '#3b1a12',
  sky: '#160a0a',
  accent: '#a855f7',
  curb: '#f59e0b',
  scenery: 'spire',
  sceneryColor: '#8c3a24',
  sceneryDensity: 1.8,
  fogNear: 700,
  fogFar: 4800,
  starCount: 900,
  light: '#ffb4a0',
};

const NIGHT_CIRCUIT: TrackTheme = {
  road: '#232a33',
  runoff: '#5a5f66',
  wall: '#334155',
  ground: '#0d1520',
  sky: '#050b14',
  accent: '#22d3ee',
  curb: '#0ea5e9',
  scenery: 'pylon',
  sceneryDensity: 1.1,
  sceneryColor: '#334155',
  fogNear: 1000,
  fogFar: 6200,
  starCount: 1500,
  light: '#a5f3fc',
};

const SKYWAY: TrackTheme = {
  road: '#22222c',
  runoff: '#3f3f52',
  wall: '#3b3b52',
  ground: '#08080f',
  sky: '#06060d',
  accent: '#e879f9',
  curb: '#a855f7',
  scenery: 'pylon',
  sceneryColor: '#2a2a40',
  sceneryDensity: 2.2,
  fogNear: 800,
  fogFar: 5200,
  starCount: 700,
  light: '#d8b4fe',
};

const GLACIER: TrackTheme = {
  road: '#2b3340',
  runoff: '#5b7fa6',
  wall: '#64748b',
  ground: '#16283a',
  sky: '#081726',
  accent: '#7dd3fc',
  curb: '#38bdf8',
  scenery: 'crystal',
  sceneryColor: '#7dd3fc',
  sceneryDensity: 1.6,
  fogNear: 700,
  fogFar: 5000,
  starCount: 2200,
  light: '#e0f2fe',
};

const COLISEUM: TrackTheme = {
  road: '#2e2a2a',
  runoff: '#6b4423',
  wall: '#57534e',
  ground: '#231710',
  sky: '#100a06',
  accent: '#fb923c',
  curb: '#dc2626',
  scenery: 'pylon',
  sceneryColor: '#44403c',
  sceneryDensity: 2.6,
  fogNear: 1200,
  fogFar: 6800,
  starCount: 1000,
  light: '#fed7aa',
};

const WASTES: TrackTheme = {
  road: '#262b26',
  runoff: '#4d5a35',
  wall: '#3f4a3a',
  ground: '#141c12',
  sky: '#080d08',
  accent: '#a3e635',
  curb: '#65a30d',
  scenery: 'spire',
  sceneryColor: '#4a5a30',
  sceneryDensity: 1.4,
  fogNear: 800,
  fogFar: 5400,
  starCount: 1300,
  light: '#d9f99d',
};

// --- Circuits ----------------------------------------------------------------

export const TRACKS: TrackData[] = [
  {
    id: 'mos-espa',
    name: 'Mos Espa Circuit',
    difficulty: 'Easy',
    width: 260,
    color: DESERT_DUSK.accent,
    theme: DESERT_DUSK,
    banking: 1.2,
    elevation: { amplitude: 55, waves: 2 },
    blurb: 'Wide banked sweepers. Flat out almost everywhere — a good place to learn the boost.',
    points: generateOval(0, 0, 3000, 1800, 90),
  },
  {
    id: 'dune-sea',
    name: 'Dune Sea Loop',
    difficulty: 'Medium',
    width: 230,
    color: DEEP_DESERT.accent,
    theme: DEEP_DESERT,
    banking: 1,
    elevation: { amplitude: 80, waves: 2, phase: Math.PI / 3 },
    blurb: 'A crossover figure-eight. Two fast loops joined by a blind, committed chicane.',
    points: generateFigure8(0, 0, 2000),
  },
  {
    id: 'coliseum',
    name: "Sebulba's Coliseum",
    difficulty: 'Medium',
    width: 250,
    color: COLISEUM.accent,
    theme: COLISEUM,
    banking: 1.5,
    blurb: 'Two enormous straights and two banked hairpins. Brake late, or do not brake at all.',
    points: generateStadium(0, 0, 3400, 520),
  },
  {
    id: 'skyway',
    name: 'Coruscant Skyway',
    difficulty: 'Medium',
    width: 240,
    color: SKYWAY.accent,
    theme: SKYWAY,
    banking: 1.1,
    elevation: { amplitude: 230, waves: 2 },
    blurb: 'An elevated ribbon through the towers. Big climbs, bigger drops, no room for error.',
    points: generateSerpentine(0, 0, 1750),
  },
  {
    id: 'beggars-canyon',
    name: "Beggar's Canyon",
    difficulty: 'Hard',
    width: 235,
    color: RED_CANYON.accent,
    theme: RED_CANYON,
    banking: 0.9,
    elevation: { amplitude: 140, waves: 3 },
    blurb: 'Tight walls and a double apex. Brake early or meet the barrier.',
    points: generateCanyon(0, 0, 2200),
  },
  {
    id: 'boonta-eve',
    name: 'Boonta Eve Classic',
    difficulty: 'Hard',
    width: 220,
    color: NIGHT_CIRCUIT.accent,
    theme: NIGHT_CIRCUIT,
    banking: 1,
    elevation: { amplitude: 95, waves: 3 },
    blurb: 'The long one. Constantly changing radii reward a driver who can chain drifts.',
    points: generateGrandPrix(0, 0, 1900),
  },
  {
    id: 'jundland-knot',
    name: 'Jundland Knot',
    difficulty: 'Hard',
    width: 230,
    color: WASTES.accent,
    theme: WASTES,
    banking: 1.2,
    elevation: { amplitude: 120, waves: 3 },
    blurb: 'Crosses itself three times. Learn which bridge you are on before you commit.',
    points: generateTrefoil(0, 0, 780),
  },
  {
    id: 'ilum-ice',
    name: 'Ilum Ice Run',
    difficulty: 'Hard',
    width: 240,
    color: GLACIER.accent,
    theme: GLACIER,
    banking: 0.7,
    elevation: { amplitude: 70, waves: 4 },
    blurb: 'Six near-identical corners in a row. Pure rhythm — one mistake ruins the whole lap.',
    points: generateLobed(0, 0, 2050, 6, 0.16),
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
