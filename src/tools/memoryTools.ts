import { Tool, MemoryType } from '../types/index.js';
import { SharedMemory } from '../memory/sharedMemory.js';

export class MemoryRecallTool implements Tool {
  public name = 'memory_recall';
  public description = 'Recalls existing facts, findings, and past outputs from the SharedBrain persistent SQLite memory.';
  public parameters = {
    type: 'object' as const,
    properties: {
      query: {
        type: 'string',
        description: 'Keywords or topic to search within shared memory',
      },
      limit: {
        type: 'number',
        description: 'Maximum number of memories to retrieve (default: 5)',
      },
    },
    required: ['query'],
  };

  constructor(private memory: SharedMemory) {}

  public execute(args: { query: string; limit?: number }): string {
    const { query, limit = 5 } = args;
    const results = this.memory.recall(query, limit);

    if (results.length === 0) {
      return `No memories found matching query "${query}".`;
    }

    const lines = [`Found ${results.length} relevant memories in SharedBrain:`];
    results.forEach((m, idx) => {
      lines.push(`\n[Memory #${idx + 1}] (${m.type} from ${m.agent})`);
      lines.push(`Content: ${m.content}`);
      if (m.tags && m.tags.length > 0) {
        lines.push(`Tags: ${m.tags.join(', ')}`);
      }
    });

    return lines.join('\n');
  }
}

export class MemoryStoreTool implements Tool {
  public name = 'memory_store';
  public description = 'Stores a new verified fact, insight, or finding into the SharedBrain persistent SQLite memory.';
  public parameters = {
    type: 'object' as const,
    properties: {
      content: {
        type: 'string',
        description: 'The content or finding to store in memory',
      },
      type: {
        type: 'string',
        description: 'The category of memory: fact, finding, insight, summary, or raw',
      },
      tags: {
        type: 'string',
        description: 'Comma-separated tags for this memory (e.g. "ai, benefits, architecture")',
      },
    },
    required: ['content', 'type'],
  };

  constructor(
    private memory: SharedMemory,
    private defaultAgent: string = 'agent',
    private taskId?: string
  ) {}

  public execute(args: { content: string; type: string; tags?: string }): string {
    const { content, type, tags } = args;
    const tagList = tags
      ? tags.split(',').map((t) => t.trim().toLowerCase()).filter(Boolean)
      : [];

    const entry = this.memory.store({
      content,
      type: (type as MemoryType) || 'finding',
      agent: this.defaultAgent,
      tags: tagList,
      task_id: this.taskId,
    });

    return `Stored memory [${entry.id}] (${entry.type}) into SharedBrain successfully.`;
  }
}
