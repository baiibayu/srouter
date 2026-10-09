import { useMemo, useState, type FormEvent } from 'react'
import { useMutation, useQueryClient } from '@tanstack/react-query'
import { apiFetch } from '@/lib/api'
import { Button } from '@/components/ui/button'
import { Dialog, DialogClose, DialogPopup, DialogTitle } from '@/components/ui/dialog'
import { FieldError } from '@/components/ui/field-error'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { X } from 'lucide-react'
import type { ApiKey, BudgetPeriod } from '../../../../shared/types'
import { useI18n } from '@/i18n'
import { PLATFORMS } from './shared'
import { GroupLabelField } from './group-label-field'

function formatBudgetAmount(n: number): string {
  if (n >= 1_000_000_000) return `${(n / 1_000_000_000).toFixed(1).replace(/\.0$/, '')}B`
  if (n >= 1_000_000) return `${(n / 1_000_000).toFixed(1).replace(/\.0$/, '')}M`
  if (n >= 1_000) return `${(n / 1_000).toFixed(1).replace(/\.0$/, '')}K`
  return String(n)
}

type UpdateBody = {
  label?: string
  key?: string
  monthlyRequestCap?: number
  monthlyTokenCap?: number
<<<<<<< HEAD
  budgetPeriod?: BudgetPeriod
  groupLabel?: string
}

/** Parse a budget-cap input: blank or 0 means unlimited (0); otherwise a
 *  non-negative integer. Anything else is invalid (null). */
function parseCap(raw: string): number | null {
  const trimmed = raw.trim()
  if (!trimmed) return 0
  if (!/^\d+$/.test(trimmed)) return null
  const n = Number(trimmed)
  return Number.isSafeInteger(n) ? n : null
}

/** Format a cap for the input: 0 (unlimited) shows as empty. */
function capToInput(cap: number | undefined): string {
  return cap && cap > 0 ? String(cap) : ''
}

/** Edit the mutable parts of a key without deleting its stable endpoint
 *  identity. Changing the credential itself is deliberately explicit: the
 *  field starts empty because the API never sends plaintext secrets back. */
export function EditKeyDialog({
  apiKey,
  onOpenChange,
}: {
  apiKey: ApiKey
  onOpenChange: (open: boolean) => void
}) {
  const { t, locale } = useI18n()
  const queryClient = useQueryClient()
  const [label, setLabel] = useState(apiKey.label)
  const [apiKeyValue, setApiKeyValue] = useState('')
  const [accountId, setAccountId] = useState('')
  const [attempted, setAttempted] = useState(false)
<<<<<<< HEAD
  // Budget caps (#1158): editable here so the cap is settable from the
  // dashboard at all; it shipped API-only. Empty = unlimited. The period
  // picks the UTC window (daily/weekly/monthly) the caps count against.
  // Custom-endpoint group label (#1176): '' = the single legacy Custom group.
  const [groupLabel, setGroupLabel] = useState(apiKey.groupLabel ?? '')
  const isCustom = apiKey.platform === 'custom'
  // Monthly budget caps (#1158): editable here so the cap is settable from
  // the dashboard at all; it shipped API-only. Empty = unlimited.  const [requestCap, setRequestCap] = useState(capToInput(apiKey.monthlyRequestCap))
  const [tokenCap, setTokenCap] = useState(capToInput(apiKey.monthlyTokenCap))
  const [period, setPeriod] = useState<BudgetPeriod>(apiKey.budgetPeriod ?? 'auto')

  const needsAccountId = apiKey.platform === 'cloudflare'
  // Every row takes a credential, including the anonymous row of a
  // key-optional platform (Kilo, OVH, AI Horde): a real key replaces the
  // sentinel there (#1331).
  const provider = PLATFORMS.find(p => p.value === apiKey.platform)
  const credential = useMemo(() => {
    if (!apiKeyValue.trim()) return ''
    if (needsAccountId) return accountId.trim() ? `${accountId.trim()}:${apiKeyValue.trim()}` : ''
    return apiKeyValue.trim()
  }, [accountId, apiKeyValue, needsAccountId])

  const credentialError = needsAccountId &&
    (accountId.trim() ? !apiKeyValue.trim() : Boolean(apiKeyValue.trim()))
    ? t('keys.editCredentialPartsRequired')
    : null
  const requestCapValue = parseCap(requestCap)
  const tokenCapValue = parseCap(tokenCap)
  const capError = requestCapValue === null || tokenCapValue === null
  const requestCapChanged = requestCapValue !== (apiKey.monthlyRequestCap || 0)
  const tokenCapChanged = tokenCapValue !== (apiKey.monthlyTokenCap || 0)
<<<<<<< HEAD
  const periodChanged = period !== (apiKey.budgetPeriod ?? 'auto')
  const hasChanges = label !== apiKey.label || Boolean(credential) || requestCapChanged || tokenCapChanged || periodChanged
=======
  const groupLabelChanged = isCustom && groupLabel.trim() !== (apiKey.groupLabel ?? '')
  const hasChanges = label !== apiKey.label || Boolean(credential) || requestCapChanged || tokenCapChanged || groupLabelChanged
>>>>>>> fbfb5e63 (feat(keys): custom endpoint groups with #group routing (#1176) (#1371))

  const updateKey = useMutation({
    mutationFn: (body: UpdateBody) =>
      apiFetch(`/api/keys/${apiKey.id}`, { method: 'PATCH', body: JSON.stringify(body) }),
    onSuccess: () => {
      for (const key of ['keys', 'health']) queryClient.invalidateQueries({ queryKey: [key] })
      onOpenChange(false)
    },
  })

  const submit = (event: FormEvent) => {
    event.preventDefault()
    if (credentialError || capError) {
      setAttempted(true)
      return
    }

    const body: UpdateBody = {}
    if (label !== apiKey.label) body.label = label
    if (credential) body.key = credential
    if (requestCapChanged && requestCapValue !== null) body.monthlyRequestCap = requestCapValue
    if (tokenCapChanged && tokenCapValue !== null) body.monthlyTokenCap = tokenCapValue
<<<<<<< HEAD
    if (periodChanged) body.budgetPeriod = period
=======
    if (groupLabelChanged) body.groupLabel = groupLabel.trim()
>>>>>>> fbfb5e63 (feat(keys): custom endpoint groups with #group routing (#1176) (#1371))
    if (Object.keys(body).length > 0) updateKey.mutate(body)
    else onOpenChange(false)
  }

  return (
    <Dialog open onOpenChange={onOpenChange}>
      <DialogPopup maxWidth="max-w-lg">
        <div className="mb-4 flex items-center justify-between gap-4">
          <DialogTitle>{t('keys.editKey')}</DialogTitle>
          <DialogClose
            aria-label={t('common.dismiss')}
            className="-mr-1 rounded-lg p-1 text-muted-foreground/70 transition-colors outline-none hover:text-foreground focus-visible:ring-3 focus-visible:ring-ring/50"
          >
            <X className="size-4" />
          </DialogClose>
        </div>

        <form onSubmit={submit} className="space-y-4">
          <div className="grid gap-3 sm:grid-cols-2">
            <div className="space-y-1.5">
              <Label className="text-xs">{t('keys.platform')}</Label>
              <Input value={provider?.label ?? apiKey.platform} readOnly className="bg-muted/30" />
              <p className="text-[11px] text-muted-foreground">{t('keys.editPlatformLocked')}</p>
            </div>
            <div className="space-y-1.5">
              <Label className="text-xs" htmlFor="edit-key-label">{t('keys.label')}</Label>
              <Input
                id="edit-key-label"
                value={label}
                onChange={e => setLabel(e.target.value)}
                placeholder={t('keys.customDisplayNameOptional')}
              />
            </div>
          </div>

          {apiKey.baseUrl && (
            <div className="space-y-1.5">
              <Label className="text-xs">{t('keys.customBaseUrl')}</Label>
              <Input value={apiKey.baseUrl} readOnly className="bg-muted/30 font-mono text-xs" />
            </div>
          )}

          {isCustom && <GroupLabelField value={groupLabel} onChange={setGroupLabel} />}

          <div className="space-y-1.5">
            <div className="flex items-center justify-between gap-2">
              <Label className="text-xs" htmlFor="edit-key-value">
                {needsAccountId ? t('keys.apiToken') : t('keys.customApiKey')}
              </Label>
              {!apiKey.keyless && (
                <code className="font-mono text-[11px] text-muted-foreground">{apiKey.maskedKey}</code>
              )}
            </div>
            {needsAccountId && (
              <Input
                value={accountId}
                onChange={e => setAccountId(e.target.value)}
                placeholder={t('keys.accountId')}
                className="font-mono text-xs"
                aria-invalid={attempted && Boolean(credentialError)}
              />
            )}
            <Input
              id="edit-key-value"
              type="password"
              autoComplete="new-password"
              value={apiKeyValue}
              onChange={e => setApiKeyValue(e.target.value)}
              placeholder={apiKey.keyless ? t('keys.keyOptionalPlaceholder') : (needsAccountId ? t('keys.bearerTokenPlaceholder') : t('keys.pasteKeyPlaceholder'))}
              className="font-mono text-xs"
              aria-invalid={attempted && Boolean(credentialError)}
            />
            {attempted && <FieldError error={credentialError} />}
            <p className="text-[11px] text-muted-foreground">
              {apiKey.keyless ? t('keys.keyOptionalHint') : t('keys.editCredentialHint')}
            </p>
          </div>

          {/* Budget caps (#1158) stay one collapsed line; they open by
              default only when a cap is already set, so a cap is never hidden. */}
          <details className="group" open={Boolean(apiKey.monthlyRequestCap || apiKey.monthlyTokenCap) || undefined}>
            <summary className="cursor-pointer select-none text-[11px] text-muted-foreground hover:text-foreground">
              {apiKey.monthlyUsage
                ? (() => {
                    const { requests, tokens, resetsAt } = apiKey.monthlyUsage
                    const reqCap = apiKey.monthlyRequestCap ?? 0
                    const tokCap = apiKey.monthlyTokenCap ?? 0

                    const reqLine = reqCap > 0
                      ? t('keys.monthlyUsageRequestsRelative', {
                          used: formatBudgetAmount(requests),
                          cap: formatBudgetAmount(reqCap),
                          remaining: formatBudgetAmount(Math.max(0, reqCap - requests)),
                        })
                      : t('keys.monthlyUsageRequests', { requests: requests.toLocaleString() })

                    const tokLine = tokCap > 0
                      ? t('keys.monthlyUsageTokensRelative', {
                          used: formatBudgetAmount(tokens),
                          cap: formatBudgetAmount(tokCap),
                          remaining: formatBudgetAmount(Math.max(0, tokCap - tokens)),
                        })
                      : t('keys.monthlyUsageTokens', { tokens: tokens.toLocaleString() })

                    const resetLine = resetsAt
                      ? ' · ' +
                        t('keys.monthlyUsageReset', {
                          date: new Date(resetsAt).toLocaleDateString(locale === 'id' ? 'id-ID' : 'en-US', {
                            day: 'numeric',
                            month: 'short',
                          }),
                        })
                      : ''

                    return `${reqLine} · ${tokLine}${resetLine}`
                  })()
                : t('keys.requestCapLabel')}
            </summary>
            <div className="mt-2 grid gap-3 sm:grid-cols-3">
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="edit-key-budget-period">{t('keys.budgetPeriodLabel')}</Label>
                <Select value={period} onValueChange={value => setPeriod(value as BudgetPeriod)}>
                  <SelectTrigger id="edit-key-budget-period" className="w-full">
                    <SelectValue />
                  </SelectTrigger>
                  <SelectContent>
                    <SelectItem value="auto" label={t('keys.budgetPeriodAuto')}>{t('keys.budgetPeriodAuto')}</SelectItem>
                    <SelectItem value="daily" label={t('keys.budgetPeriodDaily')}>{t('keys.budgetPeriodDaily')}</SelectItem>
                    <SelectItem value="weekly" label={t('keys.budgetPeriodWeekly')}>{t('keys.budgetPeriodWeekly')}</SelectItem>
                    <SelectItem value="monthly" label={t('keys.budgetPeriodMonthly')}>{t('keys.budgetPeriodMonthly')}</SelectItem>
                  </SelectContent>
                </Select>
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="edit-key-request-cap">{t('keys.requestCapLabel')}</Label>
                <Input
                  id="edit-key-request-cap"
                  inputMode="numeric"
                  value={requestCap}
                  onChange={e => setRequestCap(e.target.value)}
                  placeholder={t('keys.capUnlimitedPlaceholder')}
                  className="font-mono text-xs"
                  aria-invalid={attempted && requestCapValue === null}
                />
              </div>
              <div className="space-y-1.5">
                <Label className="text-xs" htmlFor="edit-key-token-cap">{t('keys.tokenCapLabel')}</Label>
                <Input
                  id="edit-key-token-cap"
                  inputMode="numeric"
                  value={tokenCap}
                  onChange={e => setTokenCap(e.target.value)}
                  placeholder={t('keys.capUnlimitedPlaceholder')}
                  className="font-mono text-xs"
                  aria-invalid={attempted && tokenCapValue === null}
                />
              </div>
            </div>
            {period === 'auto' && apiKey.resolvedBudgetPeriod && (
              <p className="mt-1.5 text-[11px] text-muted-foreground">
                {apiKey.budgetPeriodSource === 'daily-limit'
                  ? t('keys.autoResolvedDaily')
                  : apiKey.budgetPeriodSource === 'monthly-label'
                    ? t('keys.autoResolvedMonthly')
                    : t('keys.autoResolvedFallback')}
              </p>
            )}
            <p className="mt-1.5 text-[11px] text-muted-foreground">{t('keys.capEditHint')}</p>
          </details>

          {updateKey.isError && (
            <p className="text-xs text-destructive">{(updateKey.error as Error).message}</p>
          )}

          <div className="flex items-center justify-end gap-2 pt-1">
            <Button type="button" variant="outline" size="sm" onClick={() => onOpenChange(false)}>
              {t('common.cancel')}
            </Button>
            <Button type="submit" size="sm" disabled={!hasChanges || updateKey.isPending}>
              {updateKey.isPending ? t('common.saving') : t('common.save')}
            </Button>
          </div>
        </form>
      </DialogPopup>
    </Dialog>
  )
}
