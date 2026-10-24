# Team Brain: Autonomous Execution Guide & Mission Prompt

## 1. Product Objective
We are building **Team Brain**: a shared, persistent knowledge and memory system that helps a team retain, connect, retrieve, and reuse knowledge across projects, documents, decisions, bugs, and coding sessions.

### Core Problem
Important knowledge becomes scattered across Markdown files, source code, documents, conversations, previous debugging sessions, and individual team members' understanding. Team Brain transforms that scattered information into searchable, evidence-backed, reusable knowledge.

### Core Promise
Team Brain turns a team's scattered resources, previous solutions, decisions, and project knowledge into shared intelligence that helps people and AI coding agents understand what the team already knows.

*Notice:* This is a memory and knowledge-management product, not a fitness tracker, habit tracker, streak application, or generic notification product.

---

## 2. Component Ownership & System Architecture

### A. Resource Management
- Register resources with stable IDs, titles, project IDs, source types (`file`, `doc`, `web`, `note`), source references, and metadata.
- Support Markdown, text, code, documents, and other supported formats.
- Preserve original source and provenance.
- Avoid duplicate ingestion (idempotent writes).
- Convert supported documents into normalized Markdown when appropriate (e.g. via MarkItDown).
- Maintain processing status (`pending`, `processing`, `completed`, `failed`) and helpful error logs.

### B. Memory Engine
- Primary Owner: `AGENT_MEMORY_TEAM_BRAIN.md`.
- Extract reusable knowledge from resources and project activity.
- Support memory categories:
  - `decision`: Technical choices, architecture trade-offs.
  - `bug_fix`: Root cause analyses, regressions resolved, solutions.
  - `lesson`: Operational learnings, best practices.
  - `convention`: Coding conventions, constraints, naming rules.
  - `reference`: Documentation links, authoritative sources.
  - `task_outcome`: Deliverables, task results, session summaries.
- Validate structured model output before storing it (via runtime schema validation).
- Keep evidence links to original resource, chunk ID, excerpt, and location.
- Support lifecycle states: `suggested`, `approved`, `superseded`, and `archived`.
- Track relationships between memories (`related_to`, `depends_on`, `fixes`, `derived_from`, `supersedes`).
- **Never invent evidence, source links, citations, or previous decisions.**

### C. Smart Knowledge Management
- Store original resources, normalized Markdown, chunks, memory records, relationships, and metadata as logically distinct but connected entities.
- Support project-scoped filtering and retrieval.
- Search saved knowledge using the simplest reliable method first (full-text/SQL keyword search).
- Add semantic/vector retrieval only if existing stack and infrastructure make it worthwhile.
- Support deduplication, updates, provenance, and supersession of outdated information.
- Keep the database as the source of truth. An LLM can propose, classify, summarize, and connect information; it must not replace deterministic persistence or validation.

### D. Context Engine
- Accept a task, question, or coding objective and construct a relevant, bounded context package for a human or coding agent.
- Retrieve and organize:
  1. The current task objective.
  2. Relevant project background.
  3. Previous decisions and solutions.
  4. Related bug fixes and lessons.
  5. Coding conventions and constraints.
  6. Dependencies and relevant relationships.
  7. Source references and supporting excerpts.
  8. Verification steps and expected outcomes.
  9. Missing information, conflicting evidence, and unresolved questions.
- Produce a task-specific `context.md` or equivalent structured context package consumable by OpenCode or other coding agents.
- Enforce strict token/character budgets. Only include relevant information; never dump the entire database into every prompt.

### E. Context Transparency
The system must make it possible to understand:
- Why a memory was retrieved (matching score, relationship link, tag).
- Which source supports it (resource ID, title, URI, chunk excerpt).
- Which project it belongs to.
- Whether it is suggested, approved, outdated, or superseded.
- Which relationships influenced retrieval.
- Where the system lacks sufficient evidence (honest reporting, no hallucination).

---

## 3. Required End-to-End Workflow
The minimum successful workflow to implement and verify:
```
Register resource
  └── Persist source
        └── Normalize & chunk content
              └── Propose structured memories (LLM)
                    └── Validate evidence & schema
                          └── Store memories & relationships (DB)
                                └── Search relevant knowledge
                                      └── Generate task-specific context (context.md)
                                            └── Verify output & provenance
```
This workflow must be implemented and tested as a connected system, not as isolated mock screens.

---

## 4. Open-Source Framework Strategy
Evaluate options against the existing application and time available:
- **Cognee** (https://github.com/topoteretes/cognee): Evaluate first for connected knowledge and graph memory. Verify TypeScript client/API viability.
- **Mem0** (https://github.com/mem0ai/mem0): Alternative for simpler persistent memory.
- **Khoj** (https://github.com/khoj-ai/khoj): Reference architecture for desktop/shared knowledge search.
- **MarkItDown** (https://github.com/microsoft/markitdown): If document-to-Markdown conversion is needed.
- **Fallback Adapter:** If framework integration blocks delivery or requires heavy infrastructure, use the existing database with a small, reliable memory/retrieval adapter (`fallback-provider.ts`).

---

## 5. Specialist Roles & Strict Delivery Sequence
1. **`backend-data-engineer`:** Schemas for resources, chunks, memories, relationships, and evidence links; deterministic persistence and APIs.
2. **`AGENT_MEMORY_TEAM_BRAIN` & `domain-logic-engineer`:** Chunking logic, schema validation, memory extraction, status state machine, relevance ranking, and context pack assembly.
3. **`notification-engineer`:** Ingestion status transitions, memory review notifications, and alert lifecycle.
4. **`frontend-engineer` (with `ux-architect`):**
   - Stage 1: Walking skeleton (Dashboard, Resource Ingestion, Memory Hub, Review, Context Generator).
   - Stage 2: Progressive wiring to real APIs.
5. **`qa-engineer`, `security-reviewer`, `final-verifier`:** Independent verification of data integrity, provenance accuracy, lack of mock data, and prompt injection defense.
