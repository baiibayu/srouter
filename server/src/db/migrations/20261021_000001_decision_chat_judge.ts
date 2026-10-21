// Migration: seed decision_chat_judge settings
// Created: 2026-10-21
//
// DOWN: reversible
//
// Seeds two settings for the decision endpoint's chat-judge fallback
// (between Jev and the local heuristic):
//   decision_chat_judge        – '1' (on) | '0' (off)
//   decision_chat_judge_order  – JSON array of platform names in preference order
//
// The chat-judge is a non-stream chatCompletion call to the cheapest available
// provider when no Jev host is reachable (keyless excluded, non-keyless hosts
// that have no stored key cannot be used). It returns a score 2..10 in JSON.
// Seeded only when absent; an operator's own override always wins.

import type { Db } from '../types.js';

export const DECISION_CHAT_JUDGE_KEY = 'decision_chat_judge';
export const DECISION_CHAT_JUDGE_ORDER_KEY = 'decision_chat_judge_order';

export const DEFAULT_CHAT_JUDGE_ENABLED = '1';
export const DEFAULT_CHAT_JUDGE_ORDER = JSON.stringify([
  'groq',
  'gemini',
  'openrouter',
  'cerebras',
  'mistral',
]);

export function up(db: Db): void {
  const existing = db.prepare('SELECT value FROM settings WHERE key = ?').get(DECISION_CHAT_JUDGE_KEY) as { value: string } | undefined;
  if (!existing) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(DECISION_CHAT_JUDGE_KEY, DEFAULT_CHAT_JUDGE_ENABLED);
  }

  const existingOrder = db.prepare('SELECT value FROM settings WHERE key = ?').get(DECISION_CHAT_JUDGE_ORDER_KEY) as { value: string } | undefined;
  if (!existingOrder) {
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run(DECISION_CHAT_JUDGE_ORDER_KEY, DEFAULT_CHAT_JUDGE_ORDER);
  }
}

export function down(db: Db): void {
  // Only remove the seeded values if they were never changed from the default.
  const row = db.prepare('SELECT value FROM settings WHERE key = ?').get(DECISION_CHAT_JUDGE_KEY) as { value: string } | undefined;
  if (row && row.value === DEFAULT_CHAT_JUDGE_ENABLED) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(DECISION_CHAT_JUDGE_KEY);
  }
  const orderRow = db.prepare('SELECT value FROM settings WHERE key = ?').get(DECISION_CHAT_JUDGE_ORDER_KEY) as { value: string } | undefined;
  if (orderRow && orderRow.value === DEFAULT_CHAT_JUDGE_ORDER) {
    db.prepare('DELETE FROM settings WHERE key = ?').run(DECISION_CHAT_JUDGE_ORDER_KEY);
  }
}
