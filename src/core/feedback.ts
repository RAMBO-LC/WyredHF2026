import Database from 'better-sqlite3';
import { FeedbackType, FeedbackEvent } from './types.js';
import { generatePrefixedId } from './invariants.js';

export class RateLimitError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'RateLimitError';
  }
}

/**
 * Invariant I5: Feedback never rewrites knowledge.
 * Records feedback events, computes actor ranking signals, and triggers review items.
 */
export function recordFeedback(
  db: Database.Database,
  params: {
    projectId: string;
    actor: string;
    memoryId: string;
    packId?: string;
    type: FeedbackType;
    targetMemoryId?: string;
  }
): { success: boolean; event: FeedbackEvent; reviewItemCreated?: boolean } {
  const { projectId, actor, memoryId, packId, type, targetMemoryId } = params;

  // 1. Validate project scope for memory
  const memStmt = db.prepare('SELECT * FROM memories WHERE id = ? AND project_id = ?');
  const memory = memStmt.get(memoryId, projectId) as any;
  if (!memory) {
    throw new Error(`Memory ${memoryId} not found in project ${projectId}`);
  }

  // 2. Validate target memory for duplicate_of
  if (type === 'duplicate_of') {
    if (!targetMemoryId) {
      throw new Error("Feedback type 'duplicate_of' requires targetMemoryId");
    }
    const target = memStmt.get(targetMemoryId, projectId) as any;
    if (!target) {
      throw new Error(`Target memory ${targetMemoryId} not found in project ${projectId}`);
    }
    if (target.kind !== memory.kind) {
      throw new Error(`Target memory must be of same kind '${memory.kind}'`);
    }
  }

  // 3. Enforce rate limit: max 60 feedback events per actor per hour
  const oneHourAgo = new Date(Date.now() - 3600 * 1000).toISOString();
  const countStmt = db.prepare(`
    SELECT COUNT(*) as cnt
    FROM feedback_events
    WHERE project_id = ? AND actor = ? AND created_at >= ?
  `);
  const rateCount = (countStmt.get(projectId, actor, oneHourAgo) as any).cnt || 0;
  if (rateCount >= 60) {
    throw new RateLimitError(`Rate limit exceeded for actor ${actor}: maximum 60 feedback events per hour`);
  }

  const now = new Date().toISOString();
  const eventId = generatePrefixedId('fb');

  // Check unique repeat from same actor
  const checkDuplicate = db.prepare(`
    SELECT * FROM feedback_events
    WHERE project_id = ? AND actor = ? AND memory_id = ? AND type = ?
  `);
  const existing = checkDuplicate.get(projectId, actor, memoryId, type) as any;
  if (existing) {
    return { success: true, event: existing, reviewItemCreated: false };
  }

  let reviewItemCreated = false;

  const tx = db.transaction(() => {
    // Insert feedback event
    const insertFb = db.prepare(`
      INSERT INTO feedback_events (id, project_id, actor, memory_id, pack_id, type, target_memory_id, created_at)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);
    insertFb.run(eventId, projectId, actor, memoryId, packId || null, type, targetMemoryId || null, now);

    // Audit event
    const insertAudit = db.prepare(`
      INSERT INTO audit_events (id, project_id, actor, event_type, entity_type, entity_id, details, created_at)
      VALUES (?, ?, ?, 'feedback_recorded', 'memory', ?, ?, ?)
    `);
    insertAudit.run(generatePrefixedId('aud'), projectId, actor, memoryId, JSON.stringify({ type, targetMemoryId }), now);

    // Review item creation rules
    if (type === 'outdated' || type === 'failed') {
      // Check if 3 distinct actors have flagged outdated or failed
      const distinctStmt = db.prepare(`
        SELECT COUNT(DISTINCT actor) as distinctActors
        FROM feedback_events
        WHERE memory_id = ? AND type = ?
      `);
      const distinctCount = (distinctStmt.get(memoryId, type) as any).distinctActors || 0;

      if (distinctCount >= 3) {
        const itemType = type === 'outdated' ? 'outdated_signal' : 'failed_signal';
        const existingReview = db.prepare(`
          SELECT id FROM review_items
          WHERE memory_id = ? AND type = ? AND status = 'open'
        `).get(memoryId, itemType);

        if (!existingReview) {
          const insertReview = db.prepare(`
            INSERT INTO review_items (id, project_id, type, status, memory_id, details, created_at)
            VALUES (?, ?, ?, 'open', ?, ?, ?)
          `);
          insertReview.run(
            generatePrefixedId('rev'),
            projectId,
            itemType,
            memoryId,
            JSON.stringify({ triggeredByDistinctActors: distinctCount, signalType: type }),
            now
          );
          reviewItemCreated = true;
        }
      }
    } else if (type === 'duplicate_of' && targetMemoryId) {
      const existingMerge = db.prepare(`
        SELECT id FROM review_items
        WHERE memory_id = ? AND target_memory_id = ? AND type = 'merge_suggestion' AND status = 'open'
      `).get(memoryId, targetMemoryId);

      if (!existingMerge) {
        const insertReview = db.prepare(`
          INSERT INTO review_items (id, project_id, type, status, memory_id, target_memory_id, details, created_at)
          VALUES (?, ?, 'merge_suggestion', 'open', ?, ?, ?, ?)
        `);
        insertReview.run(
          generatePrefixedId('rev'),
          projectId,
          memoryId,
          targetMemoryId,
          JSON.stringify({ suggestedBy: actor }),
          now
        );
        reviewItemCreated = true;
      }
    }
  });

  tx();

  return {
    success: true,
    event: {
      id: eventId,
      project_id: projectId,
      actor,
      memory_id: memoryId,
      pack_id: packId,
      type,
      target_memory_id: targetMemoryId,
      created_at: now,
    },
    reviewItemCreated,
  };
}
