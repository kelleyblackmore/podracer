import type { GameSessionStats } from '../types';
import { deriveStats, localAnalysis } from './analysis';

/**
 * Overridable in the UI. Defaults to the id the installed SDK documents, so a
 * fresh key works out of the box; any newer model can be typed in instead.
 */
export const DEFAULT_MODEL_ID = 'gemini-2.0-flash';

export type AnalysisSource = 'gemini' | 'local';

export interface AnalysisResult {
  text: string;
  source: AnalysisSource;
  /** Set when Gemini was attempted and failed; the local report is used instead. */
  warning?: string;
}

function buildPrompt(stats: GameSessionStats): string {
  const derived = deriveStats(stats);
  return `You are a Formula-1-style race engineer debriefing a driver over the radio after a pod race.

SESSION
- Circuit: ${stats.trackName}
- Pod: ${stats.carName}
- Result: ${stats.finished ? `finished P${stats.finishPosition} of ${stats.fieldSize}` : 'retired early'}
- Laps completed: ${derived.lapCount} of ${stats.totalLaps}
- Best lap: ${derived.bestLap !== null ? derived.bestLap.toFixed(2) + 's' : 'none'}
- Average lap: ${derived.averageLap !== null ? derived.averageLap.toFixed(2) + 's' : 'none'}
- Lap-time spread: ${derived.spread.toFixed(2)}s
- Barrier hits: ${derived.totalCollisions}
- Time off track: ${derived.totalOffTrack.toFixed(1)}s
- Peak speed: ${derived.topSpeed} MPH

LAP BY LAP
${JSON.stringify(
  stats.telemetry.map((lap) => ({
    lap: lap.lapNumber,
    time: Number(lap.time.toFixed(2)),
    avgMph: lap.averageSpeed,
    maxMph: lap.maxSpeed,
    hits: lap.collisions,
    offTrackSeconds: lap.offTrackCount,
  })),
)}

Write the debrief. Requirements:
1. Open with a one-line verdict on the session.
2. Assess pace and consistency using the actual numbers above.
3. Assess discipline (barrier hits, time off track).
4. Finish with exactly three numbered, specific, actionable coaching points.
Be direct and encouraging, the way a real engineer talks. Under 220 words. Plain text with short **bold** headings, no markdown headers.`;
}

/**
 * Asks Gemini for a debrief when the player has supplied their own API key,
 * and falls back to the offline analyser on any failure. The key is never
 * bundled: this is a public static site, so it lives only in the player's
 * browser and is sent straight to Google from there.
 */
export async function analyzeRacePerformance(
  stats: GameSessionStats,
  apiKey: string,
  model: string = DEFAULT_MODEL_ID,
): Promise<AnalysisResult> {
  if (!apiKey.trim()) {
    return { text: localAnalysis(stats), source: 'local' };
  }

  try {
    // Loaded on demand so the SDK never lands in the initial bundle.
    const { GoogleGenAI } = await import('@google/genai');
    const ai = new GoogleGenAI({ apiKey: apiKey.trim() });
    const response = await ai.models.generateContent({
      model: model.trim() || DEFAULT_MODEL_ID,
      contents: buildPrompt(stats),
    });
    const text = response.text?.trim();
    if (!text) throw new Error('Empty response');
    return { text, source: 'gemini' };
  } catch (error) {
    console.warn('Gemini analysis unavailable, using offline engineer:', error);
    return {
      text: localAnalysis(stats),
      source: 'local',
      warning: error instanceof Error ? error.message : 'Request failed',
    };
  }
}
