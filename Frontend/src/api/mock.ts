import type {
  Memory, Resource, Pack, ChatThread, ChatMessage, ReviewItem, GraphNode, GraphEdge, GraphResponse,
  VaultTreeEntry, SearchResult, StatusInfo, TeamMember, MemberSkill, Agent, McpServer, Doc, DocVersion,
  Workspace, Team, ItemAccess, ShareRequest, JoinRequest, Invitation, BrainSettings, AccessDecision, MemberRecord, Role, BrainMode,
  SubjectType
} from '../types';
type Visibility = 'private' | 'project' | 'team';
type Source = 'self' | 'admin_entered';

const PROJECT_ID = 'proj_01';
const PROJECT_SLUG = 'team-brain';
const CURRENT_USER = 'usr_me';

// ---------- Workspace / identity / sharing ----------
const workspace: Workspace = { id: 'ws_01', name: 'Team Brain', owner_id: 'usr_me', policy: { require_approval_for_workspace: true, allow_managed: true } };
const teams: Team[] = [
  { id: 'team_01', name: 'Engineering', kind: 'team', members: [{ member_id: 'usr_me', role: 'lead' }, { member_id: 'usr_sam', role: 'member' }] },
];
const membersRole: MemberRecord[] = [
  { id: 'usr_me', display_name: 'Alex (you)', role: 'owner', teams: ['team_01'], archived: false, created_at: '2026-01-01' },
  { id: 'usr_sam', display_name: 'Sam Rivera', role: 'member', teams: ['team_01'], archived: false, created_at: '2026-01-02' },
];
const itemAccess: ItemAccess[] = [];
const shareRequests: ShareRequest[] = [];
const joinRequests: JoinRequest[] = [];
const invitations: Invitation[] = [];
const brainSettings: Record<string, BrainSettings> = {
  'usr_me': { member_id: 'usr_me', mode: 'private', accepted_policy_version: null, accepted_by: null, accepted_at: null },
  'usr_sam': { member_id: 'usr_sam', mode: 'private', accepted_policy_version: null, accepted_by: null, accepted_at: null },
};
const accessDecisions: AccessDecision[] = [];
const restrictions: Record<string, Set<string>> = {};


// ---------- Resources / Memories (knowledge) ----------
const resources: Resource[] = [
  { id: 'res_01JABC', title: 'Payments API: Session notes', slug: 'payments-api-session-notes', status: 'ingested', path: `Projects/${PROJECT_SLUG}/Resources/payments-api-session-notes--res_01JABC.md`, project_id: PROJECT_ID, markdown: '# Payments API\n\n## Decision\nSession middleware validates signed cookies.' },
  { id: 'res_02DEF', title: 'Auth design doc', slug: 'auth-design-doc', status: 'ingested', path: `Projects/${PROJECT_SLUG}/Resources/auth-design-doc--res_02DEF.md`, project_id: PROJECT_ID, markdown: '# Auth design\n\n## TTL\nSESSION_TTL defaults to 3600.' },
];
const memories: Memory[] = [
  { id: 'mem_01J', kind: 'decision', status: 'approved', subject: 'auth.middleware.session', statement: 'Session middleware validates signed cookies before any route handler runs.', version: 3, source_date: '2026-03-14', evidence_count: 2, stale_evidence: false, extractor: 'rules-v1', path: `Projects/${PROJECT_SLUG}/Memories/Approved/decision/session-middleware--mem_01J.md`, project_id: PROJECT_ID },
  { id: 'mem_01K', kind: 'fix', status: 'approved', subject: 'auth.session.ttl', statement: 'Missing SESSION_TTL default added (3600s).', version: 1, source_date: '2026-03-15', evidence_count: 1, stale_evidence: false, extractor: 'rules-v1', path: `Projects/${PROJECT_SLUG}/Memories/Approved/fix/session-ttl--mem_01K.md`, project_id: PROJECT_ID },
  { id: 'mem_01L', kind: 'decision', status: 'suggested', subject: 'auth.middleware.session', statement: 'Session cookies are not signed.', version: 1, source_date: '2026-03-10', evidence_count: 1, stale_evidence: false, extractor: 'rules-v1', path: `Projects/${PROJECT_SLUG}/Memories/Suggested/decision/session-cookies-not-signed--mem_01L.md`, project_id: PROJECT_ID },
];
const reviewItems: ReviewItem[] = [
  { id: 'rev_01', memory_id: 'mem_01L', reason: 'conflict', path: `Projects/${PROJECT_SLUG}/Review/conflict--rev_01.md`, created_at: '2026-03-16' },
];
const packs: Pack[] = [];
const chatThreads: ChatThread[] = [{ id: 'thd_01', project_id: PROJECT_ID, title: 'Session middleware', created_at: '2026-03-16', deleted_at: null }];
const chatMessages: ChatMessage[] = [];

// ---------- Team members ----------
const members: TeamMember[] = [
  {
    id: 'usr_me', display_name: 'Alex (you)', role_title: 'Engineer', created_by: 'usr_me', created_at: '2026-01-01', updated_at: '2026-03-16', archived_at: null,
    fields: [
      { key: 'skills', value: 'TypeScript, React, Python', source: 'self', visibility: 'team', updated_by: 'usr_me', updated_at: '2026-03-16' },
      { key: 'working_style', value: 'Prefers async updates; deep work in mornings.', source: 'self', visibility: 'project', updated_by: 'usr_me', updated_at: '2026-03-16' },
      { key: 'current_focus', value: 'Shipping the workspace shell', source: 'self', visibility: 'team', updated_by: 'usr_me', updated_at: '2026-03-16' },
    ],
    skills: [{ name: 'TypeScript', level: 'expert', self_declared: true, visibility: 'team' }, { name: 'Python', level: 'working', self_declared: true, visibility: 'team' }],
  },
  {
    id: 'usr_sam', display_name: 'Sam Rivera', role_title: 'Designer', created_by: 'usr_me', created_at: '2026-01-02', updated_at: '2026-03-15', archived_at: null,
    fields: [
      { key: 'skills', value: 'Figma, design systems', source: 'self', visibility: 'team', updated_by: 'usr_sam', updated_at: '2026-03-15' },
      { key: 'availability_note', value: 'Part-time, Tue/Thu', source: 'self', visibility: 'project', updated_by: 'usr_sam', updated_at: '2026-03-15' },
    ],
    skills: [{ name: 'Figma', level: 'expert', self_declared: true, visibility: 'team' }],
  },
];

// ---------- Agents ----------
const agents: Agent[] = [
  { id: 'agt_01', project_id: PROJECT_ID, name: 'Context assistant', purpose: 'Answer questions from approved team knowledge', model_provider: 'ollama', model_name: 'gemma3:4b', status: 'active', permissions: { projects: [PROJECT_ID], mcp_servers: [], actions: ['read_context', 'propose_memory'] }, created_by: 'usr_me', created_at: '2026-03-10', updated_at: '2026-03-10' },
  { id: 'agt_02', project_id: PROJECT_ID, name: 'Doc summarizer', purpose: 'Summarize project docs', model_provider: 'ollama', model_name: 'gemma3:4b', status: 'paused', permissions: { projects: [PROJECT_ID], mcp_servers: ['mcp_01'], actions: ['read_context', 'read_docs'] }, created_by: 'usr_me', created_at: '2026-03-12', updated_at: '2026-03-12' },
];

// ---------- MCP servers ----------
const mcpServers: McpServer[] = [
  { id: 'mcp_01', name: 'filesystem', transport: 'stdio', endpoint: 'npx @modelcontextprotocol/server-filesystem /data', auth_ref: null, enabled: false, allowed_projects: [PROJECT_ID], allowed_agents: ['agt_02'], last_health_status: 'unknown', last_health_at: null, created_by: 'usr_me', created_at: '2026-03-10', updated_at: '2026-03-10' },
  { id: 'mcp_02', name: 'github', transport: 'http', endpoint: 'https://api.github.com', auth_ref: 'GITHUB_TOKEN', enabled: true, allowed_projects: [PROJECT_ID], allowed_agents: ['agt_01'], last_health_status: 'ok', last_health_at: '2026-03-16', created_by: 'usr_me', created_at: '2026-03-11', updated_at: '2026-03-11' },
];

// ---------- Docs ----------
const docs: Doc[] = [
  { id: 'doc_01', project_id: PROJECT_ID, title: 'Architecture overview', slug: 'architecture-overview', owner_member_id: 'usr_me', visibility: 'project', status: 'published', current_version: 2, created_at: '2026-02-01', updated_at: '2026-03-15' },
  { id: 'doc_02', project_id: PROJECT_ID, title: 'Onboarding', slug: 'onboarding', owner_member_id: 'usr_sam', visibility: 'team', status: 'draft', current_version: 1, created_at: '2026-03-01', updated_at: '2026-03-01' },
];
const docVersions: DocVersion[] = [
  { id: 'dv_1', doc_id: 'doc_01', version: 1, body_markdown: '# Architecture\n\nInitial draft.', author: 'usr_me', created_at: '2026-02-01' },
  { id: 'dv_2', doc_id: 'doc_01', version: 2, body_markdown: '# Architecture\n\n## Overview\nSystem components and data flow.\n\n## Storage\nPostgres + pgvector.', author: 'usr_me', created_at: '2026-03-15' },
  { id: 'dv_3', doc_id: 'doc_02', version: 1, body_markdown: '# Onboarding\n\nWelcome to the team.', author: 'usr_sam', created_at: '2026-03-01' },
];

const ALLOWED_FIELDS = ['skills', 'working_style', 'communication', 'current_focus', 'preferred_tools', 'availability_note'];

function slugify(s: string) { return s.toLowerCase().replace(/[^a-z0-9]+/g, '-').replace(/^-|-$/g, '').slice(0, 60); }

// ---------- API ----------
function edges_all(_rootId?: string): GraphEdge[] {
  const e: GraphEdge[] = [];
  // evidence edges (mock: mem_01J -> res_01JABC)
  e.push({ from: 'mem_01J', to: 'res_01JABC', type: 'evidence', source: 'database' });
  // relationship edges
  e.push({ from: 'mem_01J', to: 'mem_01K', type: 'fixes', source: 'database' });
  e.push({ from: 'mem_01J', to: 'mem_01L', type: 'conflicts_with', source: 'database' });
  e.push({ from: 'mem_01M', to: 'mem_01J', type: 'related_to', source: 'database' });
  return e;
}

export const api = {
  getCurrentUser: () => CURRENT_USER,
  getProjectId: () => PROJECT_ID,

  getStatus: (): StatusInfo => ({ api: 'ok', db: 'ok', extractor: 'rules-v1', extractor_version: '1.0.0', approved_count: memories.filter(m => m.status === 'approved').length, unreviewed_count: memories.filter(m => m.status === 'suggested').length }),

  // Knowledge
  getVaultTree: (): VaultTreeEntry[] => {
    const e: VaultTreeEntry[] = [];
    resources.forEach(r => e.push({ path: r.path, id: r.id, type: 'resource', status: r.status }));
    memories.forEach(m => e.push({ path: m.path, id: m.id, type: 'memory', status: m.status }));
    packs.forEach(p => e.push({ path: p.path, id: p.id, type: 'pack' }));
    reviewItems.forEach(ri => e.push({ path: ri.path, id: ri.id, type: 'review' }));
    docs.forEach(d => e.push({ path: `Projects/${PROJECT_SLUG}/Docs/${d.slug}--${d.id}.md`, id: d.id, type: 'doc', status: d.status }));
    members.forEach(m => e.push({ path: `People/${m.display_name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,60)}--${m.id}.md`, id: m.id, type: 'member' }));
    agents.forEach(a => e.push({ path: `Agents/${a.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,60)}--${a.id}.md`, id: a.id, type: 'agent' }));
    mcpServers.forEach(s => e.push({ path: `Tools/${s.name.toLowerCase().replace(/[^a-z0-9]+/g,'-').slice(0,60)}--${s.id}.md`, id: s.id, type: 'mcp' }));
    e.push({ path: 'Me.md', id: api.getCurrentUser(), type: 'member' });
    return e;
  },
  getVaultFile: (path: string): string | null => {
    const r = resources.find(x => x.path === path); if (r) return `# ${r.title}\n\n${r.markdown}`;
    const m = memories.find(x => x.path === path); if (m) return `# ${m.statement}\n\n${m.statement}`;
    const d = docs.find(x => path.includes(x.id)); if (d) { const v = docVersions.filter(x=>x.doc_id===d.id).sort((a,b)=>a.version-b.version).pop(); return `# ${d.title}\n\n${v?.body_markdown || ''}`; }
    const mem = members.find(x => path.includes(x.id)); if (mem) return `# ${mem.display_name}\n\nRole: ${mem.role_title}\n\n${mem.fields.map(f=>`## ${f.key}\n${f.value}`).join('\n\n')}`;
    const ag = agents.find(x => path.includes(x.id)); if (ag) return `# ${ag.name}\n\n${ag.purpose}\n\nModel: ${ag.model_provider}/${ag.model_name}\nStatus: ${ag.status}`;
    const mc = mcpServers.find(x => path.includes(x.id)); if (mc) return `# ${mc.name}\n\nTransport: ${mc.transport}\nEndpoint: ${mc.endpoint || '—'}\nAuth: ${mc.auth_ref ? 'Configured' : 'Missing'}\nEnabled: ${mc.enabled}`;
    if (path === 'Me.md') { const me = members.find(x=>x.id===api.getCurrentUser()); return me ? `# Me\n\n${me.display_name}\n\n${me.fields.map(f=>`## ${f.key}\n${f.value}`).join('\n\n')}` : '# Me'; }
    return null;
  },
  search: (q: string): SearchResult[] => {
    const ql = q.toLowerCase(); const out: SearchResult[] = [];
    memories.forEach(m => { if (m.statement.toLowerCase().includes(ql)) out.push({ id: m.id, type: 'memory', title: m.statement, snippet: m.statement.slice(0, 80), status: m.status, kind: m.kind }); });
    resources.forEach(r => { if (r.title.toLowerCase().includes(ql)) out.push({ id: r.id, type: 'resource', title: r.title, snippet: r.markdown.slice(0, 80), status: r.status }); });
    members.forEach(m => { if (m.display_name.toLowerCase().includes(ql)) out.push({ id: m.id, type: 'member', title: m.display_name, snippet: m.role_title }); });
    agents.forEach(a => { if (a.name.toLowerCase().includes(ql)) out.push({ id: a.id, type: 'agent', title: a.name, snippet: a.purpose }); });
    docs.forEach(d => { if (d.title.toLowerCase().includes(ql)) out.push({ id: d.id, type: 'doc', title: d.title, snippet: d.status }); });
    mcpServers.forEach(s => { if (s.name.toLowerCase().includes(ql)) out.push({ id: s.id, type: 'mcp', title: s.name, snippet: s.transport }); });
    return out.slice(0, 50);
  },
  getGraph: (opts?: { includeUnreviewed?: boolean; kinds?: string[]; statuses?: string[]; centerId?: string; depth?: number; limit?: number; q?: string }): GraphResponse => {
    const includeUnreviewed = opts?.includeUnreviewed ?? false;
    const kinds = opts?.kinds;
    const statuses = opts?.statuses;
    const centerId = opts?.centerId;
    const depth = opts?.depth ?? 2;
    const limit = opts?.limit ?? 500;
    const q = opts?.q;
    const rootId = 'root_' + PROJECT_ID;
    let mems = includeUnreviewed ? memories.slice() : memories.filter(m => m.status !== 'suggested');
    if (kinds && kinds.length) mems = mems.filter(m => kinds.includes(m.kind));
    if (statuses && statuses.length) mems = mems.filter(m => statuses.includes(m.status));
    if (q) mems = mems.filter(m => m.statement.toLowerCase().includes(q.toLowerCase()) || m.id.toLowerCase().includes(q.toLowerCase()));
    if (centerId) {
      const visited = new Set<string>([centerId]);
      let frontier = [centerId];
      for (let d = 0; d < depth; d++) {
        const next: string[] = [];
        edges_all(rootId).forEach(e => {
          if (frontier.includes(e.from) && !visited.has(e.to)) { visited.add(e.to); next.push(e.to); }
          if (frontier.includes(e.to) && !visited.has(e.from)) { visited.add(e.from); next.push(e.from); }
        });
        frontier = next;
      }
      mems = mems.filter(m => visited.has(m.id));
    }
    const nodes: GraphNode[] = [];
    // root node
    if (!centerId || centerId === rootId) {
      nodes.push({ id: rootId, type: 'memory', label: 'Root: ' + PROJECT_SLUG, kind: 'note', status: 'approved', path: '', depth: 0 });
    }
    mems.forEach(m => nodes.push({ id: m.id, type: 'memory', label: m.statement.slice(0, 40), kind: m.kind, status: m.status, path: m.path, depth: 1 }));
    const resIds = new Set<string>();
    edges_all(rootId).forEach(e => {
      if (mems.find(m => m.id === e.from) && e.to.startsWith('res_')) resIds.add(e.to);
      if (mems.find(m => m.id === e.to) && e.from.startsWith('res_')) resIds.add(e.from);
    });
    resources.forEach(r => {
      if (resIds.size === 0 || resIds.has(r.id)) nodes.push({ id: r.id, type: 'resource', label: r.title, path: r.path, depth: 2 });
    });
    const truncated = nodes.length > limit;
    const finalNodes = truncated ? nodes.slice(0, limit) : nodes;
    const nodeIds = new Set(finalNodes.map(n => n.id));
    const edges: GraphEdge[] = edges_all(rootId).filter(e => nodeIds.has(e.from) && nodeIds.has(e.to));
    // containment edges from root to top-level nodes (depth 1)
    if (finalNodes.find(n => n.id === rootId)) {
      finalNodes.filter(n => n.depth === 1).forEach(n => {
        edges.push({ from: rootId, to: n.id, type: 'contains', source: 'directory' });
      });
    }
    return { nodes: finalNodes, edges, truncated, total: nodes.length };
  },
  getMemory: (id: string) => memories.find(m => m.id === id) || null,
  getReviewItems: () => reviewItems.slice(),
  approveMemory: (id: string) => { const m = memories.find(x => x.id === id); if (m) m.status = 'approved'; },
  archiveMemory: (id: string) => { const m = memories.find(x => x.id === id); if (m) m.status = 'archived'; },
  getPack: (id: string) => packs.find(p => p.id === id) || null,
  generatePack: (task: string, budget: number, includeUnreviewed: boolean): Pack => {
    const items = memories.filter(m => includeUnreviewed || m.status === 'approved').slice(0, 3).map((m, i) => ({ id: m.id, tier: i === 0 ? 'constraint' : 'decision', score: { lexical: 0.8 }, why: 'direct' }));
    const p: Pack = { id: 'pk_' + (packs.length + 1), project_id: PROJECT_ID, task, markdown: `# Context for: ${task}\n\n${items.map(it => `- [[${it.id}]]`).join('\n')}`, path: `Projects/${PROJECT_SLUG}/Packs/${packs.length + 1}.md`, created_at: new Date().toISOString(), tokens_used: Math.min(budget, 1000), budget, omitted_count: 0, insufficient: false, engine_version: 'ctx-v1', items };
    packs.push(p); return p;
  },
  listThreads: () => chatThreads.filter(t => !t.deleted_at),
  createThread: (title?: string) => { const t: ChatThread = { id: 'thd_' + (chatThreads.length + 1), project_id: PROJECT_ID, title: title || 'New chat', created_at: new Date().toISOString(), deleted_at: null }; chatThreads.push(t); return t; },
  getThread: (id: string) => ({ thread: chatThreads.find(t => t.id === id)!, messages: chatMessages.filter(m => m.thread_id === id) }),
  renameThread: (id: string, title: string) => { const t = chatThreads.find(x => x.id === id); if (t) t.title = title; },
  deleteThread: (id: string) => { const t = chatThreads.find(x => x.id === id); if (t) t.deleted_at = new Date().toISOString(); },
  sendMessage: (threadId: string, content: string): ChatMessage => {
    const userMsg: ChatMessage = { id: 'msg_' + (chatMessages.length + 1), thread_id: threadId, role: 'user', content, pack_id: null, citations: [], model: null, status: 'complete', created_at: new Date().toISOString() };
    chatMessages.push(userMsg);
    const pack = api.generatePack(content, 2000, false);
    const approved = memories.filter(m => m.status === 'approved').slice(0, 2);
    const citations = approved.map(m => m.id);
    const assistantMsg: ChatMessage = { id: 'msg_' + (chatMessages.length + 1), thread_id: threadId, role: 'assistant', content: `## Approved team knowledge\n\n${approved.map(m => `- [[${m.id}]] ${m.statement}`).join('\n')}`, pack_id: pack.id, citations, model: null, status: 'complete', created_at: new Date().toISOString() };
    chatMessages.push(assistantMsg);
    return assistantMsg;
  },

  // Team
  listMembers: () => members.slice(),
  getMember: (id: string) => members.find(m => m.id === id) || null,
  createMember: (name: string, role: string) => {
    const m: TeamMember = { id: 'usr_' + (members.length + 1), display_name: name, role_title: role, created_by: CURRENT_USER, created_at: new Date().toISOString(), updated_at: new Date().toISOString(), archived_at: null, fields: [], skills: [] };
    members.push(m); return m;
  },
  updateMemberField: (memberId: string, key: string, value: string, visibility: Visibility, source: Source) => {
    if (!ALLOWED_FIELDS.includes(key)) throw new Error('field_not_allowed');
    const m = members.find(x => x.id === memberId); if (!m) return;
    const existing = m.fields.find(f => f.key === key);
    if (existing) { existing.value = value; existing.visibility = visibility; existing.source = source; existing.updated_by = CURRENT_USER; existing.updated_at = new Date().toISOString(); }
    else m.fields.push({ key, value, source, visibility, updated_by: CURRENT_USER, updated_at: new Date().toISOString() });
  },
  deleteMemberField: (memberId: string, key: string) => {
    const m = members.find(x => x.id === memberId); if (!m) return;
    m.fields = m.fields.filter(f => f.key !== key);
  },
  addSkill: (memberId: string, name: string, level: MemberSkill['level']) => {
    const m = members.find(x => x.id === memberId); if (!m) return;
    if (!m.skills.find(s => s.name === name)) m.skills.push({ name, level, self_declared: true, visibility: 'team' });
  },
  exportMember: (memberId: string) => {
    const m = members.find(x => x.id === memberId); if (!m) return null;
    return { id: m.id, display_name: m.display_name, role_title: m.role_title, fields: m.fields, skills: m.skills };
  },
  archiveMember: (memberId: string) => { const m = members.find(x => x.id === memberId); if (m) m.archived_at = new Date().toISOString(); },

  // Agents
  listAgents: () => agents.slice(),
  getAgent: (id: string) => agents.find(a => a.id === id) || null,
  createAgent: (name: string, purpose: string, provider: string, model: string) => {
    const a: Agent = { id: 'agt_' + (agents.length + 1), project_id: PROJECT_ID, name, purpose, model_provider: provider, model_name: model, status: 'active', permissions: { projects: [PROJECT_ID], mcp_servers: [], actions: ['read_context'] }, created_by: CURRENT_USER, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    agents.push(a); return a;
  },
  updateAgent: (id: string, patch: Partial<Agent>) => {
    const a = agents.find(x => x.id === id); if (!a) return;
    Object.assign(a, patch, { updated_at: new Date().toISOString() });
  },

  // MCP
  listMcp: () => mcpServers.slice(),
  getMcp: (id: string) => mcpServers.find(s => s.id === id) || null,
  createMcp: (name: string, transport: 'http' | 'stdio', endpoint: string | null, auth_ref: string | null) => {
    // reject secret-like auth_ref
    if (auth_ref && (auth_ref.length > 200 || /^(sk-|ghp_|xoxb-|AKIA)/.test(auth_ref))) throw new Error('secret_in_auth_ref');
    const s: McpServer = { id: 'mcp_' + (mcpServers.length + 1), name, transport, endpoint, auth_ref, enabled: false, allowed_projects: [PROJECT_ID], allowed_agents: [], last_health_status: 'unknown', last_health_at: null, created_by: CURRENT_USER, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    mcpServers.push(s); return s;
  },
  toggleMcp: (id: string, enabled: boolean) => { const s = mcpServers.find(x => x.id === id); if (s) { s.enabled = enabled; s.updated_at = new Date().toISOString(); } },
  healthMcp: (id: string) => {
    const s = mcpServers.find(x => x.id === id); if (!s) return;
    s.last_health_status = s.enabled ? 'ok' : 'error';
    s.last_health_at = new Date().toISOString();
    return { status: s.last_health_status, at: s.last_health_at };
  },

  // Docs
  listDocs: () => docs.slice(),
  getDoc: (id: string) => docs.find(d => d.id === id) || null,
  getDocVersions: (docId: string) => docVersions.filter(v => v.doc_id === docId).sort((a, b) => a.version - b.version),
  createDoc: (title: string) => {
    const d: Doc = { id: 'doc_' + (docs.length + 1), project_id: PROJECT_ID, title, slug: slugify(title), owner_member_id: CURRENT_USER, visibility: 'project', status: 'draft', current_version: 1, created_at: new Date().toISOString(), updated_at: new Date().toISOString() };
    docs.push(d);
    docVersions.push({ id: 'dv_' + (docVersions.length + 1), doc_id: d.id, version: 1, body_markdown: '', author: CURRENT_USER, created_at: new Date().toISOString() });
    return d;
  },
  addDocVersion: (docId: string, body: string, expectedVersion: number) => {
    const d = docs.find(x => x.id === docId); if (!d) return { ok: false };
    if (d.current_version !== expectedVersion) return { ok: false, conflict: true };
    const nv = d.current_version + 1;
    docVersions.push({ id: 'dv_' + (docVersions.length + 1), doc_id: docId, version: nv, body_markdown: body, author: CURRENT_USER, created_at: new Date().toISOString() });
    d.current_version = nv; d.updated_at = new Date().toISOString();
    return { ok: true };
  },
  // Workspace
  getWorkspace: () => workspace,
  patchWorkspacePolicy: (p: Partial<Workspace['policy']>) => { Object.assign(workspace.policy, p); },
  listMembersRole: () => membersRole.slice(),
  getMemberRole: (id: string) => membersRole.find(m => m.id === id) || null,
  changeMemberRole: (actorId: string, memberId: string, newRole: Role) => {
    const actor = membersRole.find(m => m.id === actorId);
    const target = membersRole.find(m => m.id === memberId);
    if (!actor || !target) return { ok: false, reason: 'not_found' };
    const rank: Record<Role, number> = { guest: 0, member: 1, admin: 2, owner: 3 };
    if (rank[newRole] > rank[actor.role]) return { ok: false, reason: 'cannot_grant_above' };
    // last owner check
    if (target.role === 'owner' && newRole !== 'owner') {
      const owners = membersRole.filter(m => m.role === 'owner' && !m.archived);
      if (owners.length <= 1) return { ok: false, reason: 'last_owner' };
    }
    // last admin check
    if (target.role === 'admin' && newRole !== 'admin' && newRole !== 'owner') {
      const admins = membersRole.filter(m => (m.role === 'admin' || m.role === 'owner') && !m.archived);
      if (admins.length <= 1) return { ok: false, reason: 'last_admin' };
    }
    target.role = newRole;
    return { ok: true };
  },
  archiveMemberRole: (id: string) => {
    const m = membersRole.find(x => x.id === id); if (!m) return;
    // revoke grants created by them
    for (let i = itemAccess.length - 1; i >= 0; i--) { if (itemAccess[i].granted_by === id) itemAccess.splice(i, 1); }
    m.archived = true;
  },
  transferOwnership: (fromId: string, toId: string) => {
    const from = membersRole.find(m => m.id === fromId);
    const to = membersRole.find(m => m.id === toId);
    if (!from || !to || from.role !== 'owner') return { ok: false };
    from.role = 'admin'; to.role = 'owner'; workspace.owner_id = toId;
    return { ok: true };
  },

  // Teams
  listTeams: () => teams.slice(),
  createTeam: (name: string, kind: 'team' | 'role' = 'team') => { const t: Team = { id: 'team_' + (teams.length + 1), name, kind, members: [] }; teams.push(t); return t; },
  addTeamMember: (teamId: string, memberId: string, role: 'lead' | 'member' = 'member') => {
    const t = teams.find(x => x.id === teamId); if (!t) return;
    if (!t.members.find(m => m.member_id === memberId)) t.members.push({ member_id: memberId, role });
  },
  removeTeamMember: (teamId: string, memberId: string) => {
    const t = teams.find(x => x.id === teamId); if (!t) return;
    t.members = t.members.filter(m => m.member_id !== memberId);
    // revoke shares into that team
    for (let i = itemAccess.length - 1; i >= 0; i--) {
      if (itemAccess[i].subject_type === 'team' && itemAccess[i].subject_id === teamId) itemAccess.splice(i, 1);
    }
  },

  // Invitations
  createInvitation: (role: Role, teams: string[], expiryDays: number, maxUses: number, requiresApproval: boolean, createdBy: string) => {
    const tok = 'inv_' + Math.random().toString(36).slice(2);
    const inv: Invitation = { id: 'inv_' + (invitations.length + 1), role, teams, expires_at: new Date(Date.now() + expiryDays * 86400000).toISOString(), max_uses: maxUses, uses: 0, requires_approval: requiresApproval, token_hash: tok, created_by: createdBy, revoked: false };
    invitations.push(inv);
    return { invitation: inv, token: tok };
  },
  acceptInvitation: (token: string, displayName: string) => {
    const inv = invitations.find(i => i.token_hash === token && !i.revoked);
    if (!inv) return { ok: false, reason: 'invalid' };
    if (new Date(inv.expires_at) < new Date()) return { ok: false, reason: 'invalid' };
    if (inv.uses >= inv.max_uses) return { ok: false, reason: 'invalid' };
    inv.uses += 1;
    if (inv.requires_approval) {
      const jr: JoinRequest = { id: 'jr_' + (joinRequests.length + 1), invitation_id: inv.id, display_name: displayName, status: 'pending', created_at: new Date().toISOString() };
      joinRequests.push(jr);
      return { ok: true, pending: true, request: jr };
    }
    const m: MemberRecord = { id: 'usr_' + (membersRole.length + 1), display_name: displayName, role: inv.role, teams: inv.teams, archived: false, created_at: new Date().toISOString() };
    membersRole.push(m);
    inv.teams.forEach(tid => api.addTeamMember(tid, m.id, 'member'));
    return { ok: true, pending: false, member: m, token: 'tok_' + Math.random().toString(36).slice(2) };
  },
  listJoinRequests: (status?: string) => joinRequests.filter(j => !status || j.status === status),
  decideJoinRequest: (id: string, approve: boolean) => {
    const jr = joinRequests.find(j => j.id === id); if (!jr) return;
    jr.status = approve ? 'approved' : 'rejected';
    if (approve) {
      const inv = invitations.find(i => i.id === jr.invitation_id);
      if (inv) {
        const m: MemberRecord = { id: 'usr_' + (membersRole.length + 1), display_name: jr.display_name, role: inv.role, teams: inv.teams, archived: false, created_at: new Date().toISOString() };
        membersRole.push(m);
        inv.teams.forEach(tid => api.addTeamMember(tid, m.id, 'member'));
      }
    }
  },
  revokeInvitation: (id: string) => { const inv = invitations.find(i => i.id === id); if (inv) inv.revoked = true; },

  // Sharing
  listGrants: (itemId: string) => itemAccess.filter(g => g.item_id === itemId),
  grantAccess: (itemId: string, subjectType: any, subjectId: string, level: any, grantedBy: string) => {
    const g: ItemAccess = { id: 'gr_' + (itemAccess.length + 1), item_id: itemId, subject_type: subjectType, subject_id: subjectId, level, granted_by: grantedBy, granted_at: new Date().toISOString() };
    itemAccess.push(g); return g;
  },
  revokeGrant: (grantId: string) => { const idx = itemAccess.findIndex(g => g.id === grantId); if (idx >= 0) itemAccess.splice(idx, 1); },
  createShareRequest: (itemId: string, requesterId: string, target: SubjectType) => {
    const sr: ShareRequest = { id: 'sr_' + (shareRequests.length + 1), item_id: itemId, requester_id: requesterId, target, status: 'pending', created_at: new Date().toISOString() };
    shareRequests.push(sr); return sr;
  },
  listShareRequests: (status?: string) => shareRequests.filter(s => !status || s.status === status),
  decideShareRequest: (id: string, approve: boolean) => {
    const sr = shareRequests.find(s => s.id === id); if (!sr) return;
    sr.status = approve ? 'approved' : 'rejected';
    if (approve) api.grantAccess(sr.item_id, sr.target, 'workspace', 'read', 'admin');
  },

  // Restrictions
  setRestriction: (itemId: string, restriction: any, _authorId: string) => {
    if (!restrictions[itemId]) restrictions[itemId] = new Set();
    restrictions[itemId].add(restriction);
  },
  removeRestriction: (itemId: string, restriction: any) => {
    restrictions[itemId]?.delete(restriction);
  },
  getRestrictions: (itemId: string) => Array.from(restrictions[itemId] || []),

  // Brain settings
  getBrainSettings: (memberId: string) => brainSettings[memberId] || { member_id: memberId, mode: 'private', accepted_policy_version: null, accepted_by: null, accepted_at: null },
  setBrainMode: (memberId: string, mode: BrainMode, policyVersion: string) => {
    if (mode === 'managed' && !workspace.policy.allow_managed) return { ok: false, reason: 'managed_not_allowed' };
    brainSettings[memberId] = { member_id: memberId, mode, accepted_policy_version: policyVersion, accepted_by: memberId, accepted_at: new Date().toISOString() };
    return { ok: true };
  },
  listAccessDecisions: (_memberId: string) => accessDecisions.filter(d => d.item_id.startsWith('mem_') || true).slice(0, 50),

  // Authorize (simplified)
  authorize: (actorId: string, _action: string, itemId: string) => {
    const actor = membersRole.find(m => m.id === actorId);
    // sealed check
    const restr = restrictions[itemId] || new Set();
    // determine author (mock: item author is usr_me for memories)
    const authorId = 'usr_me';
    if (restr.has('sealed') && actorId !== authorId) {
      const dec: AccessDecision = { id: 'ad_' + (accessDecisions.length + 1), accessor_id: actorId, item_id: itemId, allowed: false, reason: 'sealed', created_at: new Date().toISOString() };
      accessDecisions.push(dec);
      return { allowed: false, reason: 'sealed' };
    }
    // role-based
    if (actor && (actor.role === 'owner' || actor.role === 'admin')) {
      // managed brain: owner/admin can read non-sealed
      const dec: AccessDecision = { id: 'ad_' + (accessDecisions.length + 1), accessor_id: actorId, item_id: itemId, allowed: true, reason: 'role', created_at: new Date().toISOString() };
      accessDecisions.push(dec);
      return { allowed: true, reason: 'role' };
    }
    // explicit grant
    const grant = itemAccess.find(g => g.item_id === itemId && (g.subject_id === actorId || g.subject_type === 'workspace'));
    if (grant) {
      const dec: AccessDecision = { id: 'ad_' + (accessDecisions.length + 1), accessor_id: actorId, item_id: itemId, allowed: true, reason: 'grant', created_at: new Date().toISOString() };
      accessDecisions.push(dec);
      return { allowed: true, reason: 'grant' };
    }
    const dec: AccessDecision = { id: 'ad_' + (accessDecisions.length + 1), accessor_id: actorId, item_id: itemId, allowed: false, reason: 'default_deny', created_at: new Date().toISOString() };
    accessDecisions.push(dec);
    return { allowed: false, reason: 'default_deny' };
  },
  recordAccessDecision: (accessorId: string, itemId: string, allowed: boolean, reason: string) => {
    accessDecisions.push({ id: 'ad_' + (accessDecisions.length + 1), accessor_id: accessorId, item_id: itemId, allowed, reason, created_at: new Date().toISOString() });
  },

  // Export (mock)
  exportVault: () => ({ ok: true }),
};

export { PROJECT_ID, PROJECT_SLUG, ALLOWED_FIELDS, CURRENT_USER };
