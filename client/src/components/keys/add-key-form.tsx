import { useEffect, useMemo, useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Textarea } from '@/components/ui/textarea'
import { Label } from '@/components/ui/label'
import { ModelCombobox } from '@/components/model-combobox'
import { FieldError } from '@/components/ui/field-error'
import type { ApiKey, Platform, ProxyPoolNode } from '../../../../shared/types'
import { useI18n } from '@/i18n'
import { toast } from '@/lib/toast'
import type { FallbackEntry } from '@/lib/routing'
import { scopeCandidates, shouldOfferModelPicker, type ScopeCandidate } from '@/lib/model-scope-selection'
import { GetKeyLink, PLATFORMS } from './shared'
import { Network } from 'lucide-react'

/** A key that just landed, plus the models the picker should offer for it.
 *  Only produced when the picker is actually worth showing (#657) — otherwise
 *  the add stays as silent as it has always been. */
export interface AddedKeyScopeOffer {
  keyId: number
  platformLabel: string
  candidates: ScopeCandidate[]
}

// The "Provider key" pane of the Add key dialog: paste a credential for a known
// provider. Extracted verbatim from the old inline KeysPage form so all field
// validation, the keyless/Cloudflare special cases, and the POST /api/keys
// mutation stay identical. On success it toasts and asks the dialog to close.
// `initialPlatform` preselects the provider (checklist-chip entry); the field
// stays editable. The dialog remounts this pane per open, so a plain initial
// state is enough.
//
// `onSuccess` may carry a scope offer for the key that was just added; the
// dialog owns that follow-up because this pane unmounts the moment it closes.
export function AddKeyForm({ onSuccess, initialPlatform }: { onSuccess: (offer?: AddedKeyScopeOffer) => void; initialPlatform?: Platform }) {
  const { t } = useI18n()
  const queryClient = useQueryClient()
  const [platform, setPlatform] = useState<Platform | ''>(initialPlatform ?? '')
  const [apiKey, setApiKey] = useState('')
  const [accountId, setAccountId] = useState('')
  const [label, setLabel] = useState('')
  const [addAttempted, setAddAttempted] = useState(false)
  const [several, setSeveral] = useState(false)
  const [kiroPending, setKiroPending] = useState(false)
  const [kiroUserCode, setKiroUserCode] = useState<string | null>(null)
  const [freebuffPending, setFreebuffPending] = useState(false)
  const [freebuffUserCode, setFreebuffUserCode] = useState<string | null>(null)
  const [nousPending, setNousPending] = useState(false)
  const [nousUserCode, setNousUserCode] = useState<string | null>(null)
  const [showManualKey, setShowManualKey] = useState(false)

  useEffect(() => {
    const handleMsg = (e: MessageEvent) => {
      if (e.data?.type === 'SROUTER_OAUTH_SUCCESS') {
        queryClient.invalidateQueries({ queryKey: ['keys'] })
        queryClient.invalidateQueries({ queryKey: ['keys-providers'] })
        toast.success(`Linked account: ${e.data.email || e.data.provider}`)
        onSuccess()
      }
    }
    window.addEventListener('message', handleMsg)
    return () => window.removeEventListener('message', handleMsg)
  }, [queryClient, onSuccess])

  const handleKiroOAuth = async () => {
    try {
      setKiroPending(true)
      const auth = await apiFetch<any>('/api/oauth/kiro/authorize')
      if (auth.verificationUriComplete) {
        setKiroUserCode(auth.userCode)
        window.open(auth.verificationUriComplete, '_blank')

        const pollTimer = setInterval(async () => {
          try {
            const pollRes = await apiFetch<any>('/api/oauth/kiro/poll', {
              method: 'POST',
              body: JSON.stringify({
                clientId: auth.clientId,
                clientSecret: auth.clientSecret,
                deviceCode: auth.deviceCode,
                region: auth.region,
              }),
            })
            if (pollRes.success) {
              clearInterval(pollTimer)
              setKiroPending(false)
              setKiroUserCode(null)
              queryClient.invalidateQueries({ queryKey: ['keys'] })
              queryClient.invalidateQueries({ queryKey: ['keys-providers'] })
              toast.success('Connected Kiro AI (AWS Builder ID)!')
              onSuccess()
            } else if (!pollRes.pending) {
              clearInterval(pollTimer)
              setKiroPending(false)
            }
          } catch {
            clearInterval(pollTimer)
            setKiroPending(false)
          }
        }, 3000)
      }
    } catch (err: any) {
      setKiroPending(false)
      toast.error(err?.message || 'Failed to start Kiro OAuth')
    }
  }

  const handleClineOAuth = () => {
    window.open('/api/oauth/cline/authorize?redirect=true', 'cline_oauth', 'width=550,height=700')
  }

  const handleFreebuffOAuth = async () => {
    try {
      setFreebuffPending(true)
      const auth = await apiFetch<any>('/api/oauth/freebuff/authorize')
      if (auth.verificationUriComplete) {
        setFreebuffUserCode(auth.userCode)
        window.open(auth.verificationUriComplete, '_blank')

        const pollTimer = setInterval(async () => {
          try {
            const pollRes = await apiFetch<any>('/api/oauth/freebuff/poll', {
              method: 'POST',
              body: JSON.stringify({
                deviceCode: auth.deviceCode,
              }),
            })
            if (pollRes.success) {
              clearInterval(pollTimer)
              setFreebuffPending(false)
              setFreebuffUserCode(null)
              queryClient.invalidateQueries({ queryKey: ['keys'] })
              queryClient.invalidateQueries({ queryKey: ['keys-providers'] })
              toast.success(pollRes.email ? `Connected Freebuff (${pollRes.email})!` : 'Connected Freebuff Account!')
              onSuccess()
            } else if (!pollRes.pending) {
              clearInterval(pollTimer)
              setFreebuffPending(false)
            }
          } catch {
            clearInterval(pollTimer)
            setFreebuffPending(false)
          }
        }, 4000)
      }
    } catch (err: any) {
      setFreebuffPending(false)
      toast.error(err?.message || 'Failed to start Freebuff OAuth')
    }
  }

  const handleNousOAuth = async () => {
    try {
      setNousPending(true)
      const auth = await apiFetch<any>('/api/oauth/nous/authorize')
      const targetUrl = auth.verificationUriComplete || auth.verificationUri
      if (targetUrl) {
        setNousUserCode(auth.userCode)
        window.open(targetUrl, '_blank')

        const pollIntervalMs = (auth.interval || 4) * 1000
        const pollTimer = setInterval(async () => {
          try {
            const pollRes = await apiFetch<any>('/api/oauth/nous/poll', {
              method: 'POST',
              body: JSON.stringify({
                deviceCode: auth.deviceCode,
              }),
            })
            if (pollRes.success) {
              clearInterval(pollTimer)
              setNousPending(false)
              setNousUserCode(null)
              queryClient.invalidateQueries({ queryKey: ['keys'] })
              queryClient.invalidateQueries({ queryKey: ['keys-providers'] })
              toast.success(pollRes.email ? `Connected Nous Portal (${pollRes.email})!` : 'Connected Nous Portal Account!')
              onSuccess()
            } else if (!pollRes.pending) {
              clearInterval(pollTimer)
              setNousPending(false)
            }
          } catch {
            clearInterval(pollTimer)
            setNousPending(false)
          }
        }, pollIntervalMs)
      }
    } catch (err: any) {
      setNousPending(false)
      toast.error(err?.message || 'Failed to start Nous Portal OAuth')
    }
  }

  // #707: the platform dropdown had no search and no way to skip providers that
  // already have keys, which is painful at thirty-odd entries. The shared
  // ModelCombobox already does search + arrow keys, so this reuses it and only
  // supplies the options. PLATFORMS keeps its curated order — it is sorted by
  // recommendation, not alphabetically — and the search box handles "find it
  // fast". The added/not-added split reads the same ['keys'] query the
  // Providers tab owns, so it costs no extra request.
  const { data: keys = [] } = useQuery<ApiKey[]>({
    queryKey: ['keys'],
    queryFn: () => apiFetch('/api/keys'),
  })
  const addedPlatforms = useMemo(() => new Set<string>(keys.map(k => k.platform)), [keys])
  const [hideAdded, setHideAdded] = useState(false)
  const [proxyPoolId, setProxyPoolId] = useState<string>('__none__')

  const { data: proxyPoolData } = useQuery<{ pools: ProxyPoolNode[] }>({
    queryKey: ['proxy-pools'],
    queryFn: () => apiFetch('/api/settings/proxy/pools'),
  })
  const proxyPools = proxyPoolData?.pools ?? []
  const activePools = proxyPools.filter(p => p.enabled)

  // #657 post-add scope picker: the platform's model list. This is the same
  // ['fallback'] query the Models page, the fallback chain and the command
  // palette already run — react-query dedupes it, so opening this pane costs at
  // most one GET that the rest of the dashboard was going to make anyway. That
  // is why the picker needs no new endpoint and no widening of POST /api/keys
  // (whose response only carries a model COUNT, not the ids). An empty or
  // still-loading list simply means no picker, which is the old behaviour.
  const { data: catalog = [] } = useQuery<FallbackEntry[]>({
    queryKey: ['fallback'],
    queryFn: () => apiFetch('/api/fallback'),
  })

  // Whether the key that just landed is worth offering the picker for, and the
  // rows to offer. Anything missing — no id back, a keyless sentinel, a catalog
  // too small or not loaded — returns undefined, and the add stays silent.
  function scopeOffer(keyId: number | undefined, added: string, key: string): AddedKeyScopeOffer | undefined {
    if (typeof keyId !== 'number') return undefined
    const provider = PLATFORMS.find(p => p.value === added)
    // An anonymous row on a key-optional gateway is excluded from scope editing
    // on the key row too: no credential means nothing was bought per model
    // group. A real key saved there is an ordinary key (#1331).
    if (!provider || (provider.keyless && !key.trim())) return undefined
    const candidates = scopeCandidates(catalog, added)
    if (!shouldOfferModelPicker(candidates)) return undefined
    return { keyId, platformLabel: provider.label, candidates }
  }

  // Chat, media and custom providers only. Web search and fetch engines
  // (#1174) hold their keys in the Web Tools tab, where one section owns the
  // whole engine list (`components/keys/web-search-section`); offering them
  // here too would be a second, divergent place to store the same credential.
  // A single, unlabelled list needs no group heading.
  const platformOptions = useMemo(
    () => PLATFORMS
      // The selected provider always stays listed, so hiding added ones never
      // blanks out the trigger label.
      .filter(p => !hideAdded || !addedPlatforms.has(p.value) || p.value === platform)
      .map(p => ({
        value: p.value,
        label: p.label,
        sub: addedPlatforms.has(p.value) ? t('keys.discoverAlreadyAdded') : undefined,
      })),
    [hideAdded, addedPlatforms, platform, t],
  )

  const addKey = useMutation({
    meta: { silenceToast: true },
    mutationFn: (body: { platform: string; key: string; label?: string; proxyPoolId?: string | null }) =>
      apiFetch<{ id: number; notice?: string | null }>('/api/keys', { method: 'POST', body: JSON.stringify(body) }),
    onSuccess: (data, variables) => {
      queryClient.invalidateQueries({ queryKey: ['keys'] })
      queryClient.invalidateQueries({ queryKey: ['health'] })
      queryClient.invalidateQueries({ queryKey: ['fallback'] })
      queryClient.invalidateQueries({ queryKey: ['keys-providers'] })
      toast.success(t('keys.keyAdded'))
      // Server notice when the key is for a platform with no models in the
      // current catalog tier yet (#438) — surfaced as a toast now that the
      // dialog closes on success.
      if (data?.notice) toast.info(data.notice)
      onSuccess(scopeOffer(data?.id, variables.platform, variables.key))
    },
  })

  // Reuses the bulk endpoint the file importer already posts to, which dedupes
  // against every stored key and reports per-key failures.
  const addSeveral = useMutation({
    meta: { silenceToast: true },
    mutationFn: (body: { keys: { platform: string; keyName?: string; keyValue: string }[] }) =>
      apiFetch<{ imported: number; total: number; errors: { key: string; error: string }[] }>(
        '/api/keys/import-selected', { method: 'POST', body: JSON.stringify(body) },
      ),
    onSuccess: (data) => {
      for (const key of ['keys', 'health', 'fallback', 'keys-providers']) {
        queryClient.invalidateQueries({ queryKey: [key] })
      }
      toast.success(t('keys.importResult', { imported: data.imported, failed: data.total - data.imported }))
      onSuccess()
    },
  })

  const needsAccountId = platform === 'cloudflare'
  const isOAuthOnly = platform === 'kiro'
  const isOAuthSupported = ['cline', 'freebuff', 'nous'].includes(platform)
  // Key-optional providers (Kilo, OVH, AI Horde) work anonymously, but accept a
  // real key too (#1331): the field stays editable and may be left blank.
  const isKeyless = PLATFORMS.find(p => p.value === platform)?.keyless ?? false
  // Cloudflare pairs each token with an account id, and a key-optional
  // provider keeps a single anonymous row, so neither takes a list.
  const canPasteSeveral = !isKeyless && !needsAccountId
  const severalMode = several && canPasteSeveral
  // One per line or comma-separated, deduped, blanks dropped.
  const keyList = severalMode
    ? [...new Set(apiKey.split(/[\n,]+/).map(s => s.trim()).filter(Boolean))]
    : []

  // Field-level validation: the submit stays clickable and reveals what is
  // missing instead of being silently disabled.
  const platformError = !platform ? t('validation.required') : null
  const keyError = severalMode
    ? (keyList.length === 0 ? t('validation.required') : null)
    : (!isKeyless && !apiKey.trim() ? t('validation.required') : null)
  const accountIdError = needsAccountId && !accountId.trim() ? t('validation.required') : null
  const pending = addKey.isPending || addSeveral.isPending

  const handleSubmit = (e: React.FormEvent) => {
    e.preventDefault()
    if (platformError || keyError || accountIdError) {
      setAddAttempted(true)
      return
    }
    setAddAttempted(false)
    if (severalMode) {
      addSeveral.mutate({
        keys: keyList.map(keyValue => ({ platform, keyValue, keyName: label || undefined })),
      })
      return
    }
    // A blank key on a key-optional provider enables its anonymous tier; the
    // backend stores a sentinel and sends no Authorization header.
    const key = isKeyless ? apiKey.trim() : (needsAccountId ? `${accountId}:${apiKey}` : apiKey)
    addKey.mutate({
      platform,
      key,
      label: label || undefined,
      proxyPoolId: proxyPoolId !== '__none__' ? proxyPoolId : undefined,
    })
  }

  return (
    <div>
      {platform === 'nous' && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Nous Portal (OAuth Device Login — Tanpa Kartu Kredit/Billing)</span>
              {nousUserCode && (
                <span className="font-mono bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[11px]">
                  Code: {nousUserCode}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {nousPending
                ? 'Menunggu verifikasi di browser... Konfirmasi kode jika diminta.'
                : 'Hubungkan akun Nous Portal via OAuth device flow untuk menggunakan model tanpa perlu memasukkan billing/kartu kredit. Atau masukkan API Key manual di bawah.'}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleNousOAuth}
            disabled={nousPending}
            className="whitespace-nowrap shrink-0"
          >
            {nousPending ? 'Authorizing...' : 'Authorize Nous Portal'}
          </Button>
        </div>
      )}

      {platform === 'cline' && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Cline Account (WorkOS OAuth & Personal Token)</span>
            </div>
            <p className="text-[11px] text-muted-foreground">
              Sign in via WorkOS to link your Cline account, or paste an existing token in the key field below.
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleClineOAuth}
            className="whitespace-nowrap shrink-0"
          >
            Sign in with Cline Account
          </Button>
        </div>
      )}

      {platform === 'kiro' && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Kiro AI (AWS Builder ID Device Login)</span>
              {kiroUserCode && (
                <span className="font-mono bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[11px]">
                  Code: {kiroUserCode}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {kiroPending ? 'Waiting for AWS approval in browser...' : 'Connect free Claude 4.5 Sonnet / Haiku via AWS Builder ID OIDC device authorization.'}
            </p>
          </div>
          <Button
            type="button"
            size="sm"
            onClick={handleKiroOAuth}
            disabled={kiroPending}
            className="whitespace-nowrap shrink-0"
          >
            {kiroPending ? 'Polling AWS...' : 'Authorize AWS Builder ID'}
          </Button>
        </div>
      )}

      {platform === 'freebuff' && (
        <div className="mb-4 rounded-xl border border-primary/20 bg-primary/5 p-3.5 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
          <div className="space-y-1">
            <div className="text-xs font-semibold text-foreground flex items-center gap-1.5">
              <span>Freebuff (Codebuff CLI Device Login & Personal Token)</span>
              {freebuffUserCode && (
                <span className="font-mono bg-primary/20 text-primary px-1.5 py-0.5 rounded text-[11px]">
                  ID: {freebuffUserCode}
                </span>
              )}
            </div>
            <p className="text-[11px] text-muted-foreground">
              {freebuffPending ? 'Waiting for Freebuff approval in browser...' : 'Connect Freebuff account via unique fingerprint device login, or paste personal token below.'}
            </p>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <Button
              type="button"
              size="sm"
              onClick={handleFreebuffOAuth}
              disabled={freebuffPending}
              className="whitespace-nowrap"
            >
              {freebuffPending ? 'Polling Freebuff...' : 'Connect Freebuff Account'}
            </Button>
            <Button
              type="button"
              size="sm"
              variant="outline"
              onClick={() => window.open('https://freebuff.com/account', '_blank')}
              className="whitespace-nowrap"
            >
              Portal
            </Button>
          </div>
        </div>
      )}

      <form onSubmit={handleSubmit} className="flex flex-wrap gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs">{t('keys.platform')}</Label>
          <ModelCombobox
            value={platform}
            options={platformOptions}
            onSelect={v => { setPlatform(v as Platform); setShowManualKey(false); }}
            ariaLabel={t('keys.platform')}
            triggerPlaceholder={t('keys.selectPlatform')}
            placeholder={t('keys.filterPlaceholder')}
            emptyText={t('keys.noFilterMatch')}
            align="start"
            ariaInvalid={addAttempted && !!platformError}
            triggerClassName={`flex h-8 w-[220px] items-center justify-between gap-2 whitespace-nowrap rounded-lg border bg-transparent px-3 text-sm outline-none transition-colors hover:bg-muted/50 focus-visible:border-ring focus-visible:ring-3 focus-visible:ring-ring/50 dark:bg-input/30 ${addAttempted && platformError ? 'border-destructive' : 'border-input'}`}
            header={
              <div className="flex items-center gap-2 border-b px-3 py-2">
                <input
                  id="hide-added-platforms"
                  type="checkbox"
                  checked={hideAdded}
                  onChange={e => setHideAdded(e.target.checked)}
                  className="size-3.5 accent-foreground"
                />
                <label htmlFor="hide-added-platforms" className="text-xs text-muted-foreground">
                  {t('keys.hideAdded')}
                </label>
              </div>
            }
          />
          {addAttempted && <FieldError error={platformError} />}
          {(() => {
            const sel = PLATFORMS.find(p => p.value === platform)
            return sel?.url ? <div className="pt-0.5"><GetKeyLink url={sel.url} /></div> : null
          })()}
        </div>
        {needsAccountId && (
          <div className="space-y-1.5">
            <Label className="text-xs">{t('keys.accountId')}</Label>
            <Input
              value={accountId}
              onChange={e => setAccountId(e.target.value)}
              placeholder="a1b2c3d4…"
              className="w-[200px] font-mono text-xs"
              aria-invalid={addAttempted && !!accountIdError}
            />
            {addAttempted && <FieldError error={accountIdError} />}
          </div>
        )}
        {isOAuthOnly ? (
          <div className="space-y-1.5 flex-1 min-w-[240px] flex items-center pt-5">
            <p className="text-xs text-muted-foreground italic">
              Kiro AI uses AWS Builder ID device authentication. Please click the Authorize button above to connect your account.
            </p>
          </div>
        ) : isOAuthSupported && !showManualKey ? (
          <div className="space-y-1.5 flex-1 min-w-[240px] flex items-center pt-5">
            <button
              type="button"
              onClick={() => setShowManualKey(true)}
              className="text-xs text-muted-foreground hover:text-foreground underline underline-offset-2 transition-colors"
            >
              Or paste existing token manually…
            </button>
          </div>
        ) : (
          <div className="space-y-1.5 flex-1 min-w-[240px]">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs">{needsAccountId ? t('keys.apiToken') : t('keys.customApiKey')}</Label>
              {canPasteSeveral && (
                <button
                  type="button"
                  onClick={() => setSeveral(v => !v)}
                  className={`text-[11px] underline-offset-2 hover:underline ${severalMode ? 'text-foreground' : 'text-muted-foreground hover:text-foreground'}`}
                >
                  {t('keys.pasteSeveral')}
                </button>
              )}
            </div>
            {severalMode ? (
              <Textarea
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={'gsk_first…\ngsk_second…'}
                rows={3}
                className="font-mono text-xs"
                aria-invalid={addAttempted && !!keyError}
              />
            ) : (
              <Input
                type="password"
                value={apiKey}
                onChange={e => setApiKey(e.target.value)}
                placeholder={isKeyless ? t('keys.keyOptionalPlaceholder') : (needsAccountId ? t('keys.bearerTokenPlaceholder') : t('keys.pasteKeyPlaceholder'))}
                className="font-mono text-xs"
                aria-invalid={addAttempted && !!keyError}
              />
            )}
            {addAttempted && <FieldError error={keyError} />}
            {isKeyless && (
              <p className="text-[11px] text-muted-foreground">
                {t('keys.keyOptionalHint')}
              </p>
            )}
          </div>
        )}
        {activePools.length > 0 && (
          <div className="grid gap-3 sm:grid-cols-2 w-full pt-1">
            <div className="space-y-1.5">
              <Label className="text-xs flex items-center gap-1.5" htmlFor="add-key-proxy-node">
                <Network className="size-3.5 text-muted-foreground" />
                {t('keys.egressProxyNode')}
              </Label>
              <select
                id="add-key-proxy-node"
                value={proxyPoolId === '__round_robin__' ? '__all__' : proxyPoolId}
                onChange={e => {
                  const val = e.target.value
                  if (val === '__all__') setProxyPoolId('__round_robin__')
                  else setProxyPoolId(val)
                }}
                className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
              >
                {isKeyless && (
                  <option value="__all__">{t('keys.allActivePools')}</option>
                )}
                <option value="__none__">{t('keys.directConnection')}</option>
                {activePools.map(pool => (
                  <option key={pool.id} value={pool.id}>
                    {pool.name} ({pool.protocol})
                  </option>
                ))}
              </select>
            </div>

            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="add-key-proxy-strategy">
                {t('keys.proxyRoutingStrategy')}
              </Label>
              {isKeyless ? (
                <select
                  id="add-key-proxy-strategy"
                  value={proxyPoolId === '__round_robin__' || proxyPoolId === '__all__' ? 'round-robin' : (proxyPoolId === '__none__' || proxyPoolId === '__direct__' ? 'direct' : 'sticky')}
                  onChange={e => {
                    if (e.target.value === 'round-robin') setProxyPoolId('__round_robin__')
                    else if (e.target.value === 'direct') setProxyPoolId('__none__')
                  }}
                  className="flex h-8 w-full rounded-md border border-input bg-background px-3 py-1 text-xs shadow-sm transition-colors focus-visible:outline-none focus-visible:ring-1 focus-visible:ring-ring"
                >
                  <option value="round-robin">{t('keys.rotatePoolStrategy')}</option>
                  <option value="direct">{t('keys.directConnection')}</option>
                </select>
              ) : (
                <div className="flex h-8 w-full items-center rounded-md border border-input bg-muted/40 px-3 text-xs text-muted-foreground">
                  {t('keys.stickyStrategy')}
                </div>
              )}
            </div>
          </div>
        )}
        {!isOAuthOnly && (!isOAuthSupported || showManualKey) && (
          <div className="space-y-1.5">
            <Label className="text-xs">{t('keys.label')}</Label>
            <div className="flex flex-wrap items-center space-x-3">
              <Input
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder={t('keys.customDisplayNameOptional')}
                className="w-[160px]"
              />
              <Button type="submit" size="sm" disabled={pending}>
                {pending
                  ? t('keys.adding')
                  : severalMode && keyList.length > 1
                    ? t('keys.importSelected', { count: keyList.length })
                    : isKeyless && !apiKey.trim() ? t('keys.enable') : t('keys.addKey')}
              </Button>
            </div>
          </div>
        )}
      </form>
      {(addKey.isError || addSeveral.isError) && (
        <p className="text-destructive text-xs mt-2">{((addKey.error ?? addSeveral.error) as Error).message}</p>
      )}
    </div>
  )
}
