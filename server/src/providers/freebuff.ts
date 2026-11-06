import { OpenAICompatProvider } from './openai-compat.js';
import { isAnonymousCredential } from '../lib/credential.js';
import type { ChatMessage, ChatCompletionResponse, ChatCompletionChunk } from '@baiibayu/srouter-shared/types.js';
import type { CompletionOptions, KeyValidationResult } from './base.js';
import type { QuotaObservationContext } from '../services/provider-quota.js';
import { randomBytes, createHash } from 'crypto';
import fs from 'fs';
import path from 'path';
import os from 'os';

const MODEL_TO_AGENT: Record<string, string> = {
  'deepseek/deepseek-v4-flash': 'base2-free-deepseek-flash',
  'deepseek/deepseek-v4-pro': 'base2-free-deepseek',
  'openai/gpt-5.6-luna': 'base2-free-luna',
  'minimax/minimax-m3': 'base2-free-minimax-m3',
  'mimo/mimo-v2.5': 'base2-free-mimo',
  'z-ai/glm-5.2': 'base2-free-glm',
  'crof/kimi-k3-eco': 'base2-free-kimi-k3-eco',
  'anthropic/claude-fable-5': 'base2-free-fable',
  'meta/muse-spark-1.2-contributor': 'base2-free-muse-spark',
};

const OFFICIAL_FREEBUFF_CLI_VERSION = '0.2.35';
const OFFICIAL_FREEBUFF_USER_AGENT = `Freebuff-CLI/${OFFICIAL_FREEBUFF_CLI_VERSION}`;

function generateClientSessionId(): string {
  return randomBytes(7).toString('hex').slice(0, 13);
}

interface DeviceKeyRecord {
  version: number;
  publicKey: string;
  privateKey: string;
  registrations: Record<string, string>;
}

/**
 * Manages Freebuff official CLI Ed25519 device key generation, registration,
 * and per-request cryptographic signing (x-freebuff-device-* headers).
 */
class FreebuffDeviceAuth {
  private static instance: FreebuffDeviceAuth | null = null;
  private keyRecord: DeviceKeyRecord | null = null;
  private privateCryptoKey: any = null;
  private keyFilePath: string;

  constructor() {
    this.keyFilePath = path.join(os.homedir(), '.config', 'manicode', 'device-key.json');
  }

  static get(): FreebuffDeviceAuth {
    if (!this.instance) {
      this.instance = new FreebuffDeviceAuth();
    }
    return this.instance;
  }

  private async loadOrGenerateKey(): Promise<void> {
    if (this.keyRecord && this.privateCryptoKey) return;
    try {
      if (fs.existsSync(this.keyFilePath)) {
        const raw = fs.readFileSync(this.keyFilePath, 'utf8');
        const parsed = JSON.parse(raw);
        if (parsed.version === 1 && parsed.publicKey && parsed.privateKey) {
          this.keyRecord = parsed;
          const privBuf = Buffer.from(parsed.privateKey, 'base64url');
          this.privateCryptoKey = await (globalThis.crypto.subtle as any).importKey(
            'pkcs8',
            privBuf,
            { name: 'Ed25519' },
            false,
            ['sign']
          );
          return;
        }
      }
    } catch {}

    try {
      const pair: any = await (globalThis.crypto.subtle as any).generateKey({ name: 'Ed25519' }, true, ['sign', 'verify']);
      const pubBuf = Buffer.from(await (globalThis.crypto.subtle as any).exportKey('raw', pair.publicKey));
      const privBuf = Buffer.from(await (globalThis.crypto.subtle as any).exportKey('pkcs8', pair.privateKey));
      this.keyRecord = {
        version: 1,
        publicKey: pubBuf.toString('base64url'),
        privateKey: privBuf.toString('base64url'),
        registrations: {},
      };
      this.privateCryptoKey = pair.privateKey;
      fs.mkdirSync(path.dirname(this.keyFilePath), { recursive: true });
      fs.writeFileSync(this.keyFilePath, JSON.stringify(this.keyRecord, null, 2), 'utf8');
    } catch (e) {
      console.warn('[freebuff-device-key] key generation failed:', e);
    }
  }

  async getKeyId(token: string, apiHost: string): Promise<string | null> {
    if (!token) return null;
    await this.loadOrGenerateKey();
    if (!this.keyRecord) return null;
    const scope = `${apiHost.replace(/\/$/, '')} token:${token.slice(0, 32)}`;
    if (this.keyRecord.registrations[scope]) {
      return this.keyRecord.registrations[scope];
    }

    try {
      const res = await fetch(`${apiHost.replace(/\/$/, '')}/freebuff/device-keys`, {
        method: 'POST',
        headers: {
          Authorization: `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': OFFICIAL_FREEBUFF_USER_AGENT,
        },
        body: JSON.stringify({
          publicKey: this.keyRecord.publicKey,
          client: 'freebuff-cli',
        }),
      });
      if (res.ok) {
        const data = await res.json() as { keyId?: string };
        if (data?.keyId) {
          this.keyRecord.registrations[scope] = data.keyId;
          try {
            fs.writeFileSync(this.keyFilePath, JSON.stringify(this.keyRecord, null, 2), 'utf8');
          } catch {}
          return data.keyId;
        }
      }
    } catch (e) {
      console.warn('[freebuff-device-key] registration error:', e);
    }
    return null;
  }

  async signRequest(
    method: string,
    urlOrPath: string,
    bodyStr: string,
    keyId: string | null
  ): Promise<Record<string, string>> {
    if (!keyId) return {};
    await this.loadOrGenerateKey();
    if (!this.privateCryptoKey) return {};

    try {
      const pathname = urlOrPath.startsWith('http') ? new URL(urlOrPath).pathname : urlOrPath;
      const timestampMs = Date.now();
      const bodySha256 = createHash('sha256').update(bodyStr || '').digest('hex');
      const stringToSign = [
        'freebuff-device-v1',
        method.toUpperCase(),
        pathname,
        String(timestampMs),
        bodySha256,
        '',
      ].join('\n');

      const sigBuf = await (globalThis.crypto.subtle as any).sign(
        { name: 'Ed25519' },
        this.privateCryptoKey,
        new TextEncoder().encode(stringToSign)
      );
      const sigB64 = Buffer.from(sigBuf).toString('base64url');

      return {
        'x-freebuff-device-key': keyId,
        'x-freebuff-device-ts': String(timestampMs),
        'x-freebuff-device-sig': sigB64,
        'x-freebuff-client': 'freebuff-cli',
        'x-freebuff-client-version': OFFICIAL_FREEBUFF_CLI_VERSION,
        'x-freebuff-env': 'win32',
      };
    } catch {
      return {};
    }
  }
}

/**
 * Freebuff (freebuff.com / codebuff.com) - Strategic AI coding assistant backend.
 *
 * Implements 100% official Freebuff CLI signature & anti-ban standards:
 * - Ed25519 device key handshake (/api/v1/freebuff/device-keys)
 * - Cryptographic request signing (x-freebuff-device-sig)
 * - Official User-Agent (Freebuff-CLI/0.2.35)
 * - Real Codebuff session handshake & Buffy agent lifecycle
 */
export class FreebuffProvider extends OpenAICompatProvider {
  constructor() {
    super({
      platform: 'freebuff',
      name: 'Freebuff',
      baseUrl: 'https://www.codebuff.com/api/v1',
      keyless: false,
    });
  }

  private getLocalAuth(): { token?: string; userId?: string } {
    try {
      const credPath = path.join(os.homedir(), '.config', 'manicode', 'credentials.json');
      if (fs.existsSync(credPath)) {
        const data = JSON.parse(fs.readFileSync(credPath, 'utf8'));
        const profile = data?.default || data;
        if (profile?.authToken) {
          return {
            token: profile.authToken,
            userId: profile.id || profile.userId,
          };
        }
      }
    } catch {}
    return {};
  }

  private resolveEffectiveToken(apiKey: string): { token: string; userId?: string } {
    if (!isAnonymousCredential(apiKey) && apiKey.trim()) {
      return { token: apiKey.trim() };
    }
    const local = this.getLocalAuth();
    return { token: local.token || '', userId: local.userId };
  }

  protected customHeaders(apiKey: string): Record<string, string> {
    const { token, userId } = this.resolveEffectiveToken(apiKey);
    const headers: Record<string, string> = {
      'User-Agent': OFFICIAL_FREEBUFF_USER_AGENT,
      'Content-Type': 'application/json',
      'Accept': 'application/json, text/event-stream',
    };
    if (userId) {
      headers['x-freebuff-acting-user-id'] = userId;
    }
    if (token) {
      headers['Authorization'] = `Bearer ${token}`;
    }
    return headers;
  }

  override async fetchModelCatalog(_apiKey: string): Promise<Response> {
    const models = [
      { id: 'deepseek/deepseek-v4-flash', object: 'model' },
      { id: 'deepseek/deepseek-v4-pro', object: 'model' },
      { id: 'openai/gpt-5.6-luna', object: 'model' },
      { id: 'minimax/minimax-m3', object: 'model' },
      { id: 'mimo/mimo-v2.5', object: 'model' },
      { id: 'z-ai/glm-5.2', object: 'model' },
      { id: 'crof/kimi-k3-eco', object: 'model' },
      { id: 'anthropic/claude-fable-5', object: 'model' },
      { id: 'meta/muse-spark-1.2-contributor', object: 'model' },
    ];
    return new Response(JSON.stringify({ object: 'list', data: models }), {
      status: 200,
      headers: { 'Content-Type': 'application/json' },
    });
  }

  override async validateKey(apiKey: string, _quotaContext?: QuotaObservationContext): Promise<KeyValidationResult> {
    const { token } = this.resolveEffectiveToken(apiKey);
    if (!token) return false;
    try {
      const devAuth = FreebuffDeviceAuth.get();
      const keyId = await devAuth.getKeyId(token, this.baseUrl);
      const bodyStr = JSON.stringify({});
      const sigHeaders = await devAuth.signRequest('POST', '/api/v1/freebuff/session', bodyStr, keyId);

      const res = await this.fetchWithTimeout(`${this.baseUrl}/freebuff/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': OFFICIAL_FREEBUFF_USER_AGENT,
          'x-freebuff-model': 'deepseek/deepseek-v4-flash',
          ...sigHeaders,
        },
        body: bodyStr,
      }, 10000);
      if (res.ok) return true;
      let bodyText = '';
      try {
        bodyText = await res.text();
      } catch {}
      if (bodyText.includes('"banned"')) {
        return { valid: false, error: 'Freebuff account is suspended by upstream (status: banned)' };
      }
      if (res.status === 401) {
        return { valid: false, error: 'Invalid or expired Freebuff session token' };
      }
      return false;
    } catch {
      return true;
    }
  }

  private async acquireSession(token: string, modelId: string, signal?: AbortSignal): Promise<{ instanceId: string; runId: string; agentId: string }> {
    const agentId = MODEL_TO_AGENT[modelId] || 'base2-free';
    const devAuth = FreebuffDeviceAuth.get();
    const keyId = await devAuth.getKeyId(token, this.baseUrl);

    let instanceId = '';
    let runId = '';

    // Step 1: Session acquisition with Ed25519 signature
    try {
      const sessionBody = JSON.stringify({});
      const sessionSig = await devAuth.signRequest('POST', '/api/v1/freebuff/session', sessionBody, keyId);
      const sessionRes = await fetch(`${this.baseUrl}/freebuff/session`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': OFFICIAL_FREEBUFF_USER_AGENT,
          'x-freebuff-model': modelId,
          ...sessionSig,
        },
        body: sessionBody,
        signal,
      });
      if (sessionRes.ok) {
        const data = await sessionRes.json() as { instanceId?: string };
        instanceId = data?.instanceId || '';
      }
    } catch {}

    // Step 2: Agent run acquisition with Ed25519 signature
    try {
      const runBody = JSON.stringify({ action: 'START', agentId });
      const runSig = await devAuth.signRequest('POST', '/api/v1/agent-runs', runBody, keyId);
      const runRes = await fetch(`${this.baseUrl}/agent-runs`, {
        method: 'POST',
        headers: {
          'Authorization': `Bearer ${token}`,
          'Content-Type': 'application/json',
          'User-Agent': OFFICIAL_FREEBUFF_USER_AGENT,
          ...runSig,
        },
        body: runBody,
        signal,
      });
      if (runRes.ok) {
        const runData = await runRes.json() as { runId?: string };
        runId = runData?.runId || '';
      }
    } catch {}

    return { instanceId, runId, agentId };
  }

  override async chatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    _quotaContext?: QuotaObservationContext
  ): Promise<ChatCompletionResponse> {
    const { token, userId } = this.resolveEffectiveToken(apiKey);
    const { instanceId, runId, agentId } = await this.acquireSession(token, modelId, options?.signal);
    const devAuth = FreebuffDeviceAuth.get();
    const keyId = await devAuth.getKeyId(token, this.baseUrl);

    const incomingMessages = [...messages];
    const hasBuffy = incomingMessages[0]?.role === 'system' && String(incomingMessages[0]?.content || '').startsWith('You are Buffy');
    if (!hasBuffy) {
      incomingMessages.unshift({
        role: 'system',
        content: 'You are Buffy, the strategic coding assistant.',
      });
    }

    const payload = {
      model: modelId,
      messages: incomingMessages,
      stream: false,
      codebuff_metadata: {
        run_id: runId,
        cost_mode: 'free',
        client_id: generateClientSessionId(),
        freebuff_instance_id: instanceId,
      },
    };

    const payloadStr = JSON.stringify(payload);
    const sigHeaders = await devAuth.signRequest('POST', '/api/v1/chat/completions', payloadStr, keyId);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': OFFICIAL_FREEBUFF_USER_AGENT,
      'Accept': 'application/json',
      'x-freebuff-instance-id': instanceId,
      'x-codebuff-agent-id': agentId,
      ...sigHeaders,
    };
    if (userId) {
      headers['x-freebuff-acting-user-id'] = userId;
    }
    if (runId) {
      headers['x-codebuff-run-id'] = runId;
    }

    const res = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: payloadStr,
    }, options?.timeoutMs ?? 60_000, { signal: options?.signal, timeoutBounds: 'request' });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Freebuff API error ${res.status}: ${JSON.stringify(err)}`);
    }

    const data = await res.json() as ChatCompletionResponse;
    data._routed_via = { platform: 'freebuff', model: modelId };

    if (runId) {
      const finishBody = JSON.stringify({ action: 'FINISH', runId, status: 'completed' });
      devAuth.signRequest('POST', '/api/v1/agent-runs', finishBody, keyId).then(finishSig => {
        fetch(`${this.baseUrl}/agent-runs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': OFFICIAL_FREEBUFF_USER_AGENT,
            ...finishSig,
          },
          body: finishBody,
        }).catch(() => {});
      }).catch(() => {});
    }

    return data;
  }

  override async *streamChatCompletion(
    apiKey: string,
    messages: ChatMessage[],
    modelId: string,
    options?: CompletionOptions,
    _quotaContext?: QuotaObservationContext
  ): AsyncGenerator<ChatCompletionChunk, void, unknown> {
    const { token, userId } = this.resolveEffectiveToken(apiKey);
    const { instanceId, runId, agentId } = await this.acquireSession(token, modelId, options?.signal);
    const devAuth = FreebuffDeviceAuth.get();
    const keyId = await devAuth.getKeyId(token, this.baseUrl);

    const incomingMessages = [...messages];
    const hasBuffy = incomingMessages[0]?.role === 'system' && String(incomingMessages[0]?.content || '').startsWith('You are Buffy');
    if (!hasBuffy) {
      incomingMessages.unshift({
        role: 'system',
        content: 'You are Buffy, the strategic coding assistant.',
      });
    }

    const payload = {
      model: modelId,
      messages: incomingMessages,
      stream: true,
      codebuff_metadata: {
        run_id: runId,
        cost_mode: 'free',
        client_id: generateClientSessionId(),
        freebuff_instance_id: instanceId,
      },
    };

    const payloadStr = JSON.stringify(payload);
    const sigHeaders = await devAuth.signRequest('POST', '/api/v1/chat/completions', payloadStr, keyId);

    const headers: Record<string, string> = {
      'Authorization': `Bearer ${token}`,
      'Content-Type': 'application/json',
      'User-Agent': OFFICIAL_FREEBUFF_USER_AGENT,
      'Accept': 'application/json, text/event-stream',
      'x-freebuff-instance-id': instanceId,
      'x-codebuff-agent-id': agentId,
      ...sigHeaders,
    };
    if (userId) {
      headers['x-freebuff-acting-user-id'] = userId;
    }
    if (runId) {
      headers['x-codebuff-run-id'] = runId;
    }

    const res = await this.fetchWithTimeout(`${this.baseUrl}/chat/completions`, {
      method: 'POST',
      headers,
      body: payloadStr,
    }, options?.timeoutMs ?? 60_000, { signal: options?.signal });

    if (!res.ok) {
      const err = await res.json().catch(() => ({}));
      throw new Error(`Freebuff API error ${res.status}: ${JSON.stringify(err)}`);
    }

    yield* this.readSseStream(res, { firstByteTimeoutMs: options?.timeoutMs ?? 60_000 });

    if (runId) {
      const finishBody = JSON.stringify({ action: 'FINISH', runId, status: 'completed' });
      devAuth.signRequest('POST', '/api/v1/agent-runs', finishBody, keyId).then(finishSig => {
        fetch(`${this.baseUrl}/agent-runs`, {
          method: 'POST',
          headers: {
            'Authorization': `Bearer ${token}`,
            'Content-Type': 'application/json',
            'User-Agent': OFFICIAL_FREEBUFF_USER_AGENT,
            ...finishSig,
          },
          body: finishBody,
        }).catch(() => {});
      }).catch(() => {});
    }
  }
}
