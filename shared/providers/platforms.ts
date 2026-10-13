import type { Platform } from '../types'

// The single source of truth for the provider LIST: platform id, display label,
// signup/key URL, and whether the platform works keyless. One file, consumed by
// the Keys page (client).
//
// What is NOT here — on purpose:
// - budget/model data lives in the DB (live, per install);
// - routing behavior and base URLs live in the server registry
//   (server/src/providers/) — code, not data.
export interface PlatformEntry {
  value: Platform
  label: string
  url: string
  keyless?: boolean
}

// `url` points to each provider's key-management / signup page so the Keys page
// can show a "Get API key" shortcut (#137). OpenCode Zen's key is free from
// opencode.ai/auth — no card needed; billing only applies to paid models (#128).
// `keyless: true` providers (Kilo, OVH, AI Horde) need no API key but accept
// one (#1331): the key field is optional, a blank submit stores a sentinel so
// routing treats the platform as configured and calls go out anonymously, and
// a real key is stored and sent like any other.
export const PLATFORMS: PlatformEntry[] = [
  { value: 'aclide', label: 'ACLIDE (shared monthly credits)', url: 'https://aclide.com/en/dashboard/api-keys' },
  { value: 'speka', label: 'Speka ($1 shared monthly credits)', url: 'https://speka.me/dashboard/keys' },
  { value: 'llmtr', label: 'LLMTR (zero-priced routes, daily/rolling quotas)', url: 'https://llmtr.com' },
  { value: 'gizmo', label: 'Gizmo (monthly free-model requests)', url: 'https://gizmoplatforms.com/developers' },
  { value: 'blockrun', label: 'BlockRun (zero-priced models)', url: 'https://user.blockrun.ai/dashboard/keys' },
  { value: 'moondream', label: 'Moondream ($5 shared monthly credits)', url: 'https://moondream.ai/c/cloud/api-keys' },
  { value: 'nous', label: 'Nous Portal (free models; Privacy Mode recommended)', url: 'https://portal.nousresearch.com' },
  { value: 'typhoon', label: 'OpenTyphoon (free research showcase)', url: 'https://playground.opentyphoon.ai/api-key' },
  { value: 'plugsky', label: 'Plugsky (free key)', url: 'https://plugsky.com' },
  { value: 'tokenharbor', label: 'Token Harbor (free routes need dashboard opt-in)', url: 'https://tokenharbor.ai/dashboard/api-keys' },
  { value: 'alibaba', label: 'Alibaba Model Studio (free quota, intl site)', url: 'https://modelstudio.console.alibabacloud.com' },
  { value: 'google', label: 'Google AI Studio', url: 'https://aistudio.google.com/apikey' },
  { value: 'groq', label: 'Groq', url: 'https://console.groq.com/keys' },
  { value: 'sail', label: 'Sail Research ($5 monthly with payment method)', url: 'https://app.sailresearch.com' },
  { value: 'electronhub', label: 'ElectronHub (shared weekly credits)', url: 'https://app.electronhub.ai' },
  { value: 'router9', label: 'Router9 (shared monthly credits)', url: 'https://www.router9.com' },
  { value: 'septor', label: 'Septor Labs (daily free-model quota)', url: 'https://septorlabs.com/dashboard' },
  { value: 'clod', label: 'CLōD (shared daily free requests)', url: 'https://newapp.clod.io' },
  { value: 'speechify', label: 'Speechify (monthly free TTS characters)', url: 'https://platform.speechify.ai' },
  { value: 'blaze', label: 'BlazeAPI (daily free tokens; Discord verification)', url: 'https://blazeapi.org/dashboard' },
  { value: 'lucidity', label: 'Lucidity Composite (daily free-model requests)', url: 'https://composite.lucidity.sh' },
  { value: 'airforce', label: 'Api.Airforce (daily free requests; 1 per minute)', url: 'https://api.airforce' },
  { value: 'dreamprompting', label: 'DreamPrompting (rolling 24h free tokens and requests)', url: 'https://dreamprompting.com' },
  { value: 'waterfall', label: 'Waterfall (community free models)', url: 'https://getwaterfall.org' },
  { value: 'logfare', label: 'Logfare (fair-use free models)', url: 'https://logfare.ai' },
  { value: 'bai', label: 'B.AI (promotional free model)', url: 'https://b.ai' },
  { value: 'radeon', label: 'AMD Radeon Cloud (free shared models)', url: 'https://developer.amd.com.cn/radeon/tokenfactory' },
  { value: 'nvidia', label: 'NVIDIA NIM', url: 'https://build.nvidia.com/settings/api-keys' },
  { value: 'mistral', label: 'Mistral', url: 'https://console.mistral.ai/api-keys/' },
  { value: 'openrouter', label: 'OpenRouter', url: 'https://openrouter.ai/keys' },
  { value: 'cohere', label: 'Cohere', url: 'https://dashboard.cohere.com/api-keys' },
  { value: 'cloudflare', label: 'Cloudflare Workers AI', url: 'https://dash.cloudflare.com' },
  { value: 'zhipu', label: 'Zhipu AI (Z.ai)', url: 'https://z.ai/manage-apikey/apikey-list' },
  { value: 'ollama', label: 'Ollama Cloud', url: 'https://ollama.com/settings/keys' },
  { value: 'kilo', label: 'Kilo Gateway (no key needed)', url: 'https://app.kilo.ai', keyless: true },
  { value: 'pollinations', label: 'Pollinations', url: 'https://enter.pollinations.ai' },
  { value: 'ovh', label: 'OVH AI Endpoints (no key needed)', url: 'https://endpoints.ai.cloud.ovh.net', keyless: true },
  { value: 'llm7', label: 'LLM7 (anon ok)', url: 'https://llm7.io' },
  { value: 'huggingface', label: 'HuggingFace Router (monthly free credit)', url: 'https://huggingface.co/settings/billing' },
  { value: 'opencode', label: 'OpenCode Zen (paid models only)', url: 'https://opencode.ai/auth' },
  { value: 'opencode-free', label: 'OpenCode Free (no key needed)', url: 'https://opencode.ai', keyless: true },
  { value: 'opencode-go', label: 'OpenCode Go (separate tier)', url: 'https://opencode.ai/auth' },
  { value: 'agnes', label: 'Agnes AI (free key)', url: 'https://platform.agnes-ai.com' },
  { value: 'reka', label: 'Reka (prepaid credits)', url: 'https://platform.reka.ai' },
  { value: 'siliconflow', label: 'SiliconFlow (image + TTS)', url: 'https://siliconflow.com' },
  { value: 'routeway', label: 'Routeway (free key)', url: 'https://routeway.ai' },
  { value: 'bazaarlink', label: 'BazaarLink (free key)', url: 'https://bazaarlink.ai' },
  { value: 'ainative', label: 'AINative Studio (free key)', url: 'https://ainative.studio' },
  { value: 'aion', label: 'Aion Labs (free key)', url: 'https://www.aionlabs.ai' },
  { value: 'requesty', label: 'Requesty (free key)', url: 'https://www.requesty.ai' },
  { value: 'navy', label: 'NavyAI (free key)', url: 'https://api.navy' },
  { value: 'nara', label: 'NaraRouter (free key)', url: 'https://router.bynara.id' },
  { value: 'sealion', label: 'SEA-LION (free key)', url: 'https://sea-lion.ai' },
  { value: 'orcarouter', label: 'OrcaRouter (free key)', url: 'https://www.orcarouter.ai' },
  { value: 'unorouter', label: 'UnoRouter (free key)', url: 'https://unorouter.com' },
  { value: 'xkiro', label: 'xKiro (free key)', url: 'https://xkiro.com' },
  // AnyAPI advertises 100K tokens/day free, but live testing on 2026-08-10
  // could not get a single free-tier request served (see
  // CATALOG-ANYAPI-SMOKE-2026-08-10 in the ops repo). No quota claim until
  // their free tier demonstrably works.
  { value: 'anyapi', label: 'AnyAPI (free key)', url: 'https://anyapi.ai' },
  { value: 'modelscope', label: 'ModelScope (free key, needs Aliyun cn binding)', url: 'https://modelscope.cn/my/myaccesstoken' },
  { value: 'aihorde', label: 'AI Horde (no key needed, slow)', url: 'https://aihorde.net/register', keyless: true },
  // Chinese domestic providers. All four gate API access behind real-name
  // verification on the cloud account, so the label says so up front rather
  // than letting a user mint a key that 401s on every call (the ModelScope
  // lesson, #581). LongCat is the one that takes an overseas email signup.
  { value: 'qianfan', label: 'Baidu Qianfan (free ERNIE, needs cn real-name)', url: 'https://console.bce.baidu.com/qianfan/overview' },
  { value: 'volcengine', label: 'Volcengine Ark (free daily, needs cn real-name)', url: 'https://console.volcengine.com/ark' },
  { value: 'longcat', label: 'LongCat (free daily, email signup ok)', url: 'https://longcat.chat/platform' },
  { value: 'xfyun', label: 'iFlytek Spark (free Lite, needs cn real-name)', url: 'https://console.xfyun.cn' },
]
