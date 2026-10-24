import {
  ContextPackInput,
  ContextPack,
  Memory,
  RetrievedEvidence,
  SearchResult,
  MemoryKind
} from '$lib/types';
import { getMemories, searchResourcesAndMemories, getChunksByResource } from '$lib/server/db';
import { MEMORY_KIND_LABELS } from '$lib/types';

const DEFAULT_MAX_ITEMS = 20;
const DEFAULT_MAX_CHARS = 8000;

/**
 * Rank memories by relevance to the task
 */
function rankMemories(memories: Memory[], task: string): Memory[] {
  const taskLower = task.toLowerCase();
  const taskWords = taskLower.split(/\s+/).filter(w => w.length > 2);

  return memories.map(memory => {
    let score = 0;
    const searchText = `${memory.title} ${memory.summary} ${memory.content || ''} ${memory.tags.join(' ')}`.toLowerCase();

    // Keyword matches
    for (const word of taskWords) {
      if (searchText.includes(word)) {
        score += 2;
      }
    }

    // Kind priority for different task types
    if (taskLower.includes('bug') || taskLower.includes('fix') || taskLower.includes('error')) {
      if (memory.kind === 'bug_fix') score += 5;
      if (memory.kind === 'lesson') score += 3;
    }
    if (taskLower.includes('decision') || taskLower.includes('architecture') || taskLower.includes('choose')) {
      if (memory.kind === 'decision') score += 5;
      if (memory.kind === 'convention') score += 3;
    }
    if (taskLower.includes('convention') || taskLower.includes('standard') || taskLower.includes('style')) {
      if (memory.kind === 'convention') score += 5;
    }
    if (taskLower.includes('reference') || taskLower.includes('doc') || taskLower.includes('api')) {
      if (memory.kind === 'reference') score += 5;
    }

    return { memory, score };
  })
  .sort((a, b) => b.score - a.score)
  .map(r => r.memory);
}

/**
 * Group memories by kind for organized output
 */
function groupMemoriesByKind(memories: Memory[]): Record<MemoryKind, Memory[]> {
  const groups: Record<MemoryKind, Memory[]> = {
    decision: [],
    bug_fix: [],
    lesson: [],
    convention: [],
    reference: [],
    task_outcome: []
  };

  for (const memory of memories) {
    groups[memory.kind].push(memory);
  }

  return groups;
}

/**
 * Format evidence for context pack
 */
function formatEvidence(evidence: RetrievedEvidence[], maxPerMemory = 3): string {
  if (evidence.length === 0) return 'No supporting evidence found.';

  const grouped = new Map<string, RetrievedEvidence[]>();
  for (const ev of evidence) {
    const key = ev.resourceId;
    if (!grouped.has(key)) grouped.set(key, []);
    grouped.get(key)!.push(ev);
  }

  let output = '';
  let count = 0;

  for (const [resourceId, evs] of grouped) {
    if (count >= maxPerMemory) break;

    const firstEv = evs[0];
    output += `\n### Source: ${firstEv.title} (${resourceId.substring(0, 8)})\n`;
    if (firstEv.sourceUri) {
      output += `**URI:** ${firstEv.sourceUri}\n`;
    }

    for (const ev of evs.slice(0, 2)) {
      output += `\n**Excerpt**${ev.location ? ` (${ev.location})` : ''}:\n`;
      output += '```\n' + ev.excerpt + '\n```\n';
      count++;
      if (count >= maxPerMemory) break;
    }
  }

  return output;
}

/**
 * Identify missing information and conflicts
 */
function analyzeGapsAndConflicts(
  memories: Memory[],
  evidence: RetrievedEvidence[],
  task: string
): { missing: string[]; conflicts: string[] } {
  const missing: string[] = [];
  const conflicts: string[] = [];

  // Check for superseded memories that might conflict
  const superseded = memories.filter(m => m.status === 'superseded');
  if (superseded.length > 0) {
    conflicts.push(`${superseded.length} superseded memory(s) exist - verify current decisions`);
  }

  // Check for suggested (unapproved) memories
  const suggested = memories.filter(m => m.status === 'suggested');
  if (suggested.length > 0) {
    missing.push(`${suggested.length} suggested memory(s) not yet approved - may contain relevant but unverified information`);
  }

  // Check evidence coverage
  const memoriesWithEvidence = memories.filter(m => m.evidence.length > 0);
  if (memoriesWithEvidence.length < memories.length * 0.5) {
    missing.push('Many memories lack direct evidence excerpts - verify source accuracy');
  }

  // Task-specific checks
  const taskLower = task.toLowerCase();
  const hasDecisions = memories.some(m => m.kind === 'decision');
  const hasBugFixes = memories.some(m => m.kind === 'bug_fix');
  const hasConventions = memories.some(m => m.kind === 'convention');

  if (taskLower.includes('implement') && !hasDecisions) {
    missing.push('No prior architectural decisions found for this implementation task');
  }
  if (taskLower.includes('debug') && !hasBugFixes) {
    missing.push('No prior bug fixes found - this may be a new issue');
  }
  if (taskLower.includes('refactor') && !hasConventions) {
    missing.push('No coding conventions found - ensure consistency with team standards');
  }

  return { missing, conflicts };
}

/**
 * Build the context pack markdown
 */
function buildContextMarkdown(
  input: ContextPackInput,
  memories: Memory[],
  evidence: RetrievedEvidence[],
  stats: { totalMemories: number; totalEvidence: number; projectId?: string }
): string {
  const { missing, conflicts } = analyzeGapsAndConflicts(memories, evidence, input.task);
  const grouped = groupMemoriesByKind(memories);
  const now = new Date().toISOString();

  let md = `# Context Pack: ${input.task}\n\n`;
  md += `**Generated:** ${now}\n`;
  if (input.projectId) md += `**Project:** ${input.projectId}\n`;
  md += `**Memories Retrieved:** ${memories.length}\n`;
  md += `**Evidence Sources:** ${evidence.length}\n\n`;

  md += `---\n\n## 1. Task Objective\n\n${input.task}\n\n`;

  md += `## 2. Relevant Project Background\n\n`;
  if (memories.length === 0) {
    md += `No relevant memories found for this task in the selected project scope.\n\n`;
  } else {
    md += `Found ${memories.length} relevant memory record(s) across ${new Set(memories.map(m => m.projectId).filter(Boolean)).size} project(s).\n\n`;
  }

  // Decisions
  if (grouped.decision.length > 0) {
    md += `## 3. Previous Decisions & Solutions\n\n`;
    for (const mem of grouped.decision) {
      md += `### ${mem.title} [${mem.status}]\n`;
      md += `**Summary:** ${mem.summary}\n`;
      if (mem.content) md += `**Details:** ${mem.content}\n`;
      md += `**Tags:** ${mem.tags.join(', ') || 'none'}\n`;
      md += `**Source Resources:** ${mem.sourceResourceIds.join(', ') || 'none'}\n`;
      md += `**Created:** ${mem.createdAt}\n\n`;
    }
  }

  // Bug Fixes
  if (grouped.bug_fix.length > 0) {
    md += `## 4. Related Bug Fixes & Root Causes\n\n`;
    for (const mem of grouped.bug_fix) {
      md += `### ${mem.title} [${mem.status}]\n`;
      md += `**Summary:** ${mem.summary}\n`;
      if (mem.content) md += `**Details:** ${mem.content}\n`;
      md += `**Tags:** ${mem.tags.join(', ') || 'none'}\n`;
      md += `**Source Resources:** ${mem.sourceResourceIds.join(', ') || 'none'}\n`;
      md += `**Created:** ${mem.createdAt}\n\n`;
    }
  }

  // Lessons
  if (grouped.lesson.length > 0) {
    md += `## 5. Lessons Learned & Best Practices\n\n`;
    for (const mem of grouped.lesson) {
      md += `### ${mem.title} [${mem.status}]\n`;
      md += `**Summary:** ${mem.summary}\n`;
      if (mem.content) md += `**Details:** ${mem.content}\n`;
      md += `**Tags:** ${mem.tags.join(', ') || 'none'}\n\n`;
    }
  }

  // Conventions
  if (grouped.convention.length > 0) {
    md += `## 6. Coding Conventions & Constraints\n\n`;
    for (const mem of grouped.convention) {
      md += `### ${mem.title} [${mem.status}]\n`;
      md += `**Summary:** ${mem.summary}\n`;
      if (mem.content) md += `**Details:** ${mem.content}\n`;
      md += `**Tags:** ${mem.tags.join(', ') || 'none'}\n\n`;
    }
  }

  // References
  if (grouped.reference.length > 0) {
    md += `## 7. References & Documentation\n\n`;
    for (const mem of grouped.reference) {
      md += `### ${mem.title} [${mem.status}]\n`;
      md += `**Summary:** ${mem.summary}\n`;
      if (mem.content) md += `**Details:** ${mem.content}\n`;
      md += `**Tags:** ${mem.tags.join(', ') || 'none'}\n\n`;
    }
  }

  // Task Outcomes
  if (grouped.task_outcome.length > 0) {
    md += `## 8. Previous Task Outcomes & Deliverables\n\n`;
    for (const mem of grouped.task_outcome) {
      md += `### ${mem.title} [${mem.status}]\n`;
      md += `**Summary:** ${mem.summary}\n`;
      if (mem.content) md += `**Details:** ${mem.content}\n`;
      md += `**Tags:** ${mem.tags.join(', ') || 'none'}\n\n`;
    }
  }

  // Evidence
  md += `## 9. Supporting Evidence & Sources\n\n`;
  md += formatEvidence(evidence);

  // Verification Steps
  md += `\n## 10. Verification Steps\n\n`;
  md += `1. Review all approved memories for accuracy and currency\n`;
  md += `2. Verify evidence excerpts against original sources\n`;
  md += `3. Check for any superseded memories that may conflict\n`;
  md += `4. Confirm project scope matches the task context\n`;
  md += `5. Validate any code snippets or commands before execution\n\n`;

  // Missing Information
  if (missing.length > 0) {
    md += `## 11. Missing Information & Gaps\n\n`;
    for (const item of missing) {
      md += `- ${item}\n`;
    }
    md += `\n`;
  }

  // Conflicts
  if (conflicts.length > 0) {
    md += `## 12. Conflicts & Warnings\n\n`;
    for (const item of conflicts) {
      md += `- ⚠️ ${item}\n`;
    }
    md += `\n`;
  }

  md += `---\n\n*Generated by Team Brain Context Engine. All memories are evidence-backed and traceable to source resources.*\n`;

  return md;
}

/**
 * Truncate markdown to fit within character budget
 */
function truncateToBudget(markdown: string, maxChars: number): string {
  if (markdown.length <= maxChars) return markdown;

  // Try to truncate at a section boundary
  const sections = markdown.split('\n## ');
  let result = sections[0];

  for (let i = 1; i < sections.length; i++) {
    const section = '## ' + sections[i];
    if (result.length + section.length > maxChars) {
      result += `\n\n[Content truncated to fit within ${maxChars} character budget]`;
      break;
    }
    result += '\n' + section;
  }

  return result;
}

/**
 * Main context pack generation function
 */
export async function buildContextPack(input: ContextPackInput): Promise<ContextPack> {
  const maxItems = input.maxItems ?? DEFAULT_MAX_ITEMS;
  const maxChars = input.maxCharacters ?? DEFAULT_MAX_CHARS;

  // Search for relevant memories and evidence
  const searchResult = await searchResourcesAndMemories(input.task, input.projectId, maxItems);

  // Filter to approved memories by default
  const approvedMemories = searchResult.memories.filter(m => m.status === 'approved');

  // If no approved memories, include suggested ones with warning
  const memoriesToUse = approvedMemories.length > 0 ? approvedMemories : searchResult.memories;

  // Rank by relevance
  const rankedMemories = rankMemories(memoriesToUse, input.task).slice(0, maxItems);

  // Collect evidence for these memories
  const relevantEvidence = searchResult.evidence.filter(ev =>
    rankedMemories.some(m => m.sourceResourceIds.includes(ev.resourceId)) ||
    rankedMemories.some(m => m.evidence.some(e => e.resourceId === ev.resourceId))
  );

  // Build markdown
  let markdown = buildContextMarkdown(input, rankedMemories, relevantEvidence, {
    totalMemories: searchResult.memories.length,
    totalEvidence: searchResult.evidence.length,
    projectId: input.projectId
  });

  // Apply character budget
  markdown = truncateToBudget(markdown, maxChars);

  return {
    title: `Context: ${input.task}`,
    task: input.task,
    markdown,
    includedResourceIds: [...new Set(relevantEvidence.map(e => e.resourceId))],
    includedMemoryIds: rankedMemories.map(m => m.id)
  };
}

/**
 * Simpler search function for the context engine
 */
export async function retrieveTaskContext(input: ContextPackInput): Promise<{
  memories: Memory[];
  evidence: RetrievedEvidence[];
}> {
  const searchResult = await searchResourcesAndMemories(input.task, input.projectId, input.maxItems ?? DEFAULT_MAX_ITEMS);
  const approvedMemories = searchResult.memories.filter(m => m.status === 'approved');
  const memoriesToUse = approvedMemories.length > 0 ? approvedMemories : searchResult.memories;
  const rankedMemories = rankMemories(memoriesToUse, input.task).slice(0, input.maxItems ?? DEFAULT_MAX_ITEMS);

  const relevantEvidence = searchResult.evidence.filter(ev =>
    rankedMemories.some(m => m.sourceResourceIds.includes(ev.resourceId)) ||
    rankedMemories.some(m => m.evidence.some(e => e.resourceId === ev.resourceId))
  );

  return {
    memories: rankedMemories,
    evidence: relevantEvidence
  };
}