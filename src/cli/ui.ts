import pc from 'picocolors';
import { AgentResult, MemoryEntry, TaskResult } from '../types/index.js';

export class UI {
  public static printBanner(): void {
    console.log('\n' + pc.cyan('╔═══════════════════════════════════════════════════════════════╗'));
    console.log(pc.cyan('║') + pc.bold(pc.white('         🧠  S H A R E D B R A I N  A I  S Y S T E M           ')) + pc.cyan('║'));
    console.log(pc.cyan('║') + pc.dim('   Multi-Agent Collective with Persistent SQLite Team Memory   ') + pc.cyan('║'));
    console.log(pc.cyan('╚═══════════════════════════════════════════════════════════════╝\n'));
  }

  public static printTaskStart(taskId: string, task: string, priorMemories: MemoryEntry[]): void {
    console.log(pc.bold(pc.yellow('🎯 NEW TASK INITIALIZED')));
    console.log(pc.dim(`   Task ID: ${taskId}`));
    console.log(pc.white(`   Prompt : "${pc.bold(task)}"`));

    if (priorMemories.length > 0) {
      console.log(pc.green(`   🧠 Memory Recall: Found ${priorMemories.length} relevant historical memories in SQLite from past sessions!`));
      priorMemories.slice(0, 2).forEach((m) => {
        console.log(pc.dim(`      ↳ [${m.agent.toUpperCase()} | ${m.type}] ${m.content.slice(0, 90)}...`));
      });
    } else {
      console.log(pc.dim('   🧠 Memory Recall: No prior memories found. Creating fresh knowledge base.'));
    }
    console.log(pc.dim('─'.repeat(65)));
  }

  public static printAgentStart(agent: string, role: string): void {
    const icon = this.getAgentIcon(agent);
    const color = this.getAgentColor(agent);
    console.log(`\n${icon} ${color(pc.bold(`[AGENT ACTIVATED: ${agent.toUpperCase()}]`))} ${pc.dim(`- ${role}`)}`);
  }

  public static printAgentThoughts(agent: string, thoughts: string): void {
    console.log(pc.dim(`   💭 Internal Reasoning & Tools:`));
    thoughts.split('\n').forEach((line) => {
      console.log(pc.dim(`      ${line}`));
    });
  }

  public static printAgentComplete(result: AgentResult): void {
    const color = this.getAgentColor(result.agent);
    console.log(pc.green(`   ✔ ${result.agent} completed in ${result.executionTimeMs}ms`));

    if (result.memoriesCreated.length > 0) {
      console.log(pc.cyan(`   💾 Committed ${result.memoriesCreated.length} entries into SharedBrain SQLite:`));
      result.memoriesCreated.forEach((m) => {
        const tagStr = m.tags.length > 0 ? ` #${m.tags.join(' #')}` : '';
        console.log(`      ${pc.magenta(`• [${m.type.toUpperCase()}]`)} ${m.content.slice(0, 110)}... ${pc.dim(tagStr)}`);
      });
    }
  }

  public static printHandoff(fromAgent: string, toAgent: string, memoryCount: number): void {
    console.log(
      `\n   ${pc.yellow('⚡ HANDOFF')}: ${pc.bold(fromAgent)} ──(passing ${memoryCount} memories via SQLite)──> ${pc.bold(toAgent)}`
    );
  }

  public static printFinalResult(result: TaskResult): void {
    console.log('\n' + pc.cyan('═'.repeat(65)));
    console.log(pc.bold(pc.green('🎉 TASK ACCOMPLISHED - FINAL DELIVERABLE (Saved in SharedBrain)')));
    console.log(pc.cyan('═'.repeat(65)));
    console.log(result.finalSummary);
    console.log(pc.cyan('═'.repeat(65)));
    console.log(pc.dim(`⏱️  Total Duration: ${result.durationMs}ms | 💾 Total Memories Stored in SQLite: ${result.totalMemoriesCreated}`));
    console.log(pc.dim(`🔒 Knowledge is now persistently saved in SQLite database across app restarts.`));
    console.log(pc.cyan('═'.repeat(65)) + '\n');
  }

  public static printMemoryStats(stats: any): void {
    console.log(pc.bold(pc.cyan('\n📊 SharedBrain SQLite Persistent Storage Stats:')));
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
        return '🔍';
      case 'analyst':
        return '📊';
      case 'writer':
        return '✍️';
      case 'orchestrator':
        return '🎼';
      default:
        return '🤖';
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
      default:
        return pc.cyan;
    }
  }
}
