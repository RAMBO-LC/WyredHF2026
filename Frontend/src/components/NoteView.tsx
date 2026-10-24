import { useStore } from '../lib/store';
import { api } from '../api/mock';
import { useState } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';
import { parseFrontmatter } from '../lib/parse';

export default function NoteView({ id }: { id?: string }) {
  const { selectedId, openItem } = useStore();
  const target = id || selectedId;
  const [mode, setMode] = useState<'reading' | 'source'>('reading');
  const [showEdit, setShowEdit] = useState(false);

  if (!target) return <div className="flex-1 p-4 text-[var(--text-muted)]">Select an item</div>;

  const tree = api.getVaultTree();
  const entry = tree.find((e: any) => e.id === target);
  const path = entry?.path;
  const content = path ? api.getVaultFile(path) : null;
  if (!content) return <div className="flex-1 p-4 text-[var(--text-muted)]">Not found</div>;

  const { body } = parseFrontmatter(content);

  const renderBody = (md: string) => {
    // Resolve [[id]] or [[type:id|label]] or [[id|label]]
    return md.replace(/\[\[(?:([a-z]+):)?([a-zA-Z0-9_]+)(?:\|([^\]]+))?\]\]/g, (_m, _type, id, label) => {
      const exists = api.getVaultTree().some((e: any) => e.id === id);
      if (!exists) return `<span class="unresolved-link" title="No item you can access">${label || id}</span>`;
      return `[${label || id}](#open:${id})`;
    });
  };

  const handleLinkClick = (e: React.MouseEvent) => {
    const t = (e.target as HTMLElement).closest('a');
    if (!t) return;
    const href = t.getAttribute('href');
    if (href && href.startsWith('#open:')) {
      e.preventDefault();
      openItem(href.slice(6));
    }
  };

  return (
    <div className="flex-1 flex flex-col min-h-0">
      <div className="flex items-center gap-2 px-4 py-2 border-b border-[var(--border)]">
        <span className="text-sm text-[var(--text-muted)] truncate flex-1">{path}</span>
        <div className="flex gap-1">
          <button onClick={() => setMode('reading')} className={`px-2 py-1 text-xs rounded ${mode === 'reading' ? 'bg-[var(--bg-elevated)]' : ''}`}>Reading</button>
          <button onClick={() => setMode('source')} className={`px-2 py-1 text-xs rounded ${mode === 'source' ? 'bg-[var(--bg-elevated)]' : ''}`}>Source</button>
        </div>
        {target.startsWith('mem_') && (
          <button onClick={() => setShowEdit(true)} className="px-2 py-1 text-xs rounded bg-[var(--accent)] text-white">Edit statement</button>
        )}
      </div>
      <div className="flex-1 overflow-y-auto p-6" onClick={handleLinkClick}>
        {mode === 'reading' ? (
          <article className="prose prose-invert max-w-none">
            <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>
              {renderBody(body)}
            </ReactMarkdown>
          </article>
        ) : (
          <pre className="font-mono text-sm whitespace-pre-wrap">{content}</pre>
        )}
      </div>
      {showEdit && <EditStatementModal id={target} onClose={() => setShowEdit(false)} />}
    </div>
  );
}

function EditStatementModal({ id, onClose }: { id: string; onClose: () => void }) {
  const m = api.getMemory(id)!;
  const [statement, setStatement] = useState(m.statement);
  const [reason, setReason] = useState('');
  const [conflict] = useState(false);
  const submit = () => {
    m.statement = statement; m.version += 1;
    onClose();
  };
  return (
    <div className="fixed inset-0 bg-black/50 flex items-center justify-center z-50">
      <div className="bg-[var(--bg-elevated)] p-6 rounded w-[500px]">
        <h2 className="text-lg font-semibold mb-3">Edit statement</h2>
        {conflict && <div className="text-[var(--status-conflict)] text-sm mb-2">This memory changed while you were editing. Your text is kept below. Review it and save again.</div>}
        <textarea value={statement} onChange={e => setStatement(e.target.value)} className="w-full h-24 bg-[var(--bg-app)] border border-[var(--border)] rounded p-2 mb-2" />
        <input value={reason} onChange={e => setReason(e.target.value)} placeholder="Reason (required)" className="w-full bg-[var(--bg-app)] border border-[var(--border)] rounded p-2 mb-3" />
        <div className="flex gap-2 justify-end">
          <button onClick={onClose} className="px-3 py-1 text-sm">Cancel</button>
          <button onClick={submit} disabled={!reason} className="px-3 py-1 text-sm bg-[var(--accent)] text-white rounded disabled:opacity-50">Save</button>
        </div>
      </div>
    </div>
  );
}
