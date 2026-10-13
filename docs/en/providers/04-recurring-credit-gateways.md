**English** · [简体中文](../../zh-cn/providers/04-recurring-credit-gateways.md)

# ElectronHub

ElectronHub uses bearer-authenticated Chat Completions at its `/v1` base
URL. Model availability is managed in the signed Oracle catalog, not seeded
in application migrations. The existing Premium-immediate / Free-after-30-days
catalog policy is unchanged.

| Provider ID | Base URL | Key-validation endpoint | Free-plan funding |
| --- | --- | --- | --- |
| `electronhub` | `https://api.electronhub.ai/v1` | `GET /v1/user/me` | $0.25 shared weekly credits, not monthly; non-premium credit-backed routes only |

Checked 2026-09-06: 23 ElectronHub model IDs returned valid text. The
account API showed a Free subscription and spending from weekly credits with
no purchased-credit balance. ElectronHub is not unlimited and does not grant
credits per model.

ElectronHub's model list is public, so validation uses its authenticated
account endpoint. Its dedicated compatibility subclass rejects the observed
proxy-error banner embedded in HTTP-200 responses, including split SSE
chunks. The other seven tested ElectronHub candidates were excluded from
catalog additions.

Key imports accept `ELECTRONHUB_API_KEY` and `ELECTRON_HUB_API_KEY`.

No provider billing settings are changed by the adapter. It observes the
shared quota pool and provider response headers; it does not invent
per-model credit or token allowances. Set spend controls with the provider
before enabling paid top-ups or bring-your-own-provider-key routing.

Sources: [ElectronHub credits](https://docs.electronhub.ai/billing/credits),
[model access](https://docs.electronhub.ai/billing/model-access),
[account API](https://docs.electronhub.ai/api-reference/usage).
