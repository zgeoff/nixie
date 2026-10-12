// oxlint-disable typescript/prefer-readonly-parameter-types -- an async iterable and the turn's own state have no readonly form
import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { InboxMessage } from '@heynixie/wire';
import type { TurnFrame } from './build-query-options';

export interface TurnInputState {
  // the uuids of messages the SDK took and has not yet read
  readonly pending: Set<string>;

  // resolves with the error the host's message stream threw, which fails the turn at once
  readonly inputFailed: PromiseWithResolvers<Error>;
  readonly ended: PromiseWithResolvers<void>;
}

// Reads the prompt stream of one turn: the turn's inbox, then each host message until the turn
// ends. The SDK aborts on an error from its prompt stream, yet the CLI still answers the message it
// holds, so a host stream error ends the stream and fails the turn through its state instead.
export async function* readTurnInput(
  turn: TurnFrame,
  messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>,
  state: TurnInputState,
): AsyncGenerator<SDKUserMessage> {
  for (const message of turn.input) {
    state.pending.add(message.uuid);
    yield buildUserMessage(message);
  }
  const iterator = readMessages(messages);

  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each message waits for the host to send it
    const next = await readNextMessage(iterator, state);

    if (next === null || next.done === true) {
      return;
    }
    state.pending.add(next.value.uuid);
    yield buildUserMessage(next.value);
  }
}

async function* readMessages(
  messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>,
): AsyncGenerator<InboxMessage> {
  yield* messages;
}

async function readNextMessage(
  iterator: AsyncIterator<InboxMessage>,
  state: TurnInputState,
): Promise<IteratorResult<InboxMessage> | null> {
  try {
    return await Promise.race([iterator.next(), state.ended.promise.then(() => null)]);
  } catch (error) {
    const failure = error instanceof Error ? error : new Error(String(error));

    state.inputFailed.resolve(failure);
    return null;
  }
}

function buildUserMessage(message: InboxMessage): SDKUserMessage {
  return {
    type: 'user',
    message: { role: 'user', content: message.text },
    parent_tool_use_id: null,

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the wire schema checked it
    uuid: message.uuid as SDKUserMessage['uuid'] & string,
    session_id: '',
    priority: 'next',
  };
}
