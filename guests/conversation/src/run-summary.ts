// oxlint-disable typescript/prefer-readonly-parameter-types -- the SDK's message types and the summary's own state have no readonly form
import { mkdir } from 'node:fs/promises';
import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, SessionPoint } from '@heynixie/wire';
import type { SummarizeFrame } from './build-query-options';
import { buildQueryOptions } from './build-query-options';
import type { TurnDependencies } from './types';

export type SummaryDependencies = Pick<TurnDependencies, 'env' | 'emit' | 'runQuery'>;

// Runs one summary call with no tools on a fork at the frame's resume point, and reports the summary
// with its own chain entry, or a failure. It removes no session, so a rerun after a crash before
// the host's commit forks from the same session.
export async function runSummary(frame: SummarizeFrame, deps: SummaryDependencies): Promise<void> {
  const options = buildQueryOptions(frame, { env: deps.env, toolServer: null });

  await mkdir(options.cwd ?? '', { recursive: true });

  const session = (deps.runQuery ?? query)({ prompt: frame.instruction, options });

  try {
    const summary = await readSummaryFrame(session);

    await deps.emit(summary);
  } finally {
    session.close();

    await session.return();
  }
}

async function readSummaryFrame(session: AsyncIterable<SDKMessage>): Promise<GuestFrame> {
  const state: SummaryState = { texts: [], boundary: null };

  for await (const message of session) {
    const frame = collectSummaryFrame(message, state);

    if (frame !== null) {
      return frame;
    }
  }

  return { type: 'failed', reason: 'error', detail: 'the summary call gave no result' };
}

interface SummaryState {
  readonly texts: string[];

  // the summary's last chain entry, which a request to cut it resumes at
  boundary: SessionPoint | null;
}

// the summary's text and chain entry from each assistant message, and its frame from the result
function collectSummaryFrame(message: SDKMessage, state: SummaryState): GuestFrame | null {
  if (message.type === 'assistant' && message.parent_tool_use_id === null) {
    state.boundary = { sessionID: message.session_id, messageID: message.uuid };

    if (message.error === undefined) {
      state.texts.push(
        ...message.message.content.flatMap((block) => (block.type === 'text' ? [block.text] : [])),
      );
    }

    return null;
  }

  return message.type === 'result' ? buildSummaryFrame(message, state) : null;
}

// the CLI's error when the session to resume is not on this guest's disk
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
