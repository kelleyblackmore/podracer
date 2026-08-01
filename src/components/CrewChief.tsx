import { useCallback, useEffect, useState } from 'react';
import { AlertTriangle, CheckCircle, KeyRound, Loader2, Radio, Sparkles } from 'lucide-react';
import type { GameSessionStats } from '../types';
import {
  analyzeRacePerformance,
  DEFAULT_MODEL_ID,
  type AnalysisResult,
} from '../services/geminiService';
import { loadApiKey, loadModelId, saveApiKey, saveModelId } from '../game/storage';

/** Renders the debrief's `**bold**` runs without pulling in a markdown parser. */
function RichText({ text }: { text: string }) {
  return (
    <>
      {text.split('\n').map((line, lineIndex) => (
        <p key={lineIndex} className={line.trim() === '' ? 'h-3' : 'mb-2 leading-relaxed'}>
          {line.split(/(\*\*[^*]+\*\*)/g).map((part, partIndex) =>
            part.startsWith('**') && part.endsWith('**') ? (
              <strong
                key={partIndex}
                className="font-display text-sm uppercase tracking-wider text-blue-300"
              >
                {part.slice(2, -2)}
              </strong>
            ) : (
              <span key={partIndex}>{part}</span>
            ),
          )}
        </p>
      ))}
    </>
  );
}

export function CrewChief({ stats }: { stats: GameSessionStats }) {
  const [result, setResult] = useState<AnalysisResult | null>(null);
  const [loading, setLoading] = useState(true);
  const [showSettings, setShowSettings] = useState(false);
  const [apiKey, setApiKey] = useState(() => loadApiKey());
  const [model, setModel] = useState(() => loadModelId(DEFAULT_MODEL_ID));

  const run = useCallback(
    async (key: string, modelId: string) => {
      setLoading(true);
      try {
        setResult(await analyzeRacePerformance(stats, key, modelId));
      } finally {
        setLoading(false);
      }
    },
    [stats],
  );

  useEffect(() => {
    let active = true;
    void analyzeRacePerformance(stats, loadApiKey(), loadModelId(DEFAULT_MODEL_ID)).then((value) => {
      if (!active) return;
      setResult(value);
      setLoading(false);
    });
    return () => {
      active = false;
    };
  }, [stats]);

  const applyKey = () => {
    saveApiKey(apiKey.trim());
    saveModelId(model.trim());
    setShowSettings(false);
    void run(apiKey.trim(), model.trim());
  };

  return (
    <div className="relative overflow-hidden rounded-2xl border border-slate-800 bg-slate-900 p-6 shadow-2xl">
      <div className="mb-4 flex items-start justify-between gap-4 border-b border-slate-800 pb-4">
        <div className="flex items-center gap-3">
          <div className="rounded-full bg-blue-600 p-3">
            <Radio className="h-6 w-6 text-white" />
          </div>
          <div>
            <h3 className="font-display text-xl font-bold text-white">Crew Chief</h3>
            <p className="text-sm text-slate-400">
              {result?.source === 'gemini' ? `Gemini · ${model}` : 'Offline telemetry engineer'}
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setShowSettings((value) => !value)}
          className="flex shrink-0 items-center gap-2 rounded-lg border border-slate-700 px-3 py-2 text-xs font-bold text-slate-300 transition-colors hover:border-slate-500 hover:text-white"
        >
          <KeyRound className="h-3.5 w-3.5" />
          {apiKey ? 'Change key' : 'Use Gemini'}
        </button>
      </div>

      {showSettings && (
        <div className="mb-4 rounded-xl border border-slate-700 bg-slate-950/60 p-4">
          <p className="mb-3 text-xs leading-relaxed text-slate-400">
            The debrief below is generated locally and needs no key. To have Gemini write it
            instead, paste your own API key — it is stored only in this browser and sent directly to
            Google. Never use a key you would not put in a public client.
          </p>
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
            API key
          </label>
          <input
            type="password"
            value={apiKey}
            onChange={(event) => setApiKey(event.target.value)}
            placeholder="Paste your Gemini API key"
            autoComplete="off"
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 text-sm text-white outline-none focus:border-blue-500"
          />
          <label className="mb-1 block text-[10px] font-bold uppercase tracking-widest text-slate-500">
            Model
          </label>
          <input
            type="text"
            value={model}
            onChange={(event) => setModel(event.target.value)}
            placeholder={DEFAULT_MODEL_ID}
            className="mb-3 w-full rounded-lg border border-slate-700 bg-slate-900 px-3 py-2 font-mono text-sm text-white outline-none focus:border-blue-500"
          />
          <div className="flex gap-2">
            <button
              type="button"
              onClick={applyKey}
              className="flex items-center gap-2 rounded-lg bg-blue-600 px-4 py-2 text-sm font-bold text-white transition-colors hover:bg-blue-500"
            >
              <Sparkles className="h-4 w-4" /> Regenerate
            </button>
            <button
              type="button"
              onClick={() => {
                setApiKey('');
                saveApiKey('');
                setShowSettings(false);
                void run('', model);
              }}
              className="rounded-lg bg-slate-800 px-4 py-2 text-sm font-bold text-slate-300 transition-colors hover:bg-slate-700"
            >
              Clear
            </button>
          </div>
        </div>
      )}

      <div className="min-h-[180px]">
        {loading ? (
          <div className="flex h-full flex-col items-center justify-center gap-4 py-12">
            <Loader2 className="h-8 w-8 animate-spin text-blue-400" />
            <p className="animate-pulse text-slate-400">Reviewing your telemetry…</p>
          </div>
        ) : (
          <>
            {result?.warning && (
              <div className="mb-4 flex items-start gap-2 rounded-lg border border-amber-500/40 bg-amber-500/10 p-3 text-xs text-amber-200">
                <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" />
                <span>
                  Gemini request failed ({result.warning}). Showing the offline debrief instead.
                </span>
              </div>
            )}
            <div className="text-slate-200">
              <RichText text={result?.text ?? ''} />
            </div>
            <div className="mt-5 flex items-center gap-2 text-sm text-emerald-400">
              <CheckCircle className="h-4 w-4" />
              <span>Debrief complete</span>
            </div>
          </>
        )}
      </div>

      <div className="pointer-events-none absolute inset-0 bg-[linear-gradient(transparent_50%,rgba(0,0,0,1)_50%)] bg-[length:100%_4px] opacity-[0.04]" />
    </div>
  );
}

export default CrewChief;
