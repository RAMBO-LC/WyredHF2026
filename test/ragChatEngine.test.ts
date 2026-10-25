import { describe, it, expect, beforeEach } from 'vitest';
import Database from 'better-sqlite3';
import { initCoreSchema } from '../src/core/db.js';
import { retrieveContext, generateAnswer, tokenize } from '../src/core/ragChatEngine.js';

function addDoc(db: Database.Database, id: string, title: string, content: string) {
  db.prepare(`
    INSERT INTO documents (id, path, title, folder, content, tags, author, updated_at, pinned)
    VALUES (?, ?, ?, 'Knowledge', ?, '[]', 'test', ?, 0)
  `).run(id, `Knowledge/${title}`, title, content, new Date().toISOString());
}

describe('RAG chat engine', () => {
  let db: Database.Database;

  beforeEach(() => {
    process.env.USE_MOCK_LLM = 'true';
    db = new Database(':memory:');
    initCoreSchema(db);
    addDoc(db, 'doc_pizza', 'Office Pizza Policy.md', '# Office Pizza Policy\n\n## Ordering\nPizza is ordered every Friday from Luigi. Budget is 12 dollars per person.');
    addDoc(db, 'doc_deploy', 'Deploy Runbook.md', '# Deploy Runbook\n\n## Rollback\nRun kubectl rollout undo to roll back a bad deploy.\n\n## Canary\nCanary traffic starts at 5 percent.');
  });

  it('tokenizes with stop words removed and plurals stemmed', () => {
    expect(tokenize('What are the deploys for the teams?')).toEqual(['deploy', 'team']);
  });

  it('ranks the section that matches the question first', () => {
    const ctx = retrieveContext('How do I roll back a deploy?', db);
    expect(ctx.inDomain).toBe(true);
    expect(ctx.chunks[0].doc_id).toBe('doc_deploy');
    expect(ctx.chunks[0].heading).toBe('Rollback');
  });

  it('answers questions about user-ingested topics, not just a fixed domain', async () => {
    const result = await generateAnswer(retrieveContext('When is pizza ordered?', db), db);
    expect(result.isRefusal).toBe(false);
    expect(result.answer).toContain('Friday');
    expect(result.citations[0].doc_id).toBe('doc_pizza');
  });

  it('refuses questions the knowledge base does not cover', async () => {
    const result = await generateAnswer(retrieveContext('What is the capital of France?', db), db);
    expect(result.isRefusal).toBe(true);
    expect(result.citations).toHaveLength(0);
  });
});
