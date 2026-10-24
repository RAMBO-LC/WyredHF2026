export type ItemType = 'memory' | 'resource' | 'chunk' | 'pack' | 'review' | 'thread' | 'message' | 'member' | 'agent' | 'mcp' | 'doc' | 'skill';
export type MemoryKind = 'decision' | 'fact' | 'convention' | 'fix' | 'constraint' | 'note';
export type MemoryStatus = 'approved' | 'suggested' | 'superseded' | 'archived';

export interface Memory {
  id: string;
  kind: MemoryKind;
  status: MemoryStatus;
  subject: string;
  statement: string;
  version: number;
  source_date: string;
  evidence_count: number;
  stale_evidence: boolean;
  extractor: string;
  path: string;
  project_id: string;
}
export interface Resource {
  id: string;
  title: string;
  slug: string;
  status: string;
  path: string;
  project_id: string;
  markdown: string;
}
export interface Pack {
  id: string;
  project_id: string;
  task: string;
  markdown: string;
  path: string;
  created_at: string;
  tokens_used: number;
  budget: number;
  omitted_count: number;
  insufficient: boolean;
  engine_version: string;
  items: { id: string; tier: string; score: any; why: string }[];
}
export interface ChatThread {
  id: string;
  project_id: string;
  title: string;
  created_at: string;
  deleted_at: string | null;
}
export interface ChatMessage {
  id: string;
  thread_id: string;
  role: 'user' | 'assistant';
  content: string;
  pack_id: string | null;
  citations: string[];
  model: string | null;
  status: 'complete' | 'failed';
  created_at: string;
}
export interface ReviewItem {
  id: string;
  memory_id: string;
  reason: string;
  path: string;
  created_at: string;
}
export interface GraphNode {
  id: string;
  type: 'memory' | 'resource' | 'member' | 'agent' | 'doc';
  label: string;
  kind?: MemoryKind;
  status?: MemoryStatus;
  path: string;
  depth?: number;
}
export interface GraphEdge { from: string; to: string; type: string; source: string; }
export interface GraphResponse { nodes: GraphNode[]; edges: GraphEdge[]; truncated: boolean; total: number; }
export interface VaultTreeEntry { path: string; id: string; type: ItemType; status?: string; }
export interface SearchResult { id: string; type: ItemType; title: string; snippet: string; status?: string; kind?: string; }
export interface StatusInfo { api: string; db: string; extractor: string; extractor_version: string; approved_count: number; unreviewed_count: number; }

// Workspace entities
export type Visibility = 'private' | 'project' | 'team';
export type Source = 'self' | 'admin_entered';
export interface ProfileField {
  key: string;
  value: string;
  source: Source;
  visibility: Visibility;
  updated_by: string;
  updated_at: string;
}
export interface MemberSkill { name: string; level: 'learning' | 'working' | 'expert' | null; self_declared: boolean; visibility: Visibility; }
export interface TeamMember {
  id: string; // usr_
  display_name: string;
  role_title: string;
  created_by: string;
  created_at: string;
  updated_at: string;
  archived_at: string | null;
  fields: ProfileField[];
  skills: MemberSkill[];
}
export interface Agent {
  id: string; // agt_
  project_id: string | null;
  name: string;
  purpose: string;
  model_provider: string;
  model_name: string;
  status: 'active' | 'paused' | 'archived';
  permissions: { projects: string[]; mcp_servers: string[]; actions: string[] };
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface McpServer {
  id: string; // mcp_
  name: string;
  transport: 'http' | 'stdio';
  endpoint: string | null;
  auth_ref: string | null;
  enabled: boolean;
  allowed_projects: string[];
  allowed_agents: string[];
  last_health_status: 'unknown' | 'ok' | 'error';
  last_health_at: string | null;
  created_by: string;
  created_at: string;
  updated_at: string;
}
export interface Doc {
  id: string; // doc_
  project_id: string | null;
  title: string;
  slug: string;
  owner_member_id: string | null;
  visibility: 'project' | 'team';
  status: 'draft' | 'published' | 'archived';
  current_version: number;
  created_at: string;
  updated_at: string;
}
export interface DocVersion {
  id: string;
  doc_id: string;
  version: number;
  body_markdown: string;
  author: string;
  created_at: string;
}

// Workspace hierarchy / identity / sharing
export type Role = 'owner' | 'admin' | 'member' | 'guest';
export type BrainMode = 'private' | 'managed' | 'shared';
export type Restriction = 'sealed' | 'no_share' | 'no_owner_read';
export type GrantLevel = 'read' | 'comment' | 'edit';
export type SubjectType = 'member' | 'team' | 'workspace';

export interface Workspace {
  id: string;
  name: string;
  owner_id: string;
  policy: { require_approval_for_workspace: boolean; allow_managed: boolean };
}
export interface Team {
  id: string;
  name: string;
  kind: 'team' | 'role';
  members: { member_id: string; role: 'lead' | 'member' }[];
}
export interface ItemAccess {
  id: string;
  item_id: string;
  subject_type: SubjectType;
  subject_id: string;
  level: GrantLevel;
  granted_by: string;
  granted_at: string;
}
export interface ShareRequest {
  id: string;
  item_id: string;
  requester_id: string;
  target: SubjectType;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}
export interface JoinRequest {
  id: string;
  invitation_id: string;
  display_name: string;
  status: 'pending' | 'approved' | 'rejected';
  created_at: string;
}
export interface Invitation {
  id: string;
  role: Role;
  teams: string[];
  expires_at: string;
  max_uses: number;
  uses: number;
  requires_approval: boolean;
  token_hash: string;
  created_by: string;
  revoked: boolean;
}
export interface BrainSettings {
  member_id: string;
  mode: BrainMode;
  accepted_policy_version: string | null;
  accepted_by: string | null;
  accepted_at: string | null;
}
export interface AccessDecision {
  id: string;
  accessor_id: string;
  item_id: string;
  allowed: boolean;
  reason: string;
  created_at: string;
}
export interface MemberRecord {
  id: string;
  display_name: string;
  role: Role;
  teams: string[];
  archived: boolean;
  created_at: string;
}
