# Septor Labs

First-class OpenAI-compatible chat provider. Select it on the Keys
page or import `SEPTOR_API_KEY`. This integration does not
seed model rows: the signed Oracle catalog controls availability and the
existing Premium-immediate / Free-after-30-days release gate.

## Free access (checked 2026-09-10)

- [Septor Labs](https://septorlabs.com/pricing): zero-price free models share
  50 requests / 500K tokens daily. Its separate $1 signup grant expires after
  90 days and is **not** a recurring monthly grant. Tested matching routes:
  `hermes-3-llama-3.1-405b-free`, `minimax-m2.5-free`, `qwen3-coder-free`, and
  `qwen3-next-80b-a3b-instruct-free`.

## Integration details

Septor authenticates `/v1/models`. Eleven other free IDs returned MiniMax M2.5
instead of the requested model during testing. Its adapter rejects mismatched
or missing response model IDs with a retryable 502, including before yielding
stream content, instead of silently reporting a substituted model. Explicit
`auto` routing may report a different model; it is not seeded or published by
this change. Model-ID matching is provider response evidence, not independent
verification of underlying weights.
