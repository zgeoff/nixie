// oxlint-disable typescript/prefer-readonly-parameter-types -- the SDK's message and MCP types, an async iterable and the turn's own state have no readonly form
import { mkdir } from 'node:fs/promises';
import type {
  McpServerConfig,
  SDKMessage,
  SDKResultMessage,
  SDKUserMessage,
} from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, InboxMessage, SessionPoint } from '@heynixie/wire';
import type { TurnFrame } from './build-query-options';
import { buildQueryOptions } from './build-query-options';
import { removeStaleSessions } from './remove-stale-sessions';
import { toolServerName } from './tool-server-name';

export interface TurnDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;
  readonly toolServer: McpServerConfig;

  // the host's messages for the running turn, each delivered at the model's next tool boundary
  readonly messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>;
  readonly emit: (frame: GuestFrame) => Promise<void>;

  // the SDK's query(), which a test passes through a recorder to see every call's options
  readonly runQuery?: typeof query;
}

// Runs one model turn over the turn's inbox and the host's later messages, each with its record's
// uuid. The turn ends at a result once the SDK has read every message it took, and stops at once
// when nixie's tool server is not connected, because the model would invent the tools' output.
export async function runTurn(turn: TurnFrame, deps: TurnDependencies): Promise<void> {
  const options = buildQueryOptions(turn, { env: deps.env, toolServer: deps.toolServer });

  await mkdir(options.cwd ?? '', { recursive: true });
  await removeStaleSessions(options.env?.['CLAUDE_CONFIG_DIR'], turn.resume?.sessionID ?? null);

  const state: TurnState = {
    pending: new Set(),
    boundary: null,
    inputError: null,
    ended: Promise.withResolvers(),
  };
  const session = (deps.runQuery ?? query)({ prompt: readInput(turn, deps, state), options });

  try {
    await drainSession(session, deps, state);
  } finally {
    state.ended.resolve();
    session.close();
  }
}

async function drainSession(
  session: AsyncIterable<SDKMessage>,
  deps: TurnDependencies,
  state: TurnState,
): Promise<void> {
  for await (const message of session) {
    if (state.inputError !== null) {
      throw state.inputError;
    }
    const outcome = await emitMessageFrames(message, deps, state);

    if (outcome === 'stop' || (outcome === 'result' && state.pending.size === 0)) {
      return;
    }
  }
}

interface TurnState {
  // the uuids of messages the SDK took and has not yet read
  readonly pending: Set<string>;

  // the session's last chain entry so far
  boundary: SessionPoint | null;

  // the error the host's message stream threw, which fails the turn at the next SDK message
  inputError: Error | null;
  readonly ended: PromiseWithResolvers<void>;
}

async function* readInput(
  turn: TurnFrame,
  deps: TurnDependencies,
  state: TurnState,
): AsyncGenerator<SDKUserMessage> {
  for (const message of turn.input) {
    state.pending.add(message.uuid);
    yield buildUserMessage(message);
  }
  const iterator = readMessages(deps.messages);

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

// The SDK aborts on an error from its input stream, yet the CLI still answers the message it
// holds, so the turn keeps the error to fail on instead of passing it to the SDK.
async function readNextMessage(
  iterator: AsyncIterator<InboxMessage>,
  state: TurnState,
): Promise<IteratorResult<InboxMessage> | null> {
  try {
    return await Promise.race([iterator.next(), state.ended.promise.then(() => null)]);
  } catch (error) {
    state.inputError = error instanceof Error ? error : new Error(String(error));
    return null;
  }
}

async function* readMessages(
  messages: AsyncIterable<InboxMessage> | Iterable<InboxMessage>,
): AsyncGenerator<InboxMessage> {
  yield* messages;
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

type MessageOutcome = 'continue' | 'result' | 'stop';

// the frames one SDK message gives the host, and whether the turn goes on
function emitMessageFrames(
  message: SDKMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  if (message.type === 'system' && message.subtype === 'init') {
    return emitInit(message, deps);
  }
  if (message.type === 'assistant') {
    return emitAssistant(message, deps, state);
  }
  if (message.type === 'user') {
    updateUserBoundary(message, state);
    return Promise.resolve('continue');
  }
  if (message.type === 'result') {
    return emitResult(message, deps, state);
  }
  return emitCommandRead(message, deps, state);
}

type InitMessage = Extract<SDKMessage, { type: 'system'; subtype: 'init' }>;

async function emitInit(message: InitMessage, deps: TurnDependencies): Promise<MessageOutcome> {
  const server = message.mcp_servers.find((candidate) => candidate.name === toolServerName);

  if (server?.status === 'connected') {
    return 'continue';
  }
  await deps.emit({
    type: 'failed',
    reason: 'tools_not_connected',
    detail: `nixie's tool server is ${server?.status ?? 'missing'}`,
  });
  return 'stop';
}

type AssistantMessage = Extract<SDKMessage, { type: 'assistant' }>;

// a subagent's message carries its parent's tool use and stays off the main chain
async function emitAssistant(
  message: AssistantMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  if (message.parent_tool_use_id !== null) {
    return 'continue';
  }
  state.boundary = { sessionID: message.session_id, messageID: message.uuid };
  await emitReads(deps, state, [message.user_message_uuid, ...(message.user_message_uuids ?? [])]);
  await deps.emit({
    type: 'assistant',
    messageID: message.uuid,
    text: collectText(message.message.content),
    toolUses: message.message.content.flatMap((block) =>
      block.type === 'tool_use' ? [{ id: block.id, name: block.name }] : [],
    ),
  });
  return 'continue';
}

function collectText(content: AssistantMessage['message']['content']): string {
  return content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n');
}

// a tool result is a chain entry too, and a turn can end on one
function updateUserBoundary(
  message: Extract<SDKMessage, { type: 'user' }>,
  state: TurnState,
): void {
  const messageID = message.uuid;
  const sessionID = message.session_id;

  if (message.parent_tool_use_id === null && messageID !== undefined && sessionID !== undefined) {
    state.boundary = { sessionID, messageID };
  }
}

// Claude Code reports a message folded in at a tool boundary through a command lifecycle that the
// SDK types leave out, and stamps no assistant message with it.
async function emitCommandRead(
  message: SDKMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  const lifecycle = message as { type: string; state?: unknown; command_uuid?: unknown };

  if (lifecycle.type === 'command_lifecycle' && lifecycle.state === 'completed') {
    await emitReads(deps, state, [
      typeof lifecycle.command_uuid === 'string' ? lifecycle.command_uuid : undefined,
    ]);
  }
  return 'continue';
}

async function emitReads(
  deps: TurnDependencies,
  state: TurnState,
  candidates: readonly (string | undefined)[],
): Promise<void> {
  const uuids = [...new Set(candidates)].filter(
    (uuid): uuid is string => uuid !== undefined && state.pending.has(uuid),
  );

  if (uuids.length > 0) {
    for (const uuid of uuids) {
      state.pending.delete(uuid);
    }
    await deps.emit({ type: 'read', uuids });
  }
}

// the CLI's error when the session to resume is not on this guest's disk
const missingSessionPrefix = 'No conversation found with session ID';

async function emitResult(
  message: SDKResultMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  if (message.subtype !== 'success') {
    const isMissing = message.errors.some((error) => error.startsWith(missingSessionPrefix));

    await deps.emit({
      type: 'failed',
      reason: isMissing ? 'session_missing' : 'error',
      detail: message.errors.join('; '),
    });
    return 'stop';
  }
  if (state.boundary === null) {
    await deps.emit({ type: 'failed', reason: 'error', detail: 'the turn wrote no chain entry' });
    return 'stop';
  }
  await deps.emit(buildEnded(message, state.boundary));
  return 'result';
}

function buildEnded(
  message: Extract<SDKResultMessage, { subtype: 'success' }>,
  boundary: SessionPoint,
): GuestFrame {
  return {
    type: 'ended',
    boundary,
    subtype: message.subtype,
    stopReason: message.stop_reason,
    turns: message.num_turns,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens,
      cacheWriteTokens: message.usage.cache_creation_input_tokens,
    },
  };
}
