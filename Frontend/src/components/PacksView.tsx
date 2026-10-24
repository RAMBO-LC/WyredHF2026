import { useStore } from '../lib/store';
import { api } from '../api/mock';

export default function PacksView() {
  const { openItem } = useStore();
  const tree = api.getVaultTree().filter((e: any) => e.type === 'pack');
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Packs</h1>
      {tree.map((e: any) => (
        <button key={e.id} onClick={() => openItem(e.id)} className="block w-full text-left bg-[var(--bg-elevated)] border border-[var(--border)] rounded p-3 mb-2 hover:bg-[var(--bg-app)]">
          <div className="font-medium">{e.id}</div>
          <div className="text-xs text-[var(--text-muted)]">{e.path}</div>
        </button>
      ))}
      {tree.length === 0 && <div className="text-[var(--text-muted)]">No packs yet. Generate one in Context engine.</div>}
    </div>
  );
}
