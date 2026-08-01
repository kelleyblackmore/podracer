import { Eye, LogOut, Pause, RotateCcw, Volume2, VolumeX, Zap } from 'lucide-react';
import type { RacePhase } from '../game/engine';
import { formatDelta, formatTime } from '../game/format';
import type { CameraMode } from '../types';

export interface HudSnapshot {
  phase: RacePhase;
  countdown: number;
  speed: number;
  lap: number;
  totalLaps: number;
  position: number;
  fieldSize: number;
  lapTime: number;
  lastLap: number | null;
  bestLap: number | null;
  personalBest: number | null;
  driftCharge: number;
  boosting: boolean;
  offTrack: boolean;
  /** Seconds to the racer ahead; null when leading. */
  gapAhead: number | null;
  standings: { id: string; name: string; color: string; position: number; isPlayer: boolean }[];
}

interface HudProps {
  snapshot: HudSnapshot;
  trackName: string;
  cameraMode: CameraMode;
  muted: boolean;
  lastLapFlash: { time: number; isBest: boolean } | null;
  /**
   * Small screens keep the bottom of the display clear for the touch pads and
   * drop the panels that don't fit. Without this the throttle pad sits directly
   * under the speed readout and the steering pads under the minimap.
   */
  compact: boolean;
  onToggleCamera: () => void;
  onToggleMute: () => void;
  onPause: () => void;
  onRestart: () => void;
  onExit: () => void;
}

function IconButton({
  label,
  onClick,
  active,
  children,
}: {
  label: string;
  onClick: () => void;
  active?: boolean;
  children: React.ReactNode;
}) {
  return (
    <button
      type="button"
      onClick={onClick}
      title={label}
      aria-label={label}
      // min-h/w 44px is the smallest reliable touch target.
      className={`flex h-11 w-11 items-center justify-center rounded-full border backdrop-blur transition-colors ${
        active
          ? 'border-blue-400/60 bg-blue-500/80 text-white'
          : 'border-slate-600/60 bg-slate-900/70 text-slate-300 hover:bg-slate-800 hover:text-white'
      }`}
    >
      {children}
    </button>
  );
}

export function Hud({
  snapshot,
  trackName,
  cameraMode,
  muted,
  lastLapFlash,
  compact,
  onToggleCamera,
  onToggleMute,
  onPause,
  onRestart,
  onExit,
}: HudProps) {
  const {
    phase,
    countdown,
    speed,
    lap,
    totalLaps,
    position,
    fieldSize,
    lapTime,
    lastLap,
    bestLap,
    personalBest,
    driftCharge,
    boosting,
    offTrack,
    gapAhead,
    standings,
  } = snapshot;

  const chargeReady = driftCharge >= 85;
  const delta = lastLapFlash && personalBest !== null ? lastLapFlash.time - personalBest : null;

  return (
    <div className="pointer-events-none absolute inset-0 select-none p-4 sm:p-6">
      {/* Top left: timing */}
      <div className="absolute left-4 top-4 flex flex-col gap-2 sm:left-6 sm:top-6">
        <div className="rounded-xl border border-slate-700/60 bg-slate-950/75 px-4 py-3 backdrop-blur">
          <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
            Current lap
          </div>
          <div className="font-display text-3xl font-bold tabular-nums text-amber-300 sm:text-4xl">
            {formatTime(phase === 'COUNTDOWN' ? 0 : lapTime)}
          </div>
          <div className="mt-2 flex gap-4 text-xs">
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Last</div>
              <div className="font-display tabular-nums text-slate-200">{formatTime(lastLap)}</div>
            </div>
            <div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Best</div>
              <div className="font-display tabular-nums text-emerald-300">{formatTime(bestLap)}</div>
            </div>
          </div>
        </div>

        {lastLapFlash && (
          <div
            key={`${lastLapFlash.time}`}
            className={`animate-slide-up rounded-lg border px-3 py-2 text-sm font-bold backdrop-blur ${
              lastLapFlash.isBest
                ? 'border-emerald-400/60 bg-emerald-500/20 text-emerald-200'
                : 'border-slate-600/60 bg-slate-900/80 text-slate-200'
            }`}
          >
            {lastLapFlash.isBest ? 'Personal best · ' : 'Lap · '}
            <span className="font-display tabular-nums">{formatTime(lastLapFlash.time)}</span>
            {delta !== null && !lastLapFlash.isBest && (
              <span className="ml-2 text-red-300 tabular-nums">{formatDelta(delta)}</span>
            )}
          </div>
        )}

        {compact && (
          <div className="flex items-center gap-3 rounded-xl border border-slate-700/60 bg-slate-950/75 px-3 py-2 backdrop-blur">
            <div>
              <span className="font-display text-xl font-bold leading-none">
                {Math.min(Math.max(lap, 1), totalLaps)}
              </span>
              <span className="text-sm text-slate-500">/{totalLaps}</span>
              <div className="text-[9px] uppercase tracking-wider text-slate-500">Lap</div>
            </div>
            {fieldSize > 1 && (
              <div className="border-l border-slate-700 pl-3">
                <span className="font-display text-xl font-bold leading-none">{position}</span>
                <span className="text-sm text-slate-500">/{fieldSize}</span>
                <div className="text-[9px] uppercase tracking-wider text-slate-500">Pos</div>
              </div>
            )}
          </div>
        )}
      </div>

      {/* Top right: controls */}
      <div className="pointer-events-auto absolute right-4 top-4 flex gap-2 sm:right-6 sm:top-6">
        <IconButton label={`Camera: ${cameraMode}`} onClick={onToggleCamera}>
          <Eye className="h-5 w-5" />
        </IconButton>
        {!compact && (
          <>
            <IconButton label={muted ? 'Unmute' : 'Mute'} onClick={onToggleMute} active={!muted}>
              {muted ? <VolumeX className="h-5 w-5" /> : <Volume2 className="h-5 w-5" />}
            </IconButton>
            <IconButton label="Restart race" onClick={onRestart}>
              <RotateCcw className="h-5 w-5" />
            </IconButton>
          </>
        )}
        <IconButton label="Pause" onClick={onPause}>
          <Pause className="h-5 w-5" />
        </IconButton>
        <IconButton label="Quit to paddock" onClick={onExit}>
          <LogOut className="h-5 w-5" />
        </IconButton>
      </div>

      {/* Right: standings */}
      {!compact && fieldSize > 1 && (
        <div className="absolute right-4 top-24 w-40 rounded-xl border border-slate-700/60 bg-slate-950/70 p-2 backdrop-blur sm:right-6 sm:top-28">
          <div className="px-1 pb-1 text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Order
          </div>
          {standings.map((entry) => (
            <div
              key={entry.id}
              className={`flex items-center gap-2 rounded px-1.5 py-1 text-xs ${
                entry.isPlayer ? 'bg-white/10 font-bold text-white' : 'text-slate-300'
              }`}
            >
              <span className="w-4 tabular-nums text-slate-500">{entry.position}</span>
              <span
                className="h-2.5 w-2.5 shrink-0 rounded-full"
                style={{ backgroundColor: entry.color }}
              />
              <span className="truncate">{entry.name}</span>
            </div>
          ))}
        </div>
      )}

      {/* Bottom left: race state. On compact screens this moves up into the
          left column so the bottom band belongs entirely to the touch pads. */}
      {!compact && (
      <div className="absolute bottom-4 left-4 rounded-xl border border-slate-700/60 bg-slate-950/75 px-4 py-3 backdrop-blur sm:bottom-6 sm:left-6">
        <div className="text-[10px] font-bold uppercase tracking-widest text-slate-400">
          {trackName}
        </div>
        <div className="mt-1 flex items-end gap-5">
          <div>
            <div className="font-display text-2xl font-bold leading-none sm:text-3xl">
              {Math.min(Math.max(lap, 1), totalLaps)}
              <span className="text-base text-slate-500">/{totalLaps}</span>
            </div>
            <div className="text-[10px] uppercase tracking-wider text-slate-500">Lap</div>
          </div>
          {fieldSize > 1 && (
            <div>
              <div className="font-display text-2xl font-bold leading-none sm:text-3xl">
                {position}
                <span className="text-base text-slate-500">/{fieldSize}</span>
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Pos</div>
            </div>
          )}
          {gapAhead !== null && (
            <div>
              <div className="font-display text-lg leading-none text-amber-300 tabular-nums">
                {formatDelta(gapAhead)}
              </div>
              <div className="text-[10px] uppercase tracking-wider text-slate-500">Ahead</div>
            </div>
          )}
        </div>
      </div>
      )}

      {/* Speed + drift charge. Anchored mid-right on compact screens: bottom
          right is where the throttle pad lives. */}
      <div
        className={
          compact
            ? 'absolute right-4 top-1/2 flex -translate-y-1/2 flex-col items-end'
            : 'absolute bottom-4 right-4 flex flex-col items-end sm:bottom-6 sm:right-6'
        }
      >
        <div className="mb-2 flex flex-col items-end gap-1">
          <div className="flex items-center gap-2">
            <span
              className={`text-[10px] font-bold uppercase tracking-widest ${
                chargeReady ? 'animate-pulse text-red-400' : 'text-slate-500'
              }`}
            >
              {chargeReady ? 'Overcharge ready' : 'Drift charge'}
            </span>
            <Zap className={`h-3 w-3 ${driftCharge > 0 ? 'text-amber-300' : 'text-slate-600'}`} />
          </div>
          <div className={`h-2 overflow-hidden rounded-full border border-slate-700/60 bg-slate-900/80 ${compact ? 'w-28' : 'w-40 sm:w-48'}`}>
            <div
              className={`h-full transition-[width] duration-100 ${
                chargeReady
                  ? 'bg-gradient-to-r from-red-500 to-amber-300'
                  : driftCharge > 45
                    ? 'bg-gradient-to-r from-amber-500 to-orange-500'
                    : 'bg-blue-500'
              }`}
              style={{ width: `${driftCharge}%` }}
            />
          </div>
        </div>

        <div className="flex items-baseline gap-2">
          <span
            className={`font-display font-black italic leading-none tabular-nums drop-shadow-lg ${
              compact ? 'text-4xl' : 'text-6xl sm:text-7xl'
            } ${boosting ? 'text-fuchsia-300' : 'text-white'}`}
          >
            {speed}
          </span>
          <span className="text-lg font-bold text-slate-400">MPH</span>
        </div>
        <div className={`mt-2 h-3 overflow-hidden rounded-full border border-slate-700/60 bg-slate-900 ${compact ? 'w-32' : 'w-48 sm:w-64'}`}>
          <div
            className="h-full bg-gradient-to-r from-emerald-400 via-amber-300 to-red-500 transition-[width] duration-100"
            style={{ width: `${Math.min(100, (speed / 570) * 100)}%` }}
          />
        </div>
      </div>

      {/* Centre overlays */}
      {phase === 'COUNTDOWN' && (
        <div className="absolute inset-0 flex items-center justify-center">
          <div
            key={Math.ceil(countdown)}
            className={`animate-count-pop font-display font-black italic text-white drop-shadow-[0_0_30px_rgba(59,130,246,0.6)] ${
              compact ? 'text-[5rem]' : 'text-[9rem]'
            }`}
          >
            {Math.ceil(countdown) || 'GO'}
          </div>
        </div>
      )}

      {offTrack && phase === 'RACING' && (
        <div className="absolute left-1/2 top-20 -translate-x-1/2 rounded-full border border-amber-400/50 bg-amber-500/20 px-4 py-1.5 text-xs font-bold uppercase tracking-widest text-amber-200 backdrop-blur">
          Off track
        </div>
      )}
    </div>
  );
}
