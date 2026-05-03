/**
 * Kai Subagent Harness v0.5.0
 *
 * Minimal agent loop. shell_exec is the universal tool.
 * LLM decides what shell commands to run. We execute them.
 *
 * Agents are auto-discovered from src/agents/*.ts
 * To add a new agent: create src/agents/<name>.ts with { name, prompt } exports.
 *
 * Usage:
 *   MIMO_API_KEY=xxx bun run src/agent.ts --agent <name> "query"
 *   MIMO_API_KEY=xxx bun run src/agent.ts "query"  (default: research)
 */

import { execSync } from "node:child_process";
import OpenAI from "openai";
import { loadAgents, type AgentDef } from "./agents/index";

// ─── Config ──────────────────────────────────────────────────

const CONFIG = {
  baseURL: process.env.MIMO_BASE_URL || "https://api.xiaomimimo.com/v1",
  apiKey: process.env.MIMO_API_KEY || "",
  model: process.env.MIMO_MODEL || "mimo-v2-flash",
  maxTokens: parseInt(process.env.MAX_TOKENS || "2048"),
  maxIterations: parseInt(process.env.MAX_ITERATIONS || "20"),
};

// ─── Shell Exec Tool ─────────────────────────────────────────

const SHELL_EXEC_TOOL = {
  type: "function" as const,
  function: {
    name: "shell_exec",
    description: "Execute a shell command and return stdout+stderr. 30s timeout. Output truncated to 15KB.",
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

// ─── Main Loop ───────────────────────────────────────────────

async function main() {
  const args = process.argv.slice(2);
  if (!args.length) {
    console.error(`Usage: bun run src/agent.ts [--agent <name>] "query"`);
    process.exit(1);
  }
  if (!CONFIG.apiKey) { console.error("Set MIMO_API_KEY"); process.exit(1); }

  const agents = loadAgents();
  const agentNames = Object.keys(agents);

  let agentKey = "research", query = args.join(" ");
  const ai = args.indexOf("--agent");
  if (ai !== -1 && args[ai + 1]) { agentKey = args[ai + 1]; query = args.slice(ai + 2).join(" "); }

  const agent = agents[agentKey];
  if (!agent) {
    console.error(`Unknown agent: "${agentKey}". Available: ${agentNames.join(", ")}`);
    process.exit(1);
  }

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
