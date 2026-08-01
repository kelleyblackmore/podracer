import type { CarConfig, LapTelemetry, RaceSettings, RivalSkill } from '../types';
import {
  arcDelta,
  locate,
  offsetPoint,
  sampleAhead,
  type TrackGeometry,
  type TrackSample,
} from './track';

export type RacePhase = 'COUNTDOWN' | 'RACING' | 'FINISHED';

export interface Controls {
  /** 0..1 */
  throttle: number;
  /** 0..1 — reverse thrust / braking. */
  brake: number;
  /** -1 (left) .. 1 (right) */
  steer: number;
  drift: boolean;
}

export const NEUTRAL_CONTROLS: Controls = { throttle: 0, brake: 0, steer: 0, drift: false };

export interface Racer {
  id: string;
  name: string;
  color: string;
  config: CarConfig;
  isPlayer: boolean;

  x: number;
  z: number;
  angle: number;
  vx: number;
  vz: number;
  /** Signed forward speed in units/tick (1 tick = 1/60 s). */
  speed: number;

  drifting: boolean;
  driftCharge: number;
  boostTimer: number;
  /** Counts down while the racer is recovering from a barrier hit. */
  stunTimer: number;

  trackIndex: number;
  s: number;
  lateral: number;
  /**
   * Completed laps. Starts at -1 because the grid sits *behind* the start
   * line, so the first crossing is lap 0 (the green-flag lap) and records no
   * time. Also keeps grid positions sorting behind anyone already racing.
   */
  lap: number;
  /** lap * trackLength + s — the sort key for standings. */
  totalProgress: number;
  offTrack: boolean;

  lapStart: number;
  lapTimes: number[];
  bestLap: number | null;
  finished: boolean;
  finishTime: number | null;
  position: number;

  controls: Controls;
  telemetry: LapTelemetry[];
  lapAccum: { maxSpeed: number; speedSum: number; frames: number; offTrack: number; hits: number };

  /** When set, the player's pod is driven by the rival AI (demo / test hook). */
  autopilot: boolean;

  /** AI only. */
  lane: number;
  skillNoise: number;
  mistakeTimer: number;
  collisionCooldown: number;
  /** Seconds the AI has spent barely moving — triggers a reverse-out. */
  stuckTimer: number;
  /** Counts down while the AI is backing away from whatever it hit. */
  reverseTimer: number;
}

export type RaceEvent =
  | { type: 'collision'; racerId: string; force: number }
  | { type: 'boost'; racerId: string; strength: number }
  | { type: 'lap'; racerId: string; lap: number; time: number; isBest: boolean }
  | { type: 'finish'; racerId: string; position: number }
  | { type: 'countdown'; value: number }
  | { type: 'go' };

export interface RaceState {
  phase: RacePhase;
  /** Seconds since the lights went green. Negative during the countdown. */
  clock: number;
  countdown: number;
  totalLaps: number;
  rivalSkill: Exclude<RivalSkill, 'NONE'>;
  racers: Racer[];
  player: Racer;
  geometry: TrackGeometry;
  events: RaceEvent[];
  finishOrder: string[];
  lastCountdownBeep: number;
}

// --- Tuning ------------------------------------------------------------------

/**
 * Speeds are in track units per 1/60 s tick. The whole model is calibrated so a
 * lap of the ~7,700-unit Mos Espa oval takes roughly 20 seconds; the scaffold's
 * original numbers produced 5-second laps, which made a 3-lap race shorter than
 * the countdown. Turn rates and the grip constants scale with speed so the
 * racing line keeps the same *shape* — only the clock stretches.
 */
export const SPEED_TO_MPH = 40;

const COUNTDOWN_SECONDS = 3.4;
/** Grip beyond the racing surface before the barrier. */
const RUNOFF = 55;
const RACER_RADIUS = 26;
const BOOST_TOP_SPEED_MULT = 1.5;
const BOOST_ACCEL_MULT = 2;
const DRIFT_ALIGN = 0.028;
const DRIFT_CHARGE_RATE = 34;
const DRIFT_MIN_CHARGE = 28;
// Turn rate scales with speed so radius (v/ω) stays constant across the retune.
const TURN_BASE = 0.0048;
const TURN_SPEED_GAIN = 0.0105;
const DRIFT_TURN_MULT = 1.45;
const OFFTRACK_DRAG = 0.93;
const BARRIER_RESTITUTION = 0.35;

const SKILL_PROFILE: Record<Exclude<RivalSkill, 'NONE'>, { pace: number; noise: number; slip: number }> =
  {
    ROOKIE: { pace: 0.8, noise: 0.09, slip: 0.35 },
    PRO: { pace: 0.93, noise: 0.04, slip: 0.15 },
    LEGEND: { pace: 1.02, noise: 0.015, slip: 0.04 },
  };

const RIVAL_LIVERY = [
  { name: 'Sebulba', color: '#f97316' },
  { name: 'Gasgano', color: '#22d3ee' },
  { name: 'Mawhonic', color: '#a855f7' },
  { name: 'Teemto', color: '#facc15' },
  { name: 'Ody Mandrell', color: '#ec4899' },
];

const RIVALS_PER_SKILL: Record<RivalSkill, number> = { NONE: 0, ROOKIE: 3, PRO: 4, LEGEND: 5 };

// --- Construction ------------------------------------------------------------

function emptyAccum() {
  return { maxSpeed: 0, speedSum: 0, frames: 0, offTrack: 0, hits: 0 };
}

function makeRacer(
  id: string,
  name: string,
  color: string,
  config: CarConfig,
  isPlayer: boolean,
): Racer {
  return {
    id,
    name,
    color,
    config,
    isPlayer,
    x: 0,
    z: 0,
    angle: 0,
    vx: 0,
    vz: 0,
    speed: 0,
    drifting: false,
    driftCharge: 0,
    boostTimer: 0,
    stunTimer: 0,
    trackIndex: 0,
    s: 0,
    lateral: 0,
    lap: -1,
    totalProgress: 0,
    offTrack: false,
    lapStart: 0,
    lapTimes: [],
    bestLap: null,
    finished: false,
    finishTime: null,
    position: 1,
    controls: { ...NEUTRAL_CONTROLS },
    telemetry: [],
    lapAccum: emptyAccum(),
    autopilot: false,
    lane: 0,
    skillNoise: 0,
    mistakeTimer: 0,
    collisionCooldown: 0,
    stuckTimer: 0,
    reverseTimer: 0,
  };
}

/**
 * Builds the starting grid: racers are lined up *behind* the start line in
 * staggered rows so nobody crosses it before the lights go out.
 */
export function createRace(
  geometry: TrackGeometry,
  playerCar: CarConfig,
  rivalCars: CarConfig[],
  settings: RaceSettings,
): RaceState {
  const rivalCount = Math.min(RIVALS_PER_SKILL[settings.rivalSkill], RIVAL_LIVERY.length);
  const racers: Racer[] = [makeRacer('player', 'You', playerCar.color, playerCar, true)];

  for (let i = 0; i < rivalCount; i++) {
    const livery = RIVAL_LIVERY[i];
    const config = rivalCars[i % rivalCars.length];
    const rival = makeRacer(`rival-${i}`, livery.name, livery.color, config, false);
    rival.lane = (i % 2 === 0 ? 1 : -1) * (0.12 + 0.09 * Math.floor(i / 2)) * geometry.halfWidth;
    racers.push(rival);
  }

  const rowSpacing = 90;
  const laneSpacing = geometry.halfWidth * 0.45;
  racers.forEach((racer, i) => {
    const row = Math.floor(i / 2);
    const side = i % 2 === 0 ? -1 : 1;
    // Walk backwards from the line; the loop wraps so this is always valid.
    const gridS = geometry.length - (row + 1) * rowSpacing;
    const index = Math.round(gridS / geometry.spacing) % geometry.samples.length;
    const sample = geometry.samples[index];
    const spot = offsetPoint(sample, side * laneSpacing);
    racer.x = spot.x;
    racer.z = spot.z;
    racer.angle = Math.atan2(sample.tz, sample.tx);
    racer.trackIndex = index;
    racer.s = sample.s;
    racer.lateral = side * laneSpacing;
    racer.totalProgress = sample.s - geometry.length; // lap -1: the approach lap
    racer.position = i + 1;
    racer.skillNoise = Math.random() * Math.PI * 2;
  });

  return {
    phase: 'COUNTDOWN',
    clock: -COUNTDOWN_SECONDS,
    countdown: COUNTDOWN_SECONDS,
    totalLaps: settings.laps,
    rivalSkill: settings.rivalSkill === 'NONE' ? 'PRO' : settings.rivalSkill,
    racers,
    player: racers[0],
    geometry,
    events: [],
    finishOrder: [],
    lastCountdownBeep: Number.POSITIVE_INFINITY,
  };
}

// --- Simulation --------------------------------------------------------------

/** Advances the whole race by `dt` seconds. Returns the events raised this step. */
export function stepRace(state: RaceState, dt: number, playerControls: Controls): RaceEvent[] {
  state.events.length = 0;

  if (state.phase === 'COUNTDOWN') {
    state.clock += dt;
    state.countdown = Math.max(0, -state.clock);
    const beep = Math.ceil(state.countdown);
    if (beep < state.lastCountdownBeep) {
      state.lastCountdownBeep = beep;
      if (beep > 0) state.events.push({ type: 'countdown', value: beep });
    }
    if (state.clock >= 0) {
      state.phase = 'RACING';
      state.clock = 0;
      state.events.push({ type: 'go' });
      for (const racer of state.racers) racer.lapStart = 0;
    }
    // Racers stay put on the grid, but the scene still renders/idles.
    for (const racer of state.racers) racer.controls = { ...NEUTRAL_CONTROLS };
    return state.events;
  }

  if (state.phase === 'FINISHED') return state.events;

  state.clock += dt;

  for (const racer of state.racers) {
    if (racer.finished) {
      // Coast to a stop rather than freezing mid-track.
      racer.controls = { ...NEUTRAL_CONTROLS };
    } else {
      racer.controls =
        racer.isPlayer && !racer.autopilot ? playerControls : driveAI(state, racer, dt);
    }
    stepRacer(state, racer, dt);
  }

  resolveRacerCollisions(state);
  updateStandings(state);

  return state.events;
}

function stepRacer(state: RaceState, racer: Racer, dt: number): void {
  const { geometry } = state;
  const { config, controls } = racer;
  const tickScale = dt * 60;

  if (racer.stunTimer > 0) racer.stunTimer = Math.max(0, racer.stunTimer - dt);
  if (racer.collisionCooldown > 0) racer.collisionCooldown = Math.max(0, racer.collisionCooldown - dt);

  // --- Drift & boost ---
  const turning = Math.abs(controls.steer) > 0.15;
  const fastEnough = Math.abs(racer.speed) > config.topSpeed * 0.3;
  if (controls.drift && fastEnough && (turning || racer.drifting) && !racer.offTrack) {
    racer.drifting = true;
    racer.driftCharge = Math.min(100, racer.driftCharge + DRIFT_CHARGE_RATE * dt);
  } else {
    if (racer.drifting && racer.driftCharge >= DRIFT_MIN_CHARGE) {
      const strength = racer.driftCharge >= 85 ? 2 : 1;
      racer.boostTimer = strength === 2 ? 2 : 1.1;
      state.events.push({ type: 'boost', racerId: racer.id, strength });
    }
    racer.drifting = false;
    racer.driftCharge = 0;
  }

  // --- Longitudinal ---
  let topSpeed = config.topSpeed;
  let acceleration = config.acceleration;
  if (racer.boostTimer > 0) {
    racer.boostTimer = Math.max(0, racer.boostTimer - dt);
    topSpeed *= BOOST_TOP_SPEED_MULT;
    acceleration *= BOOST_ACCEL_MULT;
  }
  if (racer.stunTimer > 0) {
    topSpeed *= 0.55;
    acceleration *= 0.5;
  }

  if (racer.finished) {
    // Slow to a halt after the flag instead of coasting into the barrier and
    // grinding along it for the rest of the session.
    racer.speed *= Math.pow(0.955, tickScale);
  } else if (controls.throttle > 0) {
    racer.speed += acceleration * controls.throttle * tickScale;
  } else if (controls.brake > 0) {
    racer.speed -= acceleration * 1.6 * controls.brake * tickScale;
  } else {
    racer.speed *= Math.pow(racer.drifting ? 0.995 : 0.985, tickScale);
  }
  racer.speed = Math.max(-topSpeed / 3, Math.min(topSpeed, racer.speed));

  // --- Steering ---
  const speedRatio = Math.min(1, Math.abs(racer.speed) / config.topSpeed);
  let turnRate = TURN_BASE + TURN_SPEED_GAIN * speedRatio;
  if (racer.drifting) turnRate *= DRIFT_TURN_MULT;
  // Repulsorlifts can yaw the pod on the spot. Without this, a racer that noses
  // into a barrier has its speed scrubbed below the steering threshold and can
  // never turn back out — a permanent beaching for the player and the AI alike.
  const steerSign = Math.abs(racer.speed) > 0.1 ? Math.sign(racer.speed) : 1;
  racer.angle += controls.steer * turnRate * tickScale * steerSign;

  // --- Lateral grip: velocity chases the heading, slower while drifting ---
  const alignPerTick = racer.drifting ? DRIFT_ALIGN : config.handling;
  const align = 1 - Math.pow(1 - alignPerTick, tickScale);
  const targetVx = Math.cos(racer.angle) * racer.speed;
  const targetVz = Math.sin(racer.angle) * racer.speed;
  racer.vx += (targetVx - racer.vx) * align;
  racer.vz += (targetVz - racer.vz) * align;

  racer.x += racer.vx * tickScale;
  racer.z += racer.vz * tickScale;

  // --- Track position, runoff and barriers ---
  const loc = locate(geometry, racer.x, racer.z, racer.trackIndex);
  racer.trackIndex = loc.index;
  racer.lateral = loc.lateral;

  const edge = geometry.halfWidth;
  const barrier = edge + RUNOFF;
  const absLateral = Math.abs(loc.lateral);
  racer.offTrack = absLateral > edge;

  if (racer.offTrack) {
    const drag = Math.pow(OFFTRACK_DRAG, tickScale);
    racer.speed *= drag;
    racer.vx *= drag;
    racer.vz *= drag;
    racer.drifting = false;
    racer.driftCharge = 0;
    racer.lapAccum.offTrack += dt;
  }

  if (absLateral > barrier) {
    const sample = geometry.samples[loc.index];
    const side = Math.sign(loc.lateral) || 1;
    // Snap just inside the wall.
    const push = absLateral - barrier;
    racer.x -= sample.nx * side * push;
    racer.z -= sample.nz * side * push;

    // Reflect only the wall-normal component; keep the along-track component.
    const normalVel = racer.vx * sample.nx + racer.vz * sample.nz;
    if (normalVel * side > 0) {
      const impact = Math.abs(normalVel);
      racer.vx -= sample.nx * normalVel * (1 + BARRIER_RESTITUTION);
      racer.vz -= sample.nz * normalVel * (1 + BARRIER_RESTITUTION);

      // Scale the penalty with how hard the hit was. A flat penalty made
      // scraping along a wall as costly as a head-on crash, and repeated every
      // frame it drove speed to zero and pinned the racer there.
      const severity = Math.min(1, impact / (config.topSpeed * 0.45));
      racer.speed *= 1 - 0.45 * severity;
      racer.drifting = false;
      racer.driftCharge = 0;
      if (severity > 0.2) {
        racer.stunTimer = 0.5;
        if (racer.collisionCooldown === 0 && !racer.finished) {
          racer.collisionCooldown = 0.35;
          racer.lapAccum.hits++;
          state.events.push({ type: 'collision', racerId: racer.id, force: impact });
        }
      }
    }
  }

  // --- Lap accounting ---
  const previousS = racer.s;
  const delta = arcDelta(geometry, previousS, loc.s);
  const raw = previousS + delta;
  racer.s = loc.s;
  if (raw >= geometry.length) completeLap(state, racer);
  else if (raw < 0) racer.lap = Math.max(-1, racer.lap - 1);
  racer.totalProgress = racer.lap * geometry.length + racer.s;

  const mph = Math.abs(racer.speed) * SPEED_TO_MPH;
  racer.lapAccum.maxSpeed = Math.max(racer.lapAccum.maxSpeed, mph);
  racer.lapAccum.speedSum += mph;
  racer.lapAccum.frames++;
}

function completeLap(state: RaceState, racer: Racer): void {
  racer.lap++;

  // lap 0 is the first crossing from the grid — it starts the clock, it isn't a lap.
  if (racer.lap === 0) {
    racer.lapStart = state.clock;
    racer.lapAccum = emptyAccum();
    return;
  }

  const lapTime = state.clock - racer.lapStart;
  racer.lapStart = state.clock;
  racer.lapTimes.push(lapTime);
  const isBest = racer.bestLap === null || lapTime < racer.bestLap;
  if (isBest) racer.bestLap = lapTime;

  const accum = racer.lapAccum;
  racer.telemetry.push({
    lapNumber: racer.lapTimes.length,
    time: lapTime,
    maxSpeed: Math.round(accum.maxSpeed),
    averageSpeed: accum.frames ? Math.round(accum.speedSum / accum.frames) : 0,
    offTrackCount: Math.round(accum.offTrack * 10) / 10,
    collisions: accum.hits,
  });
  racer.lapAccum = emptyAccum();

  state.events.push({ type: 'lap', racerId: racer.id, lap: racer.lapTimes.length, time: lapTime, isBest });

  if (racer.lapTimes.length >= state.totalLaps) {
    racer.finished = true;
    racer.finishTime = state.clock;
    state.finishOrder.push(racer.id);
    state.events.push({ type: 'finish', racerId: racer.id, position: state.finishOrder.length });
    // The race is over the moment the player takes the chequered flag.
    if (racer.isPlayer) state.phase = 'FINISHED';
  }
}

function updateStandings(state: RaceState): void {
  const ordered = [...state.racers].sort((a, b) => {
    if (a.finished && b.finished) return (a.finishTime ?? 0) - (b.finishTime ?? 0);
    if (a.finished) return -1;
    if (b.finished) return 1;
    return b.totalProgress - a.totalProgress;
  });
  ordered.forEach((racer, i) => {
    racer.position = i + 1;
  });
}

/** Elastic-ish push apart so pods jostle instead of overlapping. */
function resolveRacerCollisions(state: RaceState): void {
  const racers = state.racers;
  const minDist = RACER_RADIUS * 2;
  for (let i = 0; i < racers.length; i++) {
    for (let j = i + 1; j < racers.length; j++) {
      const a = racers[i];
      const b = racers[j];
      const dx = b.x - a.x;
      const dz = b.z - a.z;
      const distSq = dx * dx + dz * dz;
      if (distSq >= minDist * minDist || distSq === 0) continue;

      const dist = Math.sqrt(distSq);
      const nx = dx / dist;
      const nz = dz / dist;
      const overlap = (minDist - dist) / 2;
      a.x -= nx * overlap;
      a.z -= nz * overlap;
      b.x += nx * overlap;
      b.z += nz * overlap;

      const relative = (b.vx - a.vx) * nx + (b.vz - a.vz) * nz;
      if (relative < 0) {
        const impulse = relative * 0.7;
        a.vx += nx * impulse;
        a.vz += nz * impulse;
        b.vx -= nx * impulse;
        b.vz -= nz * impulse;

        // Scale with closing speed. A flat per-frame penalty meant two pods
        // merely running side by side scrubbed each other to a standstill.
        const topSpeed = Math.max(a.config.topSpeed, b.config.topSpeed);
        const severity = Math.min(1, Math.abs(relative) / (topSpeed * 0.4));
        if (severity > 0.12) {
          a.speed *= 1 - 0.2 * severity;
          b.speed *= 1 - 0.2 * severity;
        }
        for (const racer of [a, b]) {
          if (severity > 0.25 && racer.collisionCooldown === 0 && !racer.finished) {
            racer.collisionCooldown = 0.35;
            racer.lapAccum.hits++;
            state.events.push({ type: 'collision', racerId: racer.id, force: Math.abs(relative) });
          }
        }
      }
    }
  }
}

// --- Rival AI ----------------------------------------------------------------

/**
 * Aims at a point on the racing line some distance ahead and matches the
 * precomputed corner-speed profile. Skill scales pace, steering noise and how
 * often the driver makes a mistake.
 */
function driveAI(state: RaceState, racer: Racer, dt: number): Controls {
  const { geometry } = state;
  const skill = SKILL_PROFILE[state.rivalSkill];

  racer.skillNoise += dt * 1.7;
  racer.mistakeTimer = Math.max(0, racer.mistakeTimer - dt);
  if (racer.mistakeTimer === 0 && Math.random() < skill.slip * dt) {
    racer.mistakeTimer = 0.4 + Math.random() * 0.6;
  }

  const lookDistance = 130 + Math.abs(racer.speed) * 36;
  const target = sampleAhead(geometry, racer.trackIndex, lookDistance);
  // Apex bias plus lane must stay inside the track, but the clamp has to be
  // loose enough that it never collapses two rivals' lanes onto one point —
  // that makes them converge, touch, and drag each other to a crawl.
  const maxAim = geometry.halfWidth * 0.8;
  const aimLateral = Math.max(
    -maxAim,
    Math.min(maxAim, racingLineOffset(target, geometry.halfWidth) + racer.lane),
  );
  const aim = offsetPoint(target, aimLateral);

  let headingError = Math.atan2(aim.z - racer.z, aim.x - racer.x) - racer.angle;
  while (headingError > Math.PI) headingError -= Math.PI * 2;
  while (headingError < -Math.PI) headingError += Math.PI * 2;
  headingError += Math.sin(racer.skillNoise) * skill.noise;

  const steer = Math.max(-1, Math.min(1, headingError * 2.6));

  // Recovery: a rival wedged against a barrier reverses out and realigns rather
  // than sitting there for the rest of the race. The threshold is an absolute
  // crawl, not a fraction of the target speed — tying it to the target made
  // legitimately slow hairpins trigger a reverse, which slowed the racer
  // further and fed back on itself.
  if (Math.abs(racer.speed) < 0.35) racer.stuckTimer += dt;
  else racer.stuckTimer = 0;
  if (racer.reverseTimer > 0) {
    racer.reverseTimer -= dt;
    // Steering inverts under reverse thrust, so flip it to point back on line.
    return { throttle: 0, brake: 1, steer: -steer, drift: false };
  }
  if (racer.stuckTimer > 1.2) {
    racer.stuckTimer = 0;
    racer.reverseTimer = 1.1;
    return { throttle: 0, brake: 1, steer: -steer, drift: false };
  }

  // Speed target: the tightest limit between here and the braking horizon.
  const horizon = sampleAhead(geometry, racer.trackIndex, lookDistance * 1.6);
  const limit = Math.min(target.speedLimit, horizon.speedLimit, racer.config.topSpeed);
  let desired = limit * skill.pace;
  if (racer.mistakeTimer > 0) desired *= 0.72;
  if (racer.offTrack) desired *= 0.6;

  const throttle = racer.speed < desired ? 1 : 0;
  const brake = racer.speed > desired * 1.12 ? 1 : 0;
  const drift =
    state.rivalSkill === 'LEGEND' &&
    Math.abs(headingError) > 0.34 &&
    Math.abs(racer.speed) > racer.config.topSpeed * 0.55;

  return { throttle, brake, steer, drift };
}

/** Bias toward the inside of the upcoming corner, leaving room for lane offsets. */
function racingLineOffset(sample: TrackSample, halfWidth: number): number {
  const bias = Math.max(-1, Math.min(1, sample.curvature * 520));
  return bias * halfWidth * 0.45;
}
