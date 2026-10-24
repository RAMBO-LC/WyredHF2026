import { MemoryKind, ProposeMemoryInput, MemoryEvidence, Chunk, Resource } from '$lib/types';
import { chunkMarkdown, chunkPlainText, extractHeadings } from './chunking';

/**
 * Deterministic memory extraction using pattern matching and heuristics
 * This is the fallback when no LLM is available
 */

// Patterns for detecting different memory types
const DECISION_PATTERNS = [
  /decided to\s+/i,
  /decision:\s*/i,
  /we (will|should|must) use\s+/i,
  /architecture decision/i,
  /adr\s*\d*/i,
  /technical decision/i,
  /chosen approach/i,
  /selected\s+\w+/i
];

const BUG_FIX_PATTERNS = [
  /bug\s*fix/i,
  /fixed\s+(?:the\s+)?(?:issue|bug|problem)/i,
  /root cause/i,
  /regression/i,
  /resolved\s+(?:the\s+)?(?:issue|bug)/i,
  /patch/i,
  /hotfix/i,
  /workaround/i
];

const LESSON_PATTERNS = [
  /lesson\s*(?:learned)?/i,
  /learned\s+that/i,
  /best practice/i,
  /recommend(?:ation|ed)/i,
  /should avoid/i,
  /gotcha/i,
  /pitfall/i,
  /takeaway/i,
  /key insight/i
];

const CONVENTION_PATTERNS = [
  /convention/i,
  /naming\s+(?:convention|rule)/i,
  /style\s+guide/i,
  /coding\s+standard/i,
  /must\s+(?:always|never)/i,
  /required\s+to/i,
  /enforce\s+/i,
  /rule:\s*/i
];

const REFERENCE_PATTERNS = [
  /reference/i,
  /documentation/i,
  /see\s+(?:also|:)/i,
  /link:\s*/i,
  /url:\s*/i,
  /https?:\/\//i,
  /spec:\s*/i
];

const TASK_OUTCOME_PATTERNS = [
  /completed/i,
  /delivered/i,
  /finished/i,
  /outcome/i,
  /result/i,
  /summary/i,
  /accomplished/i,
  /implemented/i
];

interface PatternMatch {
  kind: MemoryKind;
  score: number;
  matchedText: string;
}

/**
 * Score content against memory kind patterns
 */
function scoreContent(content: string): PatternMatch[] {
  const patterns: Array<{ kind: MemoryKind; patterns: RegExp[] }> = [
    { kind: 'decision', patterns: DECISION_PATTERNS },
    { kind: 'bug_fix', patterns: BUG_FIX_PATTERNS },
    { kind: 'lesson', patterns: LESSON_PATTERNS },
    { kind: 'convention', patterns: CONVENTION_PATTERNS },
    { kind: 'reference', patterns: REFERENCE_PATTERNS },
    { kind: 'task_outcome', patterns: TASK_OUTCOME_PATTERNS }
  ];

  const results: PatternMatch[] = [];

  for (const { kind, patterns } of patterns) {
    let score = 0;
    let matchedText = '';
    for (const pattern of patterns) {
      const match = content.match(pattern);
      if (match) {
        score += 1;
        matchedText = match[0];
      }
    }
    if (score > 0) {
      results.push({ kind, score, matchedText });
    }
  }

  return results.sort((a, b) => b.score - a.score);
}

/**
 * Extract a title from content (first heading or first sentence)
 */
function extractTitle(content: string, maxLength = 100): string {
  const headingMatch = content.match(/^#{1,6}\s+(.+)$/m);
  if (headingMatch) {
    return headingMatch[1].trim().substring(0, maxLength);
  }

  const sentenceMatch = content.match(/^[^.!?]+[.!?]/);
  if (sentenceMatch) {
    return sentenceMatch[0].trim().substring(0, maxLength);
  }

  return content.trim().substring(0, maxLength);
}

/**
 * Extract summary from content (first paragraph or first few sentences)
 */
function extractSummary(content: string, maxLength = 300): string {
  // Remove markdown headings
  const withoutHeadings = content.replace(/^#{1,6}\s+.+$/gm, '').trim();

  // Get first paragraph
  const paragraphs = withoutHeadings.split('\n\n').filter(p => p.trim().length > 0);
  if (paragraphs.length > 0) {
    const firstPara = paragraphs[0].trim();
    if (firstPara.length <= maxLength) return firstPara;
    return firstPara.substring(0, maxLength).trim() + '...';
  }

  // Fallback: first few sentences
  const sentences = withoutHeadings.match(/[^.!?]+[.!?]/g);
  if (sentences && sentences.length > 0) {
    let summary = '';
    for (const s of sentences) {
      if (summary.length + s.length > maxLength) break;
      summary += s + ' ';
    }
    return summary.trim();
  }

  return withoutHeadings.substring(0, maxLength).trim() + '...';
}

/**
 * Extract tags from content
 */
function extractTags(content: string): string[] {
  const tags: string[] = [];
  const lowerContent = content.toLowerCase();

  // Technology tags
  const techTags = ['typescript', 'javascript', 'python', 'rust', 'go', 'react', 'svelte', 'vue', 'node', 'sql', 'postgres', 'sqlite', 'docker', 'kubernetes', 'aws', 'gcp', 'azure', 'api', 'rest', 'graphql', 'websocket', 'auth', 'oauth', 'jwt', 'testing', 'jest', 'vitest', 'ci', 'cd', 'github', 'gitlab'];
  for (const tag of techTags) {
    if (lowerContent.includes(tag)) tags.push(tag);
  }

  // Concept tags
  const conceptTags = ['performance', 'security', 'architecture', 'database', 'cache', 'queue', 'event', 'message', 'stream', 'batch', 'realtime', 'sync', 'async', 'migration', 'deployment', 'monitoring', 'logging', 'observability'];
  for (const tag of conceptTags) {
    if (lowerContent.includes(tag)) tags.push(tag);
  }

  return [...new Set(tags)].slice(0, 10);
}

/**
 * Find relevant excerpt from chunks for a given memory kind
 */
function findRelevantExcerpt(chunks: Chunk[], kind: MemoryKind, patterns: RegExp[]): { chunkId: string; excerpt: string; location: string } | null {
  for (const chunk of chunks) {
    for (const pattern of patterns) {
      const match = chunk.content.match(pattern);
      if (match) {
        const start = Math.max(0, match.index! - 100);
        const end = Math.min(chunk.content.length, match.index! + match[0].length + 200);
        return {
          chunkId: chunk.id,
          excerpt: chunk.content.slice(start, end).trim(),
          location: `Chunk ${chunk.chunkIndex + 1}${chunk.metadata.heading ? ` (${chunk.metadata.heading.text})` : ''}`
        };
      }
    }
  }
  return null;
}

/**
 * Deterministic memory proposal from a resource and its chunks
 */
export function proposeMemoriesDeterministic(
  resource: Resource,
  chunks: Chunk[]
): ProposeMemoryInput[] {
  const proposals: ProposeMemoryInput[] = [];
  const fullContent = resource.normalizedMarkdown || resource.rawContent;

  // Score the content
  const scores = scoreContent(fullContent);

  // If no patterns match, create a generic reference memory
  if (scores.length === 0) {
    const firstChunk = chunks[0];
    proposals.push({
      title: extractTitle(fullContent),
      kind: 'reference',
      summary: extractSummary(fullContent),
      content: fullContent.length > 5000 ? fullContent.substring(0, 5000) + '...' : fullContent,
      tags: extractTags(fullContent),
      sourceResourceIds: [resource.id],
      evidence: firstChunk ? [{
        resourceId: resource.id,
        chunkId: firstChunk.id,
        excerpt: firstChunk.content.substring(0, 500),
        location: 'Chunk 1'
      }] : [{
        resourceId: resource.id,
        excerpt: fullContent.substring(0, 500),
        location: 'Full content'
      }],
      proposedRelationships: []
    });
    return proposals;
  }

  // Create a proposal for each detected kind (top 2)
  for (const score of scores.slice(0, 2)) {
    const kind = score.kind;
    let patterns: RegExp[];

    switch (kind) {
      case 'decision': patterns = DECISION_PATTERNS; break;
      case 'bug_fix': patterns = BUG_FIX_PATTERNS; break;
      case 'lesson': patterns = LESSON_PATTERNS; break;
      case 'convention': patterns = CONVENTION_PATTERNS; break;
      case 'reference': patterns = REFERENCE_PATTERNS; break;
      case 'task_outcome': patterns = TASK_OUTCOME_PATTERNS; break;
    }

    const evidence = findRelevantExcerpt(chunks, kind, patterns);

    proposals.push({
      title: extractTitle(fullContent),
      kind,
      summary: extractSummary(fullContent),
      content: fullContent.length > 5000 ? fullContent.substring(0, 5000) + '...' : fullContent,
      tags: extractTags(fullContent),
      sourceResourceIds: [resource.id],
      evidence: evidence ? [evidence] : [{
        resourceId: resource.id,
        chunkId: chunks[0]?.id,
        excerpt: chunks[0]?.content.substring(0, 500) || fullContent.substring(0, 500),
        location: chunks[0] ? 'Chunk 1' : 'Full content'
      }],
      proposedRelationships: []
    });
  }

  return proposals;
}

/**
 * LLM-based memory extraction interface
 * This will be implemented when LLM provider is available
 */
export interface LLMExtractor {
  extractMemories(resource: Resource, chunks: Chunk[]): Promise<ProposeMemoryInput[]>;
}

/**
 * No-op LLM extractor for when no LLM is configured
 */
export class NoopLLMExtractor implements LLMExtractor {
  async extractMemories(): Promise<ProposeMemoryInput[]> {
    return [];
  }
}

/**
 * Factory to get the appropriate extractor
 */
export function getExtractor(useLLM = false): LLMExtractor {
  if (useLLM) {
    // TODO: Implement actual LLM extractor when provider is available
    return new NoopLLMExtractor();
  }
  return new NoopLLMExtractor();
}

/**
 * Main extraction function - tries deterministic first, then LLM if enabled
 */
export async function extractMemories(
  resource: Resource,
  chunks: Chunk[],
  useLLM = false
): Promise<ProposeMemoryInput[]> {
  // Always run deterministic extraction first
  const deterministicProposals = proposeMemoriesDeterministic(resource, chunks);

  if (!useLLM) {
    return deterministicProposals;
  }

  // If LLM is enabled, run it and merge results
  const extractor = getExtractor(true);
  const llmProposals = await extractor.extractMemories(resource, chunks);

  // Merge, preferring LLM proposals but keeping deterministic as fallback
  const merged = [...llmProposals];
  for (const det of deterministicProposals) {
    // Check if LLM already proposed similar kind for this resource
    const hasSimilar = llmProposals.some(llm =>
      llm.kind === det.kind &&
      llm.sourceResourceIds.includes(resource.id)
    );
    if (!hasSimilar) {
      merged.push(det);
    }
  }

  return merged;
}