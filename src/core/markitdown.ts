import Database from 'better-sqlite3';
import { generatePrefixedId, sha256 } from './invariants.js';

export interface ChunkInfo {
  headingPath: string;
  content: string;
  startOffset: number;
  endOffset: number;
}

/**
 * MarkItDown Document Ingestion Adapter:
 * Parses Markdown documents into hierarchical heading-aware chunks with exact offsets
 */
export function chunkMarkdownContent(markdownText: string): ChunkInfo[] {
  const lines = markdownText.split('\n');
  const chunks: ChunkInfo[] = [];

  let currentHeading = 'Document Body';
  let currentContentLines: string[] = [];
  let chunkStartOffset = 0;
  let runningOffset = 0;

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const headingMatch = line.match(/^(#{1,6})\s+(.+)$/);

    if (headingMatch) {
      // Flush existing chunk if it contains content
      if (currentContentLines.length > 0) {
        const text = currentContentLines.join('\n').trim();
        if (text.length > 0) {
          chunks.push({
            headingPath: currentHeading,
            content: text,
            startOffset: chunkStartOffset,
            endOffset: runningOffset - 1,
          });
        }
      }

      currentHeading = headingMatch[2].trim();
      currentContentLines = [];
      chunkStartOffset = runningOffset;
    } else {
      currentContentLines.push(line);
    }

    runningOffset += line.length + 1; // +1 for the newline
  }

  // Flush final chunk
  if (currentContentLines.length > 0) {
    const text = currentContentLines.join('\n').trim();
    if (text.length > 0) {
      chunks.push({
        headingPath: currentHeading,
        content: text,
        startOffset: chunkStartOffset,
        endOffset: markdownText.length,
      });
    }
  }

  // Fallback if no sections were split
  if (chunks.length === 0 && markdownText.trim().length > 0) {
    chunks.push({
      headingPath: 'Full Document',
      content: markdownText.trim(),
      startOffset: 0,
      endOffset: markdownText.length,
    });
  }

  return chunks;
}

/**
 * Ingests a complete Markdown document into the resources and chunks tables
 */
export function ingestMarkdownDocument(
  db: Database.Database,
  projectId: string,
  title: string,
  locator: string,
  content: string
): { resourceId: string; chunks: { id: string; heading: string; hash: string }[] } {
  const resourceId = generatePrefixedId('res');
  const contentHash = sha256(content);

  const insertResource = db.prepare(`
    INSERT INTO resources (id, project_id, title, locator, content_hash, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  insertResource.run(
    resourceId,
    projectId,
    title,
    locator,
    contentHash,
    content,
    new Date().toISOString()
  );

  const chunkList = chunkMarkdownContent(content);
  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, project_id, resource_id, heading_path, content, content_hash, start_offset, end_offset, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createdChunks = chunkList.map((chk) => {
    const chunkId = generatePrefixedId('chk');
    const chkHash = sha256(chk.content);
    insertChunk.run(
      chunkId,
      projectId,
      resourceId,
      chk.headingPath,
      chk.content,
      chkHash,
      chk.startOffset,
      chk.endOffset,
      new Date().toISOString()
    );
    return {
      id: chunkId,
      heading: chk.headingPath,
      hash: chkHash,
    };
  });

  return {
    resourceId,
    chunks: createdChunks,
  };
}
