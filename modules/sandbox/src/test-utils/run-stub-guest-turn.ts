import type { GuestFrame, HostFrame } from '@heynixie/wire';
import type { StubGuestDisk, StubSessionEntry } from './build-stub-guest-disk';
import { countTokenEstimate } from './count-token-estimate';
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
  readonly home: string;

  // the next reply, or the default when none is queued
  readonly takeReply: () => StubGuestReply;

  // the context size the turn must end at, once, or null to let the session's own size stand
  readonly takeContextSize: () => number | null;
  readonly callTool: StubGuestToolCaller | undefined;
}

// the window of a profile that sets no context cap, the smallest the CLI assumes for any model
const defaultWindow = 200_000;
const toolPrefix = 'mcp__nixie__';

// Runs one turn as the conversation guest does: it removes every session but the resumed one, forks
// that session at the resume point, adds the input and each reply, and ends at the fork's last entry.
// An overflow ends the turn at the resume point without moving the chain.
export async function runStubGuestTurn(
  turn: TurnFrame,
  run: StubGuestRun,
): Promise<readonly GuestFrame[]> {
  run.disk.removeSessionsExcept(run.home, turn.resume?.sessionID ?? null);

  const read = readStubGuestHistory(run, turn.resume);

  if ('failure' in read) {
    return [read.failure];
  }

  try {
    return await runReplies(turn, run, read.history);
  } catch (error) {
    return [{ type: 'failed', reason: 'error', detail: String(error) }];
  }
}

async function runReplies(
  turn: TurnFrame,
  run: StubGuestRun,
  history: readonly StubSessionEntry[],
): Promise<readonly GuestFrame[]> {
  const inputs = turn.input.map((message): StubSessionEntry => ({
    uuid: message.uuid,
    role: 'user',
    text: message.text,
    tokens: countTokenEstimate(message.text),
  }));

  const entries = [...history, ...inputs];
  const frames: GuestFrame[] = [];
  let replyCount = 0;

  for (;;) {
    const reply = run.takeReply();

    if ('overflow' in reply) {
      return [...frames, ...buildOverflowFrames(turn, run, entries, reply.overflow)];
    }

    replyCount += 1;

    const entry = buildAssistantEntry(reply);

    entries.push(entry);

    // the CLI reports the inbox messages the model read with its first reply
    if (replyCount === 1) {
      frames.push({ type: 'read', uuids: inputs.map((input) => input.uuid) });
    }

    if ('text' in reply) {
      frames.push({ type: 'assistant', messageID: entry.uuid, text: reply.text, toolUses: [] });

      return [...frames, buildEndedFrame(turn, run, { entries, history, replyCount })];
    }

    const toolID = `toolu_${crypto.randomUUID().replaceAll('-', '')}`;

    frames.push({
      type: 'assistant',
      messageID: entry.uuid,
      text: '',
      toolUses: [{ id: toolID, name: reply.toolUse.name }],
    });

    const result = await buildToolResultEntry(turn, run, reply.toolUse);

    entries.push(result);
  }
}

function buildAssistantEntry(reply: Exclude<StubGuestReply, { overflow: unknown }>) {
  const text = 'text' in reply ? reply.text : JSON.stringify(reply.toolUse);

  return {
    uuid: crypto.randomUUID(),
    role: 'assistant',
    text,
    tokens: countTokenEstimate(text),
  } as const;
}

interface StubToolUse {
  readonly name: string;
  readonly input: Readonly<Record<string, unknown>>;
}

async function buildToolResultEntry(
  turn: TurnFrame,
  run: StubGuestRun,
  toolUse: StubToolUse,
): Promise<StubSessionEntry> {
  if (run.callTool === undefined) {
    throw new Error('the stub guest has no route to the tools');
  }

  const result = await run.callTool({
    sandboxID: run.sandboxID,
    owner: run.owner,
    token: turn.tools.token,
    name: toolUse.name.startsWith(toolPrefix)
      ? toolUse.name.slice(toolPrefix.length)
      : toolUse.name,
    input: toolUse.input,
  });

  return {
    uuid: crypto.randomUUID(),
    role: 'user',
    text: result,
    tokens: countTokenEstimate(result),
  };
}

interface TurnEnd {
  readonly entries: readonly StubSessionEntry[];
  readonly history: readonly StubSessionEntry[];
  readonly replyCount: number;
}

// writes the fork and ends the turn at its last entry, with the fork's context size
function buildEndedFrame(turn: TurnFrame, run: StubGuestRun, end: TurnEnd): GuestFrame {
  const sized = buildFilledEntries(end.entries, run.takeContextSize());
  const sessionID = crypto.randomUUID();

  run.disk.writeSession(run.home, sessionID, sized);

  const last = sized.at(-1);

  if (last === undefined) {
    throw new Error('a turn always writes an entry');
  }

  const fresh = sized.slice(end.history.length);

  return {
    type: 'ended',
    boundary: { sessionID, messageID: last.uuid },
    subtype: 'success',
    stopReason: 'end_turn',
    turns: end.replyCount,
    usage: {
      inputTokens: countTokens(fresh.filter((entry) => entry.role === 'user')),
      outputTokens: countTokens(fresh.filter((entry) => entry.role === 'assistant')),
      cacheReadTokens: 0,
      cacheWriteTokens: 0,
    },
    context: { size: countTokens(sized), window: turn.profile.contextTokens ?? defaultWindow },
  };
}

// the CLI answers a call past the window with its own message, and the turn ends at the point it
// resumed, so a retry forks the session before the overflow
function buildOverflowFrames(
  turn: TurnFrame,
  run: StubGuestRun,
  entries: readonly StubSessionEntry[],
  reason: 'blocking_limit' | 'prompt_too_long',
): readonly GuestFrame[] {
  const message: StubSessionEntry = {
    uuid: crypto.randomUUID(),
    role: 'assistant',
    text: 'Prompt is too long',
    tokens: 0,
  };

  const sessionID = crypto.randomUUID();

  run.disk.writeSession(run.home, sessionID, [...entries, message]);

  return [
    { type: 'assistant', messageID: message.uuid, text: message.text, toolUses: [] },
    {
      type: 'ended',
      boundary: turn.resume ?? { sessionID, messageID: message.uuid },
      subtype: 'success',
      stopReason: 'stop_sequence',
      isError: true,
      terminalReason: reason,
      turns: 1,
      usage: { inputTokens: 0, outputTokens: 0, cacheReadTokens: 0, cacheWriteTokens: 0 },
    },
  ];
}

// raises the last entry's tokens so the session's context reaches the size a test set
function buildFilledEntries(
  entries: readonly StubSessionEntry[],
  size: number | null,
): readonly StubSessionEntry[] {
  const last = entries.at(-1);

  if (size === null || last === undefined) {
    return entries;
  }

  const gap = Math.max(0, size - countTokens(entries));

  return [...entries.slice(0, -1), { ...last, tokens: last.tokens + gap }];
}

function countTokens(entries: readonly StubSessionEntry[]): number {
  return entries.reduce((total, entry) => total + entry.tokens, 0);
}
