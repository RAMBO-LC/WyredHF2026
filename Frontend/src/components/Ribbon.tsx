import { useStore } from '../lib/store';
import { Files, Search, Network, MessageSquare, Brain, CheckSquare, Package, Settings, Users, Share2 } from 'lucide-react';

const items: { key: any; icon: any; label: string; shortcut: string }[] = [
  { key: 'files', icon: Files, label: 'Files', shortcut: 'Ctrl+1' },
  { key: 'search', icon: Search, label: 'Search', shortcut: 'Ctrl+2' },
  { key: 'graph', icon: Network, label: 'Graph', shortcut: 'Ctrl+3' },
  { key: 'chat', icon: MessageSquare, label: 'Chat', shortcut: 'Ctrl+4' },
  { key: 'context', icon: Brain, label: 'Context engine', shortcut: 'Ctrl+5' },
  { key: 'review', icon: CheckSquare, label: 'Review', shortcut: 'Ctrl+6' },
  { key: 'packs', icon: Package, label: 'Packs', shortcut: 'Ctrl+7' },
  { key: 'people', icon: Users, label: 'People', shortcut: 'Ctrl+9' },
  { key: 'sharing', icon: Share2, label: 'Sharing', shortcut: 'Ctrl+0' },
  { key: 'settings', icon: Settings, label: 'Settings', shortcut: 'Ctrl+8' },
];

export default function Ribbon() {
  const { ribbon, setRibbon, openTab } = useStore();
  return (
    <nav aria-label="Primary" className="w-12 bg-[var(--bg-ribbon)] border-r border-[var(--border)] flex flex-col items-center py-2 gap-1">
      {items.map(it => {
        const Icon = it.icon;
        const active = ribbon === it.key;
        return (
          <button
            key={it.key}
            onClick={() => { setRibbon(it.key); openTab({ id: `tab-${it.key}`, title: it.label, type: it.key === 'files' ? 'note' : it.key === 'search' ? 'search' : it.key === 'graph' ? 'graph' : it.key === 'chat' ? 'chat' : it.key === 'context' ? 'context' : it.key === 'review' ? 'review' : it.key === 'packs' ? 'packs' : it.key === 'people' ? 'people' : it.key === 'sharing' ? 'sharing' : 'settings' }); } }
            aria-label={it.label}
            aria-pressed={active}
            title={`${it.label} (${it.shortcut})`}
            className={`w-9 h-9 rounded flex items-center justify-center ${active ? 'bg-[var(--bg-elevated)] text-[var(--accent)]' : 'text-[var(--text-muted)] hover:text-[var(--text)]'}`}
          >
            <Icon size={18} />
          </button>
        );
      })}
    </nav>
  );
}
