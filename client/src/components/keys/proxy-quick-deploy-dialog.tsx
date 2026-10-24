import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogPopup, DialogTitle, DialogClose } from '@/components/ui/dialog'
import { copyText } from '@/lib/clipboard'
import { X, ExternalLink } from 'lucide-react'

const CLOUDFLARE_WORKER_SCRIPT = `export default {
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
};`;

const VERCEL_EDGE_SCRIPT = `export const config = { runtime: "edge" };

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
}`;

const DENO_DEPLOY_SCRIPT = `Deno.serve(async (req) => {
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
});`;

const NETLIFY_EDGE_SCRIPT = `export default async (req) => {
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
export const config = { path: "/*" };`;

type DeployPlatform = 'cloudflare' | 'vercel' | 'deno' | 'netlify' | 'webshare' | 'quick-setup';

interface ProxyQuickDeployDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProxyQuickDeployDialog({ open, onOpenChange }: ProxyQuickDeployDialogProps) {
  const queryClient = useQueryClient();
  const [platform, setPlatform] = useState<DeployPlatform>('cloudflare');

  // Cloudflare State
  const [cfAccountId, setCfAccountId] = useState('');
  const [cfApiToken, setCfApiToken] = useState('');
  const [cfProjectName, setCfProjectName] = useState('srouter-relay');
  const [cfSubdomain, setCfSubdomain] = useState('');
  const [cfSuccessResult, setCfSuccessResult] = useState<{ url: string; name: string } | null>(null);

  // Vercel State
  const [vercelToken, setVercelToken] = useState('');
  const [vercelProjectName, setVercelProjectName] = useState('srouter-relay');
  const [vercelSuccessResult, setVercelSuccessResult] = useState<{ url: string; name: string } | null>(null);

  // Deno Deploy State
  const [denoToken, setDenoToken] = useState('');
  const [denoAppName, setDenoAppName] = useState('srouter-relay');
  const [denoSuccessResult, setDenoSuccessResult] = useState<{ url: string; name: string } | null>(null);

  // Netlify Edge State
  const [netlifyToken, setNetlifyToken] = useState('');
  const [netlifySiteName, setNetlifySiteName] = useState('srouter-relay');
  const [netlifySuccessResult, setNetlifySuccessResult] = useState<{ url: string; name: string } | null>(null);

  // Webshare State
  const [webshareApiKey, setWebshareApiKey] = useState('');
  const [webshareProtocol, setWebshareProtocol] = useState<'socks5' | 'http'>('socks5');
  const [webshareRawText, setWebshareRawText] = useState('');
  const [webshareImportMode, setWebshareImportMode] = useState<'api' | 'text'>('api');
  const [webshareRole, setWebshareRole] = useState<'primary' | 'fallback' | 'targeted'>('primary');
  const [webshareTargetedPlatformsStr, setWebshareTargetedPlatformsStr] = useState('openai, anthropic');
  const [webshareSuccessResult, setWebshareSuccessResult] = useState<{ count: number } | null>(null);

  // Copy Feedback state
  const [copiedKey, setCopiedKey] = useState<string | null>(null);

  const handleCopy = async (key: string, text: string) => {
    const success = await copyText(text);
    if (success) {
      setCopiedKey(key);
      setTimeout(() => setCopiedKey(null), 2000);
    }
  };

  const cfDeploy = useMutation({
    mutationFn: (body: { accountId: string; apiToken: string; projectName: string; subdomain?: string }) =>
      apiFetch<{ ok: boolean; url: string; node: any }>('/api/settings/proxy/pools/deploy/cloudflare', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setCfSuccessResult({ url: data.url, name: cfProjectName });
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] });
      queryClient.invalidateQueries({ queryKey: ['proxy-url'] });
    },
  });

  const vercelDeploy = useMutation({
    mutationFn: (body: { vercelToken: string; projectName: string }) =>
      apiFetch<{ ok: boolean; url: string; node: any }>('/api/settings/proxy/pools/deploy/vercel', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setVercelSuccessResult({ url: data.url, name: vercelProjectName });
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] });
      queryClient.invalidateQueries({ queryKey: ['proxy-url'] });
    },
  });

  const denoDeploy = useMutation({
    mutationFn: (body: { denoToken: string; appName: string }) =>
      apiFetch<{ ok: boolean; url: string; node: any }>('/api/settings/proxy/pools/deploy/deno', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setDenoSuccessResult({ url: data.url, name: denoAppName });
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] });
      queryClient.invalidateQueries({ queryKey: ['proxy-url'] });
    },
  });

  const netlifyDeploy = useMutation({
    mutationFn: (body: { netlifyToken: string; siteName: string }) =>
      apiFetch<{ ok: boolean; url: string; node: any }>('/api/settings/proxy/pools/deploy/netlify', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setNetlifySuccessResult({ url: data.url, name: netlifySiteName });
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] });
      queryClient.invalidateQueries({ queryKey: ['proxy-url'] });
    },
  });

  const webshareApiImport = useMutation({
    mutationFn: (body: {
      apiKey: string;
      protocol: 'socks5' | 'http';
      role?: 'primary' | 'fallback' | 'targeted';
      targetedPlatforms?: string[];
    }) =>
      apiFetch<{ ok: boolean; count: number; nodes: any[] }>('/api/settings/proxy/pools/import/webshare', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setWebshareSuccessResult({ count: data.count });
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] });
      queryClient.invalidateQueries({ queryKey: ['proxy-url'] });
    },
  });

  const webshareTextImport = useMutation({
    mutationFn: (body: {
      rawText: string;
      defaultProtocol: 'socks5' | 'http';
      role?: 'primary' | 'fallback' | 'targeted';
      asCluster?: boolean;
    }) =>
      apiFetch<{ ok: boolean; count: number; nodes: any[] }>('/api/settings/proxy/pools/import/text', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: (data) => {
      setWebshareSuccessResult({ count: data.count });
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] });
      queryClient.invalidateQueries({ queryKey: ['proxy-url'] });
    },
  });

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup maxWidth="max-w-2xl" className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <DialogTitle className="text-base font-medium">Deploy &amp; Setup Relay</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Deploy a serverless fetch relay or configure proxy presets for your pool.
            </p>
          </div>
          <DialogClose
            aria-label="Close"
            className="-mr-1 rounded-lg p-1 text-muted-foreground/70 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </DialogClose>
        </div>

        {/* Platform Selection Dropdown */}
        <div className="space-y-1.5">
          <Label className="text-xs">Platform</Label>
          <Select value={platform} onValueChange={(val) => setPlatform(val as DeployPlatform)}>
            <SelectTrigger className="w-full text-xs">
              <SelectValue />
            </SelectTrigger>
            <SelectContent>
              <SelectItem value="cloudflare" label="Cloudflare Workers (1-Click Deploy)">Cloudflare Workers (1-Click Deploy)</SelectItem>
              <SelectItem value="vercel" label="Vercel Edge (1-Click Deploy)">Vercel Edge (1-Click Deploy)</SelectItem>
              <SelectItem value="deno" label="Deno Deploy (1-Click Deploy)">Deno Deploy (1-Click Deploy)</SelectItem>
              <SelectItem value="netlify" label="Netlify Edge (1-Click Deploy)">Netlify Edge (1-Click Deploy)</SelectItem>
              <SelectItem value="webshare" label="Webshare (1-Click 10 Free Proxies)">Webshare (1-Click 10 Free Proxies)</SelectItem>
              <SelectItem value="quick-setup" label="Quick Proxy Templates (SOCKS5 / SSH / WARP)">Quick Proxy Templates (SOCKS5 / SSH / WARP)</SelectItem>
            </SelectContent>
          </Select>
        </div>

        {/* Cloudflare Workers */}
        {platform === 'cloudflare' && (
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground">
              Automatically uploads the relay script to Cloudflare and activates its <code className="font-mono">.workers.dev</code> route.
            </p>

            {cfSuccessResult ? (
              <div className="rounded-2xl border p-4 text-xs space-y-2 bg-muted/20">
                <p className="font-medium text-emerald-600 dark:text-emerald-400">
                  Cloudflare relay deployed successfully
                </p>
                <p className="text-muted-foreground">
                  The node was registered into your proxy pool:
                </p>
                <div className="flex items-center justify-between rounded-lg bg-background p-2 font-mono text-xs border">
                  <span
                    className="truncate font-semibold select-all"
                    style={{ color: '#10b981' }}
                  >
                    {cfSuccessResult.url}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleCopy('cf-url', cfSuccessResult.url)}
                  >
                    {copiedKey === 'cf-url' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="pt-2 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setCfSuccessResult(null)}>
                    Deploy another
                  </Button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  cfDeploy.mutate({
                    accountId: cfAccountId.trim(),
                    apiToken: cfApiToken.trim(),
                    projectName: cfProjectName.trim() || 'srouter-relay',
                    ...(cfSubdomain.trim() ? { subdomain: cfSubdomain.trim() } : {}),
                  });
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label className="text-xs">Account ID</Label>
                  <Input
                    required
                    value={cfAccountId}
                    onChange={(e) => setCfAccountId(e.target.value)}
                    placeholder="Found in Cloudflare Dashboard > Workers & Pages (sidebar)"
                    className="font-mono text-xs"
                  />
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">API Token</Label>
                  <Input
                    required
                    type="password"
                    autoComplete="new-password"
                    value={cfApiToken}
                    onChange={(e) => setCfApiToken(e.target.value)}
                    placeholder="Token with Account: Workers Scripts: Edit permission"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Create in <a href="https://dash.cloudflare.com/profile/api-tokens" target="_blank" rel="noreferrer" className="underline hover:text-foreground">User Profile &gt; API Tokens</a> using the &quot;Edit Cloudflare Workers&quot; template.
                  </p>
                </div>

                <div className="grid gap-3 sm:grid-cols-2">
                  <div className="space-y-1.5">
                    <Label className="text-xs">Worker name</Label>
                    <Input
                      value={cfProjectName}
                      onChange={(e) => setCfProjectName(e.target.value)}
                      placeholder="srouter-relay"
                      className="font-mono text-xs"
                    />
                  </div>

                  <div className="space-y-1.5">
                    <Label className="text-xs">Subdomain (optional)</Label>
                    <Input
                      value={cfSubdomain}
                      onChange={(e) => setCfSubdomain(e.target.value)}
                      placeholder="e.g. your-subdomain"
                      className="font-mono text-xs"
                    />
                    <p className="text-[11px] text-muted-foreground">
                      Only needed if your API token lacks Subdomain read permission.
                    </p>
                  </div>
                </div>

                {cfDeploy.isError && (
                  <p className="text-xs text-destructive">{(cfDeploy.error as Error).message}</p>
                )}

                <div className="pt-2 flex justify-end gap-2 border-t">
                  <Button type="submit" size="sm" disabled={cfDeploy.isPending || !cfAccountId || !cfApiToken}>
                    {cfDeploy.isPending ? 'Deploying to Cloudflare…' : 'Deploy to Cloudflare'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Vercel Edge */}
        {platform === 'vercel' && (
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground">
              Deploys an Edge runtime relay function into your Vercel account via the Vercel REST API.
            </p>

            {vercelSuccessResult ? (
              <div className="rounded-2xl border p-4 text-xs space-y-2 bg-muted/20">
                <p className="font-medium text-emerald-600 dark:text-emerald-400">
                  Vercel relay deployed successfully
                </p>
                <p className="text-muted-foreground">
                  The node was registered into your proxy pool:
                </p>
                <div className="flex items-center justify-between rounded-lg bg-background p-2 font-mono text-xs border">
                  <span
                    className="truncate font-semibold select-all"
                    style={{ color: '#10b981' }}
                  >
                    {vercelSuccessResult.url}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleCopy('vercel-url', vercelSuccessResult.url)}
                  >
                    {copiedKey === 'vercel-url' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="pt-2 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setVercelSuccessResult(null)}>
                    Deploy another
                  </Button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  vercelDeploy.mutate({
                    vercelToken: vercelToken.trim(),
                    projectName: vercelProjectName.trim() || 'srouter-relay',
                  });
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label className="text-xs">Vercel API Token</Label>
                  <Input
                    required
                    type="password"
                    autoComplete="new-password"
                    value={vercelToken}
                    onChange={(e) => setVercelToken(e.target.value)}
                    placeholder="Vercel Access Token"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Create in <a href="https://vercel.com/account/tokens" target="_blank" rel="noreferrer" className="underline hover:text-foreground">Vercel Account &gt; Settings &gt; Tokens</a>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Project name</Label>
                  <Input
                    value={vercelProjectName}
                    onChange={(e) => setVercelProjectName(e.target.value)}
                    placeholder="srouter-relay"
                    className="font-mono text-xs"
                  />
                </div>

                {vercelDeploy.isError && (
                  <p className="text-xs text-destructive">{(vercelDeploy.error as Error).message}</p>
                )}

                <div className="pt-2 flex justify-end gap-2 border-t">
                  <Button type="submit" size="sm" disabled={vercelDeploy.isPending || !vercelToken}>
                    {vercelDeploy.isPending ? 'Deploying to Vercel…' : 'Deploy to Vercel'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Deno Deploy */}
        {platform === 'deno' && (
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground">
              Automatically creates an app and deploys the edge relay into your Deno Deploy account via Deno API v2.
            </p>

            {denoSuccessResult ? (
              <div className="rounded-2xl border p-4 text-xs space-y-2 bg-muted/20">
                <p className="font-medium text-emerald-600 dark:text-emerald-400">
                  Deno relay deployed successfully
                </p>
                <p className="text-muted-foreground">
                  The node was registered into your proxy pool:
                </p>
                <div className="flex items-center justify-between rounded-lg bg-background p-2 font-mono text-xs border">
                  <span
                    className="truncate font-semibold select-all"
                    style={{ color: '#10b981' }}
                  >
                    {denoSuccessResult.url}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleCopy('deno-url', denoSuccessResult.url)}
                  >
                    {copiedKey === 'deno-url' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="pt-2 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setDenoSuccessResult(null)}>
                    Deploy another
                  </Button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  denoDeploy.mutate({
                    denoToken: denoToken.trim(),
                    appName: denoAppName.trim() || 'srouter-relay',
                  });
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label className="text-xs">Deno Access Token</Label>
                  <Input
                    required
                    type="password"
                    autoComplete="new-password"
                    value={denoToken}
                    onChange={(e) => setDenoToken(e.target.value)}
                    placeholder="Deno Deploy Access Token"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Create in <a href="https://dash.deno.com/account#access-tokens" target="_blank" rel="noreferrer" className="underline hover:text-foreground">Deno Dashboard &gt; Settings &gt; Access Tokens</a>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">App name / slug</Label>
                  <Input
                    value={denoAppName}
                    onChange={(e) => setDenoAppName(e.target.value)}
                    placeholder="srouter-relay"
                    className="font-mono text-xs"
                  />
                </div>

                {denoDeploy.isError && (
                  <p className="text-xs text-destructive">{(denoDeploy.error as Error).message}</p>
                )}

                <div className="pt-2 flex justify-end gap-2 border-t">
                  <Button type="submit" size="sm" disabled={denoDeploy.isPending || !denoToken}>
                    {denoDeploy.isPending ? 'Deploying to Deno…' : 'Deploy to Deno'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Netlify Edge */}
        {platform === 'netlify' && (
          <div className="space-y-4 py-1">
            <p className="text-xs text-muted-foreground">
              Automatically creates a site and deploys an Edge Function relay to Netlify via the Netlify REST API.
            </p>

            {netlifySuccessResult ? (
              <div className="rounded-2xl border p-4 text-xs space-y-2 bg-muted/20">
                <p className="font-medium text-emerald-600 dark:text-emerald-400">
                  Netlify relay deployed successfully
                </p>
                <p className="text-muted-foreground">
                  The node was registered into your proxy pool:
                </p>
                <div className="flex items-center justify-between rounded-lg bg-background p-2 font-mono text-xs border">
                  <span
                    className="truncate font-semibold select-all"
                    style={{ color: '#10b981' }}
                  >
                    {netlifySuccessResult.url}
                  </span>
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => handleCopy('netlify-url', netlifySuccessResult.url)}
                  >
                    {copiedKey === 'netlify-url' ? 'Copied' : 'Copy'}
                  </Button>
                </div>
                <div className="pt-2 flex justify-end">
                  <Button size="sm" variant="outline" onClick={() => setNetlifySuccessResult(null)}>
                    Deploy another
                  </Button>
                </div>
              </div>
            ) : (
              <form
                onSubmit={(e) => {
                  e.preventDefault();
                  netlifyDeploy.mutate({
                    netlifyToken: netlifyToken.trim(),
                    siteName: netlifySiteName.trim() || 'srouter-relay',
                  });
                }}
                className="space-y-3"
              >
                <div className="space-y-1.5">
                  <Label className="text-xs">Netlify Personal Access Token</Label>
                  <Input
                    required
                    type="password"
                    autoComplete="new-password"
                    value={netlifyToken}
                    onChange={(e) => setNetlifyToken(e.target.value)}
                    placeholder="Netlify Personal Access Token"
                    className="font-mono text-xs"
                  />
                  <p className="text-[11px] text-muted-foreground">
                    Create in <a href="https://app.netlify.com/user/applications#personal-access-tokens" target="_blank" rel="noreferrer" className="underline hover:text-foreground">Netlify User Settings &gt; Applications &gt; Personal Access Tokens</a>.
                  </p>
                </div>

                <div className="space-y-1.5">
                  <Label className="text-xs">Site name / subdomain</Label>
                  <Input
                    value={netlifySiteName}
                    onChange={(e) => setNetlifySiteName(e.target.value)}
                    placeholder="srouter-relay"
                    className="font-mono text-xs"
                  />
                </div>

                {netlifyDeploy.isError && (
                  <p className="text-xs text-destructive">{(netlifyDeploy.error as Error).message}</p>
                )}

                <div className="pt-2 flex justify-end gap-2 border-t">
                  <Button type="submit" size="sm" disabled={netlifyDeploy.isPending || !netlifyToken}>
                    {netlifyDeploy.isPending ? 'Deploying to Netlify…' : 'Deploy to Netlify'}
                  </Button>
                </div>
              </form>
            )}
          </div>
        )}

        {/* Webshare (1-Click Instant Import) */}
        {platform === 'webshare' && (
          <div className="space-y-4 py-1">
            <div className="rounded-xl border p-3 bg-muted/20 space-y-2 text-xs">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Webshare (10 Free Proxies)</span>
                <a
                  href="https://www.webshare.io/?referral_code=6ysgwfs6lffk"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline font-mono"
                >
                  webshare.io <ExternalLink className="size-3" />
                </a>
              </div>
              <p className="text-muted-foreground">
                Get 10 free proxies (1 GB bandwidth/mo) forever without requiring a credit card.
              </p>
              <div>
                <a
                  href="https://www.webshare.io/?referral_code=6ysgwfs6lffk"
                  target="_blank"
                  rel="noreferrer"
                  className="inline-flex items-center gap-1 text-xs text-primary font-medium hover:underline"
                >
                  Create free Webshare account &rarr;
                </a>
              </div>
            </div>

            {webshareSuccessResult ? (
              <div className="rounded-2xl border p-4 text-xs space-y-2 bg-muted/20">
                <p className="font-medium text-emerald-600 dark:text-emerald-400">
                  Successfully imported {webshareSuccessResult.count} proxies into SRouter pool!
                </p>
                <p className="text-muted-foreground">
                  The proxy nodes are now registered and active in your pool.
                </p>
                <div className="pt-2 flex justify-end gap-2">
                  <Button size="sm" variant="outline" onClick={() => setWebshareSuccessResult(null)}>
                    Import more
                  </Button>
                  <Button size="sm" onClick={() => onOpenChange(false)}>
                    Done
                  </Button>
                </div>
              </div>
            ) : (
              <div className="space-y-3">
                <div className="flex items-center gap-2 border-b pb-2">
                  <Button
                    type="button"
                    size="sm"
                    variant={webshareImportMode === 'api' ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setWebshareImportMode('api')}
                  >
                    API Key (Instant 1-Click)
                  </Button>
                  <Button
                    type="button"
                    size="sm"
                    variant={webshareImportMode === 'text' ? 'default' : 'outline'}
                    className="h-7 text-xs"
                    onClick={() => setWebshareImportMode('text')}
                  >
                    Paste Proxy List
                  </Button>
                </div>

                {webshareImportMode === 'api' ? (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      const targetedPlatforms = webshareRole === 'targeted'
                        ? webshareTargetedPlatformsStr.split(',').map(s => s.trim().toLowerCase()).filter(Boolean)
                        : undefined;
                      webshareApiImport.mutate({
                        apiKey: webshareApiKey.trim(),
                        protocol: webshareProtocol,
                        role: webshareRole,
                        targetedPlatforms,
                      });
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-1.5">
                      <Label className="text-xs">Webshare API Key</Label>
                      <Input
                        required
                        type="password"
                        autoComplete="new-password"
                        value={webshareApiKey}
                        onChange={(e) => setWebshareApiKey(e.target.value)}
                        placeholder="Paste your Webshare API Token"
                        className="font-mono text-xs"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Get your API token from <a href="https://dashboard.webshare.io/userapi/keys" target="_blank" rel="noreferrer" className="underline hover:text-foreground">dashboard.webshare.io/userapi/keys</a>.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Protocol</Label>
                        <Select value={webshareProtocol} onValueChange={(val) => setWebshareProtocol(val as 'socks5' | 'http')}>
                          <SelectTrigger className="w-full text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="socks5" label="SOCKS5 (Recommended)">SOCKS5 (Recommended)</SelectItem>
                            <SelectItem value="http" label="HTTP">HTTP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Routing Role</Label>
                        <Select value={webshareRole} onValueChange={(val) => setWebshareRole(val as 'primary' | 'fallback' | 'targeted')}>
                          <SelectTrigger className="w-full text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="primary" label="Standard Pool (Equal Share)">Standard Pool (Equal Share)</SelectItem>
                            <SelectItem value="fallback" label="Fallback (Only on Failure)">Fallback (Only on Failure)</SelectItem>
                            <SelectItem value="targeted" label="Targeted (Specific Platforms)">Targeted (Specific Platforms)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {webshareRole === 'targeted' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Targeted Platforms (comma-separated)</Label>
                        <Input
                          value={webshareTargetedPlatformsStr}
                          onChange={(e) => setWebshareTargetedPlatformsStr(e.target.value)}
                          placeholder="e.g. openai, anthropic"
                          className="font-mono text-xs"
                        />
                        <p className="text-[11px] text-muted-foreground">
                          Webshare proxies will only be used for traffic routed to these platforms.
                        </p>
                      </div>
                    )}

                    {webshareApiImport.isError && (
                      <p className="text-xs text-destructive">{(webshareApiImport.error as Error).message}</p>
                    )}

                    <div className="pt-2 flex justify-end gap-2 border-t">
                      <Button type="submit" size="sm" disabled={webshareApiImport.isPending || !webshareApiKey.trim()}>
                        {webshareApiImport.isPending ? 'Importing Cluster…' : 'Import 10 Free Proxies (Cluster)'}
                      </Button>
                    </div>
                  </form>
                ) : (
                  <form
                    onSubmit={(e) => {
                      e.preventDefault();
                      webshareTextImport.mutate({
                        rawText: webshareRawText.trim(),
                        defaultProtocol: webshareProtocol,
                        role: webshareRole,
                        asCluster: true,
                      });
                    }}
                    className="space-y-3"
                  >
                    <div className="space-y-1.5">
                      <Label className="text-xs">Proxy List Text</Label>
                      <textarea
                        required
                        rows={5}
                        value={webshareRawText}
                        onChange={(e) => setWebshareRawText(e.target.value)}
                        placeholder={"ip:port:user:pass\nsocks5://user:pass@ip:port\nuser:pass@ip:port"}
                        className="w-full rounded-md border border-input bg-transparent px-3 py-2 text-xs font-mono shadow-xs outline-none focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50"
                      />
                      <p className="text-[11px] text-muted-foreground">
                        Paste the proxy export list directly from Webshare. Imported as a single clustered node.
                      </p>
                    </div>

                    <div className="grid grid-cols-2 gap-3">
                      <div className="space-y-1.5">
                        <Label className="text-xs">Default Protocol</Label>
                        <Select value={webshareProtocol} onValueChange={(val) => setWebshareProtocol(val as 'socks5' | 'http')}>
                          <SelectTrigger className="w-full text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="socks5" label="SOCKS5">SOCKS5</SelectItem>
                            <SelectItem value="http" label="HTTP">HTTP</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>

                      <div className="space-y-1.5">
                        <Label className="text-xs">Routing Role</Label>
                        <Select value={webshareRole} onValueChange={(val) => setWebshareRole(val as 'primary' | 'fallback' | 'targeted')}>
                          <SelectTrigger className="w-full text-xs">
                            <SelectValue />
                          </SelectTrigger>
                          <SelectContent>
                            <SelectItem value="primary" label="Standard Pool (Equal Share)">Standard Pool (Equal Share)</SelectItem>
                            <SelectItem value="fallback" label="Fallback (Only on Failure)">Fallback (Only on Failure)</SelectItem>
                            <SelectItem value="targeted" label="Targeted (Specific Platforms)">Targeted (Specific Platforms)</SelectItem>
                          </SelectContent>
                        </Select>
                      </div>
                    </div>

                    {webshareRole === 'targeted' && (
                      <div className="space-y-1.5">
                        <Label className="text-xs">Targeted Platforms (comma-separated)</Label>
                        <Input
                          value={webshareTargetedPlatformsStr}
                          onChange={(e) => setWebshareTargetedPlatformsStr(e.target.value)}
                          placeholder="e.g. openai, anthropic"
                          className="font-mono text-xs"
                        />
                      </div>
                    )}

                    {webshareTextImport.isError && (
                      <p className="text-xs text-destructive">{(webshareTextImport.error as Error).message}</p>
                    )}

                    <div className="pt-2 flex justify-end gap-2 border-t">
                      <Button type="submit" size="sm" disabled={webshareTextImport.isPending || !webshareRawText.trim()}>
                        {webshareTextImport.isPending ? 'Importing…' : 'Import as Cluster'}
                      </Button>
                    </div>
                  </form>
                )}
              </div>
            )}
          </div>
        )}

        {/* Quick templates */}
        {platform === 'quick-setup' && (
          <div className="space-y-3 py-1 text-xs">
            {/* Webshare */}
            <div className="rounded-xl border p-3 space-y-1.5">
              <div className="flex items-center justify-between">
                <span className="font-medium text-foreground">Webshare (10 free proxies)</span>
                <div className="flex items-center gap-2">
                  <Button
                    size="sm"
                    variant="outline"
                    className="h-6 px-2 text-xs"
                    onClick={() => setPlatform('webshare')}
                  >
                    1-Click Import
                  </Button>
                  <a
                    href="https://www.webshare.io/?referral_code=6ysgwfs6lffk"
                    target="_blank"
                    rel="noreferrer"
                    className="inline-flex items-center gap-1 text-[11px] text-primary hover:underline"
                  >
                    webshare.io <ExternalLink className="size-3" />
                  </a>
                </div>
              </div>
              <p className="text-muted-foreground">
                Free account provides 10 free HTTP/SOCKS5 proxies without a credit card.
              </p>
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-2 font-mono text-[11px]">
                <span
                  className="truncate font-semibold select-all"
                  style={{ color: '#10b981' }}
                >
                  socks5://username:password@p.webshare.io:80
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleCopy('webshare', 'socks5://username:password@p.webshare.io:80')}
                >
                  {copiedKey === 'webshare' ? 'Copied' : 'Copy'}
                </Button>
              </div>
            </div>

            {/* Local SSH Tunnel */}
            <div className="rounded-xl border p-3 space-y-1.5">
              <span className="font-medium text-foreground">SSH SOCKS5 tunnel (Personal VPS)</span>
              <p className="text-muted-foreground">
                Run this command on your machine to route through your VPS on local port 1080:
              </p>
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-2 font-mono text-[11px]">
                <span
                  className="truncate font-semibold select-all"
                  style={{ color: '#10b981' }}
                >
                  ssh -D 1080 -N -C user@your-vps-ip
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleCopy('ssh', 'ssh -D 1080 -N -C user@your-vps-ip')}
                >
                  {copiedKey === 'ssh' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Add <code className="font-mono font-semibold" style={{ color: '#10b981' }}>socks5://127.0.0.1:1080</code> as a node in your pool.
              </p>
            </div>

            {/* Cloudflare WARP */}
            <div className="rounded-xl border p-3 space-y-1.5">
              <span className="font-medium text-foreground">Cloudflare WARP (Local proxy mode)</span>
              <p className="text-muted-foreground">
                Use your local Cloudflare WARP client as a SOCKS5 proxy:
              </p>
              <div className="flex items-center justify-between rounded-md bg-muted/40 p-2 font-mono text-[11px]">
                <span
                  className="truncate font-semibold select-all"
                  style={{ color: '#10b981' }}
                >
                  warp-cli mode proxy &amp;&amp; warp-cli proxy port 40000 &amp;&amp; warp-cli connect
                </span>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-6 px-2 text-xs"
                  onClick={() => handleCopy('warp', 'warp-cli mode proxy && warp-cli proxy port 40000 && warp-cli connect')}
                >
                  {copiedKey === 'warp' ? 'Copied' : 'Copy'}
                </Button>
              </div>
              <p className="text-[11px] text-muted-foreground">
                Add <code className="font-mono font-semibold" style={{ color: '#10b981' }}>socks5://127.0.0.1:40000</code> as a node in your pool.
              </p>
            </div>

            {/* Manual scripts */}
            <div className="rounded-xl border p-3 space-y-1.5">
              <span className="font-medium text-foreground">Manual relay scripts</span>
              <p className="text-muted-foreground">
                Paste directly into your serverless platform dashboard without an API token:
              </p>
              <div className="flex flex-wrap gap-2 pt-1">
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleCopy('cf-script', CLOUDFLARE_WORKER_SCRIPT)}
                >
                  {copiedKey === 'cf-script' ? 'Copied CF script' : 'Copy Cloudflare script'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleCopy('vercel-script', VERCEL_EDGE_SCRIPT)}
                >
                  {copiedKey === 'vercel-script' ? 'Copied Vercel script' : 'Copy Vercel script'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleCopy('deno-script', DENO_DEPLOY_SCRIPT)}
                >
                  {copiedKey === 'deno-script' ? 'Copied Deno script' : 'Copy Deno script'}
                </Button>
                <Button
                  size="sm"
                  variant="outline"
                  className="h-7 text-xs"
                  onClick={() => handleCopy('netlify-script', NETLIFY_EDGE_SCRIPT)}
                >
                  {copiedKey === 'netlify-script' ? 'Copied Netlify script' : 'Copy Netlify script'}
                </Button>
              </div>
            </div>
          </div>
        )}
      </DialogPopup>
    </Dialog>
  );
}
