import { once } from 'node:events';
import type { GuestFrame, HostFrame, InboxMessage, SessionPoint } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import type { GuestHome } from '../types';
import type { StubGuestDisk, StubSessionEntry } from './build-stub-guest-disk';
import { readStubGuestHistory } from './read-stub-guest-history';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

// One reply the stub guest gives: text that ends the turn, a tool use that asks for a tool by its
// name as the model sees it, such as mcp__nixie__note_read, or an overflow, which the CLI reports
// when a call passes the window.
export type StubGuestReply =
  | { readonly text: string }
  | {
      readonly toolUse: {
        readonly name: string;
        readonly input: Readonly<Record<string, unknown>>;
      };
    }
  | { readonly overflow: 'blocking_limit' | 'prompt_too_long' };

// One tool call the stub guest makes through the route the host gave it.
export interface StubGuestToolCall {
  readonly sandboxID: string;
  readonly owner: string;

  // the bearer token the turn frame carries
  readonly token: string;

  // the tool's name as the endpoint serves it, with no mcp__nixie__ prefix
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

// Calls the tool and returns its result as text.
export type StubGuestToolCaller = (call: StubGuestToolCall) => Promise<string>;

export interface StubGuestRun {
  readonly sandboxID: string;
  readonly owner: string;
  readonly disk: StubGuestDisk;

  // the guest's home, which its session state sits under
  readonly home: GuestHome;

  // the next reply, or the default when none is queued
  readonly takeReply: () => StubGuestReply;

  // the context size the turn must end at, once, or null to let the session's own size stand
  readonly takeContextSize: () => number | null;
  readonly callTool: StubGuestToolCaller | undefined;

  // the tokens a text adds to the context
  readonly countTokens: (text: string) => number;

  // the next live message that reached the guest and no input has taken, or undefined when none
  readonly takeMessage: () => InboxMessage | undefined;

  // aborts when the host stops the guest: a tool call in flight ends, and the turn writes nothing
  // more
  readonly signal: AbortSignal;

  // sends the frames of each input that completes, before the next input starts; without it the
  // turn returns every frame at its end
  readonly emit?: (frames: readonly GuestFrame[]) => void;
}

// the window of a profile that sets no context cap, the smallest the CLI assumes for any model
const defaultWindow = 200_000;
const toolPrefix = 'mcp__nixie__';

// Runs one turn as the conversation guest does: it removes every session but the resumed one, forks
// that session at the resume point, adds the input and each reply, and ends at the fork's last entry.
// An overflow ends the turn at the resume point without moving the chain.
export function runStubGuestTurn(
  turn: TurnFrame,
  run: StubGuestRun,
): Promise<readonly GuestFrame[]> {
  run.disk.removeSessionsExcept(run.home, turn.resume?.sessionID ?? null);

  const read = readStubGuestHistory(run, turn.resume);

  if ('failure' in read) {
    return Promise.resolve([read.failure]);
  }

  return runInputs(turn, run, read.history);
}

// the CLI answers each inbox message of the turn in its own model call, and reports a result for
// each, all in the one fork
async function runInputs(
  turn: TurnFrame,
  run: StubGuestRun,
  history: readonly StubSessionEntry[],
): Promise<readonly GuestFrame[]> {
  const fork = { sessionID: crypto.randomUUID(), contextSize: run.takeContextSize() };
  const entries: StubSessionEntry[] = [...history];
  const frames: GuestFrame[] = [];

  // the last chain entry that is not the CLI's own message for an overflow, advanced as each
  // entry of the chain completes
  const progress: ProgressState = { committed: turn.resume };

  // the turn's inbox, then each live message that arrived while the turn ran, as the guest reads
  const queue = [...turn.input];

  for (let message = queue.shift(); message !== undefined; message = queue.shift()) {
    const input: StubSessionEntry = {
      uuid: message.uuid,
      role: 'user',
      text: message.text,
      tokens: run.countTokens(message.text),
    };

    const start = entries.length;

    entries.push(input);

    const answer = await runInputCall(turn, run, { entries, fork, progress }).catch(
      (error: unknown) => new Error(String(error)),
    );

    // a stopped guest writes nothing more, so a session the host removed after the stop stays gone
    if (run.signal.aborted) {
      return frames;
    }

    if (answer instanceof Error) {
      // the inputs that completed keep their transcript and their frames, as the guest keeps them
      if (progress.committed !== turn.resume) {
        run.disk.writeSession(run.home, fork.sessionID, entries);
      }

      return [...frames, { type: 'failed', reason: 'error', detail: answer.message }];
    }

    frames.push(...answer.frames);

    if (answer.overflow !== null) {
      run.disk.writeSession(run.home, fork.sessionID, entries);

      return [
        ...frames,
        buildOverflowEnded(entries, { fork, committed: progress.committed }, answer.overflow),
      ];
    }

    const last = entries.at(-1);

    invariant(last, 'an answered input leaves an entry');

    progress.committed = { sessionID: fork.sessionID, messageID: last.uuid };

    frames.push(buildEnded(turn, entries, { start, point: progress.committed }));

    // the CLI keeps each completed input on disk and sends its result at once, so a later stop
    // leaves both in place
    run.disk.writeSession(run.home, fork.sessionID, entries);
    run.emit?.(frames.splice(0));
    const live = run.takeMessage();

    if (live !== undefined) {
      queue.push(live);
    }
  }

  run.disk.writeSession(run.home, fork.sessionID, entries);

  return frames;
}

interface ForkState {
  readonly sessionID: string;

  // the context size a test set for the turn, until the first reply uses it
  contextSize: number | null;
}

interface ProgressState {
  // the last chain entry that is not the CLI's own message for an overflow, or null when none
  committed: SessionPoint | null;
}

interface AnswerState {
  readonly entries: StubSessionEntry[];
  readonly fork: ForkState;
  readonly progress: ProgressState;
}

interface InputAnswer {
  readonly frames: readonly GuestFrame[];

  // the reason the call was refused for a prompt past the window, or null
  readonly overflow: 'blocking_limit' | 'prompt_too_long' | null;
}

// answers one inbox message: each tool use the model asks for, then the reply that ends the call
async function runInputCall(
  turn: TurnFrame,
  run: StubGuestRun,
  state: AnswerState,
): Promise<InputAnswer> {
  const input = state.entries.at(-1);

  invariant(input, 'the input is the last entry');

  const frames: GuestFrame[] = [];

  for (let replyCount = 1; ; replyCount += 1) {
    const reply = run.takeReply();

    if ('overflow' in reply) {
      const message = {
        uuid: crypto.randomUUID(),
        role: 'assistant',
        text: overflowText,
        tokens: 0,
      } as const;

      state.entries.push(message);
      frames.push({ type: 'assistant', messageID: message.uuid, text: overflowText, toolUses: [] });

      return { frames, overflow: reply.overflow };
    }

    // the context size a test set applies to the first reply of the turn, then lapses
    const contextSize = state.fork.contextSize;

    state.fork.contextSize = null;

    const entry = buildAssistantEntry(reply, {
      uuid: crypto.randomUUID(),
      entries: state.entries,
      contextSize,
      countTokens: run.countTokens,
    });

    state.entries.push(entry);

    // the CLI reports the inbox message the model read with its first reply
    if (replyCount === 1) {
      frames.push({ type: 'read', uuids: [input.uuid] });
    }

    if ('text' in reply) {
      frames.push({ type: 'assistant', messageID: entry.uuid, text: reply.text, toolUses: [] });

      return { frames, overflow: null };
    }

    frames.push({
      type: 'assistant',
      messageID: entry.uuid,
      text: '',
      toolUses: [
        { id: `toolu_${crypto.randomUUID().replaceAll('-', '')}`, name: reply.toolUse.name },
      ],
    });

    const result = await runStubToolCall(turn, run, reply.toolUse);

    state.entries.push(result);

    state.progress.committed = { sessionID: state.fork.sessionID, messageID: result.uuid };
  }
}

const overflowText = 'Prompt is too long';

interface AssistantEntrySpec {
  readonly uuid: string;

  // the session's entries before the reply
  readonly entries: readonly StubSessionEntry[];

  // the context size the reply must raise the session to, or null to let its own size stand
  readonly contextSize: number | null;
  readonly countTokens: (text: string) => number;
}

// a reply's entry, raised by the gap to the context size given
function buildAssistantEntry(
  reply: Exclude<StubGuestReply, { overflow: unknown }>,
  spec: AssistantEntrySpec,
): StubSessionEntry {
  const text = 'text' in reply ? reply.text : JSON.stringify(reply.toolUse);
  const tokens = spec.countTokens(text);

  const gap =
    spec.contextSize === null
      ? 0
      : Math.max(0, spec.contextSize - countTokens(spec.entries) - tokens);

  return { uuid: spec.uuid, role: 'assistant', text, tokens: tokens + gap };
}

interface StubToolUse {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

// calls the tool through the guest's route and returns its result as the session's next entry
async function runStubToolCall(
  turn: TurnFrame,
  run: StubGuestRun,
  toolUse: StubToolUse,
): Promise<StubSessionEntry> {
  if (run.callTool === undefined) {
    throw new Error('the stub guest has no route to the tools');
  }

  const call = run.callTool({
    sandboxID: run.sandboxID,
    owner: run.owner,
    token: turn.tools.token,
    name: toolUse.name.startsWith(toolPrefix)
      ? toolUse.name.slice(toolPrefix.length)
      : toolUse.name,
    input: toolUse.input,
  });

  const result = await waitForToolResult(call, run.signal);

  return {
    uuid: crypto.randomUUID(),
    role: 'user',
    text: result,
    tokens: run.countTokens(result),
  };
}

// the tool's result, or the signal's reason once the host stops the guest, as a killed guest stops
// waiting on its call
async function waitForToolResult(call: Promise<string>, signal: AbortSignal): Promise<string> {
  signal.throwIfAborted();

  // ends the wait on the abort once the call settles first
  const settled = new AbortController();

  const waitForStop = async (): Promise<never> => {
    await once(signal, 'abort', { signal: settled.signal });

    signal.throwIfAborted();

    invariant(false, 'the abort event fires only on an aborted signal');
  };

  try {
    return await Promise.race([call, waitForStop()]);
  } finally {
    settled.abort();
  }
}

interface EndedPoint {
  // the index of the call's input among the entries
  readonly start: number;
  readonly point: SessionPoint;
}

// the result of one answered input, at its last chain entry, with the session's context size
function buildEnded(
  turn: TurnFrame,
  entries: readonly StubSessionEntry[],
  ended: EndedPoint,
): GuestFrame {
  const fresh = entries.slice(ended.start);

  return {
    type: 'ended',
    boundary: ended.point,
    subtype: 'success',
    stopReason: 'end_turn',
    turns: fresh.filter((entry) => entry.role === 'assistant').length,
    usage: {
      inputTokens: countTokens(fresh.filter((entry) => entry.role === 'user')),
      outputTokens: countTokens(fresh.filter((entry) => entry.role === 'assistant')),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    context: { size: countTokens(entries), window: turn.profile.contextTokens ?? defaultWindow },
  };
}

interface OverflowState {
  readonly fork: ForkState;

  // the last chain entry before the overflow, or null when the session has none
  readonly committed: SessionPoint | null;
}

// the CLI answers a call past the window with its own message, and the result ends at the last
// entry before it, so a retry forks the session before the overflow
function buildOverflowEnded(
  entries: readonly StubSessionEntry[],
  state: OverflowState,
  reason: 'blocking_limit' | 'prompt_too_long',
): GuestFrame {
  const message = entries.at(-1);

  invariant(message, 'an overflow leaves the CLI message');

  return {
    type: 'ended',
    boundary: state.committed ?? { sessionID: state.fork.sessionID, messageID: message.uuid },
    subtype: 'success',
    stopReason: 'stop_sequence',
    isError: true,
    terminalReason: reason,
    turns: 1,
    usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
  };
}

function countTokens(entries: readonly StubSessionEntry[]): number {
  return entries.reduce((total, entry) => total + entry.tokens, 0);
}
