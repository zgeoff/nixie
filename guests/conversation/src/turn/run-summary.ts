import { mkdir } from 'node:fs/promises';
import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, SessionPoint } from '@heynixie/wire';
import type { RequestRewriter } from '../rewrite/start-request-rewriter';
import { startRequestRewriter } from '../rewrite/start-request-rewriter';
import { waitForRefusal } from '../rewrite/wait-for-refusal';
import type { TurnDependencies } from '../types';
import type { SummarizeFrame } from './build-query-options';
import { buildQueryOptions } from './build-query-options';

export type SummaryDependencies = Pick<TurnDependencies, 'env' | 'emit' | 'runQuery' | 'rewriter'>;

export async function runSummary(frame: SummarizeFrame, deps: SummaryDependencies): Promise<void> {
  let rewriter: RequestRewriter | null;

  try {
    rewriter = startRequestRewriter(frame, deps.rewriter);
  } catch (error) {
    await deps.emit({
      type: 'failed',
      reason: 'error',
      detail: `the request rewriter could not start: ${String(error)}`,
    });

    return;
  }

  try {
    await runSummaryThrough(frame, deps, rewriter);
  } finally {
    await rewriter?.stop();
  }
}

async function runSummaryThrough(
  frame: SummarizeFrame,
  deps: SummaryDependencies,
  rewriter: RequestRewriter | null,
): Promise<void> {
  const options = buildQueryOptions(frame, {
    env: deps.env,
    toolServer: null,
    ...(rewriter === null ? {} : { rewriterURL: rewriter.url }),
  });

  await mkdir(options.cwd ?? '', { recursive: true });

  const session = (deps.runQuery ?? query)({ prompt: frame.instruction, options });

  try {
    const summary = await readSummaryFrame(session, rewriter);

    await deps.emit(summary);
  } finally {
    session.close();

    await session.return();
  }
}

interface SummaryState {
  readonly texts: string[];

  boundary: SessionPoint | null;
}

async function readSummaryFrame(
  session: AsyncIterable<SDKMessage>,
  rewriter: RequestRewriter | null,
): Promise<GuestFrame> {
  const state: SummaryState = { texts: [], boundary: null };
  const messages = session[Symbol.asyncIterator]();
  const refused = waitForRefusal(rewriter);

  for (;;) {
    const next = await Promise.race([messages.next(), refused]);

    if ('refusal' in next) {
      return { type: 'failed', reason: 'error', detail: next.refusal };
    }

    if (next.done === true) {
      break;
    }

    const frame = collectSummaryFrame(next.value, state);

    if (frame !== null) {
      return frame;
    }
  }

  return { type: 'failed', reason: 'error', detail: 'the summary call gave no result' };
}

function collectSummaryFrame(message: SDKMessage, state: SummaryState): GuestFrame | null {
  if (message.type === 'assistant' && message.parent_tool_use_id === null) {
    state.boundary = {
      harness: 'agent-sdk',
      sessionID: message.session_id,
      messageID: message.uuid,
    };

    if (message.error === undefined) {
      state.texts.push(
        ...message.message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])),
      );
    }

    return null;
  }

  return message.type === 'result' ? buildSummaryFrame(message, state) : null;
}

const missingSessionPrefix = 'No conversation found with session ID';

function buildSummaryFrame(message: SDKResultMessage, state: SummaryState): GuestFrame {
  if (message.subtype !== 'success') {
    const isMissing = message.errors.some((error) => error.startsWith(missingSessionPrefix));

    return {
      type: 'failed',
      reason: isMissing ? 'session_missing' : 'error',
      detail: message.errors.join('; '),
    };
  }

  const text = state.texts.join('\n\n').trim();

  if (message.is_error || state.boundary === null || text === '') {
    return {
      type: 'failed',
      reason: 'error',
      detail: `the summary call ended with no summary: ${message.terminal_reason ?? message.result}`,
    };
  }

  return {
    type: 'summarized',
    boundary: state.boundary,
    text,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens,
      cacheWriteTokens: message.usage.cache_creation_input_tokens,
    },
  };
}
