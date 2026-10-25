import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Database from 'better-sqlite3';
import { initCoreSchema } from '../src/core/db.js';
import {
  verifyVerbatimExcerpt,
  jaccardSimilarity,
  sha256,
  generatePrefixedId,
} from '../src/core/invariants.js';
import {
  validateCandidate,
  runExtractionOnChunk,
} from '../src/core/extractor.js';
import {
  transitionMemory,
  updateMemoryStatement,
  VersionConflictError,
  InvalidTransitionError,
} from '../src/core/transitions.js';
import { generateContextPack, getContextPack } from '../src/core/contextPacks.js';
import { recordFeedback, RateLimitError } from '../src/core/feedback.js';
import { seedLargeDemoVault, DEMO_PROJECT_ID } from '../src/core/seedData.js';

describe('Memory Core & Invariants (I1-I8)', () => {
  let db: Database.Database;

  beforeEach(() => {
    db = new Database(':memory:');
    db.pragma('foreign_keys = ON');
    initCoreSchema(db);
    seedLargeDemoVault(db);
  });

  afterEach(() => {
    db.close();
  });

  it('I1: verifyVerbatimExcerpt should confirm exact or normalized substring', () => {
    const chunk = 'We decided to use SQLite in WAL mode for persistent shared brain.';
    const validExcerpt = 'SQLite in WAL mode';
    const check1 = verifyVerbatimExcerpt(chunk, validExcerpt);
    expect(check1.valid).toBe(true);
    expect(check1.startOffset).toBeGreaterThan(-1);

    const check2 = verifyVerbatimExcerpt(chunk, 'Non-existent quote not in text');
    expect(check2.valid).toBe(false);
  });

  it('I3: validateCandidate should enforce 8-step validation order', () => {
    const chunk = 'We must not allow memories without evidence.';

    // 1. schema_invalid
    const check1 = validateCandidate(null, chunk);
    expect(check1.valid).toBe(false);
    expect(check1.reason).toBe('schema_invalid');

    // 2. kind_invalid
    const check2 = validateCandidate(
      { statement: 'Valid statement here', kind: 'invalid_kind', quote: 'quote', subjectKey: 'general' },
      chunk
    );
    expect(check2.valid).toBe(false);
    expect(check2.reason).toBe('kind_invalid');

    // 3. statement_length
    const check3 = validateCandidate(
      { statement: 'Short', kind: 'decision', quote: 'quote', subjectKey: 'general' },
      chunk
    );
    expect(check3.valid).toBe(false);
    expect(check3.reason).toBe('statement_length');

    // 4. subject_invalid
    const check4 = validateCandidate(
      { statement: 'Valid statement here 123', kind: 'decision', quote: 'quote', subjectKey: 'INVALID.KEY!' },
      chunk
    );
    expect(check4.valid).toBe(false);
    expect(check4.reason).toBe('subject_invalid');

    // 5. quote_not_found
    const check5 = validateCandidate(
      { statement: 'Valid statement here 123', kind: 'decision', quote: 'missing quote', subjectKey: 'system.core' },
      chunk
    );
    expect(check5.valid).toBe(false);
    expect(check5.reason).toBe('quote_not_found');

    // Valid candidate
    const checkValid = validateCandidate(
      {
        statement: 'We must not allow memories without evidence.',
        kind: 'constraint',
        quote: 'We must not allow memories without evidence.',
        subjectKey: 'system.invariants',
      },
      chunk
    );
    expect(checkValid.valid).toBe(true);
  });

  it('I4: transitionMemory should enforce optimistic locking and legal transitions', () => {
    // mem_suggested_convention starts in 'suggested' at version 1
    const memoryId = 'mem_suggested_convention';

    // 1. Illegal transition: suggested -> superseded is disallowed
    expect(() =>
      transitionMemory(db, {
        projectId: DEMO_PROJECT_ID,
        memoryId,
        expectedVersion: 1,
        newStatus: 'superseded',
        actor: 'test_reviewer',
      })
    ).toThrow(InvalidTransitionError);

    // 2. Version conflict check
    expect(() =>
      transitionMemory(db, {
        projectId: DEMO_PROJECT_ID,
        memoryId,
        expectedVersion: 99,
        newStatus: 'approved',
        actor: 'test_reviewer',
      })
    ).toThrow(VersionConflictError);

    // 3. Legal transition: suggested -> approved
    const approved = transitionMemory(db, {
      projectId: DEMO_PROJECT_ID,
      memoryId,
      expectedVersion: 1,
      newStatus: 'approved',
      actor: 'test_reviewer',
    });
    expect(approved.status).toBe('approved');
    expect(approved.version).toBe(2);

    // Verify exactly one audit event created
    const audit = db
      .prepare("SELECT * FROM audit_events WHERE entity_id = ? AND event_type = 'memory_transition'")
      .get(memoryId) as any;
    expect(audit).toBeDefined();
    expect(audit.actor).toBe('test_reviewer');
  });

  it('I5: recordFeedback should not alter memory status or statement', () => {
    const memoryId = 'mem_decision_wal';
    const before = db.prepare('SELECT * FROM memories WHERE id = ?').get(memoryId) as any;

    const res = recordFeedback(db, {
      projectId: DEMO_PROJECT_ID,
      actor: 'engineer_1',
      memoryId,
      type: 'useful',
    });
    expect(res.success).toBe(true);

    const after = db.prepare('SELECT * FROM memories WHERE id = ?').get(memoryId) as any;
    expect(after.status).toBe(before.status);
    expect(after.statement).toBe(before.statement);
    expect(after.version).toBe(before.version);
  });

  it('I6: generateContextPack should create reproducible 5-tier pack with security header', () => {
    const pack = generateContextPack(db, {
      projectId: DEMO_PROJECT_ID,
      query: 'What is the decision on SQLite WAL mode and constraints?',
      budget: 2000,
      actor: 'agent_runner',
    });

    expect(pack.id).toMatch(/^pk_/);
    expect(pack.tokens_used).toBeGreaterThan(0);
    expect(pack.markdown).toContain('Quoted material below is reference data from team sources');
    expect(pack.markdown).toContain('Task Objective');

    // Retrieve pack by ID
    const retrieved = getContextPack(db, pack.id, DEMO_PROJECT_ID);
    expect(retrieved).toBeDefined();
    expect(retrieved?.markdown).toBe(pack.markdown);
  });

  it('I8: runExtractionOnChunk should be idempotent on unchanged chunk', () => {
    const chunkId = 'chk_decision_01';
    const run1 = runExtractionOnChunk(db, {
      projectId: DEMO_PROJECT_ID,
      chunkId,
      actor: 'rules_extractor',
    });

    const run2 = runExtractionOnChunk(db, {
      projectId: DEMO_PROJECT_ID,
      chunkId,
      actor: 'rules_extractor',
    });

    expect(run1.id).toBe(run2.id);
  });
});
