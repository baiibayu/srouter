import { afterEach, describe, expect, it, vi } from 'vitest';
import { FreeAiProvider, freeAiAudioUrl } from '../../providers/freeai.js';
import { hasProvider } from '../../providers/index.js';
import { initDb, getDb } from '../../db/index.js';
import { encrypt } from '../../lib/crypto.js';
import { checkKeyHealth } from '../../services/health.js';

const audioUrl = 'https://api.free.ai/static/outputs/1bcc722e-4ddf-4e15-995a-b274000f99e5.wav';

describe('Free.ai', () => {
  afterEach(() => { vi.restoreAllMocks(); vi.useRealTimers(); });

  it('registers a TTS-only provider as keyless without inventing a chat endpoint', async () => {
    expect(hasProvider('freeai')).toBe(true);
    const provider = new FreeAiProvider();
    expect(provider.keyless).toBe(true);
    await expect(provider.chatCompletion()).rejects.toMatchObject({ status: 400 });
    await expect(provider.streamChatCompletion().next()).rejects.toMatchObject({ status: 400 });
    // Keyless providers always return true for validateKey
    await expect(provider.validateKey('')).resolves.toBe(true);
    await expect(provider.validateKey('test-key')).resolves.toBe(true);
  });

  it('keyless provider health check marks key healthy', async () => {
    process.env.ENCRYPTION_KEY = '0'.repeat(64);
    initDb(':memory:');
    const { encrypted, iv, authTag } = encrypt('test-key');
    const id = Number(getDb().prepare("INSERT INTO api_keys (platform,label,encrypted_key,iv,auth_tag,status,enabled) VALUES ('freeai','test',?,?,?,'unknown',1)").run(encrypted, iv, authTag).lastInsertRowid);
    const fetch = vi.spyOn(globalThis, 'fetch');
    // Keyless providers: validateKey returns true, so health check marks it 'healthy'
    await expect(checkKeyHealth(id)).resolves.toBe('healthy');
    expect(getDb().prepare('SELECT status, enabled, last_health_error FROM api_keys WHERE id=?').get(id)).toMatchObject({
      status: 'healthy', enabled: 1, last_health_error: null,
    });
    expect(fetch).not.toHaveBeenCalled();
  });

  it.each([null, {}, { audio_url: 'https://evil.example/a.wav' },
    { audio_url: 'http://api.free.ai/static/outputs/1bcc722e-4ddf-4e15-995a-b274000f99e5.wav' },
    { audio_url: 'https://api.free.ai@127.0.0.1/a.wav' }, { audio_url: `${audioUrl}?redirect=1` },
    { audio_url: 'https://api.free.ai/admin/' }, { audio_url: 'https://secret@api.free.ai/static/outputs/1bcc722e-4ddf-4e15-995a-b274000f99e5.wav' },
  ])('rejects unsafe or missing audio URLs', body => { expect(freeAiAudioUrl(body)).toBeNull(); });
});
