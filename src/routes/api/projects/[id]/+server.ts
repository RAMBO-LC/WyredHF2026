import { json } from '@sveltejs/kit';
import { getProject, updateProject, deleteProject } from '$lib/server/db';
import { z } from 'zod';

const UpdateProjectSchema = z.object({
  name: z.string().min(1).max(200).optional(),
  description: z.string().optional()
});

export async function GET({ params }) {
  try {
    const project = getProject(params.id);
    if (!project) {
      return json({ success: false, error: 'Project not found' }, { status: 404 });
    }
    return json({ success: true, data: project });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function PUT({ params, request }) {
  try {
    const body = await request.json();
    const parsed = UpdateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return json({ success: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const project = getProject(params.id);
    if (!project) {
      return json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    updateProject(params.id, parsed.data.name ?? project.name, parsed.data.description ?? project.description);
    const updated = getProject(params.id);
    return json({ success: true, data: updated });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function DELETE({ params }) {
  try {
    const project = getProject(params.id);
    if (!project) {
      return json({ success: false, error: 'Project not found' }, { status: 404 });
    }

    deleteProject(params.id);
    return json({ success: true, message: 'Project deleted' });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}