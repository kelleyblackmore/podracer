export enum GameView {
  MENU = 'MENU',
  RACE = 'RACE',
  ANALYSIS = 'ANALYSIS',
}

export interface Point {
  x: number;
  y: number;
}

export type Difficulty = 'Easy' | 'Medium' | 'Hard';

/** Shape of the instanced props scattered outside the barriers. */
export type SceneryKind =
  | 'mesa'
  | 'spire'
  | 'pylon'
  | 'crystal'
  | 'dune'
  | 'boulder'
  | 'arch'
  | 'tower'
  | 'vaporator'
  | 'tree'
  | 'stalagmite'
  | 'wreck';

/**
 * One band of props. Themes stack several — near clutter, mid-ground landmarks
 * and a distant skyline — which is what stops a horizon reading as one repeated
 * shape.
 */
export interface SceneryLayer {
  kind: SceneryKind;
  color: string;
  /** Props per 1000 units of track length. */
  density: number;
  /** Distance band beyond the barrier, in world units. */
  minDistance: number;
  maxDistance: number;
  minHeight: number;
  maxHeight: number;
  /** Horizontal scale multiplier. */
  scale: number;
  /** Emissive props ignore lighting — used for city windows and crystals. */
  glow?: boolean;
}

/** Per-circuit art direction. Everything is a colour or a count — no assets. */
export interface TrackTheme {
  road: string;
  runoff: string;
  wall: string;
  ground: string;
  /** Background and fog colour. */
  sky: string;
  /** Edge lines, gantry and marker posts. */
  accent: string;
  /** Secondary curb colour, paired with white. */
  curb: string;
  layers: SceneryLayer[];
  fogNear: number;
  fogFar: number;
  starCount: number;
  /** Sunlight tint. */
  light: string;
  /** The world this circuit is set on, shown on the track card. */
  planet: string;
  /** Optional pair of low suns on the horizon, as [colour, colour]. */
  suns?: string[];
  /** Coruscant-style traffic lanes streaking past above the circuit. */
  skyLanes?: boolean;
}

/**
 * A jump. Positioned by lap fraction so it stays put if a circuit is rescaled.
 * The approach ramps up over `length` and ends in a lip; clearing it depends on
 * how fast you arrive.
 */
export interface RampSpec {
  /** Where the ramp starts, as a fraction of the lap (0..1). */
  at: number;
  /** Length of the ramp along the track, in world units. */
  length: number;
  /** Height of the lip above the road. */
  height: number;
}

/**
 * Vertical profile of a circuit. `waves` must be a whole number so the height
 * closes seamlessly around the loop.
 */
export interface ElevationProfile {
  amplitude: number;
  waves: number;
  phase?: number;
}

export interface TrackData {
  id: string;
  name: string;
  points: Point[]; // Centre-line control points
  width: number;
  color: string;
  difficulty: Difficulty;
  /** Flavour text shown on the track card. */
  blurb: string;
  theme: TrackTheme;
  elevation?: ElevationProfile;
  /** Multiplies the curvature-derived banking. 0 keeps the circuit flat. */
  banking?: number;
  ramps?: RampSpec[];
}

export interface CarConfig {
  id: string;
  name: string;
  color: string;
  acceleration: number;
  topSpeed: number;
  /** 0..1 lateral grip. Higher sticks to the heading, lower slides. */
  handling: number;
  blurb: string;
}

export interface LapTelemetry {
  lapNumber: number;
  time: number; // seconds
  maxSpeed: number;
  averageSpeed: number;
  offTrackCount: number;
  collisions: number;
}

export type RivalSkill = 'NONE' | 'ROOKIE' | 'PRO' | 'LEGEND';

export interface GameSessionStats {
  trackId: string;
  trackName: string;
  carId: string;
  carName: string;
  totalLaps: number;
  bestLap: number | null; // seconds
  totalTime: number; // seconds
  finishPosition: number;
  fieldSize: number;
  finished: boolean;
  rivalSkill: RivalSkill;
  telemetry: LapTelemetry[];
  timestamp: string;
}

export type CameraMode = 'CHASE' | 'TOPDOWN' | 'COCKPIT';

export interface RaceSettings {
  laps: number;
  rivalSkill: RivalSkill;
}

/** Per-track personal best, persisted to localStorage. */
export interface RecordEntry {
  bestLap: number;
  bestRace: number | null;
  carId: string;
  updatedAt: string;
}
