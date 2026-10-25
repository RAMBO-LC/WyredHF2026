import Database from 'better-sqlite3';
import fs from 'fs';
import path from 'path';
import { fileURLToPath } from 'url';
import { initCoreSchema } from '../src/core/db.js';
import { seedLargeDemoVault, DEMO_PROJECT_ID } from '../src/core/seedData.js';
import { generateContextPack } from '../src/core/contextPacks.js';
import { transitionMemory } from '../src/core/transitions.js';
import { recordFeedback } from '../src/core/feedback.js';

const __filename = fileURLToPath(import.meta.url);
const __dirname = path.dirname(__filename);

interface EvalTask {
  id: string;
  task: string;
  category: string;
  expected_subjects: string[];
  expected_keywords: string[];
  min_expected_matches: number;
}

async function runEval(): Promise<void> {
  console.log('\n======================================================');
  console.log('       SharedBrain Context Engine Eval Harness         ');
  console.log('======================================================\n');

  // 1. Load Tasks
  const tasksPath = path.resolve(__dirname, 'eval_tasks.json');
  const rawTasks = fs.readFileSync(tasksPath, 'utf-8');
  const tasks: EvalTask[] = JSON.parse(rawTasks);

  // 2. Setup Test Environment
  const db = new Database(':memory:');
  db.pragma('foreign_keys = ON');
  initCoreSchema(db);
  seedLargeDemoVault(db);

  // Approve all suggested memories through the transitionMemory transition path
  const suggestedMemories = db.prepare("SELECT id, version FROM memories WHERE status = 'suggested'").all() as any[];
  for (const m of suggestedMemories) {
    transitionMemory(db, {
      projectId: DEMO_PROJECT_ID,
      memoryId: m.id,
      expectedVersion: m.version,
      newStatus: 'approved',
      actor: 'eval_preparer',
      reason: 'Approved for evaluation benchmark',
    });
  }

  // 3. Record Some Feedback Events to measure feedback ratio & signals
  recordFeedback(db, {
    projectId: DEMO_PROJECT_ID,
    memoryId: 'mem_decision_wal',
    actor: 'eval_user_1',
    type: 'useful',
    context: 'Crucial for avoiding lock contention',
  });
  recordFeedback(db, {
    projectId: DEMO_PROJECT_ID,
    memoryId: 'mem_constraint_evidence',
    actor: 'eval_user_2',
    type: 'useful',
    context: 'Strict evidence invariant verified',
  });

  // 4. Run Evaluation on Tasks
  let totalRecallAt5 = 0;
  let totalPrecisionAt5 = 0;
  let totalPackTokens = 0;
  let insufficientPacksCount = 0;

  console.log(`Running evaluation across ${tasks.length} benchmark tasks...\n`);

  for (const t of tasks) {
    const pack = generateContextPack(db, {
      projectId: DEMO_PROJECT_ID,
      query: t.task,
      budget: 2500,
      actor: 'eval_runner',
    });

    totalPackTokens += pack.tokens_used;
    if (pack.markdown.includes('INSUFFICIENT KNOWLEDGE BASE')) {
      insufficientPacksCount++;
    }

    // Top 5 selected memories
    const top5 = pack.selected_ids.slice(0, 5);

    // Fetch memory details for top 5
    let matchedKeywordsCount = 0;
    if (top5.length > 0) {
      const placeholders = top5.map(() => '?').join(',');
      const memRows = db.prepare(`SELECT * FROM memories WHERE id IN (${placeholders})`).all(...top5) as any[];

      for (const row of memRows) {
        const text = `${row.statement} ${row.subject_key}`.toLowerCase();
        const hasKeyword = t.expected_keywords.some((kw) => text.includes(kw.toLowerCase()));
        const hasSubject = t.expected_subjects.some((subj) => row.subject_key.startsWith(subj.split('.')[0]));
        if (hasKeyword || hasSubject) {
          matchedKeywordsCount++;
        }
      }
    }

    const precision = top5.length > 0 ? matchedKeywordsCount / top5.length : 0;
    const recall = Math.min(1.0, matchedKeywordsCount / t.min_expected_matches);

    totalPrecisionAt5 += precision;
    totalRecallAt5 += recall;

    console.log(`- Task [${t.id}] "${t.task.slice(0, 45)}...": recall@5 = ${(recall * 100).toFixed(1)}%, precision@5 = ${(precision * 100).toFixed(1)}%`);
  }

  const avgRecallAt5 = totalRecallAt5 / tasks.length;
  const avgPrecisionAt5 = totalPrecisionAt5 / tasks.length;
  const avgPackTokens = Math.round(totalPackTokens / tasks.length);
  const insufficientShare = insufficientPacksCount / tasks.length;

  // 5. Gather Extraction & Rejection Metrics
  const runStats = db.prepare(`
    SELECT
      SUM(accepted_count) as total_accepted,
      SUM(rejected_count) as total_rejected
    FROM extraction_runs
  `).get() as any;

  const totalAccepted = runStats?.total_accepted || 0;
  const totalRejected = runStats?.total_rejected || 0;
  const totalCandidates = totalAccepted + totalRejected;
  const acceptanceRate = totalCandidates > 0 ? totalAccepted / totalCandidates : 1.0;

  const rejectionRows = db.prepare(`
    SELECT reason, COUNT(*) as cnt
    FROM rejected_candidates
    GROUP BY reason
  `).all() as any[];

  const rejectionReasons: Record<string, number> = {};
  for (const r of rejectionRows) {
    rejectionReasons[r.reason] = r.cnt;
  }

  // 6. Gather Feedback Metrics
  const totalMemories = (db.prepare('SELECT COUNT(*) as cnt FROM memories').get() as any).cnt;
  const totalFeedbacks = (db.prepare('SELECT COUNT(*) as cnt FROM feedback_events').get() as any).cnt;
  const feedbackRatio = totalMemories > 0 ? totalFeedbacks / totalMemories : 0;

  // 7. Output Metrics Report Table
  console.log('\n======================================================');
  console.log('              EVALUATION BENCHMARK METRICS            ');
  console.log('======================================================');
  console.log(`Recall@5:                 ${(avgRecallAt5 * 100).toFixed(1)}% (Threshold: >= 80.0%)`);
  console.log(`Precision@5:              ${(avgPrecisionAt5 * 100).toFixed(1)}% (Threshold: >= 50.0%)`);
  console.log(`Extraction Acceptance:    ${(acceptanceRate * 100).toFixed(1)}%`);
  console.log(`Rejection Reasons:        ${JSON.stringify(rejectionReasons)}`);
  console.log(`Average Pack Tokens:      ${avgPackTokens} tokens`);
  console.log(`Insufficient-Pack Share:  ${(insufficientShare * 100).toFixed(1)}%`);
  console.log(`Feedback Ratio:           ${feedbackRatio.toFixed(2)} feedbacks/memory`);
  console.log('======================================================\n');

  // 8. Assert Thresholds
  if (avgRecallAt5 < 0.8) {
    console.error(`❌ FAILED: Recall@5 (${(avgRecallAt5 * 100).toFixed(1)}%) is below required threshold 80.0%`);
    process.exit(1);
  }
  if (avgPrecisionAt5 < 0.5) {
    console.error(`❌ FAILED: Precision@5 (${(avgPrecisionAt5 * 100).toFixed(1)}%) is below required threshold 50.0%`);
    process.exit(1);
  }

  console.log('🎯 EVAL BENCHMARK PASSED: All Recall & Precision criteria satisfied!\n');
  process.exit(0);
}

runEval().catch((err) => {
  console.error('Eval harness error:', err);
  process.exit(1);
});
