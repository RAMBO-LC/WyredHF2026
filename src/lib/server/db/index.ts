import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';
import {
  Resource,
  CreateResourceInput,
  Chunk,
  Memory,
  CreateMemoryInput,
  MemoryRelationship,
  MemoryKind,
  MemoryStatus,
  RelationType,
  ProcessingStatus,
  RetrievedEvidence,
  SearchResult,
  nowISO,
  generateId
} from '$lib/types';

const DB_PATH = resolve(process.cwd(), 'data', 'team-brain.db');
const DATA_DIR = resolve(process.cwd(), 'data');

mkdirSync(DATA_DIR, { recursive: true });

export const db = new Database(DB_PATH);
db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

// ============================================
// Projects
// ============================================

export function createProject(name: string, description = ''): { id: string } {
  const id = generateId();
  const now = nowISO();
  db.prepare(`
    INSERT INTO projects (id, name, description, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?)
  `).run(id, name, description, now, now);
  return { id };
}

export function getProjects(): Array<{ id: string; name: string; description: string; created_at: string; updated_at: string }> {
  return db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as any[];
}

export function getProject(id: string) {
  return db.prepare('SELECT * FROM projects WHERE id = ?').get(id);
}

export function updateProject(id: string, name: string, description: string) {
  const now = nowISO();
  return db.prepare(`
    UPDATE projects SET name = ?, description = ?, updated_at = ? WHERE id = ?
  `).run(name, description, now, id);
}

export function deleteProject(id: string) {
  return db.prepare('DELETE FROM projects WHERE id = ?').run(id);
}

// ============================================
// Resources
// ============================================

function computeContentHash(content: string): string {
  // Simple hash for duplicate detection
  let hash = 0;
  for (let i = 0; i < content.length; i++) {
    const char = content.charCodeAt(i);
    hash = ((hash << 5) - hash) + char;
    hash = hash & hash;
  }
  return Math.abs(hash).toString(16);
}

export function createResource(input: CreateResourceInput): Resource {
  const id = generateId();
  const now = nowISO();
  const contentHash = computeContentHash(input.rawContent);

  // Check for duplicate
  const existing = db.prepare('SELECT id FROM resources WHERE content_hash = ? AND project_id = ?').get(contentHash, input.projectId || null);
  if (existing) {
    throw new Error(`Duplicate resource detected: ${existing.id}`);
  }

  const resource: Resource = {
    id,
    title: input.title,
    projectId: input.projectId || null,
    sourceType: input.sourceType,
    sourceUri: input.sourceUri || null,
    rawContent: input.rawContent,
    normalizedMarkdown: null,
    metadata: input.metadata || {},
    processingStatus: 'pending',
    errorMessage: null,
    createdAt: now,
    updatedAt: now
  };

  db.prepare(`
    INSERT INTO resources (id, title, project_id, source_type, source_uri, raw_content, normalized_markdown, metadata, processing_status, error_message, content_hash, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    resource.title,
    resource.projectId,
    resource.sourceType,
    resource.sourceUri,
    resource.rawContent,
    resource.normalizedMarkdown,
    JSON.stringify(resource.metadata),
    resource.processingStatus,
    resource.errorMessage,
    contentHash,
    resource.createdAt,
    resource.updatedAt
  );

  logEvent({ resourceId: id, eventType: 'resource_created', details: { title: resource.title } });
  return resource;
}

export function getResource(id: string): Resource | null {
  const row = db.prepare('SELECT * FROM resources WHERE id = ?').get(id);
  if (!row) return null;
  return mapResourceRow(row);
}

export function getResources(projectId?: string, status?: ProcessingStatus): Resource[] {
  let query = 'SELECT * FROM resources';
  const params: any[] = [];

  if (projectId || status) {
    query += ' WHERE';
    if (projectId) {
      query += ' project_id = ?';
      params.push(projectId);
    }
    if (status) {
      if (projectId) query += ' AND';
      query += ' processing_status = ?';
      params.push(status);
    }
  }
  query += ' ORDER BY created_at DESC';

  return db.prepare(query).all(...params).map(mapResourceRow) as Resource[];
}

export function updateResourceStatus(id: string, status: ProcessingStatus, errorMessage?: string, normalizedMarkdown?: string) {
  const now = nowISO();
  let query = 'UPDATE resources SET processing_status = ?, updated_at = ?';
  const params: any[] = [status, now];

  if (errorMessage !== undefined) {
    query += ', error_message = ?';
    params.push(errorMessage);
  }
  if (normalizedMarkdown !== undefined) {
    query += ', normalized_markdown = ?';
    params.push(normalizedMarkdown);
  }
  query += ' WHERE id = ?';
  params.push(id);

  const result = db.prepare(query).run(...params);
  logEvent({ resourceId: id, eventType: 'resource_status_changed', details: { status, errorMessage } });
  return result.changes > 0;
}

export function deleteResource(id: string) {
  // Chunks will cascade delete
  const result = db.prepare('DELETE FROM resources WHERE id = ?').run(id);
  logEvent({ resourceId: id, eventType: 'resource_deleted', details: {} });
  return result.changes > 0;
}

function mapResourceRow(row: any): Resource {
  return {
    id: row.id,
    title: row.title,
    projectId: row.project_id,
    sourceType: row.source_type,
    sourceUri: row.source_uri,
    rawContent: row.raw_content,
    normalizedMarkdown: row.normalized_markdown,
    metadata: JSON.parse(row.metadata || '{}'),
    processingStatus: row.processing_status,
    errorMessage: row.error_message,
    createdAt: row.created_at,
    updatedAt: row.updated_at
  };
}

// ============================================
// Chunks
// ============================================

export function createChunks(chunks: Omit<Chunk, 'id' | 'createdAt'>[]): Chunk[] {
  const now = nowISO();
  const stmt = db.prepare(`
    INSERT INTO chunks (id, resource_id, chunk_index, content, token_count, metadata, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);

  const transaction = db.transaction((chunks: typeof chunks) => {
    const created: Chunk[] = [];
    for (const chunk of chunks) {
      const id = generateId();
      const fullChunk: Chunk = { ...chunk, id, createdAt: now };
      stmt.run(id, chunk.resourceId, chunk.chunkIndex, chunk.content, chunk.tokenCount, JSON.stringify(chunk.metadata), now);
      created.push(fullChunk);
    }
    return created;
  });

  return transaction(chunks);
}

export function getChunksByResource(resourceId: string): Chunk[] {
  return db.prepare('SELECT * FROM chunks WHERE resource_id = ? ORDER BY chunk_index').all(resourceId).map(mapChunkRow) as Chunk[];
}

export function getChunk(id: string): Chunk | null {
  const row = db.prepare('SELECT * FROM chunks WHERE id = ?').get(id);
  return row ? mapChunkRow(row) : null;
}

function mapChunkRow(row: any): Chunk {
  return {
    id: row.id,
    resourceId: row.resource_id,
    chunkIndex: row.chunk_index,
    content: row.content,
    tokenCount: row.token_count,
    metadata: JSON.parse(row.metadata || '{}'),
    createdAt: row.created_at
  };
}

// ============================================
// Memories
// ============================================

export function createMemory(input: CreateMemoryInput): Memory {
  const id = generateId();
  const now = nowISO();

  const memory: Memory = {
    id,
    projectId: input.projectId || null,
    title: input.title,
    kind: input.kind,
    summary: input.summary,
    content: input.content || null,
    tags: input.tags || [],
    sourceResourceIds: input.sourceResourceIds || [],
    evidence: input.evidence || [],
    status: input.status || 'suggested',
    createdAt: now,
    updatedAt: now,
    supersedesMemoryId: input.supersedesMemoryId || null
  };

  db.prepare(`
    INSERT INTO memories (id, project_id, title, kind, summary, content, tags, source_resource_ids, evidence, status, supersedes_memory_id, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    id,
    memory.projectId,
    memory.title,
    memory.kind,
    memory.summary,
    memory.content,
    JSON.stringify(memory.tags),
    JSON.stringify(memory.sourceResourceIds),
    JSON.stringify(memory.evidence),
    memory.status,
    memory.supersedesMemoryId,
    memory.createdAt,
    memory.updatedAt
  );

  logEvent({ memoryId: id, eventType: 'memory_created', details: { kind: memory.kind, status: memory.status } });
  return memory;
}

export function getMemory(id: string): Memory | null {
  const row = db.prepare('SELECT * FROM memories WHERE id = ?').get(id);
  return row ? mapMemoryRow(row) : null;
}

export function getMemories(projectId?: string, kind?: MemoryKind, status?: MemoryStatus): Memory[] {
  let query = 'SELECT * FROM memories';
  const params: any[] = [];
  const conditions: string[] = [];

  if (projectId) {
    conditions.push('project_id = ?');
    params.push(projectId);
  }
  if (kind) {
    conditions.push('kind = ?');
    params.push(kind);
  }
  if (status) {
    conditions.push('status = ?');
    params.push(status);
  }

  if (conditions.length > 0) {
    query += ' WHERE ' + conditions.join(' AND ');
  }
  query += ' ORDER BY created_at DESC';

  return db.prepare(query).all(...params).map(mapMemoryRow) as Memory[];
}

export function updateMemoryStatus(id: string, status: MemoryStatus): boolean {
  const now = nowISO();
  const result = db.prepare('UPDATE memories SET status = ?, updated_at = ? WHERE id = ?').run(status, now, id);
  logEvent({ memoryId: id, eventType: 'memory_status_changed', details: { status } });
  return result.changes > 0;
}

export function supersedeMemory(oldMemoryId: string, newMemory: CreateMemoryInput): Memory {
  const newMem = createMemory({ ...newMemory, supersedesMemoryId: oldMemoryId });
  updateMemoryStatus(oldMemoryId, 'superseded');
  logEvent({ memoryId: oldMemoryId, eventType: 'memory_superseded', details: { newMemoryId: newMem.id } });
  return newMem;
}

export function deleteMemory(id: string) {
  const result = db.prepare('DELETE FROM memories WHERE id = ?').run(id);
  logEvent({ memoryId: id, eventType: 'memory_deleted', details: {} });
  return result.changes > 0;
}

function mapMemoryRow(row: any): Memory {
  return {
    id: row.id,
    projectId: row.project_id,
    title: row.title,
    kind: row.kind,
    summary: row.summary,
    content: row.content,
    tags: JSON.parse(row.tags || '[]'),
    sourceResourceIds: JSON.parse(row.source_resource_ids || '[]'),
    evidence: JSON.parse(row.evidence || '[]'),
    status: row.status,
    createdAt: row.created_at,
    updatedAt: row.updated_at,
    supersedesMemoryId: row.supersedes_memory_id
  };
}

// ============================================
// Memory Relationships
// ============================================

export function createMemoryRelationship(
  fromMemoryId: string,
  toMemoryId: string,
  type: RelationType,
  evidenceResourceIds: string[] = []
): MemoryRelationship {
  const id = generateId();
  const now = nowISO();

  const relation: MemoryRelationship = {
    id,
    fromMemoryId,
    toMemoryId,
    type,
    evidenceResourceIds,
    status: 'suggested',
    createdAt: now
  };

  db.prepare(`
    INSERT INTO memory_relationships (id, from_memory_id, to_memory_id, type, evidence_resource_ids, status, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `).run(id, fromMemoryId, toMemoryId, type, JSON.stringify(evidenceResourceIds), 'suggested', now);

  return relation;
}

export function getMemoryRelationships(memoryId: string): MemoryRelationship[] {
  return db.prepare(`
    SELECT * FROM memory_relationships WHERE from_memory_id = ? OR to_memory_id = ?
  `).all(memoryId, memoryId).map(mapRelationRow) as MemoryRelationship[];
}

export function approveMemoryRelationship(id: string): boolean {
  const result = db.prepare('UPDATE memory_relationships SET status = ? WHERE id = ?').run('approved', id);
  return result.changes > 0;
}

function mapRelationRow(row: any): MemoryRelationship {
  return {
    id: row.id,
    fromMemoryId: row.from_memory_id,
    toMemoryId: row.to_memory_id,
    type: row.type,
    evidenceResourceIds: JSON.parse(row.evidence_resource_ids || '[]'),
    status: row.status,
    createdAt: row.created_at
  };
}

// ============================================
// Search & Retrieval
// ============================================

export function searchResourcesAndMemories(query: string, projectId?: string, limit = 20): SearchResult {
  const searchTerm = `%${query.toLowerCase()}%`;
  const params: any[] = [searchTerm, searchTerm];
  let whereClause = 'WHERE (LOWER(r.title) LIKE ? OR LOWER(r.raw_content) LIKE ?';
  let memWhereClause = 'WHERE (LOWER(m.title) LIKE ? OR LOWER(m.summary) LIKE ? OR LOWER(m.content) LIKE ?';
  const memParams: any[] = [searchTerm, searchTerm, searchTerm];

  if (projectId) {
    whereClause += ' AND r.project_id = ?';
    memWhereClause += ' AND m.project_id = ?';
    params.push(projectId);
    memParams.push(projectId);
  }
  whereClause += ')';
  memWhereClause += ') AND m.status = ?';
  memParams.push('approved');

  const resources = db.prepare(`
    SELECT r.*, 'resource' as source_type
    FROM resources r
    ${whereClause}
    ORDER BY r.created_at DESC
    LIMIT ?
  `).all(...params, limit);

  const memories = db.prepare(`
    SELECT m.*, 'memory' as source_type
    FROM memories m
    ${memWhereClause}
    ORDER BY m.created_at DESC
    LIMIT ?
  `).all(...memParams, limit);

  // Get chunks for resources
  const resourceIds = resources.map((r: any) => r.id);
  let chunks: any[] = [];
  if (resourceIds.length > 0) {
    const placeholders = resourceIds.map(() => '?').join(',');
    chunks = db.prepare(`
      SELECT c.*, r.title as resource_title, r.source_uri as resource_uri
      FROM chunks c
      JOIN resources r ON c.resource_id = r.id
      WHERE c.resource_id IN (${placeholders})
      ORDER BY c.chunk_index
    `).all(...resourceIds);
  }

  const evidence: RetrievedEvidence[] = [];

  for (const resource of resources) {
    const resourceChunks = chunks.filter((c: any) => c.resource_id === resource.id);
    for (const chunk of resourceChunks) {
      evidence.push({
        resourceId: resource.id,
        chunkId: chunk.id,
        title: resource.title,
        excerpt: chunk.content.substring(0, 500),
        sourceUri: resource.source_uri,
        location: `Chunk ${chunk.chunk_index + 1}`,
        score: 1.0
      });
    }
    if (resourceChunks.length === 0) {
      evidence.push({
        resourceId: resource.id,
        title: resource.title,
        excerpt: resource.raw_content.substring(0, 500),
        sourceUri: resource.source_uri,
        score: 1.0
      });
    }
  }

  for (const memory of memories) {
    for (const ev of memory.evidence) {
      evidence.push({
        resourceId: ev.resourceId,
        chunkId: ev.chunkId,
        title: memory.title,
        excerpt: ev.excerpt || memory.summary,
        location: ev.location,
        score: 1.0
      });
    }
  }

  return {
    memories: memories.map(mapMemoryRow),
    evidence
  };
}

export function getMemoriesWithEvidence(projectId?: string): Memory[] {
  const memories = getMemories(projectId, undefined, 'approved');
  return memories;
}

// ============================================
// Processing Events / Audit Log
// ============================================

interface LogEventInput {
  resourceId?: string;
  memoryId?: string;
  eventType: string;
  details: Record<string, any>;
}

export function logEvent(input: LogEventInput) {
  const id = generateId();
  db.prepare(`
    INSERT INTO processing_events (id, resource_id, memory_id, event_type, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `).run(id, input.resourceId || null, input.memoryId || null, input.eventType, JSON.stringify(input.details), nowISO());
}

export function getProcessingEvents(resourceId?: string, memoryId?: string) {
  let query = 'SELECT * FROM processing_events';
  const params: any[] = [];

  if (resourceId || memoryId) {
    query += ' WHERE';
    if (resourceId) {
      query += ' resource_id = ?';
      params.push(resourceId);
    }
    if (memoryId) {
      if (resourceId) query += ' AND';
      query += ' memory_id = ?';
      params.push(memoryId);
    }
  }
  query += ' ORDER BY created_at DESC LIMIT 100';

  return db.prepare(query).all(...params);
}

// ============================================
// Stats
// ============================================

export function getStats(projectId?: string) {
  const where = projectId ? 'WHERE project_id = ?' : '';
  const params = projectId ? [projectId] : [];

  return {
    projects: db.prepare('SELECT COUNT(*) as count FROM projects').get().count,
    resources: db.prepare(`SELECT COUNT(*) as count FROM resources ${where}`).get(...params).count,
    chunks: db.prepare(`SELECT COUNT(*) as count FROM chunks ${where ? 'JOIN resources ON chunks.resource_id = resources.id ' + where : ''}`).get(...params).count,
    memories: db.prepare(`SELECT COUNT(*) as count FROM memories ${where}`).get(...params).count,
    approvedMemories: db.prepare(`SELECT COUNT(*) as count FROM memories ${where} ${where ? 'AND' : 'WHERE'} status = 'approved'`).get(...params).count,
    suggestedMemories: db.prepare(`SELECT COUNT(*) as count FROM memories ${where} ${where ? 'AND' : 'WHERE'} status = 'suggested'`).get(...params).count
  };
}