#!/usr/bin/env node
import { Command } from 'commander';
import readline from 'readline';
import pc from 'picocolors';
import { Orchestrator } from '../orchestrator/orchestrator.js';
import { getSharedMemory } from '../memory/sharedMemory.js';
import { UI } from './ui.js';
import { config } from '../config/index.js';

const program = new Command();

function createInteractivePrompt(): readline.Interface {
  return readline.createInterface({
    input: process.stdin,
    output: process.stdout,
  });
}

function promptUser(rl: readline.Interface, question: string): Promise<string> {
  return new Promise((resolve) => {
    rl.question(question, (answer) => resolve(answer.trim()));
  });
}

function setupOrchestratorUI(): Orchestrator {
  const orchestrator = new Orchestrator(getSharedMemory(config.databasePath), {
    onTaskStart: (taskId, task, prior) => UI.printTaskStart(taskId, task, prior),
    onAgentStart: (agent, role) => UI.printAgentStart(agent, role),
    onAgentThought: (agent, thoughts) => UI.printAgentThoughts(agent, thoughts),
    onAgentComplete: (result) => UI.printAgentComplete(result),
    onHandoff: (from, to, count) => UI.printHandoff(from, to, count),
    onTaskComplete: (result) => UI.printFinalResult(result),
  });

  return orchestrator;
}

program
  .name('sharedbrain')
  .description('Multi-agent AI collaboration system with shared persistent SQLite memory')
  .version('1.0.0');

// 1. Run Task command
program
  .command('run [task...]')
  .description('Run multi-agent collaborative workflow on a user task')
  .action(async (taskArgs: string[]) => {
    UI.printBanner();
    let task = taskArgs && taskArgs.length > 0 ? taskArgs.join(' ') : '';

    if (!task) {
      const rl = createInteractivePrompt();
      task = await promptUser(rl, pc.cyan('👉 Enter your task for the agent team: '));
      rl.close();
    }

    if (!task) {
      console.log(pc.red('No task provided. Exiting.'));
      process.exit(1);
    }

    const orchestrator = setupOrchestratorUI();
    await orchestrator.runTask(task);
  });

// 2. Demo mode command
program
  .command('demo')
  .description('Run end-to-end multi-agent demo showing research, analysis, writing, and memory persistence')
  .action(async () => {
    UI.printBanner();
    console.log(pc.bold(pc.magenta('🚀 STARTING SHARED-BRAIN LIVE DEMO\n')));
    console.log(pc.white('This demo will showcase:'));
    console.log(pc.white('1. Researcher gathers findings and commits them to SQLite memory'));
    console.log(pc.white('2. Analyst reads SQLite memory and produces strategic insights'));
    console.log(pc.white('3. Writer synthesizes final report from SQLite insights'));
    console.log(pc.white('4. Follow-up query proving cross-session memory recall from SQLite!\n'));

    const demoTask = 'Research the benefits of multi-agent systems and write a short summary';
    const orchestrator = setupOrchestratorUI();

    // Step 1: Run main multi-agent workflow
    await orchestrator.runTask(demoTask);

    // Step 2: Show persistence by recalling from SQLite
    console.log(pc.bold(pc.cyan('🔄 VERIFYING PERSISTENT MEMORY RECALL (Simulating new session query):')));
    const memory = orchestrator.getMemory();
    const stats = memory.getStats();
    UI.printMemoryStats(stats);

    const followUpQuery = 'benefits of multi-agent systems';
    console.log(pc.yellow(`🔍 Querying SharedBrain across sessions for: "${followUpQuery}"...\n`));
    const recallResult = await orchestrator.answerWithMemory(followUpQuery);
    console.log(recallResult.answer);

    console.log(pc.bold(pc.green('\n✅ DEMO COMPLETE: Multi-agent collaboration + SQLite memory persistence verified!')));
  });

// 3. Ask / Query Memory command
program
  .command('ask <question...>')
  .description('Query persistent SharedBrain memory across all past sessions')
  .action(async (questionParts: string[]) => {
    const question = questionParts.join(' ');
    UI.printBanner();
    const orchestrator = setupOrchestratorUI();
    const result = await orchestrator.answerWithMemory(question);
    console.log(result.answer);
  });

// 4. Memory management commands
const memoryCmd = program.command('memory').description('Inspect and manage the persistent SQLite database');

memoryCmd
  .command('list')
  .description('List recent memories saved in SQLite')
  .option('-l, --limit <number>', 'Number of items to show', '10')
  .action((options) => {
    UI.printBanner();
    const memory = getSharedMemory(config.databasePath);
    const limit = parseInt(options.limit, 10) || 10;
    const entries = memory.getRecent(limit);

    console.log(pc.bold(pc.cyan(`📋 Most Recent ${entries.length} Memories in SQLite:\n`)));
    if (entries.length === 0) {
      console.log(pc.dim('SharedBrain is currently empty. Run a task to generate memories!'));
      return;
    }

    entries.forEach((m, idx) => {
      const time = new Date(m.timestamp).toLocaleString();
      console.log(`[${idx + 1}] ${pc.magenta(m.type.toUpperCase())} by ${pc.yellow(m.agent)} at ${pc.dim(time)}`);
      console.log(`    ${m.content}`);
      if (m.tags.length > 0) {
        console.log(`    🏷️  Tags: ${pc.cyan(m.tags.join(', '))}`);
      }
      console.log('');
    });
  });

memoryCmd
  .command('search <query...>')
  .description('Search memories using SQLite FTS5 / keyword search')
  .action((queryParts: string[]) => {
    const query = queryParts.join(' ');
    UI.printBanner();
    const memory = getSharedMemory(config.databasePath);
    const results = memory.recall(query, 10);

    console.log(pc.bold(pc.cyan(`🔍 Search Results for: "${query}" (${results.length} found):\n`)));
    if (results.length === 0) {
      console.log(pc.dim(`No matching memories found for "${query}".`));
      return;
    }

    results.forEach((m, idx) => {
      console.log(`[${idx + 1}] [${pc.magenta(m.type.toUpperCase())}] from ${pc.yellow(m.agent)}:`);
      console.log(`    ${m.content}`);
      console.log(`    🏷️  Tags: ${pc.cyan(m.tags.join(', '))}\n`);
    });
  });

memoryCmd
  .command('stats')
  .description('Display SQLite database statistics and size')
  .action(() => {
    UI.printBanner();
    const memory = getSharedMemory(config.databasePath);
    UI.printMemoryStats(memory.getStats());
  });

memoryCmd
  .command('clear')
  .description('Wipe all memories and task history from the SQLite database')
  .action(() => {
    UI.printBanner();
    const memory = getSharedMemory(config.databasePath);
    memory.clear();
    console.log(pc.green('✔ Persistent SQLite memories and task records cleared successfully.'));
  });

// 5. Interactive REPL mode
program
  .command('interactive')
  .description('Start interactive REPL to continuously run tasks, ask questions, and inspect memory')
  .action(async () => {
    UI.printBanner();
    console.log(pc.green('Interactive SharedBrain Shell. Type commands or tasks (or "exit" to quit):\n'));
    console.log(pc.dim('Examples:'));
    console.log(pc.dim('  • Research benefits of multi-agent systems'));
    console.log(pc.dim('  • ask What did the researcher find about SQLite?'));
    console.log(pc.dim('  • stats'));
    console.log(pc.dim('  • list\n'));

    const rl = createInteractivePrompt();
    const orchestrator = setupOrchestratorUI();
    const memory = orchestrator.getMemory();

    const loop = async () => {
      const input = await promptUser(rl, pc.bold(pc.cyan('SharedBrain > ')));

      if (!input || input.toLowerCase() === 'exit' || input.toLowerCase() === 'quit') {
        console.log(pc.green('Goodbye! Memories remain safely persisted in SQLite.'));
        rl.close();
        process.exit(0);
      }

      if (input.toLowerCase() === 'stats') {
        UI.printMemoryStats(memory.getStats());
      } else if (input.toLowerCase() === 'list') {
        const entries = memory.getRecent(5);
        entries.forEach((m, idx) => {
          console.log(`[${idx + 1}] [${m.type}] ${m.agent}: ${m.content}`);
        });
      } else if (input.toLowerCase().startsWith('ask ')) {
        const q = input.slice(4).trim();
        const res = await orchestrator.answerWithMemory(q);
        console.log(res.answer);
      } else if (input.toLowerCase().startsWith('search ')) {
        const q = input.slice(7).trim();
        const res = memory.recall(q, 5);
        console.log(`Found ${res.length} matches:`);
        res.forEach((m) => console.log(` - [${m.type}] (${m.agent}): ${m.content}`));
      } else {
        await orchestrator.runTask(input);
      }

      console.log('');
      setImmediate(loop);
    };

    loop();
  });

// Default action when no subcommand is specified
program.action(async () => {
  // If no args provided, run demo or prompt
  UI.printBanner();
  console.log(pc.yellow('No command specified. Running interactive task mode.\n'));
  const rl = createInteractivePrompt();
  const task = await promptUser(rl, pc.cyan('👉 Enter your task for the agent team: '));
  rl.close();

  if (task) {
    const orchestrator = setupOrchestratorUI();
    await orchestrator.runTask(task);
  } else {
    console.log(pc.dim('Tip: Run "npm run demo" for a full automated walkthrough, or "npm run cli -- --help".'));
  }
});

program.parse(process.argv);
