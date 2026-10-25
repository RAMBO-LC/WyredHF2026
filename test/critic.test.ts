import { describe, it, expect, beforeEach } from 'vitest';
import { SharedMemory } from '../src/memory/sharedMemory.js';
import { CriticAgent } from '../src/agents/criticAgent.js';
import { Orchestrator } from '../src/orchestrator/orchestrator.js';

describe('CriticAgent & Self-Correction Evaluation Loop', () => {
  let memory: SharedMemory;
  let critic: CriticAgent;

  beforeEach(() => {
    memory = new SharedMemory(':memory:');
    critic = new CriticAgent(memory);
  });

  it('should strictly evaluate agent output and produce valid score, is_acceptable, and feedback', async () => {
    const task = 'Research benefits of multi-agent AI systems';
    const output = `### Executive Summary
Multi-agent AI architectures decompose complex reasoning tasks into specialized roles:
1. **Specialization**: Researcher, Analyst, Writer, and Critic optimize distinct cognitive subtasks.
2. **Persistent Shared Memory**: Prevents context degradation across session boundaries.
3. **Decentralized Execution**: Improves fault-tolerance and modular maintainability.
In conclusion, multi-agent systems dramatically outperform monolithic single-prompt configurations.`;

    const evaluation = await critic.evaluate(task, output, 0, 'test_task_1');

    expect(evaluation.score).toBeGreaterThanOrEqual(1);
    expect(evaluation.score).toBeLessThanOrEqual(10);
    expect(typeof evaluation.is_acceptable).toBe('boolean');
    expect(typeof evaluation.feedback).toBe('string');
    expect(Array.isArray(evaluation.missing_elements)).toBe(true);

    // Verify critique was saved in persistent SQLite memory
    const critiques = memory.search('', { type: 'critique' });
    expect(critiques.length).toBe(1);
    expect(critiques[0].agent).toBe('critic');
    expect(critiques[0].content).toContain('Score:');
  });

  it('should flag inadequate or overly brief initial output as unacceptable on attempt 0', async () => {
    const task = 'Provide a comprehensive architecture plan for enterprise multi-agent deployment';
    const briefOutput = 'We should use agents.';

    const evaluation = await critic.evaluate(task, briefOutput, 0, 'test_task_brief');

    expect(evaluation.is_acceptable).toBe(false);
    expect(evaluation.score).toBeLessThan(8);
    expect(evaluation.missing_elements.length).toBeGreaterThan(0);
    expect(evaluation.feedback).toContain('too brief');
  });

  it('should run full Orchestrator pipeline including Critic evaluation and attach critique in TaskResult', async () => {
    const orchestrator = new Orchestrator(memory);
    let criticFired = false;
    let criticScore = 0;

    orchestrator.setEventListeners({
      onCriticComplete: (evalResult) => {
        criticFired = true;
        criticScore = evalResult.score;
      },
    });

    const result = await orchestrator.runTask('Explain shared SQLite memory in multi-agent systems');

    expect(criticFired).toBe(true);
    expect(criticScore).toBeGreaterThanOrEqual(1);
    expect(result.critique).toBeDefined();
    expect(result.critique?.score).toBe(criticScore);
    expect(result.finalSummary.length).toBeGreaterThan(50);

    // Check that SQLite holds researcher, analyst, writer, and critique entries
    const allMemories = memory.getRecent(50);
    const agents = new Set(allMemories.map((m) => m.agent));
    expect(agents.has('researcher')).toBe(true);
    expect(agents.has('analyst')).toBe(true);
    expect(agents.has('writer')).toBe(true);
    expect(agents.has('critic')).toBe(true);
  });

  it('should support Knowledge Base documents and graph data in SQLite', async () => {
    const docs = memory.getDocuments();
    expect(docs.length).toBeGreaterThanOrEqual(9);

    const archDoc = memory.getDocumentById('doc_architecture');
    expect(archDoc).toBeDefined();
    expect(archDoc?.title).toBe('Architecture.md');
    expect(archDoc?.backlinks.length).toBeGreaterThanOrEqual(2);
    expect(archDoc?.outgoing.length).toBeGreaterThanOrEqual(1);

    const graph = memory.getGraphData();
    expect(graph.nodes.length).toBe(docs.length);
    expect(graph.edges.length).toBeGreaterThan(5);
  });
});
