import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';

type InputExtra = Partial<Omit<SDKUserMessage, 'type' | 'message' | 'parent_tool_use_id'>>;

export interface InputStream {
  readonly messages: AsyncIterable<SDKUserMessage>;
  readonly send: (text: string, extra?: InputExtra) => void;
  readonly stop: () => void;
}

interface InputState {
  readonly queued: SDKUserMessage[];
  isStopped: boolean;

  wake: () => void;
}

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

      await waiting.promise;
    }
  }
}
