import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSharedMemory } from '../memory/sharedMemory.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

import { getCoreDatabase } from '../core/db.js';
import { seedLargeDemoVault } from '../core/seedData.js';
import { createV1Router } from './v1/router.js';
import { ingestAndDistillContent, getIngestionStats } from '../core/ingestionEngine.js';
import { startIncomingWatcher, getWatcherStatus } from '../core/watcher.js';
import { generatePrefixedId } from '../core/invariants.js';
import fs from 'fs';
import os from 'os';

const APP_VERSION = (() => {
  try {
    const pkg = JSON.parse(fs.readFileSync(path.resolve(__dirname, '..', '..', 'package.json'), 'utf-8'));
    return String(pkg.version);
  } catch {
    return 'dev';
  }
})();
import { answerQuestionFromRAG, retrieveContext, generateAnswer, getLLMProviderInfo } from '../core/ragChatEngine.js';

export function createServer(): express.Express {
  const app = express();

  app.use(express.json({ limit: '50mb' }));
  app.use(express.urlencoded({ extended: true, limit: '50mb' }));

  // Initialize Core Database and seed extensive 26-document interconnected vault
  const coreDb = getCoreDatabase(config.databasePath);
  seedLargeDemoVault(coreDb);

  // Mount versioned /v1 API
  app.use('/v1', createV1Router(coreDb));

  // Resolve the bundled UI relative to this file so the server works from any working directory
  // (src/server and dist/server both sit two levels below the project root).
  const publicDir = process.env.PUBLIC_DIR || path.resolve(__dirname, '..', '..', 'public');
  const page = (...segments: string[]) => (_req: express.Request, res: express.Response) => {
    res.sendFile(path.resolve(publicDir, ...segments));
  };

  app.get('/', page('index.html'));
  app.get(['/app', '/app/', '/chat', '/chat/'], page('app', 'index.html'));
  app.get(['/knowledge', '/knowledge/'], page('knowledge', 'index.html'));
  app.get(['/graph', '/graph/'], page('graph', 'index.html'));
  app.get(['/console', '/console/', '/core', '/core/'], page('console', 'index.html'));
  app.get(['/docs', '/docs/'], page('docs', 'index.html'));

  app.use(express.static(publicDir));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'online',
      system: 'SharedBrain',
      uptime: process.uptime(),
      dbPath: config.databasePath,
    });
  });

  // Runtime info for the UI: version, active LLM provider, storage locations
  app.get('/api/system', (req, res) => {
    try {
      const watcher = getWatcherStatus();
      res.json({
        name: 'SharedBrain',
        version: APP_VERSION,
        node: process.version,
        platform: `${process.platform}-${process.arch}`,
        uptime: process.uptime(),
        llm: getLLMProviderInfo(),
        dbPath: config.databasePath,
        incomingDir: watcher.incomingDirectory,
        processedDir: watcher.processedDirectory,
        watcherActive: watcher.active,
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Get memory stats
  app.get('/api/memories/stats', (req, res) => {
    try {
      const memory = getSharedMemory(config.databasePath);
      const stats = memory.getStats();
      res.json(stats);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Query / list memories
  app.get('/api/memories', (req, res) => {
    try {
      const memory = getSharedMemory(config.databasePath);
      const { query, limit = '40', type, agent } = req.query;
      const numLimit = parseInt(String(limit), 10) || 40;

      if (query && String(query).trim().length > 0) {
        const results = memory.recall(String(query), numLimit);
        return res.json(results);
      }

      const results = memory.search('', {
        limit: numLimit,
        type: type ? (String(type) as any) : undefined,
        agent: agent ? String(agent).toLowerCase() : undefined,
      });

      res.json(results);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Wipe memory database
  app.post('/api/memories/clear', (req, res) => {
    try {
      const memory = getSharedMemory(config.databasePath);
      memory.clear();
      res.json({ success: true, message: 'All memories and task history cleared from SQLite.' });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Q&A / Ask the SharedBrain across sessions grounded strictly in RAG
  app.post('/api/ask', async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || !String(question).trim()) {
        return res.status(400).json({ error: 'Question cannot be empty' });
      }

      const result = await answerQuestionFromRAG(String(question).trim(), coreDb);
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Run a question through the agent pipeline, streaming each stage as Server-Sent Events.
  // Researcher = retrieval, Analyst = coverage check, Writer = answer generation, Critic = grounding check.
  app.post('/api/tasks', async (req, res) => {
    const { task } = req.body;
    if (!task || !String(task).trim()) {
      return res.status(400).json({ error: 'Task or question cannot be empty' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };
    const ms = (n: number) => Math.max(1, Math.round(n));

    const trimmedTask = String(task).trim();
    const startTime = Date.now();
    const taskId = generatePrefixedId('task');
    const provider = getLLMProviderInfo();

    try {
      sendEvent('task_start', { taskId, task: trimmedTask, provider });

      // Researcher: retrieval
      sendEvent('agent_start', { agent: 'Researcher', role: 'Retrieval' });
      const ctx = retrieveContext(trimmedTask, coreDb);
      const docCount = new Set(ctx.chunks.map((c) => c.doc_id)).size;
      sendEvent('agent_complete', {
        agent: 'Researcher',
        role: 'Retrieval',
        executionTimeMs: ms(ctx.retrievalMs),
        output: ctx.chunks.length
          ? `Ranked ${ctx.chunks.length} passages from ${docCount} document${docCount === 1 ? '' : 's'} and ${ctx.memories.length} memories (BM25).`
          : 'No matching passages found.',
      });
      sendEvent('handoff', { fromAgent: 'Researcher', toAgent: 'Analyst', memoryCount: ctx.chunks.length });

      // Analyst: coverage / scope check
      const analystStart = performance.now();
      sendEvent('agent_start', { agent: 'Analyst', role: 'Scope check' });
      const coveragePct = Math.round(ctx.coverage * 100);
      sendEvent('agent_complete', {
        agent: 'Analyst',
        role: 'Scope check',
        executionTimeMs: ms(performance.now() - analystStart),
        output: ctx.inDomain
          ? `Passages cover ${coveragePct}% of the query terms. Proceeding.`
          : `Passages cover only ${coveragePct}% of the query terms. Declining to answer.`,
      });
      sendEvent('handoff', { fromAgent: 'Analyst', toAgent: 'Writer', memoryCount: ctx.chunks.length });

      // Writer: answer generation
      sendEvent('agent_start', { agent: 'Writer', role: 'Answer' });
      const ragResult = await generateAnswer(ctx, coreDb);
      sendEvent('agent_complete', {
        agent: 'Writer',
        role: 'Answer',
        executionTimeMs: ms(ragResult.timings.generationMs),
        output: ragResult.isRefusal ? 'Wrote a refusal.' : `Answered with ${ragResult.modelUsed}.`,
      });

      // Critic: grounding check
      const groundingPct = Math.round(ragResult.groundingScore * 100);
      const score = Math.round(ragResult.groundingScore * 10);
      sendEvent('critic_start', { agent: 'Critic', role: 'Grounding check', attempt: 0 });
      sendEvent('critic_complete', {
        critique: {
          score,
          is_acceptable: ragResult.isRefusal || ragResult.groundingScore >= 0.6,
          feedback: ragResult.isRefusal
            ? 'Refusal is the correct outcome: nothing in the knowledge base supports an answer.'
            : `${groundingPct}% of answer terms appear in the retrieved sources.`,
        },
        attempt: 0,
      });

      const durationMs = Date.now() - startTime;
      sendEvent('task_complete', {
        taskId,
        task: trimmedTask,
        status: ragResult.isRefusal ? 'refused' : 'completed',
        durationMs,
        finalSummary: ragResult.answer,
        citations: ragResult.citations,
        memories: ragResult.recalledMemories,
        groundingModel: ragResult.groundingModel,
        groundingScore: ragResult.groundingScore,
        coverage: ragResult.coverage,
        isRefusal: ragResult.isRefusal,
      });

      coreDb.prepare(`
        INSERT OR REPLACE INTO task_runs (id, task, status, summary, started_at, completed_at, metadata)
        VALUES (?, ?, ?, ?, ?, ?, ?)
      `).run(
        taskId,
        trimmedTask,
        ragResult.isRefusal ? 'refused' : 'completed',
        ragResult.answer,
        new Date(startTime).toISOString(),
        new Date().toISOString(),
        JSON.stringify({
          isRefusal: ragResult.isRefusal,
          groundingModel: ragResult.groundingModel,
          groundingScore: ragResult.groundingScore,
          coverage: ragResult.coverage,
          durationMs,
          citations: ragResult.citations,
          memories: ragResult.recalledMemories,
        })
      );

      sendEvent('done', { status: 'success' });
      res.end();
    } catch (err: any) {
      sendEvent('error', { message: err.message });
      res.end();
    }
  });

  // Knowledge Base: List Documents
  app.get('/api/documents', (req, res) => {
    try {
      const memory = getSharedMemory(config.databasePath);
      const docs = memory.getDocuments();
      res.json(docs);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Knowledge Base: List All Distinct Directories / Folders with Metadata
  app.get('/api/directories', (req, res) => {
    try {
      const db = getCoreDatabase(config.databasePath);
      const rows = db.prepare(`
        SELECT folder, COUNT(*) as file_count, MAX(updated_at) as last_updated
        FROM documents
        GROUP BY folder
        ORDER BY folder ASC
      `).all() as any[];

      const standardFolders = ['Projects', 'Agents', 'Knowledge', 'Security', 'Runbooks', 'Team', 'Architecture', 'SuperUser'];
      const folderMap = new Map<string, any>();

      for (const f of standardFolders) {
        folderMap.set(f, { folder: f, file_count: 0, last_updated: 'Live', is_virtual: false });
      }

      for (const r of rows) {
        folderMap.set(r.folder, { folder: r.folder, file_count: r.file_count, last_updated: r.last_updated, is_virtual: false });
      }

      const watcher = getWatcherStatus();
      const countFiles = (dir: string) => {
        try {
          return fs.readdirSync(dir).filter((f) => !f.startsWith('.') && f !== 'README.txt').length;
        } catch {
          return 0;
        }
      };
      folderMap.set('Incoming Drop-Folder', {
        folder: 'Incoming Drop-Folder',
        file_count: countFiles(watcher.incomingDirectory),
        last_updated: 'Active',
        is_virtual: true,
        path: watcher.incomingDirectory,
        description: 'Files dropped here are ingested automatically'
      });
      folderMap.set('Processed Archive', {
        folder: 'Processed Archive',
        file_count: countFiles(watcher.processedDirectory),
        last_updated: 'Active',
        is_virtual: true,
        path: watcher.processedDirectory,
        description: 'Files that have already been ingested'
      });

      res.json(Array.from(folderMap.values()));
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Knowledge Base: Get Document by ID or Path
  app.get('/api/documents/:id', (req, res) => {
    try {
      const memory = getSharedMemory(config.databasePath);
      const doc = memory.getDocumentById(req.params.id);
      if (!doc) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json(doc);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Knowledge Base: Create or Update Document
  app.post('/api/documents', (req, res) => {
    try {
      const memory = getSharedMemory(config.databasePath);
      const { id, title, folder, content, tags, author, pinned, path: docPath } = req.body;
      if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
      }
      // Editing keeps the document id so graph links survive a rename.
      const existing = id ? memory.getDocumentById(String(id)) : null;
      const saved = memory.storeDocument({
        id: existing ? existing.id : undefined,
        path: docPath || `${folder || 'Knowledge'}/${title}`,
        title,
        folder: folder || 'Knowledge',
        content,
        tags: tags || [],
        author: author || existing?.author || 'You',
        pinned: Boolean(pinned),
      });
      res.json(saved);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Knowledge Base: Delete Document (and its graph links)
  app.delete('/api/documents/:id', (req, res) => {
    try {
      const id = req.params.id;
      const result = coreDb.transaction(() => {
        coreDb.prepare('DELETE FROM document_links WHERE source_id = ? OR target_id = ?').run(id, id);
        return coreDb.prepare('DELETE FROM documents WHERE id = ?').run(id);
      })();
      if (result.changes === 0) {
        return res.status(404).json({ error: 'Document not found' });
      }
      res.json({ success: true });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Graph Data endpoint for Interactive Network Map
  app.get('/api/graph', (req, res) => {
    try {
      const memory = getSharedMemory(config.databasePath);
      const graph = memory.getGraphData();
      res.json(graph);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Connect two documents in knowledge graph
  app.post('/api/links', (req, res) => {
    try {
      const memory = getSharedMemory(config.databasePath);
      const { sourceId, targetId, context } = req.body;
      if (!sourceId || !targetId) {
        return res.status(400).json({ error: 'sourceId and targetId are required' });
      }
      memory.addDocumentLink(sourceId, targetId, context);
      res.json({ success: true, message: `Connected ${sourceId} -> ${targetId}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Remove connection between two documents
  app.delete('/api/links', (req, res) => {
    try {
      const memory = getSharedMemory(config.databasePath);
      const { sourceId, targetId } = req.body;
      if (!sourceId || !targetId) {
        return res.status(400).json({ error: 'sourceId and targetId are required' });
      }
      memory.removeDocumentLink(sourceId, targetId);
      res.json({ success: true, message: `Removed link between ${sourceId} and ${targetId}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Conversation History List & Management (from SQLite task_runs)
  app.get('/api/conversations', (req, res) => {
    try {
      const rows = coreDb.prepare(`
        SELECT id, task, status, summary, started_at, completed_at, metadata
        FROM task_runs
        ORDER BY started_at DESC
        LIMIT 100
      `).all() as any[];

      const formatted = rows.map(r => {
        let meta: any = {};
        try { meta = JSON.parse(r.metadata || '{}'); } catch {}
        return {
          id: r.id,
          task: r.task,
          status: r.status,
          summary: r.summary,
          started_at: r.started_at,
          completed_at: r.completed_at,
          metadata: meta
        };
      });

      res.json(formatted);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/conversations/:id', (req, res) => {
    try {
      const row = coreDb.prepare(`
        SELECT id, task, status, summary, started_at, completed_at, metadata
        FROM task_runs
        WHERE id = ?
      `).get(req.params.id) as any;

      if (!row) return res.status(404).json({ error: 'Conversation session not found' });
      let meta: any = {};
      try { meta = JSON.parse(row.metadata || '{}'); } catch {}
      res.json({
        id: row.id,
        task: row.task,
        status: row.status,
        summary: row.summary,
        started_at: row.started_at,
        completed_at: row.completed_at,
        metadata: meta
      });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.delete('/api/conversations/:id', (req, res) => {
    try {
      coreDb.prepare(`DELETE FROM task_runs WHERE id = ?`).run(req.params.id);
      res.json({ success: true, message: `Deleted conversation ${req.params.id}` });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Recent Chats List (dynamically populated from task_runs)
  app.get('/api/chats', (req, res) => {
    try {
      const rows = coreDb.prepare(`
        SELECT id, task, status, started_at
        FROM task_runs
        ORDER BY started_at DESC
        LIMIT 50
      `).all() as any[];

      const today: any[] = [];
      const yesterday: any[] = [];
      const previous7Days: any[] = [];

      const now = new Date();
      const todayStr = now.toISOString().slice(0, 10);
      const yesterdayDate = new Date(now.getTime() - 24 * 3600 * 1000);
      const yesterdayStr = yesterdayDate.toISOString().slice(0, 10);

      rows.forEach(r => {
        const d = r.started_at ? r.started_at.slice(0, 10) : '';
        const item = {
          id: r.id,
          title: r.task.length > 38 ? r.task.slice(0, 38) + '...' : r.task,
          task: r.task,
          status: r.status,
          time: r.started_at ? new Date(r.started_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Live',
        };
        if (d === todayStr) {
          today.push(item);
        } else if (d === yesterdayStr) {
          yesterday.push(item);
        } else {
          previous7Days.push(item);
        }
      });

      res.json({ today, yesterday, previous7Days });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Download a consistent snapshot of the SQLite database (safe while the server is running).
  app.get('/api/export/database', async (req, res) => {
    const tmp = path.join(os.tmpdir(), `sharedbrain-backup-${Date.now()}.db`);
    try {
      await coreDb.backup(tmp);
      const stamp = new Date().toISOString().slice(0, 10);
      res.download(tmp, `sharedbrain-${stamp}.db`, () => fs.rm(tmp, { force: true }, () => {}));
    } catch (err: any) {
      fs.rm(tmp, { force: true }, () => {});
      res.status(500).json({ error: err.message });
    }
  });

  // ── Universal Local RAG Ingestion & Distillation Endpoints ──
  app.post('/api/ingest', (req, res) => {
    try {
      const { title, content, folder, author, tags, sourceRef } = req.body;
      if (!title || !content) {
        return res.status(400).json({ error: 'Title and content are required' });
      }
      const result = ingestAndDistillContent({
        title,
        content,
        folder,
        author: author || 'User',
        tags,
        sourceRef: sourceRef || 'api:ingest',
      });
      res.json(result);
    } catch (err: any) {
      console.error('[API Ingest Error]:', err);
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/ingest/stats', (req, res) => {
    try {
      const stats = getIngestionStats();
      const watcher = getWatcherStatus();
      res.json({ ...stats, watcher });
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  app.get('/api/ingest/watcher', (req, res) => {
    try {
      res.json(getWatcherStatus());
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  return app;
}


export function startServer(port: number = 3000): Promise<{ port: number; url: string }> {
  const app = createServer();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log(`\nSharedBrain Web UI running at: ${url}`);
      console.log(`Persistent SQLite database: ${config.databasePath}`);
      
      // Start local production drop-folder watcher
      startIncomingWatcher();
      
      resolve({ port, url });
    });

    server.on('error', (err: any) => {
      if (err.code === 'EADDRINUSE') {
        console.log(`Port ${port} in use, trying ${port + 1}...`);
        resolve(startServer(port + 1));
      } else {
        reject(err);
      }
    });
  });
}

// Standalone execution if run directly via tsx/node
const isDirectRun =
  Boolean(process.argv[1]) &&
  (process.argv[1].endsWith(path.join('server', 'index.ts')) ||
   process.argv[1].endsWith(path.join('server', 'index.js')));

if (isDirectRun || process.env.SERVE === 'true') {
  const defaultPort = parseInt(process.env.PORT || '3000', 10);
  startServer(defaultPort);
}

