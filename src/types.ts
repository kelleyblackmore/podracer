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
export type SceneryKind = 'mesa' | 'spire' | 'pylon' | 'crystal' | 'dune';

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
  scenery: SceneryKind;
  sceneryColor: string;
  /** Density multiplier for scenery props, 0 disables them. */
  sceneryDensity: number;
  fogNear: number;
  fogFar: number;
  starCount: number;
  /** Sunlight tint. */
  light: string;
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
