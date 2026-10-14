// oxlint-disable typescript/prefer-readonly-parameter-types -- the SDK's message and MCP types, an async iterable and the turn's own state have no readonly form
import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, SessionPoint } from '@heynixie/wire';
import type { TurnFrame } from './build-query-options';
import { buildQueryOptions } from './build-query-options';
import { checkToolServer } from './check-tool-server';
import { countContextTokens } from './count-context-tokens';
import { getCompactWindow } from './get-compact-window';
import type { TurnInputState } from './read-turn-input';
import { readTurnInput } from './read-turn-input';
import { setupTurnDisk } from './setup-turn-disk';
import { toolServerName } from './tool-server-name';
import type { TurnDependencies } from './types';

// Runs one model turn over the turn's inbox and the host's later messages, each with its record's
// uuid. The turn ends at a result once the SDK has read every message it took, and stops at once
// when nixie's tool server is not connected, because the model would invent the tools' output.
export async function runTurn(turn: TurnFrame, deps: TurnDependencies): Promise<void> {
  const options = buildQueryOptions(turn, { env: deps.env, toolServer: deps.toolServer });

  await setupTurnDisk(options, turn.resume?.sessionID ?? null);

  const state: TurnState = {
    pending: new Set(),
    boundary: null,
    contextSize: null,
    compactWindow: getCompactWindow(turn.profile),
    toolsReady: Promise.withResolvers(),
    inputFailed: Promise.withResolvers(),
    ended: Promise.withResolvers(),
  };
  const session = (deps.runQuery ?? query)({
    prompt: readTurnInput(turn, deps.messages, state),
    options,
  });

  try {
    await drainConnectedSession(session, deps, state);
  } finally {
    state.ended.resolve();

    // close() ends a read still waiting on the CLI, and return() waits for the CLI process to exit,
    // so the next turn and the guest's file cleanup never meet a live CLI
    session.close();
    await session.return();
  }
}

// the turn's input waits for nixie's tool server, and a turn that never gets its tools sends none
async function drainConnectedSession(
  session: ReturnType<typeof query>,
  deps: TurnDependencies,
  state: TurnState,
): Promise<void> {
  const failed = await checkToolServer(session, deps.waitBeforeReconnect);

  state.toolsReady.resolve(failed === null);
  await (failed === null ? drainSession(session, deps, state) : deps.emit(failed));
}

async function drainSession(
  session: AsyncIterable<SDKMessage>,
  deps: TurnDependencies,
  state: TurnState,
): Promise<void> {
  const messages = session[Symbol.asyncIterator]();

  for (;;) {
    // oxlint-disable-next-line no-await-in-loop -- each SDK message follows the one before it
    const next = await Promise.race([messages.next(), state.inputFailed.promise]);

    if (next instanceof Error) {
      throw next;
    }
    if (next.done === true) {
      return;
    }

    // oxlint-disable-next-line no-await-in-loop -- the host reads the frames in order
    const outcome = await emitMessageFrames(next.value, deps, state);

    if (outcome === 'stop' || (outcome === 'result' && state.pending.size === 0)) {
      return;
    }
  }
}

interface TurnState extends TurnInputState {
  // the session's last chain entry so far
  boundary: SessionPoint | null;

  // the tokens the last main-chain model call read, or null before one reports its usage
  contextSize: number | null;
  readonly compactWindow: number;
}

type MessageOutcome = 'continue' | 'result' | 'stop';

// the frames one SDK message gives the host, and whether the turn goes on
function emitMessageFrames(
  message: SDKMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  if (message.type === 'system') {
    return emitSystem(message, deps, state);
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

type SystemMessage = Extract<SDKMessage, { type: 'system' }>;

function emitSystem(
  message: SystemMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  if (message.subtype === 'init') {
    return emitInit(message, deps);
  }
  if (message.subtype === 'compact_boundary') {
    return emitCompacted(message, deps);
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

type CompactBoundaryMessage = Extract<SDKMessage, { type: 'system'; subtype: 'compact_boundary' }>;

// the host records each compaction's token counts; the summary text never leaves the guest
async function emitCompacted(
  message: CompactBoundaryMessage,
  deps: TurnDependencies,
): Promise<MessageOutcome> {
  await deps.emit({
    type: 'compacted',
    trigger: message.compact_metadata.trigger,
    preTokens: message.compact_metadata.pre_tokens,
    postTokens: message.compact_metadata.post_tokens ?? null,
  });
  return 'continue';
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

  // the CLI's own message for an API error carries no usage from the model
  if (message.error === undefined) {
    state.contextSize = countContextTokens(message.message.usage);
  }
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
  await deps.emit(buildEnded(message, state.boundary, state));
  return 'result';
}

function buildEnded(
  message: Extract<SDKResultMessage, { subtype: 'success' }>,
  boundary: SessionPoint,
  state: TurnState,
): GuestFrame {
  return {
    type: 'ended',
    boundary,
    subtype: message.subtype,
    stopReason: message.stop_reason,
    isError: message.is_error,
    turns: message.num_turns,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens,
      cacheWriteTokens: message.usage.cache_creation_input_tokens,
    },
    ...(state.contextSize === null
      ? {}
      : { context: { size: state.contextSize, window: state.compactWindow } }),
  };
}
