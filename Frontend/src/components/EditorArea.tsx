import { useStore } from '../lib/store';
import NoteView from './NoteView';
import GraphView from './GraphView';
import ChatView from './ChatView';
import ContextView from './ContextView';
import ReviewView from './ReviewView';
import PeopleView from './PeopleView';
import SharingView from './SharingView';
import PacksView from './PacksView';

export default function EditorArea() {
  const { tabs, activeTabId } = useStore();
  const tab = tabs.find(t => t.id === activeTabId);
  if (!tab) return <div className="flex-1 p-4 text-[var(--text-muted)]">No open tab</div>;

  if (tab.type === 'graph') return <GraphView />;
  if (tab.type === 'chat') return <ChatView />;
  if (tab.type === 'context') return <ContextView />;
  if (tab.type === 'review') return <ReviewView />;
  if (tab.type === 'packs') return <PacksView />;
  if (tab.type === 'people') return <PeopleView />;
  if (tab.type === 'sharing') return <SharingView />;
  if (tab.type === 'search') return <div className="flex-1 p-4">Search (use sidebar)</div>;
  if (tab.type === 'settings') return <SettingsView />;
  return <NoteView id={tab.itemId} />;
}

function SettingsView() {
  const { theme, setTheme } = useStore();
  return (
    <div className="flex-1 p-6">
      <h1 className="text-xl font-semibold mb-4">Settings</h1>
      <div className="flex items-center gap-3">
        <label>Theme</label>
        <select value={theme} onChange={e => setTheme(e.target.value as any)} className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1">
          <option value="dark">Dark</option>
          <option value="light">Light</option>
        </select>
      </div>
    </div>
  );
}
