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

export interface TrackData {
  id: string;
  name: string;
  points: Point[]; // Centre-line control points
  width: number;
  color: string;
  difficulty: Difficulty;
  /** Flavour text shown on the track card. */
  blurb: string;
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
