import Database from 'better-sqlite3';
import { MemoryStatus, Memory } from './types.js';
import { generatePrefixedId } from './invariants.js';

export class InvalidTransitionError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'InvalidTransitionError';
  }
}

export class VersionConflictError extends Error {
  constructor(message: string) {
    super(message);
    this.name = 'VersionConflictError';
  }
}

/**
 * Invariant I4: One transition function.
 * transitionMemory() is the ONLY code that updates memories.status.
 * Enforces version check + optimistic locking + one audit event.
 */
export function transitionMemory(
  db: Database.Database,
  params: {
    projectId: string;
    memoryId: string;
    expectedVersion: number;
    newStatus: MemoryStatus;
    successorId?: string;
    actor: string;
    reason?: string;
  }
): Memory {
  const { projectId, memoryId, expectedVersion, newStatus, successorId, actor, reason } = params;

  const getStmt = db.prepare('SELECT * FROM memories WHERE id = ? AND project_id = ?');
  const memory = getStmt.get(memoryId, projectId) as any;

  if (!memory) {
    throw new Error(`Memory ${memoryId} not found in project ${projectId}`);
  }

  // Optimistic locking check
  if (memory.version !== expectedVersion) {
    throw new VersionConflictError(
      `Version conflict on memory ${memoryId}: expected version ${expectedVersion}, but current is ${memory.version}. Reload and retry.`
    );
  }

  // Allowed transitions
  const current = memory.status as MemoryStatus;
  const isAllowed =
    (current === 'suggested' && (newStatus === 'approved' || newStatus === 'archived')) ||
    (current === 'approved' && (newStatus === 'archived' || newStatus === 'superseded'));

  if (!isAllowed) {
    throw new InvalidTransitionError(
      `Illegal transition from '${current}' to '${newStatus}' for memory ${memoryId}`
    );
  }

  // If superseded, successor must exist in same project, be approved, and not create a self-reference/cycle
  if (newStatus === 'superseded') {
    if (!successorId) {
      throw new InvalidTransitionError('Superseding a memory requires a valid successorId');
    }
    if (successorId === memoryId) {
      throw new InvalidTransitionError('Memory cannot supersede itself');
    }

    const successor = getStmt.get(successorId, projectId) as any;
    if (!successor) {
      throw new InvalidTransitionError(
        `Successor ${successorId} does not exist in project ${projectId}`
      );
    }
    if (successor.status !== 'approved') {
      throw new InvalidTransitionError(
        `Successor ${successorId} must be in 'approved' status`
      );
    }
  }

  const now = new Date().toISOString();
  const nextVersion = memory.version + 1;

  const updateStmt = db.prepare(`
    UPDATE memories
    SET status = ?, successor_id = ?, version = ?, updated_at = ?
    WHERE id = ? AND project_id = ? AND version = ?
  `);

  const auditStmt = db.prepare(`
    INSERT INTO audit_events (id, project_id, actor, event_type, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, 'memory_transition', 'memory', ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    const res = updateStmt.run(
      newStatus,
      successorId || null,
      nextVersion,
      now,
      memoryId,
      projectId,
      expectedVersion
    );

    if (res.changes === 0) {
      throw new VersionConflictError(
        `Concurrent update detected on memory ${memoryId}. Transaction aborted.`
      );
    }

    auditStmt.run(
      generatePrefixedId('aud'),
      projectId,
      actor,
      memoryId,
      JSON.stringify({
        fromStatus: current,
        toStatus: newStatus,
        successorId: successorId || null,
        version: nextVersion,
        reason: reason || null,
      }),
      now
    );
  });

  tx();

  return {
    ...memory,
    status: newStatus,
    successor_id: successorId,
    version: nextVersion,
    updated_at: now,
  };
}

/**
 * Human edit of memory statement. Requires expected version and writes audit event.
 */
export function updateMemoryStatement(
  db: Database.Database,
  params: {
    projectId: string;
    memoryId: string;
    expectedVersion: number;
    statement: string;
    actor: string;
    reason: string;
  }
): Memory {
  const { projectId, memoryId, expectedVersion, statement, actor, reason } = params;

  if (!statement || statement.trim().length < 10 || statement.trim().length > 300) {
    throw new Error('Statement must be between 10 and 300 characters');
  }
  if (!reason || !reason.trim()) {
    throw new Error('Human statement edit requires a reason');
  }

  const getStmt = db.prepare('SELECT * FROM memories WHERE id = ? AND project_id = ?');
  const memory = getStmt.get(memoryId, projectId) as any;

  if (!memory) {
    throw new Error(`Memory ${memoryId} not found in project ${projectId}`);
  }

  if (memory.version !== expectedVersion) {
    throw new VersionConflictError(
      `Version conflict on memory ${memoryId}: expected version ${expectedVersion}, but current is ${memory.version}`
    );
  }

  const now = new Date().toISOString();
  const nextVersion = memory.version + 1;

  const updateStmt = db.prepare(`
    UPDATE memories
    SET statement = ?, version = ?, updated_at = ?
    WHERE id = ? AND project_id = ? AND version = ?
  `);

  const auditStmt = db.prepare(`
    INSERT INTO audit_events (id, project_id, actor, event_type, entity_type, entity_id, details, created_at)
    VALUES (?, ?, ?, 'memory_statement_updated', 'memory', ?, ?, ?)
  `);

  const tx = db.transaction(() => {
    const res = updateStmt.run(statement.trim(), nextVersion, now, memoryId, projectId, expectedVersion);
    if (res.changes === 0) {
      throw new VersionConflictError(`Concurrent update detected on memory ${memoryId}`);
    }

    auditStmt.run(
      generatePrefixedId('aud'),
      projectId,
      actor,
      memoryId,
      JSON.stringify({
        oldStatement: memory.statement,
        newStatement: statement.trim(),
        reason,
        version: nextVersion,
      }),
      now
    );
  });

  tx();

  return {
    ...memory,
    statement: statement.trim(),
    version: nextVersion,
    updated_at: now,
  };
}
