import Database from 'better-sqlite3';
import {
  MemoryKind,
  ExtractionRejectionReason,
  ExtractionRun,
} from './types.js';
import {
  ALLOWED_MEMORY_KINDS,
  verifyVerbatimExcerpt,
  jaccardSimilarity,
  generatePrefixedId,
  sha256,
} from './invariants.js';

export interface RawCandidate {
  kind: string;
  statement: string;
  quote: string;
  subjectKey: string;
  sourceDate?: string;
}

export const EXTRACTOR_NAME = 'rules_extractor';
export const EXTRACTOR_VERSION = '1.0.0';

const HEADING_MAP: Record<string, MemoryKind> = {
  'decision': 'decision',
  'decisions': 'decision',
  'root cause': 'bug_fix',
  'cause': 'bug_fix',
  'fix': 'bug_fix',
  'resolution': 'bug_fix',
  'bug fix': 'bug_fix',
  'constraints': 'constraint',
  'constraint': 'constraint',
  'must not': 'constraint',
  'do not': 'constraint',
  'convention': 'convention',
  'conventions': 'convention',
  'style': 'convention',
  'standard': 'convention',
  'standards': 'convention',
  'lesson': 'lesson',
  'lessons': 'lesson',
  'takeaway': 'lesson',
  'takeaways': 'lesson',
  'outcome': 'task_outcome',
  'result': 'task_outcome',
};

const BODY_MARKERS: Array<{ phrase: string; kind: MemoryKind }> = [
  { phrase: 'we decided', kind: 'decision' },
  { phrase: 'decided to', kind: 'decision' },
  { phrase: 'chose to', kind: 'decision' },
  { phrase: 'fixed by', kind: 'bug_fix' },
  { phrase: 'the fix was', kind: 'bug_fix' },
  { phrase: 'resolved by', kind: 'bug_fix' },
  { phrase: 'must not', kind: 'constraint' },
  { phrase: 'never', kind: 'constraint' },
  { phrase: 'must always', kind: 'constraint' },
  { phrase: 'we learned', kind: 'lesson' },
];

/**
 * Extracts raw candidate memories from chunk text using deterministic heading maps and body markers.
 */
export function extractCandidatesFromChunk(
  headingPath: string,
  content: string
): RawCandidate[] {
  const candidates: RawCandidate[] = [];
  const lines = content.split('\n');

  // Determine kind from heading
  let headingKind: MemoryKind | undefined;
  const segments = headingPath.split('/').map((s) => s.trim().toLowerCase());
  for (const seg of segments) {
    if (HEADING_MAP[seg]) {
      headingKind = HEADING_MAP[seg];
      break;
    }
  }

  // Generate clean subject key base
  const cleanSubjectKey = segments
    .join('.')
    .toLowerCase()
    .replace(/[^a-z0-9_.]/g, '_')
    .replace(/\.+/g, '.')
    .replace(/_+/g, '_')
    .replace(/^[._]+|[._]+$/g, '')
    .slice(0, 100) || 'general';

  for (const line of lines) {
    const trimmed = line.replace(/^[•\-\*]\s+/, '').trim();
    if (trimmed.length < 10) continue;

    let candidateKind = headingKind;

    if (!candidateKind) {
      const lower = trimmed.toLowerCase();
      for (const m of BODY_MARKERS) {
        if (lower.includes(m.phrase)) {
          candidateKind = m.kind;
          break;
        }
      }
    }

    if (candidateKind) {
      candidates.push({
        kind: candidateKind,
        statement: trimmed.slice(0, 300),
        quote: trimmed,
        subjectKey: cleanSubjectKey,
      });
    }
  }

  return candidates;
}

/**
 * Validates a candidate memory through the strict 8-step order (First Failure Wins).
 */
export function validateCandidate(
  candidate: any,
  chunkContent: string
): { valid: boolean; reason?: ExtractionRejectionReason; excerptOffsets?: { start: number; end: number } } {
  // Step 1: schema_invalid
  if (
    !candidate ||
    typeof candidate !== 'object' ||
    typeof candidate.statement !== 'string' ||
    typeof candidate.kind !== 'string' ||
    typeof candidate.quote !== 'string' ||
    typeof candidate.subjectKey !== 'string'
  ) {
    return { valid: false, reason: 'schema_invalid' };
  }

  // Step 2: kind_invalid
  if (!ALLOWED_MEMORY_KINDS.includes(candidate.kind as MemoryKind)) {
    return { valid: false, reason: 'kind_invalid' };
  }

  // Step 3: statement_length (10-300 chars)
  const stmtLen = candidate.statement.trim().length;
  if (stmtLen < 10 || stmtLen > 300) {
    return { valid: false, reason: 'statement_length' };
  }

  // Step 4: subject_invalid (matches ^[a-z0-9_]+(\.[a-z0-9_]+)*$, max 120 chars)
  const subj = candidate.subjectKey;
  if (!subj || subj.length > 120 || !/^[a-z0-9_]+(\.[a-z0-9_]+)*$/.test(subj)) {
    return { valid: false, reason: 'subject_invalid' };
  }

  // Step 5: quote_not_found (verbatim substring after whitespace normalization)
  const evidenceCheck = verifyVerbatimExcerpt(chunkContent, candidate.quote);
  if (!evidenceCheck.valid) {
    return { valid: false, reason: 'quote_not_found' };
  }

  return {
    valid: true,
    excerptOffsets: {
      start: evidenceCheck.startOffset,
      end: evidenceCheck.endOffset,
    },
  };
}

/**
 * Runs the extraction pipeline on a chunk with I8 idempotency, 8-step validation, and audit recording.
 */
export function runExtractionOnChunk(
  db: Database.Database,
  params: {
    projectId: string;
    chunkId: string;
    actor: string;
  }
): ExtractionRun {
  const { projectId, chunkId, actor } = params;

  const chunkStmt = db.prepare('SELECT * FROM chunks WHERE id = ? AND project_id = ?');
  const chunk = chunkStmt.get(chunkId, projectId) as any;
  if (!chunk) {
    throw new Error(`Chunk ${chunkId} not found in project ${projectId}`);
  }

  // Check I8: Idempotent extraction (chunk_id, chunk_content_hash, extractor_name, extractor_version)
  const existingRunStmt = db.prepare(`
    SELECT * FROM extraction_runs
    WHERE chunk_id = ? AND chunk_content_hash = ? AND extractor_name = ? AND extractor_version = ?
  `);
  const existingRun = existingRunStmt.get(
    chunk.id,
    chunk.content_hash,
    EXTRACTOR_NAME,
    EXTRACTOR_VERSION
  ) as any;

  if (existingRun) {
    return existingRun;
  }

  const rawCandidates = extractCandidatesFromChunk(chunk.heading_path, chunk.content);

  let acceptedCount = 0;
  let rejectedCount = 0;
  const runId = generatePrefixedId('run');
  const now = new Date().toISOString();

  const colInfo = db.prepare("PRAGMA table_info(memories)").all() as any[];
  const hasAgentCol = colInfo.some(c => c.name === 'agent');
  const hasContentCol = colInfo.some(c => c.name === 'content');

  const insertMemory = hasAgentCol
    ? db.prepare(`
        INSERT INTO memories (id, project_id, kind, statement, subject_key, status, version, created_at, updated_at, content, type, agent, timestamp, tags)
        VALUES (?, ?, ?, ?, ?, 'suggested', 1, ?, ?, ?, ?, ?, ?, '[]')
      `)
    : hasContentCol
    ? db.prepare(`
        INSERT INTO memories (id, project_id, kind, statement, subject_key, status, version, created_at, updated_at, content, type)
        VALUES (?, ?, ?, ?, ?, 'suggested', 1, ?, ?, ?, ?)
      `)
    : db.prepare(`
        INSERT INTO memories (id, project_id, kind, statement, subject_key, status, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, 'suggested', 1, ?, ?)
      `);

  const insertEvidence = db.prepare(`
    INSERT INTO evidence (id, project_id, memory_id, chunk_id, excerpt, start_offset, end_offset, is_stale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);

  const insertRejected = db.prepare(`
    INSERT INTO rejected_candidates (id, project_id, chunk_id, reason, candidate_raw, created_at)
    VALUES (?, ?, ?, ?, ?, ?)
  `);

  const insertAudit = db.prepare(`
    INSERT INTO audit_events (id, project_id, actor, event_type, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const findExactDuplicate = db.prepare(`
    SELECT * FROM memories
    WHERE project_id = ? AND kind = ? AND statement = ?
  `);

  const findNearDuplicates = db.prepare(`
    SELECT * FROM memories
    WHERE project_id = ? AND kind = ? AND status != 'archived'
  `);

  const insertReviewItem = db.prepare(`
    INSERT INTO review_items (id, project_id, type, status, memory_id, target_memory_id, details, created_at)
    VALUES (?, ?, 'merge_suggestion', 'open', ?, ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    for (const cand of rawCandidates) {
      const validation = validateCandidate(cand, chunk.content);

      if (!validation.valid) {
        rejectedCount++;
        insertRejected.run(
          generatePrefixedId('rej'),
          projectId,
          chunk.id,
          validation.reason!,
          JSON.stringify(cand),
          now
        );
        continue;
      }

      // Step 6: Exact duplicate (same project, statement, kind) -> add evidence to existing
      const exact = findExactDuplicate.get(projectId, cand.kind, cand.statement) as any;
      if (exact) {
        insertEvidence.run(
          generatePrefixedId('ev'),
          projectId,
          exact.id,
          chunk.id,
          cand.quote,
          validation.excerptOffsets!.start,
          validation.excerptOffsets!.end,
          now
        );
        acceptedCount++;
        continue;
      }

      // Step 7: Near duplicate (Jaccard token overlap >= 0.8) -> create merge_suggestion
      const existingOfKind = findNearDuplicates.all(projectId, cand.kind) as any[];
      let nearDuplicateTarget: any = null;
      for (const ex of existingOfKind) {
        if (jaccardSimilarity(cand.statement, ex.statement) >= 0.8) {
          nearDuplicateTarget = ex;
          break;
        }
      }

      // Step 8: Insert as suggested with evidence in single transaction + audit event
      const memId = generatePrefixedId('mem');
      if (hasAgentCol) {
        insertMemory.run(
          memId,
          projectId,
          cand.kind,
          cand.statement,
          cand.subjectKey,
          now,
          now,
          cand.statement,
          cand.kind,
          actor || 'extractor',
          now
        );
      } else if (hasContentCol) {
        insertMemory.run(
          memId,
          projectId,
          cand.kind,
          cand.statement,
          cand.subjectKey,
          now,
          now,
          cand.statement,
          cand.kind
        );
      } else {
        insertMemory.run(
          memId,
          projectId,
          cand.kind,
          cand.statement,
          cand.subjectKey,
          now,
          now
        );
      }

      insertEvidence.run(
        generatePrefixedId('ev'),
        projectId,
        memId,
        chunk.id,
        cand.quote,
        validation.excerptOffsets!.start,
        validation.excerptOffsets!.end,
        now
      );

      insertAudit.run(
        generatePrefixedId('aud'),
        projectId,
        actor,
        'memory_suggested',
        'memory',
        memId,
        JSON.stringify({ kind: cand.kind, statement: cand.statement }),
        now
      );

      if (nearDuplicateTarget) {
        insertReviewItem.run(
          generatePrefixedId('rev'),
          projectId,
          memId,
          nearDuplicateTarget.id,
          JSON.stringify({ similarity: jaccardSimilarity(cand.statement, nearDuplicateTarget.statement) }),
          now
        );
      }

      acceptedCount++;
    }

    const insertRun = db.prepare(`
      INSERT INTO extraction_runs (id, project_id, chunk_id, chunk_content_hash, extractor_name, extractor_version, status, candidates_count, accepted_count, rejected_count, created_at)
      VALUES (?, ?, ?, ?, ?, ?, 'completed', ?, ?, ?, ?)
    `);

    insertRun.run(
      runId,
      projectId,
      chunk.id,
      chunk.content_hash,
      EXTRACTOR_NAME,
      EXTRACTOR_VERSION,
      rawCandidates.length,
      acceptedCount,
      rejectedCount,
      now
    );
  });

  tx();

  return {
    id: runId,
    project_id: projectId,
    chunk_id: chunk.id,
    chunk_content_hash: chunk.content_hash,
    extractor_name: EXTRACTOR_NAME,
    extractor_version: EXTRACTOR_VERSION,
    status: 'completed',
    candidates_count: rawCandidates.length,
    accepted_count: acceptedCount,
    rejected_count: rejectedCount,
    created_at: now,
  };
}
