import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { InboxMessage } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { LiveMessage } from '../types';
import type { TurnFrame } from './build-query-options';
import { isUUID } from './is-uuid';

export interface TurnInputState {
  readonly pending: Set<string>;

  // the pending messages that cut the model call in flight
  readonly cutting: Set<string>;

  readonly toolsReady: PromiseWithResolvers<boolean>;

  readonly inputFailed: PromiseWithResolvers<Error>;
  readonly ended: PromiseWithResolvers<void>;
}

export async function* readTurnInput(
  turn: TurnFrame,
  messages: AsyncIterable<LiveMessage> | Iterable<LiveMessage>,
  state: TurnInputState,
): AsyncGenerator<SDKUserMessage> {
  const isReady = await state.toolsReady.promise;

  if (isReady) {
    yield* readInbox(turn, messages, state);
  }
}

async function* readInbox(
  turn: TurnFrame,
  messages: AsyncIterable<LiveMessage> | Iterable<LiveMessage>,
  state: TurnInputState,
): AsyncGenerator<SDKUserMessage> {
  for (const message of turn.input) {
    state.pending.add(message.uuid);
    yield buildUserMessage(message);
  }

  const iterator = readMessages(messages);

  for (;;) {
    const next = await readNextMessage(iterator, state);

    if (next === null || next.done === true) {
      return;
    }

    state.pending.add(next.value.uuid);

    if (next.value.cutsCall === true) {
      state.cutting.add(next.value.uuid);
    }

    yield buildUserMessage(next.value);
  }
}

function buildUserMessage(message: InboxMessage): SDKUserMessage {
  const uuid = message.uuid;

  invariant(isUUID(uuid), 'the wire schema refuses an inbox message whose uuid is not a UUID');

  return {
    type: 'user',
    message: { role: 'user', content: buildContent(message) },
    parent_tool_use_id: null,
    uuid,
    session_id: '',
    priority: 'next',
  };
}

type UserContent = SDKUserMessage['message']['content'];

function buildContent(message: InboxMessage): UserContent {
  const images = message.images ?? [];

  if (images.length === 0) {
    return message.text;
  }

  return [
    { type: 'text', text: message.text },
    ...images.flatMap((image) => [
      { type: 'text' as const, text: image.marker },
      {
        type: 'image' as const,
        source: { type: 'base64' as const, media_type: image.mediaType, data: image.data },
      },
    ]),
  ];
}

async function* readMessages(
  messages: AsyncIterable<LiveMessage> | Iterable<LiveMessage>,
): AsyncGenerator<LiveMessage> {
  yield* messages;
}

async function readNextMessage(
  iterator: AsyncIterator<LiveMessage>,
  state: TurnInputState,
): Promise<IteratorResult<LiveMessage> | null> {
  try {
    return await Promise.race([iterator.next(), state.ended.promise.then(() => null)]);
  } catch (error) {
    // The SDK aborts on an error from its prompt stream, yet the CLI still answers the message it
    // holds, so the stream ends and the turn fails through its state.
    const failure = error instanceof Error ? error : new Error(String(error));

    state.inputFailed.resolve(failure);

    return null;
  }
}
