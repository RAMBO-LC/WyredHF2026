---
description: Autonomously implement, integrate, test, review and verify the complete product scope — backend first
agent: project-director
---

Execute the full Team Brain project mission from `AUTONOMOUS_EXECUTION_PROMPT.md` and all project instructions. We are building **Team Brain**: a shared, persistent knowledge and memory system that turns scattered resources, decisions, bug fixes, conventions, and previous solutions into structured, evidence-backed knowledge and bounded context packages for humans and coding agents.
*Note: This is a memory and knowledge-management product, not a fitness tracker, habit tracker, streak application, or generic notification product.*

Delivery order is strict:
1. **Resource Ingestion & Persistence** (`backend-data-engineer`): schema for resources, chunks, memories, relationships, and evidence.
2. **Memory Engine & Smart Knowledge Management** (`AGENT_MEMORY_TEAM_BRAIN` & `domain-logic-engineer`): extraction from resources, runtime validation, status transitions, retrieval/search, bounded graph traversal.
3. **Context Engine** (`AGENT_MEMORY_TEAM_BRAIN` & `domain-logic-engineer`): assembling bounded, task-specific context packages (`context.md`) with full provenance transparency.
4. **Ingestion & Review Alerts** (`notification-engineer`): processing status transitions, memory review notifications.
5. **Frontend Screens** (`frontend-engineer` with `ux-architect`): Phase 0 skeleton first (Resource Ingestion, Memory Hub, Review/Approval, Context Pack Generator), then progressive wiring to real APIs.
6. **Integration, QA & Verification** (`qa-engineer`, `security-reviewer`, `final-verifier`).

Begin by inspecting the repository (git status, tests, AGENTS.md, existing requirements). Establish a baseline; record pre-existing failures. Do not stop after planning.

**Phase 0 first:** Delegate to `frontend-engineer` (with `ux-architect`) to build a navigable skeleton the user can run immediately — every screen reachable (Dashboard, Resource Ingestion, Memory Hub, Review, Context Generator), all navigation working, stub data visibly labelled `[stub]`/`[demo]`, no console errors. Backend and memory work runs in parallel.

Then execute the required end-to-end workflow:
**Register resource → persist source → normalize/chunk content → propose structured memories → validate evidence → store memories and relationships → search relevant knowledge → generate task-specific context → verify output and provenance.**

Make routine reversible decisions yourself; document assumptions. Integrate work, run tests/build/lint/typecheck, fix failures, and repeat. Use `qa-engineer`, `security-reviewer`, and `final-verifier` for independent verification.

Rules: no hardcoded mock data in normal flows; all citations tied to real persisted resources/chunks; no hallucinated evidence; frontend must handle loading/empty/error states with no dead-end navigation; zero-cost constraint (free/local tiers); no push/publish/deploy/destructive ops without approval. Do not fabricate tool or test results.

Finish with evidence: exact command results, COMPLETE/PARTIAL/BLOCKED/NOT VERIFIED status per feature, and remaining risks.
