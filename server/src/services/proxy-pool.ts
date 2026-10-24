import { getDb } from '../db/index.js';
import zlib from 'node:zlib';
import type { ProxyPoolNode, ProxyPoolProtocol, ProxyPoolStatus, ProxyPoolStrategy, ProxyPoolRole } from '@baiibayu/srouter-shared/types.js';
import { probeProxyUrl, registerProxyNodeSelector } from '../lib/proxy.js';
import { PROXY_POOLS_STRATEGY_SETTING } from '../db/migrations/20261023_000001_proxy_pools.js';

let roundRobinIndex = 0;

export const CLOUDFLARE_WORKER_SCRIPT = `
export default {
  async fetch(request, env, ctx) {
    const target = request.headers.get("x-relay-target") || request.headers.get("Fetch-Relay-Target");
    const relayPath = request.headers.get("x-relay-path") || "";

    if (!target) {
      return new Response(JSON.stringify({ error: "Missing x-relay-target / Fetch-Relay-Target header" }), {
        status: 400,
        headers: { "content-type": "application/json" },
      });
    }

    const targetUrl = target.replace(/\\/$/, "") + relayPath;
    const newHeaders = new Headers(request.headers);
    newHeaders.delete("x-relay-target");
    newHeaders.delete("x-relay-path");
    newHeaders.delete("fetch-relay-target");
    newHeaders.delete("fetch-relay-authorization");
    newHeaders.delete("host");

    const newRequestInit = {
      method: request.method,
      headers: newHeaders,
    };

    if (request.method !== "GET" && request.method !== "HEAD") {
      newRequestInit.body = request.body;
      newRequestInit.duplex = "half";
    }

    try {
      const response = await fetch(targetUrl, newRequestInit);
      return new Response(response.body, {
        status: response.status,
        headers: response.headers,
      });
    } catch (error) {
      return new Response(JSON.stringify({ error: error.message || "Relay fetch failed" }), {
        status: 502,
        headers: { "content-type": "application/json" },
      });
    }
  },
};
`.trim();

export const VERCEL_EDGE_SCRIPT = `
export const config = { runtime: "edge" };

export default async function handler(req) {
  const target = req.headers.get("x-relay-target") || req.headers.get("Fetch-Relay-Target");
  const relayPath = req.headers.get("x-relay-path") || "";
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing x-relay-target / Fetch-Relay-Target header" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const targetUrl = target.replace(/\\/$/, "") + relayPath;

  const rawHeaders = {};
  for (const [k, v] of req.headers.entries()) {
    const l = k.toLowerCase();
    if (l !== "x-relay-target" && l !== "x-relay-path" && l !== "fetch-relay-target" && l !== "fetch-relay-authorization" && l !== "host") {
      rawHeaders[k] = v;
    }
  }

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers: rawHeaders,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
      duplex: "half",
    });

    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Relay fetch failed" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
}
`.trim();

export const DENO_DEPLOY_SCRIPT = `
Deno.serve(async (req) => {
  const target = req.headers.get("x-relay-target") || req.headers.get("Fetch-Relay-Target");
  const relayPath = req.headers.get("x-relay-path") || "";
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing x-relay-target / Fetch-Relay-Target header" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const targetUrl = target.replace(/\\/$/, "") + relayPath;
  const headers = new Headers(req.headers);
  headers.delete("x-relay-target");
  headers.delete("x-relay-path");
  headers.delete("fetch-relay-target");
  headers.delete("fetch-relay-authorization");
  headers.delete("host");

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    });
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Relay fetch failed" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
});
`.trim();

export const NETLIFY_EDGE_SCRIPT = `
export default async (req) => {
  const target = req.headers.get("x-relay-target") || req.headers.get("Fetch-Relay-Target");
  const relayPath = req.headers.get("x-relay-path") || "";
  if (!target) {
    return new Response(JSON.stringify({ error: "Missing x-relay-target / Fetch-Relay-Target header" }), {
      status: 400,
      headers: { "content-type": "application/json" },
    });
  }

  const targetUrl = target.replace(/\\/$/, "") + relayPath;
  const headers = new Headers(req.headers);
  headers.delete("x-relay-target");
  headers.delete("x-relay-path");
  headers.delete("fetch-relay-target");
  headers.delete("fetch-relay-authorization");
  headers.delete("host");

  try {
    const response = await fetch(targetUrl, {
      method: req.method,
      headers,
      body: req.method !== "GET" && req.method !== "HEAD" ? req.body : undefined,
    });
    return new Response(response.body, {
      status: response.status,
      headers: response.headers,
    });
  } catch (error) {
    return new Response(JSON.stringify({ error: error.message || "Relay fetch failed" }), {
      status: 502,
      headers: { "content-type": "application/json" },
    });
  }
};
export const config = { path: "/*" };
`.trim();

interface DbProxyRow {
  id: string;
  name: string;
  url: string;
  protocol: string;
  auth_token: string | null;
  enabled: number;
  status: string;
  latency_ms: number | null;
  last_tested_at: string | null;
  last_error: string | null;
  role?: string | null;
  targeted_platforms?: string | null;
  endpoints?: string | null;
  cluster_index?: number | null;
  created_at: string;
  updated_at: string;
}

function mapRow(r: DbProxyRow): ProxyPoolNode {
  let targetedPlatforms: string[] | null = null;
  if (r.targeted_platforms) {
    try {
      targetedPlatforms = JSON.parse(r.targeted_platforms);
    } catch {
      targetedPlatforms = null;
    }
  }

  let endpoints: string[] | null = null;
  if (r.endpoints) {
    try {
      endpoints = JSON.parse(r.endpoints);
    } catch {
      endpoints = null;
    }
  }

  return {
    id: r.id,
    name: r.name,
    url: r.url,
    protocol: r.protocol as ProxyPoolProtocol,
    authToken: r.auth_token,
    enabled: r.enabled === 1,
    status: r.status as ProxyPoolStatus,
    latencyMs: r.latency_ms,
    lastTestedAt: r.last_tested_at,
    lastError: r.last_error,
    role: (r.role as ProxyPoolRole) || 'primary',
    targetedPlatforms,
    endpoints,
    clusterIndex: r.cluster_index ?? 0,
    createdAt: r.created_at,
    updatedAt: r.updated_at,
  };
}

export function getProxyPoolStrategy(): ProxyPoolStrategy {
  try {
    const row = getDb().prepare('SELECT value FROM settings WHERE key = ?').get(PROXY_POOLS_STRATEGY_SETTING) as { value: string } | undefined;
    const val = (row?.value ?? 'round-robin').toLowerCase();
    if (val === 'random' || val === 'forward' || val === 'round-robin') return val;
    return 'round-robin';
  } catch {
    return 'round-robin';
  }
}

export function setProxyPoolStrategy(strategy: ProxyPoolStrategy): void {
  const db = getDb();
  db.prepare(`
    INSERT INTO settings (key, value) VALUES (?, ?)
    ON CONFLICT(key) DO UPDATE SET value = excluded.value
  `).run(PROXY_POOLS_STRATEGY_SETTING, strategy);
}

export function getProxyPoolNodes(): ProxyPoolNode[] {
  try {
    const rows = getDb().prepare(`
      SELECT * FROM proxy_pools ORDER BY created_at ASC
    `).all() as DbProxyRow[];
    return rows.map(mapRow);
  } catch {
    return [];
  }
}

export function getActiveProxyPoolNodes(): ProxyPoolNode[] {
  try {
    const rows = getDb().prepare(`
      SELECT * FROM proxy_pools
      WHERE enabled = 1
      ORDER BY created_at ASC
    `).all() as DbProxyRow[];
    const mapped = rows.map(mapRow);
    // Prioritize active (tested ok) nodes. If none are tested active yet, allow untested nodes
    const activeNodes = mapped.filter(n => n.status === 'active');
    if (activeNodes.length > 0) return activeNodes;
    const nonErrorNodes = mapped.filter(n => n.status !== 'error');
    if (nonErrorNodes.length > 0) return nonErrorNodes;
    return mapped;
  } catch {
    return [];
  }
}

export function addProxyPoolNode(node: {
  name: string;
  url: string;
  protocol?: ProxyPoolProtocol;
  authToken?: string | null;
  enabled?: boolean;
  role?: ProxyPoolRole;
  targetedPlatforms?: string[] | null;
  endpoints?: string[] | null;
}): ProxyPoolNode {
  const db = getDb();
  const id = `proxy_${globalThis.crypto.randomUUID().replace(/-/g, '').slice(0, 16)}`;
  const url = node.url.trim();
  const name = node.name.trim() || `Proxy ${id.slice(-4)}`;
  const protocol = node.protocol ?? (
    /^socks[45]h?:\/\//i.test(url) ? 'socks5' : (url.includes('relay') || url.includes('workers.dev') || url.includes('vercel.app') ? 'fetch-relay' : 'http')
  );
  const now = new Date().toISOString();
  const enabled = node.enabled !== false ? 1 : 0;
  const role = node.role || 'primary';
  const targetedPlatforms = node.targetedPlatforms ? JSON.stringify(node.targetedPlatforms) : null;
  const endpoints = node.endpoints ? JSON.stringify(node.endpoints) : null;

  db.prepare(`
    INSERT INTO proxy_pools (id, name, url, protocol, auth_token, enabled, status, role, targeted_platforms, endpoints, cluster_index, created_at, updated_at)
    VALUES (?, ?, ?, ?, ?, ?, 'untested', ?, ?, ?, 0, ?, ?)
  `).run(id, name, url, protocol, node.authToken?.trim() || null, enabled, role, targetedPlatforms, endpoints, now, now);

  const row = db.prepare('SELECT * FROM proxy_pools WHERE id = ?').get(id) as DbProxyRow;
  return mapRow(row);
}

export function updateProxyPoolNode(id: string, patch: {
  name?: string;
  url?: string;
  protocol?: ProxyPoolProtocol;
  authToken?: string | null;
  enabled?: boolean;
  status?: ProxyPoolStatus;
  latencyMs?: number | null;
  lastTestedAt?: string | null;
  lastError?: string | null;
  role?: ProxyPoolRole;
  targetedPlatforms?: string[] | null;
  endpoints?: string[] | null;
}): ProxyPoolNode | null {
  const db = getDb();
  const existing = db.prepare('SELECT * FROM proxy_pools WHERE id = ?').get(id) as DbProxyRow | undefined;
  if (!existing) return null;

  const now = new Date().toISOString();
  const name = patch.name !== undefined ? patch.name.trim() : existing.name;
  const url = patch.url !== undefined ? patch.url.trim() : existing.url;
  const protocol = patch.protocol !== undefined ? patch.protocol : existing.protocol;
  const authToken = patch.authToken !== undefined ? (patch.authToken ? patch.authToken.trim() : null) : existing.auth_token;
  const enabled = patch.enabled !== undefined ? (patch.enabled ? 1 : 0) : existing.enabled;
  const status = patch.status !== undefined ? patch.status : existing.status;
  const latencyMs = patch.latencyMs !== undefined ? patch.latencyMs : existing.latency_ms;
  const lastTestedAt = patch.lastTestedAt !== undefined ? patch.lastTestedAt : existing.last_tested_at;
  const lastError = patch.lastError !== undefined ? patch.lastError : existing.last_error;
  const role = patch.role !== undefined ? patch.role : (existing.role || 'primary');
  const targetedPlatforms = patch.targetedPlatforms !== undefined
    ? (patch.targetedPlatforms ? JSON.stringify(patch.targetedPlatforms) : null)
    : existing.targeted_platforms;
  const endpoints = patch.endpoints !== undefined
    ? (patch.endpoints ? JSON.stringify(patch.endpoints) : null)
    : existing.endpoints;

  db.prepare(`
    UPDATE proxy_pools
    SET name = ?, url = ?, protocol = ?, auth_token = ?, enabled = ?,
        status = ?, latency_ms = ?, last_tested_at = ?, last_error = ?,
        role = ?, targeted_platforms = ?, endpoints = ?, updated_at = ?
    WHERE id = ?
  `).run(name, url, protocol, authToken, enabled, status, latencyMs, lastTestedAt, lastError, role, targetedPlatforms, endpoints, now, id);

  const row = db.prepare('SELECT * FROM proxy_pools WHERE id = ?').get(id) as DbProxyRow;
  return mapRow(row);
}

export function deleteProxyPoolNode(id: string): boolean {
  const res = getDb().prepare('DELETE FROM proxy_pools WHERE id = ?').run(id);
  return res.changes > 0;
}

export async function testProxyPoolNode(id: string): Promise<{
  ok: boolean;
  latencyMs: number;
  status?: number;
  error?: string;
  target?: string;
}> {
  const db = getDb();
  const row = db.prepare('SELECT * FROM proxy_pools WHERE id = ?').get(id) as DbProxyRow | undefined;
  if (!row) return { ok: false, latencyMs: 0, error: 'Proxy node not found' };

  const mode = row.protocol === 'fetch-relay' ? 'fetch-relay' : 'forward';
  const testUrl = row.endpoints ? (JSON.parse(row.endpoints)[0] || row.url) : row.url;
  const result = await probeProxyUrl(testUrl, {
    mode,
    relayToken: row.auth_token ?? undefined,
    timeoutMs: 10_000,
  });

  const now = new Date().toISOString();
  const newStatus: ProxyPoolStatus = result.ok ? 'active' : 'error';
  const lastError = result.ok ? null : (result.error ?? `HTTP ${result.status}`);

  db.prepare(`
    UPDATE proxy_pools
    SET status = ?, latency_ms = ?, last_tested_at = ?, last_error = ?, updated_at = ?
    WHERE id = ?
  `).run(newStatus, result.latencyMs, now, lastError, now, id);

  return result;
}

function resolveClusteredNode(node: ProxyPoolNode): ProxyPoolNode {
  if (!node.endpoints || node.endpoints.length === 0) {
    return node;
  }
  const endpoints = node.endpoints;
  const idx = (node.clusterIndex ?? 0) % endpoints.length;
  const nextIdx = (idx + 1) % endpoints.length;

  try {
    getDb().prepare('UPDATE proxy_pools SET cluster_index = ? WHERE id = ?').run(nextIdx, node.id);
  } catch {}

  const activeUrl = endpoints[idx];
  const activeProto: ProxyPoolProtocol = /^socks[45]h?:\/\//i.test(activeUrl) ? 'socks5' : 'http';

  return {
    ...node,
    url: activeUrl,
    protocol: activeProto,
    clusterIndex: nextIdx,
  };
}

/**
 * Select next proxy node from the pool according to the active strategy and conditional routing rules.
 */
export function selectProxyNode(platform?: string): ProxyPoolNode | null {
  const nodes = getActiveProxyPoolNodes();
  if (nodes.length === 0) return null;

  // 1. Conditional Priority: Check if there is an active node targeted specifically to this platform
  if (platform) {
    const targeted = nodes.find(n => n.role === 'targeted' && n.targetedPlatforms?.includes(platform));
    if (targeted) return resolveClusteredNode(targeted);
  }

  // 2. Primary Pool: Filter nodes configured for primary traffic (role is 'primary' or unassigned)
  const primaryNodes = nodes.filter(n => !n.role || n.role === 'primary');
  let chosen: ProxyPoolNode | null = null;

  if (primaryNodes.length > 0) {
    const strategy = getProxyPoolStrategy();
    if (strategy === 'forward') {
      chosen = primaryNodes[0];
    } else if (strategy === 'random') {
      chosen = primaryNodes[Math.floor(Math.random() * primaryNodes.length)];
    } else {
      chosen = primaryNodes[roundRobinIndex % primaryNodes.length];
      roundRobinIndex = (roundRobinIndex + 1) % 1_000_000;
    }
  } else {
    // 3. Fallback: If no primary nodes are available/active, route through fallback nodes
    const fallbackNodes = nodes.filter(n => n.role === 'fallback');
    if (fallbackNodes.length > 0) {
      chosen = fallbackNodes[roundRobinIndex % fallbackNodes.length];
      roundRobinIndex = (roundRobinIndex + 1) % 1_000_000;
    } else {
      chosen = nodes[0];
    }
  }

  return chosen ? resolveClusteredNode(chosen) : null;
}

// ── Instant Deployment: Cloudflare Workers ──────────────────────────────

export async function deployCloudflareRelay(params: {
  accountId: string;
  apiToken: string;
  projectName?: string;
  subdomain?: string;
}): Promise<{ ok: boolean; node?: ProxyPoolNode; deployUrl?: string; error?: string }> {
  const accountId = params.accountId.trim();
  const apiToken = params.apiToken.trim();
  const projectName = params.projectName?.trim() || `srouter-relay-${Date.now().toString(36)}`;
  const providedSubdomain = params.subdomain?.trim().replace(/\.workers\.dev$/, '');

  if (!accountId || !apiToken) {
    return { ok: false, error: 'Cloudflare Account ID and API Token are required' };
  }

  const scriptUrl = `https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/scripts/${projectName}`;

  try {
    const formData = new FormData();
    const metadata = {
      main_module: 'index.js',
      compatibility_date: '2024-03-20',
    };
    formData.append('metadata', new Blob([JSON.stringify(metadata)], { type: 'application/json' }));
    formData.append('index.js', new Blob([CLOUDFLARE_WORKER_SCRIPT], { type: 'application/javascript' }), 'index.js');

    const putRes = await fetch(scriptUrl, {
      method: 'PUT',
      headers: { Authorization: `Bearer ${apiToken}` },
      body: formData,
    });

    if (!putRes.ok) {
      const errJson = await putRes.json().catch(() => ({})) as any;
      console.error('[Cloudflare] Worker upload failed:', putRes.status, errJson);
      const errMsg = errJson.errors?.map((e: any) => `${e.message} (code ${e.code})`).join(', ')
        || `Cloudflare upload failed with status ${putRes.status}`;
      return { ok: false, error: errMsg };
    }

    // Enable workers.dev subdomain for script
    await fetch(`${scriptUrl}/subdomain`, {
      method: 'POST',
      headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ enabled: true }),
    }).catch(() => null);

    let deployUrl = '';
    if (providedSubdomain) {
      deployUrl = `https://${projectName}.${providedSubdomain}.workers.dev`;
    } else {
      // Get account workers.dev root subdomain
      const subRes = await fetch(`https://api.cloudflare.com/client/v4/accounts/${accountId}/workers/subdomain`, {
        headers: { Authorization: `Bearer ${apiToken}`, 'Content-Type': 'application/json' },
      });

      if (subRes.ok) {
        const subJson = await subRes.json().catch(() => ({})) as any;
        if (subJson.result?.subdomain) {
          deployUrl = `https://${projectName}.${subJson.result.subdomain}.workers.dev`;
        }
      } else {
        const subErr = await subRes.json().catch(() => ({})) as any;
        console.error('[Cloudflare] Subdomain fetch failed:', subRes.status, subErr);
      }
    }

    if (!deployUrl) {
      return {
        ok: false,
        error: 'Worker script uploaded, but could not determine workers.dev subdomain. Please enter your workers.dev subdomain in the field or verify your token has Workers Subdomain read permissions.',
      };
    }

    // Add to proxy pool
    const node = addProxyPoolNode({
      name: `Cloudflare Relay (${projectName})`,
      url: deployUrl,
      protocol: 'fetch-relay',
      enabled: true,
    });

    // Test connectivity
    await testProxyPoolNode(node.id).catch(() => null);
    const updated = getProxyPoolNodes().find(n => n.id === node.id) ?? node;

    return { ok: true, node: updated, deployUrl };
  } catch (err: any) {
    console.error('[Cloudflare] Deployment exception:', err);
    return { ok: false, error: err?.message || String(err) };
  }
}

// ── Instant Deployment: Vercel Edge Function ────────────────────────────

export async function deployVercelRelay(params: {
  vercelToken: string;
  projectName?: string;
}): Promise<{ ok: boolean; node?: ProxyPoolNode; deployUrl?: string; error?: string }> {
  const token = params.vercelToken.trim();
  const projectName = params.projectName?.trim() || `srouter-relay-${Date.now().toString(36)}`;

  if (!token) {
    return { ok: false, error: 'Vercel API token is required' };
  }

  const vercelApi = 'https://api.vercel.com';

  try {
    const postRes = await fetch(`${vercelApi}/v13/deployments`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({
        name: projectName,
        files: [
          { file: 'api/relay.js', data: VERCEL_EDGE_SCRIPT, encoding: 'utf-8' },
          { file: 'package.json', data: JSON.stringify({ name: projectName, version: '1.0.0' }), encoding: 'utf-8' },
          { file: 'vercel.json', data: JSON.stringify({ rewrites: [{ source: '/(.*)', destination: '/api/relay' }] }), encoding: 'utf-8' },
        ],
        projectSettings: { framework: null },
        target: 'production',
      }),
    });

    if (!postRes.ok) {
      const errJson = await postRes.json().catch(() => ({})) as any;
      console.error('[Vercel] Deployment failed:', postRes.status, errJson);
      return { ok: false, error: errJson.error?.message || `Vercel deployment failed with status ${postRes.status}` };
    }

    const deployJson = await postRes.json() as any;
    const deployId = deployJson.id || deployJson.uid;

    // Poll deployment readiness (max 90s)
    const start = Date.now();
    let readyDeploy: any = null;
    while (Date.now() - start < 90_000) {
      const statusRes = await fetch(`${vercelApi}/v13/deployments/${deployId}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      const data = await statusRes.json().catch(() => ({})) as any;
      if (data.readyState === 'READY') {
        readyDeploy = data;
        break;
      }
      if (data.readyState === 'ERROR' || data.readyState === 'CANCELED') {
        return { ok: false, error: `Vercel build failed with state ${data.readyState}` };
      }
      await new Promise(r => setTimeout(r, 3_000));
    }

    if (!readyDeploy) {
      return { ok: false, error: 'Vercel deployment timed out while waiting for READY state' };
    }

    const deployUrl = `https://${readyDeploy.url}`;

    // Add to proxy pool
    const node = addProxyPoolNode({
      name: `Vercel Relay (${projectName})`,
      url: deployUrl,
      protocol: 'fetch-relay',
      enabled: true,
    });

    // Test connectivity
    await testProxyPoolNode(node.id).catch(() => null);
    const updated = getProxyPoolNodes().find(n => n.id === node.id) ?? node;

    return { ok: true, node: updated, deployUrl };
  } catch (err: any) {
    return { ok: false, error: err?.message || String(err) };
  }
}

// ── Instant Deployment: Deno Deploy ─────────────────────────────────────

export async function deployDenoRelay(params: {
  denoToken: string;
  appName?: string;
}): Promise<{ ok: boolean; node?: ProxyPoolNode; deployUrl?: string; error?: string }> {
  const token = params.denoToken.trim();
  const appName = (params.appName?.trim() || `srouter-relay-${Date.now().toString(36)}`).toLowerCase().replace(/[^a-z0-9-]/g, '-');

  if (!token) {
    return { ok: false, error: 'Deno Deploy API token is required' };
  }

  try {
    let deployUrl = '';
    let appSlug = appName;

    // 1. Try v2 apps API (Deno Deploy v2)
    const appRes = await fetch('https://api.deno.com/v2/apps', {
      method: 'POST',
      headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
      body: JSON.stringify({ slug: appName }),
    });

    if (appRes.ok || appRes.status === 409) {
      if (appRes.ok) {
        const appData = await appRes.json().catch(() => ({})) as any;
        if (appData.slug) appSlug = appData.slug;
      }
      const v2Dep = await fetch(`https://api.deno.com/v2/apps/${appSlug}/deploy`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          config: {
            runtime: {
              type: 'dynamic',
              entrypoint: 'main.js',
            },
          },
          assets: {
            'main.js': {
              kind: 'file',
              content: DENO_DEPLOY_SCRIPT,
              encoding: 'utf-8',
            },
          },
        }),
      });

      if (v2Dep.ok) {
        const depData = await v2Dep.json().catch(() => ({})) as any;
        deployUrl = depData.domain ? `https://${depData.domain}` : `https://${appSlug}.deno.dev`;
      } else {
        const err = await v2Dep.json().catch(() => ({})) as any;
        console.error('[Deno v2] Deployment error:', v2Dep.status, err);
        return { ok: false, error: err?.message || `Deno deploy failed with HTTP ${v2Dep.status}` };
      }
    } else {
      // 2. Fallback to v1 projects API
      const projRes = await fetch('https://api.deno.com/v1/projects', {
        method: 'POST',
        headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({ name: appName }),
      });

      if (projRes.ok || projRes.status === 409) {
        let projectId = appName;
        if (projRes.ok) {
          const projData = await projRes.json().catch(() => ({})) as any;
          projectId = projData.id || appName;
        }
        const depRes = await fetch(`https://api.deno.com/v1/projects/${projectId}/deployments`, {
          method: 'POST',
          headers: { Authorization: `Bearer ${token}`, 'Content-Type': 'application/json' },
          body: JSON.stringify({
            entryPointUrl: 'main.js',
            assets: {
              'main.js': {
                kind: 'file',
                content: DENO_DEPLOY_SCRIPT,
                encoding: 'utf-8',
              },
            },
            envVars: {},
          }),
        });
        if (depRes.ok) {
          deployUrl = `https://${appName}.deno.dev`;
        } else {
          const err = await depRes.json().catch(() => ({})) as any;
          console.error('[Deno v1] Deployment error:', depRes.status, err);
          return { ok: false, error: err?.message || `Deno deploy failed with HTTP ${depRes.status}` };
        }
      } else {
        const err = await appRes.json().catch(() => ({})) as any;
        console.error('[Deno] App creation failed:', appRes.status, err);
        return { ok: false, error: err?.message || `Deno app creation failed with HTTP ${appRes.status}` };
      }
    }

    // Add to proxy pool
    const node = addProxyPoolNode({
      name: `Deno Relay (${appSlug})`,
      url: deployUrl,
      protocol: 'fetch-relay',
      enabled: true,
    });

    await testProxyPoolNode(node.id).catch(() => null);
    const updated = getProxyPoolNodes().find(n => n.id === node.id) ?? node;

    return { ok: true, node: updated, deployUrl };
  } catch (err: any) {
    console.error('[Deno] Deployment exception:', err);
    return { ok: false, error: err?.message || String(err) };
  }
}

// ── Instant Deployment: Netlify Edge ────────────────────────────────────

const CRC32_TABLE = new Uint32Array(256);
for (let i = 0; i < 256; i++) {
  let c = i;
  for (let k = 0; k < 8; k++) {
    c = (c & 1) ? (0xedb88320 ^ (c >>> 1)) : (c >>> 1);
  }
  CRC32_TABLE[i] = c >>> 0;
}

function calculateCrc32(buf: Buffer): number {
  let crc = ~0;
  for (let i = 0; i < buf.length; i++) {
    crc = (crc >>> 8) ^ CRC32_TABLE[(crc ^ buf[i]) & 0xff];
  }
  return (~crc) >>> 0;
}

function createZipBuffer(files: { path: string; content: string }[]): Buffer {
  const localHeaders: Buffer[] = [];
  const centralHeaders: Buffer[] = [];
  let offset = 0;
  for (const f of files) {
    const data = Buffer.from(f.content, 'utf8');
    const name = Buffer.from(f.path, 'utf8');
    const crc = calculateCrc32(data);
    const lh = Buffer.alloc(30 + name.length);
    lh.writeUInt32LE(0x04034b50, 0);
    lh.writeUInt16LE(20, 4);
    lh.writeUInt16LE(0, 6);
    lh.writeUInt16LE(0, 8);
    lh.writeUInt16LE(0, 10);
    lh.writeUInt16LE(0, 12);
    lh.writeUInt32LE(crc, 14);
    lh.writeUInt32LE(data.length, 18);
    lh.writeUInt32LE(data.length, 22);
    lh.writeUInt16LE(name.length, 26);
    lh.writeUInt16LE(0, 28);
    name.copy(lh, 30);
    localHeaders.push(lh, data);

    const ch = Buffer.alloc(46 + name.length);
    ch.writeUInt32LE(0x02014b50, 0);
    ch.writeUInt16LE(20, 4);
    ch.writeUInt16LE(20, 6);
    ch.writeUInt16LE(0, 8);
    ch.writeUInt16LE(0, 10);
    ch.writeUInt16LE(0, 12);
    ch.writeUInt16LE(0, 14);
    ch.writeUInt32LE(crc, 16);
    ch.writeUInt32LE(data.length, 20);
    ch.writeUInt32LE(data.length, 24);
    ch.writeUInt16LE(name.length, 28);
    ch.writeUInt16LE(0, 30);
    ch.writeUInt16LE(0, 32);
    ch.writeUInt16LE(0, 34);
    ch.writeUInt16LE(0, 36);
    ch.writeUInt32LE(0, 38);
    ch.writeUInt32LE(offset, 42);
    name.copy(ch, 46);
    centralHeaders.push(ch);

    offset += lh.length + data.length;
  }
  const centralDirSize = centralHeaders.reduce((sum, b) => sum + b.length, 0);
  const eocd = Buffer.alloc(22);
  eocd.writeUInt32LE(0x06054b50, 0);
  eocd.writeUInt16LE(0, 4);
  eocd.writeUInt16LE(0, 6);
  eocd.writeUInt16LE(files.length, 8);
  eocd.writeUInt16LE(files.length, 10);
  eocd.writeUInt32LE(centralDirSize, 12);
  eocd.writeUInt32LE(offset, 16);
  eocd.writeUInt16LE(0, 20);

  return Buffer.concat([...localHeaders, ...centralHeaders, eocd]);
}

export async function deployNetlifyRelay(params: {
  netlifyToken: string;
  siteName?: string;
}): Promise<{ ok: boolean; node?: ProxyPoolNode; deployUrl?: string; error?: string }> {
  const token = params.netlifyToken.trim();
  const rawSiteName = params.siteName?.trim().toLowerCase().replace(/[^a-z0-9-]/g, '') || `srouter-relay-${Date.now().toString(36)}`;

  if (!token) {
    return { ok: false, error: 'Netlify Personal Access Token is required' };
  }

  try {
    const zipBuffer = createZipBuffer([
      {
        path: 'index.html',
        content: '<!DOCTYPE html><html><body>SRouter Relay</body></html>',
      },
      {
        path: 'netlify.toml',
        content: `[[edge_functions]]\nfunction = "relay"\npath = "/*"\n\n[[redirects]]\nfrom = "/*"\nto = "/.netlify/functions/relay"\nstatus = 200\n`,
      },
      {
        path: 'netlify/edge-functions/relay.js',
        content: NETLIFY_EDGE_SCRIPT,
      },
      {
        path: 'netlify/functions/relay.js',
        content: `exports.handler = async (event) => {
  const target = event.headers["x-relay-target"] || event.headers["fetch-relay-target"];
  const relayPath = event.headers["x-relay-path"] || "";
  if (!target) {
    return {
      statusCode: 400,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: "Missing x-relay-target / Fetch-Relay-Target header" }),
    };
  }
  const targetUrl = target.replace(/\\/$/, "") + relayPath;
  const forwardHeaders = { ...event.headers };
  delete forwardHeaders["x-relay-target"];
  delete forwardHeaders["x-relay-path"];
  delete forwardHeaders["fetch-relay-target"];
  delete forwardHeaders["fetch-relay-authorization"];
  delete forwardHeaders["host"];
  try {
    const res = await fetch(targetUrl, {
      method: event.httpMethod,
      headers: forwardHeaders,
      body: event.httpMethod !== "GET" && event.httpMethod !== "HEAD" ? (event.isBase64Encoded ? Buffer.from(event.body, "base64") : event.body) : undefined,
    });
    const bodyText = await res.text();
    const resHeaders = {};
    res.headers.forEach((v, k) => { resHeaders[k] = v; });
    return {
      statusCode: res.status,
      headers: resHeaders,
      body: bodyText,
    };
  } catch (err) {
    return {
      statusCode: 502,
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ error: err.message || "Relay fetch failed" }),
    };
  }
};`,
      },
    ]);

    // 1. Create site record via JSON API
    let siteRes = await fetch('https://api.netlify.com/api/v1/sites', {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/json',
      },
      body: JSON.stringify({ name: rawSiteName }),
    });

    // 2. If 422 (subdomain already taken), retry without site name so Netlify assigns an available subdomain
    if (siteRes.status === 422) {
      console.warn(`[Netlify] Subdomain ${rawSiteName} taken, creating site with auto-assigned name...`);
      siteRes = await fetch('https://api.netlify.com/api/v1/sites', {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
        },
        body: JSON.stringify({}),
      });
    }

    if (!siteRes.ok) {
      const err = await siteRes.json().catch(() => ({})) as any;
      console.error('[Netlify] Site creation failed:', siteRes.status, err);
      return { ok: false, error: err?.message || `Netlify site creation failed with status ${siteRes.status}` };
    }

    const siteData = await siteRes.json() as any;
    const siteId = siteData.id || siteData.site_id;
    const siteName = siteData.name || rawSiteName;

    // 3. Upload zip bundle to the site's deploys endpoint
    const deployRes = await fetch(`https://api.netlify.com/api/v1/sites/${siteId}/deploys`, {
      method: 'POST',
      headers: {
        Authorization: `Bearer ${token}`,
        'Content-Type': 'application/zip',
      },
      body: zipBuffer,
    });

    if (!deployRes.ok) {
      const err = await deployRes.json().catch(() => ({})) as any;
      console.error('[Netlify] ZIP deployment failed:', deployRes.status, err);
      return { ok: false, error: err?.message || `Netlify deployment upload failed with status ${deployRes.status}` };
    }

    const deployData = await deployRes.json() as any;
    const deployUrl = siteData.ssl_url || siteData.url || deployData.ssl_url || deployData.url || `https://${siteName}.netlify.app`;

    // Add to proxy pool
    const node = addProxyPoolNode({
      name: `Netlify Relay (${siteName})`,
      url: deployUrl,
      protocol: 'fetch-relay',
      enabled: true,
    });

    await testProxyPoolNode(node.id).catch(() => null);
    const updated = getProxyPoolNodes().find(n => n.id === node.id) ?? node;

    return { ok: true, node: updated, deployUrl };
  } catch (err: any) {
    console.error('[Netlify] Deployment exception:', err);
    return { ok: false, error: err?.message || String(err) };
  }
}

// ── Instant Import: Webshare (10 Free Proxies via API) ──────────────────

export async function importWebshareProxies(params: {
  apiKey: string;
  protocol?: ProxyPoolProtocol;
  role?: ProxyPoolRole;
  targetedPlatforms?: string[];
}): Promise<{ ok: boolean; count: number; nodes: ProxyPoolNode[]; error?: string }> {
  const apiKey = params.apiKey.trim();
  const protocol = params.protocol || 'socks5';
  const role: ProxyPoolRole = params.role || 'primary';
  if (!apiKey) {
    return { ok: false, count: 0, nodes: [], error: 'Webshare API key is required' };
  }

  try {
    const res = await fetch('https://proxy.webshare.io/api/v2/proxy/list/?mode=direct&page=1&page_size=25', {
      headers: {
        Authorization: `Token ${apiKey}`,
      },
    });

    if (!res.ok) {
      const err = await res.json().catch(() => ({})) as any;
      console.error('[Webshare] API list failed:', res.status, err);
      return {
        ok: false,
        count: 0,
        nodes: [],
        error: err?.detail || `Webshare API request failed with status ${res.status}`,
      };
    }

    const data = await res.json() as any;
    const results = data.results || [];
    if (!Array.isArray(results) || results.length === 0) {
      return { ok: false, count: 0, nodes: [], error: 'No proxies found in this Webshare account.' };
    }

    const proxyUrls: string[] = [];
    for (const item of results) {
      const ip = item.proxy_address;
      const port = item.port;
      const user = item.username;
      const pass = item.password;

      if (!ip || !port) continue;

      let proxyUrl = '';
      if (user && pass) {
        proxyUrl = `${protocol}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${ip}:${port}`;
      } else {
        proxyUrl = `${protocol}://${ip}:${port}`;
      }
      proxyUrls.push(proxyUrl);
    }

    if (proxyUrls.length === 0) {
      return { ok: false, count: 0, nodes: [], error: 'Could not extract valid proxy endpoints from Webshare.' };
    }

    // Save as a Single Clustered Node in SRouter Proxy Pool with internal rotation
    // Role defaults to 'fallback' to preserve the 1GB bandwidth quota against unlimited serverless relays.
    const clusterNode = addProxyPoolNode({
      name: `Webshare Cluster (${proxyUrls.length} IPs)`,
      url: proxyUrls[0],
      protocol: protocol === 'socks5' ? 'socks5' : 'http',
      role,
      targetedPlatforms: params.targetedPlatforms || null,
      endpoints: proxyUrls,
      enabled: true,
    });

    await testProxyPoolNode(clusterNode.id).catch(() => null);
    const updated = getProxyPoolNodes().find(n => n.id === clusterNode.id) ?? clusterNode;

    return { ok: true, count: proxyUrls.length, nodes: [updated] };
  } catch (err: any) {
    console.error('[Webshare] Import exception:', err);
    return { ok: false, count: 0, nodes: [], error: err?.message || String(err) };
  }
}

// ── Instant Import: Raw Proxy Text List ─────────────────────────────────

export function importProxyListText(params: {
  rawText: string;
  defaultProtocol?: ProxyPoolProtocol;
  role?: ProxyPoolRole;
  asCluster?: boolean;
}): { ok: boolean; count: number; nodes: ProxyPoolNode[]; error?: string } {
  const rawText = params.rawText.trim();
  const defaultProto = params.defaultProtocol || 'socks5';
  const role: ProxyPoolRole = params.role || 'primary';
  const asCluster = params.asCluster !== false;
  if (!rawText) {
    return { ok: false, count: 0, nodes: [], error: 'Proxy list text is empty' };
  }

  const lines = rawText.split(/\r?\n/).map(l => l.trim()).filter(Boolean);
  const parsedUrls: string[] = [];

  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    if (line.startsWith('#') || line.startsWith('//')) continue;

    let url = '';
    if (line.includes('://')) {
      url = line;
    } else {
      const parts = line.split(':');
      if (parts.length === 4) {
        const [ip, port, user, pass] = parts;
        url = `${defaultProto}://${encodeURIComponent(user)}:${encodeURIComponent(pass)}@${ip}:${port}`;
      } else if (parts.length === 2 && !line.includes('@')) {
        url = `${defaultProto}://${parts[0]}:${parts[1]}`;
      } else if (line.includes('@')) {
        url = `${defaultProto}://${line}`;
      } else {
        url = `${defaultProto}://${line}`;
      }
    }
    parsedUrls.push(url);
  }

  if (parsedUrls.length === 0) {
    return { ok: false, count: 0, nodes: [], error: 'No valid proxy lines found' };
  }

  if (asCluster && parsedUrls.length > 1) {
    const clusterNode = addProxyPoolNode({
      name: `Proxy Cluster (${parsedUrls.length} IPs)`,
      url: parsedUrls[0],
      protocol: defaultProto,
      role,
      endpoints: parsedUrls,
      enabled: true,
    });
    return { ok: true, count: parsedUrls.length, nodes: [clusterNode] };
  }

  const addedNodes: ProxyPoolNode[] = [];
  for (let i = 0; i < parsedUrls.length; i++) {
    const url = parsedUrls[i];
    const proto: ProxyPoolProtocol = /^socks[45]h?:\/\//i.test(url) ? 'socks5' : 'http';
    const node = addProxyPoolNode({
      name: `Proxy Node ${i + 1}`,
      url,
      protocol: proto,
      role,
      enabled: true,
    });
    addedNodes.push(node);
  }

  return { ok: true, count: addedNodes.length, nodes: addedNodes };
}

// Register selector with proxy dispatcher
registerProxyNodeSelector(selectProxyNode);
