import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import {
  Flag,
  Gauge,
  Keyboard,
  LogOut,
  Play,
  RotateCcw,
  RefreshCw,
  Smartphone,
  Volume2,
  VolumeX,
} from 'lucide-react';
import type { CameraMode, CarConfig, GameSessionStats, RaceSettings, TrackData } from '../types';
import { CARS } from '../constants';
import {
  createRace,
  NEUTRAL_CONTROLS,
  SPEED_TO_MPH,
  stepRace,
  type Controls,
  type RaceEvent,
  type RaceState,
} from '../game/engine';
import { buildTrackGeometry } from '../game/track';
import { InputManager } from '../game/input';
import { RaceAudio } from '../game/audio';
import { formatTime } from '../game/format';
import { RaceScene } from './RaceScene';
import { Hud, type HudSnapshot } from './Hud';
import { Minimap } from './Minimap';
import { TouchControls, useIsTouchDevice } from './TouchControls';
import { useViewport } from './useViewport';

interface RaceProps {
  track: TrackData;
  car: CarConfig;
  settings: RaceSettings;
  quality: 'low' | 'high';
  muted: boolean;
  cameraMode: CameraMode;
  personalBest: number | null;
  onCameraChange: (mode: CameraMode) => void;
  onMuteChange: (muted: boolean) => void;
  onRaceEnd: (stats: GameSessionStats) => void;
  onExit: () => void;
}

/** HUD refreshes at 12 Hz — fast enough to read, slow enough to stay free. */
const HUD_INTERVAL = 1 / 12;
/** How long the chequered flag stays up before the results screen. */
const FINISH_DWELL = 1.8;

const EMPTY_SNAPSHOT: HudSnapshot = {
  phase: 'COUNTDOWN',
  countdown: 3,
  speed: 0,
  lap: 1,
  totalLaps: 3,
  position: 1,
  fieldSize: 1,
  lapTime: 0,
  lastLap: null,
  bestLap: null,
  personalBest: null,
  driftCharge: 0,
  boosting: false,
  offTrack: false,
  airborne: false,
  airTime: 0,
  slipstream: 0,
  gapAhead: null,
  standings: [],
};

export function Race({
  track,
  car,
  settings,
  quality,
  muted,
  cameraMode,
  personalBest,
  onCameraChange,
  onMuteChange,
  onRaceEnd,
  onExit,
}: RaceProps) {
  const [restartToken, setRestartToken] = useState(0);
  const [paused, setPaused] = useState(false);
  const [snapshot, setSnapshot] = useState<HudSnapshot>(EMPTY_SNAPSHOT);
  const [lapFlash, setLapFlash] = useState<{ time: number; isBest: boolean } | null>(null);
  const [finishing, setFinishing] = useState(false);
  const [contextLost, setContextLost] = useState(false);
  const [canvasKey, setCanvasKey] = useState(0);
  const isTouch = useIsTouchDevice();
  const { compact, portrait } = useViewport();

  const geometry = useMemo(() => buildTrackGeometry(track), [track]);
  const race = useMemo(() => {
    const rivals = CARS.filter((option) => option.id !== car.id);
    return createRace(geometry, car, rivals.length ? rivals : CARS, settings);
  }, [geometry, car, settings, restartToken]);

  const input = useMemo(() => new InputManager(), []);
  const audio = useMemo(() => new RaceAudio(muted), [restartToken]);

  const canvasHost = useRef<HTMLDivElement>(null);
  const hudTimer = useRef(0);
  const finishTimer = useRef<number | null>(null);
  const endedRef = useRef(false);
  const flashTimeout = useRef<number | null>(null);

  // --- Lifecycle ---

  const restart = useCallback(() => {
    endedRef.current = false;
    finishTimer.current = null;
    setFinishing(false);
    setPaused(false);
    setLapFlash(null);
    setSnapshot(EMPTY_SNAPSHOT);
    setRestartToken((token) => token + 1);
  }, []);

  useEffect(() => {
    input.onAction = (action) => {
      switch (action) {
        case 'pause':
          setPaused((value) => !value);
          break;
        case 'camera':
          onCameraChange(
            cameraMode === 'CHASE' ? 'TOPDOWN' : cameraMode === 'TOPDOWN' ? 'COCKPIT' : 'CHASE',
          );
          break;
        case 'restart':
          restart();
          break;
        case 'mute':
          onMuteChange(!muted);
          break;
        default:
          break;
      }
    };
    return input.attach();
  }, [input, cameraMode, muted, onCameraChange, onMuteChange, restart]);

  useEffect(() => {
    audio.start();
    audio.resume();
    // iOS only unlocks an AudioContext inside a user gesture, so the call above
    // leaves it suspended on Safari. Retry on the first touch or key press.
    const unlock = () => audio.resume();
    window.addEventListener('pointerdown', unlock, { passive: true });
    window.addEventListener('keydown', unlock);
    return () => {
      window.removeEventListener('pointerdown', unlock);
      window.removeEventListener('keydown', unlock);
      audio.dispose();
    };
  }, [audio]);

  useEffect(() => {
    audio.setMuted(muted);
  }, [audio, muted]);

  useEffect(() => {
    if (paused) audio.silenceEngine();
  }, [paused, audio]);

  // A backgrounded tab should not keep racing without the player.
  useEffect(() => {
    const onVisibility = () => {
      if (document.hidden) setPaused(true);
    };
    document.addEventListener('visibilitychange', onVisibility);
    return () => document.removeEventListener('visibilitychange', onVisibility);
  }, []);

  useEffect(
    () => () => {
      if (flashTimeout.current) window.clearTimeout(flashTimeout.current);
    },
    [],
  );

  /**
   * Mobile GPUs drop the WebGL context under memory pressure or when the app is
   * backgrounded; without handling it the canvas goes black for good, which is
   * indistinguishable from a crash. The listener is attached to the DOM node
   * rather than from inside <Canvas>, because a component in the R3F tree only
   * mounts once the renderer is healthy — precisely what is not true here.
   */
  useEffect(() => {
    const host = canvasHost.current;
    if (!host) return;
    let canvas: HTMLCanvasElement | null = null;

    const handleLost = (event: Event) => {
      // preventDefault keeps the context restorable.
      event.preventDefault();
      setContextLost(true);
      setPaused(true);
      audio.silenceEngine();
    };

    // The canvas is created by R3F on mount, so poll briefly for it.
    let tries = 0;
    const attach = () => {
      canvas = host.querySelector('canvas');
      if (canvas) {
        canvas.addEventListener('webglcontextlost', handleLost);
      } else if (tries++ < 60) {
        timer = window.setTimeout(attach, 50);
      }
    };
    let timer = window.setTimeout(attach, 0);

    return () => {
      window.clearTimeout(timer);
      canvas?.removeEventListener('webglcontextlost', handleLost);
    };
  }, [audio, canvasKey]);

  /** Remount the Canvas to build a fresh WebGL context. */
  const recoverContext = useCallback(() => {
    setContextLost(false);
    setCanvasKey((key) => key + 1);
  }, []);

  const finish = useCallback(
    (state: RaceState) => {
      if (endedRef.current) return;
      endedRef.current = true;
      const player = state.player;
      onRaceEnd({
        trackId: track.id,
        trackName: track.name,
        carId: car.id,
        carName: car.name,
        totalLaps: state.totalLaps,
        bestLap: player.bestLap,
        totalTime: player.finishTime ?? state.clock,
        finishPosition: player.position,
        fieldSize: state.racers.length,
        finished: player.finished,
        rivalSkill: settings.rivalSkill,
        telemetry: player.telemetry,
        timestamp: new Date().toISOString(),
      });
    },
    [onRaceEnd, track, car, settings.rivalSkill],
  );

  // --- Per-frame bridge from the simulation to the HUD ---

  const handleFrame = useCallback(
    (state: RaceState, events: RaceEvent[]) => {
      const player = state.player;

      for (const event of events) {
        switch (event.type) {
          case 'countdown':
            audio.beep(false);
            break;
          case 'go':
            audio.beep(true);
            break;
          case 'collision':
            if (event.racerId === player.id) audio.collision(event.force);
            break;
          case 'contact':
            if (event.racerId === player.id) audio.contact(event.force);
            break;
          case 'takeoff':
            if (event.racerId === player.id) audio.takeoff();
            break;
          case 'land':
            if (event.racerId === player.id) audio.land(event.force);
            break;
          case 'boost':
            if (event.racerId === player.id) audio.boost(event.strength);
            break;
          case 'lap':
            if (event.racerId === player.id) {
              audio.lap(event.isBest);
              setLapFlash({ time: event.time, isBest: event.isBest });
              if (flashTimeout.current) window.clearTimeout(flashTimeout.current);
              flashTimeout.current = window.setTimeout(() => setLapFlash(null), 3200);
            }
            break;
          default:
            break;
        }
      }

      // Slide angle drives the tyre scrub, so a pod running wide sounds like
      // it even when the player is not holding the drift button.
      const heading = Math.atan2(player.vz, player.vx);
      let slipAngle = heading - player.angle;
      while (slipAngle > Math.PI) slipAngle -= Math.PI * 2;
      while (slipAngle < -Math.PI) slipAngle += Math.PI * 2;
      const playerSpeedRatio = Math.min(1, Math.abs(player.speed) / player.config.topSpeed);

      audio.updateEngine(
        playerSpeedRatio,
        player.boostTimer > 0,
        player.offTrack,
        Math.min(1, Math.abs(slipAngle) / 0.5),
        player.airborne,
      );

      // Rivals are pitched by their own speed, gained by distance and panned by
      // which side of you they are on.
      for (const rival of state.racers) {
        if (rival.isPlayer) continue;
        const dx = rival.x - player.x;
        const dz = rival.z - player.z;
        const distance = Math.hypot(dx, dz);
        const right = -dx * Math.sin(player.angle) + dz * Math.cos(player.angle);
        audio.updateRival(
          rival.id,
          Math.min(1, Math.abs(rival.speed) / rival.config.topSpeed),
          distance,
          distance > 1 ? right / Math.max(distance, 1) : 0,
          rival.boostTimer > 0,
        );
      }

      if (state.phase === 'FINISHED') {
        if (finishTimer.current === null) {
          finishTimer.current = 0;
          setFinishing(true);
          audio.silenceEngine();
        } else {
          finishTimer.current += 1 / 60;
          if (finishTimer.current >= FINISH_DWELL) finish(state);
        }
      }

      hudTimer.current += 1 / 60;
      if (hudTimer.current < HUD_INTERVAL) return;
      hudTimer.current = 0;

      const ahead = state.racers.find((racer) => racer.position === player.position - 1);
      const playerSpeedPerSecond = Math.max(60, Math.abs(player.speed) * 60);
      const gapAhead = ahead
        ? (ahead.totalProgress - player.totalProgress) / playerSpeedPerSecond
        : null;

      setSnapshot({
        phase: state.phase,
        countdown: state.countdown,
        speed: Math.round(Math.abs(player.speed) * SPEED_TO_MPH),
        lap: player.lap + 1,
        totalLaps: state.totalLaps,
        position: player.position,
        fieldSize: state.racers.length,
        lapTime: state.phase === 'COUNTDOWN' ? 0 : Math.max(0, state.clock - player.lapStart),
        lastLap: player.lapTimes.length ? player.lapTimes[player.lapTimes.length - 1] : null,
        bestLap: player.bestLap,
        personalBest,
        driftCharge: player.driftCharge,
        boosting: player.boostTimer > 0,
        offTrack: player.offTrack,
        airborne: player.airborne,
        airTime: player.airTime,
        slipstream: player.slipstream,
        gapAhead,
        standings: [...state.racers]
          .sort((a, b) => a.position - b.position)
          .map((racer) => ({
            id: racer.id,
            name: racer.name,
            color: racer.color,
            position: racer.position,
            isPlayer: racer.isPlayer,
          })),
      });
    },
    [audio, finish, personalBest],
  );

  // Test harness: `?debug` exposes a deterministic stepper so the simulation can
  // be driven and asserted on without a human at the keyboard.
  useEffect(() => {
    if (!new URLSearchParams(window.location.search).has('debug')) return;
    const harness = {
      pause: () => setPaused(true),
      resume: () => setPaused(false),
      restart,
      /** Advance the sim by `seconds` in fixed 1/60 ticks. Pause first. */
      step(seconds: number, controls: Partial<Controls> = {}) {
        const merged = { ...NEUTRAL_CONTROLS, ...controls };
        const ticks = Math.round(seconds * 60);
        for (let i = 0; i < ticks; i++) stepRace(race, 1 / 60, merged);
        return harness.state();
      },
      /** Live race object, for ad-hoc inspection from the console. */
      raw: () => race,
      /** Jump straight to the results screen with whatever has been driven so far. */
      finish: () => finish(race),
      /** Hand the player's pod to the rival AI so a full race can run unattended. */
      setAutopilot(on: boolean) {
        race.player.autopilot = on;
      },
      state() {
        return {
          phase: race.phase,
          clock: race.clock,
          totalLaps: race.totalLaps,
          racers: race.racers.map((racer) => ({
            id: racer.id,
            lap: racer.lap,
            position: racer.position,
            speed: Number(racer.speed.toFixed(2)),
            drifting: racer.drifting,
            driftCharge: Number(racer.driftCharge.toFixed(1)),
            boostTimer: Number(racer.boostTimer.toFixed(2)),
            airborne: racer.airborne,
            hop: Number(racer.hop.toFixed(1)),
            airTime: Number(racer.airTime.toFixed(2)),
            slipstream: Number(racer.slipstream.toFixed(2)),
            lateral: Number(racer.lateral.toFixed(1)),
            offTrack: racer.offTrack,
            finished: racer.finished,
            lapTimes: racer.lapTimes.map((time) => Number(time.toFixed(3))),
            hits: racer.lapAccum.hits,
            progress: Number(racer.totalProgress.toFixed(0)),
          })),
          track: {
            length: Math.round(race.geometry.length),
            halfWidth: race.geometry.halfWidth,
            samples: race.geometry.samples.length,
          },
        };
      },
    };
    (window as unknown as { __PODRACER?: typeof harness }).__PODRACER = harness;
    return () => {
      delete (window as unknown as { __PODRACER?: typeof harness }).__PODRACER;
    };
  }, [race, restart, finish]);

  const cycleCamera = useCallback(() => {
    onCameraChange(
      cameraMode === 'CHASE' ? 'TOPDOWN' : cameraMode === 'TOPDOWN' ? 'COCKPIT' : 'CHASE',
    );
  }, [cameraMode, onCameraChange]);

  return (
    <div className="relative h-full w-full overflow-hidden bg-slate-950">
      <div ref={canvasHost} className="absolute inset-0">
        <RaceScene
          key={canvasKey}
          race={race}
          input={input}
          cameraMode={cameraMode}
          quality={quality}
          paused={paused || finishing || contextLost}
          onFrame={handleFrame}
        />
      </div>

      <Hud
        snapshot={snapshot}
        trackName={track.name}
        cameraMode={cameraMode}
        muted={muted}
        lastLapFlash={lapFlash}
        onToggleCamera={cycleCamera}
        onToggleMute={() => onMuteChange(!muted)}
        compact={compact}
        onPause={() => setPaused(true)}
        onRestart={restart}
        onExit={onExit}
      />

      {/* The minimap used to sit bottom-centre, directly on top of the steering
          and drift pads. On compact screens it is dropped entirely. */}
      {!compact && (
        <div className="pointer-events-none absolute bottom-6 right-6 top-1/2 -translate-y-1/2">
          <Minimap race={race} />
        </div>
      )}

      {isTouch && !paused && !finishing && <TouchControls input={input} />}

      {finishing && (
        <div className="absolute inset-0 flex flex-col items-center justify-center bg-slate-950/70 backdrop-blur-sm">
          <Flag className="mb-4 h-14 w-14 animate-pulse text-white" />
          <div className="font-display text-5xl font-black italic text-white">FINISH</div>
          <div className="mt-2 text-slate-300">
            P{race.player.position} · {formatTime(race.player.finishTime ?? race.clock)}
          </div>
        </div>
      )}

      {contextLost && (
        <div className="absolute inset-0 z-40 flex items-center justify-center bg-slate-950/90 p-6 backdrop-blur">
          <div className="max-w-sm rounded-2xl border border-amber-500/40 bg-slate-900 p-6 text-center">
            <RefreshCw className="mx-auto mb-3 h-8 w-8 text-amber-400" />
            <h2 className="font-display text-xl font-bold text-white">Graphics context lost</h2>
            <p className="mt-2 text-sm text-slate-400">
              The browser reclaimed the 3D context — usually low memory or the app being
              backgrounded. Your race is still here.
            </p>
            <button
              type="button"
              onClick={recoverContext}
              className="mt-5 w-full rounded-lg bg-blue-600 px-5 py-3 font-display font-bold text-white transition-colors hover:bg-blue-500"
            >
              Restore graphics
            </button>
            <button
              type="button"
              onClick={onExit}
              className="mt-2 w-full rounded-lg bg-slate-800 px-5 py-3 font-bold text-slate-300 transition-colors hover:bg-slate-700"
            >
              Quit to paddock
            </button>
          </div>
        </div>
      )}

      {/* Portrait leaves no room for the pads and the road at once. */}
      {isTouch && portrait && !contextLost && (
        <div className="absolute inset-0 z-40 flex flex-col items-center justify-center gap-4 bg-slate-950/95 p-8 text-center">
          <Smartphone className="h-12 w-12 animate-pulse text-blue-400" />
          <h2 className="font-display text-2xl font-bold text-white">Rotate your device</h2>
          <p className="max-w-xs text-sm text-slate-400">
            Podracer plays in landscape. Turn your phone sideways to get the full track and the
            controls on screen at once.
          </p>
        </div>
      )}

      {paused && (
        <div className="absolute inset-0 z-30 flex items-center justify-center bg-slate-950/85 p-6 backdrop-blur">
          <div className="w-full max-w-md rounded-2xl border border-slate-700 bg-slate-900 p-8">
            <h2 className="font-display text-3xl font-bold text-white">Paused</h2>
            <p className="mt-1 text-sm text-slate-400">{track.name}</p>

            <div className="mt-6 space-y-2">
              <button
                type="button"
                onClick={() => setPaused(false)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-display font-bold text-white transition-colors hover:bg-blue-500"
              >
                <Play className="h-4 w-4 fill-current" /> Resume
              </button>
              <button
                type="button"
                onClick={restart}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-5 py-3 font-bold text-white transition-colors hover:bg-slate-700"
              >
                <RotateCcw className="h-4 w-4" /> Restart race
              </button>
              <button
                type="button"
                onClick={() => onMuteChange(!muted)}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-5 py-3 font-bold text-white transition-colors hover:bg-slate-700"
              >
                {muted ? <VolumeX className="h-4 w-4" /> : <Volume2 className="h-4 w-4" />}
                {muted ? 'Unmute' : 'Mute'}
              </button>
              <button
                type="button"
                onClick={onExit}
                className="flex w-full items-center justify-center gap-2 rounded-lg bg-slate-800 px-5 py-3 font-bold text-white transition-colors hover:bg-slate-700"
              >
                <LogOut className="h-4 w-4" /> Quit to paddock
              </button>
            </div>

            <div className="mt-6 border-t border-slate-800 pt-4 text-sm text-slate-400">
              <div className="mb-2 flex items-center gap-2 font-bold uppercase tracking-wider text-slate-300">
                <Keyboard className="h-4 w-4" /> Controls
              </div>
              <dl className="grid grid-cols-[auto,1fr] gap-x-3 gap-y-1">
                <dt className="font-mono text-slate-500">W / ↑</dt>
                <dd>Throttle</dd>
                <dt className="font-mono text-slate-500">S / ↓</dt>
                <dd>Brake &amp; reverse</dd>
                <dt className="font-mono text-slate-500">A D / ← →</dt>
                <dd>Steer</dd>
                <dt className="font-mono text-slate-500">Shift / Space</dt>
                <dd>Drift — release for a boost</dd>
                <dt className="font-mono text-slate-500">C</dt>
                <dd>Camera</dd>
                <dt className="font-mono text-slate-500">R</dt>
                <dd>Restart</dd>
                <dt className="font-mono text-slate-500">M</dt>
                <dd>Mute</dd>
                <dt className="font-mono text-slate-500">P / Esc</dt>
                <dd>Pause</dd>
              </dl>
              <p className="mt-4 flex items-start gap-2 text-xs text-slate-500">
                <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
                Hold drift through a corner to build charge. Release above 85% for a double-strength
                boost.
              </p>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
