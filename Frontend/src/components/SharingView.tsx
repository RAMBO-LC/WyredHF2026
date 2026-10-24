import { api } from '../api/mock';
import { useState } from 'react';

export default function SharingView() {
  const [itemId, setItemId] = useState('');
  const [grants, setGrants] = useState<any[]>([]);
  const [subjectType, setSubjectType] = useState<'member' | 'team' | 'workspace'>('member');
  const [subjectId, setSubjectId] = useState('');
  const [level, setLevel] = useState<'read' | 'comment' | 'edit'>('read');
  const [pending, setPending] = useState(api.listShareRequests('pending'));

  const load = () => setGrants(api.listGrants(itemId));
  const grant = () => {
    if (!itemId || !subjectId) return;
    api.grantAccess(itemId, subjectType, subjectId, level, api.getCurrentUser());
    load();
  };
  const revoke = (gid: string) => { api.revokeGrant(gid); load(); };
  const requestShare = () => {
    if (!itemId) return;
    api.createShareRequest(itemId, api.getCurrentUser(), 'workspace');
    setPending(api.listShareRequests('pending'));
  };
  const decide = (id: string, approve: boolean) => {
    api.decideShareRequest(id, approve);
    setPending(api.listShareRequests('pending'));
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold mb-4">Sharing center</h1>
      <div className="card mb-4">
        <h2 className="font-semibold mb-2">Grants on an item</h2>
        <div className="flex gap-2 mb-2">
          <input value={itemId} onChange={e => setItemId(e.target.value)} placeholder="Item ID (e.g. mem_01J)" className="bg-[var(--bg-app)] border border-[var(--border)] rounded px-2 py-1 text-sm flex-1" />
          <button onClick={load} className="px-3 py-1 text-sm border border-[var(--border)] rounded">Load</button>
        </div>
        <div className="flex flex-wrap gap-2 mb-2">
          <select value={subjectType} onChange={e => setSubjectType(e.target.value as any)} className="bg-[var(--bg-app)] border border-[var(--border)] rounded px-2 py-1 text-sm">
            <option value="member">member</option>
            <option value="team">team</option>
            <option value="workspace">workspace</option>
          </select>
          <input value={subjectId} onChange={e => setSubjectId(e.target.value)} placeholder="Subject ID" className="bg-[var(--bg-app)] border border-[var(--border)] rounded px-2 py-1 text-sm" />
          <select value={level} onChange={e => setLevel(e.target.value as any)} className="bg-[var(--bg-app)] border border-[var(--border)] rounded px-2 py-1 text-sm">
            <option value="read">read</option>
            <option value="comment">comment</option>
            <option value="edit">edit</option>
          </select>
          <button onClick={grant} className="px-3 py-1 text-sm bg-[var(--accent)] text-white rounded">Grant</button>
          <button onClick={requestShare} className="px-3 py-1 text-sm border border-[var(--border)] rounded">Request workspace share</button>
        </div>
        <div className="space-y-1">
          {grants.map((g: any) => (
            <div key={g.id} className="flex items-center justify-between text-sm border border-[var(--border)] rounded px-2 py-1">
              <span>{g.subject_type}:{g.subject_id} · {g.level} · by {g.granted_by}</span>
              <button onClick={() => revoke(g.id)} className="text-xs text-[var(--status-conflict)]">Revoke</button>
            </div>
          ))}
          {grants.length === 0 && <div className="text-xs text-[var(--text-muted)]">No grants.</div>}
        </div>
      </div>

      <h2 className="font-semibold mb-2">Pending share requests (admin)</h2>
      <div className="space-y-2">
        {pending.map((sr: any) => (
          <div key={sr.id} className="card flex items-center justify-between">
            <div className="text-sm">{sr.item_id} · {sr.requester_id} → {sr.target}</div>
            <div className="flex gap-2">
              <button onClick={() => decide(sr.id, true)} className="text-xs px-2 py-1 bg-[var(--status-approved)] text-black rounded">Approve</button>
              <button onClick={() => decide(sr.id, false)} className="text-xs px-2 py-1 bg-[var(--status-archived)] text-white rounded">Reject</button>
            </div>
          </div>
        ))}
        {pending.length === 0 && <div className="text-xs text-[var(--text-muted)]">None.</div>}
      </div>
    </div>
  );
}
