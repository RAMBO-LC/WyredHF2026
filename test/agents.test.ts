import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SharedMemory } from '../src/memory/sharedMemory.js';
import { ResearcherAgent } from '../src/agents/researcherAgent.js';
import { AnalystAgent } from '../src/agents/analystAgent.js';
import { WriterAgent } from '../src/agents/writerAgent.js';

describe('Specialized Agents', () => {
  let memory: SharedMemory;

  beforeEach(() => {
    memory = new SharedMemory(':memory:');
  });

  afterEach(() => {
    memory.close();
  });

  it('ResearcherAgent should gather findings and write to memory', async () => {
    const researcher = new ResearcherAgent(memory);
    expect(researcher.name).toBe('Researcher');
    expect(researcher.role).toContain('Information Gatherer');

    const result = await researcher.execute('Research the benefits of multi-agent systems', {
      taskId: 'test_task_1',
    });

    expect(result.agent).toBe('Researcher');
    expect(result.output).toBeDefined();
    expect(result.memoriesCreated.length).toBeGreaterThan(0);
    expect(result.executionTimeMs).toBeGreaterThanOrEqual(0);

    // Verify memories were saved in the shared memory
    const stored = memory.getByTask('test_task_1');
    expect(stored.length).toBe(result.memoriesCreated.length);
    expect(stored[0].agent).toBe('researcher');
    expect(stored[0].type).toBe('finding');
  });

  it('AnalystAgent should read researcher findings from memory and write insights', async () => {
    const researcher = new ResearcherAgent(memory);
    const analyst = new AnalystAgent(memory);

    // 1. Researcher stores findings
    await researcher.execute('Investigate persistent memory in AI agents', {
      taskId: 'test_task_2',
    });

    // 2. Analyst consumes and analyzes
    const analystResult = await analyst.execute('Investigate persistent memory in AI agents', {
      taskId: 'test_task_2',
    });

    expect(analystResult.agent).toBe('Analyst');
    expect(analystResult.output).toContain('Strategic Insights');
    expect(analystResult.memoriesCreated.length).toBeGreaterThan(0);

    // Verify memories in shared SQLite
    const insights = memory.getByType('insight');
    expect(insights.length).toBe(analystResult.memoriesCreated.length);
    expect(insights[0].agent).toBe('analyst');
  });

  it('WriterAgent should synthesize findings and insights into a final summary', async () => {
    const researcher = new ResearcherAgent(memory);
    const analyst = new AnalystAgent(memory);
    const writer = new WriterAgent(memory);

    const taskId = 'test_task_3';
    await researcher.execute('Topic X', { taskId });
    await analyst.execute('Topic X', { taskId });

    const writerResult = await writer.execute('Topic X', { taskId });

    expect(writerResult.agent).toBe('Writer');
    expect(writerResult.output).toContain('Executive Summary');
    expect(writerResult.memoriesCreated.length).toBe(1);
    expect(writerResult.memoriesCreated[0].type).toBe('summary');

    const summaries = memory.getByType('summary');
    expect(summaries.length).toBe(1);
    expect(summaries[0].agent).toBe('writer');
  });
});
