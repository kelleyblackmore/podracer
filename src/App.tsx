import { useCallback, useEffect, useMemo, useState } from 'react';
import { AlertTriangle } from 'lucide-react';
import { GameView, type CarConfig, type GameSessionStats, type RaceSettings, type TrackData } from './types';
import { CARS, TRACKS } from './constants';
import { loadPrefs, loadRecords, savePrefs, type Prefs, type RecordBook } from './game/storage';
import { ErrorBoundary, isWebGLAvailable } from './components/ErrorBoundary';
import { Menu } from './components/Menu';
import { Race } from './components/Race';
import { Results } from './components/Results';

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
      </ErrorBoundary>
    );
  }

  if (view === GameView.ANALYSIS && stats) {
    return (
      <ErrorBoundary onReset={backToMenu}>
        <Results
          stats={stats}
          onRaceAgain={() => {
            setRecords(loadRecords());
            setView(GameView.RACE);
          }}
          onExit={backToMenu}
        />
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
        onStart={() => setView(GameView.RACE)}
      />
    </ErrorBoundary>
  );
}
