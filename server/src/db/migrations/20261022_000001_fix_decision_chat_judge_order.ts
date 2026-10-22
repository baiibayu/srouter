// Migration: repair the decision_chat_judge_order seed
// Created: 2026-10-22
//
// DOWN: reversible
//
// The original seed (20261021_000001) listed two slugs that cannot serve the
// chat-judge: "gemini" is not a platform slug (the id is "google") and
// "cerebras" is retired. Replace it with the documented order, but only when
// the stored value still equals the old seed — an operator override wins.

import type { Db } from '../types.js';
import { DECISION_CHAT_JUDGE_ORDER_KEY } from './20261021_000001_decision_chat_judge.js';

export const LEGACY_CHAT_JUDGE_ORDER = JSON.stringify([
  'groq',
  'gemini',
  'openrouter',
  'cerebras',
  'mistral',
]);

export const FIXED_CHAT_JUDGE_ORDER = JSON.stringify([
  'groq',
  'google',
  'openrouter',
  'mistral',
]);

export function up(db: Db): void {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(DECISION_CHAT_JUDGE_ORDER_KEY) as { value: string } | undefined;
  if (row && row.value === LEGACY_CHAT_JUDGE_ORDER) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(FIXED_CHAT_JUDGE_ORDER, DECISION_CHAT_JUDGE_ORDER_KEY);
  }
}

export function down(db: Db): void {
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(DECISION_CHAT_JUDGE_ORDER_KEY) as { value: string } | undefined;
  if (row && row.value === FIXED_CHAT_JUDGE_ORDER) {
    db.prepare('UPDATE settings SET value = ? WHERE key = ?').run(LEGACY_CHAT_JUDGE_ORDER, DECISION_CHAT_JUDGE_ORDER_KEY);
  }
}
