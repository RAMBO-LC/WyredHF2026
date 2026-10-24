import { useStore } from '../lib/store';
import { api } from '../api/mock';
import { useState, useEffect, useRef } from 'react';

export default function QuickSwitcher() {
  const { quickSwitcherOpen, setQuickSwitcherOpen, openItem } = useStore();
  const [q, setQ] = useState('');
  const inputRef = useRef<HTMLInputElement>(null);
  useEffect(() => { if (quickSwitcherOpen) { setQ(''); setTimeout(() => inputRef.current?.focus(), 50); } }, [quickSwitcherOpen]);
  if (!quickSwitcherOpen) return null;
  const results = q ? api.search(q) : api.getVaultTree().slice(0, 20).map((e: any) => ({ id: e.id, type: e.type, title: e.id, snippet: e.path, status: e.status }));
  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-24 z-50" onClick={() => setQuickSwitcherOpen(false)}>
      <div className="bg-[var(--bg-elevated)] rounded w-[520px] p-3" onClick={e => e.stopPropagation()}>
        <input ref={inputRef} value={q} onChange={e => setQ(e.target.value)} placeholder="Quick switcher..." className="w-full bg-[var(--bg-app)] border border-[var(--border)] rounded px-3 py-2 text-sm" />
        <div className="mt-2 max-h-72 overflow-y-auto">
          {results.map((r: any) => (
            <button key={r.id} onClick={() => { openItem(r.id); setQuickSwitcherOpen(false); }}
              className="w-full text-left px-3 py-2 text-sm rounded hover:bg-[var(--bg-app)]">
              <div className="text-[var(--text)]">{r.title || r.id}</div>
              <div className="text-xs text-[var(--text-muted)]">{r.id}</div>
            </button>
          ))}
        </div>
      </div>
    </div>
  );
}
