import { useStore } from '../lib/store';
import { api } from '../api/mock';
import { useState, useEffect } from 'react';
import ReactMarkdown from 'react-markdown';
import remarkGfm from 'remark-gfm';
import rehypeSanitize from 'rehype-sanitize';

export default function ChatView() {
  const { openItem } = useStore();
  const [threads, setThreads] = useState(api.listThreads());
  const [tid, setTid] = useState<string | null>(threads[0]?.id || null);
  const [messages, setMessages] = useState<any[]>([]);
  const [input, setInput] = useState('');
  const [pending, setPending] = useState(false);
  const [attach, setAttach] = useState<string[]>([]);

  useEffect(() => { if (tid) setMessages(api.getThread(tid).messages || []); }, [tid]);

  const send = () => {
    if (!input.trim() || !tid) return;
    setPending(true);
    api.sendMessage(tid, input);
    setMessages(api.getThread(tid).messages || []);
    setInput(''); setAttach([]); setPending(false);
  };

  const newChat = () => { const t = api.createThread(); setThreads(api.listThreads()); setTid(t.id); setMessages([]); };

  const badge = (m: any) => {
    if (!m.citations || m.citations.length === 0) return 'No team evidence';
    const sug = m.citations.some((c: string) => (api.getMemory(c)?.status) === 'suggested');
    return sug ? 'Partly unreviewed' : 'Approved team knowledge';
  };

  return (
    <div className="flex gap-4 h-full min-h-0">
      <aside className="w-56 space-y-2 overflow-y-auto">
        <button onClick={newChat} className="w-full px-3 py-1.5 text-sm bg-[var(--accent)] text-white rounded">+ New chat</button>
        {threads.map((t: any) => (
          <button key={t.id} onClick={() => setTid(t.id)} className={`w-full text-left px-3 py-2 text-sm rounded ${tid === t.id ? 'bg-[var(--bg-elevated)]' : ''}`}>{t.title}</button>
        ))}
      </aside>
      <div className="flex-1 flex flex-col min-h-0">
        <div className="flex-1 overflow-y-auto space-y-3">
          {messages.length === 0 && (
            <div className="text-center text-[var(--text-muted)] mt-10">
              <p className="mb-4">Ask about team knowledge.</p>
              <div className="flex flex-col gap-2 max-w-md mx-auto">
                {['What did we decide about session middleware?', 'What is the API error shape?', 'How is SESSION_TTL configured?'].map(s => (
                  <button key={s} onClick={() => setInput(s)} className="text-sm px-3 py-2 rounded border border-[var(--border)] hover:bg-[var(--bg-elevated)]">{s}</button>
                ))}
              </div>
            </div>
          )}
          {messages.map((m: any) => (
            <div key={m.id} className={`card ${m.role === 'user' ? 'ml-8' : 'mr-8'}`}>
              {m.role === 'assistant' && (
                <div className="text-xs mb-1 flex items-center gap-2 flex-wrap">
                  <span className={`px-1.5 py-0.5 rounded text-black ${badge(m) === 'Approved team knowledge' ? 'bg-[var(--status-approved)]' : badge(m) === 'Partly unreviewed' ? 'bg-[var(--status-unreviewed)]' : 'bg-[var(--status-archived)]'}`}>{badge(m)}</span>
                  <span className="text-[var(--text-muted)]">Model: {m.model || 'No model (extractive summary of approved memories)'}</span>
                </div>
              )}
              <ReactMarkdown remarkPlugins={[remarkGfm]} rehypePlugins={[rehypeSanitize]}>{m.content}</ReactMarkdown>
              {m.role === 'assistant' && m.citations?.length > 0 && (
                <div className="mt-2 flex flex-wrap gap-1">
                  {m.citations.map((c: string) => (
                    <button key={c} onClick={() => openItem(c)} className="text-xs px-2 py-0.5 rounded bg-[var(--bg-app)] border border-[var(--border)] hover:bg-[var(--bg-elevated)]">
                      {c} · {api.getMemory(c)?.status || 'resource'}
                    </button>
                  ))}
                </div>
              )}
              {m.role === 'assistant' && m.pack_id && (
                <details className="mt-2 text-xs">
                  <summary className="cursor-pointer text-[var(--text-muted)]">Context used</summary>
                  <div>Pack: <button className="text-[var(--link)] underline" onClick={() => openItem(m.pack_id)}>{m.pack_id}</button></div>
                  {(() => { const p = api.getPack ? api.getPack(m.pack_id) : null; return p ? <div>Tokens: {p.tokens_used} / {p.budget} · Omitted: {p.omitted_count}</div> : null; })()}
                </details>
              )}
              {m.role === 'assistant' && (
                <div className="mt-2 flex gap-2 text-xs">
                  <button className="px-2 py-0.5 border border-[var(--border)] rounded">Copy</button>
                  <button className="px-2 py-0.5 border border-[var(--border)] rounded">Regenerate</button>
                  <button className="px-2 py-0.5 border border-[var(--border)] rounded">Insert into doc</button>
                  <button className="px-2 py-0.5 border border-[var(--border)] rounded">Propose as memory</button>
                </div>
              )}
            </div>
          ))}
          {pending && <div className="text-[var(--text-muted)] text-sm">Thinking...</div>}
        </div>
        {attach.length > 0 && (
          <div className="flex gap-1 mb-1 flex-wrap">
            {attach.map(a => <span key={a} className="text-xs px-2 py-0.5 bg-[var(--bg-elevated)] border border-[var(--border)] rounded">{a} <button onClick={() => setAttach(attach.filter(x => x !== a))}>×</button></span>)}
          </div>
        )}
        <div className="border-t border-[var(--border)] pt-2 flex gap-2 items-end">
          <textarea value={input} onChange={e => setInput(e.target.value)} onKeyDown={e => { if (e.key === 'Enter' && !e.shiftKey) { e.preventDefault(); send(); } }} placeholder="Message... (@ to attach, / for commands)" rows={2} className="flex-1 bg-[var(--bg-elevated)] border border-[var(--border)] rounded p-2 text-sm resize-none" />
          <button onClick={send} disabled={pending || !input.trim()} className="px-4 py-2 bg-[var(--accent)] text-white rounded disabled:opacity-50">Send</button>
        </div>
      </div>
    </div>
  );
}
