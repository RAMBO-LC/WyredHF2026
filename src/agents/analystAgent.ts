import { BaseAgent, AgentContext } from './baseAgent.js';
import { MemoryInput, MemoryType, Tool } from '../types/index.js';
import { SharedMemory } from '../memory/sharedMemory.js';
import { MemoryRecallTool } from '../tools/memoryTools.js';

export class AnalystAgent extends BaseAgent {
  public name = 'Analyst';
  public role = 'Systems Analyst & Synthesizer';
  public description = 'Evaluates raw findings from SharedBrain, synthesizes core patterns, analyzes trade-offs, and writes structured insights.';

  constructor(memory: SharedMemory, customTools?: Tool[]) {
    const defaultTools: Tool[] = customTools || [
      new MemoryRecallTool(memory),
    ];
    super(memory, defaultTools);
  }

  public getSystemPrompt(context: AgentContext): string {
    // Analyst retrieves current task's findings and previous memories
    const taskMemories = context.taskId ? this.memory.getByTask(context.taskId) : [];
    const memoryContext = this.memory.formatMemoriesForPrompt(
      taskMemories.length > 0 ? taskMemories : (context.priorMemories || [])
    );

    return `You are the ANALYST AGENT in the SharedBrain multi-agent collective.
Your primary role is to consume raw research findings stored in SharedBrain, evaluate implications, uncover non-obvious patterns, analyze trade-offs, and formulate high-impact insights.

Current Knowledge Base in SharedBrain:
${memoryContext}

Guidelines:
- Do not repeat raw facts. Transform them into analytical insights.
- Highlight systemic trade-offs (e.g. latency vs consistency, complexity vs maintainability).
- Structure outputs clearly: Core Implications, Comparative Trade-offs, and Strategic Insights.
- Formulate distinct insight statements that will be saved into the shared SQLite brain for the Writer Agent.`;
  }

  protected getDefaultMemoryType(): MemoryType {
    return 'insight';
  }

  public async simulateAgentReasoning(
    task: string,
    context: AgentContext
  ): Promise<{ output: string; thoughts?: string; extractedMemories: MemoryInput[] }> {
    // Read whatever the Researcher wrote into shared memory for this task
    const currentTaskMemories = context.taskId
      ? this.memory.getByTask(context.taskId)
      : [];

    const findingsReadCount = currentTaskMemories.length;

    const thoughts = `Thought Process:
1. Queried SharedBrain SQLite database for task_id="${context.taskId}".
2. Successfully ingested ${findingsReadCount} raw findings produced by Researcher Agent.
3. Cross-referenced with historical memory patterns.
4. Synthesized 3 strategic insights focusing on architecture, organizational impact, and failure prevention.`;

    const tags = this.generateTags(task);

    const insights: string[] = [
      `Asynchronous Memory Decoupling: A persistent SQLite layer transforms transient agent conversations into an immutable event log. This eliminates agent concurrency race conditions while preserving full provenance of decisions.`,
      `The 3-Stage Pipeline Multiplier: The Researcher -> Analyst -> Writer sequence prevents premature synthesis. Forcing an explicit analysis stage filters noisy search data by ~40% before reaching final communication.`,
      `Zero-Cloud Overhead Advantage: Embedded local storage (better-sqlite3) provides deterministic sub-millisecond read/writes, making it radically more cost-effective and secure for sensitive team and startup data than cloud vector databases.`,
    ];

    const output = `### Analytical Synthesis: ${task}

**Analysis Context**: Processed ${findingsReadCount} raw findings from SharedBrain storage.

#### Strategic Insights:
1. **${insights[0].split(':')[0]}**: ${insights[0].split(':').slice(1).join(':')}
2. **${insights[1].split(':')[0]}**: ${insights[1].split(':').slice(1).join(':')}
3. **${insights[2].split(':')[0]}**: ${insights[2].split(':').slice(1).join(':')}

#### Key Trade-Off Matrix:
- **Architecture Simplicity vs Distributed Scale**: Embedded SQLite achieves immediate reliability and persistence with 0 Docker or cluster overhead. For 1-100 agents, single-file SQLite beats distributed setups on latency, cost, and developer experience.
- **Context Size vs Memory Quality**: Rather than dumping entire chat logs into LLM context, storing discrete, categorized entries (facts, insights) preserves high signal-to-noise ratio.

*Status: Analytical evaluation complete. Insights committed to SharedBrain for Writer Agent.*`;

    const extractedMemories: MemoryInput[] = insights.map((insight) => ({
      content: insight,
      type: 'insight',
      agent: this.name.toLowerCase(),
      tags,
    }));

    return { output, thoughts, extractedMemories };
  }
}
