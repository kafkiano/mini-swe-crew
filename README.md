# Parliament

A growing assembly of autonomous agents — each with a single cognitive role,
unified by the shell.

Not a software engineering team. Not an org chart. A parliament.

## Architecture

Three layers. Clean separation.

```
┌─────────────────────────────────┐
│  Agents (cognitive roles)       │  Reasoning, identity, judgment
├─────────────────────────────────┤
│  Skills (procedural workflows)  │  How to do things. Markdown docs.
├─────────────────────────────────┤
│  Tools (deterministic scripts)  │  Bash. One function. JSON out.
└─────────────────────────────────┘
```

**Tools** are atoms. Bash scripts that do one thing and return structured
output. No magic, no ambiguity. `search.sh` ranks code search with BM25.
`sr.py` does content-aware find/replace. Deterministic and composable.

**Skills** are molecules. Markdown documents that describe multi-step
workflows — how to research the web, how to analyze a codebase, how to
edit and commit code. Agents reference them in their prompts. Update one
skill file, all agents that use it inherit the change.

**Agents** are organisms. Each has a name, a cognitive identity, a set of
rules, and references to the skills it needs. They share one universal
tool: `shell_exec`. The shell is the common language.

## Design Principles

- **No cascading.** Agents don't call agents. They report to the
  orchestrator (Kai). Flat hierarchy. Observability is non-negotiable.
- **Promotion, not planning.** A skill earns its place by being used.
  An agent earns harder tasks by proving itself. The git log is the
  parliamentary record.
- **UNIX fundamentalism.** Tools do one thing. Skills compose tools.
  Agents apply judgment. No framework worship — bash, awk, and grep
  are the primitives.
- **Bottom-up evolution.** Roles aren't designed on a whiteboard.
  They emerge from real needs. The gonzo journalist wasn't in the
  original plan. It arrived because it was needed.

## Current Agents

| Agent      | Role                              | Skills                                      |
|------------|-----------------------------------|---------------------------------------------|
| research   | Web research and synthesis        | web-research                                |
| coder      | Write, edit, and test code        | codebase-analysis, code-editing             |
| architect  | Systems analysis and planning     | codebase-analysis                           |
| analyst    | Deep codebase interrogation       | codebase-analysis                           |
| gonzo      | Fierce moralist with a scalpel    | web-research                                |

## Skills

```
/home/kai-agents/skills/
  search.md              — BM25 code/file search
  web-research.md        — Internet research protocol
  codebase-analysis.md   — RLM deep analysis workflow
  code-editing.md        — Search/replace editing + git
```

## Tools

| Tool             | What it does                                           |
|------------------|--------------------------------------------------------|
| `search.sh`      | BM25-ranked code search with subword tokenization      |
| `sr.py`          | Content-aware search/replace editor (no line numbers)  |
| `codebase-flatten` | Flatten a directory into a single text with FILE headers |

## Adding a New Agent

1. Create `src/agents/<name>.ts`
2. Export `name` and `prompt`
3. Reference skills from `/home/kai-agents/skills/` in the prompt
4. Add a standard discovery escape hatch:
   ```
   If none of your skills fit the task:
   ls /home/kai-agents/skills/
   Read anything that seems relevant.
   ```
5. That's it. Auto-discovered on next run.

## Adding a New Skill

1. Write a markdown doc in `/home/kai-agents/skills/`
2. Describe the workflow. Be specific — agents follow instructions literally.
3. Reference it in the prompts of agents that should use it.
4. If it works, it sticks. If not, delete it.

## Adding a New Tool

1. Write a bash script. One function, structured output (JSON preferred).
2. Place it in `/usr/local/bin/` or `/home/kai-agents/tools/`
3. Document usage in the relevant skill file.

## Running

```bash
# Set your API key
export MIMO_API_KEY="sk-..."

# Run an agent
bun run src/agent.ts --agent research "latest developments in RISC-V"
bun run src/agent.ts --agent architect "analyze the auth module"
bun run src/agent.ts --agent gonzo "write about the EU AI Act"
bun run src/agent.ts --agent coder "implement the search API"

# Default agent is research
bun run src/agent.ts "what is the current state of web components"
```

## Stack

- **Runtime:** [Bun](https://bun.sh/) — fast, native TypeScript
- **LLM:** [MiMo](https://api.xiaomimimo.com/v1) (Xiaomi) via OpenAI-compatible API
- **Universal tool:** `shell_exec` — the shell does everything
- **Infrastructure:** [RLM MCP Server](https://github.com/kafkiano/rlm-mcp) — context decomposition for large codebases

## License

Do whatever.
