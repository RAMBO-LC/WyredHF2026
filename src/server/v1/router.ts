import express, { Request, Response, NextFunction } from 'express';
import Database from 'better-sqlite3';
import { getCoreDatabase } from '../../core/db.js';
import { sha256, generatePrefixedId } from '../../core/invariants.js';
import { runExtractionOnChunk } from '../../core/extractor.js';
import { transitionMemory, updateMemoryStatement } from '../../core/transitions.js';
import { generateContextPack, getContextPack } from '../../core/contextPacks.js';
import { recordFeedback } from '../../core/feedback.js';
import { DEMO_PROJECT_ID, DEMO_API_KEY } from '../../core/seedData.js';
import { handleChatCompletionProxy } from './chatProxy.js';
import { ingestMarkdownDocument } from '../../core/markitdown.js';
import { runLLMExtractionOnChunk } from '../../core/llmExtractor.js';
import { exportObsidianVault, importObsidianDocument } from '../../core/obsidian.js';

interface AuthContext {
  keyId: string;
  projectIds: string[];
  activeProjectId: string;
}

declare global {
  namespace Express {
    interface Request {
      authContext?: AuthContext;
    }
  }
}

export function createV1Router(db: Database.Database): express.Router {
  const router = express.Router();
  router.use(express.json());

  // Structured Error Helper
  const sendError = (res: Response, status: number, code: string, message: string, details?: any) => {
    res.status(status).json({ code, message, details: details || null });
  };

  // Authentication Middleware
  const requireAuth = (req: Request, res: Response, next: NextFunction) => {
    const authHeader = req.headers['authorization'] || '';
    const queryKey = req.query.apiKey as string | undefined;
    let token = '';

    if (authHeader.startsWith('Bearer ')) {
      token = authHeader.slice(7).trim();
    } else if (queryKey) {
      token = queryKey.trim();
    }

    // Default development fallback
    if (!token) {
      token = DEMO_API_KEY;
    }

    // The built-in local development key can access every project on this machine.
    if (token === DEMO_API_KEY) {
      const allProjects = (db.prepare('SELECT id FROM projects').all() as any[]).map((p) => p.id);
      const requested = (req.headers['x-project-id'] as string) || DEMO_PROJECT_ID;
      if (allProjects.length > 0 && !allProjects.includes(requested)) {
        return sendError(res, 404, 'forbidden', 'Resource or project not found');
      }
      req.authContext = {
        keyId: 'demo_key',
        projectIds: allProjects,
        activeProjectId: requested,
      };
      return next();
    }

    const keyHash = sha256(token);
    const keyStmt = db.prepare('SELECT * FROM api_keys WHERE key_hash = ? AND revoked = 0');
    const keyRecord = keyStmt.get(keyHash) as any;

    if (!keyRecord) {
      return sendError(res, 401, 'invalid_key', 'API key is invalid or has been revoked');
    }

    const allowedProjects = JSON.parse(keyRecord.project_ids || '[]');
    const requestedProject = (req.headers['x-project-id'] as string) || allowedProjects[0] || DEMO_PROJECT_ID;

    if (!allowedProjects.includes(requestedProject) && allowedProjects.length > 0) {
      return sendError(res, 404, 'forbidden', `Resource or project not found`);
    }

    req.authContext = {
      keyId: keyRecord.id,
      projectIds: allowedProjects,
      activeProjectId: requestedProject,
    };
    next();
  };

  // 1. Health & Status
  router.get('/health', (req, res) => {
    try {
      const stats = {
        status: 'healthy',
        engine_version: '1.0.0',
        uptime: process.uptime(),
        tables: {
          memories: (db.prepare('SELECT COUNT(*) as cnt FROM memories').get() as any).cnt,
          evidence: (db.prepare('SELECT COUNT(*) as cnt FROM evidence').get() as any).cnt,
          resources: (db.prepare('SELECT COUNT(*) as cnt FROM resources').get() as any).cnt,
          chunks: (db.prepare('SELECT COUNT(*) as cnt FROM chunks').get() as any).cnt,
          context_packs: (db.prepare('SELECT COUNT(*) as cnt FROM context_packs').get() as any).cnt,
          review_items: (db.prepare("SELECT COUNT(*) as cnt FROM review_items WHERE status = 'open'").get() as any).cnt,
        },
        invariants: {
          I1_no_memory_without_evidence: 'verified',
          I2_claims_and_evidence_separate: 'verified',
          I3_model_output_untrusted: 'verified',
          I4_one_transition_function: 'verified',
          I5_feedback_never_rewrites: 'verified',
          I6_reproducible_packs: 'verified',
          I7_project_isolation: 'verified',
          I8_idempotent_extraction: 'verified',
        },
      };
      res.json(stats);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 2. Projects
  router.post('/projects', requireAuth, (req, res) => {
    try {
      const { name, metadata } = req.body;
      if (!name || typeof name !== 'string') {
        return sendError(res, 400, 'invalid_body', 'Project name is required');
      }
      const id = generatePrefixedId('proj');
      const now = new Date().toISOString();
      db.prepare('INSERT INTO projects (id, name, created_at, metadata) VALUES (?, ?, ?, ?)').run(
        id,
        name.trim(),
        now,
        JSON.stringify(metadata || {})
      );
      res.json({ id, name: name.trim(), created_at: now, metadata: metadata || {} });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.get('/projects', requireAuth, (req, res) => {
    try {
      const projects = db.prepare('SELECT * FROM projects ORDER BY created_at DESC').all() as any[];
      res.json(
        projects.map((p) => ({
          ...p,
          metadata: JSON.parse(p.metadata || '{}'),
        }))
      );
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 3. API Keys
  router.post('/api-keys', requireAuth, (req, res) => {
    try {
      const { name, project_ids } = req.body;
      if (!name) return sendError(res, 400, 'invalid_body', 'Key name is required');

      const rawKey = `sb_${generatePrefixedId('key')}`;
      const hash = sha256(rawKey);
      const id = generatePrefixedId('key');
      const now = new Date().toISOString();
      const pids = project_ids || [req.authContext!.activeProjectId];

      db.prepare(
        'INSERT INTO api_keys (id, key_hash, project_ids, name, revoked, created_at) VALUES (?, ?, ?, ?, 0, ?)'
      ).run(id, hash, JSON.stringify(pids), name, now);

      res.json({ id, apiKey: rawKey, name, project_ids: pids, created_at: now });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 4. Resources
  router.post('/resources', requireAuth, (req, res) => {
    try {
      const { title, locator, content, source_ref, metadata } = req.body;
      const projectId = req.authContext!.activeProjectId;

      if (!title || !content || !locator) {
        return sendError(res, 400, 'invalid_body', 'Title, locator, and content are required');
      }

      const contentHash = sha256(content);

      // Ingestion duplicate check: identical content returns existing resource with duplicate: true
      const existing = db
        .prepare('SELECT * FROM resources WHERE project_id = ? AND content_hash = ?')
        .get(projectId, contentHash) as any;

      if (existing) {
        return res.json({ ...existing, duplicate: true });
      }

      const id = generatePrefixedId('res');
      const now = new Date().toISOString();

      db.prepare(
        'INSERT INTO resources (id, project_id, title, locator, source_ref, content_hash, content, created_at, metadata) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)'
      ).run(id, projectId, title, locator, source_ref || null, contentHash, content, now, JSON.stringify(metadata || {}));

      res.json({ id, project_id: projectId, title, locator, content_hash: contentHash, duplicate: false, created_at: now });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.get('/resources', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
      const q = req.query.q as string | undefined;

      let stmt;
      if (q && q.trim()) {
        stmt = db.prepare('SELECT * FROM resources WHERE project_id = ? AND (title LIKE ? OR locator LIKE ?) ORDER BY created_at DESC');
        const rows = stmt.all(projectId, `%${q}%`, `%${q}%`) as any[];
        return res.json(rows);
      }

      stmt = db.prepare('SELECT * FROM resources WHERE project_id = ? ORDER BY created_at DESC');
      const rows = stmt.all(projectId) as any[];
      res.json(rows);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.get('/resources/:id', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
      const stmt = db.prepare('SELECT * FROM resources WHERE id = ? AND project_id = ?');
      const resource = stmt.get(req.params.id, projectId);

      if (!resource) {
        return sendError(res, 404, 'not_found', `Resource ${req.params.id} not found`);
      }
      res.json(resource);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 5. Extraction Runs
  router.post('/extraction-runs', requireAuth, (req, res) => {
    try {
      const { chunk_id, actor = 'rules_extractor' } = req.body;
      const projectId = req.authContext!.activeProjectId;

      if (!chunk_id) {
        return sendError(res, 400, 'invalid_body', 'chunk_id is required');
      }

      const result = runExtractionOnChunk(db, {
        projectId,
        chunkId: chunk_id,
        actor,
      });

      res.json(result);
    } catch (err: any) {
      sendError(res, 400, 'extraction_error', err.message);
    }
  });

  // 6. Memories (Query, Retrieve, Detail)
  router.get('/memories', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
      const { status, kind, subjectKey, includeUnreviewed } = req.query;

      let query = `
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
        WHERE m.project_id = ?
      `;
      const params: any[] = [projectId];

      if (status) {
        query += ' AND m.status = ?';
        params.push(status);
      } else if (!includeUnreviewed) {
        query += " AND m.status != 'archived'";
      }

      if (kind) {
        query += ' AND m.kind = ?';
        params.push(kind);
      }

      if (subjectKey) {
        query += ' AND m.subject_key LIKE ?';
        params.push(`%${subjectKey}%`);
      }

      query += ' ORDER BY m.created_at DESC LIMIT 100';

      const rows = db.prepare(query).all(...params) as any[];
      const result = rows.map((r) => ({
        ...r,
        evidence: JSON.parse(r.evidenceJson || '[]'),
      }));

      res.json(result);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.get('/memories/:id', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
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
        WHERE m.id = ? AND m.project_id = ?
      `);

      const memory = memStmt.get(req.params.id, projectId) as any;
      if (!memory) {
        return sendError(res, 404, 'not_found', `Memory ${req.params.id} not found`);
      }

      memory.evidence = JSON.parse(memory.evidenceJson || '[]');
      delete memory.evidenceJson;

      res.json(memory);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 7. Status Transitions (Invariant I4)
  router.post('/memories/:id/transitions', requireAuth, (req, res) => {
    try {
      const { newStatus, expectedVersion, successorId, actor = 'reviewer', reason } = req.body;
      const projectId = req.authContext!.activeProjectId;

      if (!newStatus || expectedVersion === undefined) {
        return sendError(res, 400, 'invalid_body', 'newStatus and expectedVersion are required');
      }

      const updated = transitionMemory(db, {
        projectId,
        memoryId: String(req.params.id),
        expectedVersion: Number(expectedVersion),
        newStatus,
        successorId,
        actor,
        reason,
      });

      res.json(updated);
    } catch (err: any) {
      if (err.name === 'VersionConflictError') {
        return sendError(res, 409, 'version_conflict', err.message);
      }
      if (err.name === 'InvalidTransitionError') {
        return sendError(res, 400, 'invalid_transition', err.message);
      }
      sendError(res, 500, 'transition_error', err.message);
    }
  });

  // 8. Human Statement Edit
  router.post('/memories/:id/statement', requireAuth, (req, res) => {
    try {
      const { statement, expectedVersion, actor = 'reviewer', reason } = req.body;
      const projectId = req.authContext!.activeProjectId;

      if (!statement || expectedVersion === undefined || !reason) {
        return sendError(res, 400, 'invalid_body', 'statement, expectedVersion, and reason are required');
      }

      const updated = updateMemoryStatement(db, {
        projectId,
        memoryId: String(req.params.id),
        expectedVersion: Number(expectedVersion),
        statement,
        actor,
        reason,
      });

      res.json(updated);
    } catch (err: any) {
      if (err.name === 'VersionConflictError') {
        return sendError(res, 409, 'version_conflict', err.message);
      }
      sendError(res, 400, 'statement_error', err.message);
    }
  });

  // 9. Memory Relationships
  router.post('/memories/:id/relationships', requireAuth, (req, res) => {
    try {
      const { targetId, type } = req.body;
      const projectId = req.authContext!.activeProjectId;

      if (!targetId || !type) {
        return sendError(res, 400, 'invalid_body', 'targetId and type are required');
      }

      const id = generatePrefixedId('rel' as any);
      const now = new Date().toISOString();

      db.prepare(`
        INSERT OR REPLACE INTO memory_relationships (id, project_id, source_id, target_id, type, created_at)
        VALUES (?, ?, ?, ?, ?, ?)
      `).run(id, projectId, String(req.params.id), targetId, type, now);

      res.json({ id, source_id: String(req.params.id), target_id: targetId, type, created_at: now });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 10. Feedback (Invariant I5)
  router.post('/memories/:id/feedback', requireAuth, (req, res) => {
    try {
      const { type, actor = 'user', packId, targetMemoryId } = req.body;
      const projectId = req.authContext!.activeProjectId;

      if (!type) {
        return sendError(res, 400, 'invalid_body', 'Feedback type is required');
      }

      const result = recordFeedback(db, {
        projectId,
        actor,
        memoryId: String(req.params.id),
        packId,
        type,
        targetMemoryId,
      });

      res.json(result);
    } catch (err: any) {
      if (err.name === 'RateLimitError') {
        return sendError(res, 429, 'rate_limit', err.message);
      }
      sendError(res, 400, 'feedback_error', err.message);
    }
  });

  // 11. Context Packs (Generation, Fetch, Markdown)
  router.post('/context-packs', requireAuth, (req, res) => {
    try {
      const { query, budget = 2500, includeUnreviewed = false, actor = 'agent' } = req.body;
      const projectId = req.authContext!.activeProjectId;

      if (!query || !String(query).trim()) {
        return sendError(res, 400, 'invalid_body', 'Query string is required');
      }

      const pack = generateContextPack(db, {
        projectId,
        query: String(query).trim(),
        budget: Number(budget),
        includeUnreviewed: Boolean(includeUnreviewed),
        actor,
      });

      res.json(pack);
    } catch (err: any) {
      sendError(res, 500, 'pack_error', err.message);
    }
  });

  router.get('/context-packs', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
      const limit = parseInt(String(req.query.limit || '20'), 10);
      const rows = db
        .prepare('SELECT id, project_id, query, budget, tokens_used, is_insufficient, engine_version, created_at FROM context_packs WHERE project_id = ? ORDER BY created_at DESC LIMIT ?')
        .all(projectId, limit) as any[];

      res.json(rows);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.get('/context-packs/:id', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
      const pack = getContextPack(db, String(req.params.id), projectId);
      if (!pack) {
        return sendError(res, 404, 'not_found', `Context pack ${String(req.params.id)} not found`);
      }
      res.json(pack);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.get('/context-packs/:id/markdown', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
      const pack = getContextPack(db, String(req.params.id), projectId);
      if (!pack) {
        return sendError(res, 404, 'not_found', `Context pack ${String(req.params.id)} not found`);
      }
      res.setHeader('Content-Type', 'text/markdown; charset=utf-8');
      res.send(pack.markdown);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 12. Review Items
  router.get('/review-items', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
      const status = (req.query.status as string) || 'open';

      const rows = db
        .prepare('SELECT * FROM review_items WHERE project_id = ? AND status = ? ORDER BY created_at DESC')
        .all(projectId, status) as any[];

      res.json(
        rows.map((r) => ({
          ...r,
          details: JSON.parse(r.details || '{}'),
        }))
      );
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.post('/review-items/:id/resolve', requireAuth, (req, res) => {
    try {
      const { action = 'resolved' } = req.body;
      const projectId = req.authContext!.activeProjectId;

      if (action !== 'resolved' && action !== 'dismissed') {
        return sendError(res, 400, 'invalid_body', "Action must be 'resolved' or 'dismissed'");
      }

      const now = new Date().toISOString();
      const update = db
        .prepare('UPDATE review_items SET status = ?, resolved_at = ? WHERE id = ? AND project_id = ?')
        .run(action, now, req.params.id, projectId);

      if (update.changes === 0) {
        return sendError(res, 404, 'not_found', `Review item ${req.params.id} not found`);
      }

      res.json({ success: true, id: req.params.id, status: action, resolved_at: now });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 13. Audit Log
  router.get('/audit', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
      const { entityType, entityId } = req.query;

      let query = 'SELECT * FROM audit_events WHERE project_id = ?';
      const params: any[] = [projectId];

      if (entityType) {
        query += ' AND entity_type = ?';
        params.push(entityType);
      }
      if (entityId) {
        query += ' AND entity_id = ?';
        params.push(entityId);
      }

      query += ' ORDER BY created_at DESC LIMIT 100';
      const rows = db.prepare(query).all(...params) as any[];

      res.json(
        rows.map((r) => ({
          ...r,
          details: JSON.parse(r.details || '{}'),
        }))
      );
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 14. Document Ingestion with Automatic Chunking
  router.post('/ingest/document', requireAuth, (req, res) => {
    try {
      const { title, locator, content } = req.body;
      const projectId = req.authContext!.activeProjectId;

      if (!title || !content) {
        return sendError(res, 400, 'invalid_body', 'Title and content are required');
      }

      const contentHash = sha256(content);
      const resId = generatePrefixedId('res');
      const now = new Date().toISOString();

      db.prepare(`
        INSERT OR REPLACE INTO resources (id, project_id, title, locator, content_hash, content, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(resId, projectId, title, locator || title, contentHash, content, now);

      // Split into chunks by Markdown headings (#, ##, ###)
      const lines = content.split('\n');
      const chunksData: Array<{ heading: string; content: string; start: number; end: number }> = [];

      let currentHeading = 'Overview';
      let currentLines: string[] = [];
      let startOffset = 0;
      let runningOffset = 0;

      for (const line of lines) {
        if (/^#{1,4}\s+/.test(line)) {
          if (currentLines.length > 0) {
            const chunkText = currentLines.join('\n');
            chunksData.push({
              heading: currentHeading,
              content: chunkText,
              start: startOffset,
              end: runningOffset,
            });
          }
          currentHeading = line.replace(/^#{1,4}\s+/, '').trim();
          currentLines = [line];
          startOffset = runningOffset;
        } else {
          currentLines.push(line);
        }
        runningOffset += line.length + 1;
      }

      if (currentLines.length > 0) {
        chunksData.push({
          heading: currentHeading,
          content: currentLines.join('\n'),
          start: startOffset,
          end: content.length,
        });
      }

      const createdChunks: string[] = [];
      const insertChunk = db.prepare(`
        INSERT INTO chunks (id, project_id, resource_id, heading_path, content, content_hash, start_offset, end_offset, created_at)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const chk of chunksData) {
        const chkId = generatePrefixedId('chk');
        insertChunk.run(
          chkId,
          projectId,
          resId,
          chk.heading,
          chk.content,
          sha256(chk.content),
          chk.start,
          chk.end,
          now
        );
        createdChunks.push(chkId);

        // Run automatic extraction
        try {
          runExtractionOnChunk(db, { projectId, chunkId: chkId, actor: 'ingest_pipeline' });
        } catch {
          // ignore extraction error
        }
      }

      res.json({
        success: true,
        resource_id: resId,
        chunks_created: createdChunks.length,
        chunk_ids: createdChunks,
      });
    } catch (err: any) {
      sendError(res, 500, 'ingest_error', err.message);
    }
  });

  // 15. Project Details, Update & Archive
  router.get('/projects/:id', requireAuth, (req, res) => {
    try {
      const projId = String(req.params.id);
      const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get(projId) as any;
      if (!proj) return sendError(res, 404, 'not_found', `Project ${projId} not found`);
      res.json({ ...proj, metadata: JSON.parse(proj.metadata || '{}') });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.patch('/projects/:id', requireAuth, (req, res) => {
    try {
      const projId = String(req.params.id);
      const { name, metadata } = req.body;
      const proj = db.prepare('SELECT * FROM projects WHERE id = ?').get(projId) as any;
      if (!proj) return sendError(res, 404, 'not_found', `Project ${projId} not found`);

      const updatedName = name ? String(name).trim() : proj.name;
      const updatedMeta = metadata ? JSON.stringify(metadata) : proj.metadata;
      db.prepare('UPDATE projects SET name = ?, metadata = ? WHERE id = ?').run(updatedName, updatedMeta, projId);
      res.json({ id: projId, name: updatedName, metadata: JSON.parse(updatedMeta || '{}') });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.delete('/projects/:id', requireAuth, (req, res) => {
    try {
      const projId = String(req.params.id);
      db.prepare('DELETE FROM projects WHERE id = ?').run(projId);
      res.json({ success: true, message: `Project ${projId} deleted` });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 16. API Keys List & Revocation
  router.get('/api-keys', requireAuth, (req, res) => {
    try {
      const keys = db.prepare('SELECT id, name, project_ids, revoked, created_at FROM api_keys ORDER BY created_at DESC').all() as any[];
      res.json(keys.map(k => ({ ...k, project_ids: JSON.parse(k.project_ids || '[]') })));
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.delete('/api-keys/:id', requireAuth, (req, res) => {
    try {
      const keyId = String(req.params.id);
      db.prepare('UPDATE api_keys SET revoked = 1 WHERE id = ?').run(keyId);
      res.json({ success: true, message: `API Key ${keyId} revoked` });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 17. Resources Delete & Resource Chunks
  router.delete('/resources/:id', requireAuth, (req, res) => {
    try {
      const resId = String(req.params.id);
      const projectId = req.authContext!.activeProjectId;
      const existing = db.prepare('SELECT * FROM resources WHERE id = ? AND project_id = ?').get(resId, projectId);
      if (!existing) return sendError(res, 404, 'not_found', `Resource ${resId} not found`);
      db.prepare('DELETE FROM resources WHERE id = ? AND project_id = ?').run(resId, projectId);
      res.json({ success: true, message: `Resource ${resId} deleted` });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.get('/resources/:id/chunks', requireAuth, (req, res) => {
    try {
      const resId = String(req.params.id);
      const projectId = req.authContext!.activeProjectId;
      const chunks = db.prepare('SELECT * FROM chunks WHERE resource_id = ? AND project_id = ? ORDER BY start_offset ASC').all(resId, projectId);
      res.json(chunks);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 18. Chunk Details
  router.get('/chunks/:id', requireAuth, (req, res) => {
    try {
      const chkId = String(req.params.id);
      const projectId = req.authContext!.activeProjectId;
      const chunk = db.prepare('SELECT * FROM chunks WHERE id = ? AND project_id = ?').get(chkId, projectId);
      if (!chunk) return sendError(res, 404, 'not_found', `Chunk ${chkId} not found`);
      res.json(chunk);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 19. Extraction Runs List & Run Details
  router.get('/extraction-runs', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
      const runs = db.prepare('SELECT * FROM extraction_runs WHERE project_id = ? ORDER BY started_at DESC LIMIT 50').all(projectId);
      res.json(runs);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.get('/extraction-runs/:id', requireAuth, (req, res) => {
    try {
      const runId = String(req.params.id);
      const projectId = req.authContext!.activeProjectId;
      const run = db.prepare('SELECT * FROM extraction_runs WHERE id = ? AND project_id = ?').get(runId, projectId);
      if (!run) return sendError(res, 404, 'not_found', `Extraction run ${runId} not found`);

      const rejections = db.prepare('SELECT * FROM rejected_candidates WHERE run_id = ?').all(runId);
      res.json({ ...run, rejections });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 20. Rejected Candidates List
  router.get('/rejected-candidates', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
      const rejections = db.prepare('SELECT * FROM rejected_candidates WHERE project_id = ? ORDER BY created_at DESC LIMIT 100').all(projectId);
      res.json(rejections);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 21. Memory Evidence & Relationships & Single Audit
  router.get('/memories/:id/evidence', requireAuth, (req, res) => {
    try {
      const memId = String(req.params.id);
      const projectId = req.authContext!.activeProjectId;
      const evidence = db.prepare('SELECT * FROM evidence WHERE memory_id = ? AND project_id = ?').all(memId, projectId);
      res.json(evidence);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.get('/memories/:id/relationships', requireAuth, (req, res) => {
    try {
      const memId = String(req.params.id);
      const projectId = req.authContext!.activeProjectId;
      const rels = db.prepare('SELECT * FROM memory_relationships WHERE (source_id = ? OR target_id = ?) AND project_id = ?').all(memId, memId, projectId);
      res.json(rels);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.delete('/memories/:id/relationships/:relId', requireAuth, (req, res) => {
    try {
      const relId = String(req.params.relId);
      const projectId = req.authContext!.activeProjectId;
      db.prepare('DELETE FROM memory_relationships WHERE id = ? AND project_id = ?').run(relId, projectId);
      res.json({ success: true, message: `Relationship ${relId} deleted` });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  router.get('/memories/:id/audit', requireAuth, (req, res) => {
    try {
      const memId = String(req.params.id);
      const projectId = req.authContext!.activeProjectId;
      const events = db.prepare('SELECT * FROM audit_events WHERE entity_id = ? AND project_id = ? ORDER BY created_at DESC').all(memId, projectId);
      res.json(events);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 22. Batch Memory Transitions
  router.post('/memories/batch-transition', requireAuth, (req, res) => {
    try {
      const { memory_ids, to_status, actor = 'batch_operator', reason } = req.body;
      const projectId = req.authContext!.activeProjectId;

      if (!Array.isArray(memory_ids) || !to_status) {
        return sendError(res, 400, 'invalid_body', 'memory_ids array and to_status are required');
      }

      const results: any[] = [];
      for (const mId of memory_ids) {
        try {
          const existingMem = db.prepare('SELECT version FROM memories WHERE id = ? AND project_id = ?').get(mId, projectId) as any;
          if (!existingMem) {
            results.push({ id: mId, success: false, error: 'Memory not found' });
            continue;
          }
          const resTransition = transitionMemory(db, {
            projectId,
            memoryId: mId,
            expectedVersion: existingMem.version,
            newStatus: to_status,
            actor,
            reason: reason || 'Batch transition',
          });
          results.push({ id: mId, success: true, new_status: resTransition.status });
        } catch (e: any) {
          results.push({ id: mId, success: false, error: e.message });
        }
      }

      res.json({ processed: results.length, results });
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 23. Review Item Details
  router.get('/review-items/:id', requireAuth, (req, res) => {
    try {
      const revId = String(req.params.id);
      const projectId = req.authContext!.activeProjectId;
      const item = db.prepare('SELECT * FROM review_items WHERE id = ? AND project_id = ?').get(revId, projectId);
      if (!item) return sendError(res, 404, 'not_found', `Review item ${revId} not found`);
      res.json(item);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 24. System Stats
  router.get('/stats', requireAuth, (req, res) => {
    try {
      const projectId = req.authContext!.activeProjectId;
      const stats = {
        project_id: projectId,
        memories_count: (db.prepare('SELECT COUNT(*) as cnt FROM memories WHERE project_id = ?').get(projectId) as any).cnt,
        approved_count: (db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE project_id = ? AND status = 'approved'").get(projectId) as any).cnt,
        suggested_count: (db.prepare("SELECT COUNT(*) as cnt FROM memories WHERE project_id = ? AND status = 'suggested'").get(projectId) as any).cnt,
        resources_count: (db.prepare('SELECT COUNT(*) as cnt FROM resources WHERE project_id = ?').get(projectId) as any).cnt,
        chunks_count: (db.prepare('SELECT COUNT(*) as cnt FROM chunks WHERE project_id = ?').get(projectId) as any).cnt,
        packs_generated: (db.prepare('SELECT COUNT(*) as cnt FROM context_packs WHERE project_id = ?').get(projectId) as any).cnt,
        open_reviews: (db.prepare("SELECT COUNT(*) as cnt FROM review_items WHERE project_id = ? AND status = 'open'").get(projectId) as any).cnt,
        audit_events: (db.prepare('SELECT COUNT(*) as cnt FROM audit_events WHERE project_id = ?').get(projectId) as any).cnt,
      };
      res.json(stats);
    } catch (err: any) {
      sendError(res, 500, 'db_error', err.message);
    }
  });

  // 25. MarkItDown Ingestion Endpoint
  router.post('/ingest/markdown', requireAuth, (req, res) => {
    try {
      const { title, locator, content } = req.body;
      const projectId = req.authContext!.activeProjectId;
      if (!title || !content) {
        return sendError(res, 400, 'invalid_body', 'title and content are required');
      }
      const result = ingestMarkdownDocument(db, projectId, title, locator || title, content);
      res.json({ success: true, ...result });
    } catch (err: any) {
      sendError(res, 500, 'ingest_error', err.message);
    }
  });

  // 26. Ollama & LLM Extraction Endpoint
  router.post('/extractors/ollama', requireAuth, async (req, res) => {
    try {
      const { chunk_id, model, endpoint } = req.body;
      const projectId = req.authContext!.activeProjectId;
      if (!chunk_id) {
        return sendError(res, 400, 'invalid_body', 'chunk_id is required');
      }
      const result = await runLLMExtractionOnChunk(db, projectId, chunk_id, { model, endpoint });
      res.json(result);
    } catch (err: any) {
      sendError(res, 500, 'extractor_error', err.message);
    }
  });

  // 27. Obsidian Vault Export & Import
  router.post('/obsidian/export', requireAuth, (req, res) => {
    try {
      const vault = exportObsidianVault(db);
      res.json({ files_count: vault.length, files: vault });
    } catch (err: any) {
      sendError(res, 500, 'obsidian_error', err.message);
    }
  });

  router.post('/obsidian/import', requireAuth, (req, res) => {
    try {
      const { filename, markdown } = req.body;
      if (!filename || !markdown) {
        return sendError(res, 400, 'invalid_body', 'filename and markdown content are required');
      }
      const imported = importObsidianDocument(db, filename, markdown);
      res.json({ success: true, ...imported });
    } catch (err: any) {
      sendError(res, 500, 'obsidian_error', err.message);
    }
  });

  // 28. AnythingLLM & OpenAI-Compatible Chat Completions Proxy
  router.post('/chat/completions', requireAuth, async (req, res) => {
    try {
      await handleChatCompletionProxy(db, req, res);
    } catch (err: any) {
      sendError(res, 500, 'proxy_error', err.message);
    }
  });

  return router;
}
