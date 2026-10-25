import { Request, Response } from 'express';
import Database from 'better-sqlite3';
import { generateContextPack } from '../../core/contextPacks.js';
import { DEMO_PROJECT_ID } from '../../core/seedData.js';
import { config } from '../../config/index.js';
import { answerQuestionFromRAG } from '../../core/ragChatEngine.js';

/**
 * AnythingLLM & OpenAI-Compatible Chat Proxy:
 * Accepts /v1/chat/completions, transparently queries SharedBrain Context Engine,
 * injects the verified context pack into the system prompt, and returns OpenAI-standard JSON.
 */
export async function handleChatCompletionProxy(
  db: Database.Database,
  req: Request,
  res: Response
): Promise<void> {
  const { messages, model = 'sharedbrain-core', temperature = 0.7, max_tokens = 1000 } = req.body;

  if (!messages || !Array.isArray(messages) || messages.length === 0) {
    res.status(400).json({
      error: {
        message: 'Invalid request: messages array is required',
        type: 'invalid_request_error',
        code: 'missing_messages',
      },
    });
    return;
  }

  // 1. Extract the latest user prompt
  const userMessages = messages.filter((m: any) => m.role === 'user');
  const latestUserMessage = userMessages[userMessages.length - 1];
  const query = latestUserMessage ? latestUserMessage.content : 'General company context';

  // 2. Identify active project ID from auth context or header
  const projectId = req.authContext?.activeProjectId || DEMO_PROJECT_ID;

  // 3. Generate authoritative context pack from SharedBrain Core
  const pack = generateContextPack(db, {
    projectId,
    query,
    budget: 2500,
    actor: 'chat_proxy_agent',
  });

  // 4. Augment system message with the safe fenced context pack
  const systemPrompt = `You are the SharedBrain Team AI Assistant. Answer the user's questions utilizing the authoritative company brain context provided below.

${pack.markdown}

Rules:
1. Adhere strictly to the Decisions, Constraints, and Conventions listed above.
2. If evidence is provided, cite relevant guidelines accurately.
3. Be concise, direct, and professional.`;

  // Check if an OpenAI or compatible API key is configured to proxy upstream
  if (config.openaiApiKey && !config.openaiApiKey.includes('placeholder')) {
    try {
      const upstreamMessages = [
        { role: 'system', content: systemPrompt },
        ...messages.filter((m: any) => m.role !== 'system'),
      ];

      const upstreamResp = await fetch(`${config.openaiBaseUrl}/chat/completions`, {
        method: 'POST',
        headers: {
          'Content-Type': 'application/json',
          Authorization: `Bearer ${config.openaiApiKey}`,
        },
        body: JSON.stringify({
          model: config.openaiModel || 'gpt-4o',
          messages: upstreamMessages,
          temperature,
          max_tokens,
        }),
      });

      if (upstreamResp.ok) {
        const data = await upstreamResp.json();
        res.json(data);
        return;
      }
    } catch {
      // Fall through to deterministic response generator
    }
  }

  // No upstream model: answer from the local knowledge base with citations.
  const rag = await answerQuestionFromRAG(String(query), db);
  const sources = rag.citations.slice(0, 3).map((c, i) => `[${i + 1}] ${c.title} › ${c.heading}`);
  const assistantResponse = sources.length ? `${rag.answer}\n\nSources:\n${sources.join('\n')}` : rag.answer;

  res.json({
    id: `chatcmpl_${pack.id.slice(3)}`,
    object: 'chat.completion',
    created: Math.floor(Date.now() / 1000),
    model,
    choices: [
      {
        index: 0,
        message: {
          role: 'assistant',
          content: assistantResponse,
        },
        finish_reason: 'stop',
      },
    ],
    usage: {
      prompt_tokens: pack.tokens_used,
      completion_tokens: Math.ceil(assistantResponse.length / 4),
      total_tokens: pack.tokens_used + Math.ceil(assistantResponse.length / 4),
    },
    sharedbrain_metadata: {
      pack_id: pack.id,
      selected_count: pack.selected_ids.length,
      insufficient_share: pack.is_insufficient,
    },
  });
}
