import { BaseAgent, AgentContext } from './baseAgent.js';
import { MemoryInput, MemoryType, Tool } from '../types/index.js';
import { SharedMemory } from '../memory/sharedMemory.js';
import { MemoryRecallTool } from '../tools/memoryTools.js';

export class WriterAgent extends BaseAgent {
  public name = 'Writer';
  public role = 'Technical Communicator & Author';
  public description = 'Reads synthesized insights and findings from SharedBrain, crafts polished deliverables, and commits final summaries.';

  constructor(memory: SharedMemory, customTools?: Tool[]) {
    const defaultTools: Tool[] = customTools || [
      new MemoryRecallTool(memory),
    ];
    super(memory, defaultTools);
  }

  public getSystemPrompt(context: AgentContext): string {
    const taskMemories = context.taskId ? this.memory.getByTask(context.taskId) : [];
    const memoryContext = this.memory.formatMemoriesForPrompt(
      taskMemories.length > 0 ? taskMemories : (context.priorMemories || [])
    );

    return `You are the WRITER AGENT in the SharedBrain multi-agent collective.
Your primary role is to synthesize the analytical insights and research findings stored in SharedBrain into an eloquent, authoritative, highly structured final deliverable.

Current Knowledge Base in SharedBrain:
${memoryContext}

Guidelines:
- Your final output should be comprehensive, actionable, and ready for leadership or team consumption.
- Include: Executive Summary, Key Pillars / Findings, Strategic Value, and Actionable Next Steps.
- Retain clarity, crisp typography, and high readability.
- The final summary will be recorded as the definitive deliverable in SharedBrain for future recall.`;
  }

  protected getDefaultMemoryType(): MemoryType {
    return 'summary';
  }

  public async simulateAgentReasoning(
    task: string,
    context: AgentContext
  ): Promise<{ output: string; thoughts?: string; extractedMemories: MemoryInput[] }> {
    const taskMemories = context.taskId ? this.memory.getByTask(context.taskId) : [];
    const researcherCount = taskMemories.filter((m) => m.agent === 'researcher').length;
    const analystCount = taskMemories.filter((m) => m.agent === 'analyst').length;

    const thoughts = `Thought Process:
1. Retrieved accumulated SharedBrain state for task: ${researcherCount} findings from Researcher, ${analystCount} insights from Analyst.
2. Synthesized cross-agent perspectives into a unified narrative.
3. Formatted into executive report with Executive Summary, Architectural Pillars, and Practical Next Steps.`;

    const tags = this.generateTags(task);

    const summaryContent = `## Executive Summary: Multi-Agent Systems & Shared Persistent Memory

### 1. Overview
Modern AI operations are rapidly transitioning from single prompt workflows to **collaborative multi-agent architectures**. While isolated LLM agents encounter severe amnesia between sessions and hallucinate under overloaded context windows, a **shared persistent memory architecture** (powered locally by SQLite) transforms disconnected agents into an enduring "company brain".

### 2. Core Pillars of the Architecture
* **Modular Specialization (3-Stage Flywheel)**:
  - **Researcher**: Rapid empirical discovery and source validation without premature bias.
  - **Analyst**: Deep structural evaluation, filtering raw noise by 40% into actionable insights.
  - **Writer**: Authoritative final delivery calibrated for team and decision-maker impact.
* **Persistent Shared Memory (SQLite WAL + FTS5)**:
  - Sub-millisecond latency for atomic read/write handoffs.
  - Zero external cloud database costs or API token bloat.
  - True persistence across application restarts—knowledge accumulates over days, weeks, and months.
* **Continuous Team Learning**:
  - Future tasks immediately recall previous findings, eliminating redundant research loops and creating a cumulative institutional memory.

### 3. Immediate Action Plan for Teams
1. **Adopt Local-First Memory**: Standardize on embedded SQLite for agent state before adding complex distributed databases.
2. **Enforce Stage Gates**: Never let a single agent attempt discovery and final authoring in one turn; require an analytical verification handoff.
3. **Persist Provenance**: Store not just the final output, but the discrete atomic facts and agent signatures that led to it.`;

    const output = summaryContent;

    const extractedMemories: MemoryInput[] = [
      {
        content: `Final Summary for task "${task}": Collaborative multi-agent systems with shared persistent SQLite memory outperform isolated agents through role specialization, 3-stage handoffs (Researcher -> Analyst -> Writer), and cumulative cross-session recall without cloud complexity.`,
        type: 'summary',
        agent: this.name.toLowerCase(),
        tags: ['summary', ...tags],
      },
    ];

    return { output, thoughts, extractedMemories };
  }
}
