import { Badge } from '@/components/ui/badge'
import { CodeBlock } from '@/components/code-block'
import { useI18n } from '@/i18n'

const FETCH_CURL_EXAMPLE = `curl http://localhost:20268/v1/fetch \\
  -H "Authorization: Bearer $SROUTER_API_KEY" \\
  -H "Content-Type: application/json" \\
  -d '{"url":"https://example.com/article"}'`

// Models → Search/Web shared card: GET-free, always-on /v1/fetch endpoint —
// public http(s) browsing via TinyFish with a Jina fallback, SSRF-guarded.
// Lives here since 2026-10-10 (merged from its own tab) and is rendered by
// both the Web page (WebSearchPage) and the Search page (SearchEnginesView).
export function WebFetchCard() {
  const { t } = useI18n()
  return (
    <section className="rounded-3xl border bg-card p-5">
      <div className="mb-3">
        <h2 className="text-sm font-medium">{t('models.webFetchTab')}</h2>
        <p className="mt-0.5 text-xs text-muted-foreground">{t('models.webFetchBlurb')}</p>
      </div>
      <div className="flex items-center gap-2 min-w-0 text-sm">
        <span className="size-2 rounded-sm shrink-0" style={{ backgroundColor: 'rgb(34,197,94)' }} />
        <span className="truncate font-mono font-medium">POST /v1/fetch</span>
        <span className="truncate text-muted-foreground/70 text-xs font-normal">public http(s) · TinyFish → Jina fallback</span>
        <span className="flex-1" />
        <Badge>{t('models.webFetchAlwaysOn')}</Badge>
      </div>
      <ul className="mt-4 space-y-2 border-t border-border/60 pt-3 text-xs leading-relaxed text-muted-foreground">
        <li>{t('models.webFetchSsrf')}</li>
        <li>{t('models.webFetchJina')}</li>
      </ul>
      <div className="mt-4 border-t border-border/60 pt-3">
        <h3 className="mb-2 text-sm font-medium">{t('models.webFetchExample')}</h3>
        <div className="overflow-x-auto rounded-xl border bg-muted/40 p-3">
          <CodeBlock code={FETCH_CURL_EXAMPLE} language="bash" />
        </div>
      </div>
    </section>
  )
}
