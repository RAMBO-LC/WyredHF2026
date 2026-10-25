import Database from 'better-sqlite3';
import OpenAI from 'openai';
import { getCoreDatabase } from './db.js';
import { config } from '../config/index.js';

export interface RAGSearchMatch {
  id: string;
  title: string;
  heading: string;
  content: string;
  score: number;
  sourceDoc?: string;
  doc_id?: string;
}

export interface RAGCitation {
  chunkId: string;
  title: string;
  heading: string;
  excerpt: string;
  doc_id: string;
}

export interface RAGContext {
  query: string;
  terms: string[];
  chunks: RAGSearchMatch[];
  memories: any[];
  documents: any[];
  /** Fraction (0..1) of distinct query terms found in the retrieved passages. */
  coverage: number;
  inDomain: boolean;
  retrievalMs: number;
}

export interface RAGAnswerResult {
  answer: string;
  isGrounded: boolean;
  refused: boolean;
  isRefusal: boolean;
  groundingModel: string;
  modelUsed: string;
  /** Fraction (0..1) of answer terms that also appear in the retrieved context. */
  groundingScore: number;
  coverage: number;
  timings: { retrievalMs: number; generationMs: number };
  citations: RAGCitation[];
  recalledChunks: RAGSearchMatch[];
  recalledMemories: any[];
  sourceDocuments: string[];
}

export interface LLMProviderInfo {
  provider: 'openai-compatible' | 'gemini' | 'local';
  model: string;
  baseUrl?: string;
}

const STOP_WORDS = new Set([
  'what', 'is', 'the', 'a', 'an', 'in', 'of', 'to', 'for', 'on', 'with', 'at', 'by', 'from',
  'and', 'or', 'as', 'are', 'was', 'were', 'be', 'been', 'being', 'have', 'has', 'had',
  'do', 'does', 'did', 'but', 'if', 'then', 'else', 'when', 'where', 'why', 'how', 'all',
  'any', 'both', 'each', 'few', 'more', 'most', 'other', 'some', 'such', 'no', 'nor',
  'not', 'only', 'own', 'same', 'so', 'than', 'too', 'very', 's', 't', 'can', 'will',
  'just', 'don', 'should', 'now', 'tell', 'me', 'about', 'explain', 'give', 'list', 'please',
  'would', 'could', 'which', 'there', 'their', 'they', 'our', 'out', 'up', 'down', 'into',
  'we', 'us', 'you', 'your', 'it', 'its', 'this', 'that', 'these', 'those', 'i', 'my',
  'work', 'works', 'use', 'used', 'using', 'get', 'between', 'describe', 'show', 'summarize',
]);

const MIN_COVERAGE = 0.5;

/** Lowercases, splits on non-alphanumerics, drops stop words and applies a light plural stem. */
export function tokenize(text: string): string[] {
  return text
    .toLowerCase()
    .split(/[^a-z0-9]+/)
    .filter((w) => w.length > 1 && !STOP_WORDS.has(w))
    .map((w) => (w.length > 4 && w.endsWith('s') && !w.endsWith('ss') ? w.slice(0, -1) : w));
}

interface Passage {
  id: string;
  title: string;
  heading: string;
  content: string;
  docId: string;
  tokens: string[];
}

/** Splits a markdown document into heading-delimited sections. */
function splitIntoSections(content: string): { heading: string; body: string }[] {
  const sections: { heading: string; body: string }[] = [];
  let heading = 'Overview';
  let buf: string[] = [];
  const flush = () => {
    const body = buf.join('\n').trim();
    if (body) sections.push({ heading, body });
    buf = [];
  };
  for (const line of content.split('\n')) {
    const m = line.match(/^#{1,4}\s+(.*)$/);
    if (m) {
      flush();
      heading = m[1].trim();
    } else {
      buf.push(line);
    }
  }
  flush();
  return sections;
}

function cleanTitle(title: string): string {
  return title.replace(/\.md$/i, '').replace(/_/g, ' ');
}

function loadPassages(db: Database.Database): Passage[] {
  const passages: Passage[] = [];
  const seen = new Set<string>();
  const add = (p: Omit<Passage, 'tokens'>) => {
    const key = p.content.replace(/\s+/g, ' ').slice(0, 120).toLowerCase();
    if (seen.has(key)) return;
    seen.add(key);
    // Title and heading are weighted by repeating their tokens.
    const meta = tokenize(`${p.title} ${p.heading}`);
    passages.push({ ...p, tokens: [...tokenize(p.content), ...meta, ...meta] });
  };

  const docs = db.prepare('SELECT id, title, content FROM documents').all() as any[];
  for (const d of docs) {
    for (const s of splitIntoSections(d.content || '')) {
      add({ id: `${d.id}#${s.heading}`, title: cleanTitle(d.title), heading: s.heading, content: s.body, docId: d.id });
    }
  }

  const chunks = db.prepare(`
    SELECT c.id, c.heading_path AS heading, c.content, c.resource_id, r.title
    FROM chunks c JOIN resources r ON c.resource_id = r.id
  `).all() as any[];
  for (const c of chunks) {
    add({ id: c.id, title: cleanTitle(c.title), heading: c.heading || 'Overview', content: c.content, docId: c.resource_id });
  }
  return passages;
}

/** Okapi BM25 over a small in-memory corpus. */
function bm25Rank<T extends { tokens: string[] }>(items: T[], terms: string[]): { item: T; score: number }[] {
  if (items.length === 0 || terms.length === 0) return [];
  const k1 = 1.2;
  const b = 0.75;
  const avgLen = items.reduce((s, it) => s + it.tokens.length, 0) / items.length || 1;
  const df = new Map<string, number>();
  const tfs = items.map((it) => {
    const tf = new Map<string, number>();
    for (const t of it.tokens) tf.set(t, (tf.get(t) || 0) + 1);
    for (const t of new Set(terms)) if (tf.has(t)) df.set(t, (df.get(t) || 0) + 1);
    return tf;
  });
  const N = items.length;
  return items
    .map((item, i) => {
      let score = 0;
      for (const t of new Set(terms)) {
        const f = tfs[i].get(t) || 0;
        if (!f) continue;
        const idf = Math.log(1 + (N - (df.get(t) || 0) + 0.5) / ((df.get(t) || 0) + 0.5));
        score += idf * ((f * (k1 + 1)) / (f + k1 * (1 - b + (b * item.tokens.length) / avgLen)));
      }
      return { item, score };
    })
    .filter((r) => r.score > 0)
    .sort((a, b2) => b2.score - a.score);
}

/**
 * Retrieves the most relevant passages and distilled memories for a query and decides
 * whether the knowledge base actually covers it.
 */
export function retrieveContext(query: string, dbInstance?: Database.Database, limit: number = 6): RAGContext {
  const started = performance.now();
  const db = dbInstance || getCoreDatabase(config.databasePath);
  const terms = Array.from(new Set(tokenize(query)));

  const empty: RAGContext = { query, terms, chunks: [], memories: [], documents: [], coverage: 0, inDomain: false, retrievalMs: 0 };
  if (terms.length === 0) {
    return { ...empty, retrievalMs: performance.now() - started };
  }

  const ranked = bm25Rank(loadPassages(db), terms).slice(0, limit);
  const chunks: RAGSearchMatch[] = ranked.map(({ item, score }) => ({
    id: item.id,
    title: item.title,
    heading: item.heading,
    content: item.content,
    score: Number(score.toFixed(3)),
    sourceDoc: item.title,
    doc_id: item.docId,
  }));

  const memRows = db.prepare(`
    SELECT id, kind, statement, subject_key, status
    FROM memories WHERE status NOT IN ('rejected', 'superseded')
  `).all() as any[];
  const memories = bm25Rank(
    memRows.map((m) => ({ ...m, tokens: tokenize(`${m.statement} ${m.subject_key}`) })),
    terms
  )
    .filter(({ item }, i, all) => {
      // The same document ingested twice yields identical memories; keep the first.
      const key = item.statement.trim().toLowerCase();
      return all.findIndex((x) => x.item.statement.trim().toLowerCase() === key) === i;
    })
    .slice(0, 4)
    .map(({ item, score }) => {
      const { tokens, ...rest } = item;
      return { ...rest, statement: String(rest.statement).replace(/^\s*(\d+[.)]|[-*+])\s+/, ''), score: Number(score.toFixed(3)) };
    });

  const matched = new Set<string>();
  for (const r of ranked) for (const t of r.item.tokens) if (terms.includes(t)) matched.add(t);
  const coverage = matched.size / terms.length;

  const docIds = Array.from(new Set(chunks.map((c) => c.doc_id)));
  const documents = docIds.slice(0, 4).map((id) => ({ id, title: chunks.find((c) => c.doc_id === id)?.title }));

  return {
    query,
    terms,
    chunks,
    memories,
    documents,
    coverage,
    inDomain: chunks.length > 0 && coverage >= MIN_COVERAGE,
    retrievalMs: performance.now() - started,
  };
}

/** Backwards-compatible wrapper used by older callers. */
export function searchRAGKnowledge(query: string, dbInstance?: Database.Database, limit: number = 6) {
  const ctx = retrieveContext(query, dbInstance, limit);
  return { chunks: ctx.chunks, memories: ctx.memories, documents: ctx.documents };
}

export function isQueryInRAGDomain(query: string, _matches?: unknown, dbInstance?: Database.Database): boolean {
  return retrieveContext(query, dbInstance).inDomain;
}

/** Reports which LLM backend will be used for answer generation, based on environment. */
export function getLLMProviderInfo(): LLMProviderInfo {
  if (process.env.USE_MOCK_LLM !== 'true' && config.openaiApiKey?.trim()) {
    return { provider: 'openai-compatible', model: config.openaiModel, baseUrl: config.openaiBaseUrl };
  }
  const gemini = process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY;
  if (process.env.USE_MOCK_LLM !== 'true' && gemini?.trim()) {
    return { provider: 'gemini', model: process.env.GEMINI_MODEL || 'gemini-2.5-flash' };
  }
  return { provider: 'local', model: 'extractive' };
}

const NOT_FOUND_TOKEN = 'NOT_IN_KNOWLEDGE_BASE';

const SYSTEM_PROMPT = `You answer questions using only the numbered excerpts from the user's knowledge base.
- Use only facts stated in the excerpts. Do not add outside knowledge.
- Cite excerpts inline as [1], [2] matching their numbers.
- Be concise. Prefer short paragraphs and bullet lists. Use Markdown.
- If the excerpts do not contain the answer, reply with exactly: ${NOT_FOUND_TOKEN}`;

async function callOpenAICompatible(query: string, contextText: string, info: LLMProviderInfo): Promise<string> {
  const client = new OpenAI({ apiKey: config.openaiApiKey, baseURL: info.baseUrl });
  const res = await client.chat.completions.create({
    model: info.model,
    temperature: 0.1,
    max_tokens: 900,
    messages: [
      { role: 'system', content: SYSTEM_PROMPT },
      { role: 'user', content: `Excerpts:\n\n${contextText}\n\nQuestion: ${query}` },
    ],
  });
  const text = res.choices[0]?.message?.content?.trim();
  if (!text) throw new Error('LLM returned an empty response');
  return text;
}

async function callGemini(query: string, contextText: string, info: LLMProviderInfo): Promise<string> {
  const apiKey = (process.env.GEMINI_API_KEY || process.env.GOOGLE_API_KEY || '').trim();
  const url = `https://generativelanguage.googleapis.com/v1beta/models/${info.model}:generateContent`;
  const res = await fetch(url, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', 'x-goog-api-key': apiKey },
    body: JSON.stringify({
      systemInstruction: { parts: [{ text: SYSTEM_PROMPT }] },
      contents: [{ role: 'user', parts: [{ text: `Excerpts:\n\n${contextText}\n\nQuestion: ${query}` }] }],
      generationConfig: { temperature: 0.1, maxOutputTokens: 900 },
    }),
  });
  if (!res.ok) {
    throw new Error(`Gemini API error (${res.status}): ${await res.text()}`);
  }
  const data = (await res.json()) as any;
  const text = data.candidates?.[0]?.content?.parts?.[0]?.text;
  if (!text) throw new Error('Gemini API returned an empty response');
  return text.trim();
}

/** Picks the lines of a passage that mention query terms, keeping short passages whole. */
function extractRelevant(content: string, terms: string[], maxLines = 8): string {
  const trimmed = content.trim();
  if (trimmed.length <= 700) return trimmed;
  const lines = trimmed.split('\n').filter((l) => l.trim());
  const hits = lines.filter((l) => tokenize(l).some((t) => terms.includes(t)));
  return (hits.length ? hits : lines).slice(0, maxLines).join('\n');
}

function synthesizeLocally(ctx: RAGContext): string {
  const parts: string[] = ['Here is what the knowledge base says:\n'];
  ctx.chunks.slice(0, 3).forEach((c, i) => {
    parts.push(`**${c.title} › ${c.heading}** [${i + 1}]\n\n${extractRelevant(c.content, ctx.terms)}\n`);
  });
  if (ctx.memories.length > 0) {
    parts.push('**Related memories**\n');
    for (const m of ctx.memories) parts.push(`- ${m.statement} _(${m.kind})_`);
  }
  return parts.join('\n');
}

/** Share of the answer's content terms that also appear in the retrieved context. */
function groundingScore(answer: string, ctx: RAGContext): number {
  const contextTokens = new Set<string>();
  for (const c of ctx.chunks) for (const t of tokenize(`${c.title} ${c.heading} ${c.content}`)) contextTokens.add(t);
  for (const m of ctx.memories) for (const t of tokenize(m.statement)) contextTokens.add(t);
  const answerTokens = tokenize(answer.replace(/\[\d+\]/g, '')).filter((t) => !/^\d+$/.test(t));
  if (answerTokens.length === 0) return 1;
  const supported = answerTokens.filter((t) => contextTokens.has(t)).length;
  return supported / answerTokens.length;
}

function buildRefusal(db: Database.Database, ctx: RAGContext): string {
  const suggestions = db
    .prepare('SELECT title FROM documents ORDER BY pinned DESC, updated_at DESC LIMIT 6')
    .all() as any[];
  const lines = [
    "I couldn't find this in the knowledge base, so I won't guess.",
    '',
    ctx.terms.length
      ? `None of the indexed documents cover enough of: ${ctx.terms.map((t) => `\`${t}\``).join(', ')}.`
      : 'Try asking a more specific question.',
  ];
  if (suggestions.length) {
    lines.push('', 'Some topics that are covered:');
    for (const s of suggestions) lines.push(`- ${cleanTitle(s.title)}`);
  }
  lines.push('', 'You can add documents from the **Knowledge** page or drop files into the ingest folder.');
  return lines.join('\n');
}

/** Turns retrieved context into a grounded answer, using an LLM when one is configured. */
export async function generateAnswer(ctx: RAGContext, dbInstance?: Database.Database): Promise<RAGAnswerResult> {
  const db = dbInstance || getCoreDatabase(config.databasePath);
  const started = performance.now();
  const base = {
    isGrounded: true,
    coverage: ctx.coverage,
    recalledChunks: ctx.chunks,
    recalledMemories: ctx.memories,
  };

  if (!ctx.inDomain) {
    return {
      ...base,
      answer: buildRefusal(db, ctx),
      refused: true,
      isRefusal: true,
      groundingModel: 'guardrail',
      modelUsed: 'guardrail',
      groundingScore: 1,
      timings: { retrievalMs: ctx.retrievalMs, generationMs: performance.now() - started },
      citations: [],
      sourceDocuments: [],
    };
  }

  const citations: RAGCitation[] = ctx.chunks.map((c) => ({
    chunkId: c.id,
    title: c.title,
    heading: c.heading,
    excerpt: c.content.replace(/\s+/g, ' ').slice(0, 220),
    doc_id: c.doc_id || c.id,
  }));
  const sourceDocuments = Array.from(new Set(ctx.chunks.map((c) => c.title)));

  const contextText = [
    ...ctx.chunks.map((c, i) => `[${i + 1}] ${c.title} › ${c.heading}\n${c.content}`),
    ...ctx.memories.map((m) => `[memory · ${m.kind}] ${m.statement}`),
  ].join('\n\n');

  const info = getLLMProviderInfo();
  let answer: string | null = null;
  let modelUsed = 'local-extractive';

  if (info.provider !== 'local') {
    try {
      answer = info.provider === 'gemini'
        ? await callGemini(ctx.query, contextText, info)
        : await callOpenAICompatible(ctx.query, contextText, info);
      modelUsed = info.model;
    } catch (err: any) {
      console.warn(`[RAG] ${info.provider} call failed, using local synthesizer: ${err.message}`);
    }
  }

  if (answer && answer.includes(NOT_FOUND_TOKEN)) {
    return {
      ...base,
      answer: buildRefusal(db, ctx),
      refused: true,
      isRefusal: true,
      groundingModel: modelUsed,
      modelUsed,
      groundingScore: 1,
      timings: { retrievalMs: ctx.retrievalMs, generationMs: performance.now() - started },
      citations: [],
      sourceDocuments: [],
    };
  }

  if (!answer) answer = synthesizeLocally(ctx);

  return {
    ...base,
    answer,
    refused: false,
    isRefusal: false,
    groundingModel: modelUsed,
    modelUsed,
    groundingScore: groundingScore(answer, ctx),
    timings: { retrievalMs: ctx.retrievalMs, generationMs: performance.now() - started },
    citations,
    sourceDocuments,
  };
}

/**
 * Answers a question strictly from the local knowledge base.
 * Refuses when retrieved passages don't cover the question.
 */
export async function answerQuestionFromRAG(query: string, dbInstance?: Database.Database): Promise<RAGAnswerResult> {
  const db = dbInstance || getCoreDatabase(config.databasePath);
  return generateAnswer(retrieveContext(query, db), db);
}
