import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import { initDb, getDb } from '../../db/index.js';
import {
  getProxyPoolNodes,
  getActiveProxyPoolNodes,
  getProxyPoolStrategy,
  setProxyPoolStrategy,
  addProxyPoolNode,
  updateProxyPoolNode,
  deleteProxyPoolNode,
  selectProxyNode,
  deployCloudflareRelay,
  deployVercelRelay,
  CLOUDFLARE_WORKER_SCRIPT,
  VERCEL_EDGE_SCRIPT,
} from '../../services/proxy-pool.js';

describe('Proxy Pool Service', () => {
  beforeEach(async () => {
    await initDb(':memory:');
  });

  afterEach(() => {
    try {
      getDb().close();
    } catch {}
  });

  it('manages strategy selection (round-robin, random, forward)', () => {
    expect(getProxyPoolStrategy()).toBe('round-robin');

    setProxyPoolStrategy('random');
    expect(getProxyPoolStrategy()).toBe('random');

    setProxyPoolStrategy('forward');
    expect(getProxyPoolStrategy()).toBe('forward');

    setProxyPoolStrategy('round-robin');
    expect(getProxyPoolStrategy()).toBe('round-robin');
  });

  it('adds and infers protocol properly', () => {
    const socksNode = addProxyPoolNode({
      name: 'My SOCKS5',
      url: 'socks5://127.0.0.1:1080',
    });
    expect(socksNode.protocol).toBe('socks5');
    expect(socksNode.enabled).toBe(true);
    expect(socksNode.status).toBe('untested');

    const relayNode = addProxyPoolNode({
      name: 'My Relay',
      url: 'https://my-relay.workers.dev',
    });
    expect(relayNode.protocol).toBe('fetch-relay');

    const httpNode = addProxyPoolNode({
      name: 'Corporate Proxy',
      url: 'http://proxy.corp.com:8080',
    });
    expect(httpNode.protocol).toBe('http');

    const all = getProxyPoolNodes();
    expect(all.length).toBe(3);
  });

  it('updates node fields and status', () => {
    const node = addProxyPoolNode({
      name: 'Node 1',
      url: 'http://127.0.0.1:8080',
    });

    const updated = updateProxyPoolNode(node.id, {
      name: 'Node 1 Renamed',
      status: 'active',
      latencyMs: 142,
    });

    expect(updated).not.toBeNull();
    expect(updated?.name).toBe('Node 1 Renamed');
    expect(updated?.status).toBe('active');
    expect(updated?.latencyMs).toBe(142);
  });

  it('deletes a node', () => {
    const node = addProxyPoolNode({
      name: 'Ephemeral Node',
      url: 'http://127.0.0.1:9999',
    });
    expect(getProxyPoolNodes().length).toBe(1);

    const deleted = deleteProxyPoolNode(node.id);
    expect(deleted).toBe(true);
    expect(getProxyPoolNodes().length).toBe(0);
  });

  it('dispatches with round-robin strategy', () => {
    const n1 = addProxyPoolNode({ name: 'Node 1', url: 'http://1.1.1.1:80' });
    const n2 = addProxyPoolNode({ name: 'Node 2', url: 'http://2.2.2.2:80' });
    const n3 = addProxyPoolNode({ name: 'Node 3', url: 'http://3.3.3.3:80' });

    updateProxyPoolNode(n1.id, { status: 'active' });
    updateProxyPoolNode(n2.id, { status: 'active' });
    updateProxyPoolNode(n3.id, { status: 'active' });

    setProxyPoolStrategy('round-robin');

    const picked1 = selectProxyNode();
    const picked2 = selectProxyNode();
    const picked3 = selectProxyNode();
    const picked4 = selectProxyNode();

    expect([picked1?.id, picked2?.id, picked3?.id]).toEqual(
      expect.arrayContaining([n1.id, n2.id, n3.id])
    );
    expect(picked4?.id).toBe(picked1?.id);
  });

  it('dispatches with forward strategy', () => {
    const n1 = addProxyPoolNode({ name: 'Node 1', url: 'http://1.1.1.1:80' });
    const n2 = addProxyPoolNode({ name: 'Node 2', url: 'http://2.2.2.2:80' });

    updateProxyPoolNode(n1.id, { status: 'active' });
    updateProxyPoolNode(n2.id, { status: 'active' });

    setProxyPoolStrategy('forward');

    expect(selectProxyNode()?.id).toBe(n1.id);
    expect(selectProxyNode()?.id).toBe(n1.id);
  });

  it('skips disabled nodes', () => {
    const n1 = addProxyPoolNode({ name: 'Node 1', url: 'http://1.1.1.1:80', enabled: false });
    const n2 = addProxyPoolNode({ name: 'Node 2', url: 'http://2.2.2.2:80', enabled: true });

    updateProxyPoolNode(n1.id, { status: 'active' });
    updateProxyPoolNode(n2.id, { status: 'active' });

    const active = getActiveProxyPoolNodes();
    expect(active.length).toBe(1);
    expect(active[0].id).toBe(n2.id);
  });

  it('validates cloudflare and vercel deployment inputs', async () => {
    const cfRes = await deployCloudflareRelay({ accountId: '', apiToken: '' });
    expect(cfRes.ok).toBe(false);
    expect(cfRes.error).toContain('required');

    const vRes = await deployVercelRelay({ vercelToken: '' });
    expect(vRes.ok).toBe(false);
    expect(vRes.error).toContain('required');
  });

  it('includes expected headers in scripts', () => {
    expect(CLOUDFLARE_WORKER_SCRIPT).toContain('x-relay-target');
    expect(CLOUDFLARE_WORKER_SCRIPT).toContain('Fetch-Relay-Target');
    expect(VERCEL_EDGE_SCRIPT).toContain('x-relay-target');
    expect(VERCEL_EDGE_SCRIPT).toContain('Fetch-Relay-Target');
  });
});
