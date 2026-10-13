**English** · [简体中文](../../zh-cn/clients/02-client-profiles.md)

# Client profiles

[← Back to README](../README.md) · [Documentation index](../README.md)

- [What a profile is](#what-a-profile-is)
- [Two kinds of inference credential](#two-kinds-of-inference-credential)
- [Creating a profile](#creating-a-profile)
- [The server-enforced system prompt](#the-server-enforced-system-prompt)
- [Endpoint support](#endpoint-support)
- [Security boundary](#security-boundary)
- [What profiles do not do](#what-profiles-do-not-do)
- [Rotating, disabling, editing](#rotating-disabling-editing)
- [Example](#example)
- [See also](#see-also)

## What a profile is

A client profile pairs a **per-client API key** (`sk-cp-…`) with an optional
**system prompt that the server always applies**. Profiles are managed on
**Keys → Client profiles** in the dashboard.

They exist for two reasons:

1. **Separate credentials per downstream client.** Rotate or disable one
   client's key without touching any other client.
2. **Gateway-enforced instructions.** The profile's prompt is injected
   server-side on every request made with that key — the caller can neither
   remove nor override it, regardless of what it sends.

A profile key is not a "better" or "backup" version of the unified key. The two
are parallel credentials into the same router: same routing strategies, same
fallback loop, same provider pool.

## Two kinds of inference credential

| | Unified key (`sr-…`) | Profile key (`sk-cp-…`) |
| --- | --- | --- |
| `/v1` inference API | yes | yes (see [Endpoint support](#endpoint-support)) |
| Dashboard `/api` | no — session login required | no |
| System prompt injected | never | yes, when configured |
| Separate budget / limits / analytics | — | no — traffic stays aggregated |

## Creating a profile

1. Open **Keys → Client profiles** and click **Create profile**.
2. Give it a name and, optionally, a system prompt (up to 32 000 characters).
3. Copy the generated `sk-cp-…` key **immediately** — it is displayed exactly
   once ("Copy this key now — it won't be shown again").

The server stores two copies of the credential: a SHA-256 hash (the only thing
used for authentication) and an AES-256-GCM encrypted copy used solely to
render the masked key in the dashboard. The plaintext is never stored for
auth purposes.

## The server-enforced system prompt

When a request arrives with a profile key and the profile has a prompt, the
server prepends it as the **first** system message, ahead of any system message
the caller supplied:

```jsonc
// what the client sent:              // what the upstream model receives:
[
  { "role": "system",                 [
    "client's own instructions"  →      { "role": "system", "content": "PROFILE PROMPT (first)" },
  ],                                    { "role": "system", "content": "client's own instructions" },
  { "role": "user", "content":         { "role": "user", "content": "hello" }
    "hello" }                         ]
}
```

The caller's instructions are preserved **after** the enforced prompt: the
client can add context but cannot override or strip the profile's rules. An
empty or unset prompt is a neutral passthrough — the key authenticates and
nothing is injected. The unified key never injects anything.

Injection happens on the endpoints that carry messages:
`/v1/chat/completions`, `/v1/completions`, and `/v1/responses`.

## Endpoint support

Profile keys authenticate the OpenAI-compatible `/v1` surface mounted in
`server/src/app.ts`:

| Endpoint | Profile key |
| --- | --- |
| `POST /v1/chat/completions` | yes — prompt injected |
| `POST /v1/completions` | yes — prompt injected |
| `POST /v1/responses` | yes — prompt injected |
| `GET /v1/models` | yes |
| `POST /v1/embeddings` | yes |
| `POST /v1/images/generations`, `/v1/videos/generations` | yes |
| `POST /v1/audio/speech`, `/v1/audio/transcriptions` | yes |
| Anthropic `POST /v1/messages` | **no** — unified key only |
| Native Gemini API | **no** — unified key only |
| Ollama emulation | **no** — unified key only |
| MCP server | **no** — unified key only |
| Dashboard `/api/*` | **no** — session login only |

In other words: agents that speak the OpenAI dialect can use their own profile
key; clients pointed at the Anthropic, Gemini, Ollama, or MCP surfaces keep the
unified key.

## Security boundary

- Lookups are timing-safe: the unified key is compared with an HMAC-based
  constant-time equality, profile keys are resolved through an indexed SHA-256
  digest, so neither secret leaks length or per-byte timing.
- A **disabled** profile is rejected exactly like an unknown key (identical
  `401 Invalid API key`), so a revoked client cannot tell "disabled" from
  "deleted".
- Profile keys are **never** valid on the dashboard's `/api` routes — those are
  gated by a dashboard session, not by any inference credential (the unified
  key does not open them either).

## What profiles do not do

Keep expectations honest — profiles are a credential and prompt feature, not a
scheduling or billing one:

- **No separate budgets.** Monthly request/token caps live on *provider keys*
  and are shared by all downstream traffic — they "do not apply separately to
  downstream client profiles" ([budget docs](../api/01-rest-api.md#monthly-provider-key-budgets)).
- **No queueing, priority, or turn-taking.** All requests, unified or profile,
  run concurrently through the same router; profiles neither serialize nor
  isolate traffic.
- **No per-profile analytics.** Usage on the Dashboard is aggregated across
  every credential.
- **Not a crash guard between clients.** Coordination between two agents writing
  the same files is the agents' concern, not the gateway's.

## Rotating, disabling, editing

| Action | Effect |
| --- | --- |
| **Rotate key** | New `sk-cp-…` issued, old key stops working immediately (use after a leak). |
| **Enabled toggle off** | Key rejected with the standard 401; other profiles untouched. |
| **Edit prompt** | Applies to the next request; clearing it keeps the key valid but stops injection. |
| **Delete** | Profile and hash removed; the key can never authenticate again. |

## Example

```bash
curl http://localhost:20268/v1/chat/completions \
  -H "Authorization: Bearer sk-cp-..." \
  -H "Content-Type: application/json" \
  -d '{"model":"auto","messages":[{"role":"user","content":"Hello"}]}'
```

A common setup for two agents running side by side: create one profile per
agent, give each its own enforced prompt (for example, different output
languages or verbosity), and drop each key into that agent's config. Rotating or
disabling one agent's profile never affects the other.

## See also

- [Clients & coding agents](01-agent-clients.md) — setup recipes for the agents
  that consume these keys.
- [API reference](../api/01-rest-api.md) — the `/v1` surface the keys
  authenticate.
- [Revocable URL tokens](../api/01-rest-api.md#revocable-url-tokens) — the
  separate credential for headerless clients.
- [Monthly provider-key budgets](../api/01-rest-api.md#monthly-provider-key-budgets)
  — where real spending limits live.
