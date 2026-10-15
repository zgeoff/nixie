import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

// what a probe may set on a message beside its text, such as its priority or its uuid
type InputExtra = Partial<Omit<SDKUserMessage, 'type' | 'message' | 'parent_tool_use_id'>>;

export interface InputStream {
  // the streaming prompt of one query(), open until stop and the messages sent before it
  readonly messages: AsyncIterable<SDKUserMessage>;
  readonly send: (text: string, extra?: InputExtra) => void;
  readonly stop: () => void;
}

interface InputState {
  readonly queued: SDKUserMessage[];
  isStopped: boolean;

  // resolves the reader's wait for the next message
  wake: () => void;
}

// Starts a streaming input for a query(), so a probe sends messages into a session while it runs,
// as the host does with the owner's messages. Each message waits in order until the CLI reads it.
export function startInputStream(): InputStream {
  const state: InputState = { queued: [], isStopped: false, wake: () => {} };

  return {
    messages: readMessages(state),
    send: (text, extra = {}) => {
      state.queued.push({
        type: 'user',
        message: { role: 'user', content: text },
        parent_tool_use_id: null,
        ...extra,
      });

      state.wake();
    },
    stop: () => {
      state.isStopped = true;

      state.wake();
    },
  };
}

// a stop ends the stream once the messages sent before it are read
async function* readMessages(state: InputState): AsyncGenerator<SDKUserMessage> {
  for (;;) {
    const next = state.queued.shift();

    if (next !== undefined) {
      yield next;
    } else if (state.isStopped) {
      return;
    } else {
      const waiting = Promise.withResolvers<void>();

      state.wake = waiting.resolve;

      // oxlint-disable-next-line no-await-in-loop -- each message waits for the one before it
      await waiting.promise;
    }
  }
}
