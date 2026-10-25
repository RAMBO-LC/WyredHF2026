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
  KnowledgeDocument,
  DocumentLink,
  GraphData,
  GraphNode,
  GraphEdge,
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
    this.seedDefaultKnowledgeBase();
  }

  /**
   * Initializes the core SQLite tables, documents, backlinks, and FTS5 full-text index.
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

      -- 3. Persistent Knowledge Base Documents
      CREATE TABLE IF NOT EXISTS documents (
        id TEXT PRIMARY KEY,
        path TEXT UNIQUE NOT NULL,
        title TEXT NOT NULL,
        folder TEXT NOT NULL,
        content TEXT NOT NULL,
        tags TEXT NOT NULL,
        author TEXT NOT NULL,
        updated_at TEXT NOT NULL,
        pinned INTEGER DEFAULT 0
      );

      CREATE INDEX IF NOT EXISTS idx_documents_folder ON documents(folder);
      CREATE INDEX IF NOT EXISTS idx_documents_path ON documents(path);

      -- 4. Document Links and Backlinks graph table
      CREATE TABLE IF NOT EXISTS document_links (
        source_id TEXT NOT NULL,
        target_id TEXT NOT NULL,
        context TEXT,
        PRIMARY KEY (source_id, target_id)
      );
    `);


    // 3. FTS5 Virtual Table for full-text keyword and semantic search
    try {
      this.db.exec(`
        DROP TRIGGER IF EXISTS trg_memories_ai;
        DROP TRIGGER IF EXISTS trg_memories_ad;
        DROP TRIGGER IF EXISTS trg_memories_au;
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

  /**
   * Seed default Knowledge Base documents and relationships from the design spec.
   */
  public seedDefaultKnowledgeBase(): void {
    try {
      const countStmt = this.db.prepare('SELECT COUNT(*) as c FROM documents');
      const { c } = countStmt.get() as { c: number };
      if (c > 0) return;

      const docs = [
        {
          id: 'doc_team_preferences',
          path: 'Team/Team Preferences.md',
          title: 'Team Preferences.md',
          folder: 'Team',
          tags: ['team', 'workflow', 'conventions'],
          author: 'Alex',
          updated_at: '1h ago',
          pinned: 0,
          content: `# Team Preferences

## Engineering Culture
- **Async Communication**: Prefer structured written documentation in SharedBrain.
- **Single Source of Truth**: Keep architecture decisions and specs recorded in persistent SQLite memory.
- **Review Cadence**: All multi-agent research deliverables are peer-reviewed by the Critic agent before merging.

## Stack Conventions
- TypeScript 5+ with strict mode.
- SQLite WAL mode for fast concurrency and persistence.
- Zero heavy dependencies; focus on fast local developer experience.`,
        },
        {
          id: 'doc_coding_standards',
          path: 'Team/Coding Standards.md',
          title: 'Coding Standards.md',
          folder: 'Team',
          tags: ['code-style', 'typescript', 'standards', 'task', 'backlink'],
          author: 'Alex',
          updated_at: 'Updated 3 days ago by Alex',
          pinned: 0,
          content: `# Coding Standards

## Core Principles
1. **Explicit Typings**: Avoid any wherever possible.
2. **Modularity**: Agents must inherit from BaseAgent and implement execute().
3. **Persistent Memory First**: Never lose state between agent handoffs. All facts, findings, insights, and critiques must be committed to SQLite tables.
4. **Resilience**: Every agent workflow must support simulated fallbacks if API keys are unset.`,
        },
        {
          id: 'doc_design_principles',
          path: 'Team/Design Principles.md',
          title: 'Design Principles.md',
          folder: 'Team',
          tags: ['design', 'ui', 'ux', 'system'],
          author: 'Sarah',
          updated_at: '2 days ago',
          pinned: 0,
          content: `# Design Principles

- **Clarity over Complexity**: Every agent's status (Researcher, Analyst, Writer, Critic) must be obvious at a glance.
- **Deep Sleek Dark Theme**: Rich dark surfaces (#0b0f19, #111827) with subtle neon purple/cyan accents.
- **Visual Backlinks**: Interactive graph view connecting documents, decisions, and system requirements.
- **Immediate Feedback**: Live streaming execution feeds with memory counters and critique badges.`,
        },
        {
          id: 'doc_ai_team_dashboard',
          path: 'Projects/AI Team Dashboard.md',
          title: 'AI Team Dashboard.md',
          folder: 'Projects',
          tags: ['dashboard', 'multi-agent', 'sharedbrain', 'task'],
          author: 'Alex',
          updated_at: '2m ago',
          pinned: 0,
          content: `# AI Team Dashboard

## Overview
SharedBrain provides an interactive AI Team Dashboard where cross-functional agents collaborate on tasks with persistent SQLite shared memory.

## Active Agents
- **Researcher Agent**: Crawls data, queries tools, records facts in SQLite.
- **Analyst Agent**: Reads findings, extracts key strategic insights.
- **Writer Agent**: Compiles polished deliverables.
- **Critic Agent**: Strict compliance scoring (1-10) with self-correction retry loops.`,
        },
        {
          id: 'doc_project_requirements',
          path: 'Projects/Project Requirements.md',
          title: 'Project Requirements.md',
          folder: 'Projects',
          tags: ['hackathon', 'specs', 'requirements', 'task', 'backlink'],
          author: 'Alex',
          updated_at: 'Updated 3 days ago by Alex',
          pinned: 0,
          content: `# Project Requirements - SharedBrain

## Objectives
- Build a lightweight multi-agent AI system for a 12-hour hackathon.
- Provide persistent team memory via better-sqlite3.
- Implement full Critic evaluation loop with up to 2 retries.
- Provide a high-fidelity Web UI with Chat Home, Knowledge Base, and interactive Graph View.`,
        },
        {
          id: 'doc_architecture',
          path: 'Projects/Architecture.md',
          title: 'Architecture.md',
          folder: 'Projects',
          tags: ['#system-design', '#architecture', 'backlink'],
          author: 'Alex',
          updated_at: 'Updated 3 days ago by Alex',
          pinned: 0,
          content: `# Architecture Specification

Sections: / statusfeed.im
Created: Oct 12, 2026
Tags: #system-design #architecture

## System Architecture
SharedBrain connects specialized AI agents to a centralized persistent SQLite database.

\`\`\`
User Task
   ↓
Orchestrator
   ↓
Researcher → Analyst → Writer
   ↓
Critic Agent (1-10 strict score)
   ↓
┌────────────────────────────┐
│ Is the output acceptable?  │
└────────────────────────────┘
     ↓ Yes             ↓ No (attempt < 2)
  Final Summary     Retry with Critic feedback
\`\`\`

## Memory Subsystem
- **SQLite Engine**: better-sqlite3 in WAL mode.
- **Schema**: memories, task_runs, documents, document_links, and FTS5 search.`,
        },
        {
          id: 'doc_decisions',
          path: 'Projects/Decisions.md',
          title: 'Decisions.md',
          folder: 'Projects',
          tags: ['decisions', 'adr', 'sqlite'],
          author: 'Alex',
          updated_at: 'Updated 3 days ago by Alex',
          pinned: 0,
          content: `# Architectural Decision Records (ADRs)

## ADR-001: SQLite as Shared Persistent Brain
- **Status**: Accepted
- **Context**: Agents lose context between sessions. We need zero-config local persistence.
- **Decision**: Use SQLite with better-sqlite3 over external vector databases.
- **Consequences**: Instant startup, offline portability, single-file backup.`,
        },
        {
          id: 'doc_research_notes',
          path: 'Knowledge/Research Notes.md',
          title: 'Research Notes.md',
          folder: 'Knowledge',
          tags: ['ai-research', 'multi-agent', 'notes'],
          author: 'Elena',
          updated_at: '1h ago',
          pinned: 0,
          content: `# Research Notes - Multi-Agent Collaboration

## Key Findings
- Multi-agent decomposition reduces hallucination by 40% compared to single-shot prompts.
- Shared memory acts as an immutable ledger preventing duplicated research work.
- Self-critique loops dramatically raise deliverable quality for complex technical tasks.`,
        },
        {
          id: 'doc_lessons_learned',
          path: 'Knowledge/Lessons Learned.md',
          title: 'Lessons Learned.md',
          folder: 'Knowledge',
          tags: ['postmortem', 'learnings', 'speed'],
          author: 'Marcus',
          updated_at: 'Yesterday',
          pinned: 0,
          content: `# Lessons Learned

1. **Keep Prompts Role-Specific**: Overly broad prompts dilute agent focus.
2. **Deterministic Fallbacks**: Crucial for hackathons to guarantee demos never crash if API limits are hit.
3. **Graph Backlinks**: Enabling visual links between documents provides instant context.`,
        },
        {
          id: 'doc_brand_design_system',
          path: 'Team/Brand Design System v2.md',
          title: 'Brand Design System v2.md',
          folder: 'Team',
          tags: ['brand', 'design-system', 'v2'],
          author: 'Sarah',
          updated_at: '3 hours ago',
          pinned: 1,
          content: `# Brand Design System v2

## Visual Identity
- Logo: Glowing neural icon with gradient cyan-to-purple.
- Typography: Plus Jakarta Sans for UI headers, JetBrains Mono for agent logs & code.
- Elevation: Subtle border glow rgba(255, 255, 255, 0.08) and dark glassmorphic cards.`,
        },
        {
          id: 'doc_color_specs',
          path: 'Team/Color specs (October 2026)',
          title: 'Color specs (October 2026)',
          folder: 'Team',
          tags: ['colors', 'hsl', 'design-tokens'],
          author: 'Sarah',
          updated_at: '3 hours ago',
          pinned: 1,
          content: `# Color Specifications (October 2026)

- Background: #0b0f19
- Card Surfaces: #111827 / rgba(17, 24, 39, 0.85)
- Neon Purple: #8b5cf6
- Electric Cyan: #06b6d4
- Emerald Green: #10b981
- Crimson Rose: #f43f5e`,
        },
      ];

      const insertDoc = this.db.prepare(`
        INSERT OR REPLACE INTO documents (id, path, title, folder, content, tags, author, updated_at, pinned)
        VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
      `);

      for (const d of docs) {
        insertDoc.run(
          d.id,
          d.path,
          d.title,
          d.folder,
          d.content,
          JSON.stringify(d.tags),
          d.author,
          d.updated_at,
          d.pinned
        );
      }

      // Seed document links matching Screenshot 3 & 2
      const links = [
        { source: 'doc_decisions', target: 'doc_architecture', context: "Mention: 'based on the core Architecture...'" },
        { source: 'doc_project_requirements', target: 'doc_architecture', context: "Mention: 'based on the core Architecture...'" },
        { source: 'doc_research_notes', target: 'doc_architecture', context: "Mention: 'based on the core Architecture...'" },
        { source: 'doc_architecture', target: 'doc_coding_standards', context: 'Specifies coding rules' },
        { source: 'doc_architecture', target: 'doc_ai_team_dashboard', context: 'Drives team dashboard' },
        { source: 'doc_coding_standards', target: 'doc_team_preferences', context: 'Adheres to team preferences' },
        { source: 'doc_team_preferences', target: 'doc_design_principles', context: 'Aligns on design' },
        { source: 'doc_design_principles', target: 'doc_architecture', context: 'Guides UI architecture' },
        { source: 'doc_project_requirements', target: 'doc_coding_standards', context: 'Demands strict standards' },
        { source: 'doc_research_notes', target: 'doc_lessons_learned', context: 'Summarizes learnings' },
        { source: 'doc_lessons_learned', target: 'doc_architecture', context: 'Refines architecture' },
        { source: 'doc_ai_team_dashboard', target: 'doc_project_requirements', context: 'Implements requirements' },
      ];

      const insertLink = this.db.prepare(`
        INSERT OR REPLACE INTO document_links (source_id, target_id, context)
        VALUES (?, ?, ?)
      `);

      for (const l of links) {
        insertLink.run(l.source, l.target, l.context);
      }
    } catch {
      // Ignore if table schema is currently updating
    }
  }

  /**
   * Returns all knowledge documents with backlinks and outgoing links counts.
   */
  public getDocuments(): KnowledgeDocument[] {
    const stmt = this.db.prepare(`
      SELECT d.*,
        (SELECT COUNT(*) FROM document_links l WHERE l.target_id = d.id) as backlinksCount,
        (SELECT COUNT(*) FROM document_links l WHERE l.source_id = d.id) as outgoingCount
      FROM documents d
      ORDER BY d.pinned DESC, d.folder ASC, d.title ASC
    `);

    const rows = stmt.all() as any[];
    return rows.map((r) => ({
      id: r.id,
      path: r.path,
      title: r.title,
      folder: r.folder,
      content: r.content,
      tags: JSON.parse(r.tags || '[]'),
      author: r.author,
      updated_at: r.updated_at,
      pinned: Boolean(r.pinned),
      backlinksCount: r.backlinksCount || 0,
      outgoingCount: r.outgoingCount || 0,
    }));
  }

  /**
   * Retrieves a single document with full backlinks (incoming) and outgoing links.
   */
  public getDocumentById(id: string): (KnowledgeDocument & {
    backlinks: { id: string; title: string; context: string }[];
    outgoing: { id: string; title: string; context: string }[];
  }) | null {
    const docStmt = this.db.prepare('SELECT * FROM documents WHERE id = ? OR path = ?');
    const doc = docStmt.get(id, id) as any;
    if (!doc) return null;

    const backlinksStmt = this.db.prepare(`
      SELECT d.id, d.title, l.context
      FROM document_links l
      JOIN documents d ON l.source_id = d.id
      WHERE l.target_id = ?
    `);
    const backlinks = backlinksStmt.all(doc.id) as any[];

    const outgoingStmt = this.db.prepare(`
      SELECT d.id, d.title, l.context
      FROM document_links l
      JOIN documents d ON l.target_id = d.id
      WHERE l.source_id = ?
    `);
    const outgoing = outgoingStmt.all(doc.id) as any[];

    return {
      id: doc.id,
      path: doc.path,
      title: doc.title,
      folder: doc.folder,
      content: doc.content,
      tags: JSON.parse(doc.tags || '[]'),
      author: doc.author,
      updated_at: doc.updated_at,
      pinned: Boolean(doc.pinned),
      backlinksCount: backlinks.length,
      outgoingCount: outgoing.length,
      backlinks,
      outgoing,
    };
  }

  /**
   * Creates or updates a document and updates links.
   */
  public storeDocument(doc: {
    id?: string;
    path: string;
    title: string;
    folder: string;
    content: string;
    tags?: string[];
    author?: string;
    pinned?: boolean;
  }): KnowledgeDocument {
    const id = doc.id || `doc_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;
    const author = doc.author || 'User';
    const updated_at = new Date().toISOString();
    const tagsJson = JSON.stringify(doc.tags || []);
    const pinned = doc.pinned ? 1 : 0;

    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO documents (id, path, title, folder, content, tags, author, updated_at, pinned)
      VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
    `);

    stmt.run(id, doc.path, doc.title, doc.folder, doc.content, tagsJson, author, updated_at, pinned);

    return {
      id,
      path: doc.path,
      title: doc.title,
      folder: doc.folder,
      content: doc.content,
      tags: doc.tags || [],
      author,
      updated_at,
      pinned: Boolean(pinned),
    };
  }

  /**
   * Connects two documents in the knowledge graph.
   */
  public addDocumentLink(sourceId: string, targetId: string, context: string = 'Linked in knowledge graph'): void {
    const stmt = this.db.prepare(`
      INSERT OR REPLACE INTO document_links (source_id, target_id, context)
      VALUES (?, ?, ?)
    `);
    stmt.run(sourceId, targetId, context);
  }

  /**
   * Removes a connection between two documents.
   */
  public removeDocumentLink(sourceId: string, targetId: string): void {
    const stmt = this.db.prepare(`
      DELETE FROM document_links
      WHERE (source_id = ? AND target_id = ?) OR (source_id = ? AND target_id = ?)
    `);
    stmt.run(sourceId, targetId, targetId, sourceId);
  }

  /**
   * Returns graph nodes and directed edges for the interactive Graph View.
   */
  public getGraphData(): GraphData {
    const docs = this.getDocuments();

    // Default 2D spatial coordinate layout corresponding to Screenshot 3
    const positions: Record<string, { x: number; y: number }> = {
      doc_architecture: { x: 500, y: 280 },
      doc_coding_standards: { x: 340, y: 190 },
      doc_team_preferences: { x: 400, y: 90 },
      doc_design_principles: { x: 510, y: 130 },
      doc_project_requirements: { x: 360, y: 270 },
      doc_ai_team_dashboard: { x: 260, y: 310 },
      doc_decisions: { x: 580, y: 330 },
      doc_research_notes: { x: 350, y: 440 },
      doc_lessons_learned: { x: 510, y: 440 },
    };

    const nodes: GraphNode[] = docs.map((d, index) => {
      let x = 550;
      let y = 380;
      if (d.id === 'doc_superuser_agent') {
        x = 550;
        y = 380;
      } else {
        const nonRootDocs = docs.filter(item => item.id !== 'doc_superuser_agent');
        const itemIdx = nonRootDocs.findIndex(item => item.id === d.id);
        const angle = (itemIdx / (nonRootDocs.length || 1)) * Math.PI * 2;
        let radius = 280;
        switch (d.folder) {
          case 'Agents': radius = 190; break;
          case 'Projects': radius = 280; break;
          case 'Knowledge': radius = 370; break;
          case 'Security': radius = 450; break;
          case 'Runbooks': radius = 530; break;
          case 'Team': radius = 610; break;
          default: radius = 320;
        }
        x = 550 + Math.cos(angle) * radius;
        y = 380 + Math.sin(angle) * radius;
      }
      return {
        id: d.id,
        title: d.title.replace(/\.md$/, ''),
        folder: d.folder,
        tags: d.tags,
        x,
        y,
      };
    });

    const edgesStmt = this.db.prepare(`
      SELECT source_id as source, target_id as target, context
      FROM document_links
    `);
    const edges = edgesStmt.all() as GraphEdge[];

    return { nodes, edges };
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
