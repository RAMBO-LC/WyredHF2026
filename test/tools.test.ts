import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SharedMemory } from '../src/memory/sharedMemory.js';
import { WebSearchTool } from '../src/tools/webSearch.js';
import { MemoryRecallTool, MemoryStoreTool } from '../src/tools/memoryTools.js';

describe('Shared Tools', () => {
  let memory: SharedMemory;

  beforeEach(() => {
    memory = new SharedMemory(':memory:');
  });

  afterEach(() => {
    memory.close();
  });

  it('WebSearchTool should return formatted search results', async () => {
    const tool = new WebSearchTool();
    expect(tool.name).toBe('web_search');
    expect(tool.parameters.required).toContain('query');

    const result = await tool.execute({ query: 'multi-agent systems architecture' });
    expect(result).toBeDefined();
    expect(result).toContain('Web Search Results for:');
    expect(result).toContain('multi-agent');
  });

  it('MemoryStoreTool should store entries directly into SharedMemory', () => {
    const storeTool = new MemoryStoreTool(memory, 'researcher', 'task_123');
    const response = storeTool.execute({
      content: 'SQLite handles concurrent reads with WAL mode.',
      type: 'fact',
      tags: 'sqlite, wal, concurrency',
    });

    expect(response).toContain('Stored memory');

    const recent = memory.getRecent(5);
    expect(recent.length).toBe(1);
    expect(recent[0].content).toBe('SQLite handles concurrent reads with WAL mode.');
    expect(recent[0].type).toBe('fact');
    expect(recent[0].agent).toBe('researcher');
    expect(recent[0].tags).toEqual(['sqlite', 'wal', 'concurrency']);
  });

  it('MemoryRecallTool should retrieve stored memories', () => {
    memory.store({
      content: 'Agent coordination reduces hallucination rate by 38%.',
      type: 'insight',
      agent: 'analyst',
      tags: ['hallucination', 'coordination'],
    });

    const recallTool = new MemoryRecallTool(memory);
    const result = recallTool.execute({ query: 'hallucination coordination', limit: 2 });

    expect(result).toContain('Found 1 relevant memories');
    expect(result).toContain('Agent coordination reduces hallucination');
  });
});
