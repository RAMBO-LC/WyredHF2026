# OneBrain

**Teams forget what they learn. OneBrain remembers it, shows where it came from, and hands the right parts to the people and AI tools that need them.**

---

## The problem we are solving

Software teams produce a large amount of knowledge every day, and most of it disappears.

- A bug takes three days to diagnose. The fix is one line, and the reasoning lives only in one engineer's head.
- A decision is made in a meeting, argued in a pull request, and then forgotten. Six months later someone reverses it without knowing why it was made.
- A teammate goes on leave. The project stalls, not because the work is hard, but because nobody can see what was tried, what failed, and what is still open.
- A new developer asks the same question that was answered last spring, in a channel no one can search.
- An AI coding assistant starts every task from zero. It repeats mistakes the team already solved, ignores constraints the team agreed to, and invents conventions the project does not follow.

The knowledge exists. It is scattered across notes, chats, documents, commits, and memories, and no one can trust it enough to rely on it, because nothing shows which statements are still true, who approved them, or what evidence supports them.

## What we believe

1. **Knowledge should be checkable.** Every statement a team relies on should point to the exact words in the source that support it.
2. **Machines may suggest, but people decide.** An AI can propose what the team learned. Only a person can make it team knowledge.
3. **Failures are knowledge too.** Dead ends, rejected approaches, and wrong turns are as valuable as the answer that worked.
4. **Work should remain yours.** A person's private notes and sessions belong to them. Sharing is a deliberate act, not a default.
5. **Knowledge should outlive the moment.** When a problem is solved, the path to the solution should be kept, not just the answer.

## Who it is for

- **Developers** who want to find what the team already knows before they start a task.
- **Team leads and engineering managers** who need to understand what their team has learned, and what is still open, without interrupting people.
- **QA and release engineers** who need to know which fixes were verified and which constraints apply to a release.
- **New team members** who need to get up to speed without reading everything.
- **Anyone working with AI coding tools** who wants those tools to start from what the team actually knows.

## Where it works

OneBrain is designed to run on your own machine, or on a team server you control. Its core functions do not require an internet connection or a paid service. A local language model can be added for richer summaries, but every result that matters can be produced without one. Anything sent to an online provider must be explicitly allowed for that feature.

## What makes it different

Most tools that store team knowledge treat it as text to be searched. OneBrain treats it as **evidence to be verified**.

- Memories are proposed, reviewed, approved, superseded, or archived, and each change is recorded.
- Each memory is tied to a verified passage in a real source, with its location.
- Conflicts between approved statements are flagged for a person to resolve, never resolved silently.
- Answers and context packages show what they used, what they left out, and when the team has no evidence at all.
- A person's private work and a team's shared knowledge are kept separate, and every access to a shared brain is visible to its owner.

## Principles we will not compromise

- **No invented evidence.** If a claim cannot be traced to a source, it is not stored as a fact.
- **No silent changes.** Feedback, models, and automation never rewrite what the team has approved.
- **No surveillance by design.** OneBrain does not score, rank, or measure people by their activity.
- **Private by default.** Personal work stays with its owner unless the owner chooses otherwise.
- **Honest limits.** Where the system cannot know something, it says so.

## Status

OneBrain is in active design and early build. The architecture, data rules, and verification plan are specified in detail. Features are being built in gated stages, and each stage is accepted only when its tests pass and its results are recorded.

## Project documents

| Document | Purpose |
|---|---|
| `docs/SPEC.md` | The authoritative specification |
| `docs/DECISIONS.md` | Recorded decisions and their reasons |
| `docs/FEATURE_STATUS.md` | What works, what does not, and the evidence for each |
| `docs/design/` | Open design questions and recommendations |
| `docs/evidence/` | Saved test and acceptance output |

## License

To be decided by the project owners before public release.
