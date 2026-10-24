import { useStore } from '../lib/store';
import { api } from '../api/mock';
import { useState } from 'react';

export default function ReviewView() {
  const { openItem } = useStore();
  const [items, setItems] = useState(api.getReviewItems());
  const approve = (memId: string) => { api.approveMemory(memId); setItems(api.getReviewItems()); };
  const archive = (memId: string) => { api.archiveMemory(memId); setItems(api.getReviewItems()); };
  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Review queue ({items.length})</h1>
      {items.map((ri: any) => {
        const m = api.getMemory(ri.memory_id);
        return (
          <div key={ri.id} className="bg-[var(--bg-elevated)] border border-[var(--border)] rounded p-4 mb-3">
            <div className="text-sm text-[var(--text-muted)] mb-1">{ri.reason} · {ri.id}</div>
            <div className="font-medium mb-2">{m?.statement}</div>
            <div className="text-xs text-[var(--text-muted)] mb-3">Status: {m?.status} · Kind: {m?.kind}</div>
            <div className="flex gap-2">
              <button onClick={() => approve(ri.memory_id)} className="px-3 py-1 text-sm bg-[var(--status-approved)] text-black rounded">Approve</button>
              <button onClick={() => archive(ri.memory_id)} className="px-3 py-1 text-sm bg-[var(--status-archived)] text-white rounded">Archive</button>
              <button onClick={() => openItem(ri.memory_id)} className="px-3 py-1 text-sm border border-[var(--border)] rounded">Open</button>
            </div>
          </div>
        );
      })}
      {items.length === 0 && <div className="text-[var(--text-muted)]">No pending reviews.</div>}
    </div>
  );
}
