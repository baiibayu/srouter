import { Router } from 'express';
import type { Request, Response } from 'express';
import { detectAgent, detectAllAgents, type AgentDetection } from '../lib/agent-detection.js';
import { setupAgent, resetAgent } from '../lib/agent-setup.js';
import { getUnifiedApiKey } from '../db/index.js';

export const agentsRouter = Router();

// Per-agent config-file detection for the dashboard's Agents page. Reads the
// same config paths the CLI generators write (cli/src/tools.ts) and answers
// whether each agent is installed and whether its config points at this
// gateway.
agentsRouter.get('/detection', (_req: Request, res: Response) => {
  const agents: AgentDetection[] = detectAllAgents();
  res.json({ agents });
});

// Run automated configuration injection for an agent
agentsRouter.post('/:id/setup', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: { message: 'Agent ID is required' } });
    return;
  }

  const detection = detectAgent(id);
  if (!detection.installed) {
    res.status(400).json({
      error: { message: `Agent '${id}' is not installed on this system. Please install it first.` },
    });
    return;
  }

  const host = req.get('host') || `localhost:${process.env.PORT || 20268}`;
  const protocol = req.protocol || 'http';
  const url = `${protocol}://${host}`;
  let apiKey: string | undefined;
  try {
    apiKey = getUnifiedApiKey();
  } catch {
    // If db not ready
  }

  try {
    const result = await setupAgent(id, { url, apiKey });
    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: { message: err.message || 'Setup failed' } });
  }
});

// Reset configuration and unlink an agent
agentsRouter.post('/:id/reset', async (req: Request, res: Response) => {
  const { id } = req.params;
  if (!id || typeof id !== 'string') {
    res.status(400).json({ error: { message: 'Agent ID is required' } });
    return;
  }

  try {
    const result = await resetAgent(id);
    res.json(result);
  } catch (error: unknown) {
    const err = error as Error;
    res.status(500).json({ error: { message: err.message || 'Reset failed' } });
  }
});
