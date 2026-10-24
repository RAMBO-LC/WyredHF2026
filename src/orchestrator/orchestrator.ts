import crypto from 'crypto';
import { AgentResult, MemoryEntry, TaskResult } from '../types/index.js';
import { SharedMemory, getSharedMemory } from '../memory/sharedMemory.js';
import { ResearcherAgent } from '../agents/researcherAgent.js';
import { AnalystAgent } from '../agents/analystAgent.js';
import { WriterAgent } from '../agents/writerAgent.js';

export interface OrchestratorEvents {
  onTaskStart?: (taskId: string, task: string, priorMemories: MemoryEntry[]) => void;
  onAgentStart?: (agentName: string, role: string) => void;
  onAgentThought?: (agentName: string, thoughts: string) => void;
  onAgentComplete?: (result: AgentResult) => void;
  onHandoff?: (fromAgent: string, toAgent: string, memoryCount: number) => void;
  onTaskComplete?: (result: TaskResult) => void;
}

export class Orchestrator {
  private memory: SharedMemory;
  private researcher: ResearcherAgent;
  private analyst: AnalystAgent;
  private writer: WriterAgent;
  private events: OrchestratorEvents;

  constructor(memory?: SharedMemory, events: OrchestratorEvents = {}) {
    this.memory = memory || getSharedMemory();
    this.events = events;

    this.researcher = new ResearcherAgent(this.memory);
    this.analyst = new AnalystAgent(this.memory);
    this.writer = new WriterAgent(this.memory);
  }

  public setEventListeners(events: OrchestratorEvents): void {
    this.events = { ...this.events, ...events };
  }

  public getMemory(): SharedMemory {
    return this.memory;
  }

  /**
   * Executes the full collaborative multi-agent workflow:
   * 1. Check shared memory for prior knowledge across sessions
   * 2. Researcher gathers and stores facts/findings in SQLite
   * 3. Handoff to Analyst: reads findings from SQLite, synthesizes insights, stores in SQLite
   * 4. Handoff to Writer: reads insights from SQLite, produces final executive report, stores in SQLite
   * 5. Record task completion and persist in database
   */
  public async runTask(task: string, customTaskId?: string): Promise<TaskResult> {
    const startTime = Date.now();
    const taskId = customTaskId || `task_${Date.now()}_${crypto.randomBytes(3).toString('hex')}`;

    // Record task start in persistent database
    this.memory.recordTaskStart(taskId, task);

    // 1. Recall prior memories from earlier sessions or tasks
    const priorMemories = this.memory.recall(task, 6);
    this.events.onTaskStart?.(taskId, task, priorMemories);

    const agentResults: AgentResult[] = [];
    let totalMemoriesCreated = 0;

    // --- STEP 1: RESEARCHER AGENT ---
    this.events.onAgentStart?.(this.researcher.name, this.researcher.role);

    const researcherResult = await this.researcher.execute(task, {
      taskId,
      priorMemories,
      handoffNotes: priorMemories.length > 0
        ? `Recalled ${priorMemories.length} relevant historical memories from previous sessions.`
        : undefined,
    });

    if (researcherResult.thoughts) {
      this.events.onAgentThought?.(this.researcher.name, researcherResult.thoughts);
    }
    this.events.onAgentComplete?.(researcherResult);
    agentResults.push(researcherResult);
    totalMemoriesCreated += researcherResult.memoriesCreated.length;

    // Handoff from Researcher -> Analyst
    this.events.onHandoff?.(
      this.researcher.name,
      this.analyst.name,
      researcherResult.memoriesCreated.length
    );

    // --- STEP 2: ANALYST AGENT ---
    this.events.onAgentStart?.(this.analyst.name, this.analyst.role);

    const analystResult = await this.analyst.execute(task, {
      taskId,
      priorMemories,
      handoffNotes: `Ingested ${researcherResult.memoriesCreated.length} findings from Researcher Agent via SQLite.`,
    });

    if (analystResult.thoughts) {
      this.events.onAgentThought?.(this.analyst.name, analystResult.thoughts);
    }
    this.events.onAgentComplete?.(analystResult);
    agentResults.push(analystResult);
    totalMemoriesCreated += analystResult.memoriesCreated.length;

    // Handoff from Analyst -> Writer
    this.events.onHandoff?.(
      this.analyst.name,
      this.writer.name,
      analystResult.memoriesCreated.length
    );

    // --- STEP 3: WRITER AGENT ---
    this.events.onAgentStart?.(this.writer.name, this.writer.role);

    const writerResult = await this.writer.execute(task, {
      taskId,
      priorMemories,
      handoffNotes: `Ingested ${analystResult.memoriesCreated.length} insights from Analyst Agent and findings from Researcher Agent via SQLite.`,
    });

    if (writerResult.thoughts) {
      this.events.onAgentThought?.(this.writer.name, writerResult.thoughts);
    }
    this.events.onAgentComplete?.(writerResult);
    agentResults.push(writerResult);
    totalMemoriesCreated += writerResult.memoriesCreated.length;

    const durationMs = Date.now() - startTime;
    const finalSummary = writerResult.output;

    // Complete task record in SQLite
    this.memory.recordTaskComplete(taskId, finalSummary, {
      durationMs,
      totalMemoriesCreated,
      agentsInvolved: agentResults.map((a) => a.agent),
    });

    const taskResult: TaskResult = {
      taskId,
      task,
      finalSummary,
      agentResults,
      totalMemoriesCreated,
      durationMs,
      recalledPriorMemories: priorMemories,
    };

    this.events.onTaskComplete?.(taskResult);

    return taskResult;
  }

  /**
   * Queries the shared persistent memory across past sessions to answer questions
   * and prove that knowledge persists after restarting the application.
   */
  public async answerWithMemory(query: string): Promise<{ answer: string; recalledMemories: MemoryEntry[] }> {
    const recalledMemories = this.memory.recall(query, 5);

    if (recalledMemories.length === 0) {
      return {
        answer: `No relevant knowledge found in SharedBrain for "${query}". Try running a research task first!`,
        recalledMemories: [],
      };
    }

    const lines: string[] = [
      `🧠 SharedBrain Knowledge Recall for: "${query}"\n`,
      `Found ${recalledMemories.length} relevant memories preserved in SQLite from previous sessions:\n`,
    ];

    recalledMemories.forEach((m, idx) => {
      const time = new Date(m.timestamp).toLocaleString();
      lines.push(`[${idx + 1}] (${m.type.toUpperCase()} by Agent: ${m.agent} on ${time})`);
      lines.push(`    "${m.content}"`);
      if (m.tags && m.tags.length > 0) {
        lines.push(`    🏷️  Tags: ${m.tags.join(', ')}`);
      }
      lines.push('');
    });

    lines.push(`Synthesis: The collective team memory contains verified facts, analytical insights, and summaries recorded during past tasks. Knowledge remains accessible across sessions.`);

    return {
      answer: lines.join('\n'),
      recalledMemories,
    };
  }
}
