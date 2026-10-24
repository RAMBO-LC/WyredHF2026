# Team Brain — Project & Agent Instructions

## Product Objective
We are building **Team Brain**: a shared, persistent knowledge and memory system that helps a team retain, connect, retrieve, and reuse knowledge across projects, documents, decisions, bugs, and coding sessions.

Important knowledge becomes scattered across Markdown files, source code, documents, conversations, previous debugging sessions, and individual team members' understanding. Team Brain transforms that scattered information into searchable, evidence-backed, reusable knowledge.

**Core Promise:** Team Brain turns a team's scattered resources, previous solutions, decisions, and project knowledge into shared intelligence that helps people and AI coding agents understand what the team already knows.
*Note: This is a memory and knowledge-management product, not a fitness tracker, habit tracker, streak application, or generic notification product.*

## Component Ownership
- **Memory System, Knowledge Management, & Context Engine (`AGENT_MEMORY_TEAM_BRAIN.md`):** Primary owner of memory extraction, categories (`decision`, `bug_fix`, `lesson`, `convention`, `reference`, `task_outcome`), evidence links, status lifecycle (`suggested`, `approved`, `superseded`, `archived`), bounded context pack generation (`context.md`), and provenance transparency.
- **Resource Management & Backend (`backend-data-engineer.md`):** Schemas for resources, chunks, memory records, relationships, and evidence links; idempotent ingestion; migrations.
- **Domain Logic (`domain-logic-engineer.md`):** Chunking algorithms, schema validation, state machines, relationship graph rules, and ranking.
- **Ingestion & Review Alerts (`notification-engineer.md`):** Asynchronous processing status transitions and review alerts.
- **Frontend Views (`frontend-engineer.md` & `ux-architect.md`):** Stage 1 skeleton and Stage 2 wiring for Dashboard, Resource Ingestion, Memory Hub, Review Queue, and Context Pack Generator.
- **Verification & Gates (`qa-engineer.md`, `security-reviewer.md`, `final-verifier.md`):** Verification of the end-to-end connected workflow with zero hardcoded mock data and zero hallucinations.

## Required End-to-End Workflow
**Register resource → persist source → normalize/chunk content → propose structured memories → validate evidence → store memories and relationships → search relevant knowledge → generate task-specific context → verify output and provenance.**

Refer to [`.opencode/agents/AGENTS.md`](file:///.opencode/agents/AGENTS.md) for DevRelay rules and [`.opencode/agents/AGENT_MEMORY_TEAM_BRAIN.md`](file:///.opencode/agents/AGENT_MEMORY_TEAM_BRAIN.md) for full memory engine specifications.
