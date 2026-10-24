import { json } from '@sveltejs/kit';
import { createProject, getProjects, getProject, updateProject, deleteProject } from '$lib/server/db';
import { z } from 'zod';

const CreateProjectSchema = z.object({
  name: z.string().min(1).max(200),
  description: z.string().optional()
});

const UpdateProjectSchema = CreateProjectSchema.partial();

export async function GET() {
  try {
    const projects = getProjects();
    return json({ success: true, data: projects });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}

export async function POST({ request }) {
  try {
    const body = await request.json();
    const parsed = CreateProjectSchema.safeParse(body);
    if (!parsed.success) {
      return json({ success: false, error: parsed.error.flatten().fieldErrors }, { status: 400 });
    }

    const project = createProject(parsed.data.name, parsed.data.description);
    return json({ success: true, data: project });
  } catch (error) {
    return json({ success: false, error: String(error) }, { status: 500 });
  }
}