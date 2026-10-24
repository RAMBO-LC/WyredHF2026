import { Chunk, MemoryKind } from '$lib/types';

/**
 * Deterministic heading-aware Markdown chunking
 * Preserves heading hierarchy and code blocks
 */
export interface ChunkingOptions {
  maxTokens?: number;
  overlapTokens?: number;
  preserveCodeBlocks?: boolean;
}

export interface HeadingInfo {
  level: number;
  text: string;
  startIndex: number;
}

const DEFAULT_MAX_TOKENS = 500;
const DEFAULT_OVERLAP_TOKENS = 50;

/**
 * Rough token estimation: ~4 characters per token for English text
 */
export function estimateTokens(text: string): number {
  return Math.ceil(text.length / 4);
}

/**
 * Extract heading structure from Markdown
 */
export function extractHeadings(markdown: string): HeadingInfo[] {
  const headings: HeadingInfo[] = [];
  const lines = markdown.split('\n');

  let charIndex = 0;
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const match = line.match(/^(#{1,6})\s+(.+)$/);
    if (match) {
      headings.push({
        level: match[1].length,
        text: match[2].trim(),
        startIndex: charIndex
      });
    }
    charIndex += line.length + 1; // +1 for newline
  }

  return headings;
}

/**
 * Find the containing heading for a given character position
 */
export function getContainingHeading(headings: HeadingInfo[], position: number): HeadingInfo | null {
  let current: HeadingInfo | null = null;
  for (const heading of headings) {
    if (heading.startIndex <= position) {
      current = heading;
    } else {
      break;
    }
  }
  return current;
}

/**
 * Split markdown into chunks respecting headings and code blocks
 */
export function chunkMarkdown(
  markdown: string,
  resourceId: string,
  options: ChunkingOptions = {}
): Omit<Chunk, 'id' | 'createdAt'>[] {
  const maxTokens = options.maxTokens ?? DEFAULT_MAX_TOKENS;
  const overlapTokens = options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS;
  const preserveCodeBlocks = options.preserveCodeBlocks ?? true;

  const headings = extractHeadings(markdown);
  const chunks: Omit<Chunk, 'id' | 'createdAt'>[] = [];

  // If no headings, fall back to simple sliding window
  if (headings.length === 0) {
    return chunkBySlidingWindow(markdown, resourceId, maxTokens, overlapTokens);
  }

  let currentChunk = '';
  let currentChunkStart = 0;
  let chunkIndex = 0;
  let currentHeading: HeadingInfo | null = null;

  const lines = markdown.split('\n');
  let charIndex = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const lineWithNewline = line + '\n';
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Check if adding this heading would exceed max tokens
      const prospectiveChunk = currentChunk + lineWithNewline;
      if (estimateTokens(prospectiveChunk) > maxTokens && currentChunk.length > 0) {
        // Save current chunk
        chunks.push(createChunk(
          currentChunk.trim(),
          resourceId,
          chunkIndex++,
          currentChunkStart,
          currentHeading
        ));

        // Start new chunk with overlap from previous chunk
        const overlapText = getOverlapText(currentChunk, overlapTokens);
        currentChunk = overlapText + lineWithNewline;
        currentChunkStart = charIndex - overlapText.length;
        currentHeading = getContainingHeading(headings, currentChunkStart);
      } else {
        currentChunk += lineWithNewline;
      }
    } else {
      currentChunk += lineWithNewline;
    }

    charIndex += lineWithNewline.length;
  }

  // Don't forget the last chunk
  if (currentChunk.trim().length > 0) {
    chunks.push(createChunk(
      currentChunk.trim(),
      resourceId,
      chunkIndex,
      currentChunkStart,
      currentHeading
    ));
  }

  return chunks;
}

/**
 * Sliding window chunking for plain text or markdown without headings
 */
function chunkBySlidingWindow(
  text: string,
  resourceId: string,
  maxTokens: number,
  overlapTokens: number
): Omit<Chunk, 'id' | 'createdAt'>[] {
  const chunks: Omit<Chunk, 'id' | 'createdAt'>[] = [];
  const maxChars = maxTokens * 4;
  const overlapChars = overlapTokens * 4;

  let start = 0;
  let chunkIndex = 0;

  while (start < text.length) {
    const end = Math.min(start + maxChars, text.length);
    let chunkText = text.slice(start, end);

    // Try to break at a sentence boundary
    if (end < text.length) {
      const lastPeriod = chunkText.lastIndexOf('. ');
      const lastNewline = chunkText.lastIndexOf('\n');
      const breakPoint = Math.max(lastPeriod, lastNewline);
      if (breakPoint > maxChars * 0.5) {
        chunkText = chunkText.slice(0, breakPoint + 1);
      }
    }

    chunks.push({
      resourceId,
      chunkIndex: chunkIndex++,
      content: chunkText.trim(),
      tokenCount: estimateTokens(chunkText),
      metadata: {
        startChar: start,
        endChar: start + chunkText.length
      }
    });

    start += chunkText.length - overlapChars;
    if (start < 0) start = 0;
  }

  return chunks;
}

function createChunk(
  content: string,
  resourceId: string,
  chunkIndex: number,
  startChar: number,
  heading: HeadingInfo | null
): Omit<Chunk, 'id' | 'createdAt'> {
  return {
    resourceId,
    chunkIndex,
    content,
    tokenCount: estimateTokens(content),
    metadata: {
      startChar,
      endChar: startChar + content.length,
      heading: heading ? { level: heading.level, text: heading.text } : null
    }
  };
}

function getOverlapText(text: string, overlapTokens: number): string {
  const overlapChars = overlapTokens * 4;
  if (text.length <= overlapChars) return text;

  // Try to get overlap from a sentence boundary
  const overlapStart = text.length - overlapChars;
  const periodIndex = text.indexOf('. ', overlapStart);
  if (periodIndex !== -1 && periodIndex < text.length - 2) {
    return text.slice(periodIndex + 2);
  }
  return text.slice(overlapStart);
}

/**
 * Chunk plain text (non-markdown)
 */
export function chunkPlainText(
  text: string,
  resourceId: string,
  options: ChunkingOptions = {}
): Omit<Chunk, 'id' | 'createdAt'>[] {
  return chunkBySlidingWindow(
    text,
    resourceId,
    options.maxTokens ?? DEFAULT_MAX_TOKENS,
    options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS
  );
}

/**
 * Auto-detect content type and chunk appropriately
 */
export function chunkContent(
  content: string,
  resourceId: string,
  sourceType: string,
  options: ChunkingOptions = {}
): Omit<Chunk, 'id' | 'createdAt'>[] {
  if (sourceType === 'code') {
    // For code, use larger chunks to preserve function/class context
    return chunkBySlidingWindow(content, resourceId, (options.maxTokens ?? DEFAULT_MAX_TOKENS) * 2, options.overlapTokens ?? DEFAULT_OVERLAP_TOKENS);
  }
  if (sourceType === 'file' || sourceType === 'doc' || sourceType === 'note') {
    // Check if it looks like markdown
    if (content.includes('# ') || content.includes('## ') || content.match(/^#{1,6}\s/m)) {
      return chunkMarkdown(content, resourceId, options);
    }
    return chunkPlainText(content, resourceId, options);
  }
  return chunkPlainText(content, resourceId, options);
}