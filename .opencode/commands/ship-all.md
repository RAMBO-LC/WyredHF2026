---
description: Autonomously implement, integrate, test, review and verify the complete product scope — backend first
agent: project-director
---

Execute the full project mission from `AUTONOMOUS_EXECUTION_PROMPT.md` and all project instructions. Delivery order is strict: **backend/data model → domain logic → notifications → frontend → polish**.

Begin by inspecting the repository (git status, tests, AGENTS.md, existing requirements, actual Memex MCP tools available). Establish a baseline; record pre-existing failures. Do not stop after planning.

**Phase 0 first:** Delegate to `frontend-engineer` (with `ux-architect`) to build a navigable skeleton the user can run immediately — every screen reachable, all navigation working, stub data visibly labelled `[stub]`/`[demo]`, no console errors. Backend work runs in parallel. The user evaluates the app shape from this point.

Then delegate bounded non-overlapping backend work in priority order:
1. `backend-data-engineer` — schema, migrations, APIs, persistence
2. `domain-logic-engineer` — scheduling, streaks, goals, fitness rules
3. `notification-engineer` — dynamic notifications tied to real state
4. `frontend-engineer` — functional, clear screens wired to real APIs

Make routine reversible decisions yourself; document assumptions. Integrate work, run tests/build/lint/typecheck, fix failures, and repeat. Use `qa-engineer` (backend → domain → notifications → frontend test order), `security-reviewer`, and `final-verifier` for independent verification.

Rules: no hardcoded data in normal flows; all notification state derived from real records; no static notification fixtures; frontend must handle loading/empty/error states with no dead-end navigation; zero-cost constraint; no push/publish/deploy/destructive ops without approval. Do not fabricate tool or test results.

Finish with evidence: exact command results, COMPLETE/PARTIAL/BLOCKED/NOT VERIFIED status per feature, and remaining risks.
