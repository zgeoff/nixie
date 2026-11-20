import type { Query, SDKMessage, SDKResultMessage } from '@anthropic-ai/claude-agent-sdk';
import { query } from '@anthropic-ai/claude-agent-sdk';
import type { GuestFrame, SessionPoint } from '@heynixie/wire';
import { foldAnthropicUsageEvent, parseAnthropicCallUsage } from '@heynixie/wire';
import type { RequestRewriter } from '../rewrite/start-request-rewriter';
import { startRequestRewriter } from '../rewrite/start-request-rewriter';
import { waitForRefusal } from '../rewrite/wait-for-refusal';
import type { TurnDependencies } from '../types';
import { addCarried } from './add-carried';
import { buildEnded } from './build-ended';
import { buildModelFailure } from './build-model-failure';
import type { TurnFrame } from './build-query-options';
import { buildQueryOptions } from './build-query-options';
import { checkToolServer } from './check-tool-server';
import { commandLifecycleSchema } from './command-lifecycle-schema';
import { countContextTokens } from './count-context-tokens';
import { getCompactWindow } from './get-compact-window';
import { hasAwaited } from './has-awaited';
import { isOverflowReason } from './is-overflow-reason';
import { readTurnInput } from './read-turn-input';
import { setupTurnDisk } from './setup-turn-disk';
import { startCutIfDue } from './start-cut-if-due';
import { toolServerName } from './tool-server-name';
import { trackStreaming } from './track-streaming';
import type { AssistantMessage, Cut, TurnState } from './turn-state';
import { noCarried } from './turn-state';

export async function runTurn(turn: TurnFrame, deps: TurnDependencies): Promise<void> {
  const rewriter = await startRewriterOrFail(turn, deps);

  if (rewriter === 'failed') {
    return;
  }

  try {
    await runTurnThrough(turn, deps, rewriter);
  } finally {
    await rewriter?.stop();
  }
}

async function startRewriterOrFail(
  turn: TurnFrame,
  deps: TurnDependencies,
): Promise<RequestRewriter | null | 'failed'> {
  try {
    return startRequestRewriter(turn, deps.rewriter);
  } catch (error) {
    await deps.emit({
      type: 'failed',
      reason: 'error',
      detail: `the request rewriter could not start: ${String(error)}`,
    });

    return 'failed';
  }
}

async function runTurnThrough(
  turn: TurnFrame,
  deps: TurnDependencies,
  rewriter: RequestRewriter | null,
): Promise<void> {
  const options = buildQueryOptions(turn, {
    env: deps.env,
    toolServer: deps.toolServer,
    ...(rewriter === null ? {} : { rewriterURL: rewriter.url }),
  });

  await setupTurnDisk(options, turn.resume?.sessionID ?? null);

  const state: TurnState = {
    pending: new Set(),
    cutting: new Set(),
    queued: new Set(),
    unlisted: new Set(),
    canCut: false,
    isStreaming: false,
    hasToolUse: false,
    cut: null,
    cutCalls: 0,
    carried: noCarried,
    held: null,
    heldReads: new Set(),
    boundary: null,
    committed: turn.resume ?? null,
    contextSize: null,
    compactWindow: getCompactWindow(turn.profile),
    isInterrupted: false,
    isRetried: false,
    reported: {},
    refused: waitForRefusal(rewriter),
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
  session: Query,
  deps: TurnDependencies,
  state: TurnState,
): Promise<void> {
  const messages = session[Symbol.asyncIterator]();

  for (;;) {
    const next = await Promise.race([messages.next(), state.inputFailed.promise, state.refused]);

    if (next instanceof Error) {
      throw next;
    }

    if ('refusal' in next) {
      await deps.emit({ type: 'failed', reason: 'error', detail: next.refusal });

      return;
    }

    if (next.done === true) {
      return;
    }

    const outcome = await emitMessageFrames(next.value, deps, state);

    if (outcome === 'stop' || (outcome === 'result' && !hasAwaited(state))) {
      return;
    }

    startCutIfDue(session, state);
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

  if (message.type === 'stream_event') {
    return emitCallUsage(message, deps, state);
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
    return emitInit(message, deps, state);
  }

  if (message.subtype === 'api_retry') {
    state.isRetried = true;

    return Promise.resolve('continue');
  }

  return emitCommandRead(message, deps, state);
}

type InitMessage = Extract<SDKMessage, { type: 'system'; subtype: 'init' }>;

async function emitInit(
  message: InitMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  state.canCut = message.capabilities?.includes('interrupt_receipt_v1') === true;

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

  if (!lifecycle.success || lifecycle.data.command_uuid === undefined) {
    return 'continue';
  }

  const uuid = lifecycle.data.command_uuid;

  if (lifecycle.data.state === 'queued') {
    state.queued.add(uuid);
  } else {
    state.queued.delete(uuid);
  }

  // A command that completes while a cut ends the call may be the one the cut aborted.
  if (lifecycle.data.state === 'completed' && state.cut === null) {
    await emitReads(deps, state, [uuid]);
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
      state.unlisted.delete(uuid);
    }

    await deps.emit({ type: 'read', uuids });
  }
}

async function emitAssistant(
  message: AssistantMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  if (message.parent_tool_use_id !== null) {
    return 'continue';
  }

  // A cut call's text may end mid-word, and the model never finished it, so nothing of it reaches
  // the host.
  if (message.aborted === true) {
    state.held = null;

    return 'continue';
  }

  const isRetried = state.isRetried;

  state.isRetried = false;

  const failure =
    message.error === undefined
      ? null
      : buildModelFailure({
          error: message.error,
          isRetried,
          detail: collectText(message.message.content),
        });

  if (failure !== null) {
    await deps.emit(failure);

    return 'stop';
  }

  if (message.error === undefined && isReasoningOnly(message)) {
    await flushHeld(deps, state);

    state.held = message;

    return 'continue';
  }

  await flushHeld(deps, state);

  return emitAssistantFrames(message, deps, state);
}

function collectText(content: AssistantMessage['message']['content']): string {
  return content.flatMap((block) => (block.type === 'text' ? [block.text] : [])).join('\n\n');
}

function isReasoningOnly(message: AssistantMessage): boolean {
  return (
    message.message.content.length > 0 &&
    message.message.content.every((block) => block.type === 'thinking')
  );
}

async function flushHeld(deps: TurnDependencies, state: TurnState): Promise<void> {
  const held = state.held;

  if (held !== null) {
    state.held = null;

    await emitAssistantFrames(held, deps, state);
  }
}

async function emitAssistantFrames(
  message: AssistantMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  state.boundary = { harness: 'agent-sdk', sessionID: message.session_id, messageID: message.uuid };

  if (message.error === undefined) {
    state.committed = state.boundary;
    state.contextSize = countContextTokens(message.message.usage);
  }

  await emitReads(deps, state, [
    message.user_message_uuid,
    ...(message.user_message_uuids ?? []),
    ...state.heldReads,
  ]);

  state.heldReads.clear();

  const summary = collectSummary(message.message.content);

  await deps.emit({
    type: 'assistant',
    messageID: message.uuid,
    text: collectText(message.message.content),
    toolUses: message.message.content.flatMap((block) =>
      block.type === 'tool_use' ? [{ id: block.id, name: block.name }] : [],
    ),
    ...(summary === '' ? {} : { summary }),
    ...(message.error === undefined ? {} : { isError: true as const }),
  });

  return 'continue';
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
    state.boundary = { harness: 'agent-sdk', sessionID, messageID };
    state.committed = state.boundary;
  }
}

const missingSessionPrefix = 'No conversation found with session ID';

async function emitResult(
  message: SDKResultMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  if (
    message.subtype === 'error_max_turns' ||
    (message.subtype !== 'success' && state.isInterrupted)
  ) {
    return emitInterrupted(message, deps, state);
  }

  const cut = state.cut;

  state.cut = null;

  if (cut !== null && message.subtype !== 'success') {
    return emitCut(message, cut, deps, state);
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

// The CLI ends a turn that it interrupted or stopped at its call limit with an error result, yet
// every chain entry before the stop stands, so the turn ends at the last of them and the host
// commits what the model read.
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

// The CLI ends the cut call's turn with an error result and starts the next queued message at
// once. The cut call's usage still counts, and the turn goes on while a message survives the cut.
async function emitCut(
  message: SDKResultMessage,
  cut: Cut,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  const stillQueued = await cut.receipt;

  const usage = parseAnthropicCallUsage(state.reported);

  state.reported = {};
  state.held = null;
  state.isStreaming = false;
  state.cutCalls += 1;

  if (usage !== null) {
    await deps.emit({ type: 'call', usage });
  }

  for (const uuid of state.pending) {
    if (state.unlisted.has(uuid) && !state.queued.has(uuid)) {
      state.heldReads.add(uuid);
    }
  }

  if (stillQueued !== null && hasAwaited(state)) {
    state.carried = addCarried(state.carried, message);

    return 'continue';
  }

  const boundary = state.boundary ?? state.committed;

  await emitReads(deps, state, [...state.heldReads]);

  const frame: GuestFrame =
    boundary === null
      ? { type: 'failed', reason: 'error', detail: 'the turn was cut before any chain entry' }
      : { ...buildEnded(message, boundary, state), outcome: 'finished', isError: false };

  await deps.emit(frame);

  return 'stop';
}

function pickBoundary(
  message: Extract<SDKResultMessage, { subtype: 'success' }>,
  state: TurnState,
): SessionPoint | null {
  return isOverflowReason(message.terminal_reason)
    ? (state.committed ?? state.boundary)
    : state.boundary;
}

type StreamEventMessage = Extract<SDKMessage, { type: 'stream_event' }>;

// The CLI copies a call's opening usage onto the message of each content block it streams, so only
// the stream's own events give one final count per call.
async function emitCallUsage(
  message: StreamEventMessage,
  deps: TurnDependencies,
  state: TurnState,
): Promise<MessageOutcome> {
  trackStreaming(message, state);

  if (message.event.type !== 'message_stop') {
    state.reported = foldAnthropicUsageEvent(state.reported, message.event);

    return 'continue';
  }

  await flushHeld(deps, state);

  const usage = parseAnthropicCallUsage(state.reported);

  state.reported = {};

  if (usage !== null) {
    await deps.emit({ type: 'call', usage });
  }

  return 'continue';
}
