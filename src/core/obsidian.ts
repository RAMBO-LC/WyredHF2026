import Database from 'better-sqlite3';

export interface ObsidianDocExport {
  id: string;
  path: string;
  title: string;
  folder: string;
  markdown: string;
}

/**
 * Obsidian Sync Utility:
 * Exports documents from SQLite as Obsidian-compatible Markdown with YAML frontmatter and [[wikilinks]].
 * Also imports Obsidian Markdown files, parsing YAML and link references.
 */
export function exportObsidianVault(db: Database.Database): ObsidianDocExport[] {
  const docs = db.prepare('SELECT * FROM documents').all() as any[];
  const links = db.prepare('SELECT * FROM document_links').all() as any[];

  // Map links by source
  const linksBySource = new Map<string, any[]>();
  for (const l of links) {
    if (!linksBySource.has(l.source_id)) {
      linksBySource.set(l.source_id, []);
    }
    linksBySource.get(l.source_id)!.push(l);
  }

  const docTitleMap = new Map<string, string>();
  for (const d of docs) {
    docTitleMap.set(d.id, d.title.replace(/\.md$/, ''));
  }

  return docs.map((doc) => {
    const docLinks = linksBySource.get(doc.id) || [];
    const tagsArray = typeof doc.tags === 'string' ? JSON.parse(doc.tags || '[]') : (doc.tags || []);

    const frontmatter = [
      '---',
      `id: "${doc.id}"`,
      `title: "${doc.title}"`,
      `folder: "${doc.folder}"`,
      `author: "${doc.author || 'SharedBrain'}"`,
      `updated_at: "${doc.updated_at || new Date().toISOString()}"`,
      `pinned: ${doc.pinned ? 'true' : 'false'}`,
      `tags: [${tagsArray.map((t: string) => `"${t}"`).join(', ')}]`,
      '---',
      '',
    ].join('\n');

    let body = doc.content || '';

    // Append Obsidian [[wikilinks]] section if there are connections
    if (docLinks.length > 0) {
      body += '\n\n## Related Documents\n';
      for (const link of docLinks) {
        const targetTitle = docTitleMap.get(link.target_id) || link.target_id;
        body += `- [[${targetTitle}]] — *${link.context || 'connected'}*\n`;
      }
    }

    return {
      id: doc.id,
      path: doc.path,
      title: doc.title,
      folder: doc.folder,
      markdown: `${frontmatter}${body}`,
    };
  });
}

/**
 * Imports an Obsidian Markdown document into the SharedBrain database
 */
export function importObsidianDocument(
  db: Database.Database,
  filename: string,
  rawMarkdown: string
): { docId: string; title: string; linksFound: number } {
  let content = rawMarkdown;
  let metadata: any = {};

  // Parse YAML Frontmatter
  const frontmatterMatch = rawMarkdown.match(/^---\r?\n([\s\S]*?)\r?\n---\r?\n([\s\S]*)$/);
  if (frontmatterMatch) {
    const yamlBlock = frontmatterMatch[1];
    content = frontmatterMatch[2];

    const lines = yamlBlock.split('\n');
    for (const line of lines) {
      const idx = line.indexOf(':');
      if (idx !== -1) {
        const key = line.slice(0, idx).trim();
        let val = line.slice(idx + 1).trim();
        val = val.replace(/^["'](.*)["']$/, '$1');
        metadata[key] = val;
      }
    }
  }

  const docId = metadata.id || `doc_${filename.toLowerCase().replace(/[^a-z0-9]/g, '_')}`;
  const title = metadata.title || filename;
  const folder = metadata.folder || 'Imported';
  const author = metadata.author || 'ObsidianSync';
  const tags = metadata.tags ? (typeof metadata.tags === 'string' ? [metadata.tags] : metadata.tags) : ['#obsidian'];

  // Save Document
  const insertDoc = db.prepare(`
    INSERT OR REPLACE INTO documents (id, path, title, folder, content, tags, author, updated_at, pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, 0)
  `);
  insertDoc.run(
    docId,
    `${folder}/${title}`,
    title,
    folder,
    content.trim(),
    JSON.stringify(tags),
    author,
    new Date().toISOString()
  );

  // Extract [[wikilinks]]
  const linkRegex = /\[\[(.*?)\]\]/g;
  let match;
  let linksFound = 0;

  const insertLink = db.prepare(`
    INSERT OR IGNORE INTO document_links (source_id, target_id, context)
    VALUES (?, ?, ?)
  `);

  while ((match = linkRegex.exec(content)) !== null) {
    const targetName = match[1].trim();
    // Find target document by title or id
    const targetDoc = db.prepare(
      'SELECT id FROM documents WHERE title = ? OR title = ? OR id = ?'
    ).get(targetName, `${targetName}.md`, targetName) as any;

    if (targetDoc) {
      insertLink.run(docId, targetDoc.id, 'Obsidian [[wikilink]]');
      linksFound++;
    }
  }

  return {
    docId,
    title,
    linksFound,
  };
}
