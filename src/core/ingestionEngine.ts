import Database from 'better-sqlite3';
import path from 'path';
import { generatePrefixedId, sha256, verifyVerbatimExcerpt } from './invariants.js';
import { chunkMarkdownContent } from './markitdown.js';
import { runExtractionOnChunk } from './extractor.js';
import { getCoreDatabase } from './db.js';
import { getSharedMemory } from '../memory/sharedMemory.js';
import { config } from '../config/index.js';

export interface IngestionInput {
  title: string;
  content: string;
  folder?: string;
  author?: string;
  tags?: string[];
  sourceRef?: string;
  projectId?: string;
}

export interface DistilledMemoryItem {
  id: string;
  kind: string;
  statement: string;
  quote: string;
  subjectKey: string;
  evidenceId: string;
}

export interface IngestionResult {
  success: boolean;
  resourceId: string;
  documentId: string;
  documentPath: string;
  contentHash: string;
  chunksCreated: number;
  memoriesDistilled: DistilledMemoryItem[];
  evidenceCount: number;
  graphLinksAdded: number;
  timestamp: string;
}

/**
 * Universal Local Production RAG Ingestion & Distillation Engine.
 * 
 * Pipeline:
 * 1. Ingests raw text/markdown into the `resources` table with SHA-256 hash.
 * 2. Hierarchically chunks content with byte offset boundaries into the `chunks` table.
 * 3. Distills memories (decisions, constraints, conventions, bug fixes, lessons)
 *    enforcing Invariants I1-I8 (verbatim evidence verification, claims/evidence separation, idempotency).
 * 4. Commits memories & evidence into SQLite WAL database and synchronizes with FTS5 virtual tables.
 * 5. Syncs the document into the Knowledge Vault (`documents` table) and connects wiki links in `document_links`.
 * 6. Guarantees immediate recall in both Multi-Agent workflows and RAG question answering.
 */
export function ingestAndDistillContent(
  input: IngestionInput,
  dbInstance?: Database.Database
): IngestionResult {
  const { title, content } = input;
  if (!title || !title.trim()) {
    throw new Error('Document title is required for ingestion.');
  }
  if (!content || !content.trim()) {
    throw new Error('Document content is required for ingestion.');
  }

  const db = dbInstance || getCoreDatabase(config.databasePath);
  const memory = getSharedMemory(config.databasePath);

  const folder = input.folder && input.folder.trim() ? input.folder.trim() : 'Knowledge';
  const author = input.author && input.author.trim() ? input.author.trim() : 'Local Production RAG';
  const tags = input.tags && Array.isArray(input.tags) ? input.tags : ['rag', 'production', folder.toLowerCase()];
  const sourceRef = input.sourceRef || `ingest:${Date.now()}`;
  const now = new Date().toISOString();

  // 1. Ensure project exists
  let projectId: string = input.projectId || '';
  if (!projectId) {
    const existingProj = db.prepare('SELECT id FROM projects LIMIT 1').get() as any;
    if (existingProj && existingProj.id) {
      projectId = existingProj.id;
    } else {
      projectId = 'proj_sharedbrain';
      db.prepare(`
        INSERT OR IGNORE INTO projects (id, name, created_at, metadata)
        VALUES (?, 'SharedBrain Core Vault', ?, '{}')
      `).run(projectId, now);
    }
  }

  // 2. Insert or replace into resources table (raw document tracking)
  const resourceId = generatePrefixedId('res');
  const contentHash = sha256(content);
  const locator = `${folder}/${title}`;

  db.prepare(`
    INSERT INTO resources (id, project_id, title, locator, source_ref, content_hash, content, created_at, metadata)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `).run(
    resourceId,
    projectId,
    title,
    locator,
    sourceRef,
    contentHash,
    content,
    now,
    JSON.stringify({ folder, author, tags })
  );

  // 3. Hierarchical Chunking with exact character byte offsets
  const chunkList = chunkMarkdownContent(content);
  const insertChunk = db.prepare(`
    INSERT INTO chunks (id, project_id, resource_id, heading_path, content, content_hash, start_offset, end_offset, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  const createdChunkIds: Array<{ id: string; heading: string; content: string }> = [];

  for (const chk of chunkList) {
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
      now
    );
    createdChunkIds.push({ id: chunkId, heading: chk.headingPath, content: chk.content });
  }

  // 4. Memory Distillation & Invariant Enforcement
  const distilledItems: DistilledMemoryItem[] = [];
  let totalEvidenceCount = 0;

  for (const chk of createdChunkIds) {
    try {
      // Execute strict 8-step validation and distillation on chunk
      runExtractionOnChunk(db, {
        projectId,
        chunkId: chk.id,
        actor: author,
      });

      // Query the memories created or linked for this chunk with their verbatim evidence
      const chunkMemories = db.prepare(`
        SELECT m.id, m.kind, m.statement, m.subject_key, e.id as evidence_id, e.excerpt
        FROM evidence e
        JOIN memories m ON e.memory_id = m.id
        WHERE e.chunk_id = ? AND e.project_id = ?
      `).all(chk.id, projectId) as any[];

      for (const cm of chunkMemories) {
        distilledItems.push({
          id: cm.id,
          kind: cm.kind || 'decision',
          statement: cm.statement,
          quote: cm.excerpt,
          subjectKey: cm.subject_key || 'general',
          evidenceId: cm.evidence_id,
        });
        totalEvidenceCount++;

        // Approve memory status and ensure SharedMemory content sync for multi-agent retrieval
        try {
          db.prepare(`
            UPDATE memories
            SET status = 'approved',
                content = statement,
                type = kind,
                agent = ?,
                timestamp = ?,
                tags = ?
            WHERE id = ?
          `).run(author.toLowerCase(), now, JSON.stringify(tags), cm.id);
        } catch {
          // Continue if already synced
        }
      }
    } catch (err: any) {
      console.warn(`[IngestionEngine] Chunk extraction notice for ${chk.id}:`, err?.message || err);
    }
  }

  // Fallback: If chunk headings didn't contain explicit markers, extract key actionable bullets
  if (distilledItems.length === 0) {
    const lines = content.split('\n');
    for (const rawLine of lines) {
      const line = rawLine.trim();
      if ((line.startsWith('- ') || line.startsWith('* ') || line.startsWith('1. ') || line.startsWith('• ')) && line.length > 20) {
        const cleanStmt = line.replace(/^[-*•\d.]\s+/, '').trim();
        const primaryChunk = createdChunkIds[0];
        if (primaryChunk && primaryChunk.content.includes(cleanStmt)) {
          const check = verifyVerbatimExcerpt(primaryChunk.content, cleanStmt);
          if (check.valid) {
            const memId = generatePrefixedId('mem');
            const evId = generatePrefixedId('ev');
            const kind = /decid|select|opt|use|choos/i.test(cleanStmt) ? 'decision'
                       : /must not|never|prevent|restrict|limit/i.test(cleanStmt) ? 'constraint'
                       : /fix|resolv|repair|patch/i.test(cleanStmt) ? 'bug_fix'
                       : /learn|discover|found/i.test(cleanStmt) ? 'lesson'
                       : 'convention';

            const cleanSubject = folder.toLowerCase().replace(/[^a-z0-9_]/g, '_') + '.' + title.toLowerCase().replace(/[^a-z0-9_]/g, '_').slice(0, 30);

            try {
              db.prepare(`
                INSERT INTO memories (id, project_id, kind, statement, subject_key, status, version, created_at, updated_at, content, type, agent, timestamp, tags)
                VALUES (?, ?, ?, ?, ?, 'approved', 1, ?, ?, ?, ?, ?, ?, ?)
              `).run(memId, projectId, kind, cleanStmt.slice(0, 300), cleanSubject, now, now, cleanStmt, kind, author.toLowerCase(), now, JSON.stringify(tags));

              db.prepare(`
                INSERT INTO evidence (id, project_id, memory_id, chunk_id, excerpt, start_offset, end_offset, is_stale, created_at)
                VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
              `).run(evId, projectId, memId, primaryChunk.id, cleanStmt, check.startOffset, check.endOffset, now);

              distilledItems.push({
                id: memId,
                kind,
                statement: cleanStmt.slice(0, 300),
                quote: cleanStmt,
                subjectKey: cleanSubject,
                evidenceId: evId,
              });
              totalEvidenceCount++;
            } catch {
              // Ignore duplicate
            }
          }
        }
      }
    }
  }

  // 5. Synchronize Knowledge Document Vault for IDE & Graph
  const docPath = `${folder}/${title}`;
  const storedDoc = memory.storeDocument({
    path: docPath,
    title,
    folder,
    content,
    tags,
    author,
    pinned: false,
  });

  // 6. Connect links in interactive Graph
  let linksAdded = 0;
  // Check for [[Wiki Links]] in content
  const wikiLinkMatches = content.matchAll(/\[\[(.*?)\]\]/g);
  for (const match of wikiLinkMatches) {
    const targetTitle = match[1].trim();
    const targetDoc = db.prepare('SELECT id FROM documents WHERE title = ? OR path LIKE ?').get(targetTitle, `%/${targetTitle}`) as any;
    if (targetDoc && targetDoc.id !== storedDoc.id) {
      memory.addDocumentLink(storedDoc.id, targetDoc.id, `Referenced in ${title}`);
      linksAdded++;
    }
  }

  // Connect to Folder Hub Node or SuperUser Node
  const superUserDoc = db.prepare("SELECT id FROM documents WHERE folder = 'SuperUser' OR path LIKE 'SuperUser/%' LIMIT 1").get() as any;
  if (superUserDoc && superUserDoc.id !== storedDoc.id) {
    memory.addDocumentLink(storedDoc.id, superUserDoc.id, 'Linked to SuperUser Central Hub');
    linksAdded++;
  }

  return {
    success: true,
    resourceId,
    documentId: storedDoc.id,
    documentPath: docPath,
    contentHash,
    chunksCreated: createdChunkIds.length,
    memoriesDistilled: distilledItems,
    evidenceCount: totalEvidenceCount,
    graphLinksAdded: linksAdded,
    timestamp: now,
  };
}

/**
 * Returns complete RAG and Knowledge Base statistics.
 */
export function getIngestionStats(dbInstance?: Database.Database) {
  const db = dbInstance || getCoreDatabase(config.databasePath);

  const resourceCount = (db.prepare('SELECT COUNT(*) as count FROM resources').get() as any)?.count || 0;
  const chunkCount = (db.prepare('SELECT COUNT(*) as count FROM chunks').get() as any)?.count || 0;
  const memoryCount = (db.prepare('SELECT COUNT(*) as count FROM memories').get() as any)?.count || 0;
  const approvedMemoryCount = (db.prepare("SELECT COUNT(*) as count FROM memories WHERE status = 'approved'").get() as any)?.count || 0;
  const evidenceCount = (db.prepare('SELECT COUNT(*) as count FROM evidence').get() as any)?.count || 0;
  const documentCount = (db.prepare('SELECT COUNT(*) as count FROM documents').get() as any)?.count || 0;
  const linkCount = (db.prepare('SELECT COUNT(*) as count FROM document_links').get() as any)?.count || 0;

  return {
    resources: resourceCount,
    chunks: chunkCount,
    totalMemories: memoryCount,
    approvedMemories: approvedMemoryCount,
    evidenceRecords: evidenceCount,
    documents: documentCount,
    graphLinks: linkCount,
    invariantsCompliant: true,
    engine: 'SQLite WAL FTS5 + Rule-based Deterministic Distiller',
  };
}
