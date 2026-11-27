---
name: concept-creator
description: Develop a pitch for an idea, feature, issue, or change into a temporary Markdown concept in `concepts/` through one-at-a-time discussion of open questions and details.
---

# Concept Creator

Use the user's pitch to start a concept session. Starting the session authorizes creating the concept outline and updating the same file throughout the discussion.

1. Identify the target repository root, including in nested workspaces. Read applicable instructions and focus your lookup on code and documentation relevant to the pitch. Check related repositories when they materially affect the concept.
2. Create a short Markdown outline in the target repository's `concepts/` directory. Follow its naming convention or use `<short-kebab-title>.md`. Ground it in the pitch and findings, with a brief problem and goal and an agenda focused on open questions and details.
3. Discuss one open question or detail at a time. Follow the user's choice of topic. Otherwise prioritize what most affects the direction or unblocks later decisions. Provide relevant context, alternatives, or tradeoffs as needed, then wait for the user's input.
4. Record a clear user decision as settled. Keep ambiguous or provisional points open and ask a focused follow-up as needed. Leave material decisions to the user and record any points they defer or skip. Update the same file with decisions, emerging questions and details, and relevant findings. Briefly recap each recorded decision in chat so the user can correct it. You can raise the next topic in the same reply.
5. When the agenda is exhausted, check for missed questions, details, and contradictions. Add any unresolved items and continue the discussion. Otherwise finalize the file and share a brief concept summary, its path, any skipped or deferred points, and your assessment of readiness. Invite the user to accept the concept or reopen the discussion.

## Document Shaping

Follow the local concept style when useful. Include scope, direction, alternatives, ownership, integration impact, and risks where material. Distinguish findings, assumptions, proposals, and agreed decisions. Keep the document current by replacing stale conclusions and omit empty sections. Include implementation detail only when it explains feasibility, a tradeoff, or an integration boundary. Implementation requires separate authorization, and the concept does not substitute for an implementation-ready spec.
