import { useState } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { Dialog, DialogPopup, DialogTitle, DialogClose } from '@/components/ui/dialog'
import { X } from 'lucide-react'
import type { ProxyPoolProtocol, ProxyPoolNode, ProxyPoolRole } from '../../../../shared/types'

interface ProxyNodeDialogProps {
  open: boolean;
  onOpenChange: (open: boolean) => void;
}

export function ProxyNodeDialog({ open, onOpenChange }: ProxyNodeDialogProps) {
  const queryClient = useQueryClient();
  const [name, setName] = useState('');
  const [url, setUrl] = useState('');
  const [protocol, setProtocol] = useState<ProxyPoolProtocol>('socks5');
  const [authToken, setAuthToken] = useState('');
  const [role, setRole] = useState<ProxyPoolRole>('primary');
  const [targetedPlatformsStr, setTargetedPlatformsStr] = useState('');

  const addNode = useMutation({
    mutationFn: (body: {
      name: string;
      url: string;
      protocol: ProxyPoolProtocol;
      authToken?: string;
      role?: ProxyPoolRole;
      targetedPlatforms?: string[];
    }) =>
      apiFetch<ProxyPoolNode>('/api/settings/proxy/pools', {
        method: 'POST',
        body: JSON.stringify(body),
      }),
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['proxy-pools'] });
      queryClient.invalidateQueries({ queryKey: ['proxy-url'] });
      setName('');
      setUrl('');
      setAuthToken('');
      setProtocol('socks5');
      setRole('primary');
      setTargetedPlatformsStr('');
      onOpenChange(false);
    },
  });

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault();
    if (!url.trim()) return;
    const targetedPlatforms = targetedPlatformsStr
      .split(',')
      .map(s => s.trim().toLowerCase())
      .filter(Boolean);

    addNode.mutate({
      name: name.trim() || url.trim(),
      url: url.trim(),
      protocol,
      role,
      ...(role === 'targeted' && targetedPlatforms.length > 0 ? { targetedPlatforms } : {}),
      ...(authToken.trim() ? { authToken: authToken.trim() } : {}),
    });
  };

  return (
    <Dialog open={open} onOpenChange={onOpenChange}>
      <DialogPopup maxWidth="max-w-md" className="flex flex-col gap-4">
        <div className="flex items-center justify-between border-b pb-3">
          <div>
            <DialogTitle className="text-base font-medium">Add proxy node</DialogTitle>
            <p className="text-xs text-muted-foreground mt-0.5">
              Register a proxy endpoint or fetch relay into the outbound pool
            </p>
          </div>
          <DialogClose
            aria-label="Close"
            className="-mr-1 rounded-lg p-1 text-muted-foreground/70 transition-colors outline-none hover:text-foreground focus-visible:ring-2 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </DialogClose>
        </div>

        <form onSubmit={handleSubmit} className="space-y-3.5">
          <div className="space-y-1.5">
            <Label className="text-xs">Node label</Label>
            <Input
              value={name}
              onChange={(e) => setName(e.target.value)}
              placeholder="e.g. SG SOCKS5, Cloudflare Edge, Corporate"
              className="text-xs"
            />
          </div>

          <div className="grid grid-cols-2 gap-3">
            <div className="space-y-1.5">
              <Label className="text-xs">Protocol</Label>
              <Select value={protocol} onValueChange={(val) => setProtocol(val as ProxyPoolProtocol)}>
                <SelectTrigger className="w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="socks5" label="SOCKS5 / SOCKS5h">SOCKS5 / SOCKS5h</SelectItem>
                  <SelectItem value="http" label="HTTP / HTTPS">HTTP / HTTPS</SelectItem>
                  <SelectItem value="fetch-relay" label="Fetch Relay">Fetch Relay</SelectItem>
                </SelectContent>
              </Select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs">Role</Label>
              <Select value={role} onValueChange={(val) => setRole(val as ProxyPoolRole)}>
                <SelectTrigger className="w-full text-xs">
                  <SelectValue />
                </SelectTrigger>
                <SelectContent>
                  <SelectItem value="primary" label="Primary (Regular Pool)">Primary (Regular Pool)</SelectItem>
                  <SelectItem value="fallback" label="Fallback (Failover Only)">Fallback (Failover Only)</SelectItem>
                  <SelectItem value="targeted" label="Targeted (Specific Platforms)">Targeted (Specific Platforms)</SelectItem>
                </SelectContent>
              </Select>
            </div>
          </div>

          {role === 'targeted' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Targeted Platforms (comma-separated)</Label>
              <Input
                value={targetedPlatformsStr}
                onChange={(e) => setTargetedPlatformsStr(e.target.value)}
                placeholder="e.g. openai, anthropic"
                className="font-mono text-xs"
              />
              <p className="text-[11px] text-muted-foreground">
                This node will only be used when routing traffic to the specified platforms.
              </p>
            </div>
          )}

          <div className="space-y-1.5">
            <Label className="text-xs">Proxy URL</Label>
            <Input
              required
              value={url}
              onChange={(e) => {
                const val = e.target.value;
                setUrl(val);
                if (val.startsWith('socks5://') || val.startsWith('socks4://')) {
                  setProtocol('socks5');
                } else if (val.startsWith('http://') || val.startsWith('https://')) {
                  if (val.includes('workers.dev') || val.includes('vercel.app')) {
                    setProtocol('fetch-relay');
                  }
                }
              }}
              placeholder={
                protocol === 'fetch-relay'
                  ? 'https://relay.example.workers.dev'
                  : protocol === 'socks5'
                  ? 'socks5://127.0.0.1:1080'
                  : 'http://user:pass@proxy.corp.com:8080'
              }
              className="font-mono text-xs"
            />
          </div>

          {protocol === 'fetch-relay' && (
            <div className="space-y-1.5">
              <Label className="text-xs">Relay auth token (optional)</Label>
              <Input
                type="password"
                autoComplete="new-password"
                value={authToken}
                onChange={(e) => setAuthToken(e.target.value)}
                placeholder="Bearer token if your relay requires authentication"
                className="font-mono text-xs"
              />
            </div>
          )}

          {addNode.isError && (
            <p className="text-xs text-destructive">{(addNode.error as Error).message}</p>
          )}

          <div className="pt-2 flex justify-end gap-2 border-t">
            <Button
              type="button"
              variant="outline"
              size="sm"
              onClick={() => onOpenChange(false)}
            >
              Cancel
            </Button>
            <Button
              type="submit"
              size="sm"
              disabled={addNode.isPending || !url.trim()}
            >
              {addNode.isPending ? 'Saving…' : 'Add node'}
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  );
}
