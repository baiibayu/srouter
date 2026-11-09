import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { useI18n } from '@/i18n'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { CopyButton } from '@/components/copy-button'

interface UrlToken {
  id: number
  label: string
  tokenPrefix: string
  createdAt: string
  lastUsedAt: string | null
  revokedAt: string | null
  token?: string
}

export function UrlTokensSection() {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [tokenLabel, setTokenLabel] = useState('')
  const [newToken, setNewToken] = useState<string | null>(null)

  const { data: tokenData } = useQuery<{ tokens: UrlToken[] }>({
    queryKey: ['url-tokens'],
    queryFn: () => apiFetch('/api/settings/url-tokens'),
  })

  const createToken = useMutation({
    mutationFn: () => apiFetch<UrlToken>('/api/settings/url-tokens', {
      method: 'POST',
      body: JSON.stringify({ label: tokenLabel }),
    }),
    onSuccess: token => {
      setNewToken(token.token ?? null)
      setTokenLabel('')
      queryClient.invalidateQueries({ queryKey: ['url-tokens'] })
    },
  })

  const revokeToken = useMutation({
    mutationFn: (id: number) => apiFetch<void>(`/api/settings/url-tokens/${id}`, {
      method: 'DELETE',
    }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['url-tokens'] }),
  })

  return (
    <section className="rounded-3xl border bg-card p-5">
      <h2 className="text-sm font-medium">{t('keys.urlTokensTitle')}</h2>
      <p className="mt-0.5 max-w-prose text-xs text-muted-foreground">{t('keys.urlTokensDesc')}</p>
      <div className="my-4 flex gap-2">
        <Input
          value={tokenLabel}
          onChange={event => setTokenLabel(event.target.value)}
          placeholder={t('keys.urlTokenLabel')}
          className="max-w-xs"
        />
        <Button size="sm" onClick={() => createToken.mutate()} disabled={createToken.isPending}>
          {t('keys.createUrlToken')}
        </Button>
      </div>
      {newToken && (
        <div className="mb-4 rounded-xl border border-amber-500/30 bg-amber-500/5 p-3">
          <p className="mb-2 text-xs text-muted-foreground">{t('keys.urlTokenOnce')}</p>
          <div className="flex items-center gap-2">
            <code className="min-w-0 flex-1 break-all font-mono text-xs">{newToken}</code>
            <CopyButton text={newToken} className="size-7 shrink-0" label={t('common.copy')} />
          </div>
        </div>
      )}
      <div className="space-y-2">
        {(tokenData?.tokens ?? []).map(token => (
          <div key={token.id} className="flex items-center justify-between gap-3 rounded-xl bg-muted/40 px-3 py-2">
            <div>
              <p className="text-xs font-medium">{token.label || token.tokenPrefix}</p>
              <p className="font-mono text-[11px] text-muted-foreground">{token.tokenPrefix}</p>
            </div>
            {token.revokedAt ? (
              <span className="text-xs text-muted-foreground">{t('keys.revoked')}</span>
            ) : (
              <Button
                variant="outline"
                size="sm"
                disabled={revokeToken.isPending}
                onClick={() => revokeToken.mutate(token.id)}
              >
                {t('keys.revoke')}
              </Button>
            )}
          </div>
        ))}
      </div>
    </section>
  )
}
