import { describe, expect, it } from 'vitest';
import { CARS } from '../constants';
import { offsetPoint, RUNOFF_WIDTH } from './track';
import {
  advance,
  findRampLip,
  geometryFor,
  placeOnTrack,
  startRace,
  trackById,
} from './testSupport';
import { SPEED_TO_MPH } from './engine';

describe('the grid', () => {
  it('lines up behind the start line so nobody crosses it early', () => {
    const race = startRace(trackById('mos-espa'));
    for (const racer of race.racers) {
      // Lap -1 is the approach lap: the first crossing starts the race.
      expect(racer.lap).toBe(-1);
      expect(racer.totalProgress).toBeLessThan(0);
      expect(racer.speed).toBe(0);
    }
  });

  it('sorts grid slots ahead of nobody and behind everybody racing', () => {
    const race = startRace(trackById('mos-espa'));
    const positions = race.racers.map((racer) => racer.position).sort((a, b) => a - b);
    expect(positions).toEqual(race.racers.map((_, i) => i + 1));
  });

  it('holds everyone still through the countdown, then releases them', () => {
    const race = startRace(trackById('mos-espa'));
    expect(race.phase).toBe('COUNTDOWN');

    advance(race, 3, { throttle: 1 });
    expect(race.phase).toBe('COUNTDOWN');
    expect(Math.abs(race.player.speed)).toBe(0);

    advance(race, 1);
    expect(race.phase).toBe('RACING');
  });
});

describe('drift and boost', () => {
  it('charges while drifting and fires a boost on release', () => {
    const race = startRace(trackById('coliseum'));
    advance(race, 4); // clear the countdown
    // Start of the long straight, at pace, with the field moved away.
    placeOnTrack(race, 10, 0.9);

    // Enough steering to count as a turn (>0.15) but not so much that the pod
    // slides across the road and into the barrier before the boost lands.
    advance(race, 0.9, { throttle: 1, steer: 0.35, drift: true });

    expect(race.player.drifting).toBe(true);
    // DRIFT_CHARGE_RATE is 34/second, and DRIFT_MIN_CHARGE is 28.
    expect(race.player.driftCharge).toBeGreaterThan(28);
    expect(race.player.boostTimer).toBe(0);

    const beforeRelease = race.player.speed;
    advance(race, 1 / 60, { throttle: 1 });

    expect(race.player.drifting).toBe(false);
    expect(race.player.driftCharge).toBe(0);
    expect(race.player.boostTimer).toBeGreaterThan(0);

    // The boost lifts the pod past its own top speed.
    advance(race, 0.4, { throttle: 1 });
    expect(race.player.offTrack).toBe(false);
    expect(race.player.speed).toBeGreaterThan(beforeRelease);
    expect(race.player.speed).toBeGreaterThan(race.player.config.topSpeed);
  });

  it('does not charge below the minimum drift speed', () => {
    const race = startRace(trackById('mos-espa'), { autopilot: false });
    advance(race, 4);
    advance(race, 0.2, { throttle: 1, steer: 1, drift: true });

    // Self-check: the pod really is still under the 30%-of-top-speed gate.
    expect(Math.abs(race.player.speed)).toBeLessThan(race.player.config.topSpeed * 0.3);
    expect(race.player.driftCharge).toBe(0);
    expect(race.player.drifting).toBe(false);
  });
});

describe('barriers', () => {
  it('clamps a pod at the barrier instead of letting it through', () => {
    const track = trackById('mos-espa');
    const geometry = geometryFor(track);
    const race = startRace(track, { autopilot: false });
    advance(race, 4);

    // Point the pod straight at the outside wall and pin the throttle.
    const sample = geometry.samples[100];
    const spot = offsetPoint(sample, 0);
    race.player.x = spot.x;
    race.player.z = spot.z;
    race.player.trackIndex = 100;
    race.player.angle = Math.atan2(sample.nz, sample.nx);
    advance(race, 6, { throttle: 1 });

    const barrier = geometry.halfWidth + RUNOFF_WIDTH;
    expect(Math.abs(race.player.lateral)).toBeLessThanOrEqual(barrier + 1);
    expect(race.player.offTrack).toBe(true);
  });

  /**
   * Regression, part one: a pod could get beached because the wall scrub drove
   * its speed below the threshold that gated steering, and steering was the only
   * way out. Repulsors can yaw the pod on the spot, so a standstill must still
   * respond to the wheel.
   */
  it('can yaw on the spot at a standstill', () => {
    const race = startRace(trackById('mos-espa'), { autopilot: false });
    advance(race, 4);

    // Isolate from the pack: a nudge from a rival imparts spin, which rotates
    // the pod independently of steering and would mask the thing under test.
    for (const rival of race.racers.filter((racer) => !racer.isPlayer)) {
      rival.x += 50_000;
      rival.z += 50_000;
    }
    race.player.speed = 0;
    race.player.vx = 0;
    race.player.vz = 0;
    race.player.spin = 0;

    const angleBefore = race.player.angle;
    advance(race, 1, { steer: 1 });

    expect(race.player.spin).toBe(0);
    expect(Math.abs(race.player.angle - angleBefore)).toBeGreaterThan(0.05);
  });

  /**
   * Regression, part two: the barrier penalty was a flat multiplier applied every
   * frame of contact, so grinding along a wall was as costly as a head-on crash
   * and drove speed to zero. It must scale with how hard the hit actually was.
   */
  it('does not scrub a wall-grinding pod down to a standstill', () => {
    const track = trackById('mos-espa');
    const geometry = geometryFor(track);
    const race = startRace(track, { autopilot: false });
    advance(race, 4);

    const sample = geometry.samples[100];
    const spot = offsetPoint(sample, 0);
    race.player.x = spot.x;
    race.player.z = spot.z;
    race.player.trackIndex = 100;
    race.player.angle = Math.atan2(sample.nz, sample.nx);
    advance(race, 6, { throttle: 1 });

    const barrier = geometry.halfWidth + RUNOFF_WIDTH;
    expect(Math.abs(race.player.lateral)).toBeGreaterThan(barrier - 2);
    // Still crawling under power rather than welded to the wall.
    expect(Math.abs(race.player.speed)).toBeGreaterThan(0.3);
  });

  it('can reverse away from the wall it is stuck on', () => {
    const track = trackById('mos-espa');
    const geometry = geometryFor(track);
    const race = startRace(track, { autopilot: false });
    advance(race, 4);

    const sample = geometry.samples[100];
    const spot = offsetPoint(sample, 0);
    race.player.x = spot.x;
    race.player.z = spot.z;
    race.player.trackIndex = 100;
    race.player.angle = Math.atan2(sample.nz, sample.nx);
    advance(race, 6, { throttle: 1 });

    const lateralWhenStuck = Math.abs(race.player.lateral);
    advance(race, 2.5, { brake: 1 });
    expect(Math.abs(race.player.lateral)).toBeLessThan(lateralWhenStuck - 5);
  });
});

describe('jumps', () => {
  it('launches off a ramp lip and lands again', () => {
    const track = trackById('oovo-iv');
    const race = startRace(track, { autopilot: true, laps: 1 });
    advance(race, 4);

    let sawTakeoff = false;
    let sawLanding = false;
    let peakHop = 0;
    let hopAtLanding = -1;

    for (let i = 0; i < 60 * 90 && !sawLanding; i++) {
      const events = advance(race, 1 / 60);
      for (const event of events) {
        // Only the player's own jump counts; a rival's would pass regardless.
        if (event.type === 'takeoff' && event.racerId === race.player.id) sawTakeoff = true;
        if (event.type === 'land' && event.racerId === race.player.id && sawTakeoff) {
          sawLanding = true;
          hopAtLanding = race.player.hop;
        }
      }
      if (sawTakeoff && !sawLanding) peakHop = Math.max(peakHop, race.player.hop);
    }

    expect(sawTakeoff).toBe(true);
    expect(sawLanding).toBe(true);
    expect(peakHop).toBeGreaterThan(20);
    // Back on the deck the instant the landing is reported.
    expect(hopAtLanding).toBe(0);
  });

  /**
   * Regression: launch strength was once derived from `rampSlope`, a finite
   * difference across the lip. Sample spacing scales with circuit length, so
   * the same ramp threw a pod much higher on a short track than a long one.
   *
   * Both pods are driven over their lip at the same fraction of top speed, so
   * the only thing left that can differ is the lip height.
   */
  it('launches to a height set by the lip, not by circuit length', () => {
    const peakFor = (id: string) => {
      const track = trackById(id);
      const geometry = geometryFor(track);
      const race = startRace(track, { laps: 1 });
      advance(race, 4);

      const lip = findRampLip(geometry);
      expect(lip).toBeGreaterThan(-1);
      // Line up a little before the lip so the pod arrives at a settled speed.
      const runUp = Math.round(300 / geometry.spacing);
      placeOnTrack(race, (lip - runUp + geometry.samples.length) % geometry.samples.length, 0.95);

      let peak = 0;
      for (let i = 0; i < 60 * 12; i++) {
        advance(race, 1 / 60, { throttle: 1 });
        peak = Math.max(peak, race.player.hop);
      }
      return { peak, lip: geometry.samples[lip].rampLip, length: geometry.length };
    };

    const short = peakFor('mos-espa');
    const long = peakFor('skyway');

    // The circuits differ in length by roughly 2x — that must not matter.
    expect(long.length / short.length).toBeGreaterThan(1.5);
    expect(short.peak).toBeGreaterThan(10);
    expect(long.peak).toBeGreaterThan(10);

    const peakRatio = long.peak / short.peak;
    const lipRatio = long.lip / short.lip;
    expect(peakRatio).toBeGreaterThan(lipRatio * 0.75);
    expect(peakRatio).toBeLessThan(lipRatio * 1.35);
  });

  /**
   * Regression: the reported "it jumps after the ramp". Flight height was an
   * offset from the road directly below, and the road fell away by the full
   * ramp height at the lip — so the pod's rendered height plunged ~49 units in
   * a single frame at take-off and then climbed back out. Height is now an
   * absolute world value, so the arc cannot be broken by the ground beneath it.
   */
  it('keeps the pod height continuous across the lip', () => {
    const track = trackById('oovo-iv');
    const geometry = geometryFor(track);
    const race = startRace(track, { laps: 1 });
    advance(race, 4);

    const lip = findRampLip(geometry);
    const runUp = Math.round(300 / geometry.spacing);
    placeOnTrack(race, (lip - runUp + geometry.samples.length) % geometry.samples.length, 0.95);

    const heights: number[] = [race.player.altitude];
    let launched = false;
    for (let i = 0; i < 60 * 6; i++) {
      advance(race, 1 / 60, { throttle: 1 });
      heights.push(race.player.altitude);
      if (race.player.airborne) launched = true;
      if (launched && !race.player.airborne) break;
    }

    expect(launched).toBe(true);

    let worstStep = 0;
    for (let i = 1; i < heights.length; i++) {
      worstStep = Math.max(worstStep, Math.abs(heights[i] - heights[i - 1]));
    }

    // At 60 Hz even a fast pod moves only a few units of height per frame; the
    // old discontinuity was roughly 49.
    expect(worstStep).toBeLessThan(12);
  });

  it('flies further the faster it hits the lip', () => {
    const peakAt = (fraction: number) => {
      const track = trackById('oovo-iv');
      const geometry = geometryFor(track);
      const race = startRace(track, { laps: 1 });
      advance(race, 4);
      const lip = findRampLip(geometry);
      const runUp = Math.round(240 / geometry.spacing);
      placeOnTrack(race, (lip - runUp + geometry.samples.length) % geometry.samples.length, fraction);
      let peak = 0;
      for (let i = 0; i < 60 * 10; i++) {
        // No throttle: hold the arrival speed we set rather than accelerating.
        advance(race, 1 / 60);
        peak = Math.max(peak, race.player.hop);
      }
      return peak;
    };

    expect(peakAt(0.95)).toBeGreaterThan(peakAt(0.5) * 1.2);
  });
});

describe('slipstream', () => {
  it('tows a pod sitting in line behind another', () => {
    const track = trackById('coliseum');
    const geometry = geometryFor(track);
    const race = startRace(track, { autopilot: false });
    advance(race, 4);

    const leader = race.racers[1];
    const sample = geometry.samples[40];
    const ahead = geometry.samples[46];

    // Park the player directly behind the leader, both pointed down the road.
    const angle = Math.atan2(sample.tz, sample.tx);
    race.player.x = sample.x;
    race.player.z = sample.z;
    race.player.angle = angle;
    race.player.trackIndex = 40;
    leader.x = ahead.x;
    leader.z = ahead.z;
    leader.angle = angle;
    leader.trackIndex = 46;

    // Matched pace, otherwise the leader simply drives out of the tow.
    const pace = race.player.config.topSpeed * 0.8;
    race.player.speed = pace;
    race.player.vx = Math.cos(angle) * pace;
    race.player.vz = Math.sin(angle) * pace;
    leader.speed = pace;
    leader.vx = Math.cos(angle) * pace;
    leader.vz = Math.sin(angle) * pace;

    const gap = Math.hypot(leader.x - race.player.x, leader.z - race.player.z);
    expect(gap).toBeLessThan(260); // inside SLIP_RANGE

    advance(race, 0.5, { throttle: 1 });
    expect(race.player.slipstream).toBeGreaterThan(0.2);
  });

  it('gives no tow to a pod out on its own', () => {
    const race = startRace(trackById('coliseum'), { autopilot: true });
    advance(race, 4);
    // Send every rival far away.
    for (const rival of race.racers.filter((racer) => !racer.isPlayer)) {
      rival.x += 20000;
      rival.z += 20000;
    }
    advance(race, 2);
    expect(race.player.slipstream).toBeLessThan(0.05);
  });
});

describe('contact', () => {
  /**
   * Clears the field down to the player and one rival. Without this the rest of
   * the pack is still bunched up near the grid and generates contacts of its
   * own, which any assertion about "the player collided" will happily pick up.
   */
  function isolatePair(race: ReturnType<typeof startRace>) {
    const rivals = race.racers.filter((racer) => !racer.isPlayer);
    const partner = rivals[0];
    for (const other of rivals.slice(1)) {
      other.x += 50_000;
      other.z += 50_000;
      other.vx = 0;
      other.vz = 0;
      other.speed = 0;
    }
    return partner;
  }

  const playerContacts = (events: ReturnType<typeof advance>, playerId: string) =>
    events.filter(
      (event) =>
        event.type === 'contact' && (event.racerId === playerId || event.otherId === playerId),
    );

  it('separates overlapping pods and raises a contact event', () => {
    const race = startRace(trackById('coliseum'), { autopilot: false });
    advance(race, 4);
    const partner = isolatePair(race);

    // Overlapping and closing. Velocities are units/tick, so these are realistic
    // racing speeds — anything wilder simply tunnels straight through.
    partner.x = race.player.x + 30;
    partner.z = race.player.z;
    partner.angle = race.player.angle;
    partner.vx = -4;
    race.player.vx = 4;

    const events = advance(race, 0.3);
    const separation = Math.hypot(partner.x - race.player.x, partner.z - race.player.z);

    expect(separation).toBeGreaterThan(40);
    expect(playerContacts(events, race.player.id).length).toBeGreaterThan(0);
  });

  it('knocks the nose off line on a side-on hit', () => {
    const race = startRace(trackById('coliseum'), { autopilot: false });
    advance(race, 4);
    const partner = isolatePair(race);

    // Alongside, moving sideways into the player.
    const right = race.player.angle + Math.PI / 2;
    partner.x = race.player.x + Math.cos(right) * 30;
    partner.z = race.player.z + Math.sin(right) * 30;
    partner.angle = race.player.angle;
    partner.vx = -Math.cos(right) * 4;
    partner.vz = -Math.sin(right) * 4;

    advance(race, 0.3);
    expect(Math.abs(race.player.spin)).toBeGreaterThan(0);
  });

  it('lets pods at very different heights pass over one another', () => {
    const race = startRace(trackById('coliseum'), { autopilot: false });
    advance(race, 4);
    const partner = isolatePair(race);

    partner.x = race.player.x + 5;
    partner.z = race.player.z;
    partner.vx = 0;
    partner.vz = 0;
    // Height is driven by `altitude`; `hop` is derived from it each step, so
    // setting hop directly would be silently overwritten.
    partner.altitude = race.player.altitude + 120; // sailing over the top
    partner.airborne = true;
    partner.vy = 0;

    const events = advance(race, 0.2);
    expect(playerContacts(events, race.player.id)).toHaveLength(0);
    // Still overlapping in plan view — proof the height check is what spared it.
    expect(Math.hypot(partner.x - race.player.x, partner.z - race.player.z)).toBeLessThan(52);
  });
});

describe('speed reporting', () => {
  it('converts tick speed to the MPH the HUD shows', () => {
    // Guards the HUD bar's hard-coded 570 ceiling against a physics retune.
    const fastest = Math.max(...CARS.map((car) => car.topSpeed));
    expect(fastest * 1.5 * SPEED_TO_MPH).toBeLessThanOrEqual(570);
  });
});
