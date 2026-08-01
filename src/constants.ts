import type { CarConfig, Point, SceneryLayer, TrackData, TrackTheme } from './types';

/**
 * Track authoring. Every generator emits a closed loop of centre-line points;
 * `buildTrackGeometry` resamples them to uniform arc length, so the number of
 * points here only controls the *shape*, not the physics resolution.
 *
 * Keep the minimum corner radius comfortably above ~230 units. Tighter than
 * that and the derived corner-speed profile drops below what a pod can drive,
 * which reads as the AI crawling through the corner.
 */

const TAU = Math.PI * 2;

const generateOval = (
  centerX: number,
  centerY: number,
  width: number,
  height: number,
  segments: number,
): Point[] => {
  const points: Point[] = [];
  for (let i = 0; i < segments; i++) {
    const theta = (i / segments) * TAU;
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
  const segments = 200;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * TAU;
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
 * ~350-unit radius; stronger harmonics fold the centre line into a near-cusp
 * that no pod can actually drive around.
 */
const generateCanyon = (centerX: number, centerY: number, scale: number): Point[] => {
  const points: Point[] = [];
  const segments = 260;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * TAU;
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
  const segments = 300;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * TAU;
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
  const straightSteps = 46;
  const arcSteps = 50;

  for (let i = 0; i < straightSteps; i++) {
    points.push({ x: centerX - straight / 2 + straight * (i / straightSteps), y: centerY - radius });
  }
  for (let i = 0; i < arcSteps; i++) {
    const angle = -Math.PI / 2 + (i / arcSteps) * Math.PI;
    points.push({
      x: centerX + straight / 2 + radius * Math.cos(angle),
      y: centerY + radius * Math.sin(angle),
    });
  }
  for (let i = 0; i < straightSteps; i++) {
    points.push({ x: centerX + straight / 2 - straight * (i / straightSteps), y: centerY + radius });
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
  const segments = 280;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * TAU;
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
  const segments = 340;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * TAU;
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
  const segments = 340;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * TAU;
    const radius = scale * (1 + depth * Math.sin(lobes * t));
    points.push({ x: centerX + radius * Math.cos(t), y: centerY + radius * Math.sin(t) });
  }
  return points;
};

/**
 * Long circuit built from several harmonics at different rates, giving a lap
 * with genuinely distinct sectors rather than one repeating rhythm. `stretch`
 * pulls it into a long axis so there is a real straight somewhere.
 */
const generateEpic = (
  centerX: number,
  centerY: number,
  scale: number,
  stretch: number,
  seed: number,
): Point[] => {
  const points: Point[] = [];
  const segments = 420;
  for (let i = 0; i < segments; i++) {
    const t = (i / segments) * TAU;
    const radius =
      scale *
      (1 +
        0.2 * Math.sin(2 * t + seed) +
        0.13 * Math.sin(3 * t + seed * 1.7) +
        0.08 * Math.cos(5 * t + seed * 0.4));
    points.push({
      x: centerX + radius * Math.cos(t) * stretch,
      y: centerY + radius * Math.sin(t),
    });
  }
  return points;
};

// --- Art direction -----------------------------------------------------------

// Each circuit names the world it is set on and is dressed accordingly. Most of
// the roster is Tatooine, so those tracks are separated by *region* — open
// desert, dune sea, canyon, arena, wastes — rather than sharing one prop set.

const layer = (
  kind: SceneryLayer['kind'],
  color: string,
  density: number,
  minDistance: number,
  maxDistance: number,
  minHeight: number,
  maxHeight: number,
  scale: number,
  glow = false,
): SceneryLayer => ({
  kind,
  color,
  density,
  minDistance,
  maxDistance,
  minHeight,
  maxHeight,
  scale,
  glow,
});

const MOS_ESPA: TrackTheme = {
  planet: 'Tatooine — Mos Espa outskirts',
  road: '#2c2c33',
  runoff: '#8a5a22',
  wall: '#4b4640',
  ground: '#2a1a0c',
  sky: '#140d07',
  accent: '#f59e0b',
  curb: '#dc2626',
  fogNear: 1200,
  fogFar: 7000,
  starCount: 1100,
  light: '#ffd9a0',
  suns: ['#fbbf24', '#f97316'],
  layers: [
    layer('boulder', '#6b4423', 4, 20, 260, 30, 70, 0.5),
    layer('vaporator', '#8d8d86', 1.6, 120, 620, 60, 110, 0.35),
    layer('mesa', '#7c4a21', 3.2, 260, 1500, 140, 420, 1.2),
    layer('mesa', '#5c3518', 1.4, 1600, 4200, 400, 900, 3),
  ],
};

const DUNE_SEA: TrackTheme = {
  planet: 'Tatooine — the Dune Sea',
  road: '#26262c',
  runoff: '#7c5a2e',
  wall: '#44403c',
  ground: '#241a0a',
  sky: '#0a0a12',
  accent: '#ef4444',
  curb: '#ef4444',
  fogNear: 900,
  fogFar: 6200,
  starCount: 2000,
  light: '#cbd5e1',
  suns: ['#f59e0b', '#ea580c'],
  layers: [
    layer('dune', '#8a6a3a', 6, 10, 700, 40, 130, 2.4),
    layer('dune', '#6d5228', 2.6, 700, 2600, 90, 260, 5),
    layer('wreck', '#5b5b52', 0.8, 120, 900, 40, 90, 0.7),
  ],
};

const CANYON: TrackTheme = {
  planet: 'Tatooine — Beggar’s Canyon',
  road: '#2a2428',
  runoff: '#7c3a20',
  wall: '#5b3a2e',
  ground: '#3b1a12',
  sky: '#170b0a',
  accent: '#a855f7',
  curb: '#f59e0b',
  fogNear: 700,
  fogFar: 5000,
  starCount: 800,
  light: '#ffb4a0',
  layers: [
    layer('boulder', '#8c3a24', 5, 5, 180, 40, 110, 0.8),
    // Canyon walls: tall, close and near-continuous.
    layer('spire', '#7a3120', 9, 60, 400, 260, 620, 1.6),
    layer('arch', '#8c3a24', 1.1, 90, 320, 150, 260, 1.3),
    layer('spire', '#5e2617', 3, 500, 2200, 400, 850, 3.2),
  ],
};

const BOONTA: TrackTheme = {
  planet: 'Tatooine — the Boonta Eve course',
  road: '#232a33',
  runoff: '#5a5f66',
  wall: '#334155',
  ground: '#161008',
  sky: '#060c15',
  accent: '#22d3ee',
  curb: '#0ea5e9',
  fogNear: 1100,
  fogFar: 6800,
  starCount: 1500,
  light: '#a5f3fc',
  layers: [
    layer('boulder', '#5d4426', 3.5, 20, 320, 30, 80, 0.6),
    layer('mesa', '#6b4a28', 2.6, 300, 1400, 160, 460, 1.4),
    layer('vaporator', '#9aa0a6', 1.2, 150, 700, 70, 120, 0.4),
    layer('tower', '#22d3ee', 0.7, 400, 1600, 200, 420, 0.24, true),
  ],
};

const ARENA: TrackTheme = {
  planet: 'Tatooine — Mos Espa Grand Arena',
  road: '#2e2a2a',
  runoff: '#6b4423',
  wall: '#57534e',
  ground: '#231710',
  sky: '#110b07',
  accent: '#fb923c',
  curb: '#dc2626',
  fogNear: 1300,
  fogFar: 7200,
  starCount: 900,
  light: '#fed7aa',
  layers: [
    // Arena bowl: banked stands ringing the circuit, plus floodlight masts.
    layer('pylon', '#4a4441', 9, 30, 320, 90, 180, 1.9),
    layer('tower', '#fde68a', 1.4, 60, 260, 220, 300, 0.28, true),
    layer('mesa', '#6b4423', 1.6, 900, 3000, 240, 620, 2.4),
  ],
};

const WASTES: TrackTheme = {
  planet: 'Tatooine — the Jundland Wastes',
  road: '#262b26',
  runoff: '#4d5a35',
  wall: '#3f4a3a',
  ground: '#171f14',
  sky: '#080d08',
  accent: '#a3e635',
  curb: '#65a30d',
  fogNear: 850,
  fogFar: 5600,
  starCount: 1300,
  light: '#d9f99d',
  layers: [
    layer('boulder', '#4a5a30', 5, 10, 240, 40, 120, 0.9),
    layer('spire', '#3f4d2a', 4, 180, 900, 180, 460, 1.4),
    layer('arch', '#4a5a30', 0.9, 120, 500, 140, 240, 1.2),
    layer('mesa', '#33401f', 2, 900, 3000, 320, 700, 2.6),
  ],
};

const CORUSCANT: TrackTheme = {
  planet: 'Coruscant — the upper levels',
  road: '#22222c',
  runoff: '#3f3f52',
  wall: '#3b3b52',
  ground: '#08080f',
  sky: '#06060d',
  accent: '#e879f9',
  curb: '#a855f7',
  fogNear: 800,
  fogFar: 5600,
  starCount: 500,
  light: '#d8b4fe',
  skyLanes: true,
  layers: [
    layer('tower', '#2a2a40', 7, 30, 900, 300, 1100, 1.5),
    layer('tower', '#f0abfc', 4, 60, 900, 260, 900, 0.2, true),
    layer('tower', '#1c1c2e', 3, 1000, 4000, 700, 2000, 4),
  ],
};

const ILUM: TrackTheme = {
  planet: 'Ilum — the crystal caves',
  road: '#2b3340',
  runoff: '#5b7fa6',
  wall: '#64748b',
  ground: '#16283a',
  sky: '#081726',
  accent: '#7dd3fc',
  curb: '#38bdf8',
  fogNear: 700,
  fogFar: 5200,
  starCount: 2400,
  light: '#e0f2fe',
  layers: [
    layer('crystal', '#7dd3fc', 5, 10, 300, 90, 260, 0.9, true),
    layer('stalagmite', '#8aa4bd', 4.5, 120, 800, 200, 520, 1.4),
    layer('crystal', '#38bdf8', 1.6, 400, 1600, 260, 620, 1.8, true),
    layer('stalagmite', '#5b7fa6', 2.2, 1400, 3600, 420, 900, 3),
  ],
};

const BAROONDA: TrackTheme = {
  planet: 'Baroonda — the jungle basin',
  road: '#2a2f2a',
  runoff: '#4b5d2f',
  wall: '#3c4a38',
  ground: '#12210f',
  sky: '#07120a',
  accent: '#4ade80',
  curb: '#f59e0b',
  fogNear: 600,
  fogFar: 4400,
  starCount: 700,
  light: '#bbf7d0',
  layers: [
    layer('tree', '#1f6b3a', 11, 5, 420, 180, 420, 1.1),
    layer('tree', '#14532d', 5, 400, 1500, 240, 520, 1.8),
    layer('boulder', '#3f4a38', 2.5, 20, 260, 30, 90, 0.7),
    layer('spire', '#4a2f1f', 1.2, 600, 2400, 400, 900, 2.4),
  ],
};

const MON_GAZZA: TrackTheme = {
  planet: 'Malastare — Mon Gazza Speedway',
  road: '#2b2b2f',
  runoff: '#57534e',
  wall: '#44444c',
  ground: '#191919',
  sky: '#0b0b0e',
  accent: '#fde047',
  curb: '#dc2626',
  fogNear: 1000,
  fogFar: 6400,
  starCount: 1000,
  light: '#fef9c3',
  layers: [
    // Mining rigs and spoil heaps.
    layer('pylon', '#4b4b52', 5, 30, 500, 120, 300, 1.1),
    layer('tower', '#fde047', 1.3, 80, 420, 220, 380, 0.28, true),
    layer('wreck', '#5a5148', 1.6, 60, 600, 40, 90, 0.9),
    layer('mesa', '#3d372f', 2.4, 700, 2600, 260, 640, 2.6),
  ],
};

const OOVO: TrackTheme = {
  planet: 'Oovo IV — asteroid penitentiary',
  road: '#2a2a30',
  runoff: '#3a3a42',
  wall: '#4a4a55',
  ground: '#0a0a0d',
  sky: '#030308',
  accent: '#f87171',
  curb: '#e2e8f0',
  fogNear: 1400,
  fogFar: 8000,
  starCount: 3200,
  light: '#cbd5e1',
  layers: [
    layer('boulder', '#3a3a42', 5, 10, 400, 60, 200, 1.4),
    layer('pylon', '#5a5a66', 2.2, 100, 700, 160, 380, 1),
    layer('boulder', '#26262e', 3, 900, 3600, 300, 800, 4),
  ],
};

// --- Circuits ----------------------------------------------------------------

export const TRACKS: TrackData[] = [
  {
    id: 'mos-espa',
    name: 'Mos Espa Circuit',
    difficulty: 'Easy',
    width: 260,
    color: MOS_ESPA.accent,
    theme: MOS_ESPA,
    banking: 1.2,
    elevation: { amplitude: 70, waves: 2 },
    ramps: [{ at: 0.52, length: 260, height: 34 }],
    blurb: 'Wide banked sweepers and one long jump. A good place to learn the boost.',
    points: generateOval(0, 0, 3900, 2400, 110),
  },
  {
    id: 'dune-sea',
    name: 'Dune Sea Loop',
    difficulty: 'Medium',
    width: 230,
    color: DUNE_SEA.accent,
    theme: DUNE_SEA,
    banking: 1,
    elevation: { amplitude: 95, waves: 3 },
    ramps: [
      { at: 0.2, length: 240, height: 30 },
      { at: 0.7, length: 240, height: 30 },
    ],
    blurb: 'A crossover figure-eight over the dunes, with a jump on each loop.',
    points: generateFigure8(0, 0, 2500),
  },
  {
    id: 'coliseum',
    name: 'Mos Espa Grand Arena',
    difficulty: 'Medium',
    width: 250,
    color: ARENA.accent,
    theme: ARENA,
    banking: 1.5,
    blurb: 'Two enormous straights and two banked hairpins, ringed by the stands.',
    points: generateStadium(0, 0, 4200, 620),
  },
  {
    id: 'skyway',
    name: 'Coruscant Skyway',
    difficulty: 'Medium',
    width: 240,
    color: CORUSCANT.accent,
    theme: CORUSCANT,
    banking: 1.1,
    elevation: { amplitude: 260, waves: 2 },
    ramps: [{ at: 0.38, length: 220, height: 40 }],
    blurb: 'An elevated ribbon through the towers. Big climbs, bigger drops.',
    points: generateSerpentine(0, 0, 2150),
  },
  {
    id: 'mon-gazza',
    name: 'Mon Gazza Speedway',
    difficulty: 'Medium',
    width: 250,
    color: MON_GAZZA.accent,
    theme: MON_GAZZA,
    banking: 1.3,
    elevation: { amplitude: 80, waves: 3 },
    ramps: [{ at: 0.62, length: 250, height: 36 }],
    blurb: 'Malastare mining country. Fast, filthy, and built for slipstreaming.',
    points: generateEpic(0, 0, 2350, 1.3, 0.6),
  },
  {
    id: 'beggars-canyon',
    name: 'Beggar’s Canyon',
    difficulty: 'Hard',
    width: 235,
    color: CANYON.accent,
    theme: CANYON,
    banking: 0.9,
    elevation: { amplitude: 165, waves: 3 },
    ramps: [{ at: 0.44, length: 200, height: 42 }],
    blurb: 'Sheer walls and a double apex. Brake early or meet the rock.',
    points: generateCanyon(0, 0, 2700),
  },
  {
    id: 'boonta-eve',
    name: 'Boonta Eve Classic',
    difficulty: 'Hard',
    width: 220,
    color: BOONTA.accent,
    theme: BOONTA,
    banking: 1,
    elevation: { amplitude: 110, waves: 3 },
    ramps: [
      { at: 0.28, length: 230, height: 32 },
      { at: 0.78, length: 230, height: 32 },
    ],
    blurb: 'The long one. Constantly changing radii reward a driver who can chain drifts.',
    points: generateGrandPrix(0, 0, 2300),
  },
  {
    id: 'baroonda',
    name: 'Baroonda Rainforest',
    difficulty: 'Hard',
    width: 230,
    color: BAROONDA.accent,
    theme: BAROONDA,
    banking: 1.1,
    elevation: { amplitude: 130, waves: 4 },
    ramps: [
      { at: 0.15, length: 210, height: 38 },
      { at: 0.55, length: 210, height: 38 },
    ],
    blurb: 'Blind, close and green. The canopy hides the corner until you are in it.',
    points: generateEpic(0, 0, 2250, 1.15, 2.4),
  },
  {
    id: 'jundland-knot',
    name: 'Jundland Knot',
    difficulty: 'Hard',
    width: 230,
    color: WASTES.accent,
    theme: WASTES,
    banking: 1.2,
    elevation: { amplitude: 140, waves: 3 },
    blurb: 'Crosses itself three times. Learn which bridge you are on before you commit.',
    points: generateTrefoil(0, 0, 900),
  },
  {
    id: 'ilum-ice',
    name: 'Ilum Ice Run',
    difficulty: 'Hard',
    width: 240,
    color: ILUM.accent,
    theme: ILUM,
    banking: 0.7,
    elevation: { amplitude: 90, waves: 4 },
    blurb: 'Six near-identical corners in a row. Pure rhythm — one mistake ruins the lap.',
    points: generateLobed(0, 0, 2450, 6, 0.16),
  },
  {
    id: 'oovo-iv',
    name: 'Oovo IV Ravine',
    difficulty: 'Hard',
    width: 225,
    color: OOVO.accent,
    theme: OOVO,
    banking: 0.8,
    elevation: { amplitude: 190, waves: 4 },
    ramps: [
      { at: 0.12, length: 190, height: 48 },
      { at: 0.46, length: 190, height: 48 },
      { at: 0.8, length: 190, height: 48 },
    ],
    blurb: 'An asteroid quarry. Three big jumps and nothing much to land on.',
    points: generateEpic(0, 0, 2400, 1.05, 4.1),
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

export const LAP_OPTIONS = [1, 2, 3, 5] as const;
