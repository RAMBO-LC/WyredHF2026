import express from 'express';
import path from 'path';
import { fileURLToPath } from 'url';
import { getSharedMemory } from '../memory/sharedMemory.js';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { config } from '../config/index.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

export function createServer() {
  const app = express();
  app.use(express.json());

  // Serve static UI assets from /public directory
  const publicDir = path.resolve(process.cwd(), 'public');
  app.use(express.static(publicDir));

  // Health check endpoint
  app.get('/api/health', (req, res) => {
    res.json({
      status: 'online',
      system: 'SharedBrain Multi-Agent Engine',
      uptime: process.uptime(),
      dbPath: config.databasePath,
    });
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

  // Q&A / Ask the SharedBrain across sessions
  app.post('/api/ask', async (req, res) => {
    try {
      const { question } = req.body;
      if (!question || !String(question).trim()) {
        return res.status(400).json({ error: 'Question cannot be empty' });
      }

      const memory = getSharedMemory(config.databasePath);
      const orchestrator = new Orchestrator(memory);
      const result = await orchestrator.answerWithMemory(String(question).trim());
      res.json(result);
    } catch (err: any) {
      res.status(500).json({ error: err.message });
    }
  });

  // Run Task with Real-Time Server-Sent Events (SSE) streaming
  app.post('/api/tasks', async (req, res) => {
    const { task } = req.body;
    if (!task || !String(task).trim()) {
      return res.status(400).json({ error: 'Task cannot be empty' });
    }

    res.setHeader('Content-Type', 'text/event-stream');
    res.setHeader('Cache-Control', 'no-cache');
    res.setHeader('Connection', 'keep-alive');
    res.flushHeaders?.();

    const sendEvent = (event: string, data: any) => {
      res.write(`event: ${event}\ndata: ${JSON.stringify(data)}\n\n`);
    };

    const memory = getSharedMemory(config.databasePath);
    const orchestrator = new Orchestrator(memory, {
      onTaskStart: (taskId, t, prior) => {
        sendEvent('task_start', { taskId, task: t, priorMemories: prior });
      },
      onAgentStart: (agent, role) => {
        sendEvent('agent_start', { agent, role });
      },
      onAgentThought: (agent, thoughts) => {
        sendEvent('agent_thought', { agent, thoughts });
      },
      onAgentComplete: (result) => {
        sendEvent('agent_complete', result);
      },
      onHandoff: (fromAgent, toAgent, memoryCount) => {
        sendEvent('handoff', { fromAgent, toAgent, memoryCount });
      },
      onTaskComplete: (result) => {
        sendEvent('task_complete', result);
      },
    });

    try {
      await orchestrator.runTask(String(task).trim());
      sendEvent('done', { status: 'success' });
      res.end();
    } catch (err: any) {
      sendEvent('error', { message: err.message });
      res.end();
    }
  });

  return app;
}

export function startServer(port: number = 3000): Promise<{ port: number; url: string }> {
  const app = createServer();

  return new Promise((resolve, reject) => {
    const server = app.listen(port, () => {
      const url = `http://localhost:${port}`;
      console.log(`\n🚀 SharedBrain Web UI running at: ${url}`);
      console.log(`📁 Persistent SQLite database: ${config.databasePath}\n`);
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
if (process.argv[1] && process.argv[1].endsWith('server/index.ts')) {
  const defaultPort = parseInt(process.env.PORT || '3000', 10);
  startServer(defaultPort);
}
