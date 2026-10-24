import type { ChatMessage, ChatContent, ChatContentBlock } from '@baiibayu/srouter-shared/types.js';
import { contentToString } from '../lib/content.js';

export interface LoopDetectionResult {
  detected: boolean;
  kind?: 'tool_call' | 'text';
  repetitionCount: number;
  targetName?: string;
}

export interface LoopBreakOptions {
  messages: ChatMessage[];
  temperature?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  clientAgent?: string;
}

export interface LoopBreakResult {
  detected: boolean;
  kind?: 'tool_call' | 'text';
  repetitionCount: number;
  targetName?: string;
  messages: ChatMessage[];
  temperature?: number;
  frequency_penalty?: number;
  presence_penalty?: number;
  guardInjected: boolean;
}

function sortObjectKeys(obj: unknown): unknown {
  if (obj === null || typeof obj !== 'object') return obj;
  if (Array.isArray(obj)) return obj.map(sortObjectKeys);
  const sorted: Record<string, unknown> = {};
  for (const key of Object.keys(obj as Record<string, unknown>).sort()) {
    sorted[key] = sortObjectKeys((obj as Record<string, unknown>)[key]);
  }
  return sorted;
}

export function normalizeToolArgs(argsStr: string | undefined): string {
  if (!argsStr || !argsStr.trim()) return '';
  try {
    const parsed = JSON.parse(argsStr);
    if (parsed && typeof parsed === 'object') {
      return JSON.stringify(sortObjectKeys(parsed));
    }
    return String(parsed);
  } catch {
    return argsStr.trim();
  }
}

/**
 * Creates a deterministic signature for an assistant turn's tool calls.
 * E.g. "funcA:{"a":1}|funcB:{"b":2}"
 */
function assistantTurnToolSignature(msg: ChatMessage): string | null {
  if (!msg.tool_calls || msg.tool_calls.length === 0) return null;
  const parts = msg.tool_calls.map(tc => {
    const name = (tc.function?.name ?? '').trim();
    const args = normalizeToolArgs(tc.function?.arguments);
    return `${name}:${args}`;
  });
  parts.sort();
  return parts.join('|');
}

/**
 * Checks if consecutive assistant turns are repeating identical tool calls or text.
 * Threshold: 2 or more consecutive identical turns.
 */
export function detectLoop(messages: ChatMessage[]): LoopDetectionResult {
  if (!messages || messages.length < 2) {
    return { detected: false, repetitionCount: 0 };
  }

  const assistantTurns = messages.filter(m => m.role === 'assistant');
  if (assistantTurns.length < 2) {
    return { detected: false, repetitionCount: 0 };
  }

  // 1. Check Tool Call Loops (consecutive assistant turns with identical tool signatures)
  const toolTurns = assistantTurns.filter(m => assistantTurnToolSignature(m) !== null);
  if (toolTurns.length >= 2) {
    const lastSignature = assistantTurnToolSignature(toolTurns[toolTurns.length - 1]);
    if (lastSignature) {
      let consecutive = 1;
      for (let i = toolTurns.length - 2; i >= 0; i--) {
        const sig = assistantTurnToolSignature(toolTurns[i]);
        if (sig === lastSignature) {
          consecutive++;
        } else {
          break;
        }
      }

      if (consecutive >= 2) {
        const lastMsg = toolTurns[toolTurns.length - 1];
        const toolName = lastMsg.tool_calls?.[0]?.function?.name ?? 'tool';
        return {
          detected: true,
          kind: 'tool_call',
          repetitionCount: consecutive,
          targetName: toolName,
        };
      }
    }
  }

  // 2. Check Text Repetition Loops (consecutive assistant turns with identical text content)
  const lastTurn = assistantTurns[assistantTurns.length - 1];
  const lastText = contentToString(lastTurn.content ?? '').trim();

  // Only consider text loops if text is substantial (> 25 characters) and has no tool calls
  if (lastText.length > 25 && (!lastTurn.tool_calls || lastTurn.tool_calls.length === 0)) {
    let consecutive = 1;
    for (let i = assistantTurns.length - 2; i >= 0; i--) {
      const turn = assistantTurns[i];
      if (turn.tool_calls && turn.tool_calls.length > 0) break;
      const text = contentToString(turn.content ?? '').trim();
      if (text === lastText) {
        consecutive++;
      } else {
        break;
      }
    }

    if (consecutive >= 2) {
      const snippet = lastText.slice(0, 30).replace(/\s+/g, ' ');
      return {
        detected: true,
        kind: 'text',
        repetitionCount: consecutive,
        targetName: snippet,
      };
    }
  }

  return { detected: false, repetitionCount: 0 };
}

function appendGuardText(content: ChatContent, guardText: string): ChatContent {
  if (typeof content === 'string') {
    return content + guardText;
  }
  if (Array.isArray(content)) {
    return [...content, { type: 'text', text: guardText } as ChatContentBlock];
  }
  if (content == null) {
    return guardText.trim();
  }
  return content;
}

export function isLoopBreakerEnabled(): boolean {
  const env = process.env.SROUTER_LOOP_BREAKER?.trim().toLowerCase();
  return env !== 'off' && env !== 'false' && env !== '0';
}

/**
 * Detects loops and automatically breaks greedy determinism by:
 * 1. Bumping temperature (jitter to >= 0.45)
 * 2. Adding presence / frequency penalties
 * 3. Injecting an ephemeral system guard directive onto the latest message outbound
 */
export function breakLoop(options: LoopBreakOptions): LoopBreakResult {
  const { messages, temperature, frequency_penalty, presence_penalty, clientAgent } = options;

  if (!isLoopBreakerEnabled()) {
    return {
      detected: false,
      repetitionCount: 0,
      messages,
      temperature,
      frequency_penalty,
      presence_penalty,
      guardInjected: false,
    };
  }

  const detection = detectLoop(messages);
  if (!detection.detected) {
    return {
      detected: false,
      repetitionCount: 0,
      messages,
      temperature,
      frequency_penalty,
      presence_penalty,
      guardInjected: false,
    };
  }

  // Jitter temperature to break greedy determinism
  let adjustedTemperature = temperature;
  if (adjustedTemperature == null || adjustedTemperature < 0.45) {
    adjustedTemperature = 0.45;
  }

  // Adjust penalties to discourage token repetition
  const adjustedFrequencyPenalty = frequency_penalty != null && frequency_penalty > 0
    ? frequency_penalty
    : 0.3;
  const adjustedPresencePenalty = presence_penalty != null && presence_penalty > 0
    ? presence_penalty
    : 0.3;

  // Build guard prompt
  let guardDirective = '';
  if (detection.kind === 'tool_call') {
    guardDirective = `\n\n[System Guard: Loop Detected]\nYou have executed the tool "${detection.targetName}" with identical parameters ${detection.repetitionCount} times consecutively. Repeating this tool call with the same parameters will not change the outcome.\nPlease analyze the output you already received and take the NEXT action (e.g. choose a different tool, modify your parameters, or report your findings).`;
  } else {
    guardDirective = `\n\n[System Guard: Loop Detected]\nYou repeated the exact same response ${detection.repetitionCount} times consecutively. Do not repeat the same text. Please adjust your approach, explain your findings, or summarize progress.`;
  }

  // Clone messages and inject guard into the last message outbound
  const outbound = messages.map(m => ({ ...m }));
  let guardInjected = false;

  if (outbound.length > 0) {
    const lastIndex = outbound.length - 1;
    const lastMsg = { ...outbound[lastIndex] };
    lastMsg.content = appendGuardText(lastMsg.content, guardDirective);
    outbound[lastIndex] = lastMsg;
    guardInjected = true;
  }

  console.warn(
    `[LoopBreaker] Breaking ${detection.kind} loop for ${clientAgent ?? 'agent'} (target: "${detection.targetName}", repeats: ${detection.repetitionCount}, temp: ${adjustedTemperature})`
  );

  return {
    detected: true,
    kind: detection.kind,
    repetitionCount: detection.repetitionCount,
    targetName: detection.targetName,
    messages: outbound,
    temperature: adjustedTemperature,
    frequency_penalty: adjustedFrequencyPenalty,
    presence_penalty: adjustedPresencePenalty,
    guardInjected,
  };
}
