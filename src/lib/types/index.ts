import { z } from 'zod';
import { v4 as uuidv4 } from 'uuid';

// ============================================
// Core Enums
// ============================================

export const MemoryKindSchema = z.enum([
  'decision',
  'bug_fix',
  'lesson',
  'convention',
  'reference',
  'task_outcome'
]);

export type MemoryKind = z.infer<typeof MemoryKindSchema>;

export const MemoryStatusSchema = z.enum([
  'suggested',
  'approved',
  'superseded',
  'archived'
]);

export type MemoryStatus = z.infer<typeof MemoryStatusSchema>;

export const ResourceSourceTypeSchema = z.enum([
  'file',
  'doc',
  'web',
  'note',
  'code'
]);

export type ResourceSourceType = z.infer<typeof ResourceSourceTypeSchema>;

export const ProcessingStatusSchema = z.enum([
  'pending',
  'processing',
  'completed',
  'failed'
]);

export type ProcessingStatus = z.infer<typeof ProcessingStatusSchema>;

export const RelationTypeSchema = z.enum([
  'related_to',
  'depends_on',
  'fixes',
  'derived_from',
  'supersedes'
]);

export type RelationType = z.infer<typeof RelationTypeSchema>;

export const RelationStatusSchema = z.enum([
  'suggested',
  'approved'
]);

export type RelationStatus = z.infer<typeof RelationStatusSchema>;

// ============================================
// Resource Schemas
// ============================================

export const ResourceSchema = z.object({
  id: z.string().uuid(),
  title: z.string().min(1).max(500),
  projectId: z.string().uuid().nullable(),
  sourceType: ResourceSourceTypeSchema,
  sourceUri: z.string().url().nullable().optional(),
  rawContent: z.string(),
  normalizedMarkdown: z.string().nullable(),
  metadata: z.record(z.unknown()).default({}),
  processingStatus: ProcessingStatusSchema.default('pending'),
  errorMessage: z.string().nullable().optional(),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime()
});

export type Resource = z.infer<typeof ResourceSchema>;

export const CreateResourceSchema = ResourceSchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true,
  normalizedMarkdown: true,
  processingStatus: true,
  errorMessage: true
}).extend({
  projectId: z.string().uuid().nullable().optional()
});

export type CreateResourceInput = z.infer<typeof CreateResourceSchema>;

// ============================================
// Chunk Schemas
// ============================================

export const ChunkSchema = z.object({
  id: z.string().uuid(),
  resourceId: z.string().uuid(),
  chunkIndex: z.number().int().nonnegative(),
  content: z.string(),
  tokenCount: z.number().int().nonnegative(),
  metadata: z.record(z.unknown()).default({}),
  createdAt: z.string().datetime()
});

export type Chunk = z.infer<typeof ChunkSchema>;

// ============================================
// Memory Schemas
// ============================================

export const MemoryEvidenceSchema = z.object({
  resourceId: z.string().uuid(),
  chunkId: z.string().uuid().optional(),
  excerpt: z.string().optional(),
  location: z.string().optional()
});

export type MemoryEvidence = z.infer<typeof MemoryEvidenceSchema>;

export const MemorySchema = z.object({
  id: z.string().uuid(),
  projectId: z.string().uuid().nullable(),
  title: z.string().min(1).max(500),
  kind: MemoryKindSchema,
  summary: z.string(),
  content: z.string().optional(),
  tags: z.array(z.string()).default([]),
  sourceResourceIds: z.array(z.string().uuid()).default([]),
  evidence: z.array(MemoryEvidenceSchema).default([]),
  status: MemoryStatusSchema.default('suggested'),
  createdAt: z.string().datetime(),
  updatedAt: z.string().datetime(),
  supersedesMemoryId: z.string().uuid().nullable().optional()
});

export type Memory = z.infer<typeof MemorySchema>;

export const CreateMemorySchema = MemorySchema.omit({
  id: true,
  createdAt: true,
  updatedAt: true
});

export type CreateMemoryInput = z.infer<typeof CreateMemorySchema>;

export const ProposeMemorySchema = z.object({
  title: z.string().min(1).max(500),
  kind: MemoryKindSchema,
  summary: z.string(),
  content: z.string().optional(),
  tags: z.array(z.string()).default([]),
  sourceResourceIds: z.array(z.string().uuid()).default([]),
  evidence: z.array(MemoryEvidenceSchema).default([]),
  proposedRelationships: z.array(z.object({
    toMemoryId: z.string().uuid(),
    type: RelationTypeSchema,
    evidenceResourceIds: z.array(z.string().uuid()).default([])
  })).default([])
});

export type ProposeMemoryInput = z.infer<typeof ProposeMemorySchema>;

// ============================================
// Memory Relationship Schemas
// ============================================

export const MemoryRelationshipSchema = z.object({
  id: z.string().uuid(),
  fromMemoryId: z.string().uuid(),
  toMemoryId: z.string().uuid(),
  type: RelationTypeSchema,
  evidenceResourceIds: z.array(z.string().uuid()).default([]),
  status: RelationStatusSchema.default('suggested'),
  createdAt: z.string().datetime()
});

export type MemoryRelationship = z.infer<typeof MemoryRelationshipSchema>;

// ============================================
// Search & Retrieval
// ============================================

export const RetrievedEvidenceSchema = z.object({
  resourceId: z.string().uuid(),
  chunkId: z.string().uuid().optional(),
  title: z.string(),
  excerpt: z.string(),
  sourceUri: z.string().url().nullable().optional(),
  location: z.string().optional(),
  score: z.number().optional()
});

export type RetrievedEvidence = z.infer<typeof RetrievedEvidenceSchema>;

export const SearchResultSchema = z.object({
  memories: z.array(MemorySchema),
  evidence: z.array(RetrievedEvidenceSchema)
});

export type SearchResult = z.infer<typeof SearchResultSchema>;

// ============================================
// Context Pack
// ============================================

export const ContextPackInputSchema = z.object({
  task: z.string().min(1),
  projectId: z.string().uuid().nullable().optional(),
  maxItems: z.number().int().positive().default(20),
  maxCharacters: z.number().int().positive().default(8000)
});

export type ContextPackInput = z.infer<typeof ContextPackInputSchema>;

export const ContextPackSchema = z.object({
  title: z.string(),
  task: z.string(),
  markdown: z.string(),
  includedResourceIds: z.array(z.string().uuid()),
  includedMemoryIds: z.array(z.string().uuid())
});

export type ContextPack = z.infer<typeof ContextPackSchema>;

// ============================================
// API Response Types
// ============================================

export const ApiResponseSchema = <T extends z.ZodTypeAny>(dataSchema: T) =>
  z.object({
    success: z.boolean(),
    data: dataSchema.optional(),
    error: z.string().optional(),
    message: z.string().optional()
  });

export type ApiResponse<T> = {
  success: boolean;
  data?: T;
  error?: string;
  message?: string;
};

// ============================================
// Helper Functions
// ============================================

export function generateId(): string {
  return uuidv4();
}

export function nowISO(): string {
  return new Date().toISOString();
}

// Memory kind labels for UI
export const MEMORY_KIND_LABELS: Record<MemoryKind, string> = {
  decision: 'Decision',
  bug_fix: 'Bug Fix',
  lesson: 'Lesson',
  convention: 'Convention',
  reference: 'Reference',
  task_outcome: 'Task Outcome'
};

// Memory status labels for UI
export const MEMORY_STATUS_LABELS: Record<MemoryStatus, string> = {
  suggested: 'Suggested',
  approved: 'Approved',
  superseded: 'Superseded',
  archived: 'Archived'
};

// Memory status colors for UI
export const MEMORY_STATUS_COLORS: Record<MemoryStatus, string> = {
  suggested: 'bg-yellow-100 text-yellow-800',
  approved: 'bg-green-100 text-green-800',
  superseded: 'bg-orange-100 text-orange-800',
  archived: 'bg-gray-100 text-gray-800'
};

// Relation type labels
export const RELATION_TYPE_LABELS: Record<RelationType, string> = {
  related_to: 'Related To',
  depends_on: 'Depends On',
  fixes: 'Fixes',
  derived_from: 'Derived From',
  supersedes: 'Supersedes'
};