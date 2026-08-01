import { useMemo } from 'react';
import {
  Activity,
  ChevronRight,
  Crown,
  Gauge,
  RotateCcw,
  ShieldAlert,
  Timer,
  Trophy,
} from 'lucide-react';
import {
  CartesianGrid,
  Line,
  LineChart,
  ResponsiveContainer,
  Tooltip,
  XAxis,
  YAxis,
} from 'recharts';
import type { GameSessionStats } from '../types';
import { deriveStats } from '../services/analysis';
import { formatTime, ordinal } from '../game/format';
import { submitRecord } from '../game/storage';
import CrewChief from './CrewChief';

interface ResultsProps {
  stats: GameSessionStats;
  onRaceAgain: () => void;
  onExit: () => void;
}

function StatCard({
  label,
  value,
  unit,
  accent = 'text-white',
  icon,
  badge,
}: {
  label: string;
  value: string;
  unit?: string;
  accent?: string;
  icon: React.ReactNode;
  badge?: string;
}) {
  return (
    <div className="rounded-2xl border border-slate-800 bg-slate-900 p-5">
      <div className="mb-1 flex items-center justify-between">
        <div className="flex items-center gap-2 text-xs font-bold uppercase tracking-wider text-slate-400">
          {icon}
          {label}
        </div>
        {badge && (
          <span className="rounded-full bg-amber-500/20 px-2 py-0.5 text-[10px] font-bold uppercase tracking-wider text-amber-300">
            {badge}
          </span>
        )}
      </div>
      <div className={`font-display text-3xl font-bold tabular-nums ${accent}`}>
        {value}
        {unit && <span className="ml-1 text-base text-slate-500">{unit}</span>}
      </div>
    </div>
  );
}

export function Results({ stats, onRaceAgain, onExit }: ResultsProps) {
  const derived = useMemo(() => deriveStats(stats), [stats]);

  // Recorded once per results screen, not on every re-render.
  const records = useMemo(
    () =>
      submitRecord(
        stats.trackId,
        stats.carId,
        stats.bestLap,
        stats.finished ? stats.totalTime : null,
      ),
    [stats],
  );

  const podium = stats.finished && stats.finishPosition <= 3;

  return (
    <div className="h-full overflow-y-auto bg-slate-950 p-6 md:p-10">
      <div className="mx-auto max-w-7xl space-y-8">
        <header className="flex flex-col items-start justify-between gap-4 border-b border-slate-800 pb-8 md:flex-row md:items-center">
          <div>
            <div className="mb-2 flex items-center gap-2 text-xs font-bold uppercase tracking-widest text-blue-500">
              <Activity className="h-4 w-4" />
              {stats.finished ? 'Race complete' : 'Session ended'}
            </div>
            <h1 className="font-display text-4xl font-bold text-white md:text-5xl">
              {stats.finished ? (
                <>
                  Finished{' '}
                  <span className={podium ? 'text-amber-300' : 'text-white'}>
                    {ordinal(stats.finishPosition)}
                  </span>
                  {stats.fieldSize > 1 && (
                    <span className="text-slate-600"> of {stats.fieldSize}</span>
                  )}
                </>
              ) : (
                'Post-race analysis'
              )}
            </h1>
            <p className="mt-2 text-slate-400">
              {stats.trackName} · {stats.carName} · {derived.lapCount}/{stats.totalLaps} laps
            </p>
          </div>
          <div className="flex gap-2">
            <button
              type="button"
              onClick={onRaceAgain}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-5 py-3 font-bold text-white transition-colors hover:bg-blue-500"
            >
              <RotateCcw className="h-4 w-4" /> Race again
            </button>
            <button
              type="button"
              onClick={onExit}
              className="flex items-center gap-2 rounded-lg bg-slate-800 px-5 py-3 font-bold text-white transition-colors hover:bg-slate-700"
            >
              Paddock <ChevronRight className="h-4 w-4" />
            </button>
          </div>
        </header>

        <div className="grid gap-6 lg:grid-cols-3">
          <div className="space-y-4">
            <StatCard
              label="Best lap"
              value={formatTime(stats.bestLap)}
              accent="text-emerald-400"
              icon={<Timer className="h-3.5 w-3.5" />}
              badge={records.lapRecord ? 'Record' : undefined}
            />
            <StatCard
              label="Race time"
              value={formatTime(stats.totalTime)}
              accent="text-white"
              icon={<Trophy className="h-3.5 w-3.5" />}
              badge={records.raceRecord ? 'Record' : undefined}
            />
            <StatCard
              label="Consistency"
              value={derived.lapCount > 1 ? String(derived.consistency) : '--'}
              unit={derived.lapCount > 1 ? '%' : undefined}
              accent="text-blue-400"
              icon={<Activity className="h-3.5 w-3.5" />}
            />
            <StatCard
              label="Top speed"
              value={String(derived.topSpeed)}
              unit="MPH"
              accent="text-fuchsia-300"
              icon={<Gauge className="h-3.5 w-3.5" />}
            />
            <StatCard
              label="Barrier hits"
              value={String(derived.totalCollisions)}
              accent={derived.totalCollisions === 0 ? 'text-emerald-400' : 'text-red-400'}
              icon={<ShieldAlert className="h-3.5 w-3.5" />}
            />
          </div>

          <div className="lg:col-span-2">
            <CrewChief stats={stats} />
          </div>
        </div>

        {stats.telemetry.length > 0 && (
          <div className="rounded-2xl border border-slate-800 bg-slate-900 p-6">
            <h3 className="mb-6 flex items-center gap-2 font-display text-xl font-bold">
              <Gauge className="h-5 w-5 text-blue-500" /> Lap telemetry
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={stats.telemetry} margin={{ top: 5, right: 20, bottom: 5, left: 0 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="lapNumber" stroke="#475569" tickLine={false} />
                  <YAxis yAxisId="time" stroke="#34d399" tickLine={false} width={50} />
                  <YAxis
                    yAxisId="speed"
                    orientation="right"
                    stroke="#60a5fa"
                    tickLine={false}
                    width={50}
                  />
                  <Tooltip
                    contentStyle={{
                      backgroundColor: '#020617',
                      border: '1px solid #1e293b',
                      borderRadius: '0.5rem',
                    }}
                    labelStyle={{ color: '#94a3b8' }}
                    formatter={(value: number, name: string) =>
                      name === 'Lap time' ? [`${value.toFixed(3)}s`, name] : [value, name]
                    }
                  />
                  <Line
                    yAxisId="time"
                    type="monotone"
                    dataKey="time"
                    name="Lap time"
                    stroke="#34d399"
                    strokeWidth={3}
                    dot={{ fill: '#34d399' }}
                    activeDot={{ r: 7 }}
                  />
                  <Line
                    yAxisId="speed"
                    type="monotone"
                    dataKey="maxSpeed"
                    name="Max MPH"
                    stroke="#60a5fa"
                    strokeWidth={2}
                    strokeDasharray="4 3"
                    dot={{ fill: '#60a5fa' }}
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>

            <div className="mt-6 overflow-x-auto">
              <table className="w-full min-w-[560px] text-left text-sm">
                <thead className="text-[10px] uppercase tracking-widest text-slate-500">
                  <tr className="border-b border-slate-800">
                    <th className="py-2 font-bold">Lap</th>
                    <th className="py-2 font-bold">Time</th>
                    <th className="py-2 font-bold">Delta</th>
                    <th className="py-2 font-bold">Avg MPH</th>
                    <th className="py-2 font-bold">Max MPH</th>
                    <th className="py-2 font-bold">Off track</th>
                    <th className="py-2 font-bold">Hits</th>
                  </tr>
                </thead>
                <tbody className="tabular-nums text-slate-300">
                  {stats.telemetry.map((lap) => {
                    // Compare with a tolerance: two laps that both display as
                    // 16.117 differ in the last float digits, which otherwise
                    // renders one of them as "+0.000" off its own best.
                    const isBest =
                      stats.bestLap !== null && lap.time - stats.bestLap < 5e-4;
                    return (
                      <tr key={lap.lapNumber} className="border-b border-slate-800/60">
                        <td className="py-2 font-bold text-white">
                          <span className="flex items-center gap-1.5">
                            {lap.lapNumber}
                            {isBest && <Crown className="h-3 w-3 text-amber-400" />}
                          </span>
                        </td>
                        <td className={`py-2 ${isBest ? 'font-bold text-emerald-400' : ''}`}>
                          {formatTime(lap.time)}
                        </td>
                        <td className="py-2 text-slate-500">
                          {stats.bestLap !== null && !isBest
                            ? `+${(lap.time - stats.bestLap).toFixed(3)}`
                            : '—'}
                        </td>
                        <td className="py-2">{lap.averageSpeed}</td>
                        <td className="py-2">{lap.maxSpeed}</td>
                        <td className="py-2">{lap.offTrackCount.toFixed(1)}s</td>
                        <td className={`py-2 ${lap.collisions > 0 ? 'text-red-400' : ''}`}>
                          {lap.collisions}
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          </div>
        )}
      </div>
    </div>
  );
}
