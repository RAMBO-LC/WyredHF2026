import { json } from '@sveltejs/kit';
import { getMemories, createMemory, getMemory } from '$lib/server/db';
import { z } from 'zod';
import { ProposeMemoryInput } from '$lib/types';

const CreateMemorySchema = z.object({
  projectId: z.string().uuid().nullable().optional(),
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
  status: z.enum(['suggested', 'approved', 'superseded', 'archived']).default('suggested'),
  supersedesMemoryId: z.string().uuid().nullable().optional()
});

export async function GET({ url }) {
  try {
    const projectId = url.searchParams.get('projectId') || undefined;
    const kind = url.searchParams.get('kind') as any;
    const status = url.searchParams.get('status') as any;
    const memories = getMemories(projectId, kind, status);
    return json({ success: true, data: memories });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const body = await request.json();
    const parsed = CreateMemorySchema.safeParse(body);
    if (!parsed.success) {
      return json({ success: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const memory = createMemory(parsed.data);
    return json({ success: true, data: memory });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}