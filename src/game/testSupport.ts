import { CARS, TRACKS } from '../constants';
import type { CarConfig, RivalSkill, TrackData } from '../types';
import { buildTrackGeometry, type TrackGeometry } from './track';
import {
  createRace,
  NEUTRAL_CONTROLS,
  stepRace,
  type Controls,
  type RaceEvent,
  type RaceState,
} from './engine';

/**
 * Shared helpers for the test suite. Kept in `src` rather than a test folder so
 * it type-checks with the same settings as the app.
 */

export const FIXED_STEP = 1 / 60;

/** Geometry cache — building a circuit is the slow part of a full-race test. */
const geometryCache = new Map<string, TrackGeometry>();

export function geometryFor(track: TrackData): TrackGeometry {
  const cached = geometryCache.get(track.id);
  if (cached) return cached;
  const built = buildTrackGeometry(track);
  geometryCache.set(track.id, built);
  return built;
}

export function trackById(id: string): TrackData {
  const track = TRACKS.find((candidate) => candidate.id === id);
  if (!track) throw new Error(`No such track: ${id}`);
  return track;
}

export interface RaceOptions {
  laps?: number;
  rivalSkill?: Exclude<RivalSkill, 'NONE'>;
  playerCar?: CarConfig;
  /** Let the rival AI drive the player's pod so a race can run unattended. */
  autopilot?: boolean;
}

export function startRace(track: TrackData, options: RaceOptions = {}): RaceState {
  const playerCar = options.playerCar ?? CARS[0];
  const rivals = CARS.filter((car) => car.id !== playerCar.id);
  const race = createRace(geometryFor(track), playerCar, rivals, {
    laps: options.laps ?? 2,
    rivalSkill: options.rivalSkill ?? 'PRO',
  });
  race.player.autopilot = options.autopilot ?? true;
  return race;
}

/** Advance the simulation by `seconds` at a fixed step, collecting events. */
export function advance(
  race: RaceState,
  seconds: number,
  controls: Partial<Controls> = {},
): RaceEvent[] {
  const merged = { ...NEUTRAL_CONTROLS, ...controls };
  const collected: RaceEvent[] = [];
  const ticks = Math.round(seconds * 60);
  for (let i = 0; i < ticks; i++) {
    collected.push(...stepRace(race, FIXED_STEP, merged));
  }
  return collected;
}

export interface RaceSummary {
  events: RaceEvent[];
  /** Highest speed each racer reached, keyed by id. */
  peakSpeed: Map<string, number>;
  /** Highest hop each racer reached. */
  peakHop: Map<string, number>;
  /** True if the loop bailed out before the race finished. */
  timedOut: boolean;
  elapsed: number;
}

/**
 * Runs a race to the chequered flag, recording what happened along the way.
 * Bails out after `maxSeconds` of simulated time so a stalled race fails the
 * test rather than hanging it.
 */
export function runRace(race: RaceState, maxSeconds = 600): RaceSummary {
  const events: RaceEvent[] = [];
  const peakSpeed = new Map<string, number>();
  const peakHop = new Map<string, number>();
  const maxTicks = Math.round(maxSeconds * 60);

  let ticks = 0;
  while (race.phase !== 'FINISHED' && ticks < maxTicks) {
    events.push(...stepRace(race, FIXED_STEP, NEUTRAL_CONTROLS));
    for (const racer of race.racers) {
      peakSpeed.set(racer.id, Math.max(peakSpeed.get(racer.id) ?? 0, Math.abs(racer.speed)));
      peakHop.set(racer.id, Math.max(peakHop.get(racer.id) ?? 0, racer.hop));
    }
    ticks++;
  }

  return { events, peakSpeed, peakHop, timedOut: ticks >= maxTicks, elapsed: ticks / 60 };
}

/**
 * Drops the player onto the centre line at a known sample, speed and heading,
 * and clears the rest of the field out of the way.
 *
 * Physics tests must not depend on the rival AI to get the pod into position:
 * `driveAI` rolls `Math.random()` for mistakes, so the same test would start
 * from a slightly different place every run and pass or fail on a coin toss.
 */
export function placeOnTrack(
  race: RaceState,
  index: number,
  speedFraction: number,
  { isolate = true } = {},
): void {
  const sample = race.geometry.samples[index];
  const angle = Math.atan2(sample.tz, sample.tx);
  const speed = race.player.config.topSpeed * speedFraction;
  const player = race.player;

  player.autopilot = false;
  player.x = sample.x;
  player.z = sample.z;
  player.angle = angle;
  player.trackIndex = index;
  player.s = sample.s;
  player.lateral = 0;
  player.speed = speed;
  player.vx = Math.cos(angle) * speed;
  player.vz = Math.sin(angle) * speed;
  player.spin = 0;
  player.drifting = false;
  player.driftCharge = 0;
  player.boostTimer = 0;
  player.stunTimer = 0;
  player.hop = 0;
  player.vy = 0;
  player.airborne = false;
  player.slipstream = 0;

  if (isolate) {
    for (const rival of race.racers) {
      if (rival.isPlayer) continue;
      rival.x += 50_000;
      rival.z += 50_000;
      rival.vx = 0;
      rival.vz = 0;
      rival.speed = 0;
    }
  }
}

/** Index of the first ramp lip on a circuit, or -1 if it has no jumps. */
export function findRampLip(geometry: TrackGeometry): number {
  return geometry.samples.findIndex((sample) => sample.rampLip > 0);
}

export function countEvents(events: RaceEvent[], type: RaceEvent['type']): number {
  return events.filter((event) => event.type === type).length;
}

/** Every finite-number check the geometry tests share. */
export function findNonFinite(values: ArrayLike<number>): number {
  let count = 0;
  for (let i = 0; i < values.length; i++) {
    if (!Number.isFinite(values[i])) count++;
  }
  return count;
}
