import { useStore } from '../lib/store';
import { X } from 'lucide-react';

export default function TabBar() {
  const { tabs, activeTabId, setActiveTab, closeTab } = useStore();
  return (
    <div role="tablist" className="flex items-center bg-[var(--bg-sidebar)] border-b border-[var(--border)] overflow-x-auto">
      {tabs.map(t => (
        <div key={t.id} role="tab" aria-selected={activeTabId === t.id}
          className={`flex items-center gap-2 px-3 py-2 text-sm border-r border-[var(--border)] cursor-pointer ${activeTabId === t.id ? 'bg-[var(--bg-app)] text-[var(--text)]' : 'text-[var(--text-muted)]'}`}>
          <button onClick={() => setActiveTab(t.id)} className="truncate max-w-40">{t.title}</button>
          <button onClick={() => closeTab(t.id)} aria-label="Close tab" className="opacity-60 hover:opacity-100"><X size={12} /></button>
        </div>
      ))}
    </div>
  );
}
