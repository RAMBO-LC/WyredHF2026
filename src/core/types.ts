export type MemoryKind =
  | 'decision'
  | 'bug_fix'
  | 'lesson'
  | 'convention'
  | 'constraint'
  | 'reference'
  | 'task_outcome';

export type MemoryStatus =
  | 'suggested'
  | 'approved'
  | 'archived'
  | 'superseded';

export type RelationshipType =
  | 'fixes'
  | 'depends_on'
  | 'conflicts_with'
  | 'related';

export type ReviewItemType =
  | 'merge_suggestion'
  | 'outdated_signal'
  | 'failed_signal'
  | 'stale_evidence';

export type ReviewItemStatus = 'open' | 'resolved' | 'dismissed';

export type FeedbackType =
  | 'useful'
  | 'irrelevant'
  | 'outdated'
  | 'worked'
  | 'failed'
  | 'duplicate_of';

export type ExtractionRejectionReason =
  | 'schema_invalid'
  | 'kind_invalid'
  | 'statement_length'
  | 'subject_invalid'
  | 'quote_not_found'
  | 'exact_duplicate'
  | 'near_duplicate';

export interface Project {
  id: string;
  name: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface ApiKey {
  id: string;
  key_hash: string;
  project_ids: string[];
  name: string;
  revoked: boolean;
  created_at: string;
}

export interface Resource {
  id: string;
  project_id: string;
  title: string;
  locator: string;
  source_ref?: string;
  content_hash: string;
  content: string;
  created_at: string;
  metadata?: Record<string, any>;
}

export interface Chunk {
  id: string;
  project_id: string;
  resource_id: string;
  heading_path: string;
  content: string;
  content_hash: string;
  start_offset: number;
  end_offset: number;
  source_date?: string;
  created_at: string;
}

export interface Memory {
  id: string;
  project_id: string;
  kind: MemoryKind;
  statement: string;
  subject_key: string;
  status: MemoryStatus;
  successor_id?: string;
  version: number;
  created_at: string;
  updated_at: string;
  evidence?: Evidence[];
}

export interface Evidence {
  id: string;
  project_id: string;
  memory_id: string;
  chunk_id: string;
  excerpt: string;
  start_offset: number;
  end_offset: number;
  is_stale: boolean;
  created_at: string;
}

export interface MemoryRelationship {
  id: string;
  project_id: string;
  source_id: string;
  target_id: string;
  type: RelationshipType;
  created_at: string;
}

export interface ExtractionRun {
  id: string;
  project_id: string;
  chunk_id: string;
  chunk_content_hash: string;
  extractor_name: string;
  extractor_version: string;
  status: string;
  candidates_count: number;
  accepted_count: number;
  rejected_count: number;
  created_at: string;
}

export interface RejectedCandidate {
  id: string;
  project_id: string;
  chunk_id: string;
  reason: ExtractionRejectionReason;
  candidate_raw: string;
  created_at: string;
}

export interface AuditEvent {
  id: string;
  project_id: string;
  actor: string;
  event_type: string;
  entity_type: string;
  entity_id: string;
  details: Record<string, any>;
  created_at: string;
}

export interface ContextPack {
  id: string;
  project_id: string;
  query: string;
  budget: number;
  tokens_used: number;
  is_insufficient: boolean;
  selected_ids: string[];
  omitted_ids: { id: string; reason: string }[];
  scores: Record<string, Record<string, number>>;
  engine_version: string;
  markdown: string;
  created_at: string;
}

export interface FeedbackEvent {
  id: string;
  project_id: string;
  actor: string;
  memory_id: string;
  pack_id?: string;
  type: FeedbackType;
  target_memory_id?: string;
  created_at: string;
}

export interface ReviewItem {
  id: string;
  project_id: string;
  type: ReviewItemType;
  status: ReviewItemStatus;
  memory_id?: string;
  target_memory_id?: string;
  details?: Record<string, any>;
  created_at: string;
  resolved_at?: string;
}
