# Serenique AI Agent Team

This directory holds Serenique's domain-expert Agents (opencode subagent specs). **The captain = the main session (opencode build agent)**, responsible for breaking down requirements, dispatching tasks, aligning contracts, acceptance, and integration.

## Members

| Agent | File | Domain | Trigger signals |
|---|---|---|---|
| API Agent | `api-agent.md` | `services/api` (Bun + Hono + Drizzle) | REST endpoints, tables/migrations, service layer, validation, tests, `exports.ts` |
| MCP Agent | `mcp-agent.md` | `services/mcp` (MCP SDK + streamable-http) | New tools, tool exposure surface, wiring service capabilities into AI |
| CLI Agent | `cli-agent.md` | `apps/cli` (Go + cobra) | Command features, new modules, config, output, transfers |
| Web Agent | `web-agent.md` | `apps/web` (React 19 + Vite + shadcn/ui) | Pages, routes, features, forms, server state |
| Deploy Agent | `deploy-agent.md` | Docker / GitHub Actions / releases | Images, compose, CI workflows, tag releases, servers |
| Flutter Agent | `flutter-agent.md` | Flutter mobile (planned, iOS/Android) | Mobile requirements, mobile architecture design |

## Captain workflow (opencode)

1. **Break down**: understand the requirement, identify affected subsystems (one requirement often spans multiple clients, e.g. a new module → API + MCP + CLI + Web)
2. **Pin the contract**: anchor the cross-client contract to the `services/api` workspace source (field names, response shapes, `exports.ts` export surface)
3. **Dispatch**: dispatch the corresponding Agents for affected subsystems **in parallel** — launching multiple Task tool calls in the same message (`subagent_type` pointing to an agent name in this directory, i.e. the `*`-prefixed names) runs them in parallel
4. **Accept**: verify each Agent's returned changes match the contract; run per-client validation (typecheck / test / build)
5. **Integrate and wrap up**: merge changes coherently, add cross-client sync changes (e.g. field renames), write `.ai/worklog/`

## How to invoke

- **Subagent dispatch**: the captain invokes via the Task tool, e.g. `subagent_type: "api-agent"`; the agent returns a single summary message when done
- **Manual invocation**: trigger directly with `@api-agent` in the conversation (@ auto-completion lists all subagents)
- **Model**: defaults to inheriting the main agent's model; to pin one, set `model: <provider>/<model-id>` in the respective frontmatter

## Shared rules (built into every Agent's prompt)

- **Permissions**: any Agent that omits the `permission` field inherits all tools (same as the captain); add `permission: { edit: deny }` for read-only
- **Tech stack**: each prompt is scoped to that client's current stack
- **Memory**: read the latest `.ai/architecture|decisions|worklog` docs before starting work; write worklog entries after finishing to capture pitfalls and hints
- **Language**: all user-visible copy must be in Chinese
- **Contract source**: cross-client fields follow the `services/api` source code, not the output of a running container
