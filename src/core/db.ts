import Database from 'better-sqlite3';
import path from 'path';
import fs from 'fs';
import { config } from '../config/index.js';

let coreDbInstance: Database.Database | null = null;

export function getCoreDatabase(dbPath?: string): Database.Database {
  if (coreDbInstance) return coreDbInstance;

  const targetPath = dbPath || config.databasePath;
  const dir = path.dirname(targetPath);
  if (!fs.existsSync(dir)) {
    fs.mkdirSync(dir, { recursive: true });
  }

  const db = new Database(targetPath);
  db.pragma('journal_mode = WAL');
  db.pragma('synchronous = NORMAL');
  db.pragma('foreign_keys = ON');

  initCoreSchema(db);
  coreDbInstance = db;
  return db;
}

export function resetCoreDatabase(): void {
  if (coreDbInstance) {
    try {
      coreDbInstance.close();
    } catch {
      // ignore
    }
    coreDbInstance = null;
  }
}

export function initCoreSchema(db: Database.Database): void {
  db.exec(`
    -- 1. Projects
    CREATE TABLE IF NOT EXISTS projects (
      id TEXT PRIMARY KEY,
      name TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata TEXT
    );

    -- Documents (Team Knowledge Base)
    CREATE TABLE IF NOT EXISTS documents (
      id TEXT PRIMARY KEY,
      path TEXT UNIQUE NOT NULL,
      title TEXT NOT NULL,
      folder TEXT NOT NULL,
      content TEXT NOT NULL,
      tags TEXT NOT NULL,
      author TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      pinned INTEGER DEFAULT 0
    );

    CREATE TABLE IF NOT EXISTS document_links (
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      context TEXT,
      PRIMARY KEY (source_id, target_id)
    );

    -- 2. API Keys
    CREATE TABLE IF NOT EXISTS api_keys (
      id TEXT PRIMARY KEY,
      key_hash TEXT UNIQUE NOT NULL,
      project_ids TEXT NOT NULL,
      name TEXT NOT NULL,
      revoked INTEGER DEFAULT 0,
      created_at TEXT NOT NULL
    );

    -- 3. Resources
    CREATE TABLE IF NOT EXISTS resources (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      title TEXT NOT NULL,
      locator TEXT NOT NULL,
      source_ref TEXT,
      content_hash TEXT NOT NULL,
      content TEXT NOT NULL,
      created_at TEXT NOT NULL,
      metadata TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 4. Chunks
    CREATE TABLE IF NOT EXISTS chunks (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      resource_id TEXT NOT NULL,
      heading_path TEXT NOT NULL,
      content TEXT NOT NULL,
      content_hash TEXT NOT NULL,
      start_offset INTEGER NOT NULL,
      end_offset INTEGER NOT NULL,
      source_date TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
    );

    -- 5. Memories
    CREATE TABLE IF NOT EXISTS memories (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      kind TEXT NOT NULL,
      statement TEXT NOT NULL,
      subject_key TEXT NOT NULL,
      status TEXT NOT NULL,
      successor_id TEXT,
      version INTEGER NOT NULL DEFAULT 1,
      created_at TEXT NOT NULL,
      updated_at TEXT NOT NULL,
      content TEXT DEFAULT '',
      type TEXT DEFAULT 'decision',
      agent TEXT DEFAULT 'system',
      timestamp TEXT DEFAULT '',
      tags TEXT DEFAULT '[]',
      task_id TEXT,
      metadata TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 6. Evidence
    CREATE TABLE IF NOT EXISTS evidence (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      excerpt TEXT NOT NULL,
      start_offset INTEGER NOT NULL,
      end_offset INTEGER NOT NULL,
      is_stale INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE,
      FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
    );

    -- 7. Memory Relationships
    CREATE TABLE IF NOT EXISTS memory_relationships (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      source_id TEXT NOT NULL,
      target_id TEXT NOT NULL,
      type TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (source_id) REFERENCES memories(id) ON DELETE CASCADE,
      FOREIGN KEY (target_id) REFERENCES memories(id) ON DELETE CASCADE,
      UNIQUE(source_id, target_id, type)
    );

    -- 8. Extraction Runs
    CREATE TABLE IF NOT EXISTS extraction_runs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      chunk_content_hash TEXT NOT NULL,
      extractor_name TEXT NOT NULL,
      extractor_version TEXT NOT NULL,
      status TEXT NOT NULL,
      candidates_count INTEGER DEFAULT 0,
      accepted_count INTEGER DEFAULT 0,
      rejected_count INTEGER DEFAULT 0,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE,
      UNIQUE(chunk_id, chunk_content_hash, extractor_name, extractor_version)
    );

    -- 9. Rejected Candidates
    CREATE TABLE IF NOT EXISTS rejected_candidates (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      chunk_id TEXT NOT NULL,
      reason TEXT NOT NULL,
      candidate_raw TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (chunk_id) REFERENCES chunks(id) ON DELETE CASCADE
    );

    -- 10. Audit Events
    CREATE TABLE IF NOT EXISTS audit_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      event_type TEXT NOT NULL,
      entity_type TEXT NOT NULL,
      entity_id TEXT NOT NULL,
      details TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 11. Context Packs
    CREATE TABLE IF NOT EXISTS context_packs (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      query TEXT NOT NULL,
      budget INTEGER NOT NULL,
      tokens_used INTEGER NOT NULL,
      is_insufficient INTEGER DEFAULT 0,
      selected_ids TEXT NOT NULL,
      omitted_ids TEXT NOT NULL,
      scores TEXT NOT NULL,
      engine_version TEXT NOT NULL,
      markdown TEXT NOT NULL,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 12. Feedback Events
    CREATE TABLE IF NOT EXISTS feedback_events (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      actor TEXT NOT NULL,
      memory_id TEXT NOT NULL,
      pack_id TEXT,
      type TEXT NOT NULL,
      target_memory_id TEXT,
      created_at TEXT NOT NULL,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE,
      FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE CASCADE
    );

    -- 13. Review Items
    CREATE TABLE IF NOT EXISTS review_items (
      id TEXT PRIMARY KEY,
      project_id TEXT NOT NULL,
      type TEXT NOT NULL,
      status TEXT NOT NULL DEFAULT 'open',
      memory_id TEXT,
      target_memory_id TEXT,
      details TEXT,
      created_at TEXT NOT NULL,
      resolved_at TEXT,
      FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
    );

    -- 14. Task Runs (Conversation History)
    CREATE TABLE IF NOT EXISTS task_runs (
      id TEXT PRIMARY KEY,
      task TEXT NOT NULL,
      status TEXT NOT NULL,
      summary TEXT,
      started_at TEXT NOT NULL,
      completed_at TEXT,
      metadata TEXT
    );
  `);

  // Migrate pre-existing memories table if present from previous builds
  const memoryColumns = [
    { col: 'project_id', def: 'TEXT DEFAULT "proj_sharedbrain"' },
    { col: 'kind', def: 'TEXT DEFAULT "decision"' },
    { col: 'statement', def: 'TEXT DEFAULT ""' },
    { col: 'subject_key', def: 'TEXT DEFAULT "general"' },
    { col: 'status', def: 'TEXT DEFAULT "approved"' },
    { col: 'successor_id', def: 'TEXT' },
    { col: 'version', def: 'INTEGER DEFAULT 1' },
    { col: 'created_at', def: 'TEXT DEFAULT ""' },
    { col: 'updated_at', def: 'TEXT DEFAULT ""' },
  ];
  for (const c of memoryColumns) {
    try {
      db.exec(`ALTER TABLE memories ADD COLUMN ${c.col} ${c.def}`);
    } catch {
      // Column already exists
    }
  }

  // Agent memories written through SharedMemory.store() only fill the legacy columns
  // (content/timestamp). Mirror them into statement/created_at so the core engine can use them.
  db.exec(`
    UPDATE memories SET statement = substr(content, 1, 300)
      WHERE (statement IS NULL OR statement = '') AND content IS NOT NULL AND content != '';
    UPDATE memories SET created_at = COALESCE(NULLIF(timestamp, ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now'))
      WHERE created_at IS NULL OR created_at = '';
    UPDATE memories SET updated_at = created_at WHERE updated_at IS NULL OR updated_at = '';

    CREATE TRIGGER IF NOT EXISTS trg_memories_fill_core_columns
    AFTER INSERT ON memories
    WHEN NEW.statement IS NULL OR NEW.statement = '' OR NEW.created_at IS NULL OR NEW.created_at = ''
    BEGIN
      UPDATE memories SET
        statement = CASE WHEN statement IS NULL OR statement = '' THEN substr(NEW.content, 1, 300) ELSE statement END,
        created_at = CASE WHEN created_at IS NULL OR created_at = ''
          THEN COALESCE(NULLIF(NEW.timestamp, ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE created_at END,
        updated_at = CASE WHEN updated_at IS NULL OR updated_at = ''
          THEN COALESCE(NULLIF(NEW.timestamp, ''), strftime('%Y-%m-%dT%H:%M:%fZ', 'now')) ELSE updated_at END
      WHERE id = NEW.id;
    END;
  `);

  db.exec(`
    -- Indexes for performance and query optimization
    CREATE INDEX IF NOT EXISTS idx_memories_proj_status ON memories(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_memories_proj_subject ON memories(project_id, subject_key);
    CREATE INDEX IF NOT EXISTS idx_memories_proj_kind ON memories(project_id, kind);
    CREATE INDEX IF NOT EXISTS idx_evidence_memory_id ON evidence(memory_id);
    CREATE INDEX IF NOT EXISTS idx_evidence_chunk_id ON evidence(chunk_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_resource_id ON chunks(resource_id);
    CREATE INDEX IF NOT EXISTS idx_chunks_proj_hash ON chunks(project_id, content_hash);
    CREATE INDEX IF NOT EXISTS idx_relationships_source ON memory_relationships(source_id);
    CREATE INDEX IF NOT EXISTS idx_relationships_target ON memory_relationships(target_id);
    CREATE INDEX IF NOT EXISTS idx_review_items_status ON review_items(project_id, status);
    CREATE INDEX IF NOT EXISTS idx_audit_events_entity ON audit_events(entity_type, entity_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_events_memory ON feedback_events(memory_id);
    CREATE INDEX IF NOT EXISTS idx_feedback_events_actor ON feedback_events(project_id, actor, created_at);
  `);

  // FTS5 Virtual Tables & Triggers
  try {
    try {
      db.exec(`
        DROP TRIGGER IF EXISTS trg_memories_ai;
        DROP TRIGGER IF EXISTS trg_memories_ad;
        DROP TRIGGER IF EXISTS trg_memories_au;
        DROP TRIGGER IF EXISTS trg_memories_fts_insert;
        DROP TRIGGER IF EXISTS trg_memories_fts_delete;
        DROP TRIGGER IF EXISTS trg_memories_fts_update;
      `);
      const checkFts = db.prepare("SELECT sql FROM sqlite_master WHERE type='table' AND name='memories_fts'").get() as any;
      if (checkFts && checkFts.sql && (!checkFts.sql.includes('statement') || !checkFts.sql.includes('content'))) {
        db.exec("DROP TABLE IF EXISTS memories_fts");
      }
    } catch {}

    db.exec(`
      CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
        id UNINDEXED,
        statement,
        content,
        subject_key,
        kind,
        tags,
        agent,
        tokenize = 'porter'
      );

      CREATE TRIGGER IF NOT EXISTS trg_memories_fts_insert AFTER INSERT ON memories BEGIN
        INSERT INTO memories_fts (id, statement, content, subject_key, kind, tags, agent)
        VALUES (
          new.id,
          COALESCE(new.statement, new.content, ''),
          COALESCE(new.content, new.statement, ''),
          COALESCE(new.subject_key, 'general'),
          COALESCE(new.kind, new.type, 'decision'),
          COALESCE(new.tags, '[]'),
          COALESCE(new.agent, 'system')
        );
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memories_fts_delete AFTER DELETE ON memories BEGIN
        DELETE FROM memories_fts WHERE id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_memories_fts_update AFTER UPDATE ON memories BEGIN
        DELETE FROM memories_fts WHERE id = old.id;
        INSERT INTO memories_fts (id, statement, content, subject_key, kind, tags, agent)
        VALUES (
          new.id,
          COALESCE(new.statement, new.content, ''),
          COALESCE(new.content, new.statement, ''),
          COALESCE(new.subject_key, 'general'),
          COALESCE(new.kind, new.type, 'decision'),
          COALESCE(new.tags, '[]'),
          COALESCE(new.agent, 'system')
        );
      END;

      CREATE VIRTUAL TABLE IF NOT EXISTS evidence_fts USING fts5(
        id UNINDEXED,
        memory_id UNINDEXED,
        excerpt,
        tokenize = 'porter'
      );

      CREATE TRIGGER IF NOT EXISTS trg_evidence_fts_insert AFTER INSERT ON evidence BEGIN
        INSERT INTO evidence_fts (id, memory_id, excerpt)
        VALUES (new.id, new.memory_id, new.excerpt);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_evidence_fts_delete AFTER DELETE ON evidence BEGIN
        DELETE FROM evidence_fts WHERE id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_evidence_fts_update AFTER UPDATE ON evidence BEGIN
        DELETE FROM evidence_fts WHERE id = old.id;
        INSERT INTO evidence_fts (id, memory_id, excerpt)
        VALUES (new.id, new.memory_id, new.excerpt);
      END;

      CREATE VIRTUAL TABLE IF NOT EXISTS memories_subject_fts USING fts5(
        id UNINDEXED,
        subject_key,
        tokenize = 'porter'
      );

      CREATE TRIGGER IF NOT EXISTS trg_subject_fts_insert AFTER INSERT ON memories BEGIN
        INSERT INTO memories_subject_fts (id, subject_key)
        VALUES (new.id, new.subject_key);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_subject_fts_delete AFTER DELETE ON memories BEGIN
        DELETE FROM memories_subject_fts WHERE id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_subject_fts_update AFTER UPDATE ON memories BEGIN
        DELETE FROM memories_subject_fts WHERE id = old.id;
        INSERT INTO memories_subject_fts (id, subject_key)
        VALUES (new.id, new.subject_key);
      END;

      CREATE VIRTUAL TABLE IF NOT EXISTS chunks_heading_fts USING fts5(
        id UNINDEXED,
        heading_path,
        content,
        tokenize = 'porter'
      );

      CREATE TRIGGER IF NOT EXISTS trg_chunks_heading_fts_insert AFTER INSERT ON chunks BEGIN
        INSERT INTO chunks_heading_fts (id, heading_path, content)
        VALUES (new.id, new.heading_path, new.content);
      END;

      CREATE TRIGGER IF NOT EXISTS trg_chunks_heading_fts_delete AFTER DELETE ON chunks BEGIN
        DELETE FROM chunks_heading_fts WHERE id = old.id;
      END;

      CREATE TRIGGER IF NOT EXISTS trg_chunks_heading_fts_update AFTER UPDATE ON chunks BEGIN
        DELETE FROM chunks_heading_fts WHERE id = old.id;
        INSERT INTO chunks_heading_fts (id, heading_path, content)
        VALUES (new.id, new.heading_path, new.content);
      END;
    `);
  } catch {
    // FTS already initialized
  }
}
