import { useStore } from '../lib/store';
import { api } from '../api/mock';
import { useState } from 'react';

export default function ContextView() {
  const { openItem } = useStore();
  const [task, setTask] = useState('Implement authentication middleware in the API');
  const [budget, setBudget] = useState(2000);
  const [includeUnreviewed, setIncludeUnreviewed] = useState(false);
  const [pack, setPack] = useState<any>(null);
  const [mode, setMode] = useState<'reading' | 'source'>('reading');

  const generate = () => { const p = api.generatePack(task, budget, includeUnreviewed); setPack(p); };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Context engine</h1>
      <div className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded p-4 mb-4">
        <label className="block text-sm mb-1">Task</label>
        <textarea value={task} onChange={e => setTask(e.target.value)} rows={3} className="w-full bg-[var(--bg-app)] border border-[var(--border)] rounded p-2 text-sm mb-3" />
        <div className="flex items-center gap-4 mb-3">
          <label className="text-sm">Budget: {budget} tokens</label>
          <input type="range" min={500} max={8000} step={100} value={budget} onChange={e => setBudget(Number(e.target.value))} className="flex-1" />
        </div>
        <label className="flex items-center gap-2 text-sm mb-3">
          <input type="checkbox" checked={includeUnreviewed} onChange={e => setIncludeUnreviewed(e.target.checked)} />
          Include unreviewed suggestions
        </label>
        {includeUnreviewed && <div className="text-xs text-[var(--status-unreviewed)] mb-3">Unreviewed suggestions are included and labeled. They are not team knowledge.</div>}
        <button onClick={generate} className="px-4 py-2 bg-[var(--accent)] text-white rounded">Generate</button>
      </div>
      {pack && (
        <div>
          <div className="flex items-center gap-4 text-sm mb-3 flex-wrap">
            <span>Tokens: {pack.tokens_used} / {pack.budget}</span>
            <span>Omitted: {pack.omitted_count}</span>
            <span>Insufficient: {String(pack.insufficient)}</span>
            <button onClick={() => openItem(pack.id)} className="text-[var(--link)] underline">Pack note: {pack.id}</button>
            <div className="ml-auto flex gap-1">
              <button onClick={() => setMode('reading')} className={`px-2 py-1 text-xs rounded ${mode === 'reading' ? 'bg-[var(--bg-elevated)]' : ''}`}>Reading</button>
              <button onClick={() => setMode('source')} className={`px-2 py-1 text-xs rounded ${mode === 'source' ? 'bg-[var(--bg-elevated)]' : ''}`}>Source</button>
            </div>
          </div>
          <table className="w-full text-sm border-collapse mb-4">
            <thead><tr><th className="text-left border-b border-[var(--border)] p-1">Item</th><th className="text-left border-b border-[var(--border)] p-1">Tier</th><th className="text-left border-b border-[var(--border)] p-1">Score</th><th className="text-left border-b border-[var(--border)] p-1">Why</th></tr></thead>
            <tbody>
              {pack.items.map((it: any) => (
                <tr key={it.id}>
                  <td className="p-1"><button className="text-[var(--link)] underline" onClick={() => openItem(it.id)}>{it.id}</button></td>
                  <td className="p-1">{it.tier}</td>
                  <td className="p-1 text-xs">{Object.entries(it.score).map(([k, v]) => `${k}:${v}`).join(' ')}</td>
                  <td className="p-1">{it.why}</td>
                </tr>
              ))}
            </tbody>
          </table>
          {mode === 'reading' ? (
            <div className="prose prose-invert max-w-none"><pre className="whitespace-pre-wrap text-sm">{pack.markdown}</pre></div>
          ) : (
            <pre className="font-mono text-sm whitespace-pre-wrap bg-[var(--bg-elevated)] p-3 rounded">{pack.markdown}</pre>
          )}
          <div className="mt-3 flex gap-2">
            <button onClick={() => navigator.clipboard.writeText(pack.markdown)} className="px-3 py-1 text-sm border border-[var(--border)] rounded">Copy</button>
            <button onClick={() => { const b = new Blob([pack.markdown]); const u = URL.createObjectURL(b); const a = document.createElement('a'); a.href = u; a.download = pack.id + '.md'; a.click(); }} className="px-3 py-1 text-sm border border-[var(--border)] rounded">Download</button>
          </div>
        </div>
      )}
    </div>
  );
}
