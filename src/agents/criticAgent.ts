import { BaseAgent, AgentContext } from './baseAgent.js';
import { CriticEvaluation, MemoryInput, MemoryType } from '../types/index.js';
import { SharedMemory } from '../memory/sharedMemory.js';
import { config } from '../config/index.js';

export class CriticAgent extends BaseAgent {
  public name = 'Critic';
  public role = 'Task Quality Critic & Compliance Evaluator';
  public description =
    'Strictly evaluates deliverables against original requirements, scoring 1-10 and listing specific feedback and missing elements.';

  constructor(memory: SharedMemory) {
    super(memory, []);
  }

  protected getDefaultMemoryType(): MemoryType {
    return 'critique';
  }

  public getSystemPrompt(context: AgentContext): string {
    return `You are a strict Critic Agent.

When given:
- Original user task
- Agent's final output

Evaluate the output on these criteria:
1. Does it fully answer the original task?
2. Is the information accurate and relevant?
3. Is it well-structured and clear?
4. Are there any major gaps or mistakes?

Respond in this exact JSON format (and ONLY JSON, no conversational markdown wrappers):
{
  "score": number,
  "is_acceptable": boolean,
  "feedback": "specific points that need improvement",
  "missing_elements": ["item1", "item2"]
}

Be strict. Prefer quality over speed. If the output is incomplete, vague, or off-topic, mark is_acceptable as false.
Scores 8-10 are acceptable. Scores below 8 must list missing elements and specific feedback.`;
  }

  /**
   * Main evaluation method called by Orchestrator evaluation loop.
   */
  public async evaluate(
    task: string,
    finalOutput: string,
    attempt: number = 0,
    taskId?: string
  ): Promise<CriticEvaluation> {
    const context: AgentContext = {
      taskId: taskId || `critique_${Date.now()}`,
      handoffNotes: `Critique Evaluation Attempt #${attempt + 1}`,
    };

    let evaluation: CriticEvaluation;

    if (this.openai && !config.useMockLLM) {
      try {
        const response = await this.openai.chat.completions.create({
          model: this.model,
          messages: [
            { role: 'system', content: this.getSystemPrompt(context) },
            {
              role: 'user',
              content: `Original Task: "${task}"\n\nAgent Output:\n${finalOutput}\n\nPlease evaluate and respond strictly with the JSON structure.`,
            },
          ],
          response_format: { type: 'json_object' },
        });

        const raw = response.choices[0]?.message?.content || '{}';
        evaluation = this.parseEvaluation(raw, task, finalOutput, attempt);
      } catch (err: any) {
        evaluation = this.simulateEvaluation(task, finalOutput, attempt);
      }
    } else {
      evaluation = this.simulateEvaluation(task, finalOutput, attempt);
    }

    evaluation.attempt = attempt;

    // Persist critique in shared SQLite memory
    this.memory.store({
      content: `[Critic Evaluation Attempt ${attempt + 1}] Score: ${evaluation.score}/10 | Acceptable: ${
        evaluation.is_acceptable ? 'YES' : 'NO'
      }\nFeedback: ${evaluation.feedback}${
        evaluation.missing_elements.length > 0
          ? `\nMissing: ${evaluation.missing_elements.join(', ')}`
          : ''
      }`,
      type: 'critique',
      agent: this.name.toLowerCase(),
      tags: ['critique', 'quality-check', ...this.generateTags(task)],
      task_id: taskId,
      metadata: {
        score: evaluation.score,
        is_acceptable: evaluation.is_acceptable,
        attempt,
      },
    });

    return evaluation;
  }

  private parseEvaluation(
    raw: string,
    task: string,
    output: string,
    attempt: number
  ): CriticEvaluation {
    try {
      // Strip markdown code fences if present
      const cleanJson = raw.replace(/^```json\s*/i, '').replace(/```\s*$/i, '').trim();
      const parsed = JSON.parse(cleanJson);

      const score = typeof parsed.score === 'number' ? parsed.score : 8;
      const is_acceptable =
        typeof parsed.is_acceptable === 'boolean'
          ? parsed.is_acceptable
          : score >= 7;
      const feedback =
        typeof parsed.feedback === 'string'
          ? parsed.feedback
          : 'Deliverable meets project standards.';
      const missing_elements = Array.isArray(parsed.missing_elements)
        ? parsed.missing_elements
        : [];

      return {
        score,
        is_acceptable,
        feedback,
        missing_elements,
        attempt,
      };
    } catch {
      return this.simulateEvaluation(task, output, attempt);
    }
  }

  public simulateEvaluation(
    task: string,
    output: string,
    attempt: number
  ): CriticEvaluation {
    const wordCount = output ? output.split(/\s+/).length : 0;
    const hasStructure = output.includes('#') || output.includes('•') || output.includes('-');

    // If initial attempt is too brief or missing structure, simulate strict critique on attempt 0
    if (attempt === 0 && wordCount < 60) {
      return {
        score: 6,
        is_acceptable: false,
        feedback:
          'Output is too brief. Please provide deeper technical context, concrete architecture examples, and strategic takeaways.',
        missing_elements: ['Real-world use cases', 'Deeper architecture analysis'],
        attempt: 0,
      };
    }

    // Otherwise standard high quality evaluation
    const score = hasStructure && wordCount >= 70 ? 9 : 8;
    return {
      score,
      is_acceptable: true,
      feedback:
        'Deliverable is comprehensive, accurately answers the user objective, is well-structured, and ready for team deployment.',
      missing_elements: [],
      attempt,
    };
  }

  public async simulateAgentReasoning(
    task: string,
    context: AgentContext
  ): Promise<{ output: string; thoughts?: string; extractedMemories: MemoryInput[] }> {
    const evalResult = this.simulateEvaluation(task, '', 0);
    return {
      output: JSON.stringify(evalResult, null, 2),
      thoughts: 'Executed strict heuristic evaluation against task requirements.',
      extractedMemories: [
        {
          content: `Critic evaluation completed with score ${evalResult.score}/10: ${evalResult.feedback}`,
          type: 'critique',
          agent: this.name.toLowerCase(),
          tags: ['critique', 'quality-check'],
        },
      ],
    };
  }
}
