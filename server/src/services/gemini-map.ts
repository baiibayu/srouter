import { z } from 'zod';
import { getDb, getSetting, setSetting } from '../db/index.js';

const SETTING_KEY = 'gemini_model_map';

export const GEMINI_FAMILIES = ['default', 'pro', 'flash', 'flashLite'] as const;
export type GeminiFamily = (typeof GEMINI_FAMILIES)[number];
export type GeminiModelMap = Record<GeminiFamily, string>;

const DEFAULT_MAP: GeminiModelMap = {
  default: 'auto',
  pro: 'auto',
  flash: 'auto',
  flashLite: 'auto',
};

const schema = z.object({
  default: z.string().min(1).optional(),
  pro: z.string().min(1).optional(),
  flash: z.string().min(1).optional(),
  flashLite: z.string().min(1).optional(),
}).strict();

export function getGeminiModelMap(): GeminiModelMap {
  const raw = getSetting(SETTING_KEY);
  if (!raw) return { ...DEFAULT_MAP };
  try {
    const parsed = JSON.parse(raw) as Partial<GeminiModelMap>;
    return {
      default: parsed.default || 'auto',
      pro: parsed.pro || 'auto',
      flash: parsed.flash || 'auto',
      flashLite: parsed.flashLite || 'auto',
    };
  } catch {
    return { ...DEFAULT_MAP };
  }
}

export function setGeminiModelMap(input: unknown): GeminiModelMap {
  const patch = schema.parse(input);
  const current = getGeminiModelMap();
  const next = {
    default: patch.default ?? current.default,
    pro: patch.pro ?? current.pro,
    flash: patch.flash ?? current.flash,
    flashLite: patch.flashLite ?? current.flashLite,
  };
  setSetting(SETTING_KEY, JSON.stringify(next));
  return next;
}

export function classifyGeminiFamily(model?: string): GeminiFamily | null {
  const normalized = (model ?? '').trim().toLowerCase().replace(/^models\//, '');
  if (!normalized || normalized === 'auto') return 'default';
  if (!normalized.startsWith('gemini')) return null;
  if (/flash[-_]?lite/.test(normalized)) return 'flashLite';
  if (normalized.includes('flash')) return 'flash';
  if (normalized.includes('pro')) return 'pro';
  return 'default';
}

/**
 * Resolve a Gemini-family request to the operator's selected catalog id.
 * Returning `auto` leaves routing unpinned; concrete non-Gemini catalog ids
 * still pass through unchanged for native clients that select the gateway's
 * advertised ids.
 */
export function resolveGeminiModel(model?: string): string {
  const raw = (model ?? '').trim().replace(/^models\//, '');
  const family = classifyGeminiFamily(raw);
  if (family) {
    const target = getGeminiModelMap()[family];
    if (!target || target === 'auto') return 'auto';
    const exists = getDb().prepare(
      'SELECT 1 FROM models WHERE model_id = ? AND enabled = 1',
    ).get(target);
    return exists ? target : 'auto';
  }
  return raw || 'auto';
}

export const GEMINI_FAMILY_ALIASES: { id: string; family: GeminiFamily; label: string }[] = [
  { id: 'gemini-3.5-flash-lite', family: 'flashLite', label: 'Gemini 3.5 Flash-Lite' },
  { id: 'gemini-3.1-pro-preview', family: 'pro', label: 'Gemini 3.1 Pro Preview' },
  { id: 'gemini-3.1-pro', family: 'pro', label: 'Gemini 3.1 Pro' },
  { id: 'gemini-3.5-flash', family: 'flash', label: 'Gemini 3.5 Flash' },
  { id: 'gemini-3.8-flash', family: 'flash', label: 'Gemini 3.8 Flash' },
  { id: 'gemini-2.5-pro', family: 'pro', label: 'Gemini 2.5 Pro' },
  { id: 'gemini-2.5-flash', family: 'flash', label: 'Gemini 2.5 Flash' },
  { id: 'gemini-2.5-flash-lite', family: 'flashLite', label: 'Gemini 2.5 Flash-Lite' },
  { id: 'gemini-2.0-flash', family: 'flash', label: 'Gemini 2.0 Flash' },
  { id: 'gemini-2.0-flash-lite', family: 'flashLite', label: 'Gemini 2.0 Flash-Lite' },
  { id: 'gemini-1.5-pro', family: 'pro', label: 'Gemini 1.5 Pro' },
  { id: 'gemini-1.5-flash', family: 'flash', label: 'Gemini 1.5 Flash' },
];

export function geminiFamilyDiscoveryEntries(): { id: string; displayName: string; family: GeminiFamily }[] {
  const map = getGeminiModelMap();
  return GEMINI_FAMILY_ALIASES.map(({ id, family, label }) => {
    const target = map[family];
    return {
      id,
      displayName: !target || target === 'auto'
        ? `${label} (Auto)`
        : `${label} (→ ${target})`,
      family,
    };
  });
}
