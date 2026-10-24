import { useStore } from '../lib/store';
import { api } from '../api/mock';
import { useState, useEffect } from 'react';

export default function CommandPalette() {
  const { commandPaletteOpen, setCommandPaletteOpen, setRibbon, setTheme, selectedId } = useStore();
  const [q, setQ] = useState('');
  useEffect(() => { if (commandPaletteOpen) setQ(''); }, [commandPaletteOpen]);
  if (!commandPaletteOpen) return null;

  const commands = [
    { label: 'Approve selected memory', run: () => { if (selectedId?.startsWith('mem_')) api.approveMemory(selectedId); } },
    { label: 'Archive selected memory', run: () => { if (selectedId?.startsWith('mem_')) api.archiveMemory(selectedId); } },
    { label: 'Generate context pack', run: () => setRibbon('context') },
    { label: 'Export vault', run: () => { } },
    { label: 'Toggle theme', run: () => { const cur = document.documentElement.getAttribute('data-theme'); setTheme(cur === 'dark' ? 'light' : 'dark'); } },
    { label: 'Open graph', run: () => setRibbon('graph') },
    { label: 'Open review', run: () => setRibbon('review') },
    { label: 'Open chat', run: () => setRibbon('chat') },
  ].filter(c => c.label.toLowerCase().includes(q.toLowerCase()));

  return (
    <div className="fixed inset-0 bg-black/50 flex items-start justify-center pt-24 z-50" onClick={() => setCommandPaletteOpen(false)}>
      <div className="bg-[var(--bg-elevated)] rounded w-[520px] p-3" onClick={e => e.stopPropagation()}>
        <input value={q} onChange={e => setQ(e.target.value)} placeholder="Command palette..." autoFocus className="w-full bg-[var(--bg-app)] border border-[var(--border)] rounded px-3 py-2 text-sm" />
        <div className="mt-2 max-h-72 overflow-y-auto">
          {commands.map(c => (
            <button key={c.label} onClick={() => { c.run(); setCommandPaletteOpen(false); }} className="w-full text-left px-3 py-2 text-sm rounded hover:bg-[var(--bg-app)]">{c.label}</button>
          ))}
        </div>
      </div>
    </div>
  );
}
