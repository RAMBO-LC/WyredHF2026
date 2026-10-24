import { json } from '@sveltejs/kit';
import { getResource, getChunksByResource, deleteResource, updateResourceStatus } from '$lib/server/db';
import { chunkContent } from '$lib/domain/chunking';
import { extractMemories } from '$lib/domain/extraction';
import { createMemory, getMemories } from '$lib/server/db';
import { validateMemoryProposal } from '$lib/domain/validation';

export async function GET({ params }) {
  try {
    const resource = getResource(params.id);
    if (!resource) {
      return json({ success: false, error: 'Resource not found' }, { status: 404 });
    }

    const chunks = getChunksByResource(params.id);
    return json({ success: true, data: { resource, chunks } });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST({ params, request }) {
  try {
    const body = await request.json();
    const action = body.action;

    const resource = getResource(params.id);
    if (!resource) {
      return json({ success: false, error: 'Resource not found' }, { status: 404 });
    }

    if (action === 'reprocess') {
      // Reset status and reprocess
      updateResourceStatus(params.id, 'processing', undefined, resource.normalizedMarkdown || resource.rawContent);

      const chunks = chunkContent(resource.normalizedMarkdown || resource.rawContent, resource.id, resource.sourceType);
      const createdChunks = createChunks(chunks);

      const proposals = await extractMemories(resource, createdChunks, false);

      const storedMemories = [];
      for (const proposal of proposals) {
        const existingResources = new Map();
        const existingChunks = new Map();
        const existingMemories = new Map();

        existingResources.set(resource.id, resource);
        for (const chunk of createdChunks) {
          existingChunks.set(chunk.id, chunk);
        }

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

      updateResourceStatus(params.id, 'completed');

      return json({
        success: true,
        data: {
          chunks: createdChunks.length,
          memoriesProposed: storedMemories.length,
          memories: storedMemories
        }
      });
    }

    return json({ success: false, error: 'Invalid action' }, { status: 400 });
  } catch (error) {
    updateResourceStatus(params.id, 'failed', String(error));
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE({ params }) {
  try {
    const resource = getResource(params.id);
    if (!resource) {
      return json({ success: false, error: 'Resource not found' }, { status: 404 });
    }

    deleteResource(params.id);
    return json({ success: true, message: 'Resource deleted' });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}