import { Router, type Request, type Response } from 'express';
import { randomBytes } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';
import { getDb } from '../db/index.js';
import { encrypt, decrypt } from '../lib/crypto.js';
import { autoDiscoverModels } from '../services/auto-discover.js';

export const oauthRouter = Router();

// ── Freebuff CLI OAuth Constants (mirrors official Codebuff CLI flow) ──
const FREEBUFF_CONFIG = {
  baseUrl: 'https://freebuff.com',
  codeUrl: 'https://freebuff.com/api/auth/cli/code',
  statusUrl: 'https://freebuff.com/api/auth/cli/status',
  pollInterval: 5000,
  loginTimeoutSec: 300,
};

function generateFreebuffFingerprintId(): string {
  return `codebuff-cli-${randomBytes(6).toString('base64url').substring(0, 8)}`;
}

function encodeFreebuffLoginState(state: { fingerprintId: string; fingerprintHash: string; expiresAt: string }): string {
  return Buffer.from(JSON.stringify(state), 'utf8').toString('base64url');
}

function decodeFreebuffLoginState(deviceCode: string): { fingerprintId: string; fingerprintHash: string; expiresAt: string } | null {
  try {
    const parsed = JSON.parse(Buffer.from(deviceCode, 'base64url').toString('utf8'));
    if (parsed && parsed.fingerprintId && parsed.fingerprintHash && parsed.expiresAt) {
      return parsed;
    }
  } catch {}
  return null;
}

// ── AWS OIDC Constants for Kiro AI (from 9router / AWS CodeWhisperer) ──
const KIRO_OIDC_CONFIG = {
  clientName: 'kiro-oauth-client',
  clientType: 'public',
  scopes: ['codewhisperer:completions', 'codewhisperer:analysis', 'codewhisperer:conversations'],
  grantTypes: ['urn:ietf:params:oauth:grant-type:device_code', 'refresh_token'],
  issuerUrl: 'https://identitycenter.amazonaws.com/ssoins-722374e8c3c8e6c6',
  startUrl: 'https://view.awsapps.com/start',
  region: 'us-east-1',
};

// ── Cline OAuth Constants ──
const CLINE_OAUTH_CONFIG = {
  authorizeUrl: 'https://api.cline.bot/api/v1/auth/authorize',
  tokenUrl: 'https://api.cline.bot/api/v1/auth/token',
  refreshUrl: 'https://api.cline.bot/api/v1/auth/refresh',
  clientType: 'extension',
};

/**
 * Extract email or full payload from JWT payload if present.
 */
function extractJwtPayload(token: string): Record<string, any> | undefined {
  try {
    const raw = token.toLowerCase().startsWith('workos:') ? token.slice(7) : token;
    const parts = raw.split('.');
    if (parts.length >= 2) {
      return JSON.parse(Buffer.from(parts[1], 'base64').toString('utf8'));
    }
  } catch {}
  return undefined;
}

function extractJwtEmail(token: string): string | undefined {
  const payload = extractJwtPayload(token);
  return payload?.email || payload?.user_email;
}

/**
 * Save an authenticated OAuth token into SRouter's api_keys table.
 */
function saveOAuthKey(platform: string, token: string, label: string): number {
  const db = getDb();
  const trimmedToken = token.trim();
  const { encrypted, iv, authTag } = encrypt(trimmedToken);

  const newPayload = extractJwtPayload(trimmedToken);
  const userSub = newPayload?.sub;
  const userEmail = newPayload?.email || newPayload?.user_email;

  // Check if a key row already exists for THIS specific token or same user account
  const existingRows = db.prepare('SELECT id, encrypted_key, iv, auth_tag, label FROM api_keys WHERE platform = ?').all(platform) as Array<{
    id: number;
    encrypted_key: string;
    iv: string;
    auth_tag: string;
    label: string | null;
  }>;

  let matchingRow: typeof existingRows[0] | undefined;
  for (const r of existingRows) {
    try {
      const dec = decrypt(r.encrypted_key, r.iv, r.auth_tag);
      if (dec === trimmedToken) {
        matchingRow = r;
        break;
      }
      // If same WorkOS sub or same email, it's a token refresh for the SAME account!
      if (userSub || userEmail) {
        const existingPayload = extractJwtPayload(dec);
        if (
          (userSub && existingPayload?.sub === userSub) ||
          (userEmail && (existingPayload?.email || existingPayload?.user_email) === userEmail)
        ) {
          matchingRow = r;
          break;
        }
      }
    } catch {}
  }

  let keyId: number;
  if (matchingRow) {
    db.prepare(`
      UPDATE api_keys
      SET encrypted_key = ?, iv = ?, auth_tag = ?, label = ?, status = 'healthy', enabled = 1, last_checked_at = datetime('now')
      WHERE id = ?
    `).run(encrypted, iv, authTag, label || matchingRow.label, matchingRow.id);
    keyId = matchingRow.id;
  } else {
    // Generate distinct label if adding another account
    let distinctLabel = label;
    const existingLabels = new Set(existingRows.map(r => r.label));
    if (!distinctLabel || existingLabels.has(distinctLabel)) {
      const count = existingRows.length;
      distinctLabel = distinctLabel
        ? `${distinctLabel} (${count + 1})`
        : `${platform.toUpperCase()} (Account ${count + 1})`;
    }
    const result = db.prepare(`
      INSERT INTO api_keys (platform, label, encrypted_key, iv, auth_tag, status, enabled, created_at, last_checked_at)
      VALUES (?, ?, ?, ?, ?, 'healthy', 1, datetime('now'), datetime('now'))
    `).run(platform, distinctLabel, encrypted, iv, authTag);
    keyId = Number(result.lastInsertRowid);
  }

  return keyId;
}

/**
 * GET /api/oauth/:provider/authorize
 * Starts the OAuth or Device Code flow for the provider.
 */
oauthRouter.get('/:provider/authorize', async (req: Request, res: Response) => {
  const provider = (Array.isArray(req.params.provider) ? req.params.provider[0] : req.params.provider)?.toLowerCase();
  const host = req.get('host') || 'localhost:20268';
  const protocol = req.protocol === 'https' ? 'https' : 'http';
  const defaultRedirectUri = `${protocol}://${host}/api/oauth/${provider}/callback`;

  try {
    if (provider === 'nous') {
      const codeResp = await fetch('https://portal.nousresearch.com/api/oauth/device/code', {
        method: 'POST',
        headers: {
          'Content-Type': 'application/x-www-form-urlencoded',
          'Accept': 'application/json',
          'User-Agent': 'hermes-cli',
        },
        body: new URLSearchParams({
          client_id: 'hermes-cli',
          scope: 'inference:invoke',
        }).toString(),
      });

      if (!codeResp.ok) {
        const errText = await codeResp.text();
        res.status(codeResp.status).json({
          error: { message: `Failed to initialize Nous device authorization: ${errText || codeResp.statusText}` },
        });
        return;
      }

      const data: any = await codeResp.json();
      res.json({
        provider: 'nous',
        flowType: 'device_code',
        deviceCode: data.device_code,
        userCode: data.user_code,
        verificationUri: data.verification_uri || 'https://portal.nousresearch.com/manage-subscription',
        verificationUriComplete: data.verification_uri_complete || `${data.verification_uri}?user_code=${data.user_code}`,
        expiresIn: data.expires_in || 600,
        interval: data.interval || 5,
        instructions: `Open ${data.verification_uri_complete || data.verification_uri} and approve code ${data.user_code} to link your Nous Portal account without credit card or billing.`,
      });
      return;
    }

    if (provider === 'cline') {
      const redirectUri = (req.query.redirect_uri as string) || defaultRedirectUri;
      let finalAuthUrl = `${CLINE_OAUTH_CONFIG.authorizeUrl}?client_type=${CLINE_OAUTH_CONFIG.clientType}&callback_url=${encodeURIComponent(redirectUri)}`;

      try {
        // Resolve upstream WorkOS URL so we can inject prompt=login to guarantee account selection / switch
        const upstreamResp = await fetch(finalAuthUrl, { redirect: 'manual' });
        const loc = upstreamResp.headers.get('location');
        if (loc) {
          const workosUrl = new URL(loc);
          workosUrl.searchParams.set('prompt', 'login');
          finalAuthUrl = workosUrl.toString();
        }
      } catch (err) {
        console.warn('Failed to pre-resolve WorkOS URL for Cline, falling back to direct auth URL', err);
      }

      // If requested directly by a browser, redirect straight to login
      if (req.headers.accept?.includes('text/html') || req.query.redirect === 'true') {
        res.redirect(finalAuthUrl);
        return;
      }

      res.json({
        provider: 'cline',
        flowType: 'authorization_code',
        authUrl: finalAuthUrl,
        redirectUri,
      });
      return;
    }

    if (provider === 'kiro') {
      // 1. Register OIDC client with AWS
      const regRes = await fetch(`https://oidc.${KIRO_OIDC_CONFIG.region}.amazonaws.com/client/register`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          clientName: KIRO_OIDC_CONFIG.clientName,
          clientType: KIRO_OIDC_CONFIG.clientType,
          scopes: KIRO_OIDC_CONFIG.scopes,
          grantTypes: KIRO_OIDC_CONFIG.grantTypes,
          issuerUrl: KIRO_OIDC_CONFIG.issuerUrl,
        }),
      });

      if (!regRes.ok) {
        const errText = await regRes.text();
        res.status(502).json({ error: { message: `AWS OIDC registration failed: ${errText}` } });
        return;
      }

      const reg = await regRes.json() as { clientId: string; clientSecret: string };

      // 2. Start device authorization
      const authRes = await fetch(`https://oidc.${KIRO_OIDC_CONFIG.region}.amazonaws.com/device_authorization`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({
          clientId: reg.clientId,
          clientSecret: reg.clientSecret,
          startUrl: KIRO_OIDC_CONFIG.startUrl,
        }),
      });

      if (!authRes.ok) {
        const errText = await authRes.text();
        res.status(502).json({ error: { message: `AWS Device Authorization failed: ${errText}` } });
        return;
      }

      const authData = await authRes.json() as {
        deviceCode: string;
        userCode: string;
        verificationUri: string;
        verificationUriComplete?: string;
        expiresIn: number;
        interval?: number;
      };

      res.json({
        provider: 'kiro',
        flowType: 'device_code',
        deviceCode: authData.deviceCode,
        userCode: authData.userCode,
        verificationUri: authData.verificationUri,
        verificationUriComplete: authData.verificationUriComplete || `${authData.verificationUri}?user_code=${authData.userCode}`,
        clientId: reg.clientId,
        clientSecret: reg.clientSecret,
        region: KIRO_OIDC_CONFIG.region,
        expiresIn: authData.expiresIn,
        interval: authData.interval || 5,
      });
      return;
    }

    if (provider === 'freebuff') {
      const fingerprintId = generateFreebuffFingerprintId();
      const resp = await fetch(FREEBUFF_CONFIG.codeUrl, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
        body: JSON.stringify({ fingerprintId }),
      });
      if (!resp.ok) {
        throw new Error(`Freebuff login request failed (${resp.status})`);
      }
      const data = (await resp.json()) as { loginUrl?: string; fingerprintHash?: string; expiresAt?: string };
      if (!data.loginUrl || !data.fingerprintHash || !data.expiresAt) {
        throw new Error('Freebuff login response is missing required fields');
      }
      const deviceCode = encodeFreebuffLoginState({
        fingerprintId,
        fingerprintHash: data.fingerprintHash,
        expiresAt: data.expiresAt,
      });
      const expMs = typeof data.expiresAt === 'number' ? data.expiresAt : Date.parse(String(data.expiresAt));
      const expiresIn = Number.isFinite(expMs) ? Math.max(1, Math.floor((expMs - Date.now()) / 1000)) : 300;

      res.json({
        provider: 'freebuff',
        flowType: 'device_code',
        deviceCode,
        userCode: fingerprintId.replace(/^codebuff-cli-/, ''),
        verificationUri: data.loginUrl,
        verificationUriComplete: data.loginUrl,
        expiresIn,
        interval: 5,
      });
      return;
    }

    res.status(400).json({ error: { message: `Unsupported OAuth provider: ${provider}` } });
  } catch (err: any) {
    res.status(500).json({ error: { message: (err as any)?.message || String(err) } });
  }
});

/**
 * POST /api/oauth/kiro/poll
 * Polls AWS OIDC token endpoint until the user approves the device code.
 */
/**
 * POST /api/oauth/nous/poll
 * Polls Nous Portal OAuth device token endpoint.
 */
oauthRouter.post('/nous/poll', async (req: Request, res: Response) => {
  const { deviceCode } = req.body || {};
  if (!deviceCode) {
    res.status(400).json({ error: { message: 'Missing deviceCode parameter' } });
    return;
  }

  try {
    const tokenRes = await fetch('https://portal.nousresearch.com/api/oauth/token', {
      method: 'POST',
      headers: {
        'Content-Type': 'application/x-www-form-urlencoded',
        'Accept': 'application/json',
        'User-Agent': 'hermes-cli',
      },
      body: new URLSearchParams({
        grant_type: 'urn:ietf:params:oauth:grant-type:device_code',
        client_id: 'hermes-cli',
        device_code: deviceCode,
      }).toString(),
    });

    const tokenData: any = await tokenRes.json();
    if (tokenData.error) {
      if (tokenData.error === 'authorization_pending' || tokenData.error === 'slow_down') {
        res.json({ success: false, pending: true, error: tokenData.error });
        return;
      }
      res.status(400).json({ success: false, pending: false, error: { message: tokenData.error_description || tokenData.error } });
      return;
    }

    const token = tokenData.access_token || tokenData.token;
    if (token) {
      const email = extractJwtEmail(token) || '';
      const existingRows = getDb().prepare('SELECT id FROM api_keys WHERE platform = ?').all('nous') as any[];
      const count = existingRows.length + 1;
      const label = email ? `Nous Portal (${email})` : (count > 1 ? `Nous Portal (Account ${count})` : 'Nous Portal (Connected Account)');
      const keyId = saveOAuthKey('nous', token, label);
      autoDiscoverModels('nous', { refresh: true }).catch(() => {});

      res.json({
        success: true,
        keyId,
        provider: 'nous',
        email,
        accessToken: token,
      });
      return;
    }

    res.status(502).json({ error: { message: 'Unexpected token response from Nous Portal' } });
  } catch (err) {
    res.status(500).json({ error: { message: (err as any)?.message || String(err) } });
  }
});

oauthRouter.post('/kiro/poll', async (req: Request, res: Response) => {
  const { clientId, clientSecret, deviceCode, region = KIRO_OIDC_CONFIG.region } = req.body || {};

  if (!clientId || !clientSecret || !deviceCode) {
    res.status(400).json({ error: { message: 'Missing clientId, clientSecret, or deviceCode' } });
    return;
  }

  try {
    const tokenRes = await fetch(`https://oidc.${region}.amazonaws.com/token`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
      body: JSON.stringify({
        clientId,
        clientSecret,
        deviceCode,
        grantType: 'urn:ietf:params:oauth:grant-type:device_code',
      }),
    });

    const tokenData = await tokenRes.json() as any;

    if (tokenData.error) {
      if (tokenData.error === 'authorization_pending' || tokenData.error === 'slow_down') {
        res.json({ success: false, pending: true, error: tokenData.error });
        return;
      }
      res.status(400).json({ success: false, pending: false, error: { message: tokenData.error_description || tokenData.error } });
      return;
    }

    if (tokenData.accessToken) {
      const email = (tokenData.idToken && extractJwtEmail(tokenData.idToken)) || extractJwtEmail(tokenData.accessToken) || '';
      const existingKiroRows = getDb().prepare('SELECT id FROM api_keys WHERE platform = ?').all('kiro') as any[];
      const accountNum = existingKiroRows.length + 1;
      const keyLabel = email ? `Kiro (${email})` : (existingKiroRows.length > 0 ? `Kiro (AWS Builder ID - ${accountNum})` : 'Kiro (AWS Builder ID)');
      const keyId = saveOAuthKey('kiro', tokenData.accessToken, keyLabel);
      // Trigger model sync in background
      autoDiscoverModels('kiro', { refresh: true }).catch(() => {});

      res.json({
        success: true,
        keyId,
        provider: 'kiro',
        accessToken: tokenData.accessToken,
        expiresIn: tokenData.expiresIn,
      });
      return;
    }

    res.status(502).json({ error: { message: 'Unexpected response from AWS OIDC' } });
  } catch (err: any) {
    res.status(500).json({ error: { message: (err as any)?.message || String(err) } });
  }
});

/**
 * POST /api/oauth/freebuff/poll
 * Polls Freebuff CLI device status endpoint until user approves in browser.
 */
oauthRouter.post('/freebuff/poll', async (req: Request, res: Response) => {
  const { deviceCode } = req.body || {};
  if (!deviceCode) {
    res.status(400).json({ error: { message: 'Missing deviceCode parameter' } });
    return;
  }

  const state = decodeFreebuffLoginState(deviceCode);
  if (!state) {
    res.status(400).json({ error: { message: 'Malformed Freebuff login state' } });
    return;
  }

  try {
    const url = new URL(FREEBUFF_CONFIG.statusUrl);
    url.searchParams.set('fingerprintId', state.fingerprintId);
    url.searchParams.set('fingerprintHash', state.fingerprintHash);
    url.searchParams.set('expiresAt', String(state.expiresAt));

    const response = await fetch(url.toString(), {
      method: 'GET',
      headers: { Accept: 'application/json' },
    });

    const expMs = typeof state.expiresAt === 'number' ? state.expiresAt : Date.parse(String(state.expiresAt));
    const expired = Number.isFinite(expMs) && expMs <= Date.now();
    if (!response.ok) {
      if (expired) {
        res.status(400).json({ success: false, pending: false, error: { message: 'Freebuff login expired' } });
        return;
      }
      if (response.status === 429 || response.status >= 500) {
        res.json({ success: false, pending: true, error: 'slow_down' });
        return;
      }
      res.json({ success: false, pending: true, error: 'authorization_pending' });
      return;
    }

    const text = await response.text();
    let body: any = null;
    try {
      body = text ? JSON.parse(text) : null;
    } catch {}

    const user = body?.user;
    if (user && typeof user.authToken === 'string' && user.authToken) {
      const email = user.email || '';
      const existingRows = getDb().prepare('SELECT id FROM api_keys WHERE platform = ?').all('freebuff') as any[];
      const count = existingRows.length + 1;
      const label = email ? `Freebuff (${email})` : (count > 1 ? `Freebuff (Account ${count})` : 'Freebuff (Connected Account)');
      const keyId = saveOAuthKey('freebuff', user.authToken, label);
      autoDiscoverModels('freebuff', { refresh: true }).catch(() => {});

      res.json({
        success: true,
        keyId,
        provider: 'freebuff',
        email,
        accessToken: user.authToken,
      });
      return;
    }

    if (expired) {
      res.status(400).json({ success: false, pending: false, error: { message: 'Freebuff login expired' } });
      return;
    }
    res.json({ success: false, pending: true, error: 'authorization_pending' });
  } catch (err: any) {
    res.status(500).json({ error: { message: err?.message || String(err) } });
  }
});

/**
 * Helper to exchange Cline code for tokens.
 */
async function exchangeClineCode(code: string, redirectUri: string): Promise<{ accessToken: string; refreshToken?: string; email?: string }> {
  // Check if code is a base64-encoded JSON (9router / Cline extension format)
  try {
    let clean = code.trim();
    if (clean.includes('code=')) {
      const url = new URL(clean.startsWith('http') ? clean : `http://dummy/?${clean}`);
      clean = url.searchParams.get('code') || clean;
    }
    const pad = 4 - (clean.length % 4);
    const padded = pad !== 4 ? clean + '='.repeat(pad) : clean;
    const decoded = Buffer.from(padded, 'base64').toString('utf8');
    const lastBrace = decoded.lastIndexOf('}');
    if (lastBrace !== -1) {
      const parsed = JSON.parse(decoded.substring(0, lastBrace + 1));
      if (parsed.accessToken) {
        return {
          accessToken: parsed.accessToken,
          refreshToken: parsed.refreshToken,
          email: parsed.email || parsed.userInfo?.email || extractJwtEmail(parsed.accessToken),
        };
      }
    }
  } catch {}

  // Fallback to upstream Cline token exchange endpoint
  let cleanCode = code.trim();
  if (cleanCode.includes('code=')) {
    try {
      const url = new URL(cleanCode.startsWith('http') ? cleanCode : `http://dummy/?${cleanCode}`);
      cleanCode = url.searchParams.get('code') || cleanCode;
    } catch {}
  }

  const tokenRes = await fetch(CLINE_OAUTH_CONFIG.tokenUrl, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json', Accept: 'application/json' },
    body: JSON.stringify({
      grant_type: 'authorization_code',
      code: cleanCode,
      client_type: CLINE_OAUTH_CONFIG.clientType,
      redirect_uri: redirectUri,
    }),
  });

  if (!tokenRes.ok) {
    const errText = await tokenRes.text();
    throw new Error(`Cline token exchange failed: ${errText}`);
  }

  const tokenData = await tokenRes.json() as any;
  const accessToken = tokenData.data?.accessToken || tokenData.accessToken;
  const refreshToken = tokenData.data?.refreshToken || tokenData.refreshToken;
  const email = tokenData.data?.userInfo?.email || tokenData.email || extractJwtEmail(accessToken) || '';

  if (!accessToken) {
    throw new Error('No accessToken returned by Cline');
  }

  return { accessToken, refreshToken, email };
}

/**
 * POST /api/oauth/cline/callback
 * Accepts manual callback URL or authorization code from the user.
 */
oauthRouter.post('/cline/callback', async (req: Request, res: Response) => {
  const { code, redirectUri } = req.body || {};
  if (!code) {
    res.status(400).json({ error: { message: 'Missing code parameter' } });
    return;
  }

  try {
    const host = req.get('host') || 'localhost:20268';
    const effectiveRedirectUri = redirectUri || `http://${host}/api/oauth/cline/callback`;
    const tokens = await exchangeClineCode(code, effectiveRedirectUri);

    const formattedToken = tokens.accessToken.toLowerCase().startsWith('workos:')
      ? tokens.accessToken
      : `workos:${tokens.accessToken}`;

    const label = tokens.email ? `Cline (${tokens.email})` : 'Cline (WorkOS)';
    const keyId = saveOAuthKey('cline', formattedToken, label);

    // Refresh Cline models in background
    autoDiscoverModels('cline', { refresh: true }).catch(() => {});

    res.json({
      success: true,
      keyId,
      provider: 'cline',
      email: tokens.email,
    });
  } catch (err: any) {
    res.status(502).json({ error: { message: err?.message || String(err) } });
  }
});

/**
 * GET /api/oauth/cline/callback
 * Browser redirect receiver when logging in via browser.
 */
oauthRouter.get('/cline/callback', async (req: Request, res: Response) => {
  const code = req.query.code as string;
  if (!code) {
    res.status(400).send('<h3>Error: Missing authorization code.</h3>');
    return;
  }

  try {
    const host = req.get('host') || 'localhost:20268';
    const redirectUri = `http://${host}/api/oauth/cline/callback`;
    const tokens = await exchangeClineCode(code, redirectUri);

    const formattedToken = tokens.accessToken.toLowerCase().startsWith('workos:')
      ? tokens.accessToken
      : `workos:${tokens.accessToken}`;

    const label = tokens.email ? `Cline (${tokens.email})` : 'Cline (WorkOS)';
    saveOAuthKey('cline', formattedToken, label);
    autoDiscoverModels('cline', { refresh: true }).catch(() => {});

    res.send(`<!DOCTYPE html>
<html>
<head>
  <meta charset="utf-8">
  <title>SRouter - Cline Connected</title>
  <style>
    body { font-family: system-ui, -apple-system, sans-serif; display: flex; justify-content: center; align-items: center; height: 100vh; margin: 0; background: #0f172a; color: #f8fafc; }
    .card { text-align: center; padding: 2.5rem; background: #1e293b; border-radius: 1rem; border: 1px solid #334155; box-shadow: 0 10px 25px rgba(0,0,0,0.5); max-width: 420px; }
    .icon { font-size: 3rem; color: #22c55e; margin-bottom: 1rem; }
    h2 { margin: 0 0 0.5rem; }
    p { color: #94a3b8; font-size: 0.95rem; line-height: 1.5; }
    .badge { display: inline-block; padding: 0.25rem 0.75rem; background: #334155; border-radius: 9999px; font-size: 0.85rem; color: #38bdf8; margin-top: 1rem; }
  </style>
</head>
<body>
  <div class="card">
    <div class="icon">&#10003;</div>
    <h2>Cline Connected!</h2>
    <p>Your Cline account <strong>${tokens.email || ''}</strong> has been successfully linked to SRouter.</p>
    <div class="badge">You can close this tab and return to SRouter</div>
    <div style="margin-top: 1.25rem;">
      <a href="/keys" style="color: #38bdf8; text-decoration: underline; font-size: 0.9rem;">&larr; Return to API Keys Dashboard</a>
    </div>
  </div>
  <script>
    try {
      if (window.opener) {
        window.opener.postMessage({ type: 'SROUTER_OAUTH_SUCCESS', provider: 'cline', email: '${tokens.email || ''}' }, '*');
      }
    } catch {}
    setTimeout(() => { window.close(); }, 3000);
  </script>
</body>
</html>`);
  } catch (err: any) {
    res.status(502).send(`<h3>Cline Connection Failed:</h3><p>${err?.message || String(err)}</p>`);
  }
});

/**
 * POST /api/oauth/nous/callback
 * Accepts personal token / portal key from Nous Portal.
 */
oauthRouter.post('/nous/callback', async (req: Request, res: Response) => {
  const { token, email } = req.body || {};
  if (!token || typeof token !== 'string') {
    res.status(400).json({ error: { message: 'Missing token parameter' } });
    return;
  }

  try {
    const cleanToken = token.trim();
    const detectedEmail = email || extractJwtEmail(cleanToken) || '';
    const label = detectedEmail ? ('Nous Portal (' + detectedEmail + ')') : 'Nous Portal (Connected Account)';
    const keyId = saveOAuthKey('nous', cleanToken, label);
    autoDiscoverModels('nous', { refresh: true }).catch(() => {});
    res.json({ success: true, keyId, provider: 'nous', email: detectedEmail });
  } catch (err: any) {
    res.status(500).json({ error: { message: (err as any)?.message || String(err) } });
  }
});

/**
 * POST /api/oauth/:provider/detect-local
 * Picks up credentials from locally installed IDEs (Cline / Kiro) if present.
 */
oauthRouter.post('/:provider/detect-local', async (req: Request, res: Response) => {
  const provider = (Array.isArray(req.params.provider) ? req.params.provider[0] : req.params.provider)?.toLowerCase();

  try {
    if (provider === 'nous') {
      const candidatePaths = [
        path.join(os.homedir(), '.hermes', 'auth.json'),
        path.join(os.homedir(), '.hermes', 'credentials.json'),
        path.join(os.homedir(), '.hermes', 'config.json'),
        path.join(os.homedir(), '.nous', 'credentials.json'),
        path.join(os.homedir(), '.config', 'nous', 'credentials.json'),
      ];
      for (const cp of candidatePaths) {
        if (!fs.existsSync(cp)) continue;
        try {
          const raw = fs.readFileSync(cp, 'utf8');
          let token = undefined;
          let email = undefined;
          if (cp.endsWith('.json')) {
            const data = JSON.parse(raw);
            token = data?.access_token || data?.accessToken || data?.refresh_token || data?.refreshToken || data?.token || data?.api_key || data?.apiKey || data?.jwt;
            email = data?.email || data?.user?.email;
          }
          if (token && typeof token === 'string' && token.trim()) {
            const keyId = saveOAuthKey('nous', token.trim(), email ? ('Nous Portal (' + email + ')') : 'Nous Portal (Local Account)');
            autoDiscoverModels('nous', { refresh: true }).catch(() => {});
            res.json({ success: true, keyId, email, source: 'local_nous' });
            return;
          }
        } catch {}
      }
      const envPath = path.join(os.homedir(), '.hermes', '.env');
      if (fs.existsSync(envPath)) {
        try {
          const envTxt = fs.readFileSync(envPath, 'utf8');
          const m = envTxt.match(/(?:NOUS_API_KEY|HERMES_API_KEY|OPENAI_API_KEY)=(.+)/);
          if (m && m[1]?.trim()) {
            const token = m[1].trim();
            const keyId = saveOAuthKey('nous', token, 'Nous Portal (Local .env)');
            autoDiscoverModels('nous', { refresh: true }).catch(() => {});
            res.json({ success: true, keyId, source: 'local_nous_env' });
            return;
          }
        } catch {}
      }
      res.status(404).json({ error: { message: 'No active local Nous credentials found in ~/.hermes or ~/.nous' } });
      return;
    }

    if (provider === 'cline') {
      const provPath = path.join(os.homedir(), '.cline', 'data', 'settings', 'providers.json');
      if (fs.existsSync(provPath)) {
        const data = JSON.parse(fs.readFileSync(provPath, 'utf8'));
        const token = data?.providers?.cline?.settings?.auth?.accessToken;
        const email = data?.providers?.cline?.settings?.auth?.userInfo?.email || '';
        if (token && typeof token === 'string') {
          const formatted = token.toLowerCase().startsWith('workos:') ? token : `workos:${token}`;
          const keyId = saveOAuthKey('cline', formatted, email ? `Cline (${email})` : 'Cline (Local Account)');
          autoDiscoverModels('cline', { refresh: true }).catch(() => {});
          res.json({ success: true, keyId, email, source: 'local_cline' });
          return;
        }
      }
      res.status(404).json({ error: { message: 'No active local Cline credentials found in ~/.cline' } });
      return;
    }

    if (provider === 'freebuff') {
      const candidatePaths = [
        path.join(os.homedir(), '.config', 'manicode', 'credentials.json'),
        path.join(os.homedir(), '.codebuff', 'credentials.json'),
        path.join(os.homedir(), '.codebuff', 'config.json'),
      ];
      for (const cp of candidatePaths) {
        if (!fs.existsSync(cp)) continue;
        try {
          const raw = fs.readFileSync(cp, 'utf8');
          const data = JSON.parse(raw);
          const profile = data?.default || data;
          const token = profile?.authToken || profile?.token || profile?.apiKey;
          const email = profile?.email || profile?.user?.email;
          if (token && typeof token === 'string' && token.trim()) {
            const keyId = saveOAuthKey('freebuff', token.trim(), email ? `Freebuff (${email})` : 'Freebuff (Local CLI Account)');
            autoDiscoverModels('freebuff', { refresh: true }).catch(() => {});
            res.json({ success: true, keyId, email, source: 'local_freebuff' });
            return;
          }
        } catch {}
      }
      res.status(404).json({ error: { message: 'No active local Freebuff/Codebuff credentials found in ~/.config/manicode or ~/.codebuff' } });
      return;
    }

    res.status(400).json({ error: { message: `Local detection not supported for ${provider}` } });
  } catch (err: any) {
    res.status(500).json({ error: { message: (err as any)?.message || String(err) } });
  }
});
