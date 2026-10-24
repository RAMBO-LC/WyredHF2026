import { useStore } from '../lib/store';
import { api } from '../api/mock';
import { useState } from 'react';
import { ChevronRight, ChevronDown } from 'lucide-react';

function FileTree() {
  const { openItem, selectedId, tree } = useStore();
  const [openFolders, setOpenFolders] = useState<Record<string, boolean>>({ 'Projects': true });
  const toggle = (p: string) => setOpenFolders(s => ({ ...s, [p]: !s[p] }));

  interface Node { name: string; path: string; children: Node[]; entry?: any; }
  const root: Node = { name: '', path: '', children: [] };
  tree.forEach((e: any) => {
    const parts = e.path.split('/');
    let cur = root;
    parts.forEach((part: string, i: number) => {
      const p = parts.slice(0, i + 1).join('/');
      let child = cur.children.find(c => c.name === part);
      if (!child) { child = { name: part, path: p, children: [] }; cur.children.push(child); }
      if (i === parts.length - 1) child.entry = e;
      cur = child;
    });
  });

  const render = (node: Node, depth: number): any => {
    if (node.entry && node.children.length === 0) {
      const e = node.entry;
      const active = selectedId === e.id;
      return (
        <button key={e.path} onClick={() => openItem(e.id)}
          className={`w-full text-left text-sm px-2 py-1 rounded truncate ${active ? 'bg-[var(--bg-elevated)] text-[var(--accent)]' : 'text-[var(--text)] hover:bg-[var(--bg-elevated)]'}`}
          style={{ paddingLeft: depth * 12 + 8 }}>
          {node.name}
        </button>
      );
    }
    const isOpen = openFolders[node.path] ?? (depth < 2);
    return (
      <div key={node.path}>
        {node.name && (
          <button onClick={() => toggle(node.path)}
            className="w-full text-left text-sm px-2 py-1 flex items-center gap-1 text-[var(--text-muted)] hover:text-[var(--text)]"
            style={{ paddingLeft: depth * 12 + 4 }}>
            {isOpen ? <ChevronDown size={12} /> : <ChevronRight size={12} />} {node.name}
          </button>
        )}
        {isOpen && node.children.map(c => render(c, node.name ? depth + 1 : depth))}
      </div>
    );
  };
  return <div className="p-2">{root.children.map(c => render(c, 0))}</div>;
}

function SearchSidebar() {
  const { runSearch, searchResults, openItem, searchQuery, setSearchQuery } = useStore();
  return (
    <div className="p-2">
      <input value={searchQuery} onChange={e => { setSearchQuery(e.target.value); runSearch(e.target.value); }} placeholder="Search..." className="w-full text-sm bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1 mb-2" />
      <div className="flex flex-col gap-1">
        {searchResults.map((r: any) => (
          <button key={r.id} onClick={() => openItem(r.id)} className="text-left text-sm px-2 py-1 rounded hover:bg-[var(--bg-elevated)]">
            <div className="text-[var(--text)] truncate">{r.title}</div>
            <div className="text-xs text-[var(--text-muted)]">{r.type} · {r.status || ''}</div>
          </button>
        ))}
      </div>
    </div>
  );
}

function ChatList() {
  const { chatThreads, openItem, refreshThreads } = useStore();
  const [title, setTitle] = useState('');
  const create = () => {
    const t = api.createThread(title || undefined);
    setTitle('');
    refreshThreads();
    openItem(t.id);
  };
  return (
    <div className="p-2">
      <div className="flex gap-1 mb-2">
        <input value={title} onChange={e => setTitle(e.target.value)} placeholder="New chat title" className="flex-1 text-sm bg-[var(--bg-elevated)] border border-[var(--border)] rounded px-2 py-1" />
        <button onClick={create} className="px-2 py-1 text-sm bg-[var(--accent)] text-white rounded">+</button>
      </div>
      {chatThreads.map((t: any) => (
        <button key={t.id} onClick={() => openItem(t.id)} className="w-full text-left text-sm px-2 py-1 rounded hover:bg-[var(--bg-elevated)] text-[var(--text)] truncate">
          {t.title}
        </button>
      ))}
    </div>
  );
}

export default function Sidebar() {
  const { ribbon } = useStore();
  return (
    <aside className="w-64 bg-[var(--bg-sidebar)] border-r border-[var(--border)] overflow-y-auto">
      {ribbon === 'files' && <FileTree />}
      {ribbon === 'search' && <SearchSidebar />}
      {ribbon === 'chat' && <ChatList />}
      {ribbon === 'graph' && <div className="p-2 text-sm text-[var(--text-muted)]">Graph controls in main view.</div>}
      {ribbon === 'context' && <div className="p-2 text-sm text-[var(--text-muted)]">Context engine.</div>}
      {ribbon === 'review' && <div className="p-2 text-sm text-[var(--text-muted)]">Review queue.</div>}
      {ribbon === 'packs' && <div className="p-2 text-sm text-[var(--text-muted)]">Packs.</div>}
      {ribbon === 'settings' && <div className="p-2 text-sm text-[var(--text-muted)]">Settings.</div>}
      {ribbon === 'people' && <div className="p-2 text-sm text-[var(--text-muted)]">People & teams.</div>}
      {ribbon === 'sharing' && <div className="p-2 text-sm text-[var(--text-muted)]">Sharing.</div>}
    </aside>
  );
}
