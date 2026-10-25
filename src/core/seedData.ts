import Database from 'better-sqlite3';
import { generatePrefixedId, sha256 } from './invariants.js';
import { seedNexusFlowSoftwareVault } from './nexusflowData.js';

export const DEMO_PROJECT_ID = 'proj_sharedbrain';
export const DEMO_API_KEY = 'sb_live_demo_key_2026';

export function seedLargeDemoVault(db: Database.Database): void {
  // 1. Ensure Project and API Key exist
  const insertProject = db.prepare(`
    INSERT OR REPLACE INTO projects (id, name, created_at, metadata)
    VALUES (?, ?, ?, ?)
  `);
  insertProject.run(
    DEMO_PROJECT_ID,
    'SharedBrain Enterprise Brain',
    new Date().toISOString(),
    JSON.stringify({ description: 'Central collaborative persistent team brain', active: true })
  );

  const insertApiKey = db.prepare(`
    INSERT OR REPLACE INTO api_keys (id, key_hash, project_ids, name, revoked, created_at)
    VALUES (?, ?, ?, ?, 0, ?)
  `);
  insertApiKey.run(
    generatePrefixedId('key'),
    sha256(DEMO_API_KEY),
    JSON.stringify([DEMO_PROJECT_ID]),
    'Primary Development Key',
    new Date().toISOString()
  );

  // 2. 53 Interconnected Documents for an expansive, lively, huge Knowledge Graph
  const documents = [
    // -------------------------------------------------------------------------
    // SUPERUSER AGENT (Golden Amber #f59e0b) - Central Omniscient Root Node
    // -------------------------------------------------------------------------
    {
      id: 'doc_superuser_agent',
      path: 'SuperUser/SuperUser Agent.md',
      title: 'SuperUser Agent.md',
      folder: 'SuperUser',
      tags: ['#superuser', '#omniscient', '#orchestrator', '#central-hub', '#root'],
      author: 'SuperUser System',
      updated_at: 'Real-time sync',
      pinned: true,
      content: `# SuperUser Agent (Omniscient Coordinator)\n\n## System Role\nThe central root orchestrator and omniscient executive agent of SharedBrain.\n\n## Neural Topology\nDirectly connects and synchronizes all project roadmaps, specialized agent personas (Researcher, Analyst, Writer, Critic), architectural decisions, security boundaries, and production operational runbooks across the entire enterprise memory core.`
    },

    // -------------------------------------------------------------------------
    // PROJECTS (Purple #a855f7)
    // -------------------------------------------------------------------------
    {
      id: 'doc_architecture',
      path: 'Projects/Architecture.md',
      title: 'Architecture.md',
      folder: 'Projects',
      tags: ['#system-design', '#architecture', 'backlink', 'core'],
      author: 'Alex',
      updated_at: 'Updated 3 days ago',
      pinned: true,
      content: `# Architecture Specification\n\nSections: / statusfeed.im\nCreated: Oct 12, 2026\nTags: #system-design #architecture\n\n## System Architecture\nSharedBrain connects specialized AI agents to a centralized persistent SQLite database.\n\n## Key Components\n- **Memory Subsystem**: better-sqlite3 in WAL mode with FTS5.\n- **Orchestration**: Self-correction retry loop with Critic agent evaluation.\n- **Control Plane**: REST /v1 API with Invariants I1-I8.`
    },
    {
      id: 'doc_ai_team_dashboard',
      path: 'Projects/AI Team Dashboard.md',
      title: 'AI Team Dashboard.md',
      folder: 'Projects',
      tags: ['dashboard', 'multi-agent', 'sharedbrain', 'task'],
      author: 'Alex',
      updated_at: '2m ago',
      pinned: false,
      content: `# AI Team Dashboard\n\n## Overview\nReal-time collaborative workspace where team members and AI agents interact seamlessly.`
    },
    {
      id: 'doc_project_requirements',
      path: 'Projects/Project Requirements.md',
      title: 'Project Requirements.md',
      folder: 'Projects',
      tags: ['hackathon', 'specs', 'requirements', 'task', 'backlink'],
      author: 'Alex',
      updated_at: 'Updated 3 days ago',
      pinned: false,
      content: `# Project Requirements - SharedBrain\n\n## Objectives\n- Zero-config persistent SQLite memory.\n- Strict 8-step extraction validation.\n- Interactive Knowledge Graph visualization.`
    },
    {
      id: 'doc_decisions',
      path: 'Projects/Decisions.md',
      title: 'Decisions.md',
      folder: 'Projects',
      tags: ['decisions', 'adr', 'sqlite'],
      author: 'Alex',
      updated_at: 'Updated 3 days ago',
      pinned: false,
      content: `# Architectural Decision Records (ADRs)\n\n## ADR-001: SQLite as Shared Persistent Brain\nWe decided to use SQLite WAL mode for fast concurrency and single-file portability.`
    },
    {
      id: 'doc_frontend_architecture',
      path: 'Projects/Frontend Architecture.md',
      title: 'Frontend Architecture.md',
      folder: 'Projects',
      tags: ['frontend', 'react', 'canvas', 'graph'],
      author: 'Sarah',
      updated_at: 'Yesterday',
      pinned: false,
      content: `# Frontend Architecture\n\n## Principles\n- Native HTML5 Canvas 60fps graph simulation.\n- Real-time Server-Sent Events (SSE) streaming for multi-agent reasoning.\n- Zero bloated client frameworks for sub-millisecond load times.`
    },
    {
      id: 'doc_backend_microservices',
      path: 'Projects/Backend Microservices.md',
      title: 'Backend Microservices.md',
      folder: 'Projects',
      tags: ['backend', 'express', 'node', 'api'],
      author: 'Marcus',
      updated_at: '4 hours ago',
      pinned: false,
      content: `# Backend Microservices & API Gateway\n\n## Structure\n- Express 5 REST engine with versioned /v1 router.\n- Invariant I7 project scoping and SHA-256 Bearer authentication.`
    },
    {
      id: 'doc_database_sharding',
      path: 'Projects/Database Sharding & WAL.md',
      title: 'Database Sharding & WAL.md',
      folder: 'Projects',
      tags: ['database', 'sqlite', 'wal', 'storage'],
      author: 'Alex',
      updated_at: '5 hours ago',
      pinned: false,
      content: `# Database Sharding & WAL Configuration\n\n## Performance\n- PRAGMA journal_mode = WAL enables concurrent readers and single writer.\n- Synchronous = NORMAL yields 15,000+ writes/second.`
    },
    {
      id: 'doc_auth_middleware',
      path: 'Projects/Authentication & JWT Middleware.md',
      title: 'Authentication & JWT Middleware.md',
      folder: 'Projects',
      tags: ['security', 'auth', 'jwt', 'tokens'],
      author: 'Elena',
      updated_at: '1 day ago',
      pinned: false,
      content: `# Authentication & API Key Middleware\n\n## Invariant I7 Enforcement\n- Every request must provide Authorization: Bearer <key>.\n- Key hash validated against SHA-256 digests.\n- Unauthorized access returns 404 identical to non-existent resources.`
    },
    {
      id: 'doc_context_engine_specs',
      path: 'Projects/Context Engine Specs.md',
      title: 'Context Engine Specs.md',
      folder: 'Projects',
      tags: ['context-pack', 'engine', 'retrieval', 'llm'],
      author: 'Alex',
      updated_at: 'Just now',
      pinned: true,
      content: `# Context Engine Specifications\n\n## 5-Tier Greedy Packing\n1. Mandatory Constraints\n2. Decisions and Fixes\n3. Conventions\n4. 1-Hop Graph Neighbors\n5. Unreviewed Notes\n\nDeterministic token budget enforcement with security anti-injection fences.`
    },
    {
      id: 'doc_vector_hybrid_search',
      path: 'Projects/Vector Hybrid Search & FTS5.md',
      title: 'Vector Hybrid Search & FTS5.md',
      folder: 'Projects',
      tags: ['search', 'fts5', 'hybrid', 'bm25'],
      author: 'Elena',
      updated_at: '6 hours ago',
      pinned: false,
      content: `# Vector Hybrid Search & FTS5\n\n## Hybrid Lexical Retrieval\nCombines SQLite FTS5 BM25 scoring with identifier boost for code terms, camelCase, snake_case, and file paths without requiring heavy external vector clusters.`
    },
    {
      id: 'doc_realtime_websocket_bus',
      path: 'Projects/Real-Time WebSocket & SSE Bus.md',
      title: 'Real-Time WebSocket & SSE Bus.md',
      folder: 'Projects',
      tags: ['realtime', 'sse', 'websockets', 'events'],
      author: 'Marcus',
      updated_at: '8 hours ago',
      pinned: false,
      content: `# Real-Time Event Bus\n\n## Event Types\n- \`task_start\`, \`agent_thought\`, \`handoff\`, \`critic_complete\`, \`retry_attempt\`.\n- Low-latency SSE streaming enables live inspection of agent collaboration.`
    },
    {
      id: 'doc_multi_tenant_isolation',
      path: 'Projects/Multi-Tenant Partitioning.md',
      title: 'Multi-Tenant Partitioning.md',
      folder: 'Projects',
      tags: ['tenancy', 'isolation', 'security', 'projects'],
      author: 'Elena',
      updated_at: '12 hours ago',
      pinned: false,
      content: `# Multi-Tenant Partitioning\n\n## Project Isolation Rules\n- Memory items are partitioned by \`project_id\`.\n- Requests attempting to read other projects receive an indistinguishable 404 response to eliminate oracle probing.`
    },

    // -------------------------------------------------------------------------
    // TEAM (Cyan #06b6d4)
    // -------------------------------------------------------------------------
    {
      id: 'doc_team_preferences',
      path: 'Team/Team Preferences.md',
      title: 'Team Preferences.md',
      folder: 'Team',
      tags: ['team', 'workflow', 'conventions'],
      author: 'Alex',
      updated_at: '1h ago',
      pinned: false,
      content: `# Team Preferences\n\n## Culture\n- Async documentation first.\n- Strict critic review on all technical deliverables.\n- Persistent memory over transient chat.`
    },
    {
      id: 'doc_coding_standards',
      path: 'Team/Coding Standards.md',
      title: 'Coding Standards.md',
      folder: 'Team',
      tags: ['code-style', 'typescript', 'standards', 'task', 'backlink'],
      author: 'Alex',
      updated_at: 'Updated 3 days ago',
      pinned: false,
      content: `# Coding Standards\n\n## TypeScript Guidelines\n- Strict type safety, no implicit any.\n- All database modifications must be wrapped in atomic transactions.\n- Write unit tests for all domain invariants.`
    },
    {
      id: 'doc_design_principles',
      path: 'Team/Design Principles.md',
      title: 'Design Principles.md',
      folder: 'Team',
      tags: ['design', 'ui', 'ux', 'system'],
      author: 'Sarah',
      updated_at: '2 days ago',
      pinned: false,
      content: `# Design Principles\n\n## Aesthetics\n- Dark theme (#090a0d, #0f1217, #141820).\n- Vibrant purple & cyan accents with smooth glowing halos.\n- Instant responsive feedback on every click.`
    },
    {
      id: 'doc_brand_design_system',
      path: 'Team/Brand Design System v2.md',
      title: 'Brand Design System v2.md',
      folder: 'Team',
      tags: ['brand', 'design-system', 'v2'],
      author: 'Sarah',
      updated_at: '3 hours ago',
      pinned: true,
      content: `# Brand Design System v2\n\n## Visual Identity\n- Typography: Plus Jakarta Sans for UI, JetBrains Mono for code.\n- Neon purple glow for active nodes and selections.`
    },
    {
      id: 'doc_color_specs',
      path: 'Team/Color specs (October 2026)',
      title: 'Color specs (October 2026)',
      folder: 'Team',
      tags: ['colors', 'hsl', 'design-tokens'],
      author: 'Sarah',
      updated_at: '3 hours ago',
      pinned: true,
      content: `# Color Specifications (October 2026)\n\n- Primary Purple: #a855f7\n- Electric Cyan: #06b6d4\n- Emerald Green: #10b981\n- Amber Alert: #f59e0b`
    },
    {
      id: 'doc_cicd_pipelines',
      path: 'Team/CI/CD Deployment Pipelines.md',
      title: 'CI/CD Deployment Pipelines.md',
      folder: 'Team',
      tags: ['devops', 'cicd', 'github-actions'],
      author: 'Marcus',
      updated_at: '6 hours ago',
      pinned: false,
      content: `# CI/CD Deployment Pipelines\n\n## Automated Checks\n- TypeScript compiler check (tsc).\n- Vitest fast test suite execution.\n- Memory Invariant validation.`
    },
    {
      id: 'doc_security_threat_model',
      path: 'Team/Security Threat Model.md',
      title: 'Security Threat Model.md',
      folder: 'Team',
      tags: ['security', 'threat-model', 'injection'],
      author: 'Elena',
      updated_at: '1 day ago',
      pinned: false,
      content: `# Security Threat Model\n\n## Prompt Injection Defense\n- Invariant I3: Untrusted model output.\n- Context pack fence lengths computed dynamically to neutralize backtick escapes.\n- Model instructions are never mixed with quoted team data.`
    },
    {
      id: 'doc_rate_limiting',
      path: 'Team/Rate Limiting & Token Bucket.md',
      title: 'Rate Limiting & Token Bucket.md',
      folder: 'Team',
      tags: ['rate-limit', 'api', 'resilience'],
      author: 'Marcus',
      updated_at: '12 hours ago',
      pinned: false,
      content: `# Rate Limiting & Token Bucket\n\n## Rules\n- Feedback events capped at 60 events/hour per actor.\n- API keys throttled to prevent resource exhaustion.`
    },
    {
      id: 'doc_agent_handoff',
      path: 'Team/Agent Handoff Protocol.md',
      title: 'Agent Handoff Protocol.md',
      folder: 'Team',
      tags: ['multi-agent', 'handoff', 'protocol'],
      author: 'Alex',
      updated_at: '2 days ago',
      pinned: false,
      content: `# Agent Handoff Protocol\n\n## Collaboration Pipeline\n- Researcher Agent writes findings into shared memory.\n- Analyst Agent synthesizes insights from recorded memory.\n- Writer Agent drafts deliverable.\n- Critic Agent evaluates strict acceptance criteria.`
    },
    {
      id: 'doc_git_branching_strategy',
      path: 'Team/Git Branching & Release Strategy.md',
      title: 'Git Branching & Release Strategy.md',
      folder: 'Team',
      tags: ['git', 'workflow', 'trunk-based'],
      author: 'Marcus',
      updated_at: '1 day ago',
      pinned: false,
      content: `# Git Branching & Release Strategy\n\n## Trunk-Based Development\n- Short-lived feature branches (< 24h).\n- Automated integration and invariant checks before merging to main.`
    },

    // -------------------------------------------------------------------------
    // KNOWLEDGE (Emerald #10b981)
    // -------------------------------------------------------------------------
    {
      id: 'doc_research_notes',
      path: 'Knowledge/Research Notes.md',
      title: 'Research Notes.md',
      folder: 'Knowledge',
      tags: ['ai-research', 'multi-agent', 'notes'],
      author: 'Elena',
      updated_at: '1h ago',
      pinned: false,
      content: `# Research Notes - Multi-Agent Collaboration\n\n## Findings\n- Multi-agent collaboration with persistent shared memory prevents hallucination.\n- Cross-session memory recall provides long-term institutional context.`
    },
    {
      id: 'doc_lessons_learned',
      path: 'Knowledge/Lessons Learned.md',
      title: 'Lessons Learned.md',
      folder: 'Knowledge',
      tags: ['postmortem', 'learnings', 'speed'],
      author: 'Marcus',
      updated_at: 'Yesterday',
      pinned: false,
      content: `# Lessons Learned\n\n## Highlights\n- Keep prompts role-specific.\n- Deterministic fallbacks are essential for reliability.`
    },
    {
      id: 'doc_llm_prompt_standards',
      path: 'Knowledge/LLM Prompt Engineering Standards.md',
      title: 'LLM Prompt Engineering Standards.md',
      folder: 'Knowledge',
      tags: ['prompts', 'llm', 'guidelines'],
      author: 'Elena',
      updated_at: '1 day ago',
      pinned: false,
      content: `# LLM Prompt Engineering Standards\n\n## Best Practices\n- Separate system instructions from runtime context.\n- Request JSON output format with strict schemas.\n- Never allow raw user input to override system instructions.`
    },
    {
      id: 'doc_outage_postmortem',
      path: 'Knowledge/Incident Postmortem - Outage Oct 14.md',
      title: 'Incident Postmortem - Outage Oct 14.md',
      folder: 'Knowledge',
      tags: ['postmortem', 'incident', 'database'],
      author: 'Marcus',
      updated_at: '10 days ago',
      pinned: false,
      content: `# Incident Postmortem - SQLite Lock Contention\n\n## Root Cause\nMissing WAL mode caused lock timeouts under concurrent write operations.\n\n## Resolution\nEnabled WAL mode and NORMAL synchronous setting in production.`
    },
    {
      id: 'doc_critic_heuristics',
      path: 'Knowledge/Critic Evaluation Heuristics.md',
      title: 'Critic Evaluation Heuristics.md',
      folder: 'Knowledge',
      tags: ['critic', 'evaluation', 'heuristics'],
      author: 'Alex',
      updated_at: '2 days ago',
      pinned: false,
      content: `# Critic Evaluation Heuristics\n\n## Scoring Formula (1-10)\n- Completeness: Does output answer every requirement?\n- Correctness: Are all code snippets free of syntax bugs?\n- Persistence: Were all facts committed to SQLite memory?`
    },
    {
      id: 'doc_performance_benchmarks',
      path: 'Knowledge/Performance Benchmarks.md',
      title: 'Performance Benchmarks.md',
      folder: 'Knowledge',
      tags: ['benchmarks', 'performance', 'latency'],
      author: 'Marcus',
      updated_at: '3 days ago',
      pinned: false,
      content: `# Performance Benchmarks\n\n- Query Latency: < 2ms for FTS5 full-text lookup.\n- Context Pack Generation: < 15ms for 5,000 tokens.\n- Canvas Render: Solid 60 FPS with 50+ nodes.`
    },
    {
      id: 'doc_team_onboarding',
      path: 'Knowledge/Team Onboarding Guide.md',
      title: 'Team Onboarding Guide.md',
      folder: 'Knowledge',
      tags: ['onboarding', 'guide', 'welcome'],
      author: 'Alex',
      updated_at: '1 week ago',
      pinned: false,
      content: `# Team Onboarding Guide\n\n## Getting Started\n1. Clone repository and run \`npm install\`.\n2. Start server via \`npm run serve\`.\n3. Open \`http://localhost:3000/graph\` to explore the project topology.`
    },
    {
      id: 'doc_memory_core_invariants',
      path: 'Knowledge/Memory Core Invariants.md',
      title: 'Memory Core Invariants.md',
      folder: 'Knowledge',
      tags: ['invariants', 'memory-core', 'rules', 'backlink'],
      author: 'Alex',
      updated_at: 'Just now',
      pinned: true,
      content: `# Memory Core Invariants (I1-I8)\n\n- **I1: No memory without evidence**: Verbatim substring check in chunk.\n- **I2: Claims & evidence separate**: Always return evidence array.\n- **I3: Model output untrusted**: Strict 8-step validation pipeline.\n- **I4: One transition function**: Optimistic locking with version check.\n- **I5: Feedback never rewrites knowledge**: Review items only.\n- **I6: Reproducible packs**: Deterministic markdown output.\n- **I7: Project isolation**: 404 for unauthorized access.\n- **I8: Idempotent extraction**: Unique runs hash tracking.`
    },
    {
      id: 'doc_context_window_tuning',
      path: 'Knowledge/Context Window & Token Budgeting.md',
      title: 'Context Window & Token Budgeting.md',
      folder: 'Knowledge',
      tags: ['tokens', 'budgeting', 'context-window'],
      author: 'Elena',
      updated_at: '18 hours ago',
      pinned: false,
      content: `# Context Window & Token Budgeting\n\n## Algorithmic Packing\nDynamic allocation calculates 4 characters per token estimate, packing high-priority mandatory constraints first, then verified decisions, then graph neighbors.`
    },
    {
      id: 'doc_zero_hallucination',
      path: 'Knowledge/Zero Hallucination Grounding.md',
      title: 'Zero Hallucination Grounding.md',
      folder: 'Knowledge',
      tags: ['hallucination', 'grounding', 'accuracy'],
      author: 'Alex',
      updated_at: '12 hours ago',
      pinned: false,
      content: `# Zero Hallucination Grounding\n\n## Grounding Strategy\nAgents are strictly constrained to extract statements supported by verbatim text excerpts, preventing fabricated references.`
    },
    {
      id: 'doc_sqlite_fts5_tuning',
      path: 'Knowledge/SQLite FTS5 Query Optimization.md',
      title: 'SQLite FTS5 Query Optimization.md',
      folder: 'Knowledge',
      tags: ['sqlite', 'fts5', 'indexing', 'performance'],
      author: 'Marcus',
      updated_at: '14 hours ago',
      pinned: false,
      content: `# SQLite FTS5 Query Optimization\n\n## Index Structure\nVirtual tables \`memories_fts\`, \`evidence_fts\`, and \`chunks_heading_fts\` are indexed with custom prefix matching and tokenizer options for rapid substring lookups.`
    },
    {
      id: 'doc_few_shot_catalog',
      path: 'Knowledge/Few-Shot Prompt Catalog.md',
      title: 'Few-Shot Prompt Catalog.md',
      folder: 'Knowledge',
      tags: ['prompts', 'few-shot', 'catalog'],
      author: 'Elena',
      updated_at: '1 day ago',
      pinned: false,
      content: `# Few-Shot Prompt Catalog\n\n## Proven Exemplars\nStructured prompt patterns that maximize JSON compliance for agent extraction, synthesis, and strict critical review.`
    },

    // -------------------------------------------------------------------------
    // SECURITY (Rose #f43f5e)
    // -------------------------------------------------------------------------
    {
      id: 'doc_zero_trust_boundaries',
      path: 'Security/Zero-Trust Agent Boundaries.md',
      title: 'Zero-Trust Agent Boundaries.md',
      folder: 'Security',
      tags: ['security', 'zero-trust', 'isolation', 'boundary'],
      author: 'Elena',
      updated_at: '1 day ago',
      pinned: true,
      content: `# Zero-Trust Agent Boundaries\n\n## Invariant I3 & I7\nAgents operate under zero-trust assumptions. All candidate statements must pass automated verification and isolated tenant boundaries before insertion.`
    },
    {
      id: 'doc_owasp_llm_top10',
      path: 'Security/OWASP LLM Top 10 Mitigations.md',
      title: 'OWASP LLM Top 10 Mitigations.md',
      folder: 'Security',
      tags: ['security', 'owasp', 'llm-security', 'mitigation'],
      author: 'Elena',
      updated_at: '2 days ago',
      pinned: false,
      content: `# OWASP LLM Top 10 Mitigations\n\n## Defenses Implemented\n- LLM01: Prompt Injection mitigated via dynamic markdown fences.\n- LLM02: Insecure Output Handling mitigated via schema validation.\n- LLM06: Sensitive Information Disclosure mitigated via tenant isolation.`
    },
    {
      id: 'doc_cryptographic_audit',
      path: 'Security/Cryptographic Audit Trail.md',
      title: 'Cryptographic Audit Trail.md',
      folder: 'Security',
      tags: ['audit', 'cryptography', 'sha256', 'tamper-evident'],
      author: 'Marcus',
      updated_at: '16 hours ago',
      pinned: false,
      content: `# Cryptographic Audit Trail\n\n## Audit Logging\nAll state transitions generate immutable entries in \`audit_events\` with SHA-256 chunk hashes and actor timestamps.`
    },
    {
      id: 'doc_anti_injection_fences',
      path: 'Security/Dynamic Anti-Injection Fencing.md',
      title: 'Dynamic Anti-Injection Fencing.md',
      folder: 'Security',
      tags: ['security', 'injection', 'fences', 'markdown'],
      author: 'Alex',
      updated_at: '5 hours ago',
      pinned: false,
      content: `# Dynamic Anti-Injection Fencing\n\n## Fence Algorithm\nCalculates max consecutive backticks in content and wraps with \`N+1\` backticks, neutralizing nested delimiter escapes in LLM context packs.`
    },
    {
      id: 'doc_key_rotation_policy',
      path: 'Security/API Key Lifecycle & Rotation.md',
      title: 'API Key Lifecycle & Rotation.md',
      folder: 'Security',
      tags: ['api-keys', 'rotation', 'lifecycle', 'security'],
      author: 'Marcus',
      updated_at: '2 days ago',
      pinned: false,
      content: `# API Key Lifecycle & Rotation\n\n## Guidelines\n- Keys stored hashed at rest.\n- Instant revocation via \`revoked = 1\`.\n- Scope restricted to explicit project IDs.`
    },
    {
      id: 'doc_tamper_proofing',
      path: 'Security/Tamper-Proof Memory Ledger.md',
      title: 'Tamper-Proof Memory Ledger.md',
      folder: 'Security',
      tags: ['ledger', 'tamper-proof', 'invariants'],
      author: 'Elena',
      updated_at: '1 day ago',
      pinned: false,
      content: `# Tamper-Proof Memory Ledger\n\n## Enforcement\nFeedback events cannot alter statements or statuses. Only \`transitionMemory()\` with optimistic locking can execute status updates.`
    },

    // -------------------------------------------------------------------------
    // RUNBOOKS (Amber #f59e0b)
    // -------------------------------------------------------------------------
    {
      id: 'doc_disaster_recovery',
      path: 'Runbooks/Disaster Recovery & SQLite Backups.md',
      title: 'Disaster Recovery & SQLite Backups.md',
      folder: 'Runbooks',
      tags: ['runbook', 'disaster-recovery', 'backups', 'sqlite'],
      author: 'Marcus',
      updated_at: '4 days ago',
      pinned: true,
      content: `# Disaster Recovery & SQLite Backups\n\n## Backup Procedures\n- Use SQLite online backup API: \`.backup main backup.db\` without locking concurrent readers.\n- WAL checkpoints performed periodically using \`PRAGMA wal_checkpoint(TRUNCATE)\`.`
    },
    {
      id: 'doc_production_deploy',
      path: 'Runbooks/Production Deployment Playbook.md',
      title: 'Production Deployment Playbook.md',
      folder: 'Runbooks',
      tags: ['runbook', 'deployment', 'production', 'release'],
      author: 'Marcus',
      updated_at: '1 day ago',
      pinned: false,
      content: `# Production Deployment Playbook\n\n## Checklist\n1. Run test suite (\`npm test\`).\n2. Execute invariant acceptance check (\`npx tsx scripts/accept.ts\`).\n3. Build TypeScript bundle.\n4. Deploy container with persistent volume.`
    },
    {
      id: 'doc_incident_response',
      path: 'Runbooks/Incident Response & Sev-1 Protocol.md',
      title: 'Incident Response & Sev-1 Protocol.md',
      folder: 'Runbooks',
      tags: ['runbook', 'incident', 'sev-1', 'operations'],
      author: 'Alex',
      updated_at: '3 days ago',
      pinned: false,
      content: `# Incident Response & Sev-1 Protocol\n\n## Steps\n1. Assess memory consistency.\n2. Review audit logs for unexpected transitions.\n3. Failover to recent backup if WAL corrupt.`
    },
    {
      id: 'doc_high_concurrency_scaling',
      path: 'Runbooks/High Concurrency Scaling Guide.md',
      title: 'High Concurrency Scaling Guide.md',
      folder: 'Runbooks',
      tags: ['runbook', 'scaling', 'concurrency', 'wal'],
      author: 'Marcus',
      updated_at: '2 days ago',
      pinned: false,
      content: `# High Concurrency Scaling Guide\n\n## Architecture Tuning\n- Cache prepared statements.\n- Utilize connection pooling.\n- Distribute read queries while funneling writes through the atomic transition engine.`
    },
    {
      id: 'doc_api_rate_limit_runbook',
      path: 'Runbooks/Rate Limit Throttling Procedures.md',
      title: 'Rate Limit Throttling Procedures.md',
      folder: 'Runbooks',
      tags: ['runbook', 'rate-limit', 'throttling'],
      author: 'Marcus',
      updated_at: '1 day ago',
      pinned: false,
      content: `# Rate Limit Throttling Procedures\n\n## Emergency Throttling\n- Adjust actor feedback limit from 60/hr to 20/hr under heavy load.\n- Reject malformed batch extraction requests with HTTP 429.`
    },
    {
      id: 'doc_schema_migration_runbook',
      path: 'Runbooks/Zero-Downtime Schema Migrations.md',
      title: 'Zero-Downtime Schema Migrations.md',
      folder: 'Runbooks',
      tags: ['runbook', 'migrations', 'sqlite', 'schema'],
      author: 'Alex',
      updated_at: '1 day ago',
      pinned: false,
      content: `# Zero-Downtime Schema Migrations\n\n## Safe Migration Rules\n- Always inspect table columns dynamically via \`PRAGMA table_info\`.\n- Use idempotent \`ALTER TABLE ADD COLUMN\` migrations without dropping existing data.`
    },

    // -------------------------------------------------------------------------
    // AGENTS (Blue #3b82f6)
    // -------------------------------------------------------------------------
    {
      id: 'doc_researcher_agent',
      path: 'Agents/Researcher Agent Protocol.md',
      title: 'Researcher Agent Protocol.md',
      folder: 'Agents',
      tags: ['agent', 'researcher', 'retrieval', 'protocol'],
      author: 'Elena',
      updated_at: '1 day ago',
      pinned: false,
      content: `# Researcher Agent Protocol\n\n## Responsibilities\n- Gathers source documents and external references.\n- Breaks text into semantically cohesive chunks.\n- Records factual excerpts into candidate memory storage.`
    },
    {
      id: 'doc_analyst_agent',
      path: 'Agents/Analyst Agent Specification.md',
      title: 'Analyst Agent Specification.md',
      folder: 'Agents',
      tags: ['agent', 'analyst', 'synthesis', 'insights'],
      author: 'Alex',
      updated_at: '1 day ago',
      pinned: false,
      content: `# Analyst Agent Specification\n\n## Responsibilities\n- Evaluates relationships between memory candidates.\n- Resolves conflicting facts across multi-agent sessions.\n- Synthesizes architectural and product decisions.`
    },
    {
      id: 'doc_writer_agent',
      path: 'Agents/Writer Agent Quality Guidelines.md',
      title: 'Writer Agent Quality Guidelines.md',
      folder: 'Agents',
      tags: ['agent', 'writer', 'deliverables', 'markdown'],
      author: 'Sarah',
      updated_at: '1 day ago',
      pinned: false,
      content: `# Writer Agent Quality Guidelines\n\n## Deliverable Rules\n- Uses clean GitHub-flavored markdown.\n- References persistent memory IDs for all assertions.\n- Embeds clickable links to canonical project docs.`
    },
    {
      id: 'doc_critic_agent',
      path: 'Agents/Critic Agent Strict Scoring Protocol.md',
      title: 'Critic Agent Strict Scoring Protocol.md',
      folder: 'Agents',
      tags: ['agent', 'critic', 'scoring', 'evaluation'],
      author: 'Alex',
      updated_at: '1 day ago',
      pinned: true,
      content: `# Critic Agent Strict Scoring Protocol\n\n## Scoring Scale (1-10)\n- Score < 8 triggers automatic self-correction retry.\n- Verifies completeness, code correctness, and evidence backing.`
    },
    {
      id: 'doc_task_evaluator_skill',
      path: 'Agents/Task Evaluator Skill Guide.md',
      title: 'Task Evaluator Skill Guide.md',
      folder: 'Agents',
      tags: ['agent', 'task-evaluator', 'skill', 'critic'],
      author: 'Alex',
      updated_at: '2 hours ago',
      pinned: false,
      content: `# Task Evaluator Skill Guide\n\n## Evaluation Schema\nReturns \`{ score, is_acceptable, feedback, missing_elements }\` to guarantee strict quality enforcement on every agent handoff.`
    },
    {
      id: 'doc_cost_aware_agent',
      path: 'Agents/Cost-Aware Agent Execution.md',
      title: 'Cost-Aware Agent Execution.md',
      folder: 'Agents',
      tags: ['agent', 'cost-aware', 'tokens', 'efficiency'],
      author: 'Marcus',
      updated_at: '3 hours ago',
      pinned: false,
      content: `# Cost-Aware Agent Execution\n\n## Budget Limits\n- Keeps context packs under specified token budgets.\n- Minimizes redundant model calls through local SQLite caching.`
    }
  ];

  // Insert or update all documents
  const insertDoc = db.prepare(`
    INSERT OR REPLACE INTO documents (id, path, title, folder, content, tags, author, updated_at, pinned)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);

  for (const doc of documents) {
    insertDoc.run(
      doc.id,
      doc.path,
      doc.title,
      doc.folder,
      doc.content,
      JSON.stringify(doc.tags),
      doc.author,
      doc.updated_at,
      doc.pinned ? 1 : 0
    );
  }

  // 3. 80+ Dense Directional Graph Links Connecting the Network Across All Clusters
  const graphLinks = [
    // --- Architecture & Core Subsystems ---
    { s: 'doc_decisions', t: 'doc_architecture', ctx: 'ADR-001 determines SQLite architecture' },
    { s: 'doc_project_requirements', t: 'doc_architecture', ctx: 'Requirements mandate modular architecture' },
    { s: 'doc_architecture', t: 'doc_coding_standards', ctx: 'Architecture enforces TypeScript standards' },
    { s: 'doc_architecture', t: 'doc_ai_team_dashboard', ctx: 'Drives team dashboard topology' },
    { s: 'doc_architecture', t: 'doc_database_sharding', ctx: 'Specifies WAL mode database engine' },
    { s: 'doc_architecture', t: 'doc_context_engine_specs', ctx: 'Coordinates context engine subsystem' },
    { s: 'doc_architecture', t: 'doc_backend_microservices', ctx: 'Defines Express API surface' },
    { s: 'doc_architecture', t: 'doc_memory_core_invariants', ctx: 'Enforces architectural invariants I1-I8' },
    { s: 'doc_architecture', t: 'doc_multi_tenant_isolation', ctx: 'Enforces strict tenant scoping' },
    { s: 'doc_architecture', t: 'doc_vector_hybrid_search', ctx: 'Pairs FTS5 lexical engine with ranking' },
    { s: 'doc_architecture', t: 'doc_realtime_websocket_bus', ctx: 'Streams agent reasoning in real-time' },

    // --- Frontend & Visual Design ---
    { s: 'doc_frontend_architecture', t: 'doc_ai_team_dashboard', ctx: 'Renders dashboard user interface' },
    { s: 'doc_frontend_architecture', t: 'doc_design_principles', ctx: 'Adheres to dark mode UI tokens' },
    { s: 'doc_frontend_architecture', t: 'doc_brand_design_system', ctx: 'Uses neon purple brand styling' },
    { s: 'doc_frontend_architecture', t: 'doc_realtime_websocket_bus', ctx: 'Consumes SSE agent streams' },
    { s: 'doc_frontend_architecture', t: 'doc_performance_benchmarks', ctx: 'Validates 60 FPS canvas loop' },

    // --- Backend & Security ---
    { s: 'doc_backend_microservices', t: 'doc_auth_middleware', ctx: 'Protects /v1 API with Bearer token authentication' },
    { s: 'doc_auth_middleware', t: 'doc_security_threat_model', ctx: 'Guards against project isolation breaches' },
    { s: 'doc_backend_microservices', t: 'doc_rate_limiting', ctx: 'Implements 60/hr feedback throttling' },
    { s: 'doc_backend_microservices', t: 'doc_database_sharding', ctx: 'Queries SQLite WAL database directly' },
    { s: 'doc_backend_microservices', t: 'doc_multi_tenant_isolation', ctx: 'Enforces Invariant I7 404 responses' },
    { s: 'doc_auth_middleware', t: 'doc_key_rotation_policy', ctx: 'Manages API key lifecycles' },

    // --- Security Cluster Connections ---
    { s: 'doc_zero_trust_boundaries', t: 'doc_security_threat_model', ctx: 'Validates untrusted model outputs' },
    { s: 'doc_zero_trust_boundaries', t: 'doc_memory_core_invariants', ctx: 'Upholds Invariants I1 and I3' },
    { s: 'doc_owasp_llm_top10', t: 'doc_anti_injection_fences', ctx: 'Neutralizes prompt injection exploits' },
    { s: 'doc_cryptographic_audit', t: 'doc_tamper_proofing', ctx: 'Guarantees immutable audit trail' },
    { s: 'doc_tamper_proofing', t: 'doc_memory_core_invariants', ctx: 'Enforces Invariant I5 review queue rules' },
    { s: 'doc_anti_injection_fences', t: 'doc_context_engine_specs', ctx: 'Fences context pack contents' },

    // --- Context Engine & Retrieval ---
    { s: 'doc_context_engine_specs', t: 'doc_memory_core_invariants', ctx: 'Follows Invariant I6 reproducible packs' },
    { s: 'doc_context_engine_specs', t: 'doc_security_threat_model', ctx: 'Wraps task context in safe fence blocks' },
    { s: 'doc_context_engine_specs', t: 'doc_research_notes', ctx: 'Packs research findings into LLM prompts' },
    { s: 'doc_context_engine_specs', t: 'doc_context_window_tuning', ctx: 'Applies token budgeting limits' },
    { s: 'doc_vector_hybrid_search', t: 'doc_sqlite_fts5_tuning', ctx: 'Tuned with FTS5 prefix indexing' },
    { s: 'doc_vector_hybrid_search', t: 'doc_zero_hallucination', ctx: 'Anchors retrieval in verbatim text' },

    // --- Team Culture & DevOps ---
    { s: 'doc_coding_standards', t: 'doc_team_preferences', ctx: 'Reflects core engineering culture' },
    { s: 'doc_team_preferences', t: 'doc_design_principles', ctx: 'Aligns on user experience standards' },
    { s: 'doc_design_principles', t: 'doc_brand_design_system', ctx: 'Specifies typography and palette tokens' },
    { s: 'doc_brand_design_system', t: 'doc_color_specs', ctx: 'Defines exact HSL color values' },
    { s: 'doc_coding_standards', t: 'doc_cicd_pipelines', ctx: 'Automates linting and tests in CI' },
    { s: 'doc_cicd_pipelines', t: 'doc_performance_benchmarks', ctx: 'Runs automated regression benchmarks' },
    { s: 'doc_cicd_pipelines', t: 'doc_git_branching_strategy', ctx: 'Integrates trunk-based automated builds' },
    { s: 'doc_git_branching_strategy', t: 'doc_production_deploy', ctx: 'Triggers deployment runbook on main branch' },

    // --- Agent Protocols & Collaboration ---
    { s: 'doc_agent_handoff', t: 'doc_architecture', ctx: 'Orchestrates multi-agent pipelines' },
    { s: 'doc_agent_handoff', t: 'doc_researcher_agent', ctx: 'Starts workflow with research phase' },
    { s: 'doc_researcher_agent', t: 'doc_analyst_agent', ctx: 'Hands collected findings to analyst' },
    { s: 'doc_analyst_agent', t: 'doc_writer_agent', ctx: 'Hands synthesized specs to writer' },
    { s: 'doc_writer_agent', t: 'doc_critic_agent', ctx: 'Submits deliverable for quality grading' },
    { s: 'doc_critic_agent', t: 'doc_task_evaluator_skill', ctx: 'Uses task-evaluator strict scoring schema' },
    { s: 'doc_critic_agent', t: 'doc_critic_heuristics', ctx: 'Applies 1-10 scoring rubrics' },
    { s: 'doc_agent_handoff', t: 'doc_cost_aware_agent', ctx: 'Enforces budget constraints on agent calls' },

    // --- Runbooks & Operational Resilience ---
    { s: 'doc_disaster_recovery', t: 'doc_database_sharding', ctx: 'Executes hot online backups of SQLite database' },
    { s: 'doc_disaster_recovery', t: 'doc_incident_response', ctx: 'Invoked during Sev-1 restoration' },
    { s: 'doc_production_deploy', t: 'doc_schema_migration_runbook', ctx: 'Runs schema migrations safely before boot' },
    { s: 'doc_production_deploy', t: 'doc_cicd_pipelines', ctx: 'Gated by CI/CD pipeline verification' },
    { s: 'doc_high_concurrency_scaling', t: 'doc_database_sharding', ctx: 'Scales WAL mode readers' },
    { s: 'doc_high_concurrency_scaling', t: 'doc_rate_limiting', ctx: 'Activates rate limiting under peak load' },
    { s: 'doc_api_rate_limit_runbook', t: 'doc_rate_limiting', ctx: 'Defines runbook actions for 429 surges' },

    // --- Postmortems & Learnings ---
    { s: 'doc_outage_postmortem', t: 'doc_database_sharding', ctx: 'Triggered switch to WAL mode' },
    { s: 'doc_outage_postmortem', t: 'doc_lessons_learned', ctx: 'Contributed to production database checklist' },
    { s: 'doc_research_notes', t: 'doc_lessons_learned', ctx: 'Documents multi-agent research takeaways' },
    { s: 'doc_research_notes', t: 'doc_llm_prompt_standards', ctx: 'Establishes structured JSON prompts' },
    { s: 'doc_research_notes', t: 'doc_few_shot_catalog', ctx: 'Derives prompt templates from experimental data' },
    { s: 'doc_team_onboarding', t: 'doc_architecture', ctx: 'Guides new engineers through architecture' },
    { s: 'doc_team_onboarding', t: 'doc_team_preferences', ctx: 'Introduces team conventions' },
    { s: 'doc_team_onboarding', t: 'doc_coding_standards', ctx: 'Teaches TypeScript and invariant standards' }
  ];

  // Connect SuperUser Agent to LITERALLY EVERYTHING in the graph
  const superuserLinks = documents
    .filter((d) => d.id !== 'doc_superuser_agent')
    .map((d) => ({
      s: 'doc_superuser_agent',
      t: d.id,
      ctx: `SuperUser omniscient link: ${d.title.replace(/\.md$/, '')}`,
    }));

  const allGraphLinks = [...superuserLinks, ...graphLinks];

  const insertLink = db.prepare(`
    INSERT OR REPLACE INTO document_links (source_id, target_id, context)
    VALUES (?, ?, ?)
  `);

  for (const l of allGraphLinks) {
    insertLink.run(l.s, l.t, l.ctx);
  }

  // 4. Seed Memory Core resources, chunks, and verified memories for demo
  const resId = 'res_core_specs_01';
  const insertResource = db.prepare(`
    INSERT OR REPLACE INTO resources (id, project_id, title, locator, content_hash, content, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?)
  `);
  const coreSpecContent = `# System Decisions\n\nWe decided to use SQLite in WAL mode for persistent shared brain.\n\n# Constraints\n\nWe must not allow any memory without verifiable evidence.\n\n# Conventions\n\nWe chose strict TypeScript interfaces across all agent roles.\n\n# Fixes\n\nFixed lock contention by enabling PRAGMA journal_mode = WAL.`;
  insertResource.run(
    resId,
    DEMO_PROJECT_ID,
    'Core System Specifications',
    'specs/core.md',
    sha256(coreSpecContent),
    coreSpecContent,
    new Date().toISOString()
  );

  const chk1Id = 'chk_decision_01';
  const chk2Id = 'chk_constraint_01';
  const chk3Id = 'chk_convention_01';
  const chk4Id = 'chk_bugfix_01';

  const insertChunk = db.prepare(`
    INSERT OR REPLACE INTO chunks (id, project_id, resource_id, heading_path, content, content_hash, start_offset, end_offset, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)
  `);
  insertChunk.run(
    chk1Id,
    DEMO_PROJECT_ID,
    resId,
    'System Decisions',
    'We decided to use SQLite in WAL mode for persistent shared brain.',
    sha256('We decided to use SQLite in WAL mode for persistent shared brain.'),
    0,
    63,
    new Date().toISOString()
  );
  insertChunk.run(
    chk2Id,
    DEMO_PROJECT_ID,
    resId,
    'Constraints',
    'We must not allow any memory without verifiable evidence.',
    sha256('We must not allow any memory without verifiable evidence.'),
    65,
    124,
    new Date().toISOString()
  );
  insertChunk.run(
    chk3Id,
    DEMO_PROJECT_ID,
    resId,
    'Conventions',
    'We chose strict TypeScript interfaces across all agent roles.',
    sha256('We chose strict TypeScript interfaces across all agent roles.'),
    126,
    188,
    new Date().toISOString()
  );
  insertChunk.run(
    chk4Id,
    DEMO_PROJECT_ID,
    resId,
    'Fixes',
    'Fixed lock contention by enabling PRAGMA journal_mode = WAL.',
    sha256('Fixed lock contention by enabling PRAGMA journal_mode = WAL.'),
    190,
    250,
    new Date().toISOString()
  );

  // Seed memories with verified evidence (Invariant I1)
  const mem1Id = 'mem_decision_wal';
  const mem2Id = 'mem_constraint_evidence';
  const mem3Id = 'mem_convention_ts';
  const mem4Id = 'mem_bugfix_wal';

  const colInfo = db.prepare("PRAGMA table_info(memories)").all() as any[];
  const hasAgentCol = colInfo.some(c => c.name === 'agent');
  const hasContentCol = colInfo.some(c => c.name === 'content');

  const insertMemory = hasAgentCol
    ? db.prepare(`
        INSERT OR REPLACE INTO memories (id, project_id, kind, statement, subject_key, status, version, created_at, updated_at, content, type, agent, timestamp, tags)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?, 'system', ?, '[]')
      `)
    : hasContentCol
    ? db.prepare(`
        INSERT OR REPLACE INTO memories (id, project_id, kind, statement, subject_key, status, version, created_at, updated_at, content, type)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?, ?, ?)
      `)
    : db.prepare(`
        INSERT OR REPLACE INTO memories (id, project_id, kind, statement, subject_key, status, version, created_at, updated_at)
        VALUES (?, ?, ?, ?, ?, ?, 1, ?, ?)
      `);

  const runInsertMem = (id: string, kind: string, stmt: string, subject: string, status: string) => {
    const now = new Date().toISOString();
    if (hasAgentCol) {
      insertMemory.run(id, DEMO_PROJECT_ID, kind, stmt, subject, status, now, now, stmt, kind, now);
    } else if (hasContentCol) {
      insertMemory.run(id, DEMO_PROJECT_ID, kind, stmt, subject, status, now, now, stmt, kind);
    } else {
      insertMemory.run(id, DEMO_PROJECT_ID, kind, stmt, subject, status, now, now);
    }
  };

  runInsertMem(mem1Id, 'decision', 'We decided to use SQLite in WAL mode for persistent shared brain.', 'system.architecture', 'approved');
  runInsertMem(mem2Id, 'constraint', 'We must not allow any memory without verifiable evidence.', 'system.invariants', 'approved');
  runInsertMem('mem_suggested_convention', 'convention', 'We chose strict TypeScript interfaces across all agent roles.', 'system.coding_standards', 'suggested');
  runInsertMem(mem3Id, 'convention', 'We chose strict TypeScript interfaces across all agent roles.', 'system.coding_standards', 'suggested');
  runInsertMem(mem4Id, 'bug_fix', 'Fixed lock contention by enabling PRAGMA journal_mode = WAL.', 'system.database', 'approved');

  const insertEvidence = db.prepare(`
    INSERT OR REPLACE INTO evidence (id, project_id, memory_id, chunk_id, excerpt, start_offset, end_offset, is_stale, created_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, 0, ?)
  `);
  insertEvidence.run(
    'ev_decision_01',
    DEMO_PROJECT_ID,
    mem1Id,
    chk1Id,
    'We decided to use SQLite in WAL mode for persistent shared brain.',
    0,
    63,
    new Date().toISOString()
  );
  insertEvidence.run(
    'ev_constraint_01',
    DEMO_PROJECT_ID,
    mem2Id,
    chk2Id,
    'We must not allow any memory without verifiable evidence.',
    0,
    59,
    new Date().toISOString()
  );
  insertEvidence.run(
    'ev_suggested_01',
    DEMO_PROJECT_ID,
    'mem_suggested_convention',
    chk3Id,
    'We chose strict TypeScript interfaces across all agent roles.',
    0,
    62,
    new Date().toISOString()
  );
  insertEvidence.run(
    'ev_convention_01',
    DEMO_PROJECT_ID,
    mem3Id,
    chk3Id,
    'We chose strict TypeScript interfaces across all agent roles.',
    0,
    62,
    new Date().toISOString()
  );
  insertEvidence.run(
    'ev_bugfix_01',
    DEMO_PROJECT_ID,
    mem4Id,
    chk4Id,
    'Fixed lock contention by enabling PRAGMA journal_mode = WAL.',
    0,
    60,
    new Date().toISOString()
  );

  // 5. Seed NexusFlow Software-Only Company RAG Data (API v2, Webhooks, Rate Limiting, Runbooks, Conversation History)
  try {
    seedNexusFlowSoftwareVault(db);
  } catch (err: any) {
    console.error('Failed to seed NexusFlow vault:', err.message);
  }
}
