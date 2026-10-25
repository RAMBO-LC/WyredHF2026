import Database from 'better-sqlite3';
import { Memory, MemoryKind } from './types.js';

export interface QueryTokens {
  raw: string;
  terms: string[];
  identifiers: string[];
  subjectHints: string[];
  taskType: 'bug_fix' | 'feature' | 'general';
}

export interface ScoredMemory {
  memory: Memory;
  score: number;
  factors: {
    lexical: number;
    identifier: number;
    kind: number;
    recency: number;
    feedback: number;
    neighborDecay?: number;
  };
  isNeighbor?: boolean;
  viaRelationship?: string;
  isUnreviewed?: boolean;
}

const STOPWORDS = new Set([
  'the', 'a', 'an', 'and', 'or', 'in', 'on', 'at', 'to', 'for', 'of', 'with',
  'is', 'was', 'are', 'were', 'be', 'been', 'by', 'as', 'it', 'this', 'that',
  'from', 'what', 'which', 'who', 'how', 'why', 'can', 'should', 'would', 'could',
]);

const KIND_WEIGHTS: Record<'bug_fix' | 'feature' | 'general', Record<MemoryKind, number>> = {
  bug_fix: {
    bug_fix: 1.0,
    constraint: 0.9,
    decision: 0.7,
    convention: 0.5,
    lesson: 0.5,
    reference: 0.3,
    task_outcome: 0.3,
  },
  feature: {
    constraint: 1.0,
    decision: 0.9,
    convention: 0.8,
    lesson: 0.5,
    bug_fix: 0.5,
    reference: 0.4,
    task_outcome: 0.3,
  },
  general: {
    constraint: 0.6,
    decision: 0.6,
    bug_fix: 0.6,
    convention: 0.6,
    lesson: 0.6,
    reference: 0.6,
    task_outcome: 0.6,
  },
};

/**
 * Tokenizes task query, preserving identifiers, file paths, backtick quotes, env vars, and ticket IDs.
 */
export function constructQueryTokens(query: string): QueryTokens {
  const identifiers: string[] = [];
  const terms: string[] = [];

  // 1. Backtick strings `ident`
  const backtickMatches = query.match(/`([^`]+)`/g) || [];
  for (const b of backtickMatches) {
    const clean = b.replace(/`/g, '').trim();
    if (clean) identifiers.push(clean);
  }

  // 2. File paths (e.g., src/server/index.ts or auth/jwt.go)
  const pathMatches = query.match(/[a-zA-Z0-9_\-\.]+\/[a-zA-Z0-9_\-\.\/]+/g) || [];
  for (const p of pathMatches) identifiers.push(p);

  // 3. ALL_CAPS env vars (e.g., OPENAI_API_KEY)
  const envMatches = query.match(/[A-Z][A-Z0-9_]{3,}/g) || [];
  for (const e of envMatches) identifiers.push(e);

  // 4. Ticket IDs (e.g., ABC-123)
  const ticketMatches = query.match(/[A-Z]{2,10}-[0-9]+/g) || [];
  for (const t of ticketMatches) identifiers.push(t);

  // 5. camelCase & snake_case identifiers
  const identMatches = query.match(/[a-z]+[A-Z0-9][a-zA-Z0-9]*|[a-z0-9]+_[a-z0-9_]+/g) || [];
  for (const i of identMatches) identifiers.push(i);

  // Normal words
  const words = query
    .toLowerCase()
    .replace(/[`"'\(\)\{\}\[\]]/g, ' ')
    .split(/[^a-z0-9_\-\/]+/)
    .filter((w) => w.length > 0);

  for (const w of words) {
    if (STOPWORDS.has(w)) continue;
    if (w.length < 3 && !identifiers.includes(w)) continue;
    terms.push(w);
  }

  // Detect task type
  const lowerQuery = query.toLowerCase();
  let taskType: 'bug_fix' | 'feature' | 'general' = 'general';
  if (/bug|fix|error|crash|issue|broken|fail|exception/.test(lowerQuery)) {
    taskType = 'bug_fix';
  } else if (/feature|implement|build|add|create|design|new/.test(lowerQuery)) {
    taskType = 'feature';
  }

  return {
    raw: query,
    terms: Array.from(new Set(terms)),
    identifiers: Array.from(new Set(identifiers)),
    subjectHints: Array.from(new Set(terms.filter((t) => t.includes('.') || t.includes('_')))),
    taskType,
  };
}

/**
 * Searches and scores memories for a given project and query.
 */
export function retrieveAndScoreMemories(
  db: Database.Database,
  params: {
    projectId: string;
    query: string;
    includeUnreviewed?: boolean;
    limit?: number;
  }
): { scored: ScoredMemory[]; isInsufficient: boolean; searchedTerms: string[] } {
  const { projectId, query, includeUnreviewed = false, limit = 40 } = params;
  const qTokens = constructQueryTokens(query);

  const statusCondition = includeUnreviewed
    ? "status IN ('approved', 'suggested')"
    : "status = 'approved'";

  // Fetch candidate memories with evidence
  const memStmt = db.prepare(`
    SELECT m.*,
      (SELECT json_group_array(
        json_object(
          'id', e.id,
          'chunk_id', e.chunk_id,
          'excerpt', e.excerpt,
          'start_offset', e.start_offset,
          'end_offset', e.end_offset,
          'is_stale', e.is_stale
        )
      ) FROM evidence e WHERE e.memory_id = m.id) as evidenceJson
    FROM memories m
    WHERE m.project_id = ? AND ${statusCondition}
  `);

  const rows = memStmt.all(projectId) as any[];
  const candidates: Memory[] = rows.map((r) => ({
    id: r.id,
    project_id: r.project_id,
    kind: r.kind,
    statement: r.statement,
    subject_key: r.subject_key,
    status: r.status,
    successor_id: r.successor_id,
    version: r.version,
    created_at: r.created_at,
    updated_at: r.updated_at,
    evidence: JSON.parse(r.evidenceJson || '[]'),
  }));

  // Fetch feedback signals
  const feedbackStmt = db.prepare(`
    SELECT actor, type
    FROM feedback_events
    WHERE memory_id = ?
  `);

  // Fetch neighbor relationships for graph traversal
  const relStmt = db.prepare(`
    SELECT r.source_id, r.target_id, r.type
    FROM memory_relationships r
    WHERE r.project_id = ?
  `);
  const relationships = relStmt.all(projectId) as any[];

  const scored: ScoredMemory[] = [];

  for (const mem of candidates) {
    const stmtLower = mem.statement.toLowerCase();
    const subjLower = mem.subject_key.toLowerCase();
    const evidenceText = (mem.evidence || []).map((e) => e.excerpt.toLowerCase()).join(' ');

    // 1. Lexical BM25 approximation
    let matchedTermsCount = 0;
    for (const term of qTokens.terms) {
      if (stmtLower.includes(term) || subjLower.includes(term) || evidenceText.includes(term)) {
        matchedTermsCount++;
      }
    }
    const lexicalScore = qTokens.terms.length > 0 ? Math.min(matchedTermsCount / qTokens.terms.length, 1.0) : 0.4;

    // 2. Identifier bonus (2.0)
    let hasIdentifier = false;
    for (const ident of qTokens.identifiers) {
      const idLower = ident.toLowerCase();
      if (stmtLower.includes(idLower) || evidenceText.includes(idLower)) {
        hasIdentifier = true;
        break;
      }
    }
    const identifierScore = hasIdentifier ? 2.0 : 0.0;


    // 3. Kind score based on task type
    const kindWeight = KIND_WEIGHTS[qTokens.taskType][mem.kind] || 0.6;

    // 4. Recency decay: exp(-ln(2) * days / 365)
    const createdMs = new Date(mem.created_at).getTime();
    const ageDays = Number.isFinite(createdMs) ? (Date.now() - createdMs) / (1000 * 60 * 60 * 24) : 0;
    const recencyScore = Math.exp(-Math.LN2 * (Math.max(ageDays, 0) / 365)) * 0.3;

    // 5. Feedback signal [-0.2, +0.2] with >= 5 distinct actors
    const fbRows = feedbackStmt.all(mem.id) as any[];
    const actorVotes = new Map<string, number>();
    for (const fb of fbRows) {
      if (!actorVotes.has(fb.actor)) {
        let val = 0;
        if (fb.type === 'useful' || fb.type === 'worked') val = 1.0;
        else if (fb.type === 'outdated' || fb.type === 'failed') val = -1.0;
        actorVotes.set(fb.actor, val);
      }
    }

    let feedbackScore = 0.0;
    if (actorVotes.size >= 5) {
      let net = 0;
      let isFirst = true;
      for (const val of actorVotes.values()) {
        net += isFirst ? val * 1.0 : val * 0.25;
        isFirst = false;
      }
      feedbackScore = Math.max(-0.2, Math.min(0.2, (net / actorVotes.size) * 0.2));
    }

    let totalScore = lexicalScore + identifierScore + kindWeight + recencyScore + feedbackScore;

    // Constraint minimum rule: constraint matching at least 1 term gets min 0.5
    if (mem.kind === 'constraint' && matchedTermsCount > 0) {
      totalScore = Math.max(totalScore, 0.5);
    }

    scored.push({
      memory: mem,
      score: totalScore,
      factors: {
        lexical: lexicalScore,
        identifier: identifierScore,
        kind: kindWeight,
        recency: recencyScore,
        feedback: feedbackScore,
      },
      isUnreviewed: mem.status === 'suggested',
    });
  }

  // When some memories share terms with the query, drop the ones that share none so they
  // don't pad the pack. With no lexical match at all, keep the kind/recency ranking as a fallback.
  if (qTokens.terms.length > 0 && scored.some((s) => s.factors.lexical > 0 || s.factors.identifier > 0)) {
    for (let i = scored.length - 1; i >= 0; i--) {
      if (scored[i].factors.lexical === 0 && scored[i].factors.identifier === 0) scored.splice(i, 1);
    }
  }

  // 6. Neighbor expansion (1-hop via fixes/depends_on/conflicts_with, approved only, score * 0.5)
  const candidateIds = new Set(scored.map((s) => s.memory.id));
  const neighborsToAdd: ScoredMemory[] = [];

  for (const s of scored) {
    if (s.memory.status !== 'approved') continue;

    for (const rel of relationships) {
      let neighborId: string | null = null;
      if (rel.source_id === s.memory.id) neighborId = rel.target_id;
      else if (rel.target_id === s.memory.id) neighborId = rel.source_id;

      if (neighborId && !candidateIds.has(neighborId)) {
        const nMem = candidates.find((c) => c.id === neighborId && c.status === 'approved');
        if (nMem) {
          candidateIds.add(neighborId);
          neighborsToAdd.push({
            memory: nMem,
            score: s.score * 0.5,
            factors: {
              lexical: s.factors.lexical * 0.5,
              identifier: 0,
              kind: KIND_WEIGHTS[qTokens.taskType][nMem.kind] * 0.5,
              recency: 0.1,
              feedback: 0,
              neighborDecay: 0.5,
            },
            isNeighbor: true,
            viaRelationship: rel.type,
          });
        }
      }
    }
  }

  const allScored = [...scored, ...neighborsToAdd];

  // Sort descending by score, tiebreak by ID ascending
  allScored.sort((a, b) => {
    if (b.score !== a.score) return b.score - a.score;
    return a.memory.id.localeCompare(b.memory.id);
  });

  // Insufficiency check: if no approved candidate has lexical >= 0.2 or identifier == 2.0
  const hasStrongApproved = allScored.some(
    (s) => s.memory.status === 'approved' && (s.factors.lexical >= 0.2 || s.factors.identifier >= 1.0)
  );

  return {
    scored: allScored.slice(0, limit),
    isInsufficient: !hasStrongApproved,
    searchedTerms: qTokens.terms,
  };
}
