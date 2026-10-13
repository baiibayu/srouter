// Shared HTML helpers for the /v1 tools endpoints: routes/tools.ts uses them
// to flatten fetched pages into readable text, services/web-search.ts to parse
// search-engine result markup. Plain-regex stripping — these feed data
// pipelines, not a browser: no script execution, no layout, bounded inputs.

export function decodeEntities(text: string): string {
  return text
    .replace(/&#x([0-9a-f]+);/gi, (_, h) => String.fromCodePoint(parseInt(h, 16)))
    .replace(/&#(\d+);/g, (_, d) => String.fromCodePoint(parseInt(d, 10)))
    .replace(/&nbsp;/g, ' ')
    .replace(/&quot;/g, '"')
    .replace(/&apos;|&#39;/g, "'")
    .replace(/&lt;/g, '<')
    .replace(/&gt;/g, '>')
    .replace(/&amp;/g, '&');
}

export function stripTags(html: string): string {
  return decodeEntities(html.replace(/<[^>]*>/g, ''));
}
