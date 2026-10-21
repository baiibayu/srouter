// Self-contained API reference page served at `GET /v1/docs`.
//
// No CDN, no external scripts/styles/fonts, no `node_modules` served from disk:
// the whole viewer is inline and fetches the spec from `openapi.json` (relative
// to `/v1/docs`, which resolves to `/v1/openapi.json`). This is deliberate. The
// server ships as a `tsc` build, a `tsx` dev process, and an esbuild single-file
// bundle for the desktop app that carries no server `node_modules` — so pulling
// Swagger UI from `node_modules` at runtime would 404 in the desktop build, and
// vendoring its ~1.5 MB of assets into the repo would be bloat. A compact
// hand-rolled renderer keeps the docs offline-capable and identical across all
// three run targets. It is stored as a `.ts` string module (not an `.html`
// file) for the same reason the spec is: `.ts` compiles and bundles everywhere,
// while a static file is not copied into `dist/` and is absent from the bundle.
//
// Rendered client-side from the OpenAPI JSON via DOM APIs (no innerHTML
// templating), so nothing in the spec can inject markup.

export const DOCS_HTML = `<!DOCTYPE html>
<html lang="en">
<head>
  <meta charset="UTF-8" />
  <meta name="viewport" content="width=device-width, initial-scale=1" />
  <title>SRouter - API reference</title>
  <style>
    :root {
      --bg: #ffffff; --fg: #1b1f24; --muted: #5b6472; --border: #e4e8ee;
      --card: #f7f9fc; --accent: #2f6feb; --code-bg: #f0f3f8;
      --get: #1f883d; --post: #2f6feb; --put: #9a6700; --delete: #cf222e;
    }
    @media (prefers-color-scheme: dark) {
      :root {
        --bg: #0d1117; --fg: #e6edf3; --muted: #8b949e; --border: #21262d;
        --card: #161b22; --accent: #4c8dff; --code-bg: #161b22;
        --get: #3fb950; --post: #4c8dff; --put: #d29922; --delete: #f85149;
      }
    }
    * { box-sizing: border-box; }
    body {
      margin: 0; background: var(--bg); color: var(--fg);
      font: 15px/1.55 -apple-system, BlinkMacSystemFont, "Segoe UI", Roboto, Helvetica, Arial, sans-serif;
    }
    code, pre, .mono { font-family: ui-monospace, SFMono-Regular, "SF Mono", Menlo, Consolas, monospace; }
    header.top {
      position: sticky; top: 0; z-index: 5; background: var(--bg);
      border-bottom: 1px solid var(--border); padding: 18px 24px;
    }
    header.top h1 { margin: 0; font-size: 20px; display: inline-block; }
    .ver { margin-left: 10px; font-size: 12px; color: var(--muted); border: 1px solid var(--border);
      border-radius: 999px; padding: 2px 8px; vertical-align: middle; }
    .wrap { max-width: 900px; margin: 0 auto; padding: 24px; }
    p.desc { color: var(--muted); margin: 8px 0 0; }
    .auth { background: var(--card); border: 1px solid var(--border); border-radius: 10px;
      padding: 14px 16px; margin: 22px 0; }
    .auth h2 { margin: 0 0 6px; font-size: 14px; text-transform: uppercase; letter-spacing: .04em; color: var(--muted); }
    .info-card { background: var(--card); border: 1px solid var(--border); border-radius: 10px;
      padding: 16px 18px; margin: 20px 0; }
    .info-card h2 { margin: 0 0 8px; font-size: 14px; text-transform: uppercase; letter-spacing: .04em; color: var(--accent); }
    .info-card h3 { margin: 14px 0 6px; font-size: 13px; font-weight: 600; text-transform: uppercase; letter-spacing: .03em; color: var(--fg); }
    .info-card p, .info-card li { color: var(--muted); font-size: 13px; line-height: 1.5; margin: 6px 0; }
    .info-card ul { margin: 6px 0; padding-left: 20px; }
    .table-spec { width: 100%; border-collapse: collapse; font-size: 13px; margin: 10px 0; }
    .table-spec th, .table-spec td { border-top: 1px solid var(--border); padding: 8px 10px; text-align: left; }
    .table-spec th { font-weight: 600; color: var(--fg); background: var(--card); }
    .tag-pill { display: inline-block; font-size: 11px; padding: 2px 7px; border-radius: 999px;
      background: var(--code-bg); border: 1px solid var(--border); color: var(--fg); font-weight: 500; }
    .group h2 { font-size: 16px; margin: 30px 0 6px; padding-bottom: 6px; border-bottom: 1px solid var(--border); }
    .op { border: 1px solid var(--border); border-radius: 10px; margin: 12px 0; overflow: hidden; }
    .op > summary { list-style: none; cursor: pointer; padding: 12px 14px; display: flex; gap: 12px;
      align-items: center; user-select: none; }
    .op > summary::-webkit-details-marker { display: none; }
    .op[open] > summary { border-bottom: 1px solid var(--border); }
    .method { font-weight: 700; font-size: 12px; letter-spacing: .05em; text-transform: uppercase;
      color: #fff; border-radius: 6px; padding: 3px 9px; flex: 0 0 auto; }
    .m-get { background: var(--get); } .m-post { background: var(--post); }
    .m-put { background: var(--put); } .m-delete { background: var(--delete); }
    .path { font-size: 14px; font-weight: 600; }
    .sum { color: var(--muted); font-size: 13px; margin-left: auto; text-align: right; }
    .body { padding: 6px 16px 16px; }
    .body h3 { font-size: 12px; text-transform: uppercase; letter-spacing: .05em; color: var(--muted);
      margin: 18px 0 8px; }
    .op p.opdesc { color: var(--muted); margin: 10px 0 0; }
    table.params { width: 100%; border-collapse: collapse; font-size: 13px; }
    table.params td { border-top: 1px solid var(--border); padding: 7px 8px; vertical-align: top; }
    .pill { display: inline-block; font-size: 11px; padding: 1px 6px; border-radius: 5px;
      border: 1px solid var(--border); color: var(--muted); margin-left: 6px; }
    .req { color: var(--delete); font-size: 11px; margin-left: 6px; }
    .schema { background: var(--code-bg); border: 1px solid var(--border); border-radius: 8px;
      padding: 12px 14px; overflow-x: auto; }
    .schema ul { list-style: none; margin: 0; padding-left: 16px; }
    .schema > ul { padding-left: 0; }
    .field { padding: 2px 0; }
    .fname { font-weight: 600; }
    .ftype { color: var(--accent); font-size: 12px; }
    .fdesc { color: var(--muted); font-size: 12px; }
    .resp { display: flex; gap: 10px; align-items: baseline; padding: 5px 0; font-size: 13px; }
    .code { font-weight: 700; }
    .c2 { color: var(--get); } .c4 { color: var(--put); } .c5 { color: var(--delete); }
    a { color: var(--accent); }
    .loading, .error { color: var(--muted); padding: 40px 0; text-align: center; }
    .error { color: var(--delete); }
  </style>
</head>
<body>
  <header class="top"><div class="wrap" style="padding:0;"><h1 id="doc-title">SRouter</h1><span class="ver" id="doc-ver"></span></div></header>
  <main class="wrap"><div id="root"><p class="loading">Loading API reference…</p></div></main>
  <script>
  (function () {
    var root = document.getElementById('root');
    var spec = null;

    function el(tag, cls, text) {
      var n = document.createElement(tag);
      if (cls) n.className = cls;
      if (text != null) n.textContent = text;
      return n;
    }

    function resolveRef(ref) {
      if (typeof ref !== 'string' || ref.indexOf('#/') !== 0) return null;
      var parts = ref.slice(2).split('/');
      var cur = spec;
      for (var i = 0; i < parts.length; i++) {
        if (cur == null) return null;
        cur = cur[parts[i]];
      }
      return cur || null;
    }

    function typeLabel(schema) {
      if (!schema) return 'any';
      if (schema.$ref) {
        var name = schema.$ref.split('/').pop();
        return name;
      }
      if (schema.oneOf || schema.anyOf) {
        var list = schema.oneOf || schema.anyOf;
        return list.map(typeLabel).join(' | ');
      }
      if (schema.enum) return schema.enum.map(function (v) { return JSON.stringify(v); }).join(' | ');
      if (schema.type === 'array') return typeLabel(schema.items) + '[]';
      return schema.type || 'object';
    }

    // Render a schema as a nested field list. depth guards against cycles.
    function renderSchema(schema, depth) {
      depth = depth || 0;
      var container = el('div');
      if (!schema) { container.appendChild(el('div', 'fdesc', 'any')); return container; }
      if (schema.$ref) {
        var resolved = resolveRef(schema.$ref);
        if (depth > 6 || !resolved) { container.appendChild(el('div', 'ftype', typeLabel(schema))); return container; }
        return renderSchema(resolved, depth + 1);
      }
      if (schema.oneOf || schema.anyOf) {
        var opts = schema.oneOf || schema.anyOf;
        container.appendChild(el('div', 'fdesc', 'One of: ' + opts.map(typeLabel).join(', ')));
        return container;
      }
      if (schema.type === 'array') {
        container.appendChild(el('div', 'ftype', typeLabel(schema.items) + '[]'));
        if (schema.items && (schema.items.properties || schema.items.$ref)) {
          container.appendChild(renderSchema(schema.items, depth + 1));
        }
        return container;
      }
      if (schema.properties) {
        var required = schema.required || [];
        var ul = el('ul');
        Object.keys(schema.properties).forEach(function (key) {
          var prop = schema.properties[key];
          var li = el('li', 'field');
          var line = el('div');
          var nameEl = el('span', 'fname mono', key);
          line.appendChild(nameEl);
          line.appendChild(el('span', 'ftype', ' ' + typeLabel(prop)));
          if (required.indexOf(key) !== -1) line.appendChild(el('span', 'req', 'required'));
          li.appendChild(line);
          if (prop.description) li.appendChild(el('div', 'fdesc', prop.description));
          if (prop.default !== undefined) li.appendChild(el('div', 'fdesc', 'default: ' + JSON.stringify(prop.default)));
          // Expand one level of nested object/array-of-object properties.
          var nested = prop.$ref ? resolveRef(prop.$ref) : (prop.type === 'array' ? prop.items : prop);
          if (depth < 3 && nested && nested.properties && prop !== nested) {
            li.appendChild(renderSchema(prop, depth + 1));
          }
          ul.appendChild(li);
        });
        container.appendChild(ul);
        return container;
      }
      container.appendChild(el('div', 'ftype', typeLabel(schema)));
      if (schema.description) container.appendChild(el('div', 'fdesc', schema.description));
      return container;
    }

    function schemaFromContent(content) {
      if (!content) return null;
      var key = content['application/json'] ? 'application/json' : Object.keys(content)[0];
      return content[key] ? content[key].schema : null;
    }

    function methodClass(m) { return 'm-' + m; }
    function codeClass(code) { return 'c' + String(code).charAt(0); }

    function renderOperation(path, method, op) {
      var details = el('details', 'op');
      var summary = el('summary');
      var badge = el('span', 'method ' + methodClass(method), method);
      summary.appendChild(badge);
      summary.appendChild(el('span', 'path mono', path));
      if (op.summary) summary.appendChild(el('span', 'sum', op.summary));
      details.appendChild(summary);

      var body = el('div', 'body');
      if (op.description) body.appendChild(el('p', 'opdesc', op.description));

      if (op.parameters && op.parameters.length) {
        body.appendChild(el('h3', null, 'Query parameters'));
        var table = el('table', 'params');
        op.parameters.forEach(function (p) {
          var tr = el('tr');
          var td1 = el('td');
          td1.appendChild(el('span', 'fname mono', p.name));
          if (p.required) td1.appendChild(el('span', 'req', 'required'));
          var td2 = el('td');
          td2.appendChild(el('div', 'ftype', typeLabel(p.schema)));
          if (p.description) td2.appendChild(el('div', 'fdesc', p.description));
          tr.appendChild(td1); tr.appendChild(td2);
          table.appendChild(tr);
        });
        body.appendChild(table);
      }

      if (op.requestBody) {
        body.appendChild(el('h3', null, 'Request body' + (op.requestBody.required ? ' (required)' : '')));
        var reqSchema = schemaFromContent(op.requestBody.content);
        var box = el('div', 'schema');
        box.appendChild(renderSchema(reqSchema, 0));
        body.appendChild(box);
      }

      body.appendChild(el('h3', null, 'Responses'));
      Object.keys(op.responses || {}).forEach(function (code) {
        var r = op.responses[code];
        if (r.$ref) r = resolveRef(r.$ref) || r;
        var row = el('div', 'resp');
        row.appendChild(el('span', 'code mono ' + codeClass(code), code));
        row.appendChild(el('span', 'fdesc', r.description || ''));
        body.appendChild(row);
        var respSchema = schemaFromContent(r.content);
        if (respSchema && (respSchema.$ref || respSchema.properties)) {
          var rbox = el('div', 'schema');
          rbox.style.margin = '2px 0 8px';
          rbox.appendChild(renderSchema(respSchema, 0));
          body.appendChild(rbox);
        }
      });

      details.appendChild(body);
      return details;
    }

    function render() {
      document.title = (spec.info && spec.info.title ? spec.info.title : 'API') + ' - API reference';
      var titleEl = document.getElementById('doc-title');
      var verEl = document.getElementById('doc-ver');
      if (spec.info) {
        titleEl.textContent = spec.info.title || 'API';
        if (spec.info.version) verEl.textContent = 'v' + spec.info.version;
      }
      root.innerHTML = '';

      if (spec.info && spec.info.description) root.appendChild(el('p', 'desc', spec.info.description));

      // Auth summary from the declared security schemes.
      var schemes = spec.components && spec.components.securitySchemes;
      if (schemes) {
        var authBox = el('div', 'auth');
        authBox.appendChild(el('h2', null, 'Authentication'));
        Object.keys(schemes).forEach(function (name) {
          var s = schemes[name];
          authBox.appendChild(el('div', 'fdesc', s.description || (s.type + (s.scheme ? ' ' + s.scheme : ''))));
        });
        root.appendChild(authBox);
      }

      // Reliability & Fault Tolerance Note
      var relBox = el('div', 'info-card');
      relBox.appendChild(el('h2', null, 'Reliability & Fault Tolerance'));
      var relP = el('p', null,
        'Circuit breaker threshold defaults to 0 (OFF / disabled). In SRouter multi-provider routing, upstream rate limits (429) or temporary outages trigger immediate per-key cooldown and next-model fallback without tripping a global circuit breaker that would freeze the gateway. ' +
        'Streaming surfaces (OpenAI, Anthropic Messages, Responses) include proactive SSE keepalives to prevent intermediate reverse proxy or NAT idle timeouts without HTTP header regressions, coupled with coherent time budgets across fallback hops.'
      );
      relBox.appendChild(relP);
      root.appendChild(relBox);

      // Decision System One (POST /v1/decision) Section
      var decBox = el('div', 'info-card');
      decBox.appendChild(el('h2', null, 'Decision System One (POST /v1/decision)'));
      var decP1 = el('p', null,
        'The System One decision surface accepts prompt state alongside question schemas and returns low-latency classification scores (docs.typesafe.ai contract). Ideal for complexity gating, model tier selection, and agent routing decisions.'
      );
      decBox.appendChild(decP1);

      decBox.appendChild(el('h3', null, 'Request Contract'));
      var decPContract = el('p', null,
        'Requires model (string), state (context string), and questions with choice criteria (up to 255 criteria, optional scoring weights 2..10 in options):'
      );
      decBox.appendChild(decPContract);

      var decPre = el('pre', 'schema');
      decPre.textContent = JSON.stringify({
        model: 'auto',
        state: 'Explain async/await under Node 22',
        questions: {
          complexity: {
            type: 'choice',
            instructions: 'Classify coding prompt complexity',
            criteria: ['simple', 'moderate', 'complex'],
            options: { simple: 3, moderate: 6, complex: 9 }
          }
        }
      }, null, 2);
      decBox.appendChild(decPre);

      decBox.appendChild(el('h3', null, '3-Tier Resolution & Fail-Open Heuristic'));
      var decUl = el('ul');
      var li1 = el('li');
      var s1 = el('strong', null, '1. Remote Jev Host: ');
      li1.appendChild(s1);
      li1.appendChild(document.createTextNode('Evaluated against the configured Jev host (JEV_HOST_PRESETS) within a strict 2000ms timeout window. Response source: '));
      li1.appendChild(el('code', 'mono', '"jev"'));
      li1.appendChild(document.createTextNode('.'));
      decUl.appendChild(li1);

      var li2 = el('li');
      var s2 = el('strong', null, '2. Chat-Judge Fallback: ');
      li2.appendChild(s2);
      li2.appendChild(document.createTextNode('If Jev is unconfigured or unkeyed, SRouter issues a lightweight non-streaming classification prompt to the first active provider key defined in '));
      li2.appendChild(el('code', 'mono', 'decision_chat_judge_order'));
      li2.appendChild(document.createTextNode(' (default: ["groq", "google", "openrouter", "mistral"], toggleable via '));
      li2.appendChild(el('code', 'mono', 'decision_chat_judge'));
      li2.appendChild(document.createTextNode('). It picks a real small catalog model (e.g. 8b, 7b, nano, mini, flash) instead of router aliases. Budget: 2500ms. Response source: '));
      li2.appendChild(el('code', 'mono', '"chatJudge"'));
      li2.appendChild(document.createTextNode('.'));
      decUl.appendChild(li2);

      var li3 = el('li');
      var s3 = el('strong', null, '3. Fail-Open Local Heuristic: ');
      li3.appendChild(s3);
      li3.appendChild(document.createTextNode('If both remote Jev and chat-judge fail or timeout, the gateway gracefully fails open by calculating scores via local heuristic analysis (scoreChoice). The caller never encounters an unhandled 5xx error. Response source: '));
      li3.appendChild(el('code', 'mono', '"heuristic"'));
      li3.appendChild(document.createTextNode('.'));
      decUl.appendChild(li3);
      decBox.appendChild(decUl);

      root.appendChild(decBox);

      // Web Tools (Search Engines & Fetch Sources) Section
      var toolsBox = el('div', 'info-card');
      toolsBox.appendChild(el('h2', null, 'Web Tools: Unified Search & Fetch'));
      var toolsP1 = el('p', null,
        'Built-in web intelligence tools providing real-time web retrieval and clean page fetching. These tools do not serve LLM chat; their API keys live exclusively in the Web Tools section under the Keys tab (Keys -> Web Tools), keeping them separate from chat provider credentials.'
      );
      toolsBox.appendChild(toolsP1);

      toolsBox.appendChild(el('h3', null, 'Search Engines (POST /v1/search & GET /v1/search/engines)'));
      var searchTable = el('table', 'table-spec');
      var sth = el('tr');
      sth.appendChild(el('th', null, 'Engine'));
      sth.appendChild(el('th', null, 'Provider ID'));
      sth.appendChild(el('th', null, 'Default Free Quota'));
      sth.appendChild(el('th', null, 'Type'));
      searchTable.appendChild(sth);

      var searchEngines = [
        { name: 'Parallel Search', id: 'parallel', quota: 'Unlimited / Community Keyless', type: 'Keyless (100% Free)' },
        { name: 'Tavily', id: 'tavily', quota: '1,000 searches / month', type: 'API Key' },
        { name: 'Exa', id: 'exa', quota: '$10 search credits / month', type: 'API Key' },
        { name: 'Firecrawl', id: 'firecrawl', quota: '500 scrapes / month', type: 'API Key' },
        { name: 'Linkup', id: 'linkup', quota: '1,000 queries / month', type: 'API Key' }
      ];

      searchEngines.forEach(function (e) {
        var tr = el('tr');
        var td1 = el('td'); td1.appendChild(el('strong', null, e.name));
        var td2 = el('td', 'mono', e.id);
        var td3 = el('td', null, e.quota);
        var td4 = el('td'); td4.appendChild(el('span', 'tag-pill', e.type));
        tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4);
        searchTable.appendChild(tr);
      });
      toolsBox.appendChild(searchTable);

      toolsBox.appendChild(el('h3', null, 'Fetch Sources (POST /v1/fetch & GET /v1/fetch/sources)'));
      var fetchTable = el('table', 'table-spec');
      var fth = el('tr');
      fth.appendChild(el('th', null, 'Source'));
      fth.appendChild(el('th', null, 'Source ID'));
      fth.appendChild(el('th', null, 'Quota / Rate Limit'));
      fth.appendChild(el('th', null, 'Type'));
      fetchTable.appendChild(fth);

      var fetchSources = [
        { name: 'TinyFish Fetch', id: 'tinyfish-fetch', quota: 'Free 1,000 URLs/day · 150 URLs/min', type: 'API Key' },
        { name: 'Jina Reader', id: 'jina-reader', quota: 'Free Keyless (20 req/min)', type: 'Keyless (100% Free)' }
      ];

      fetchSources.forEach(function (s) {
        var tr = el('tr');
        var td1 = el('td'); td1.appendChild(el('strong', null, s.name));
        var td2 = el('td', 'mono', s.id);
        var td3 = el('td', null, s.quota);
        var td4 = el('td'); td4.appendChild(el('span', 'tag-pill', s.type));
        tr.appendChild(td1); tr.appendChild(td2); tr.appendChild(td3); tr.appendChild(td4);
        fetchTable.appendChild(tr);
      });
      toolsBox.appendChild(fetchTable);

      var toolsP2 = el('p', null,
        'Key Setup UX: Add your search and fetch credentials in the dashboard at Keys -> Web Tools. The main Provider List is strictly reserved for LLM chat models.'
      );
      toolsBox.appendChild(toolsP2);

      root.appendChild(toolsBox);

      // Group operations by their first tag, in the order tags are declared.
      var tagOrder = (spec.tags || []).map(function (t) { return t.name; });
      var groups = {};
      var order = [];
      Object.keys(spec.paths || {}).forEach(function (path) {
        var item = spec.paths[path];
        Object.keys(item).forEach(function (method) {
          var op = item[method];
          if (!op || typeof op !== 'object') return;
          var tag = (op.tags && op.tags[0]) || 'Endpoints';
          if (!groups[tag]) { groups[tag] = []; order.push(tag); }
          groups[tag].push({ path: path, method: method.toUpperCase(), op: op });
        });
      });

      // Ensure POST /v1/decision (System One) is represented under Decisions if omitted in spec
      if (!spec.paths['/v1/decision']) {
        if (!groups['Decisions']) {
          groups['Decisions'] = [];
          order.push('Decisions');
        }
        groups['Decisions'].unshift({
          path: '/v1/decision',
          method: 'POST',
          op: {
            tags: ['Decisions'],
            operationId: 'createSystemOneDecision',
            summary: 'System One decision endpoint (TypeSafe)',
            description: 'Evaluate prompt state against choice criteria with 3-tier fallback: remote Jev host -> chat-judge (via decision_chat_judge_order) -> local heuristic fail-open.',
            requestBody: {
              required: true,
              content: {
                'application/json': {
                  schema: {
                    type: 'object',
                    required: ['model', 'state', 'questions'],
                    properties: {
                      model: { type: 'string', description: 'Model identifier or auto.' },
                      state: { type: 'string', description: 'Prompt context to be evaluated.' },
                      questions: {
                        type: 'object',
                        properties: {
                          complexity: {
                            type: 'object',
                            required: ['type', 'instructions', 'criteria'],
                            properties: {
                              type: { type: 'string', enum: ['choice'] },
                              instructions: { type: 'string' },
                              criteria: { type: 'array', items: { type: 'string' }, description: 'Up to 255 choice options.' },
                              options: { type: 'object', description: 'Optional score weights per option (2..10).' }
                            }
                          }
                        }
                      }
                    }
                  }
                }
              }
            },
            responses: {
              '200': {
                description: 'Decision response containing score, choice answer, and resolution source.',
                content: {
                  'application/json': {
                    schema: {
                      type: 'object',
                      properties: {
                        id: { type: 'string', example: 'dec_1729500000_1234' },
                        object: { type: 'string', example: 'decision' },
                        created: { type: 'integer' },
                        model: { type: 'string', example: 'auto' },
                        answers: {
                          type: 'array',
                          items: {
                            type: 'object',
                            properties: {
                              question: { type: 'string', example: 'complexity' },
                              answer: { type: 'string', example: 'simple' },
                              score: { type: 'number', example: 4 }
                            }
                          }
                        },
                        source: { type: 'string', enum: ['jev', 'chatJudge', 'heuristic'], example: 'chatJudge' },
                        host: { type: 'string', example: 'https://decision.typesafe.ai' },
                        tookMs: { type: 'integer', example: 142 }
                      }
                    }
                  }
                }
              },
              '401': { description: 'Invalid or missing API key.' },
              '422': { description: 'Invalid request body.' }
            }
          }
        });
      }

      order.sort(function (a, b) {
        var ia = tagOrder.indexOf(a), ib = tagOrder.indexOf(b);
        return (ia === -1 ? 999 : ia) - (ib === -1 ? 999 : ib);
      });

      order.forEach(function (tag) {
        var g = el('div', 'group');
        g.appendChild(el('h2', null, tag));
        groups[tag].forEach(function (entry) {
          g.appendChild(renderOperation(entry.path, entry.method, entry.op));
        });
        root.appendChild(g);
      });
    }

    // Relative fetch: from /v1/docs this resolves to /v1/openapi.json, so the
    // page keeps working behind any path prefix or reverse proxy.
    fetch('openapi.json', { headers: { accept: 'application/json' } })
      .then(function (res) {
        if (!res.ok) throw new Error('HTTP ' + res.status);
        return res.json();
      })
      .then(function (data) { spec = data; render(); })
      .catch(function (err) {
        root.innerHTML = '';
        root.appendChild(el('p', 'error', 'Failed to load the API spec: ' + err.message));
      });
  })();
  </script>
</body>
</html>`;
