// Records one Agent SDK turn: the time of each milestone after the prompt went out, and the
// result's own timing and usage fields.
import type { SDKMessage } from '@anthropic-ai/claude-agent-sdk';

type ResultMessage = Extract<SDKMessage, { type: 'result' }>;

export interface Turn {
  cacheRead?: number;
  durationApiMs?: number;
  durationMs?: number;
  firstEvent?: number;
  firstText?: number;
  firstThinking?: number;
  init?: number;
  inputTokens?: number;
  isError?: boolean;
  outputTokens?: number;
  rateLimit?: number;
  rateLimitStatus?: string;
  requesting?: number;
  result?: number;
  sessionId?: string;
  subtype?: string;
  text: string;
  timeToRequestMs?: number;
  toolsSeen?: string[];
  ttftMs?: number;
  ttftStreamMs?: number;
}

function setStreamEvent(turn: Turn, message: SDKMessage, at: number): void {
  if (message.type !== 'stream_event' || message.parent_tool_use_id !== null) {
    return;
  }
  turn.firstEvent ??= at;
  const delta = message.event.type === 'content_block_delta' ? message.event.delta : undefined;
  if (delta?.type === 'text_delta' && delta.text.length > 0) {
    turn.firstText ??= at;
    turn.text += delta.text;
  } else if (delta?.type === 'thinking_delta') {
    turn.firstThinking ??= at;
  }
}

function setResult(turn: Turn, message: ResultMessage, at: number): void {
  Object.assign(turn, {
    cacheRead: message.usage.cache_read_input_tokens,
    durationApiMs: message.duration_api_ms,
    durationMs: message.duration_ms,
    inputTokens: message.usage.input_tokens,
    isError: message.is_error,
    outputTokens: message.usage.output_tokens,
    result: at,
    sessionId: message.session_id,
    subtype: message.subtype,
  });
  if (message.subtype === 'success') {
    turn.ttftMs = message.ttft_ms;
    turn.ttftStreamMs = message.ttft_stream_ms;
    turn.timeToRequestMs = message.time_to_request_ms;
  }
}

function setSystem(turn: Turn, message: SDKMessage, at: number): void {
  if (message.type === 'system' && message.subtype === 'init') {
    turn.init ??= at;
    turn.toolsSeen = message.tools;
  } else if (message.type === 'system' && message.subtype === 'status') {
    turn.requesting ??= message.status === 'requesting' ? at : undefined;
  } else if (message.type === 'rate_limit_event') {
    turn.rateLimit ??= at;
    turn.rateLimitStatus = message.rate_limit_info.status;
  }
}

// Records one message at `at` ms after the turn started, and reports whether it ended the turn.
function applyMessage(turn: Turn, message: SDKMessage, at: number): boolean {
  if (message.type === 'result') {
    setResult(turn, message, at);
    return true;
  }
  setSystem(turn, message, at);
  setStreamEvent(turn, message, at);
  return false;
}

// Reads one turn's messages, up to and including its result. getStart returns the time the prompt
// went out; a streaming session sets it only when the SDK pulls the prompt.
export async function readTurn(
  messages: AsyncIterator<SDKMessage>,
  getStart: () => number,
  turn: Turn,
): Promise<Turn> {
  const next = await messages.next();
  if (next.done) {
    throw new Error('the query ended before a result');
  }
  return applyMessage(turn, next.value, performance.now() - getStart())
    ? turn
    : readTurn(messages, getStart, turn);
}
