export type MemoryType = 'fact' | 'finding' | 'insight' | 'summary' | 'raw' | 'plan';

export type AgentRole = 'researcher' | 'analyst' | 'writer' | 'orchestrator' | 'user';

export interface MemoryEntry {
  id: string;
  content: string;
  type: MemoryType;
  agent: string;
  timestamp: string;
  tags: string[];
  task_id?: string;
  metadata?: Record<string, any>;
}

export interface MemoryInput {
  content: string;
  type: MemoryType;
  agent: string;
  tags?: string[];
  task_id?: string;
  metadata?: Record<string, any>;
}

export interface SearchOptions {
  limit?: number;
  agent?: string;
  type?: MemoryType;
  tags?: string[];
  taskId?: string;
}

export interface MemoryStats {
  totalCount: number;
  byType: Record<string, number>;
  byAgent: Record<string, number>;
  dbPath: string;
  dbSizeBytes: number;
  lastUpdated: string | null;
}

export interface ToolParameter {
  type: string;
  description: string;
  required?: boolean;
}

export interface Tool<T = any> {
  name: string;
  description: string;
  parameters: {
    type: 'object';
    properties: Record<string, ToolParameter>;
    required?: string[];
  };
  execute: (args: T) => Promise<string> | string;
}

export interface AgentResult {
  agent: string;
  role: string;
  output: string;
  memoriesCreated: MemoryEntry[];
  thoughts?: string;
  executionTimeMs: number;
}

export interface TaskHandoffEvent {
  fromAgent: string;
  toAgent: string;
  taskId: string;
  contextSummary: string;
}

export interface TaskResult {
  taskId: string;
  task: string;
  finalSummary: string;
  agentResults: AgentResult[];
  totalMemoriesCreated: number;
  durationMs: number;
  recalledPriorMemories: MemoryEntry[];
}
