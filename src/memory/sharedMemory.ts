import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import crypto from 'crypto';
import {
  MemoryEntry,
  MemoryInput,
  MemoryStats,
  MemoryType,
  SearchOptions,
} from '../types/index.js';

export class SharedMemory {
  private db: Database.Database;
  private dbPath: string;

  constructor(dbPath: string = './data/shared_brain.db') {
    this.dbPath = dbPath;

    // In-memory mode if ':memory:' is passed (e.g. for testing)
    if (dbPath !== ':memory:') {
      const dir = path.dirname(path.resolve(dbPath));
      if (!fs.existsSync(dir)) {
        fs.mkdirSync(dir, { recursive: true });
      }
    }

    this.db = new Database(dbPath);
    this.db.pragma('journal_mode = WAL');
    this.db.pragma('synchronous = NORMAL');
    this.db.pragma('foreign_keys = ON');

    this.initSchema();
  }

  /**
   * Initializes the core SQLite tables and FTS5 full-text index.
   */
  private initSchema(): void {
    // 1. Primary memories table
    this.db.exec(`
      CREATE TABLE IF NOT EXISTS memories (
        id TEXT PRIMARY KEY,
        content TEXT NOT NULL,
        type TEXT NOT NULL,
        agent TEXT NOT NULL,
        timestamp TEXT NOT NULL,
        tags TEXT NOT NULL,
        task_id TEXT,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_memories_type ON memories(type);
      CREATE INDEX IF NOT EXISTS idx_memories_agent ON memories(agent);
      CREATE INDEX IF NOT EXISTS idx_memories_task_id ON memories(task_id);
      CREATE INDEX IF NOT EXISTS idx_memories_timestamp ON memories(timestamp DESC);

      -- 2. Task runs history table for multi-agent workflows
      CREATE TABLE IF NOT EXISTS task_runs (
        id TEXT PRIMARY KEY,
        task TEXT NOT NULL,
        status TEXT NOT NULL,
        summary TEXT,
        started_at TEXT NOT NULL,
        completed_at TEXT,
        metadata TEXT
      );

      CREATE INDEX IF NOT EXISTS idx_task_runs_started_at ON task_runs(started_at DESC);
    `);

    // 3. FTS5 Virtual Table for full-text keyword and semantic search
    try {
      this.db.exec(`
        CREATE VIRTUAL TABLE IF NOT EXISTS memories_fts USING fts5(
          id UNINDEXED,
          content,
          tags,
          agent,
          tokenize = 'porter'
        );

        -- Triggers to synchronize primary table with FTS index automatically
        CREATE TRIGGER IF NOT EXISTS trg_memories_ai AFTER INSERT ON memories BEGIN
          INSERT INTO memories_fts (id, content, tags, agent)
          VALUES (new.id, new.content, new.tags, new.agent);
        END;

        CREATE TRIGGER IF NOT EXISTS trg_memories_ad AFTER DELETE ON memories BEGIN
          DELETE FROM memories_fts WHERE id = old.id;
        END;

        CREATE TRIGGER IF NOT EXISTS trg_memories_au AFTER UPDATE ON memories BEGIN
          DELETE FROM memories_fts WHERE id = old.id;
          INSERT INTO memories_fts (id, content, tags, agent)
          VALUES (new.id, new.content, new.tags, new.agent);
        END;
      `);
    } catch {
      // Fallback if FTS5 is not compiled in this sqlite build
    }
  }

  /**
   * Stores a single memory item into SQLite.
   */
  public store(input: MemoryInput): MemoryEntry {
    const id = `mem_${Date.now()}_${crypto.randomBytes(4).toString('hex')}`;
    const timestamp = new Date().toISOString();
    const tagsJson = JSON.stringify(input.tags || []);
    const metadataJson = JSON.stringify(input.metadata || {});

    const stmt = this.db.prepare(`
      INSERT INTO memories (id, content, type, agent, timestamp, tags, task_id, metadata)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(
      id,
      input.content.trim(),
      input.type,
      input.agent.toLowerCase(),
      timestamp,
      tagsJson,
      input.task_id || null,
      metadataJson
    );

    return {
      id,
      content: input.content.trim(),
      type: input.type,
      agent: input.agent.toLowerCase(),
      timestamp,
      tags: input.tags || [],
      task_id: input.task_id,
      metadata: input.metadata,
    };
  }

  /**
   * Stores multiple memory entries in a single atomic transaction.
   */
  public storeBatch(inputs: MemoryInput[]): MemoryEntry[] {
    const insertTransaction = this.db.transaction((items: MemoryInput[]) => {
      const results: MemoryEntry[] = [];
      for (const item of items) {
        results.push(this.store(item));
      }
      return results;
    });

    return insertTransaction(inputs);
  }

  /**
   * Recalls relevant memories based on a query or topic.
   * Leverages FTS5 BM25 ranking when available, combined with recency,
   * with a fallback to keyword token matching.
   */
  public recall(query: string, limit: number = 6): MemoryEntry[] {
    if (!query || query.trim().length === 0) {
      return this.getRecent(limit);
    }

    const cleanQuery = query.replace(/[^\w\s-]/g, ' ').trim();
    const tokens = cleanQuery
      .split(/\s+/)
      .filter((t) => t.length > 2 && !['and', 'the', 'for', 'with', 'from', 'about', 'what'].includes(t.toLowerCase()));

    // Try FTS5 first
    try {
      if (tokens.length > 0) {
        const ftsQuery = tokens.map((t) => `"${t}"*`).join(' OR ');
        const ftsStmt = this.db.prepare(`
          SELECT m.*, bm25(memories_fts) as rank
          FROM memories m
          JOIN memories_fts f ON m.id = f.id
          WHERE memories_fts MATCH ?
          ORDER BY rank ASC, m.timestamp DESC
          LIMIT ?
        `);

        const rows = ftsStmt.all(ftsQuery, limit) as any[];
        if (rows.length > 0) {
          return rows.map((r) => this.mapRow(r));
        }
      }
    } catch {
      // Fall through to LIKE search if FTS query syntax error occurs
    }

    // Fallback: LIKE matching with token scoring
    return this.searchWithTokens(tokens, limit);
  }

  /**
   * Search memories with explicit filters (type, agent, tags, task).
   */
  public search(query: string, options: SearchOptions = {}): MemoryEntry[] {
    const limit = options.limit || 20;
    const conditions: string[] = ['1=1'];
    const params: any[] = [];

    if (options.agent) {
      conditions.push('agent = ?');
      params.push(options.agent.toLowerCase());
    }

    if (options.type) {
      conditions.push('type = ?');
      params.push(options.type);
    }

    if (options.taskId) {
      conditions.push('task_id = ?');
      params.push(options.taskId);
    }

    if (options.tags && options.tags.length > 0) {
      for (const tag of options.tags) {
        conditions.push('tags LIKE ?');
        params.push(`%"${tag}"%`);
      }
    }

    if (query && query.trim().length > 0) {
      conditions.push('(content LIKE ? OR tags LIKE ?)');
      params.push(`%${query.trim()}%`, `%${query.trim()}%`);
    }

    const sql = `
      SELECT * FROM memories
      WHERE ${conditions.join(' AND ')}
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Retrieves the most recent memories.
   */
  public getRecent(limit: number = 10): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(limit) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Retrieves all memories associated with a specific task run.
   */
  public getByTask(taskId: string): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories
      WHERE task_id = ?
      ORDER BY timestamp ASC
    `);
    const rows = stmt.all(taskId) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Retrieves memories created by a specific agent role.
   */
  public getByAgent(agent: string, limit: number = 20): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories
      WHERE agent = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(agent.toLowerCase(), limit) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Retrieves memories of a specific type (e.g. 'fact', 'insight', 'summary').
   */
  public getByType(type: MemoryType, limit: number = 20): MemoryEntry[] {
    const stmt = this.db.prepare(`
      SELECT * FROM memories
      WHERE type = ?
      ORDER BY timestamp DESC
      LIMIT ?
    `);
    const rows = stmt.all(type, limit) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  /**
   * Retrieves a single memory by ID.
   */
  public getById(id: string): MemoryEntry | null {
    const stmt = this.db.prepare(`SELECT * FROM memories WHERE id = ?`);
    const row = stmt.get(id) as any;
    return row ? this.mapRow(row) : null;
  }

  /**
   * Deletes a memory by ID.
   */
  public delete(id: string): boolean {
    const stmt = this.db.prepare(`DELETE FROM memories WHERE id = ?`);
    const res = stmt.run(id);
    return res.changes > 0;
  }

  /**
   * Clears all memories and task history.
   */
  public clear(): void {
    this.db.exec(`
      DELETE FROM memories;
      DELETE FROM task_runs;
    `);
    try {
      this.db.exec(`DELETE FROM memories_fts;`);
    } catch {
      // Ignore if FTS not active
    }
  }

  /**
   * Returns statistics about stored memories and persistent database size.
   */
  public getStats(): MemoryStats {
    const totalStmt = this.db.prepare(`SELECT COUNT(*) as count FROM memories`);
    const total = (totalStmt.get() as any).count as number;

    const typeStmt = this.db.prepare(`SELECT type, COUNT(*) as count FROM memories GROUP BY type`);
    const typeRows = typeStmt.all() as { type: string; count: number }[];
    const byType: Record<string, number> = {};
    for (const r of typeRows) {
      byType[r.type] = r.count;
    }

    const agentStmt = this.db.prepare(`SELECT agent, COUNT(*) as count FROM memories GROUP BY agent`);
    const agentRows = agentStmt.all() as { agent: string; count: number }[];
    const byAgent: Record<string, number> = {};
    for (const r of agentRows) {
      byAgent[r.agent] = r.count;
    }

    const lastStmt = this.db.prepare(`SELECT timestamp FROM memories ORDER BY timestamp DESC LIMIT 1`);
    const lastRow = lastStmt.get() as any;
    const lastUpdated = lastRow ? lastRow.timestamp : null;

    let dbSizeBytes = 0;
    if (this.dbPath !== ':memory:' && fs.existsSync(this.dbPath)) {
      try {
        const stats = fs.statSync(this.dbPath);
        dbSizeBytes = stats.size;
      } catch {
        // Ignore stat errors
      }
    }

    return {
      totalCount: total,
      byType,
      byAgent,
      dbPath: this.dbPath,
      dbSizeBytes,
      lastUpdated,
    };
  }

  /**
   * Records the start of an orchestration task run.
   */
  public recordTaskStart(taskId: string, task: string): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO task_runs (id, task, status, started_at)
      VALUES (?, ?, 'running', ?)
    `);
    stmt.run(taskId, task, new Date().toISOString());
  }

  /**
   * Records the completion of an orchestration task run with final summary.
   */
  public recordTaskComplete(taskId: string, summary: string, metadata?: Record<string, any>): void {
    const stmt = this.db.prepare(`
      UPDATE task_runs
      SET status = 'completed', summary = ?, completed_at = ?, metadata = ?
      WHERE id = ?
    `);
    stmt.run(
      summary,
      new Date().toISOString(),
      metadata ? JSON.stringify(metadata) : null,
      taskId
    );
  }

  /**
   * Gets recent task run records.
   */
  public getTaskHistory(limit: number = 10): any[] {
    const stmt = this.db.prepare(`
      SELECT * FROM task_runs
      ORDER BY started_at DESC
      LIMIT ?
    `);
    return stmt.all(limit) as any[];
  }

  /**
   * Formats a collection of memories into clean markdown for prompt injection.
   */
  public formatMemoriesForPrompt(memories: MemoryEntry[]): string {
    if (!memories || memories.length === 0) {
      return '*(No previous memories found for this topic.)*';
    }

    return memories
      .map((m, idx) => {
        const tagStr = m.tags && m.tags.length > 0 ? ` [Tags: ${m.tags.join(', ')}]` : '';
        const timeStr = new Date(m.timestamp).toLocaleTimeString();
        return `[Memory #${idx + 1}] (${m.type.toUpperCase()} by ${m.agent} at ${timeStr}${tagStr})\n${m.content}`;
      })
      .join('\n\n');
  }

  /**
   * Closes the database connection.
   */
  public close(): void {
    this.db.close();
  }

  private searchWithTokens(tokens: string[], limit: number): MemoryEntry[] {
    if (tokens.length === 0) {
      return this.getRecent(limit);
    }

    const conditions = tokens.map(() => `(content LIKE ? OR tags LIKE ?)`).join(' OR ');
    const params: any[] = [];
    tokens.forEach((t) => {
      params.push(`%${t}%`, `%${t}%`);
    });

    const sql = `
      SELECT * FROM memories
      WHERE ${conditions}
      ORDER BY timestamp DESC
      LIMIT ?
    `;
    params.push(limit);

    const stmt = this.db.prepare(sql);
    const rows = stmt.all(...params) as any[];
    return rows.map((r) => this.mapRow(r));
  }

  private mapRow(row: any): MemoryEntry {
    let tags: string[] = [];
    let metadata: Record<string, any> | undefined;

    try {
      tags = JSON.parse(row.tags || '[]');
    } catch {
      tags = [];
    }

    try {
      metadata = row.metadata ? JSON.parse(row.metadata) : undefined;
    } catch {
      metadata = undefined;
    }

    return {
      id: row.id,
      content: row.content,
      type: row.type as MemoryType,
      agent: row.agent,
      timestamp: row.timestamp,
      tags,
      task_id: row.task_id || undefined,
      metadata,
    };
  }
}

// Default singleton instance for app-wide access
let defaultMemoryInstance: SharedMemory | null = null;

export function getSharedMemory(dbPath?: string): SharedMemory {
  if (dbPath) {
    return new SharedMemory(dbPath);
  }
  if (!defaultMemoryInstance) {
    defaultMemoryInstance = new SharedMemory();
  }
  return defaultMemoryInstance;
}
