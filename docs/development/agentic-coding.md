# Agentic coding

| Resource | Purpose |
| --- | --- |
| [AGENTS.md](../../AGENTS.md) | Repository rules for coding agents, including approval boundaries and required validation. |
| [Skills](../../.agents/skills/) | Reusable task workflows. Read each skill's `SKILL.md` for its scope and instructions. |
| [Hooks](../../.codex/hooks.json) | Codex prompt and stop hooks for frontend and backend app and tooling validation. |
| [Codex configuration](../../.codex/config.toml) | Project MCP connections for Angular CLI, OpenAI documentation, and Playwright tests. |

For larger changes, use `concept-creator` to explore the direction and `prepare-spec` to agree on a scoped spec. For each approved milestone, `deliver-spec` coordinates Delivery, then independent Test with `test-delivery`, then Review with `review-delivery`. Invoke the spec and delivery skills explicitly.

Follow [AGENTS.md](../../AGENTS.md#temporary-ai-artifacts) when storing temporary concepts, specs, and plans.

Review and trust hooks in Codex before relying on them. When the stop hook detects changes in a validation scope, it formats and lints the applicable scopes, checks generated contract freshness, and runs the full non-E2E suite. Prepare the [validation dependencies](validation.md#combined-validation) first. Logs are under `.codex-validation/` at the repository root. Update absolute paths in [.codex/hooks.json](../../.codex/hooks.json) when relocating the checkout.

Use `/skills` and `/hooks` to inspect them in the Codex CLI; see the [official command reference](https://learn.chatgpt.com/docs/developer-commands).
