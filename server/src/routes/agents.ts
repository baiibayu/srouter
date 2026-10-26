import { Router } from 'express';
import type { Request, Response } from 'express';
import { detectAllAgents, type AgentDetection } from '../lib/agent-detection.js';

export const agentsRouter = Router();

// Per-agent config-file detection for the dashboard's Agents page. Reads the
// same config paths the CLI generators write (cli/src/tools.ts) and answers
// whether each agent is installed and whether its config points at this
// gateway. Best-effort: env-var agents (OpenClaude, AtomCode) and guide-only
// agents (Cursor, Zed, JetBrains, Generic) report no config file.
agentsRouter.get('/detection', (_req: Request, res: Response) => {
  const agents: AgentDetection[] = detectAllAgents();
  res.json({ agents });
});