import fs from 'fs';
import path from 'path';
import { ingestAndDistillContent, IngestionResult } from './ingestionEngine.js';

export interface WatcherConfig {
  incomingDir?: string;
  processedDir?: string;
  pollIntervalMs?: number;
  enabled?: boolean;
}

let watcherActive = false;
let watchTimeout: NodeJS.Timeout | null = null;
let currentIncomingDir = '';
let currentProcessedDir = '';
let filesProcessedCount = 0;
const processingSet = new Set<string>();

const SUPPORTED_EXTENSIONS = new Set([
  '.md',
  '.markdown',
  '.txt',
  '.json',
  '.csv',
  '.log',
  '.yaml',
  '.yml',
  '.ts',
  '.js',
  '.py',
  '.sql',
]);

/**
 * Extracts a human-friendly document title from file content or filename.
 */
function extractTitleAndFolder(filePath: string, content: string): { title: string; folder: string } {
  const parsed = path.parse(filePath);
  let title = parsed.name.replace(/[-_]+/g, ' ').trim();
  let folder = 'Knowledge';

  // Check if filename suggests folder, e.g. "Runbook_Deploy.md" or "Architecture_Cache.md"
  if (title.toLowerCase().startsWith('runbook')) folder = 'Runbooks';
  else if (title.toLowerCase().startsWith('arch')) folder = 'Projects';
  else if (title.toLowerCase().startsWith('sec')) folder = 'Security';
  else if (title.toLowerCase().startsWith('team')) folder = 'Team';
  else if (title.toLowerCase().startsWith('agent')) folder = 'Agents';

  // Check for top-level markdown heading
  const lines = content.split('\n');
  for (const line of lines) {
    const trimmed = line.trim();
    if (trimmed.startsWith('# ')) {
      const headingText = trimmed.replace(/^#\s+/, '').trim();
      if (headingText.length > 2 && headingText.length < 120) {
        title = headingText;
        break;
      }
    }
  }

  // Capitalize title nicely
  title = title.replace(/\b\w/g, (c) => c.toUpperCase());

  return { title, folder };
}

/**
 * Ingests a single file from the incoming directory.
 */
async function processIncomingFile(filePath: string): Promise<IngestionResult | null> {
  const ext = path.extname(filePath).toLowerCase();
  if (!SUPPORTED_EXTENSIONS.has(ext)) {
    return null;
  }

  if (processingSet.has(filePath)) {
    return null;
  }

  processingSet.add(filePath);

  try {
    // Wait briefly to ensure file write stream is completely closed
    await new Promise((resolve) => setTimeout(resolve, 300));

    if (!fs.existsSync(filePath)) {
      processingSet.delete(filePath);
      return null;
    }

    const content = fs.readFileSync(filePath, 'utf-8');
    if (!content || !content.trim()) {
      processingSet.delete(filePath);
      return null;
    }

    const { title, folder } = extractTitleAndFolder(filePath, content);
    const sourceRef = `watcher:${path.basename(filePath)}`;

    console.log(`\n[RAG Watcher] Detected new incoming file: "${path.basename(filePath)}"`);
    console.log(`[RAG Watcher] Chunking, distilling memories, and verifying evidence...`);

    const result = ingestAndDistillContent({
      title,
      folder,
      content,
      author: 'Production Incoming Watcher',
      tags: ['auto-ingest', 'production', folder.toLowerCase(), ext.replace('.', '')],
      sourceRef,
    });

    console.log(
      `[RAG Watcher] Ingested "${title}": ${result.chunksCreated} chunks, ${result.memoriesDistilled.length} distilled memories, ${result.evidenceCount} evidence records.`
    );

    // Safely move to processed directory
    const nowStamp = Date.now();
    const destName = `${nowStamp}_${path.basename(filePath)}`;
    const destPath = path.resolve(currentProcessedDir, destName);

    try {
      fs.renameSync(filePath, destPath);
    } catch {
      // Fallback if cross-device or permission issue
      fs.copyFileSync(filePath, destPath);
      fs.unlinkSync(filePath);
    }

    filesProcessedCount++;
    processingSet.delete(filePath);
    return result;
  } catch (err: any) {
    console.error(`[RAG Watcher] Failed to process ${filePath}:`, err?.message || err);
    processingSet.delete(filePath);
    return null;
  }
}

/**
 * Scans the incoming folder for any pending files.
 */
export async function scanIncomingFolder(): Promise<number> {
  if (!fs.existsSync(currentIncomingDir)) return 0;

  try {
    const files = fs.readdirSync(currentIncomingDir);
    let processed = 0;

    for (const f of files) {
      if (f.startsWith('.') || f === 'README.txt') continue; // skip hidden files and the operator guide
      const fullPath = path.resolve(currentIncomingDir, f);
      const stat = fs.statSync(fullPath);
      if (stat.isFile()) {
        const res = await processIncomingFile(fullPath);
        if (res) processed++;
      }
    }

    return processed;
  } catch (err: any) {
    console.error('[RAG Watcher] Scan error:', err?.message || err);
    return 0;
  }
}

/**
 * Starts the production incoming folder watcher.
 */
export function startIncomingWatcher(config?: WatcherConfig): void {
  if (watcherActive) return;

  const baseDir = process.cwd();
  currentIncomingDir = config?.incomingDir || process.env.DATA_INCOMING_DIR || path.resolve(baseDir, 'data', 'incoming');
  currentProcessedDir = config?.processedDir || process.env.DATA_PROCESSED_DIR || path.resolve(baseDir, 'data', 'processed');

  // Ensure directories exist
  if (!fs.existsSync(currentIncomingDir)) {
    fs.mkdirSync(currentIncomingDir, { recursive: true });
  }
  if (!fs.existsSync(currentProcessedDir)) {
    fs.mkdirSync(currentProcessedDir, { recursive: true });
  }

  // Create README guide in the incoming folder for operators
  const readmePath = path.resolve(currentIncomingDir, 'README.txt');
  if (!fs.existsSync(readmePath)) {
    fs.writeFileSync(
      readmePath,
      `SharedBrain Local Production RAG - Drop Folder
=============================================
Drop any .md, .txt, .json, .csv, or code files here.
The local ingestion engine will automatically:
  1. Store raw content and compute SHA-256 hash.
  2. Split into hierarchical chunks with byte offsets.
  3. Distill actionable decisions, constraints, conventions, and bug fixes.
  4. Enforce Invariants I1-I8 (verbatim evidence verification).
  5. Index into SQLite WAL FTS5 and update the interactive Knowledge Graph.
  6. Move the processed file to ./data/processed/

Live production active!
`
    );
  }

  watcherActive = true;
  console.log(`\n[RAG Watcher] Active in production.`);
  console.log(`Incoming Drop Folder:  ${currentIncomingDir}`);
  console.log(`Processed Archive:     ${currentProcessedDir}\n`);

  // Initial scan
  scanIncomingFolder().catch(() => {});

  // Set up periodic poll + fs.watch for robust cross-platform execution (Docker, macOS, Linux)
  const pollInterval = config?.pollIntervalMs || 5000;
  const pollLoop = () => {
    if (!watcherActive) return;
    scanIncomingFolder()
      .catch(() => {})
      .finally(() => {
        if (watcherActive) {
          watchTimeout = setTimeout(pollLoop, pollInterval);
        }
      });
  };

  watchTimeout = setTimeout(pollLoop, pollInterval);

  try {
    fs.watch(currentIncomingDir, (eventType, filename) => {
      if (filename && !filename.startsWith('.') && filename !== 'README.txt') {
        const fullPath = path.resolve(currentIncomingDir, filename);
        if (fs.existsSync(fullPath)) {
          processIncomingFile(fullPath).catch(() => {});
        }
      }
    });
  } catch {
    // If fs.watch fails on certain Docker mounts, the poll loop handles it reliably
  }
}

/**
 * Stops the folder watcher.
 */
export function stopIncomingWatcher(): void {
  watcherActive = false;
  if (watchTimeout) {
    clearTimeout(watchTimeout);
    watchTimeout = null;
  }
}

/**
 * Returns current status of the drop-folder watcher.
 */
export function getWatcherStatus() {
  return {
    active: watcherActive,
    incomingDirectory: currentIncomingDir,
    processedDirectory: currentProcessedDir,
    totalFilesProcessed: filesProcessedCount,
    supportedExtensions: Array.from(SUPPORTED_EXTENSIONS),
  };
}
