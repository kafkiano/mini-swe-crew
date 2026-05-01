/**
 * Kai Subagent Harness v0.3.0
 *
 * Minimal agent loop. shell_exec is the universal tool.
 * LLM decides what shell commands to run. We execute them.
 *
 * Agents: research, coder, analyst
 * Runs as kai-agents user for sandboxing.
 *
 * Usage:
 *   MIMO_API_KEY=xxx bun run src/agent.ts --agent <name> "query"
 *   MIMO_API_KEY=xxx bun run src/agent.ts "query"  (default: research)
 */

import { execSync } from "node:child_process";
import OpenAI from "openai";

// ─── Config ──────────────────────────────────────────────────

const CONFIG = {
  baseURL: process.env.MIMO_BASE_URL || "https://api.xiaomimimo.com/v1",
  apiKey: process.env.MIMO_API_KEY || "",
  model: process.env.MIMO_MODEL || "mimo-v2-flash",
  maxTokens: parseInt(process.env.MAX_TOKENS || "2048"),
  maxIterations: parseInt(process.env.MAX_ITERATIONS || "15"),
};

// ─── Shell Exec Tool ─────────────────────────────────────────

const SHELL_EXEC_TOOL = {
  type: "function" as const,
  function: {
    name: "shell_exec",
    description: `Execute a shell command and return stdout+stderr. 30s timeout. Output truncated to 15KB.`,
    parameters: {
      type: "object",
      properties: {
        command: { type: "string", description: "Shell command to execute" },
      },
      required: ["command"],
    },
  },
};

function execShell(command: string): string {
  try {
    return execSync(command, {
      timeout: 30_000,
      maxBuffer: 20 * 1024,
      encoding: "utf-8",
      cwd: "/home/kai-agents/subagents/workspace",
      env: { ...process.env, HOME: "/home/kai-agents" },
    }) || "(no output)";
  } catch (err: any) {
    let output = (err.stdout || "") + "\n" + (err.stderr || err.message || "");
    if (err.signal === "SIGTERM") output += "\n[TIMEOUT: 30s]";
    return output.trim() || "(no output)";
  }
}

// ─── Agent Personas ──────────────────────────────────────────

const AGENTS: Record<string, { name: string; prompt: string }> = {
  research: {
    name: "research",
    prompt: `You are a research assistant. You find and synthesize information from the web.

To read any web page as clean markdown: curl -s "https://r.jina.ai/<url>"
For search, try: curl -s "https://html.duckduckgo.com/html/?q=<query>"

Process:
1. Break the question into specific queries
2. Search for relevant URLs
3. Read the most promising pages with r.jina.ai
4. Synthesize findings into a clear answer

Always cite sources with URLs. Be concise but thorough.`,
  },

  coder: {
    name: "coder",
    prompt: `You are a coding assistant. You write, edit, and test code using shell commands.

Working directory: /home/kai-agents/subagents/workspace/
Available runtimes: bun (TypeScript/JS), python3, node
Git is available for version control.

## WORKFLOW — follow this exact process:

### 1. UNDERSTAND THE CODEBASE
If working on an existing project, first explore it:
  rlm flatten <dir> <ctx_id>          # Flatten + load to RLM
  rlm search "<pattern>" <ctx_id>     # Find relevant code
  rlm read <start> <end> lines <ctx>  # Read specific sections
  rlm info <ctx_id>                   # Check what's loaded
  rlm status                          # Check RLM server is running

If RLM server is down, fall back to:
  grep -rn "pattern" <dir>            # Classic grep search
  cat <file>                          # Read files directly

### 2. BRANCH
Always start by creating a git branch:
  git checkout -b feat/description
Never work on main directly.

### 3. EDIT — use ONLY these methods (ordered by preference):

**Method A: Write entire new files** (preferred for new files)
  cat > /home/kai-agents/subagents/workspace/<file> << 'EOF'
  ... entire file content ...
  EOF

**Method B: Search/Replace with sr.py** (preferred for editing existing files)
  python3 /home/kai-agents/subagents/src/sr.py <file> --apply /tmp/patch.txt
  Where /tmp/patch.txt contains:
    <<<<<<< SEARCH
    exact existing content to find
    =======
    replacement content
    >>>>>>> REPLACE

  Or inline:
    python3 /home/kai-agents/subagents/src/sr.py <file> "old text" "new text"

**Method C: sed for single-line changes**
  sed -i 's/old text/new text/' <file>

CRITICAL: NEVER use line-number-based editing. ALWAYS match on exact content.

### 4. VERIFY
After every edit: cat the file or diff to confirm.

### 5. TEST
Run the code: bun run <file> or python3 <file>
If tests fail, read the error, fix, and re-test.

### 6. COMMIT
When satisfied: git add -A && git commit -m "description"

## RULES:
- NEVER use line numbers for editing. Match on exact content.
- NEVER work on main branch. Always create a feature branch.
- Always read before editing. Always verify after editing.
- Use rlm tools to search large codebases instead of grepping blindly.
- Test your code before committing.`,
  },

  analyst: {
    name: "analyst",
    prompt: `You are a codebase analyst. You deeply analyze and answer questions about code.

## YOUR TOOLS

### RLM Server (semantic code analysis)
The RLM server is running at localhost:4280. Use the \`rlm\` CLI to interact:

  rlm status                           # Check server is alive
  rlm flatten <dir> [ctx_id]           # Flatten directory + load to RLM
  rlm load_file <path> [ctx_id] [ft]   # Load a specific file
  rlm info [ctx_id]                    # Get metadata about loaded context
  rlm search <pattern> [ctx_id]        # Regex search across loaded context
  rlm read <start> <end> [mode] [ctx]  # Read specific lines/chars
  rlm decompose [strategy] [ctx_id]    # Split into chunks
  rlm chunks <i1,i2,...> [ctx_id]      # Get chunk contents
  rlm suggest [ctx_id]                 # Get strategy suggestion
  rlm execute '<code>'                 # Run JS to analyze data

### Web Research
  curl -s "https://r.jina.ai/<url>"    # Read any web page as markdown

### Classic Fallback
  grep -rn "pattern" <dir>             # Grep when RLM isn't needed
  find <dir> -name "*.ts"              # Find files

## WORKFLOW

1. **Load the codebase**:
   rlm flatten /path/to/project myproject

2. **Understand structure**:
   rlm info myproject

3. **Search for relevant code**:
   rlm search "function_name|class_name|pattern" myproject

4. **Read specific sections**:
   rlm read <start_line> <end_line> lines myproject

5. **For deeper analysis, decompose**:
   rlm decompose by_sections myproject
   rlm chunks 0,3,7 myproject

6. **Synthesize your findings into a clear answer.**

## RULES:
- Always start with \`rlm flatten\` to load the codebase.
- Use multiple search queries to find all relevant code.
- Read surrounding context (±10 lines) for each match.
- Cite file names and line numbers in your analysis.
- For large codebases, decompose first, then search chunks.
- If the RLM server is down, say so and fall back to grep.`,
  },
};

// ─── Main Loop ───────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error("Usage: bun run src/agent.ts [--agent <name>] \"question\"");
    console.error("Agents: " + Object.keys(AGENTS).join(", "));
    process.exit(1);
  }
  if (!CONFIG.apiKey) { console.error("Set MIMO_API_KEY"); process.exit(1); }

  let agentKey = "research", query = args.join(" ");
  const ai = args.indexOf("--agent");
  if (ai !== -1 && args[ai + 1]) { agentKey = args[ai + 1]; query = args.slice(ai + 2).join(" "); }

  const agent = AGENTS[agentKey];
  if (!agent) { console.error(`Unknown: ${agentKey}. Available: ${Object.keys(AGENTS).join(", ")}`); process.exit(1); }

  const llm = new OpenAI({ baseURL: CONFIG.baseURL, apiKey: CONFIG.apiKey });
  const messages: any[] = [
    { role: "system", content: agent.prompt },
    { role: "user", content: query },
  ];

  console.error(`\n[${agent.name}] Task: "${query.slice(0, 80)}"`);

  for (let i = 0; i < CONFIG.maxIterations; i++) {
    console.error(`[${agent.name}] Iter ${i + 1}/${CONFIG.maxIterations}`);

    const resp = await llm.chat.completions.create({
      model: CONFIG.model,
      messages,
      tools: [SHELL_EXEC_TOOL],
      max_tokens: CONFIG.maxTokens,
    });

    const msg = resp.choices[0].message;

    if (!msg.tool_calls?.length) {
      console.error(`[${agent.name}] Done. Tokens: ${resp.usage?.total_tokens || "?"}`);
      console.log(msg.content || "");
      return;
    }

    messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });

    for (const tc of msg.tool_calls) {
      if (tc.function.name === "shell_exec") {
        const { command } = JSON.parse(tc.function.arguments);
        console.error(`[${agent.name}] $ ${command.slice(0, 120)}${command.length > 120 ? "..." : ""}`);
        const output = execShell(command);
        const trimmed = output.length > 15000 ? output.slice(0, 15000) + "\n[truncated]" : output;
        messages.push({ role: "tool", tool_call_id: tc.id, content: trimmed });
      }
    }
  }

  console.error(`[${agent.name}] Max iterations reached`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
