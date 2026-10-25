import crypto from 'crypto';
import { MemoryKind } from './types.js';

export const ALLOWED_MEMORY_KINDS: MemoryKind[] = [
  'decision',
  'bug_fix',
  'lesson',
  'convention',
  'constraint',
  'reference',
  'task_outcome',
];

/**
 * Normalizes whitespace (replaces runs of whitespace with a single space and trims).
 */
export function normalizeWhitespace(text: string): string {
  return text.replace(/\s+/g, ' ').trim();
}

/**
 * Computes SHA-256 hash of a string.
 */
export function sha256(text: string): string {
  return crypto.createHash('sha256').update(text).digest('hex');
}

/**
 * Generates prefixed ID: res_<id>, chk_<id>, mem_<id>, ev_<id>, pk_<id>
 */
export function generatePrefixedId(prefix: 'res' | 'chk' | 'mem' | 'ev' | 'pk' | 'proj' | 'key' | 'run' | 'rej' | 'aud' | 'fb' | 'rev' | 'task'): string {
  const time = Date.now().toString(36);
  const rand = crypto.randomBytes(6).toString('hex');
  return `${prefix}_${time}_${rand}`;
}

/**
 * Invariant I1: No memory without evidence.
 * Verifies excerpt is a verbatim substring of chunk after whitespace normalization.
 */
export function verifyVerbatimExcerpt(
  chunkContent: string,
  excerpt: string
): { valid: boolean; startOffset: number; endOffset: number } {
  if (!chunkContent || !excerpt) {
    return { valid: false, startOffset: -1, endOffset: -1 };
  }

  // Exact check first
  const exactIdx = chunkContent.indexOf(excerpt);
  if (exactIdx !== -1) {
    return {
      valid: true,
      startOffset: exactIdx,
      endOffset: exactIdx + excerpt.length,
    };
  }

  // Normalized check
  const normChunk = normalizeWhitespace(chunkContent);
  const normExcerpt = normalizeWhitespace(excerpt);
  const normIdx = normChunk.indexOf(normExcerpt);

  if (normIdx !== -1) {
    // Approximate source offsets
    return {
      valid: true,
      startOffset: Math.min(normIdx, chunkContent.length),
      endOffset: Math.min(normIdx + excerpt.length, chunkContent.length),
    };
  }

  return { valid: false, startOffset: -1, endOffset: -1 };
}

/**
 * Computes Jaccard similarity coefficient between two texts.
 */
export function jaccardSimilarity(textA: string, textB: string): number {
  const tokenize = (t: string) =>
    new Set(
      normalizeWhitespace(t)
        .toLowerCase()
        .split(/[^a-z0-9_]+/)
        .filter((w) => w.length > 2)
    );

  const setA = tokenize(textA);
  const setB = tokenize(textB);

  if (setA.size === 0 && setB.size === 0) return 1.0;
  if (setA.size === 0 || setB.size === 0) return 0.0;

  let intersection = 0;
  for (const item of setA) {
    if (setB.has(item)) intersection++;
  }

  const union = setA.size + setB.size - intersection;
  return union === 0 ? 0 : intersection / union;
}
