import { lazy, Suspense, useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle, Loader2 } from 'lucide-react';
import {
  GameView,
  type CarConfig,
  type GameSessionStats,
  type RaceSettings,
  type TrackData,
} from './types';
import { CARS, TRACKS } from './constants';
import { clearRecords, loadPrefs, loadRecords, savePrefs, type Prefs, type RecordBook } from './game/storage';
import { ErrorBoundary, isWebGLAvailable } from './components/ErrorBoundary';
import { Menu } from './components/Menu';

/**
 * The race view pulls in three.js (~790 kB) and the results view pulls in
 * recharts (~500 kB). Neither is needed to show the menu, but both used to be
 * module-preloaded, so a phone downloaded roughly 325 kB gzipped before it
 * could render a single button. Splitting them out and warming the race chunk
 * while the player is still choosing a circuit gets the best of both.
 */
const Race = lazy(() => import('./components/Race').then((m) => ({ default: m.Race })));
const Results = lazy(() => import('./components/Results').then((m) => ({ default: m.Results })));

const prefetchRace = () => import('./components/Race');
const prefetchResults = () => import('./components/Results');

function LoadingScreen({ label }: { label: string }) {
  return (
    <div className="flex h-full flex-col items-center justify-center gap-4 bg-slate-950">
      <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
      <p className="font-display text-sm uppercase tracking-widest text-slate-400">{label}</p>
    </div>
  );
}

/**
 * Runs a low-priority task once the browser is idle. The `timeout` matters:
 * without it an idle period may never arrive — a backgrounded tab never gets
 * one — and the prefetch would simply never run.
 */
function whenIdle(task: () => void): () => void {
  const idle = (
    window as Window & {
      requestIdleCallback?: (cb: () => void, options?: { timeout: number }) => number;
    }
  ).requestIdleCallback;

  if (idle) {
    const handle = idle(task, { timeout: 2500 });
    const cancel = (window as Window & { cancelIdleCallback?: (id: number) => void })
      .cancelIdleCallback;
    return () => cancel?.(handle);
  }
  const timer = window.setTimeout(task, 600);
  return () => window.clearTimeout(timer);
}

export default function App() {
  const [prefs, setPrefs] = useState<Prefs>(() => loadPrefs());
  const [records, setRecords] = useState<RecordBook>(() => loadRecords());
  const [view, setView] = useState<GameView>(GameView.MENU);
  const [track, setTrack] = useState<TrackData>(TRACKS[0]);
  const [car, setCar] = useState<CarConfig>(CARS[0]);
  const [stats, setStats] = useState<GameSessionStats | null>(null);

  const webglOk = useMemo(() => isWebGLAvailable(), []);

  useEffect(() => {
    savePrefs(prefs);
  }, [prefs]);

  // Warm the race chunk while the player is reading the menu, so pressing
  // START ENGINES does not stall on a download.
  useEffect(() => {
    if (view !== GameView.MENU || !webglOk) return;
    return whenIdle(() => {
      void prefetchRace();
    });
  }, [view, webglOk]);

  // The results screen is not needed until a race ends, so it waits its turn.
  useEffect(() => {
    if (view !== GameView.RACE) return;
    return whenIdle(() => {
      void prefetchResults();
    });
  }, [view]);

  const update = useCallback((patch: Partial<Prefs>) => {
    setPrefs((current) => ({ ...current, ...patch }));
  }, []);

  const handleRaceEnd = useCallback((result: GameSessionStats) => {
    setStats(result);
    setView(GameView.ANALYSIS);
  }, []);

  const backToMenu = useCallback(() => {
    // Records may have been beaten during the session just finished.
    setRecords(loadRecords());
    setView(GameView.MENU);
  }, []);

  const handleClearRecords = useCallback(() => {
    clearRecords();
    setRecords(loadRecords());
  }, []);

  if (!webglOk) {
    return (
      <div className="flex h-full items-center justify-center bg-slate-950 p-6">
        <div className="max-w-md rounded-2xl border border-amber-500/40 bg-amber-950/20 p-8 text-center">
          <AlertTriangle className="mx-auto mb-4 h-10 w-10 text-amber-400" />
          <h1 className="font-display text-2xl font-bold text-white">WebGL unavailable</h1>
          <p className="mt-3 text-slate-300">
            Podracer renders in 3D and needs WebGL. Enable hardware acceleration in your browser
            settings, or try a different browser.
          </p>
        </div>
      </div>
    );
  }

  if (view === GameView.RACE) {
    return (
      <ErrorBoundary onReset={backToMenu}>
        <Suspense fallback={<LoadingScreen label="Spooling up engines" />}>
          <Race
            track={track}
            car={car}
            settings={prefs.settings}
            quality={prefs.quality}
            muted={prefs.muted}
            cameraMode={prefs.camera}
            personalBest={records[track.id]?.bestLap ?? null}
            onCameraChange={(camera) => update({ camera })}
            onMuteChange={(muted) => update({ muted })}
            onRaceEnd={handleRaceEnd}
            onExit={backToMenu}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  if (view === GameView.ANALYSIS && stats) {
    return (
      <ErrorBoundary onReset={backToMenu}>
        <Suspense fallback={<LoadingScreen label="Reading telemetry" />}>
          <Results
            stats={stats}
            onRaceAgain={() => {
              setRecords(loadRecords());
              setView(GameView.RACE);
            }}
            onExit={backToMenu}
          />
        </Suspense>
      </ErrorBoundary>
    );
  }

  return (
    <ErrorBoundary>
      <Menu
        selectedTrack={track}
        selectedCar={car}
        settings={prefs.settings}
        quality={prefs.quality}
        records={records}
        onSelectTrack={setTrack}
        onSelectCar={setCar}
        onSettingsChange={(settings: RaceSettings) => update({ settings })}
        onQualityChange={(quality) => update({ quality })}
        onClearRecords={handleClearRecords}
        onStart={() => setView(GameView.RACE)}
      />
    </ErrorBoundary>
  );
}
