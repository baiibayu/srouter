import { useState } from 'react'
import { useMutation, useQuery, useQueryClient } from '@tanstack/react-query'
import { Scale } from 'lucide-react'
import { apiFetch } from '@/lib/api'
import { Switch } from '@/components/ui/switch'
import { Button } from '@/components/ui/button'
import { Input } from '@/components/ui/input'
import { Label } from '@/components/ui/label'
import { Textarea } from '@/components/ui/textarea'
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from '@/components/ui/select'
import { EmptyState } from '@/components/empty-state'
import { CardSkeleton } from '@/components/ui/skeleton'
import { CodeBlock } from '@/components/code-block'
import { useI18n } from '@/i18n'
import {
  decisionExampleCurl,
  parseOptions,
  topProbabilities,
  type DecisionModel,
  type DecisionResult,
} from '@/lib/decision'

const AUTO = 'auto'

// One model from the catalog's System One section.
export function SystemOneModelCard({
  model: m,
  onToggle,
  pending,
}: {
  model: DecisionModel
  onToggle: (enabled: boolean) => void
  pending: boolean
}) {
  const { t } = useI18n()
  return (
    <section className={`rounded-3xl border bg-card p-5 ${m.enabled ? '' : 'opacity-60'}`}>
      <div className="flex items-center gap-3">
        <div className="min-w-0 flex-1">
          <div className="flex flex-wrap items-center gap-2">
            <span className="text-sm font-medium">{m.displayName}</span>
            {m.keyCount === 0 && (
              <span className="text-[10px] rounded-full px-1.5 py-0.5 bg-amber-600/15 text-amber-700 dark:bg-amber-400/15 dark:text-amber-400">
                {t('models.noKey')}
              </span>
            )}
          </div>
          <div className="truncate font-mono text-[11px] text-muted-foreground">{m.modelId}</div>
          <div className="truncate text-[11px] text-muted-foreground">
            {[m.platform, m.quotaLabel].filter(Boolean).join(' · ')}
          </div>
        </div>
        <span className="text-xs text-muted-foreground tabular-nums">
          {t('decision.thisMonth', { count: m.decisionsThisMonth })}
        </span>
        <Switch checked={m.enabled} onCheckedChange={onToggle} disabled={pending} aria-label={m.displayName} />
      </div>
    </section>
  )
}

// "Try it": one choice question over the typed text, run through POST /v1/systemone.
export function TrySystemOne({ models }: { models: DecisionModel[] }) {
  const { t } = useI18n()
  const [text, setText] = useState('')
  const [question, setQuestion] = useState('')
  const [options, setOptions] = useState('')
  const [model, setModel] = useState(AUTO)
  const [latency, setLatency] = useState<number | null>(null)

  const run = useMutation({
    mutationFn: async (): Promise<DecisionResult> => {
      const started = performance.now()
      const result = await apiFetch<DecisionResult>('/api/systemone/try', {
        method: 'POST',
        body: JSON.stringify({
          state: text.trim() || t('decision.tryTextPlaceholder'),
          question: question.trim() || t('decision.tryQuestionPlaceholder'),
          options: parseOptions(options || t('decision.tryOptionsPlaceholder')),
          ...(model !== AUTO ? { model } : {}),
        }),
      })
      setLatency(Math.round(performance.now() - started))
      return result
    },
  })

  const optionList = parseOptions(options || t('decision.tryOptionsPlaceholder'))
  const answer = run.data?.answers?.answer as { choice?: string; confidence?: number; probabilities?: Record<string, number> } | undefined
  const enabled = models.filter(m => m.enabled)

  return (
    <section className="rounded-3xl border bg-card p-5 space-y-3">
      <h2 className="text-sm font-medium">{t('decision.tryTitle')}</h2>
      <div className="space-y-1.5">
        <Label className="text-xs" htmlFor="systemone-text">{t('decision.tryText')}</Label>
        <Textarea
          id="systemone-text"
          value={text}
          onChange={e => setText(e.target.value)}
          placeholder={t('decision.tryTextPlaceholder')}
          rows={3}
          className="text-xs font-mono"
        />
      </div>
      <div className="grid grid-cols-1 md:grid-cols-2 gap-3">
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="systemone-question">{t('decision.tryQuestion')}</Label>
          <Input
            id="systemone-question"
            value={question}
            onChange={e => setQuestion(e.target.value)}
            placeholder={t('decision.tryQuestionPlaceholder')}
            className="text-xs"
          />
        </div>
        <div className="space-y-1.5">
          <Label className="text-xs" htmlFor="systemone-options">{t('decision.tryOptions')}</Label>
          <Input
            id="systemone-options"
            value={options}
            onChange={e => setOptions(e.target.value)}
            placeholder={t('decision.tryOptionsPlaceholder')}
            className="text-xs"
          />
        </div>
      </div>
      <div className="flex flex-wrap items-center gap-2 pt-1">
        <Select value={model} onValueChange={val => setModel(val ?? AUTO)}>
          <SelectTrigger className="w-56 text-xs h-8">
            <SelectValue placeholder={t('decision.autoModel')} />
          </SelectTrigger>
          <SelectContent>
            <SelectItem value={AUTO} className="text-xs">{t('decision.autoModel')}</SelectItem>
            {enabled.map(m => (
              <SelectItem key={m.id} value={m.modelId} className="text-xs">{m.displayName}</SelectItem>
            ))}
          </SelectContent>
        </Select>
        <Button size="sm" onClick={() => run.mutate()} disabled={run.isPending || optionList.length < 2}>
          {run.isPending ? t('decision.tryRunning') : t('decision.tryRun')}
        </Button>
        {latency !== null && (
          <span className="text-xs text-muted-foreground tabular-nums">
            {t('decision.latency', { ms: latency })}
          </span>
        )}
      </div>

      {run.isError && (
        <div className="rounded-xl border border-destructive/40 bg-destructive/10 p-3 text-xs text-destructive">
          {(run.error as Error).message}
        </div>
      )}

      {answer && (
        <div className="rounded-2xl bg-muted/50 p-4 space-y-2 text-xs">
          <div className="flex items-center justify-between">
            <span className="font-medium text-foreground">
              {t('decision.tryAnswer', { choice: answer.choice ?? '—' })}
            </span>
            {answer.confidence !== undefined && (
              <span className="text-muted-foreground tabular-nums">
                {t('decision.tryConfidence', { value: Math.round(answer.confidence * 100) })}
              </span>
            )}
          </div>
          {topProbabilities(answer.probabilities).map(([opt, p]) => (
            <div key={opt} className="flex items-center gap-2 font-mono text-[11px]">
              <span className="w-24 truncate">{opt}</span>
              <div className="h-1.5 flex-1 rounded-full bg-muted">
                <div className="h-1.5 rounded-full bg-foreground" style={{ width: `${Math.round(p * 100)}%` }} />
              </div>
              <span className="w-10 text-right tabular-nums text-muted-foreground">{Math.round(p * 100)}%</span>
            </div>
          ))}
        </div>
      )}
    </section>
  )
}

// System One Models view with "Try it" tester.
export function SystemOneModelsView() {
  const { t } = useI18n()
  const queryClient = useQueryClient()

  const { data: models = [], isLoading } = useQuery<DecisionModel[]>({
    queryKey: ['systemone-models'],
    queryFn: () => apiFetch('/api/systemone/models'),
    refetchInterval: 30_000,
  })

  const update = useMutation({
    mutationFn: ({ id, enabled }: { id: number; enabled: boolean }) =>
      apiFetch(`/api/systemone/models/${id}`, { method: 'PATCH', body: JSON.stringify({ enabled }) }),
    onSuccess: () => queryClient.invalidateQueries({ queryKey: ['systemone-models'] }),
  })

  const ordered = models.slice().sort((a, b) => a.priority - b.priority || a.id - b.id)

  return (
    <div className="space-y-4">
      <p className="text-xs text-muted-foreground">
        {t('decision.endpointHint')}{' '}
        <code className="rounded bg-muted px-1 py-0.5 font-mono text-[11px]">POST /v1/systemone</code>{' '}
        {t('decision.notRoutingHint')}
      </p>

      {isLoading ? (
        <>
          <CardSkeleton />
          <CardSkeleton />
        </>
      ) : ordered.length === 0 ? (
        <EmptyState icon={Scale} title={t('decision.empty')} />
      ) : (
        <>
          {ordered.map(m => (
            <SystemOneModelCard
              key={m.id}
              model={m}
              onToggle={enabled => update.mutate({ id: m.id, enabled })}
              pending={update.isPending}
            />
          ))}
          <TrySystemOne models={ordered} />
          <section className="rounded-3xl border bg-card p-5 space-y-2">
            <h2 className="text-sm font-medium">{t('decision.exampleTitle')}</h2>
            <div className="overflow-x-auto rounded-2xl bg-muted/50 p-4">
              <CodeBlock code={decisionExampleCurl(window.location.origin)} language="bash" />
            </div>
          </section>
        </>
      )}
    </div>
  )
}

// Backward compatibility alias
export const DecisionModelsView = SystemOneModelsView
