import type { SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, SessionPoint } from '@heynixie/wire';
import type { TurnFrame } from './build-query-options';
import { buildQueryOptions } from './build-query-options';
import { checkToolServer } from './check-tool-server';
import { commandLifecycleSchema } from './command-lifecycle-schema';
import { countContextTokens } from './count-context-tokens';
import { getCompactWindow } from './get-compact-window';
import type { TurnInputState } from './read-turn-input';
import { readTurnInput } from './read-turn-input';
import { setupTurnDisk } from './setup-turn-disk';
import { toolServerName } from './tool-server-name';
import type { TurnDependencies } from './types';

interface TurnState extends TurnInputState {
  boundary: SessionPoint | null;

  committed: SessionPoint | null;

  contextSize: number | null;
  readonly compactWindow: number;

  isInterrupted: boolean;
}

export async function runTurn(turn: TurnFrame, deps: TurnDependencies): Promise<void> {
  const options = buildQueryOptions(turn, { env: deps.env, toolServer: deps.toolServer });

  await setupTurnDisk(options, turn.resume?.sessionID ?? null);

  const state: TurnState = {
    pending: new Set(),
    boundary: null,
    committed: turn.resume,
    contextSize: null,
    compactWindow: getCompactWindow(turn.profile),
    isInterrupted: false,
    toolsReady: Promise.withResolvers(),
    inputFailed: Promise.withResolvers(),
    ended: Promise.withResolvers(),
  };

  const session = (deps.runQuery ?? query)({
    prompt: readTurnInput(turn, deps.messages, state),
    options,
  });

  const unsubscribe = subscribeToInterrupt(deps.interrupt, () => {
    state.isInterrupted = true;
    void runInterrupt(session);
  });

  try {
    await drainConnectedSession(session, deps, state);
  } finally {
    unsubscribe();

    state.ended.resolve();

    // In the SDK, close() ends a read that still waits on the CLI, and return() waits for the CLI
    // process to exit, so no later step meets a live CLI.
    session.close();

    await session.return();
  }
}

function subscribeToInterrupt(
  signal: AbortSignal | undefined,
  onInterrupt: () => void,
): () => void {
  if (signal === undefined) {
    return () => {};
  }

  if (signal.aborted) {
    onInterrupt();

    return () => {};
  }

  signal.addEventListener('abort', onInterrupt, { once: true });

  return () => {
    signal.removeEventListener('abort', onInterrupt);
  };
}

// The SDK rejects a control request still pending when the session closes, and a turn that ends as
// the interrupt lands closes its session before the CLI answers.
async function runInterrupt(session: ReturnType<typeof query>): Promise<void> {
  try {
    await session.interrupt();
  } catch {}
}

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
    const next = await Promise.race([messages.next(), state.inputFailed.promise]);

    if (next instanceof Error) {
      throw next;
    }

    if (next.done === true) {
      return;
    }

    const outcome = await emitMessageFrames(next.value, deps, state);

    if (outcome === 'stop' || (outcome === 'result' && state.pending.size === 0)) {
      return;
    }
  }
}

type MessageOutcome = 'continue' | 'result' | 'stop';

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

async function emitCommandRead(
  message: SDKMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  const lifecycle = commandLifecycleSchema.safeParse(message);

  if (lifecycle.success && lifecycle.data.state === 'completed') {
    await emitReads(deps, state, [lifecycle.data.command_uuid]);
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

type AssistantMessage = Extract<SDKMessage, { type: 'assistant' }>;

const refusedCredentialErrors: ReadonlySet<string> = new Set([
  'authentication_failed',
  'oauth_org_not_allowed',
]);

async function emitAssistant(
  message: AssistantMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  if (message.parent_tool_use_id !== null) {
    return 'continue';
  }

  if (message.error !== undefined && refusedCredentialErrors.has(message.error)) {
    await deps.emit({
      type: 'failed',
      reason: 'model_auth',
      detail: collectText(message.message.content),
    });

    return 'stop';
  }

  state.boundary = { sessionID: message.session_id, messageID: message.uuid };

  if (message.error === undefined) {
    state.committed = state.boundary;
    state.contextSize = countContextTokens(message.message.usage);
  }

  await emitReads(deps, state, [message.user_message_uuid, ...(message.user_message_uuids ?? [])]);

  const summary = collectSummary(message.message.content);

  await deps.emit({
    type: 'assistant',
    messageID: message.uuid,
    text: collectText(message.message.content),
    toolUses: message.message.content.flatMap((block) =>
      block.type === 'tool_use' ? [{ id: block.id, name: block.name }] : [],
    ),
    ...(summary === '' ? {} : { summary }),
  });

  return 'continue';
}

function collectText(content: AssistantMessage['message']['content']): string {
  return content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n');
}

function collectSummary(content: AssistantMessage['message']['content']): string {
  return content
    .flatMap((block) => (block.type === 'thinking' ? [block.thinking] : []))
    .join('\n\n');
}

function updateUserBoundary(
  message: Extract<SDKMessage, { type: 'user' }>,
  state: TurnState,
): void {
  const messageID = message.uuid;
  const sessionID = message.session_id;

  if (message.parent_tool_use_id === null && messageID !== undefined && sessionID !== undefined) {
    state.boundary = { sessionID, messageID };
    state.committed = state.boundary;
  }
}

const missingSessionPrefix = 'No conversation found with session ID';

async function emitResult(
  message: SDKResultMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  if (message.subtype !== 'success' && state.isInterrupted) {
    return emitInterrupted(message, deps, state);
  }

  if (message.subtype !== 'success') {
    const isMissing = message.errors.some((error) => error.startsWith(missingSessionPrefix));

    await deps.emit({
      type: 'failed',
      reason: isMissing ? 'session_missing' : 'error',
      detail: message.errors.join('; '),
    });

    return 'stop';
  }

  const boundary = pickBoundary(message, state);

  if (boundary === null) {
    await deps.emit({ type: 'failed', reason: 'error', detail: 'the turn wrote no chain entry' });

    return 'stop';
  }

  await deps.emit(buildEnded(message, boundary, state));

  return 'result';
}

// The CLI ends an interrupted turn with an error result, yet every chain entry before the interrupt
// stands, so the turn ends at the last of them and the host commits what the model read.
async function emitInterrupted(
  message: SDKResultMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  const boundary = state.boundary ?? state.committed;

  const frame: GuestFrame =
    boundary === null
      ? {
          type: 'failed',
          reason: 'error',
          detail: 'the turn was interrupted before any chain entry',
        }
      : buildEnded(message, boundary, state);

  await deps.emit(frame);

  return 'stop';
}

function buildEnded(
  message: SDKResultMessage,
  boundary: SessionPoint,
  state: TurnState,
): GuestFrame {
  // The model API reports thinking tokens only in the result's usage, as the turn's total. The
  // per-message usage never carries them.
  const thinkingTokens = message.usage.output_tokens_details.thinking_tokens;

  return {
    type: 'ended',
    boundary,
    subtype: message.subtype,
    stopReason: message.stop_reason,
    isError: message.is_error,
    ...(message.terminal_reason === undefined ? {} : { terminalReason: message.terminal_reason }),
    turns: message.num_turns,
    usage: {
      inputTokens: message.usage.input_tokens,
      outputTokens: message.usage.output_tokens,
      cacheReadTokens: message.usage.cache_read_input_tokens,
      cacheWriteTokens: message.usage.cache_creation_input_tokens,
    },
    ...(thinkingTokens === 0 ? {} : { thinkingTokens }),
    ...(state.contextSize === null
      ? {}
      : { context: { size: state.contextSize, window: state.compactWindow } }),
  };
}

const overflowReasons: ReadonlySet<string> = new Set(['blocking_limit', 'prompt_too_long']);

function pickBoundary(
  message: Extract<SDKResultMessage, { subtype: 'success' }>,
  state: TurnState,
): SessionPoint | null {
  const isOverflow =
    message.terminal_reason !== undefined && overflowReasons.has(message.terminal_reason);

  return isOverflow ? (state.committed ?? state.boundary) : state.boundary;
}
