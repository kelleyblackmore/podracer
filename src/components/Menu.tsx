import { useState } from 'react';
import {
  Bot,
  Flag,
  Gauge,
  MapIcon,
  Play,
  Rocket,
  Settings2,
  Timer,
  Trash2,
  Trophy,
} from 'lucide-react';
import type { CarConfig, RaceSettings, RivalSkill, TrackData } from '../types';
import { CARS, LAP_OPTIONS, TRACKS } from '../constants';
import { formatTime } from '../game/format';
import type { RecordBook } from '../game/storage';

interface MenuProps {
  selectedTrack: TrackData;
  selectedCar: CarConfig;
  settings: RaceSettings;
  quality: 'low' | 'high';
  records: RecordBook;
  onSelectTrack: (track: TrackData) => void;
  onSelectCar: (car: CarConfig) => void;
  onSettingsChange: (settings: RaceSettings) => void;
  onQualityChange: (quality: 'low' | 'high') => void;
  onClearRecords: () => void;
  onStart: () => void;
}

const RIVAL_LABELS: Record<RivalSkill, string> = {
  NONE: 'Solo',
  ROOKIE: 'Rookie',
  PRO: 'Pro',
  LEGEND: 'Legend',
};

const RIVAL_ORDER: RivalSkill[] = ['NONE', 'ROOKIE', 'PRO', 'LEGEND'];

const DIFFICULTY_COLOR: Record<TrackData['difficulty'], string> = {
  Easy: 'text-emerald-400',
  Medium: 'text-amber-400',
  Hard: 'text-red-400',
};

function StatBar({ label, value }: { label: string; value: number }) {
  return (
    <div className="flex items-center gap-2">
      <span className="w-8 text-[10px] font-bold uppercase tracking-wider text-slate-500">
        {label}
      </span>
      <div className="h-1.5 flex-1 overflow-hidden rounded-full bg-slate-700">
        <div className="h-full rounded-full bg-blue-400" style={{ width: `${value * 100}%` }} />
      </div>
    </div>
  );
}

function Segmented<T extends string | number>({
  options,
  value,
  onChange,
  format,
}: {
  options: readonly T[];
  value: T;
  onChange: (next: T) => void;
  format?: (option: T) => string;
}) {
  return (
    <div className="flex gap-1 rounded-lg border border-slate-700 bg-slate-900 p-1">
      {options.map((option) => (
        <button
          key={String(option)}
          type="button"
          onClick={() => onChange(option)}
          className={`flex-1 rounded px-2 py-1.5 text-xs font-bold transition-colors ${
            option === value ? 'bg-blue-600 text-white' : 'text-slate-400 hover:text-white'
          }`}
        >
          {format ? format(option) : String(option)}
        </button>
      ))}
    </div>
  );
}

export function Menu({
  selectedTrack,
  selectedCar,
  settings,
  quality,
  records,
  onSelectTrack,
  onSelectCar,
  onSettingsChange,
  onQualityChange,
  onClearRecords,
  onStart,
}: MenuProps) {
  const record = records[selectedTrack.id];
  const [confirmingClear, setConfirmingClear] = useState(false);
  const hasRecords = Object.keys(records).length > 0;

  return (
    <div className="h-full overflow-y-auto bg-slate-950">
      <div className="pointer-events-none fixed inset-0 bg-[radial-gradient(ellipse_at_top,rgba(59,130,246,0.16),transparent_55%),radial-gradient(ellipse_at_bottom_right,rgba(168,85,247,0.12),transparent_50%)]" />

      <div className="relative mx-auto grid max-w-6xl gap-8 p-6 py-12 lg:grid-cols-12 lg:py-20">
        <div className="flex flex-col justify-center gap-6 lg:col-span-4">
          <div>
            <h1 className="bg-gradient-to-br from-white to-slate-500 bg-clip-text font-display text-6xl font-black italic tracking-tighter text-transparent md:text-7xl">
              PODRACER
            </h1>
            <p className="-mt-1 ml-1 font-display text-sm font-bold tracking-[0.3em] text-blue-500">
              BOONTA EVE EDITION
            </p>
          </div>

          <p className="leading-relaxed text-slate-400">
            Anti-gravity pod racing with real corner physics. Drift through the turns to charge your
            engines, dump the boost onto the straights, and beat the field to the flag.
          </p>

          <button
            type="button"
            onClick={onStart}
            className="group flex items-center justify-center gap-3 rounded-lg bg-blue-600 px-8 py-5 font-display text-lg font-bold text-white transition-all hover:scale-[1.02] hover:bg-blue-500 focus:outline-none focus:ring-2 focus:ring-blue-400 focus:ring-offset-2 focus:ring-offset-slate-950"
          >
            START ENGINES
            <Play className="h-5 w-5 fill-current transition-transform group-hover:translate-x-1" />
          </button>

          {record && (
            <div className="rounded-xl border border-slate-800 bg-slate-900/60 p-4">
              <div className="mb-2 flex items-center justify-between gap-2">
                <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-amber-400">
                  <Trophy className="h-3.5 w-3.5" /> Your record here
                </div>
                {hasRecords && (
                  <button
                    type="button"
                    onClick={() => {
                      if (confirmingClear) {
                        onClearRecords();
                        setConfirmingClear(false);
                      } else {
                        setConfirmingClear(true);
                      }
                    }}
                    onBlur={() => setConfirmingClear(false)}
                    title="Clear personal bests on every circuit"
                    className={`flex items-center gap-1.5 rounded px-2 py-1 text-[10px] font-bold uppercase tracking-wider transition-colors ${
                      confirmingClear
                        ? 'bg-red-600 text-white'
                        : 'text-slate-500 hover:bg-slate-800 hover:text-slate-300'
                    }`}
                  >
                    <Trash2 className="h-3 w-3" />
                    {confirmingClear ? 'Erase all?' : 'Reset'}
                  </button>
                )}
              </div>
              <div className="flex gap-6">
                <div>
                  <div className="font-display text-xl tabular-nums text-white">
                    {formatTime(record.bestLap)}
                  </div>
                  <div className="text-[10px] uppercase tracking-wider text-slate-500">Best lap</div>
                </div>
                {record.bestRace !== null && (
                  <div>
                    <div className="font-display text-xl tabular-nums text-white">
                      {formatTime(record.bestRace)}
                    </div>
                    <div className="text-[10px] uppercase tracking-wider text-slate-500">
                      Best race
                    </div>
                  </div>
                )}
              </div>
            </div>
          )}

          <div className="text-xs leading-relaxed text-slate-600">
            <span className="font-mono text-slate-500">W A S D</span> or arrows to drive ·{' '}
            <span className="font-mono text-slate-500">Shift</span> to drift ·{' '}
            <span className="font-mono text-slate-500">C</span> camera ·{' '}
            <span className="font-mono text-slate-500">P</span> pause. Touchscreen and gamepad also
            supported.
          </div>
        </div>

        <div className="flex flex-col gap-6 rounded-2xl border border-slate-800 bg-slate-900/60 p-6 backdrop-blur lg:col-span-8">
          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300">
              <Rocket className="h-4 w-4" /> Pod
            </h2>
            <div className="grid gap-3 sm:grid-cols-3">
              {CARS.map((car) => {
                const selected = car.id === selectedCar.id;
                return (
                  <button
                    key={car.id}
                    type="button"
                    onClick={() => onSelectCar(car)}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      selected
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                    }`}
                  >
                    <div className="mb-3 flex h-16 items-center justify-center gap-1 rounded-lg bg-slate-950/60">
                      <div className="h-8 w-2.5 rounded-sm" style={{ backgroundColor: car.color }} />
                      <div className="h-8 w-2.5 rounded-sm" style={{ backgroundColor: car.color }} />
                      <div className="h-0.5 w-5 bg-white/40" />
                      <div className="h-3.5 w-3.5 rounded-full bg-slate-400" />
                    </div>
                    <div className="font-display font-bold">{car.name}</div>
                    <p className="mb-3 mt-1 text-xs leading-snug text-slate-500">{car.blurb}</p>
                    <div className="space-y-1.5">
                      <StatBar label="SPD" value={car.topSpeed / 10} />
                      <StatBar label="ACC" value={car.acceleration / 0.15} />
                      <StatBar label="GRP" value={car.handling / 0.18} />
                    </div>
                  </button>
                );
              })}
            </div>
          </section>

          <section>
            <h2 className="mb-3 flex items-center gap-2 text-sm font-bold uppercase tracking-wider text-slate-300">
              <MapIcon className="h-4 w-4" /> Circuit
            </h2>
            <div className="grid gap-3 sm:grid-cols-2">
              {TRACKS.map((track) => {
                const selected = track.id === selectedTrack.id;
                const trackRecord = records[track.id];
                return (
                  <button
                    key={track.id}
                    type="button"
                    onClick={() => onSelectTrack(track)}
                    className={`rounded-xl border-2 p-4 text-left transition-all ${
                      selected
                        ? 'border-blue-500 bg-blue-500/10'
                        : 'border-slate-800 bg-slate-900 hover:border-slate-600'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="font-display font-bold">{track.name}</div>
                      <span
                        className={`shrink-0 text-[10px] font-bold uppercase tracking-wider ${DIFFICULTY_COLOR[track.difficulty]}`}
                      >
                        {track.difficulty}
                      </span>
                    </div>
                    <p className="mt-1 text-xs leading-snug text-slate-500">{track.blurb}</p>
                    {trackRecord && (
                      <div className="mt-2 flex items-center gap-1.5 text-[11px] text-amber-400/80">
                        <Timer className="h-3 w-3" />
                        <span className="tabular-nums">{formatTime(trackRecord.bestLap)}</span>
                      </div>
                    )}
                  </button>
                );
              })}
            </div>
          </section>

          <section className="grid gap-4 sm:grid-cols-3">
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Flag className="h-3.5 w-3.5" /> Laps
              </h2>
              <Segmented
                options={LAP_OPTIONS}
                value={settings.laps}
                onChange={(laps) => onSettingsChange({ ...settings, laps })}
              />
            </div>
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Bot className="h-3.5 w-3.5" /> Rivals
              </h2>
              <Segmented
                options={RIVAL_ORDER}
                value={settings.rivalSkill}
                onChange={(rivalSkill) => onSettingsChange({ ...settings, rivalSkill })}
                format={(option) => RIVAL_LABELS[option]}
              />
            </div>
            <div>
              <h2 className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
                <Settings2 className="h-3.5 w-3.5" /> Graphics
              </h2>
              <Segmented
                options={['high', 'low'] as const}
                value={quality}
                onChange={onQualityChange}
                format={(option) => (option === 'high' ? 'High' : 'Fast')}
              />
            </div>
          </section>

          <p className="flex items-start gap-2 text-xs text-slate-600">
            <Gauge className="mt-0.5 h-3.5 w-3.5 shrink-0" />
            Rivals run a precomputed racing line with real braking points. Legend-class drivers will
            drift the corners and out-brake you into them.
          </p>
        </div>
      </div>
    </div>
  );
}
