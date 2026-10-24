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
  escalateModel: boolean;
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

function wrapWithGuard(content: ChatContent, headerGuard: string, footerGuard: string): ChatContent {
  if (typeof content === 'string') {
    return `${headerGuard}\n\n${content}\n\n${footerGuard}`;
  }
  if (Array.isArray(content)) {
    return [
      { type: 'text', text: `${headerGuard}\n\n` } as ChatContentBlock,
      ...content,
      { type: 'text', text: `\n\n${footerGuard}` } as ChatContentBlock,
    ];
  }
  if (content == null) {
    return `${headerGuard}\n\n${footerGuard}`.trim();
  }
  return content;
}

export function isLoopBreakerEnabled(): boolean {
  const env = process.env.SROUTER_LOOP_BREAKER?.trim().toLowerCase();
  return env !== 'off' && env !== 'false' && env !== '0';
}

/**
 * Detects loops and automatically breaks greedy determinism by:
 * 1. Escalating temperature (0.50 -> 0.70 -> 0.85)
 * 2. Escalating presence / frequency penalties
 * 3. Prominently injecting system guard directives at BOTH TOP (Header) and BOTTOM (Footer) of the latest outbound message
 * 4. Signaling model escalation (escalateModel: true) when repetition count >= 3
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
      escalateModel: false,
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
      escalateModel: false,
    };
  }

  // Escalating temperature & penalties based on repetition count
  let minTemp = 0.50;
  let penalty = 0.3;
  if (detection.repetitionCount === 3) {
    minTemp = 0.70;
    penalty = 0.5;
  } else if (detection.repetitionCount >= 4) {
    minTemp = 0.85;
    penalty = 0.7;
  }

  let adjustedTemperature = temperature;
  if (adjustedTemperature == null || adjustedTemperature < minTemp) {
    adjustedTemperature = minTemp;
  }

  const adjustedFrequencyPenalty = frequency_penalty != null && frequency_penalty >= penalty
    ? frequency_penalty
    : penalty;
  const adjustedPresencePenalty = presence_penalty != null && presence_penalty >= penalty
    ? presence_penalty
    : penalty;

  // Prominent Header & Footer guards so both prefix and suffix attention mechanisms notice immediately
  let headerGuard = '';
  let footerGuard = '';
  if (detection.kind === 'tool_call') {
    headerGuard = `[CRITICAL SYSTEM GUARD: REPETITIVE TOOL LOOP DETECTED]\nYou have called "${detection.targetName}" ${detection.repetitionCount} times in a row with the exact same parameters.\nDO NOT execute "${detection.targetName}" with these arguments again.\nInspect the output below, proceed with the NEXT logical action, or reply to the user.\n================================================================================`;
    footerGuard = `================================================================================\n[CRITICAL REMINDER: Do NOT call "${detection.targetName}" with identical arguments again. Proceed with next step.]`;
  } else {
    headerGuard = `[CRITICAL SYSTEM GUARD: TEXT REPETITION DETECTED]\nYou repeated the exact same response ${detection.repetitionCount} times consecutively. Do not output this text again. Adjust your approach or summarize progress.\n================================================================================`;
    footerGuard = `================================================================================\n[CRITICAL REMINDER: Provide a fresh and distinct answer.]`;
  }

  // Clone messages and wrap the last message outbound
  const outbound = messages.map(m => ({ ...m }));
  let guardInjected = false;

  if (outbound.length > 0) {
    const lastIndex = outbound.length - 1;
    const lastMsg = { ...outbound[lastIndex] };
    lastMsg.content = wrapWithGuard(lastMsg.content, headerGuard, footerGuard);
    outbound[lastIndex] = lastMsg;
    guardInjected = true;
  }

  const escalateModel = detection.repetitionCount >= 3;

  console.warn(
    `[LoopBreaker] Breaking ${detection.kind} loop for ${clientAgent ?? 'agent'} (target: "${detection.targetName}", repeats: ${detection.repetitionCount}, temp: ${adjustedTemperature}, escalate: ${escalateModel})`
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
    escalateModel,
  };
}
