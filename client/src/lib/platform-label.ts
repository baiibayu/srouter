/**
 * Display names for provider platform ids.
 *
 * The id is what the API speaks (`xkiro`, `nvidia`, …) but a provider's real
 * name is not derivable from it by capitalization alone. Shared by everything
 * that has to name a provider in the UI — the keys pages and the notification
 * bell — so a provider is never shown two different ways.
 */
const PLATFORM_LABELS: Record<string, string> = {
  aihorde: 'AI Horde',
  airforce: 'Airforce',
  bai: 'Bai',
  bazaarlink: 'Bazaarlink',
  cerebras: 'Cerebras',
  cohere: 'Cohere',
  custom: 'Custom',
  google: 'Google',
  groq: 'Groq',
  huggingface: 'HuggingFace',
  kilo: 'Kilo',
  mistral: 'Mistral',
  nara: 'Nara',
  nvidia: 'NVIDIA NIM',
  ollama: 'Ollama',
  openrouter: 'OpenRouter',
  ovh: 'OVH',
  radeon: 'Radeon',
  unorouter: 'UnoRouter',
  xkiro: 'xKIRO',
}

/** A provider's display name, falling back to a title-cased id for unknown ones. */
export function platformLabel(platform: string): string {
  return PLATFORM_LABELS[platform] ?? platform.charAt(0).toUpperCase() + platform.slice(1)
}