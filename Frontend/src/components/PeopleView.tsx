import { api } from '../api/mock';
import { useState } from 'react';

export default function PeopleView() {
  const [members, setMembers] = useState(api.listMembersRole());
  const [showInvite, setShowInvite] = useState(false);
  const [inviteRole, setInviteRole] = useState<'member' | 'guest'>('member');
  const [inviteExpiry, setInviteExpiry] = useState(7);
  const [inviteMaxUses, setInviteMaxUses] = useState(1);
  const [inviteApproval, setInviteApproval] = useState(true);
  const [inviteLink, setInviteLink] = useState('');
  const [teams] = useState(api.listTeams());
  const [selectedMember, setSelectedMember] = useState<string | null>(null);

  const doInvite = () => {
    const r = api.createInvitation(inviteRole, teams.map(t => t.id), inviteExpiry, inviteMaxUses, inviteApproval, api.getCurrentUser());
    setInviteLink(r.token);
  };

  const changeRole = (memberId: string, newRole: any) => {
    const res = api.changeMemberRole(api.getCurrentUser(), memberId, newRole);
    if (!res.ok) alert(res.reason);
    setMembers(api.listMembersRole());
  };

  return (
    <div className="flex-1 overflow-y-auto p-6">
      <h1 className="text-xl font-semibold mb-4">People & Workspace</h1>
      <div className="mb-4 flex gap-2">
        <button onClick={() => setShowInvite(true)} className="px-3 py-1.5 text-sm bg-[var(--accent)] text-white rounded">Invite member</button>
      </div>

      {showInvite && (
        <div className="card mb-4">
          <h2 className="font-semibold mb-2">Invite</h2>
          <div className="flex flex-wrap gap-2 mb-2">
            <select value={inviteRole} onChange={e => setInviteRole(e.target.value as any)} className="bg-[var(--bg-app)] border border-[var(--border)] rounded px-2 py-1 text-sm">
              <option value="member">member</option>
              <option value="guest">guest</option>
            </select>
            <input type="number" value={inviteExpiry} onChange={e => setInviteExpiry(Number(e.target.value))} className="bg-[var(--bg-app)] border border-[var(--border)] rounded px-2 py-1 text-sm w-20" placeholder="days" />
            <input type="number" value={inviteMaxUses} onChange={e => setInviteMaxUses(Number(e.target.value))} className="bg-[var(--bg-app)] border border-[var(--border)] rounded px-2 py-1 text-sm w-20" placeholder="uses" />
            <label className="flex items-center gap-1 text-sm"><input type="checkbox" checked={inviteApproval} onChange={e => setInviteApproval(e.target.checked)} /> requires approval</label>
          </div>
          <button onClick={doInvite} className="px-3 py-1 text-sm bg-[var(--accent)] text-white rounded">Create invite</button>
          {inviteLink && <div className="mt-2 text-xs text-[var(--text-muted)]">Link (shown once): <code className="bg-[var(--bg-app)] px-1">{inviteLink}</code></div>}
          <button onClick={() => setShowInvite(false)} className="ml-2 text-xs text-[var(--text-muted)]">Close</button>
        </div>
      )}

      <h2 className="font-semibold mb-2">Members</h2>
      <div className="space-y-2 mb-6">
        {members.map(m => (
          <div key={m.id} className="card flex items-center justify-between">
            <div>
              <div className="font-medium">{m.display_name} <span className="text-xs text-[var(--text-muted)]">({m.role})</span></div>
              <div className="text-xs text-[var(--text-muted)]">Teams: {m.teams.join(', ') || 'none'}{m.archived ? ' · archived' : ''}</div>
            </div>
            <div className="flex items-center gap-2">
              <select value={m.role} onChange={e => changeRole(m.id, e.target.value)} disabled={m.id === api.getCurrentUser()} className="bg-[var(--bg-app)] border border-[var(--border)] rounded px-2 py-1 text-xs">
                <option value="guest">guest</option>
                <option value="member">member</option>
                <option value="admin">admin</option>
                {m.role === 'owner' && <option value="owner">owner</option>}
              </select>
              <button onClick={() => setSelectedMember(m.id)} className="text-xs px-2 py-1 border border-[var(--border)] rounded">Brain settings</button>
            </div>
          </div>
        ))}
      </div>

      <h2 className="font-semibold mb-2">Teams</h2>
      <div className="space-y-2 mb-6">
        {teams.map(t => (
          <div key={t.id} className="card">
            <div className="font-medium">{t.name} <span className="text-xs text-[var(--text-muted)]">({t.kind})</span></div>
            <div className="text-xs text-[var(--text-muted)] mt-1">{t.members.map(m => m.member_id + ' (' + m.role + ')').join(', ')}</div>
          </div>
        ))}
      </div>

      {selectedMember && (
        <BrainSettingsPanel memberId={selectedMember} onClose={() => setSelectedMember(null)} />
      )}

      <h2 className="font-semibold mb-2">Join requests (pending)</h2>
      <div className="space-y-2">
        {api.listJoinRequests('pending').map((jr: any) => (
          <div key={jr.id} className="card flex items-center justify-between">
            <div className="text-sm">{jr.display_name}</div>
            <div className="flex gap-2">
              <button onClick={() => { api.decideJoinRequest(jr.id, true); setMembers(api.listMembersRole()); }} className="text-xs px-2 py-1 bg-[var(--status-approved)] text-black rounded">Approve</button>
              <button onClick={() => { api.decideJoinRequest(jr.id, false); }} className="text-xs px-2 py-1 bg-[var(--status-archived)] text-white rounded">Reject</button>
            </div>
          </div>
        ))}
        {api.listJoinRequests('pending').length === 0 && <div className="text-xs text-[var(--text-muted)]">None.</div>}
      </div>
    </div>
  );
}

function BrainSettingsPanel({ memberId, onClose }: { memberId: string; onClose: () => void }) {
  const bs = api.getBrainSettings(memberId);
  const [mode, setMode] = useState(bs.mode);
  const [saved, setSaved] = useState(false);
  const save = () => {
    const res = api.setBrainMode(memberId, mode, 'v1');
    if (res.ok) setSaved(true); else alert(res.reason);
  };
  return (
    <div className="card mb-4">
      <div className="flex items-center justify-between mb-2">
        <h3 className="font-semibold">Brain settings: {memberId}</h3>
        <button onClick={onClose} className="text-xs text-[var(--text-muted)]">Close</button>
      </div>
      <div className="text-xs text-[var(--text-muted)] mb-2">Mode controls who can read the brain.</div>
      <select value={mode} onChange={e => setMode(e.target.value as any)} className="bg-[var(--bg-app)] border border-[var(--border)] rounded px-2 py-1 text-sm mb-2">
        <option value="private">private — only owner reads</option>
        <option value="managed">managed — owner/admins read non-sealed items, logged</option>
        <option value="shared">shared — explicit grants only</option>
      </select>
      {mode === 'managed' && (
        <div className="text-xs text-[var(--status-unreviewed)] mb-2">Acceptance required: owner/admin reads are logged and visible to you.</div>
      )}
      <button onClick={save} className="px-3 py-1 text-sm bg-[var(--accent)] text-white rounded">Save mode</button>
      {saved && <span className="ml-2 text-xs text-[var(--status-approved)]">Saved.</span>}
    </div>
  );
}
