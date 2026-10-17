import type { SDKUserMessage } from '@anthropic-ai/claude-agent-sdk';
import type { InboxMessage } from '@heynixie/wire';
import type { TurnFrame } from './build-query-options';

export interface TurnInputState {
  // the uuids of messages the SDK took and has not yet read
  readonly pending: Set<string>;

  // resolves true once nixie's tool server has connected, or false when the turn stops without it
  readonly toolsReady: PromiseWithResolvers<boolean>;

  // resolves with the error the host's message stream threw, which fails the turn at once
  readonly inputFailed: PromiseWithResolvers<Error>;
  readonly ended: PromiseWithResolvers<void>;
}

// Reads the prompt stream of one turn, once its tools connect: the turn's inbox, then each host
// message until the turn ends. The SDK aborts on an error from its prompt stream, yet the CLI still answers the message it
// holds, so a host stream error ends the stream and fails the turn through its state instead.
export async function* readTurnInput(
  turn: TurnFrame,
  messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>,
  state: TurnInputState,
): AsyncGenerator<SDKUserMessage> {
  const isReady = await state.toolsReady.promise;

  if (isReady) {
    yield* readInbox(turn, messages, state);
  }
}

async function* readInbox(
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
    message: { role: 'user', content: buildContent(message) },
    parent_tool_use_id: null,

    // oxlint-disable-next-line typescript/no-unsafe-type-assertion -- the wire schema checked it
    uuid: message.uuid as SDKUserMessage['uuid'] & string,
    session_id: '',
    priority: 'next',
  };
}

type UserContent = SDKUserMessage['message']['content'];

// A message with images reads as its text, then each image after the marker that names it, so the
// model sees which marker in the text stands for which image. A message with none stays a string.
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
