export enum GameView {
  MENU = 'MENU',
  RACE = 'RACE',
  ANALYSIS = 'ANALYSIS',
}

export interface Point {
  x: number;
  y: number;
}

export interface TrackData {
  id: string;
  name: string;
  points: Point[]; // Center line points
  width: number;
  color: string;
  difficulty: 'Easy' | 'Medium' | 'Hard';
}

export interface LapTelemetry {
  lapNumber: number;
  time: number; // seconds
  maxSpeed: number;
  averageSpeed: number;
  offTrackCount: number;
  collisions: number;
}

export interface GameSessionStats {
  totalLaps: number;
  bestLap: number | null; // time in seconds
  telemetry: LapTelemetry[];
  timestamp: string;
}

export interface CarConfig {
  id: string;
  name: string;
  color: string;
  acceleration: number;
  topSpeed: number;
  handling: number; // Grip factor
}