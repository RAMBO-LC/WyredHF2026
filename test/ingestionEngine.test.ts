import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initCoreSchema } from '../src/core/db.js';
import { ingestAndDistillContent, getIngestionStats } from '../src/core/ingestionEngine.js';
import { SharedMemory } from '../src/memory/sharedMemory.js';

describe('Local Production RAG Ingestion & Distillation Engine', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    initCoreSchema(db);
  });

  it('should store, chunk, distill memories and verify verbatim evidence without model training', () => {
    const rawMarkdown = `
# Core Service Mesh Architecture

## Decisions
- We decided to use Cilium as the primary CNI for high performance packet filtering.
- We chose to enforce mutual TLS across all ingress nodes.

## Constraints
- Production pods must not run with privileged mode enabled.
- Database access credentials must never be committed to source control.

## Bug Fix
- Connection reset errors under load was fixed by increasing the socket backlog to 4096.
    `.trim();

    const result = ingestAndDistillContent(
      {
        title: 'Core Service Mesh Architecture',
        folder: 'Architecture',
        content: rawMarkdown,
        author: 'Infrastructure Lead',
        tags: ['mesh', 'networking', 'cilium'],
      },
      db
    );

    expect(result.success).toBe(true);
    expect(result.resourceId).toMatch(/^res_/);
    expect(result.chunksCreated).toBeGreaterThanOrEqual(3);
    expect(result.memoriesDistilled.length).toBeGreaterThanOrEqual(4);
    expect(result.evidenceCount).toBeGreaterThanOrEqual(4);
    expect(result.documentPath).toBe('Architecture/Core Service Mesh Architecture');

    // Verify Invariant I1: Every distilled memory has verbatim evidence
    for (const mem of result.memoriesDistilled) {
      expect(mem.statement.length).toBeGreaterThan(10);
      expect(mem.quote.length).toBeGreaterThan(10);
      // Raw document must contain the quote verbatim
      expect(rawMarkdown).toContain(mem.quote);
    }

    // Verify stored in SQLite tables
    const resourceRow = db.prepare('SELECT * FROM resources WHERE id = ?').get(result.resourceId) as any;
    expect(resourceRow).toBeDefined();
    expect(resourceRow.title).toBe('Core Service Mesh Architecture');

    const chunks = db.prepare('SELECT * FROM chunks WHERE resource_id = ?').all(result.resourceId) as any[];
    expect(chunks.length).toBe(result.chunksCreated);

    const memories = db.prepare('SELECT * FROM memories WHERE project_id = ?').all(resourceRow.project_id) as any[];
    expect(memories.length).toBeGreaterThanOrEqual(result.memoriesDistilled.length);

    // Verify FTS5 full-text search retrieves the memory
    const ftsResults = db.prepare(`
      SELECT m.* FROM memories m
      JOIN memories_fts f ON m.id = f.id
      WHERE memories_fts MATCH '"Cilium"*'
    `).all() as any[];

    expect(ftsResults.length).toBeGreaterThan(0);
    expect(ftsResults[0].statement).toContain('Cilium');
  });

  it('should return complete production RAG stats', () => {
    const stats = getIngestionStats(db);
    expect(stats.invariantsCompliant).toBe(true);
    expect(stats.engine).toContain('SQLite WAL FTS5');
    expect(typeof stats.resources).toBe('number');
    expect(typeof stats.chunks).toBe('number');
    expect(typeof stats.totalMemories).toBe('number');
  });
});
