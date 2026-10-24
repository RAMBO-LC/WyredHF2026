import { useStore } from '../lib/store';
import { api } from '../api/mock';
import { parseFrontmatter } from '../lib/parse';

export default function RightPane() {
  const { selectedId, openItem } = useStore();
  if (!selectedId) return <aside className="w-72 bg-[var(--bg-sidebar)] border-l border-[var(--border)] p-3 text-sm text-[var(--text-muted)]">No selection</aside>;

  const tree = api.getVaultTree();
  const entry = tree.find((e: any) => e.id === selectedId);
  const path = entry?.path;
  const content = path ? api.getVaultFile(path) : null;
  const { frontmatter } = content ? parseFrontmatter(content) : { frontmatter: {} };

  const backlinks: string[] = [];
  tree.forEach((e: any) => {
    const c = api.getVaultFile(e.path);
    if (c && c.includes(`[[${selectedId}`)) backlinks.push(e.id);
  });

  const headings = content ? content.split('\n').filter((l: string) => /^#{1,6} /.test(l)) : [];

  const g = api.getGraph();
  const neighborIds = (g.edges || []).filter((e: any) => e.from === selectedId || e.to === selectedId).map((e: any) => e.from === selectedId ? e.to : e.from);

  return (
    <aside className="w-72 bg-[var(--bg-sidebar)] border-l border-[var(--border)] overflow-y-auto p-3 text-sm">
      <section className="mb-4">
        <h3 className="font-semibold mb-2">Properties</h3>
        {Object.entries(frontmatter).map(([k, v]) => (
          <div key={k} className="flex justify-between gap-2 py-0.5"><span className="text-[var(--text-muted)]">{k}</span><span className="text-[var(--text)] truncate">{String(v)}</span></div>
        ))}
      </section>
      <section className="mb-4">
        <h3 className="font-semibold mb-2">Outline</h3>
        {headings.map((h: string, i: number) => <div key={i} className="py-0.5 text-[var(--text-muted)] truncate">{h}</div>)}
      </section>
      <section className="mb-4">
        <h3 className="font-semibold mb-2">Backlinks ({backlinks.length})</h3>
        {backlinks.map(b => <button key={b} onClick={() => openItem(b)} className="block text-[var(--link)] underline text-xs mb-1">{b}</button>)}
      </section>
      <section className="mb-4">
        <h3 className="font-semibold mb-2">Local graph (depth 1)</h3>
        {neighborIds.map((n: string) => <button key={n} onClick={() => openItem(n)} className="block text-[var(--link)] underline text-xs mb-1">{n}</button>)}
      </section>
    </aside>
  );
}
