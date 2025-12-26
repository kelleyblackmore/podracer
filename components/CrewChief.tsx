import React, { useEffect, useState } from 'react';
import { GameSessionStats } from '../types';
import { analyzeRacePerformance } from '../services/geminiService';
import { Radio, Loader2, AlertTriangle, CheckCircle } from 'lucide-react';

interface CrewChiefProps {
  stats: GameSessionStats;
}

const CrewChief: React.FC<CrewChiefProps> = ({ stats }) => {
  const [analysis, setAnalysis] = useState<string>('');
  const [loading, setLoading] = useState<boolean>(true);
  const [error, setError] = useState<boolean>(false);

  useEffect(() => {
    let mounted = true;

    const fetchAnalysis = async () => {
      try {
        setLoading(true);
        const result = await analyzeRacePerformance(stats);
        if (mounted) {
          setAnalysis(result);
          setLoading(false);
        }
      } catch (err) {
        if (mounted) {
          setError(true);
          setLoading(false);
        }
      }
    };

    fetchAnalysis();

    return () => {
      mounted = false;
    };
  }, [stats]);

  return (
    <div className="bg-slate-800 border border-slate-700 rounded-lg p-6 max-w-2xl w-full shadow-2xl relative overflow-hidden">
      {/* Header */}
      <div className="flex items-center gap-3 mb-4 border-b border-slate-700 pb-4">
        <div className="p-3 bg-blue-600 rounded-full">
          <Radio className="w-6 h-6 text-white" />
        </div>
        <div>
          <h3 className="text-xl font-display font-bold text-white">Crew Chief AI</h3>
          <p className="text-sm text-slate-400">Gemini 3 Flash • Live Telemetry Link</p>
        </div>
      </div>

      {/* Content */}
      <div className="min-h-[150px]">
        {loading ? (
          <div className="flex flex-col items-center justify-center h-full py-8 space-y-4">
            <Loader2 className="w-8 h-8 text-blue-400 animate-spin" />
            <p className="text-slate-400 animate-pulse">Analyzing telemetry data...</p>
          </div>
        ) : error ? (
          <div className="flex items-center gap-3 text-red-400 bg-red-900/20 p-4 rounded-md">
            <AlertTriangle className="w-6 h-6" />
            <p>Connection lost. Unable to retrieve analysis.</p>
          </div>
        ) : (
          <div className="prose prose-invert">
            <div className="whitespace-pre-line text-slate-200 leading-relaxed font-light text-lg">
              {analysis}
            </div>
            <div className="mt-6 flex items-center gap-2 text-green-400 text-sm">
              <CheckCircle className="w-4 h-4" />
              <span>Transmission Complete</span>
            </div>
          </div>
        )}
      </div>

      {/* Decorative scanline */}
      <div className="absolute inset-0 pointer-events-none opacity-5 bg-[linear-gradient(transparent_50%,rgba(0,0,0,1)_50%)] bg-[length:100%_4px]" />
    </div>
  );
};

export default CrewChief;