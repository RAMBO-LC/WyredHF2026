import { json } from '@sveltejs/kit';
import { createResource, getResources, getResource, updateResourceStatus, deleteResource, createChunks, getChunksByResource } from '$lib/server/db';
import { chunkContent } from '$lib/domain/chunking';
import { extractMemories } from '$lib/domain/extraction';
import { createMemory, getMemories } from '$lib/server/db';
import { validateMemoryProposal } from '$lib/domain/validation';
import { z } from 'zod';

const CreateResourceSchema = z.object({
  title: z.string().min(1).max(500),
  projectId: z.string().uuid().nullable().optional(),
  sourceType: z.enum(['file', 'doc', 'web', 'note', 'code']),
  sourceUri: z.string().url().nullable().optional(),
  rawContent: z.string().min(1),
  metadata: z.record(z.unknown()).optional()
});

export async function GET({ url }) {
  try {
    const projectId = url.searchParams.get('projectId') || undefined;
    const status = url.searchParams.get('status') as any;
    const resources = getResources(projectId, status);
    return json({ success: true, data: resources });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const body = await request.json();
    const parsed = CreateResourceSchema.safeParse(body);
    if (!parsed.success) {
      return json({ success: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    // Create resource
    const resource = createResource(parsed.data);

    // Update status to processing
    updateResourceStatus(resource.id, 'processing');

    try {
      // Normalize content (for now, just use raw content as markdown)
      const normalizedMarkdown = parsed.data.rawContent;
      updateResourceStatus(resource.id, 'processing', undefined, normalizedMarkdown);

      // Chunk the content
      const chunks = chunkContent(normalizedMarkdown, resource.id, parsed.data.sourceType);
      const createdChunks = createChunks(chunks);

      // Extract memories (deterministic fallback)
      const proposals = await extractMemories(resource, createdChunks, false);

      // Validate and store memories
      const storedMemories = [];
      for (const proposal of proposals) {
        // Get existing resources, chunks, memories for validation
        const existingResources = new Map();
        const existingChunks = new Map();
        const existingMemories = new Map();

        // We just created this resource and its chunks
        existingResources.set(resource.id, resource);
        for (const chunk of createdChunks) {
          existingChunks.set(chunk.id, chunk);
        }

        // Get existing memories for relationship validation
        const allMemories = getMemories(resource.projectId || undefined);
        for (const mem of allMemories) {
          existingMemories.set(mem.id, mem);
        }

        const validation = validateMemoryProposal(proposal, existingResources, existingChunks, existingMemories);
        if (validation.success && validation.data) {
          const memory = createMemory({
            ...validation.data,
            projectId: resource.projectId,
            status: 'suggested'
          });
          storedMemories.push(memory);
        }
      }

      // Mark resource as completed
      updateResourceStatus(resource.id, 'completed');

      return json({
        success: true,
        data: {
          resource,
          chunks: createdChunks.length,
          memoriesProposed: storedMemories.length,
          memories: storedMemories
        }
      });
    } catch (error) {
      updateResourceStatus(resource.id, 'failed', String(error));
      throw error;
    }
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}