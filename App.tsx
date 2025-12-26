import React, { useState } from 'react';
import { GameView, GameSessionStats, CarConfig, TrackData } from './types';
import { TRACKS, CARS } from './constants';
import { GameCanvas } from './components/GameCanvas';
import CrewChief from './components/CrewChief';
import { 
  Trophy, 
  Play, 
  Settings, 
  ChevronRight, 
  Activity, 
  Gauge, 
  Car, 
  Map as MapIcon 
} from 'lucide-react';
import { LineChart, Line, XAxis, YAxis, Tooltip, ResponsiveContainer, CartesianGrid } from 'recharts';

export default function App() {
  const [view, setView] = useState<GameView>(GameView.MENU);
  const [selectedTrack, setSelectedTrack] = useState<TrackData>(TRACKS[0]);
  const [selectedCar, setSelectedCar] = useState<CarConfig>(CARS[0]);
  const [lastSessionStats, setLastSessionStats] = useState<GameSessionStats | null>(null);

  const startRace = () => setView(GameView.RACE);
  
  const handleRaceEnd = (stats: GameSessionStats) => {
    setLastSessionStats(stats);
    setView(GameView.ANALYSIS);
  };

  const handleExitRace = () => setView(GameView.MENU);

  // --- MENU VIEW ---
  if (view === GameView.MENU) {
    return (
      <div className="min-h-screen bg-slate-900 text-white selection:bg-blue-500 selection:text-white flex items-center justify-center p-6 bg-[url('https://images.unsplash.com/photo-1568605117036-5fe5e7bab0b7?q=80&w=2070&auto=format&fit=crop')] bg-cover bg-center bg-no-repeat bg-blend-multiply">
        <div className="absolute inset-0 bg-gradient-to-t from-slate-900 via-slate-900/90 to-slate-900/40"></div>
        
        <div className="relative z-10 w-full max-w-5xl grid grid-cols-1 lg:grid-cols-12 gap-8">
          
          {/* Left Column: Branding & Primary Actions */}
          <div className="lg:col-span-5 flex flex-col justify-center space-y-8">
             <div>
                <h1 className="text-6xl md:text-8xl font-display font-black tracking-tighter text-transparent bg-clip-text bg-gradient-to-br from-white to-slate-400 italic">
                  APEX
                </h1>
                <h2 className="text-3xl font-display text-blue-500 font-bold tracking-widest -mt-2 ml-1">
                  RACER <span className="text-white text-opacity-40 font-normal text-sm align-middle tracking-normal">AI SIMULATOR</span>
                </h2>
             </div>
             
             <p className="text-slate-400 text-lg leading-relaxed">
               Experience the thrill of high-speed pod racing. Push your anti-gravity engines to the limit, analyze telemetry with AI, and dominate the circuit.
             </p>

             <button 
                onClick={startRace}
                className="group relative inline-flex items-center justify-center px-8 py-5 text-lg font-bold text-white transition-all duration-200 bg-blue-600 font-display rounded-sm hover:bg-blue-500 hover:scale-105 focus:outline-none focus:ring-2 focus:ring-offset-2 focus:ring-blue-600 focus:ring-offset-slate-900 overflow-hidden"
              >
                <div className="absolute inset-0 w-full h-full -mt-1 rounded-lg opacity-30 bg-gradient-to-b from-transparent via-transparent to-black"></div>
                <span className="relative flex items-center gap-3">
                  START ENGINES <Play className="w-5 h-5 fill-current" />
                </span>
             </button>
          </div>

          {/* Right Column: Configuration */}
          <div className="lg:col-span-7 bg-slate-800/50 backdrop-blur-md border border-slate-700/50 rounded-2xl p-8 flex flex-col gap-8 shadow-2xl">
            
            {/* Car Selection */}
            <div>
              <div className="flex items-center gap-2 mb-4 text-slate-300 font-bold uppercase tracking-wider text-sm">
                <Car className="w-4 h-4" /> Select Pod
              </div>
              <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                {CARS.map(car => (
                  <button
                    key={car.id}
                    onClick={() => setSelectedCar(car)}
                    className={`relative p-4 rounded-xl border-2 text-left transition-all ${
                      selectedCar.id === car.id 
                        ? 'border-blue-500 bg-blue-500/10 shadow-[0_0_20px_rgba(59,130,246,0.2)]' 
                        : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="w-full h-24 mb-2 rounded-lg bg-slate-900/50 flex items-center justify-center overflow-hidden group">
                       {/* Pod Representation */}
                       <div className="flex items-center gap-1 group-hover:scale-110 transition-transform">
                          <div className="w-3 h-8 rounded-sm" style={{ backgroundColor: car.color }}></div>
                          <div className="w-3 h-8 rounded-sm" style={{ backgroundColor: car.color }}></div>
                          <div className="w-6 h-1 bg-white/50"></div>
                          <div className="w-4 h-4 rounded-full bg-slate-400"></div>
                       </div>
                    </div>
                    <div className="font-display font-bold text-lg">{car.name}</div>
                    <div className="text-xs text-slate-400 mt-1 flex gap-2">
                       <span>SPD: {Math.round(car.topSpeed * 5)}</span>
                       <span>ACC: {Math.round(car.acceleration * 100)}</span>
                    </div>
                    {selectedCar.id === car.id && (
                      <div className="absolute top-2 right-2 w-3 h-3 bg-blue-500 rounded-full animate-pulse"></div>
                    )}
                  </button>
                ))}
              </div>
            </div>

            {/* Track Selection */}
            <div>
              <div className="flex items-center gap-2 mb-4 text-slate-300 font-bold uppercase tracking-wider text-sm">
                <MapIcon className="w-4 h-4" /> Select Circuit
              </div>
              <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
                {TRACKS.map(track => (
                  <button
                    key={track.id}
                    onClick={() => setSelectedTrack(track)}
                    className={`p-4 rounded-xl border-2 text-left transition-all flex items-center gap-4 ${
                      selectedTrack.id === track.id 
                        ? 'border-blue-500 bg-blue-500/10' 
                        : 'border-slate-700 bg-slate-800 hover:border-slate-600'
                    }`}
                  >
                    <div className="w-12 h-12 rounded-full bg-slate-900 flex items-center justify-center font-bold text-slate-500">
                      {track.difficulty[0]}
                    </div>
                    <div>
                      <div className="font-display font-bold">{track.name}</div>
                      <div className="text-xs text-slate-400">{track.difficulty} Circuit</div>
                    </div>
                  </button>
                ))}
              </div>
            </div>

          </div>
        </div>
      </div>
    );
  }

  // --- RACE VIEW ---
  if (view === GameView.RACE) {
    return (
      <GameCanvas 
        track={selectedTrack} 
        carConfig={selectedCar} 
        onRaceEnd={handleRaceEnd}
        onExit={handleExitRace}
      />
    );
  }

  // --- ANALYSIS VIEW ---
  if (view === GameView.ANALYSIS && lastSessionStats) {
    return (
      <div className="min-h-screen bg-slate-950 text-white p-6 md:p-12 overflow-y-auto">
        <div className="max-w-7xl mx-auto space-y-8">
          
          {/* Header */}
          <div className="flex flex-col md:flex-row justify-between items-start md:items-center gap-4 border-b border-slate-800 pb-8">
            <div>
              <div className="flex items-center gap-3 text-blue-500 font-bold uppercase tracking-widest text-sm mb-2">
                <Activity className="w-4 h-4" /> Session Complete
              </div>
              <h1 className="text-4xl md:text-5xl font-display font-bold text-white">Post-Race Analysis</h1>
            </div>
            <button 
              onClick={() => setView(GameView.MENU)}
              className="px-6 py-3 bg-slate-800 hover:bg-slate-700 rounded-lg font-bold text-white transition-colors flex items-center gap-2"
            >
              Back to Paddock <ChevronRight className="w-4 h-4" />
            </button>
          </div>

          <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
            
            {/* Left Column: Stats Cards */}
            <div className="space-y-4">
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                 <div className="text-slate-400 text-sm font-bold uppercase mb-1">Best Lap</div>
                 <div className="text-4xl font-display font-bold text-green-400">
                   {lastSessionStats.bestLap ? lastSessionStats.bestLap.toFixed(3) : '--'}<span className="text-lg text-white ml-1">s</span>
                 </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                 <div className="text-slate-400 text-sm font-bold uppercase mb-1">Total Laps</div>
                 <div className="text-4xl font-display font-bold text-white">
                   {lastSessionStats.totalLaps}
                 </div>
              </div>
              <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
                 <div className="text-slate-400 text-sm font-bold uppercase mb-1">Consistency Rating</div>
                 <div className="text-4xl font-display font-bold text-blue-400">
                   {/* Fake calc for visual */}
                   {lastSessionStats.totalLaps > 2 ? '87' : 'N/A'}<span className="text-lg text-white ml-1">%</span>
                 </div>
              </div>
            </div>

            {/* Middle: AI Crew Chief */}
            <div className="lg:col-span-2">
               <CrewChief stats={lastSessionStats} />
            </div>

          </div>

          {/* Telemetry Charts */}
          <div className="bg-slate-900 border border-slate-800 p-6 rounded-2xl">
            <h3 className="text-xl font-display font-bold mb-6 flex items-center gap-2">
              <Gauge className="w-5 h-5 text-blue-500" /> Speed Telemetry (Per Lap Max)
            </h3>
            <div className="h-64 w-full">
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={lastSessionStats.telemetry}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#1e293b" />
                  <XAxis dataKey="lapNumber" stroke="#475569" label={{ value: 'Lap', position: 'insideBottomRight', offset: -5 }} />
                  <YAxis stroke="#475569" />
                  <Tooltip 
                    contentStyle={{ backgroundColor: '#0f172a', border: '1px solid #1e293b' }}
                    itemStyle={{ color: '#fff' }}
                  />
                  <Line 
                    type="monotone" 
                    dataKey="maxSpeed" 
                    stroke="#3b82f6" 
                    strokeWidth={3}
                    dot={{ fill: '#3b82f6', strokeWidth: 2 }}
                    activeDot={{ r: 8 }}
                    name="Max Speed (MPH)"
                  />
                </LineChart>
              </ResponsiveContainer>
            </div>
          </div>

        </div>
      </div>
    );
  }

  return null;
}