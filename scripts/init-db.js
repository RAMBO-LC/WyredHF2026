#!/usr/bin/env node

import Database from 'better-sqlite3';
import { resolve } from 'path';
import { mkdirSync } from 'fs';

const DB_PATH = resolve(process.cwd(), 'data', 'team-brain.db');
const DATA_DIR = resolve(process.cwd(), 'data');

mkdirSync(DATA_DIR, { recursive: true });

const db = new Database(DB_PATH);

db.pragma('journal_mode = WAL');
db.pragma('foreign_keys = ON');

console.log('Initializing Team Brain database...');

// ============================================
// Projects table
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS projects (
    id TEXT PRIMARY KEY,
    name TEXT NOT NULL,
    description TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL
  );
`);

// ============================================
// Resources table
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS resources (
    id TEXT PRIMARY KEY,
    title TEXT NOT NULL,
    project_id TEXT,
    source_type TEXT NOT NULL,
    source_uri TEXT,
    raw_content TEXT NOT NULL,
    normalized_markdown TEXT,
    metadata TEXT DEFAULT '{}',
    processing_status TEXT NOT NULL DEFAULT 'pending',
    error_message TEXT,
    content_hash TEXT NOT NULL,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_resources_project ON resources(project_id);
  CREATE INDEX IF NOT EXISTS idx_resources_status ON resources(processing_status);
  CREATE INDEX IF NOT EXISTS idx_resources_hash ON resources(content_hash);
`);

// ============================================
// Chunks table
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS chunks (
    id TEXT PRIMARY KEY,
    resource_id TEXT NOT NULL,
    chunk_index INTEGER NOT NULL,
    content TEXT NOT NULL,
    token_count INTEGER NOT NULL,
    metadata TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_chunks_resource ON chunks(resource_id);
`);

// ============================================
// Memories table
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS memories (
    id TEXT PRIMARY KEY,
    project_id TEXT,
    title TEXT NOT NULL,
    kind TEXT NOT NULL,
    summary TEXT NOT NULL,
    content TEXT,
    tags TEXT DEFAULT '[]',
    source_resource_ids TEXT DEFAULT '[]',
    evidence TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'suggested',
    supersedes_memory_id TEXT,
    created_at TEXT NOT NULL,
    updated_at TEXT NOT NULL,
    FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE SET NULL,
    FOREIGN KEY (supersedes_memory_id) REFERENCES memories(id) ON DELETE SET NULL
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_memories_project ON memories(project_id);
  CREATE INDEX IF NOT EXISTS idx_memories_status ON memories(status);
  CREATE INDEX IF NOT EXISTS idx_memories_kind ON memories(kind);
`);

// ============================================
// Memory relationships table
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS memory_relationships (
    id TEXT PRIMARY KEY,
    from_memory_id TEXT NOT NULL,
    to_memory_id TEXT NOT NULL,
    type TEXT NOT NULL,
    evidence_resource_ids TEXT DEFAULT '[]',
    status TEXT NOT NULL DEFAULT 'suggested',
    created_at TEXT NOT NULL,
    FOREIGN KEY (from_memory_id) REFERENCES memories(id) ON DELETE CASCADE,
    FOREIGN KEY (to_memory_id) REFERENCES memories(id) ON DELETE CASCADE
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_relations_from ON memory_relationships(from_memory_id);
  CREATE INDEX IF NOT EXISTS idx_relations_to ON memory_relationships(to_memory_id);
`);

// ============================================
// Processing events / audit log
// ============================================
db.exec(`
  CREATE TABLE IF NOT EXISTS processing_events (
    id TEXT PRIMARY KEY,
    resource_id TEXT,
    memory_id TEXT,
    event_type TEXT NOT NULL,
    details TEXT DEFAULT '{}',
    created_at TEXT NOT NULL,
    FOREIGN KEY (resource_id) REFERENCES resources(id) ON DELETE SET NULL,
    FOREIGN KEY (memory_id) REFERENCES memories(id) ON DELETE SET NULL
  );
`);

db.exec(`
  CREATE INDEX IF NOT EXISTS idx_events_resource ON processing_events(resource_id);
  CREATE INDEX IF NOT EXISTS idx_events_memory ON processing_events(memory_id);
`);

console.log('Database initialized successfully at:', DB_PATH);
console.log('Tables created: projects, resources, chunks, memories, memory_relationships, processing_events');

db.close();