import { once } from 'node:events';
import type { GuestFrame, HostFrame, InboxMessage, SessionPoint } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { P, match } from 'ts-pattern';
import type { GuestHome } from '../types';
import type { StubGuestDisk, StubSessionEntry } from './build-stub-guest-disk';
import { readStubGuestHistory } from './read-stub-guest-history';

type TurnFrame = Extract<HostFrame, { type: 'turn' }>;

export type StubGuestReply =
  | { readonly text: string; readonly gate?: () => Promise<void> }
  | {
      readonly toolUse: {
        readonly name: string;
        readonly input: Readonly<Record<string, unknown>>;
      };
    }
  | { readonly overflow: 'blocking_limit' | 'prompt_too_long' }
  | { readonly modelAuthRefusal: string }
  | { readonly failure: string };

export interface StubGuestToolCall {
  readonly sandboxID: string;
  readonly owner: string;

  readonly token: string;

  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

export type StubGuestToolCaller = (call: StubGuestToolCall) => Promise<string>;

export interface StubGuestRun {
  readonly sandboxID: string;
  readonly owner: string;
  readonly disk: StubGuestDisk;

  readonly home: GuestHome;

  readonly takeReply: () => StubGuestReply;

  readonly takeContextSize: () => number | null;
  readonly callTool: StubGuestToolCaller | undefined;

  readonly countTokens: (text: string) => number;

  readonly takeMessage: () => InboxMessage | undefined;

  readonly signal: AbortSignal;

  readonly emit?: (frames: readonly GuestFrame[]) => void;
}

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

interface ProgressState {
  committed: SessionPoint | null;
}

async function runInputs(
  turn: TurnFrame,
  run: StubGuestRun,
  history: readonly StubSessionEntry[],
): Promise<readonly GuestFrame[]> {
  const fork = { sessionID: crypto.randomUUID(), contextSize: run.takeContextSize() };
  const entries: StubSessionEntry[] = [...history];
  const frames: GuestFrame[] = [];
  const progress: ProgressState = { committed: turn.resume };
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

    if (run.signal.aborted) {
      return frames;
    }

    if (answer instanceof Error) {
      if (progress.committed !== turn.resume) {
        run.disk.writeSession(run.home, fork.sessionID, entries);
      }

      return [...frames, { type: 'failed', reason: 'error', detail: answer.message }];
    }

    frames.push(...answer.frames);

    if (answer.refusal !== null) {
      return [...frames, { type: 'failed', reason: 'model_auth', detail: answer.refusal }];
    }

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

  contextSize: number | null;
}

interface AnswerState {
  readonly entries: StubSessionEntry[];
  readonly fork: ForkState;
  readonly progress: ProgressState;
}

interface InputAnswer {
  readonly frames: readonly GuestFrame[];

  readonly overflow: 'blocking_limit' | 'prompt_too_long' | null;

  readonly refusal: string | null;
}

const overflowText = 'Prompt is too long';

interface AssistantStep {
  readonly run: StubGuestRun;
  readonly state: AnswerState;
  readonly frames: GuestFrame[];

  readonly readUUID: string | null;
}

async function runInputCall(
  turn: TurnFrame,
  run: StubGuestRun,
  state: AnswerState,
): Promise<InputAnswer> {
  const input = state.entries.at(-1);

  invariant(input, 'the input is the last entry');

  const frames: GuestFrame[] = [];

  for (let replyCount = 1; ; replyCount += 1) {
    const step: AssistantStep = {
      run,
      state,
      frames,
      readUUID: replyCount === 1 ? input.uuid : null,
    };

    const answer = await match(run.takeReply())
      .with({ modelAuthRefusal: P.string }, (refused): InputAnswer => ({
        frames,
        overflow: null,
        refusal: refused.modelAuthRefusal,
      }))
      .with({ failure: P.string }, (failed) => {
        throw new Error(failed.failure);
      })
      .with({ overflow: P.string }, (overflowed): InputAnswer => {
        const message = {
          uuid: crypto.randomUUID(),
          role: 'assistant',
          text: overflowText,
          tokens: 0,
        } as const;

        state.entries.push(message);

        frames.push({
          type: 'assistant',
          messageID: message.uuid,
          text: overflowText,
          toolUses: [],
        });

        return { frames, overflow: overflowed.overflow, refusal: null };
      })
      .with({ text: P.string }, async (answered): Promise<InputAnswer> => {
        if (answered.gate !== undefined) {
          await waitUnlessStopped(answered.gate(), run.signal);
        }

        const entry = pushAssistantEntry(answered.text, step);

        frames.push({
          type: 'assistant',
          messageID: entry.uuid,
          text: answered.text,
          toolUses: [],
        });

        return { frames, overflow: null, refusal: null };
      })
      .with({ toolUse: P.select() }, async (toolUse) => {
        const entry = pushAssistantEntry(JSON.stringify(toolUse), step);

        frames.push({
          type: 'assistant',
          messageID: entry.uuid,
          text: '',
          toolUses: [
            { id: `toolu_${crypto.randomUUID().replaceAll('-', '')}`, name: toolUse.name },
          ],
        });

        const result = await runStubToolCall(turn, run, toolUse);

        state.entries.push(result);

        state.progress.committed = { sessionID: state.fork.sessionID, messageID: result.uuid };

        return null;
      })
      .exhaustive();

    if (answer !== null) {
      return answer;
    }
  }
}

async function waitUnlessStopped<Value>(call: Promise<Value>, signal: AbortSignal): Promise<Value> {
  signal.throwIfAborted();

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

function pushAssistantEntry(text: string, step: AssistantStep): StubSessionEntry {
  const contextSize = step.state.fork.contextSize;

  step.state.fork.contextSize = null;

  const entry = buildAssistantEntry(text, {
    uuid: crypto.randomUUID(),
    entries: step.state.entries,
    contextSize,
    countTokens: step.run.countTokens,
  });

  step.state.entries.push(entry);

  if (step.readUUID !== null) {
    step.frames.push({ type: 'read', uuids: [step.readUUID] });
  }

  return entry;
}

interface AssistantEntrySpec {
  readonly uuid: string;

  readonly entries: readonly StubSessionEntry[];

  readonly contextSize: number | null;
  readonly countTokens: (text: string) => number;
}

function buildAssistantEntry(text: string, spec: AssistantEntrySpec): StubSessionEntry {
  const tokens = spec.countTokens(text);

  const gap =
    spec.contextSize === null
      ? 0
      : Math.max(0, spec.contextSize - countTokens(spec.entries) - tokens);

  return { uuid: spec.uuid, role: 'assistant', text, tokens: tokens + gap };
}

function countTokens(entries: readonly StubSessionEntry[]): number {
  return entries.reduce((total, entry) => total + entry.tokens, 0);
}

interface StubToolUse {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

const toolPrefix = 'mcp__nixie__';

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

  const result = await waitUnlessStopped(call, run.signal);

  return {
    uuid: crypto.randomUUID(),
    role: 'user',
    text: result,
    tokens: run.countTokens(result),
  };
}

interface OverflowState {
  readonly fork: ForkState;

  readonly committed: SessionPoint | null;
}

// The CLI answers a call past the window with its own message, and its result ends at the entry
// before that message, so a retry forks the session before the overflow.
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

interface EndedPoint {
  readonly start: number;
  readonly point: SessionPoint;
}

const defaultWindow = 200_000;

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
