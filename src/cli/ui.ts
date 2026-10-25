import pc from 'picocolors';
import { AgentResult, MemoryEntry, TaskResult } from '../types/index.js';

export class UI {
  public static printBanner(): void {
    console.log('\n' + pc.cyan('╔═══════════════════════════════════════════════════════════════╗'));
    console.log(pc.cyan('║') + pc.bold(pc.white('             S H A R E D B R A I N  A I  S Y S T E M           ')) + pc.cyan('║'));
    console.log(pc.cyan('║') + pc.dim('   Multi-Agent Collective with Persistent SQLite Team Memory   ') + pc.cyan('║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════════════════════════╝\n'));
  }

  public static printTaskStart(taskId: string, task: string, priorMemories: MemoryEntry[]): void {
    console.log(pc.bold(pc.yellow('[TASK INITIALIZED]')));
    console.log(pc.dim(`   Task ID: ${taskId}`));
    console.log(pc.white(`   Prompt : "${pc.bold(task)}"`));

    if (priorMemories.length > 0) {
      console.log(pc.green(`   [Memory Recall] Found ${priorMemories.length} relevant historical memories in SQLite from past sessions!`));
      priorMemories.slice(0, 2).forEach((m) => {
        console.log(pc.dim(`      ↳ [${m.agent.toUpperCase()} | ${m.type}] ${m.content.slice(0, 90)}...`));
      });
    } else {
      console.log(pc.dim('   [Memory Recall] No prior memories found. Creating fresh knowledge base.'));
    }
    console.log(pc.dim('─'.repeat(65)));
  }

  public static printAgentStart(agent: string, role: string): void {
    const icon = this.getAgentIcon(agent);
    const color = this.getAgentColor(agent);
    console.log(`\n${icon} ${color(pc.bold(`[AGENT ACTIVATED: ${agent.toUpperCase()}]`))} ${pc.dim(`- ${role}`)}`);
  }

  public static printAgentThoughts(agent: string, thoughts: string): void {
    console.log(pc.dim(`   [Reasoning & Tools]:`));
    thoughts.split('\n').forEach((line) => {
      console.log(pc.dim(`      ${line}`));
    });
  }

  public static printAgentComplete(result: AgentResult): void {
    const color = this.getAgentColor(result.agent);
    console.log(pc.green(`   [OK] ${result.agent} completed in ${result.executionTimeMs}ms`));

    if (result.memoriesCreated.length > 0) {
      console.log(pc.cyan(`   Committed ${result.memoriesCreated.length} entries into SharedBrain SQLite:`));
      result.memoriesCreated.forEach((m) => {
        const tagStr = m.tags.length > 0 ? ` #${m.tags.join(' #')}` : '';
        console.log(`      ${pc.magenta(`• [${m.type.toUpperCase()}]`)} ${m.content.slice(0, 110)}... ${pc.dim(tagStr)}`);
      });
    }
  }

  public static printHandoff(fromAgent: string, toAgent: string, memoryCount: number): void {
    console.log(
      `\n   ${pc.yellow('[HANDOFF]')}: ${pc.bold(fromAgent)} ──(passing ${memoryCount} memories via SQLite)──> ${pc.bold(toAgent)}`
    );
  }

  public static printCriticStart(agent: string, role: string, attempt: number): void {
    console.log(`\n[CRITIC] ${pc.yellow(pc.bold(`[AGENT ACTIVATED: ${agent.toUpperCase()}]`))} ${pc.dim(`- ${role} (Attempt #${attempt + 1})`)}`);
  }

  public static printCriticEvaluation(evalResult: any, attempt: number): void {
    const isGood = evalResult.is_acceptable;
    const scoreColor = evalResult.score >= 8 ? pc.green : evalResult.score >= 6 ? pc.yellow : pc.red;
    const badge = isGood ? pc.bgGreen(pc.black(' ACCEPTABLE ')) : pc.bgRed(pc.white(' REVISION NEEDED '));

    console.log(`   ${badge} Critic Score: ${scoreColor(pc.bold(`${evalResult.score}/10`))}`);
    console.log(`   Feedback: ${pc.white(evalResult.feedback)}`);
    if (evalResult.missing_elements && evalResult.missing_elements.length > 0) {
      console.log(`   Missing Elements: ${pc.yellow(evalResult.missing_elements.join(', '))}`);
    }
  }

  public static printRetryAttempt(attempt: number, maxRetries: number, feedback: string): void {
    console.log(
      `\n   ${pc.bgYellow(pc.black(' [SELF-CORRECTION RETRY] '))} Attempt ${attempt} of ${maxRetries}: Re-engaging agents with Critic feedback...`
    );
  }

  public static printFinalResult(result: TaskResult): void {
    console.log('\n' + pc.cyan('═'.repeat(65)));
    console.log(pc.bold(pc.green('TASK ACCOMPLISHED - FINAL DELIVERABLE (Saved in SharedBrain)')));
    console.log(pc.cyan('═'.repeat(65)));
    console.log(result.finalSummary);
    console.log(pc.cyan('═'.repeat(65)));
    if (result.critique) {
      const qBadge = result.critique.is_acceptable ? pc.green('VERIFIED ACCEPTABLE') : pc.yellow('BEST EFFORT');
      console.log(`Quality Assessment: ${qBadge} | Score: ${pc.bold(`${result.critique.score}/10`)} | Retries: ${result.retryAttempts || 0}`);
    }
    console.log(pc.dim(`Total Duration: ${result.durationMs}ms | Total Memories Stored in SQLite: ${result.totalMemoriesCreated}`));
    console.log(pc.dim(`Knowledge is now persistently saved in SQLite database across app restarts.`));
    console.log(pc.cyan('═'.repeat(65)) + '\n');
  }

  public static printMemoryStats(stats: any): void {
    console.log(pc.bold(pc.cyan('\nSharedBrain SQLite Persistent Storage Stats:')));
    console.log(`  • Database File    : ${pc.bold(stats.dbPath)}`);
    console.log(`  • Database Size    : ${pc.bold((stats.dbSizeBytes / 1024).toFixed(2))} KB`);
    console.log(`  • Total Memories   : ${pc.bold(stats.totalCount)}`);
    console.log(`  • Last Updated     : ${stats.lastUpdated ? new Date(stats.lastUpdated).toLocaleString() : 'N/A'}`);

    console.log(`\n  ${pc.bold('Breakdown by Agent:')}`);
    Object.entries(stats.byAgent).forEach(([agent, count]) => {
      console.log(`    - ${agent.padEnd(14)}: ${pc.bold(String(count))}`);
    });

    console.log(`\n  ${pc.bold('Breakdown by Type:')}`);
    Object.entries(stats.byType).forEach(([type, count]) => {
      console.log(`    - ${type.padEnd(14)}: ${pc.bold(String(count))}`);
    });
    console.log('');
  }

  private static getAgentIcon(agent: string): string {
    switch (agent.toLowerCase()) {
      case 'researcher':
        return '[RES]';
      case 'analyst':
        return '[ANA]';
      case 'writer':
        return '[WRI]';
      case 'critic':
        return '[CRI]';
      case 'orchestrator':
        return '[ORCH]';
      default:
        return '[AGENT]';
    }
  }

  private static getAgentColor(agent: string): (str: string) => string {
    switch (agent.toLowerCase()) {
      case 'researcher':
        return pc.blue;
      case 'analyst':
        return pc.magenta;
      case 'writer':
        return pc.green;
      case 'critic':
        return pc.yellow;
      default:
        return pc.cyan;
    }
  }
}

