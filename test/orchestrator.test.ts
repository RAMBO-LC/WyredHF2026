import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { SharedMemory } from '../src/memory/sharedMemory.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';

describe('Orchestrator End-to-End Multi-Agent Workflow', () => {
  let memory: SharedMemory;

  beforeEach(() => {
    memory = new SharedMemory(':memory:');
  });

  afterEach(() => {
    memory.close();
  });

  it('should coordinate full pipeline (Researcher -> Analyst -> Writer) and fire lifecycle events', async () => {
    const eventsTriggered: string[] = [];
    const handoffs: { from: string; to: string }[] = [];

    const orchestrator = new Orchestrator(memory, {
      onTaskStart: (taskId, task) => {
        eventsTriggered.push(`task_start:${taskId}`);
      },
      onAgentStart: (agent) => {
        eventsTriggered.push(`agent_start:${agent}`);
      },
      onAgentComplete: (result) => {
        eventsTriggered.push(`agent_complete:${result.agent}`);
      },
      onHandoff: (from, to, count) => {
        handoffs.push({ from, to });
      },
      onTaskComplete: (result) => {
        eventsTriggered.push(`task_complete:${result.taskId}`);
      },
    });

    const task = 'Research the benefits of multi-agent systems and write a short summary';
    const result = await orchestrator.runTask(task);

    expect(result).toBeDefined();
    expect(result.task).toBe(task);
    expect(result.agentResults.length).toBe(3);
    expect(result.agentResults[0].agent).toBe('Researcher');
    expect(result.agentResults[1].agent).toBe('Analyst');
    expect(result.agentResults[2].agent).toBe('Writer');

    expect(result.finalSummary).toContain('Executive Summary');
    expect(result.totalMemoriesCreated).toBe(8);

    // Verify handoffs
    expect(handoffs).toEqual([
      { from: 'Researcher', to: 'Analyst' },
      { from: 'Analyst', to: 'Writer' },
    ]);

    // Verify lifecycle events
    expect(eventsTriggered).toContain(`agent_start:Researcher`);
    expect(eventsTriggered).toContain(`agent_complete:Researcher`);
    expect(eventsTriggered).toContain(`agent_start:Analyst`);
    expect(eventsTriggered).toContain(`agent_complete:Analyst`);
    expect(eventsTriggered).toContain(`agent_start:Writer`);
    expect(eventsTriggered).toContain(`agent_complete:Writer`);

    // Verify SQLite task run record
    const history = memory.getTaskHistory(1);
    expect(history.length).toBe(1);
    expect(history[0].id).toBe(result.taskId);
    expect(history[0].status).toBe('completed');
  });

  it('should recall prior memories across multiple task runs', async () => {
    const orchestrator = new Orchestrator(memory);

    // Run first task
    await orchestrator.runTask('First task on multi-agent consensus algorithms');

    // Run follow-up query
    const recallResult = await orchestrator.answerWithMemory('consensus algorithms');
    expect(recallResult.recalledMemories.length).toBeGreaterThan(0);
    expect(recallResult.answer).toContain('SharedBrain Knowledge Recall');
  });
});
