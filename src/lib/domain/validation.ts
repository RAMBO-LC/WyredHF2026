import { z } from 'zod';
import {
  MemoryKind,
  MemoryStatus,
  RelationType,
  MemoryEvidence,
  ProposeMemoryInput,
  Memory,
  Chunk,
  Resource
} from '$lib/types';

// ============================================
// Runtime Schemas for LLM Output Validation
// ============================================

export const LLMMemoryProposalSchema = z.object({
  title: z.string().min(1).max(500),
  kind: z.enum(['decision', 'bug_fix', 'lesson', 'convention', 'reference', 'task_outcome']),
  summary: z.string().min(1),
  content: z.string().optional(),
  tags: z.array(z.string()).default([]),
  sourceResourceIds: z.array(z.string().uuid()).default([]),
  evidence: z.array(z.object({
    resourceId: z.string().uuid(),
    chunkId: z.string().uuid().optional(),
    excerpt: z.string().optional(),
    location: z.string().optional()
  })).default([]),
  proposedRelationships: z.array(z.object({
    toMemoryId: z.string().uuid(),
    type: z.enum(['related_to', 'depends_on', 'fixes', 'derived_from', 'supersedes']),
    evidenceResourceIds: z.array(z.string().uuid()).default([])
  })).default([])
});

export type LLMMemoryProposal = z.infer<typeof LLMMemoryProposalSchema>;

// ============================================
// Validation Functions
// ============================================

export interface ValidationResult<T> {
  success: boolean;
  data?: T;
  errors: string[];
}

/**
 * Validate an LLM memory proposal against schema and referential integrity
 */
export function validateMemoryProposal(
  proposal: unknown,
  existingResources: Map<string, Resource>,
  existingChunks: Map<string, Chunk>,
  existingMemories: Map<string, Memory>
): ValidationResult<LLMMemoryProposal> {
  const errors: string[] = [];

  // Schema validation
  const parseResult = LLMMemoryProposalSchema.safeParse(proposal);
  if (!parseResult.success) {
    for (const issue of parseResult.error.issues) {
      errors.push(`${issue.path.join('.')}: ${issue.message}`);
    }
    return { success: false, errors };
  }

  const data = parseResult.data;

  // Validate resource IDs exist
  for (const resourceId of data.sourceResourceIds) {
    if (!existingResources.has(resourceId)) {
      errors.push(`sourceResourceIds: Resource ${resourceId} does not exist`);
    }
  }

  // Validate evidence references
  for (let i = 0; i < data.evidence.length; i++) {
    const ev = data.evidence[i];
    if (!existingResources.has(ev.resourceId)) {
      errors.push(`evidence[${i}].resourceId: Resource ${ev.resourceId} does not exist`);
    }
    if (ev.chunkId && !existingChunks.has(ev.chunkId)) {
      errors.push(`evidence[${i}].chunkId: Chunk ${ev.chunkId} does not exist`);
    }
    // Verify excerpt actually exists in the chunk if chunkId provided
    if (ev.chunkId && ev.excerpt) {
      const chunk = existingChunks.get(ev.chunkId);
      if (chunk && !chunk.content.includes(ev.excerpt)) {
        errors.push(`evidence[${i}].excerpt: Excerpt not found in referenced chunk`);
      }
    }
  }

  // Validate proposed relationships
  for (let i = 0; i < data.proposedRelationships.length; i++) {
    const rel = data.proposedRelationships[i];
    if (!existingMemories.has(rel.toMemoryId)) {
      errors.push(`proposedRelationships[${i}].toMemoryId: Memory ${rel.toMemoryId} does not exist`);
    }
    for (const resId of rel.evidenceResourceIds) {
      if (!existingResources.has(resId)) {
        errors.push(`proposedRelationships[${i}].evidenceResourceIds: Resource ${resId} does not exist`);
      }
    }
  }

  // Must have at least one evidence link
  if (data.evidence.length === 0 && data.sourceResourceIds.length === 0) {
    errors.push('At least one evidence link or source resource ID is required');
  }

  if (errors.length > 0) {
    return { success: false, errors };
  }

  return { success: true, data };
}

/**
 * Validate memory status transition
 */
export function validateStatusTransition(currentStatus: MemoryStatus, newStatus: MemoryStatus): ValidationResult<void> {
  const errors: string[] = [];
  const validTransitions: Record<MemoryStatus, MemoryStatus[]> = {
    suggested: ['approved', 'archived'],
    approved: ['superseded', 'archived'],
    superseded: ['archived'],
    archived: []
  };

  if (!validTransitions[currentStatus].includes(newStatus)) {
    errors.push(`Invalid status transition: ${currentStatus} -> ${newStatus}`);
  }

  return errors.length > 0 ? { success: false, errors } : { success: true };
}

/**
 * Validate relationship type
 */
export function validateRelationshipType(type: string): type is RelationType {
  return ['related_to', 'depends_on', 'fixes', 'derived_from', 'supersedes'].includes(type);
}

/**
 * Validate memory kind
 */
export function validateMemoryKind(kind: string): kind is MemoryKind {
  return ['decision', 'bug_fix', 'lesson', 'convention', 'reference', 'task_outcome'].includes(kind);
}

/**
 * Sanitize and validate excerpt - ensure it's a real substring
 */
export function validateExcerpt(chunkContent: string, excerpt: string, maxLength = 1000): string {
  if (!excerpt) return '';
  const trimmed = excerpt.trim();
  if (chunkContent.includes(trimmed)) {
    return trimmed.length > maxLength ? trimmed.substring(0, maxLength) + '...' : trimmed;
  }
  // If excerpt not found, try to find a similar substring
  const words = trimmed.split(' ').filter(w => w.length > 3);
  for (const word of words) {
    const idx = chunkContent.toLowerCase().indexOf(word.toLowerCase());
    if (idx !== -1) {
      const start = Math.max(0, idx - 100);
      const end = Math.min(chunkContent.length, idx + word.length + 100);
      return '...' + chunkContent.slice(start, end) + '...';
    }
  }
  return '';
}