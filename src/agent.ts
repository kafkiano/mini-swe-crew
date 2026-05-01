import { execSync } from "node:child_process";
import OpenAI from "openai";

const CONFIG = {
  baseURL: process.env.MIMO_BASE_URL || "https://api.xiaomimimo.com/v1",
  apiKey: process.env.MIMO_API_KEY || "",
  model: process.env.MIMO_MODEL || "mimo-v2-flash",
  maxTokens: parseInt(process.env.MAX_TOKENS || "2048"),
  maxIterations: parseInt(process.env.MAX_ITERATIONS || "12"),
};

const SHELL_EXEC_TOOL = {
  type: "function" as const,
  function: {
    name: "shell_exec",
    description: "Execute a shell command and return stdout/stderr. Use curl -s https://r.jina.ai/<url> to read web pages as clean markdown (FREE, no API key).",
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

const AGENTS: Record<string, { name: string; prompt: string }> = {
  research: {
    name: "research",
    prompt: `You are a research assistant. You find and synthesize information from the web.

To read any web page as clean markdown: curl -s "https://r.jina.ai/<url>"
For search, try: curl -s "https://html.duckduckgo.com/html/?q=<query>"

Always cite sources. Be concise.`,
  },
};

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) { console.error("Usage: bun run src/agent.ts \"question\""); process.exit(1); }
  if (!CONFIG.apiKey) { console.error("Set MIMO_API_KEY"); process.exit(1); }

  let agentKey = "research", query = args.join(" ");
  const ai = args.indexOf("--agent");
  if (ai !== -1 && args[ai + 1]) { agentKey = args[ai + 1]; query = args.slice(ai + 2).join(" "); }

  const agent = AGENTS[agentKey];
  if (!agent) { console.error(`Unknown agent: ${agentKey}. Available: ${Object.keys(AGENTS).join(", ")}`); process.exit(1); }

  const llm = new OpenAI({ baseURL: CONFIG.baseURL, apiKey: CONFIG.apiKey });
  const messages: any[] = [
    { role: "system", content: agent.prompt },
    { role: "user", content: query },
  ];

  console.error(`[${agent.name}] Task: "${query.slice(0, 80)}"`);

  for (let i = 0; i < CONFIG.maxIterations; i++) {
    console.error(`[${agent.name}] Iter ${i + 1}/${CONFIG.maxIterations}`);
    console.error(`[${agent.name}] Calling LLM...`);

    const resp = await llm.chat.completions.create({
      model: CONFIG.model,
      messages,
      tools: [SHELL_EXEC_TOOL],
      max_tokens: CONFIG.maxTokens,
    });

    console.error(`[${agent.name}] LLM responded (tokens: ${resp.usage?.total_tokens})`);
    const msg = resp.choices[0].message;

    if (!msg.tool_calls?.length) {
      console.error(`[${agent.name}] Done.`);
      console.log(msg.content || "");
      return;
    }

    messages.push({ role: "assistant", content: msg.content || "", tool_calls: msg.tool_calls });

    for (const tc of msg.tool_calls) {
      if (tc.function.name === "shell_exec") {
        const { command } = JSON.parse(tc.function.arguments);
        console.error(`[${agent.name}] $ ${command.slice(0, 120)}`);
        const output = execShell(command);
        const trimmed = output.length > 15000 ? output.slice(0, 15000) + "\n[truncated]" : output;
        messages.push({ role: "tool", tool_call_id: tc.id, content: trimmed });
      }
    }
  }

  console.error(`[${agent.name}] Max iterations reached`);
}

main().catch(e => { console.error("Fatal:", e); process.exit(1); });
