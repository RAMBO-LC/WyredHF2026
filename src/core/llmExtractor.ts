import Database from 'better-sqlite3';
import { generatePrefixedId, sha256, verifyVerbatimExcerpt, jaccardSimilarity, ALLOWED_MEMORY_KINDS } from './invariants.js';
import { MemoryKind } from './types.js';
import { runExtractionOnChunk } from './extractor.js';

export interface LLMExtractorOptions {
  model?: string;
  endpoint?: string;
  apiKey?: string;
  useFallbackIfUnreachable?: boolean;
}

/**
 * Ollama & LLM Candidate Memory Extractor:
 * Prompts an LLM to extract { statement, kind, quote, subject_key } from a text chunk,
 * then enforces the strict 8-step validation pipeline before committing to SQLite.
 */
export async function runLLMExtractionOnChunk(
  db: Database.Database,
  projectId: string,
  chunkId: string,
  options: LLMExtractorOptions = {}
): Promise<{
  runId: string;
  acceptedMemories: any[];
  rejectedCandidates: any[];
  usedFallback: boolean;
}> {
  const model = options.model || 'llama3:latest';
  const endpoint = options.endpoint || process.env.OLLAMA_ENDPOINT || 'http://localhost:11434/api/generate';
  const extractorName = `ollama:${model}`;
  const extractorVersion = '1.0.0';

  // 1. Fetch the chunk
  const chunk = db.prepare('SELECT * FROM chunks WHERE id = ? AND project_id = ?').get(chunkId, projectId) as any;
  if (!chunk) {
    throw new Error(`Chunk ${chunkId} not found in project ${projectId}`);
  }

  // 2. Check Invariant I8: Idempotent extraction
  const existingRun = db.prepare(`
    SELECT * FROM extraction_runs
    WHERE chunk_id = ? AND chunk_content_hash = ? AND extractor_name = ? AND extractor_version = ?
  `).get(chunkId, chunk.content_hash, extractorName, extractorVersion) as any;

  if (existingRun) {
    const accepted = db.prepare(`
      SELECT m.*, json_group_array(json_object(
        'id', e.id, 'excerpt', e.excerpt, 'start_offset', e.start_offset, 'end_offset', e.end_offset
      )) as evidence
      FROM memories m
      JOIN evidence e ON m.id = e.memory_id
      WHERE e.chunk_id = ? AND m.project_id = ?
      GROUP BY m.id
    `).all(chunkId, projectId);

    const rejections = db.prepare('SELECT * FROM rejected_candidates WHERE run_id = ?').all(existingRun.id);

    return {
      runId: existingRun.id,
      acceptedMemories: accepted.map((m: any) => ({ ...m, evidence: JSON.parse(m.evidence) })),
      rejectedCandidates: rejections,
      usedFallback: false,
    };
  }

  // 3. Attempt LLM extraction with timeout
  let rawCandidates: any[] = [];

  try {
    const prompt = `You are a strict technical memory extractor. Extract enduring knowledge from the following text chunk.
Text Chunk:
"""
${chunk.content}
"""

Rules:
1. Extract items only in these kinds: "decision", "constraint", "convention", "bug_fix", "lesson".
2. "statement" must be a clean, concise, active statement of fact.
3. "quote" MUST be a verbatim substring from the text chunk without altering words.
4. "subject_key" must be a dotted identifier (e.g. "system.architecture").

Respond ONLY with valid JSON array:
[
  {
    "statement": "...",
    "kind": "decision",
    "quote": "verbatim text from chunk",
    "subject_key": "domain.topic"
  }
]`;

    const controller = new AbortController();
    const timeout = setTimeout(() => controller.abort(), 3500);

    const resp = await fetch(endpoint, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        model,
        prompt,
        stream: false,
        format: 'json',
      }),
      signal: controller.signal,
    });
    clearTimeout(timeout);

    if (resp.ok) {
      const data = await resp.json() as any;
      const jsonText = data.response || data.content || '';
      rawCandidates = JSON.parse(jsonText);
      if (!Array.isArray(rawCandidates)) {
        rawCandidates = [rawCandidates];
      }
    } else {
      throw new Error(`LLM returned status ${resp.status}`);
    }
  } catch (err: any) {
    if (options.useFallbackIfUnreachable !== false) {
      // Fallback gracefully to deterministic rules extractor
      const rulesRun = runExtractionOnChunk(db, {
        projectId,
        chunkId,
        actor: 'rules_extractor_fallback',
      });
      return {
        runId: rulesRun.id,
        acceptedMemories: [],
        rejectedCandidates: [],
        usedFallback: true,
      };
    }
    throw new Error(`LLM extraction failed: ${err.message}`);
  }

  // 4. Start Run Record
  const runId = generatePrefixedId('run');
  const insertRun = db.prepare(`
    INSERT INTO extraction_runs (id, project_id, chunk_id, chunk_content_hash, extractor_name, extractor_version, started_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertRun.run(
    runId,
    projectId,
    chunkId,
    chunk.content_hash,
    extractorName,
    extractorVersion,
    new Date().toISOString()
  );

  const colInfo = db.prepare("PRAGMA table_info(memories)").all() as any[];
  const hasContentCol = colInfo.some(c => c.name === 'content');

  const insertMemory = hasContentCol
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

  const insertRejection = db.prepare(`
    INSERT INTO rejected_candidates (id, project_id, run_id, chunk_id, candidate_statement, reason, details, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const validKinds: MemoryKind[] = ['decision', 'constraint', 'convention', 'bug_fix', 'lesson'];
  const acceptedMemories: any[] = [];
  const rejectedCandidates: any[] = [];

  const existingProjectMemories = db.prepare('SELECT * FROM memories WHERE project_id = ?').all(projectId) as any[];

  // 5. Strict 8-Step Validation Pipeline
  for (const cand of rawCandidates) {
    const candidateJson = JSON.stringify(cand);

    // Step 1: schema_invalid
    if (!cand || typeof cand !== 'object' || !cand.statement || !cand.kind || !cand.quote) {
      const rejId = generatePrefixedId('rej');
      insertRejection.run(rejId, projectId, runId, chunkId, cand?.statement || '<empty>', 'schema_invalid', candidateJson, new Date().toISOString());
      rejectedCandidates.push({ id: rejId, reason: 'schema_invalid' });
      continue;
    }

    // Step 2: kind_invalid
    if (!validKinds.includes(cand.kind)) {
      const rejId = generatePrefixedId('rej');
      insertRejection.run(rejId, projectId, runId, chunkId, cand.statement, 'kind_invalid', `Invalid kind: ${cand.kind}`, new Date().toISOString());
      rejectedCandidates.push({ id: rejId, reason: 'kind_invalid' });
      continue;
    }

    // Step 3: statement_length
    if (cand.statement.trim().length < 10 || cand.statement.length > 500) {
      const rejId = generatePrefixedId('rej');
      insertRejection.run(rejId, projectId, runId, chunkId, cand.statement, 'statement_length', `Length: ${cand.statement.length}`, new Date().toISOString());
      rejectedCandidates.push({ id: rejId, reason: 'statement_length' });
      continue;
    }

    // Step 4: subject_invalid
    const subjectKey = (cand.subject_key || 'general').trim();
    if (subjectKey.length === 0 || subjectKey.length > 100) {
      const rejId = generatePrefixedId('rej');
      insertRejection.run(rejId, projectId, runId, chunkId, cand.statement, 'subject_invalid', `Subject key: ${subjectKey}`, new Date().toISOString());
      rejectedCandidates.push({ id: rejId, reason: 'subject_invalid' });
      continue;
    }

    // Step 5: quote_not_found (Invariant I1: verbatim check)
    const quoteVerify = verifyVerbatimExcerpt(chunk.content, cand.quote);
    if (!quoteVerify.valid) {
      const rejId = generatePrefixedId('rej');
      insertRejection.run(rejId, projectId, runId, chunkId, cand.statement, 'quote_not_found', `Quote not verbatim in chunk: ${cand.quote}`, new Date().toISOString());
      rejectedCandidates.push({ id: rejId, reason: 'quote_not_found' });
      continue;
    }

    // Step 6: exact_duplicate
    const exactDup = existingProjectMemories.find(
      (m) => (m.statement || m.content).trim().toLowerCase() === cand.statement.trim().toLowerCase()
    );
    if (exactDup) {
      const rejId = generatePrefixedId('rej');
      insertRejection.run(rejId, projectId, runId, chunkId, cand.statement, 'exact_duplicate', `Matches memory ${exactDup.id}`, new Date().toISOString());
      rejectedCandidates.push({ id: rejId, reason: 'exact_duplicate' });
      continue;
    }

    // Step 7: near_duplicate
    const nearDup = existingProjectMemories.find(
      (m) => jaccardSimilarity(m.statement || m.content, cand.statement) >= 0.85
    );
    if (nearDup) {
      const rejId = generatePrefixedId('rej');
      insertRejection.run(rejId, projectId, runId, chunkId, cand.statement, 'near_duplicate', `Similarity >= 0.85 to ${nearDup.id}`, new Date().toISOString());
      rejectedCandidates.push({ id: rejId, reason: 'near_duplicate' });
      continue;
    }

    // Step 8: Commit memory + verbatim evidence
    const memoryId = generatePrefixedId('mem');
    const evidenceId = generatePrefixedId('ev');
    const now = new Date().toISOString();

    if (hasContentCol) {
      insertMemory.run(memoryId, projectId, cand.kind, cand.statement.trim(), subjectKey, now, now, cand.statement.trim(), cand.kind);
    } else {
      insertMemory.run(memoryId, projectId, cand.kind, cand.statement.trim(), subjectKey, now, now);
    }

    insertEvidence.run(
      evidenceId,
      projectId,
      memoryId,
      chunkId,
      cand.quote,
      quoteVerify.startOffset,
      quoteVerify.endOffset,
      now
    );

    const created = {
      id: memoryId,
      project_id: projectId,
      kind: cand.kind,
      statement: cand.statement.trim(),
      subject_key: subjectKey,
      status: 'suggested',
      evidence: [
        {
          id: evidenceId,
          excerpt: cand.quote,
          start_offset: quoteVerify.startOffset,
          end_offset: quoteVerify.endOffset,
        },
      ],
    };

    acceptedMemories.push(created);
    existingProjectMemories.push(created);
  }

  // 6. Finalize Run Record
  db.prepare(`
    UPDATE extraction_runs
    SET completed_at = ?, accepted_count = ?, rejected_count = ?
    WHERE id = ?
  `).run(new Date().toISOString(), acceptedMemories.length, rejectedCandidates.length, runId);

  return {
    runId,
    acceptedMemories,
    rejectedCandidates,
    usedFallback: false,
  };
}
