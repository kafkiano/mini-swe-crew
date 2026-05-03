/**
 * Agent registry — auto-discovers all agent modules in this directory.
 * Each agent exports: { name: string, prompt: string }
 * To add a new agent: create a .ts file here with name + prompt exports. Done.
 */

import { readdirSync } from "node:fs";
import { join, basename } from "node:path";

export interface AgentDef {
  name: string;
  prompt: string;
}

export function loadAgents(): Record<string, AgentDef> {
  const agents: Record<string, AgentDef> = {};
  const dir = __dirname;

  for (const file of readdirSync(dir)) {
    if (file === "index.ts" || file === "index.js" || !file.endsWith(".ts") && !file.endsWith(".js")) continue;
    const mod = require(join(dir, file));
    if (mod.name && mod.prompt) {
      agents[mod.name] = { name: mod.name, prompt: mod.prompt };
    }
  }

  return agents;
}
