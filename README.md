# Team Brain

> A shared, persistent knowledge and memory system that turns a team's scattered resources, previous solutions, decisions, and project knowledge into shared intelligence for humans and AI coding agents.

## Core Problem
Important team knowledge is scattered across Markdown files, source code, documents, chat messages, debugging sessions, and individual memories. Team Brain captures, structures, and links that knowledge so teams and agents (such as OpenCode) understand what the team already knows.

## Key Components
1. **Resource Management**: Ingests files, docs, code, and notes with stable IDs, provenance tracking, and document normalization.
2. **Memory Engine**: Extracts structured memories (`decision`, `bug_fix`, `lesson`, `convention`, `reference`, `task_outcome`) backed by real evidence links.
3. **Smart Knowledge Management**: Connects resources, chunks, and memories with graph relationships and lifecycle management (`suggested`, `approved`, `superseded`, `archived`).
4. **Context Engine**: Assembles bounded, task-specific `context.md` packages for coding objectives with provenance transparency.
5. **Context Transparency**: Displays why memories were selected, supporting citations, and warnings when evidence is insufficient.

## End-to-End Workflow
```
Register resource → Persist source → Normalize & chunk → Propose memories → Validate evidence → Store memories & relationships → Search knowledge → Generate task-specific context (context.md) → Verify provenance
```

## Agent Configuration
All agent instructions and roles are configured in [`.opencode/agents/`](file:///.opencode/agents/):
- [`project-director.md`](file:///.opencode/agents/project-director.md) - Chief orchestrator and integration owner
- [`AGENT_MEMORY_TEAM_BRAIN.md`](file:///.opencode/agents/AGENT_MEMORY_TEAM_BRAIN.md) - Memory system, knowledge management, and context engine owner
- [`backend-data-engineer.md`](file:///.opencode/agents/backend-data-engineer.md) - Data models, persistence, and APIs
- [`domain-logic-engineer.md`](file:///.opencode/agents/domain-logic-engineer.md) - Chunking, schema validation, graph rules, and ranking
- [`frontend-engineer.md`](file:///.opencode/agents/frontend-engineer.md) - UI screens and progressive API wiring
- [`notification-engineer.md`](file:///.opencode/agents/notification-engineer.md) - Ingestion status and review notifications
- [`product-architect.md`](file:///.opencode/agents/product-architect.md) - Feature specifications and acceptance criteria
- [`ux-architect.md`](file:///.opencode/agents/ux-architect.md) - Interaction flows and screen layouts
- [`qa-engineer.md`](file:///.opencode/agents/qa-engineer.md) - End-to-end testing and validation suites
- [`security-reviewer.md`](file:///.opencode/agents/security-reviewer.md) - Prompt injection and project boundary review
- [`final-verifier.md`](file:///.opencode/agents/final-verifier.md) - Release gate verification
