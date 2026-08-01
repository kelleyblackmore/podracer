import type { GameSessionStats, LapTelemetry } from '../types';

export interface DerivedStats {
  lapCount: number;
  bestLap: number | null;
  averageLap: number | null;
  /** Standard deviation of lap times, in seconds. */
  spread: number;
  /** 0..100, where 100 means every lap was identical. */
  consistency: number;
  totalCollisions: number;
  totalOffTrack: number;
  topSpeed: number;
  /** Positive means the driver got quicker over the session. */
  improvement: number;
}

export function deriveStats(stats: GameSessionStats): DerivedStats {
  const laps = stats.telemetry;
  const times = laps.map((lap) => lap.time);
  const lapCount = laps.length;

  const bestLap = times.length ? Math.min(...times) : null;
  const averageLap = times.length ? times.reduce((a, b) => a + b, 0) / times.length : null;

  let spread = 0;
  if (averageLap !== null && times.length > 1) {
    const variance = times.reduce((sum, t) => sum + (t - averageLap) ** 2, 0) / times.length;
    spread = Math.sqrt(variance);
  }

  // A 1% spread relative to the average lap is treated as perfect consistency.
  const consistency =
    averageLap && times.length > 1
      ? Math.max(0, Math.min(100, Math.round(100 - (spread / averageLap) * 100 * 4)))
      : 0;

  const improvement = times.length > 1 ? times[0] - times[times.length - 1] : 0;

  return {
    lapCount,
    bestLap,
    averageLap,
    spread,
    consistency,
    totalCollisions: laps.reduce((sum, lap) => sum + lap.collisions, 0),
    totalOffTrack: laps.reduce((sum, lap) => sum + lap.offTrackCount, 0),
    topSpeed: laps.reduce((max, lap) => Math.max(max, lap.maxSpeed), 0),
    improvement,
  };
}

function worstLap(laps: LapTelemetry[]): LapTelemetry | null {
  if (!laps.length) return null;
  return laps.reduce((worst, lap) => (lap.time > worst.time ? lap : worst));
}

/**
 * The offline Crew Chief. Produces the same shape of debrief as the Gemini path
 * so the feature works with no API key, no network and no cost — which is what
 * a public GitHub Pages build gets by default.
 */
export function localAnalysis(stats: GameSessionStats): string {
  const derived = deriveStats(stats);
  const lines: string[] = [];

  const result = stats.finished
    ? `P${stats.finishPosition} of ${stats.fieldSize}`
    : 'session ended early';
  lines.push(
    `Good run — ${result} at ${stats.trackName} in the ${stats.carName}. Here's what the data says.`,
  );

  if (derived.lapCount === 0) {
    lines.push(
      '\nYou did not complete a full lap, so there is nothing to compare yet. Get one clean lap in and I can start giving you real numbers.',
    );
    return lines.join('\n');
  }

  lines.push('\n**Pace**');
  if (derived.bestLap !== null && derived.averageLap !== null) {
    const gap = derived.averageLap - derived.bestLap;
    lines.push(
      `Best lap ${derived.bestLap.toFixed(2)}s, average ${derived.averageLap.toFixed(2)}s. ` +
        (gap < 0.5
          ? 'You are repeating your best lap almost every time out — that is genuinely hard to do.'
          : `You are leaving ${gap.toFixed(2)}s per lap on the table versus your own best. The speed is clearly there; the repeatability is not yet.`),
    );
  }
  if (derived.lapCount > 1) {
    lines.push(
      derived.improvement > 0.3
        ? `You got ${derived.improvement.toFixed(2)}s quicker from first lap to last. Keep building like that.`
        : derived.improvement < -0.3
          ? `You dropped ${Math.abs(derived.improvement).toFixed(2)}s from first lap to last — concentration or overheating the entries late in the run.`
          : 'Your first and last laps are within a couple of tenths. Very steady.',
    );
  }

  lines.push('\n**Consistency**');
  lines.push(
    derived.consistency >= 80
      ? `${derived.consistency}%. Metronomic. Your lap-to-lap spread is only ${derived.spread.toFixed(2)}s.`
      : derived.consistency >= 50
        ? `${derived.consistency}%. Respectable, but a ${derived.spread.toFixed(2)}s spread means one or two corners are still a lottery.`
        : `${derived.consistency}%. A ${derived.spread.toFixed(2)}s spread is the single biggest thing costing you time — more than outright pace.`,
  );

  lines.push('\n**Discipline**');
  if (derived.totalCollisions === 0 && derived.totalOffTrack < 1) {
    lines.push('Zero barrier contact and effectively no time off the racing surface. Clean drive.');
  } else {
    const parts: string[] = [];
    if (derived.totalCollisions > 0) {
      parts.push(
        `${derived.totalCollisions} barrier hit${derived.totalCollisions === 1 ? '' : 's'}`,
      );
    }
    if (derived.totalOffTrack >= 1) parts.push(`${derived.totalOffTrack.toFixed(1)}s off track`);
    lines.push(
      `${parts.join(' and ')}. Every barrier hit costs you roughly half your speed and half a second of recovery.`,
    );
  }

  lines.push('\n**Three things to work on**');
  const tips: string[] = [];

  if (derived.totalCollisions >= 2) {
    tips.push(
      'Brake in a straight line *before* turn-in. You are carrying entry speed into the corner and running out of road at the exit.',
    );
  }
  if (derived.consistency < 70 && derived.lapCount > 1) {
    const slowest = worstLap(stats.telemetry);
    if (slowest) {
      tips.push(
        `Lap ${slowest.lapNumber} was your weakest at ${slowest.time.toFixed(2)}s. Pick one reference braking marker per corner and hit it every lap — consistency comes from references, not feel.`,
      );
    }
  }
  if (derived.totalOffTrack >= 2) {
    tips.push(
      'You are running wide on exits. Slow the hands down and unwind the steering as you get back on the throttle.',
    );
  }
  // Generic coaching, always long enough to keep the heading's promise of three.
  tips.push(
    'Chain your drifts: start the drift earlier, hold it through the apex and release on the exit so the boost fires down the following straight rather than into the next braking zone.',
  );
  tips.push(
    `Your peak was ${derived.topSpeed} MPH. If that number is not climbing lap on lap, you are not getting the boost out onto the longest straight.`,
  );
  tips.push(
    'Sacrifice a corner to gain the one after it. Give up a little entry speed into a slow turn so you can get on the throttle earlier onto the straight that follows.',
  );
  tips.push(
    'Look further ahead than feels natural. Aiming at the exit of the corner rather than the apex smooths your steering and costs less speed.',
  );

  lines.push(
    tips
      .slice(0, 3)
      .map((tip, i) => `${i + 1}. ${tip}`)
      .join('\n'),
  );

  return lines.join('\n');
}
