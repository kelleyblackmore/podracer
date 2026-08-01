import type { CameraMode, RaceSettings, RecordEntry } from '../types';

const RECORDS_KEY = 'podracer.records.v1';
const PREFS_KEY = 'podracer.prefs.v1';
const API_KEY = 'podracer.geminiKey.v1';
const MODEL_KEY = 'podracer.geminiModel.v1';

export interface Prefs {
  muted: boolean;
  camera: CameraMode;
  quality: 'low' | 'high';
  settings: RaceSettings;
}

export const DEFAULT_PREFS: Prefs = {
  muted: false,
  camera: 'CHASE',
  quality: 'high',
  settings: { laps: 3, rivalSkill: 'ROOKIE' },
};

/** localStorage throws in private mode / sandboxed frames, so every access is guarded. */
function read<T>(key: string, fallback: T): T {
  try {
    const raw = localStorage.getItem(key);
    if (!raw) return fallback;
    return { ...fallback, ...(JSON.parse(raw) as T) };
  } catch {
    return fallback;
  }
}

function write(key: string, value: unknown): void {
  try {
    localStorage.setItem(key, JSON.stringify(value));
  } catch {
    /* storage unavailable — records just won't persist */
  }
}

export function loadPrefs(): Prefs {
  const prefs = read<Prefs>(PREFS_KEY, DEFAULT_PREFS);
  return { ...prefs, settings: { ...DEFAULT_PREFS.settings, ...prefs.settings } };
}

export function savePrefs(prefs: Prefs): void {
  write(PREFS_KEY, prefs);
}

export type RecordBook = Record<string, RecordEntry>;

export function loadRecords(): RecordBook {
  return read<RecordBook>(RECORDS_KEY, {});
}

/**
 * Stores a personal best per track. Returns the flags the results screen needs
 * so it can call out a new record.
 */
export function submitRecord(
  trackId: string,
  carId: string,
  bestLap: number | null,
  raceTime: number | null,
): { lapRecord: boolean; raceRecord: boolean } {
  const records = loadRecords();
  const existing = records[trackId];
  const lapRecord = bestLap !== null && (!existing || bestLap < existing.bestLap);
  const raceRecord =
    raceTime !== null && (!existing || existing.bestRace === null || raceTime < existing.bestRace);

  if (!lapRecord && !raceRecord) return { lapRecord: false, raceRecord: false };

  records[trackId] = {
    bestLap: lapRecord ? (bestLap as number) : (existing?.bestLap ?? Infinity),
    bestRace: raceRecord ? raceTime : (existing?.bestRace ?? null),
    carId,
    updatedAt: new Date().toISOString(),
  };
  write(RECORDS_KEY, records);
  return { lapRecord, raceRecord };
}

export function clearRecords(): void {
  try {
    localStorage.removeItem(RECORDS_KEY);
  } catch {
    /* nothing to clear */
  }
}

/**
 * The Gemini key is supplied by the player at runtime and kept only in their
 * own browser. It is deliberately never bundled — this is a public static site.
 */
export function loadApiKey(): string {
  try {
    return localStorage.getItem(API_KEY) ?? '';
  } catch {
    return '';
  }
}

export function saveApiKey(key: string): void {
  try {
    if (key) localStorage.setItem(API_KEY, key);
    else localStorage.removeItem(API_KEY);
  } catch {
    /* storage unavailable */
  }
}

export function loadModelId(fallback: string): string {
  try {
    return localStorage.getItem(MODEL_KEY) || fallback;
  } catch {
    return fallback;
  }
}

export function saveModelId(model: string): void {
  try {
    if (model) localStorage.setItem(MODEL_KEY, model);
    else localStorage.removeItem(MODEL_KEY);
  } catch {
    /* storage unavailable */
  }
}
