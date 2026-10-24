import OpenAI from 'openai';
import { AgentResult, MemoryEntry, MemoryInput, MemoryType, Tool } from '../types/index.js';
import { SharedMemory } from '../memory/sharedMemory.js';
import { config, getOpenAIClient } from '../config/index.js';

export interface AgentContext {
  taskId: string;
  priorMemories?: MemoryEntry[];
  handoffNotes?: string;
  recalledKnowledge?: string;
}

export abstract class BaseAgent {
  public abstract name: string;
  public abstract role: string;
  public abstract description: string;
  protected tools: Tool[] = [];
  protected memory: SharedMemory;
  protected openai: OpenAI | null;
  protected model: string;

  constructor(memory: SharedMemory, tools: Tool[] = []) {
    this.memory = memory;
    this.tools = tools;
    this.openai = getOpenAIClient();
    this.model = config.openaiModel;
  }

  public abstract getSystemPrompt(context: AgentContext): string;

  /**
   * Main execution method for the agent.
   */
  public async execute(task: string, context: AgentContext): Promise<AgentResult> {
    const startTime = Date.now();

    // 1. Prepare system prompt and context
    const systemPrompt = this.getSystemPrompt(context);

    // 2. Execute via real OpenAI API or intelligent fallback generator
    let output = '';
    let thoughts = '';
    const memoriesToCreate: MemoryInput[] = [];

    if (this.openai && !config.useMockLLM) {
      try {
        const result = await this.runOpenAIWorkflow(task, systemPrompt, context);
        output = result.output;
        thoughts = result.thoughts || '';
        memoriesToCreate.push(...result.extractedMemories);
      } catch (err: any) {
        // Fallback to simulated reasoning if OpenAI call fails (e.g. rate limit, bad key)
        thoughts = `[OpenAI API call encountered an error: ${err.message}. Falling back to internal engine.]`;
        const simulated = await this.simulateAgentReasoning(task, context);
        output = simulated.output;
        thoughts += '\n' + (simulated.thoughts || '');
        memoriesToCreate.push(...simulated.extractedMemories);
      }
    } else {
      // Local/offline mock agent execution
      const simulated = await this.simulateAgentReasoning(task, context);
      output = simulated.output;
      thoughts = simulated.thoughts || '';
      memoriesToCreate.push(...simulated.extractedMemories);
    }

    // 3. Commit new memories into the shared SQLite brain
    const createdMemories: MemoryEntry[] = [];
    for (const mem of memoriesToCreate) {
      mem.task_id = context.taskId;
      mem.agent = this.name.toLowerCase();
      createdMemories.push(this.memory.store(mem));
    }

    const duration = Date.now() - startTime;

    return {
      agent: this.name,
      role: this.role,
      output,
      memoriesCreated: createdMemories,
      thoughts,
      executionTimeMs: duration,
    };
  }

  /**
   * Executes multi-turn tool calling with OpenAI.
   */
  private async runOpenAIWorkflow(
    task: string,
    systemPrompt: string,
    context: AgentContext
  ): Promise<{ output: string; thoughts?: string; extractedMemories: MemoryInput[] }> {
    if (!this.openai) throw new Error('OpenAI client not initialized');

    const formattedTools: OpenAI.ChatCompletionTool[] = this.tools.map((t) => ({
      type: 'function',
      function: {
        name: t.name,
        description: t.description,
        parameters: t.parameters as any,
      },
    }));

    const messages: OpenAI.ChatCompletionMessageParam[] = [
      { role: 'system', content: systemPrompt },
      {
        role: 'user',
        content: `Current Task: "${task}"\n\nTask ID: ${context.taskId}\n${
          context.handoffNotes ? `Handoff Context from previous agent:\n${context.handoffNotes}\n` : ''
        }\nPlease conduct your specialized phase and clearly output your findings, reasoning, and key points to record in shared memory.`,
      },
    ];

    let turns = 0;
    const maxTurns = 5;
    let toolLogs: string[] = [];

    while (turns < maxTurns) {
      turns++;
      const response = await this.openai.chat.completions.create({
        model: this.model,
        messages,
        tools: formattedTools.length > 0 ? formattedTools : undefined,
      });

      const message = response.choices[0]?.message;
      if (!message) break;

      messages.push(message);

      if (message.tool_calls && message.tool_calls.length > 0) {
        for (const toolCall of message.tool_calls) {
          if (toolCall.type !== 'function') continue;
          const { name, arguments: rawArgs } = toolCall.function;
          const matchedTool = this.tools.find((t) => t.name === name);

          let toolOutput = '';
          try {
            const parsedArgs = JSON.parse(rawArgs || '{}');
            toolLogs.push(`Executed tool ${name} with args: ${rawArgs}`);
            if (matchedTool) {
              toolOutput = await matchedTool.execute(parsedArgs);
            } else {
              toolOutput = `Error: Tool ${name} not found.`;
            }
          } catch (err: any) {
            toolOutput = `Error executing tool ${name}: ${err.message}`;
          }

          messages.push({
            role: 'tool',
            tool_call_id: toolCall.id,
            content: toolOutput,
          });
        }
      } else {
        // Final completion text
        const output = message.content || '';
        const extractedMemories = this.extractMemoriesFromText(output, task);
        return {
          output,
          thoughts: toolLogs.join('\n'),
          extractedMemories,
        };
      }
    }

    const lastMsg = messages[messages.length - 1];
    const output = typeof lastMsg.content === 'string' ? lastMsg.content : '';
    return {
      output,
      thoughts: toolLogs.join('\n'),
      extractedMemories: this.extractMemoriesFromText(output, task),
    };
  }

  /**
   * Parses bullet points or key blocks from agent output to generate atomic memory entries.
   */
  protected extractMemoriesFromText(text: string, task: string): MemoryInput[] {
    const memories: MemoryInput[] = [];
    const lines = text.split('\n');
    const tags = this.generateTags(task);

    // Look for bullet points or numbered items
    const bullets = lines
      .map((l) => l.trim())
      .filter((l) => /^[-*•]|\d+\.\s+/.test(l) && l.length > 30);

    if (bullets.length > 0) {
      // Store top key bullet points as individual facts/findings
      for (const bullet of bullets.slice(0, 4)) {
        const cleaned = bullet.replace(/^[-*•]|\d+\.\s+/, '').trim();
        memories.push({
          content: cleaned,
          type: this.getDefaultMemoryType(),
          agent: this.name.toLowerCase(),
          tags,
        });
      }
    } else {
      // Store the main output or first 2 paragraphs
      const firstParagraph = text.split('\n\n')[0] || text;
      memories.push({
        content: firstParagraph.trim().slice(0, 600),
        type: this.getDefaultMemoryType(),
        agent: this.name.toLowerCase(),
        tags,
      });
    }

    return memories;
  }

  protected generateTags(task: string): string[] {
    const words = task
      .toLowerCase()
      .replace(/[^\w\s]/g, '')
      .split(/\s+/)
      .filter((w) => w.length > 3 && !['research', 'write', 'summary', 'about', 'what', 'system'].includes(w));
    const defaultTag = this.name.toLowerCase();
    return Array.from(new Set([defaultTag, ...words.slice(0, 4)]));
  }

  protected abstract getDefaultMemoryType(): MemoryType;

  /**
   * Deterministic, high-quality reasoning simulator for offline / demo / test execution.
   */
  public abstract simulateAgentReasoning(
    task: string,
    context: AgentContext
  ): Promise<{ output: string; thoughts?: string; extractedMemories: MemoryInput[] }>;
}
