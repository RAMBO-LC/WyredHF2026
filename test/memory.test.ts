import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import fs from 'fs';
import path from 'path';
import { SharedMemory } from '../src/memory/sharedMemory.js';

describe('SharedMemory SQLite Layer', () => {
  let memory: SharedMemory;
  const testDbPath = path.resolve(process.cwd(), './data/test_memory.db');

  beforeEach(() => {
    // Clean test database if exists
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {
        // Ignore
      }
    }
    memory = new SharedMemory(testDbPath);
  });

  afterEach(() => {
    memory.close();
    if (fs.existsSync(testDbPath)) {
      try {
        fs.unlinkSync(testDbPath);
      } catch {
        // Ignore
      }
    }
  });

  it('should store and retrieve a memory entry', () => {
    const entry = memory.store({
      content: 'Multi-agent systems improve problem decomposition.',
      type: 'finding',
      agent: 'researcher',
      tags: ['multi-agent', 'architecture'],
      task_id: 'task_001',
      metadata: { source: 'unit-test' },
    });

    expect(entry).toBeDefined();
    expect(entry.id).toMatch(/^mem_\d+_[a-f0-9]+/);
    expect(entry.content).toBe('Multi-agent systems improve problem decomposition.');
    expect(entry.type).toBe('finding');
    expect(entry.agent).toBe('researcher');
    expect(entry.tags).toEqual(['multi-agent', 'architecture']);
    expect(entry.task_id).toBe('task_001');

    const fetched = memory.getById(entry.id);
    expect(fetched).not.toBeNull();
    expect(fetched?.content).toBe(entry.content);
    expect(fetched?.metadata).toEqual({ source: 'unit-test' });
  });

  it('should store multiple memories in a batch transaction', () => {
    const batch = memory.storeBatch([
      {
        content: 'Fact 1: Agents share state through SQLite.',
        type: 'fact',
        agent: 'researcher',
        tags: ['sqlite', 'storage'],
      },
      {
        content: 'Insight 1: SQLite reduces cloud dependency.',
        type: 'insight',
        agent: 'analyst',
        tags: ['sqlite', 'cost'],
      },
    ]);

    expect(batch.length).toBe(2);
    expect(batch[0].type).toBe('fact');
    expect(batch[1].type).toBe('insight');

    const recent = memory.getRecent(10);
    expect(recent.length).toBe(2);
  });

  it('should filter memories by agent, type, and task_id', () => {
    memory.store({
      content: 'Researcher finding A',
      type: 'finding',
      agent: 'researcher',
      task_id: 'task_A',
    });
    memory.store({
      content: 'Researcher finding B',
      type: 'finding',
      agent: 'researcher',
      task_id: 'task_B',
    });
    memory.store({
      content: 'Analyst insight A',
      type: 'insight',
      agent: 'analyst',
      task_id: 'task_A',
    });

    const researcherMemories = memory.getByAgent('researcher');
    expect(researcherMemories.length).toBe(2);

    const insights = memory.getByType('insight');
    expect(insights.length).toBe(1);
    expect(insights[0].content).toBe('Analyst insight A');

    const taskAMemories = memory.getByTask('task_A');
    expect(taskAMemories.length).toBe(2);
  });

  it('should recall relevant memories using FTS5 and keyword search', () => {
    memory.store({
      content: 'Distributed consensus algorithms like Raft and Paxos provide fault tolerance.',
      type: 'finding',
      agent: 'researcher',
      tags: ['consensus', 'distributed'],
    });

    memory.store({
      content: 'Better-sqlite3 provides synchronous queries with sub-millisecond execution.',
      type: 'finding',
      agent: 'researcher',
      tags: ['sqlite', 'performance'],
    });

    const results = memory.recall('consensus fault tolerance', 5);
    expect(results.length).toBeGreaterThan(0);
    expect(results[0].content).toContain('Raft and Paxos');

    const sqliteResults = memory.recall('sqlite execution', 5);
    expect(sqliteResults.length).toBeGreaterThan(0);
    expect(sqliteResults[0].content).toContain('Better-sqlite3');
  });

  it('should persist memories across database restarts', () => {
    // 1. Write memories in first instance
    memory.store({
      content: 'Crucial company brain context that must survive app restart.',
      type: 'summary',
      agent: 'writer',
      tags: ['persistence', 'milestone'],
    });
    memory.close();

    // 2. Open brand new SharedMemory instance pointing to the same file
    const restartedMemory = new SharedMemory(testDbPath);
    const recent = restartedMemory.getRecent(10);

    expect(recent.length).toBe(1);
    expect(recent[0].content).toBe('Crucial company brain context that must survive app restart.');
    expect(recent[0].agent).toBe('writer');
    expect(recent[0].tags).toEqual(['persistence', 'milestone']);

    restartedMemory.close();
  });

  it('should compute accurate database statistics', () => {
    memory.store({ content: 'F1', type: 'fact', agent: 'researcher' });
    memory.store({ content: 'F2', type: 'finding', agent: 'researcher' });
    memory.store({ content: 'I1', type: 'insight', agent: 'analyst' });

    const stats = memory.getStats();
    expect(stats.totalCount).toBe(3);
    expect(stats.byAgent['researcher']).toBe(2);
    expect(stats.byAgent['analyst']).toBe(1);
    expect(stats.byType['fact']).toBe(1);
    expect(stats.byType['finding']).toBe(1);
    expect(stats.byType['insight']).toBe(1);
    expect(stats.dbSizeBytes).toBeGreaterThan(0);
  });

  it('should delete and clear memories cleanly', () => {
    const mem = memory.store({ content: 'To be deleted', type: 'fact', agent: 'user' });
    expect(memory.getById(mem.id)).not.toBeNull();

    const deleted = memory.delete(mem.id);
    expect(deleted).toBe(true);
    expect(memory.getById(mem.id)).toBeNull();

    memory.store({ content: 'Item 1', type: 'fact', agent: 'user' });
    memory.store({ content: 'Item 2', type: 'fact', agent: 'user' });
    expect(memory.getRecent().length).toBe(2);

    memory.clear();
    expect(memory.getRecent().length).toBe(0);
  });
});
