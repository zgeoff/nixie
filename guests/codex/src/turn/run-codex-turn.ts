import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import type { CodexTurnProfile, GuestFrame, HostFrame } from '@heynixie/wire';
import { match } from 'ts-pattern';
import { z } from 'zod';
import type { AppServerClient, AppServerProcess } from '../app-server/start-app-server';
import { AppServerRequestError, startAppServer } from '../app-server/start-app-server';
import { codexVersion } from '../codex-version';
import { toolServerName } from '../config/build-codex-config';
import { buildCodexEnv } from './build-codex-env';
import { buildCodexFailure } from './build-codex-failure';
import { buildTurnInput } from './build-turn-input';
import { findNewCall } from './find-new-call';
import { getHome } from './get-home';
import { getWorkDir } from './get-work-dir';
import type { CodexNotification } from './parse-notification';
import { parseNotification } from './parse-notification';
import { pickTurnOutcome } from './pick-turn-outcome';
import { writeCodexHome } from './write-codex-home';

export type CodexTurnFrame = Omit<Extract<HostFrame, { type: 'turn' }>, 'profile'> & {
  readonly profile: CodexTurnProfile;
};

export interface CodexTurnDependencies {
  readonly env: Readonly<Record<string, string | undefined>>;

  // What `codex --version` prints
  readonly readVersion: (env: Record<string, string>) => Promise<string>;
  readonly startProcess: (env: Record<string, string>, cwd: string) => AppServerProcess;
  readonly interrupt: AbortSignal;
  readonly emit: (frame: GuestFrame) => Promise<void>;
}

// Runs one turn through `codex app-server`: a thread, one turn, and the frames that the turn's
// notifications give.
export async function runCodexTurn(
  turn: CodexTurnFrame,
  deps: CodexTurnDependencies,
): Promise<void> {
  const home = getHome(deps.env);
  const workDir = getWorkDir(home);
  const env = buildCodexEnv(deps.env, home, turn.tools.token);

  const version = await deps.readVersion(env);

  if (version !== `codex-cli ${codexVersion}`) {
    await deps.emit({
      type: 'failed',
      reason: 'error',
      detail: `the codex guest runs ${codexVersion}, and the image holds "${version}"`,
    });

    return;
  }

  await writeCodexHome(home, {
    model: turn.profile.model,
    effort: turn.profile.effort,
    baseURL: turn.profile.baseURL,
    toolsURL: new URL('/mcp', turn.tools.url).href,
    toolCallWaitMs: turn.limits.toolCallWaitMs,
  });

  const input = buildTurnInput(turn.input, workDir);

  await Promise.all(
    input.files.map((file) =>
      writeFile(join(workDir, file.name), Buffer.from(file.base64, 'base64')),
    ),
  );

  const client = await startAppServer(deps.startProcess(env, workDir));

  try {
    await driveTurn(client, { turn, deps, workDir, items: input.items });
  } finally {
    await client.stop();
  }
}

interface TurnRun {
  readonly turn: CodexTurnFrame;
  readonly deps: CodexTurnDependencies;
  readonly workDir: string;
  readonly items: readonly object[];
}

interface Tally {
  calls: number;
  previousTotalTokens: number;
  uncachedInputTokens: number;
  cacheReadTokens: number;
  cacheWriteTokens: number;
  outputTokens: number;
  reasoningTokens: number;
}

interface TurnControl {
  hasLimitInterrupt: boolean;
  hasHostInterrupt: boolean;
}

interface Handling {
  readonly run: TurnRun;
  readonly turnID: string;
  readonly tally: Tally;
  readonly control: TurnControl;
  readonly sendInterrupt: () => Promise<void>;
}

const turnStartSchema = z.object({ turn: z.object({ id: z.string() }) });

async function driveTurn(client: AppServerClient, run: TurnRun): Promise<void> {
  const threadID = await startThread(client, run);

  if (threadID === null) {
    return;
  }

  const started = await client.request('turn/start', { threadId: threadID, input: run.items });

  const turnID = turnStartSchema.parse(started).turn.id;

  await run.deps.emit({ type: 'read', uuids: run.turn.input.map((message) => message.uuid) });

  const tally: Tally = {
    calls: 0,
    previousTotalTokens: 0,
    uncachedInputTokens: 0,
    cacheReadTokens: 0,
    cacheWriteTokens: 0,
    outputTokens: 0,
    reasoningTokens: 0,
  };

  const control: TurnControl = { hasLimitInterrupt: false, hasHostInterrupt: false };

  const sendInterrupt = async (): Promise<void> => {
    try {
      await client.request('turn/interrupt', { threadId: threadID, turnId: turnID });
    } catch {
      // the turn ended before the interrupt arrived, which its own completion reports
    }
  };

  const onAbort = (): void => {
    control.hasHostInterrupt = true;
    void sendInterrupt();
  };

  if (run.deps.interrupt.aborted) {
    onAbort();
  }

  run.deps.interrupt.addEventListener('abort', onAbort, { once: true });

  const handling: Handling = { run, turnID, tally, control, sendInterrupt };

  for (;;) {
    const event = await client.nextEvent();
    const isDone = await handleEvent(event, handling);

    if (isDone) {
      return;
    }
  }
}

const threadSchema = z.object({ thread: z.object({ id: z.string() }) });
const toolsNotConnectedMark = 'required MCP servers failed to initialize';

// Starts the thread, or sends the failure and gives null when the tool server is not connected.
async function startThread(client: AppServerClient, run: TurnRun): Promise<string | null> {
  try {
    const started = await client.request('thread/start', {
      model: run.turn.profile.model,
      cwd: run.workDir,
      baseInstructions: run.turn.systemPrompt,
    });

    return threadSchema.parse(started).thread.id;
  } catch (error) {
    if (error instanceof AppServerRequestError && error.message.includes(toolsNotConnectedMark)) {
      await run.deps.emit({ type: 'failed', reason: 'tools_not_connected', detail: error.message });

      return null;
    }

    throw error;
  }
}

type TurnEvent = Awaited<ReturnType<AppServerClient['nextEvent']>>;

// Acts on one event of the turn, and gives true once the turn has ended, whatever its outcome.
async function handleEvent(event: TurnEvent, handling: Handling): Promise<boolean> {
  const emit = handling.run.deps.emit;

  if (event.kind === 'closed') {
    await emit({ type: 'failed', reason: 'error', detail: event.detail });

    return true;
  }

  const notification = parseNotification(event.method, event.params);

  if (notification === null) {
    return false;
  }

  return match(notification)
    .returnType<Promise<boolean>>()
    .with({ method: 'mcpServer/startupStatus/updated' }, (entry) => handleToolServer(entry, emit))
    .with({ method: 'item/completed' }, (entry) => handleItem(entry, handling))
    .with({ method: 'thread/tokenUsage/updated' }, (entry) => handleUsage(entry, handling))
    .with({ method: 'error' }, (entry) => handleError(entry, handling))
    .with({ method: 'turn/completed' }, (entry) => handleCompleted(entry, handling))
    .exhaustive();
}

type Notification<Method extends CodexNotification['method']> = Extract<
  CodexNotification,
  { method: Method }
>;

async function handleToolServer(
  notification: Notification<'mcpServer/startupStatus/updated'>,
  emit: (frame: GuestFrame) => Promise<void>,
): Promise<boolean> {
  const server = notification.params;

  if (server.name !== toolServerName || server.status !== 'failed') {
    return false;
  }

  await emit({
    type: 'failed',
    reason: 'tools_not_connected',
    detail: server.error ?? 'the tool server failed to start',
  });

  return true;
}

async function handleItem(
  notification: Notification<'item/completed'>,
  handling: Handling,
): Promise<boolean> {
  const params = notification.params;

  if (params.turnId === handling.turnID && params.item.type === 'agentMessage') {
    await handling.run.deps.emit({
      type: 'assistant',
      messageID: params.item.id,
      text: params.item.text ?? '',
      toolUses: [],
    });
  }

  return false;
}

async function handleUsage(
  notification: Notification<'thread/tokenUsage/updated'>,
  handling: Handling,
): Promise<boolean> {
  const params = notification.params;

  if (params.turnId !== handling.turnID) {
    return false;
  }

  const tally = handling.tally;
  const usage = findNewCall(tally.previousTotalTokens, params.tokenUsage);

  tally.previousTotalTokens = params.tokenUsage.total.totalTokens;

  if (usage === null) {
    return false;
  }

  tally.calls += 1;
  tally.uncachedInputTokens += usage.uncachedInputTokens;
  tally.cacheReadTokens += usage.cacheReadTokens;
  tally.cacheWriteTokens += usage.cacheWrite1hTokens;
  tally.outputTokens += usage.outputTokens;
  tally.reasoningTokens += usage.reasoningTokens ?? 0;

  await handling.run.deps.emit({ type: 'call', usage });

  const limit = handling.run.turn.limits.modelCalls;

  if (limit !== null && tally.calls >= limit && !handling.control.hasLimitInterrupt) {
    handling.control.hasLimitInterrupt = true;

    await handling.sendInterrupt();
  }

  return false;
}

async function handleError(
  notification: Notification<'error'>,
  handling: Handling,
): Promise<boolean> {
  const params = notification.params;

  if (params.turnId !== handling.turnID || params.willRetry) {
    return false;
  }

  await handling.run.deps.emit(buildCodexFailure(params.error));

  return true;
}

async function handleCompleted(
  notification: Notification<'turn/completed'>,
  handling: Handling,
): Promise<boolean> {
  const turn = notification.params.turn;
  const emit = handling.run.deps.emit;

  if (turn.id !== handling.turnID) {
    return false;
  }

  if (turn.status === 'failed') {
    await emit(buildCodexFailure(turn.error ?? { message: 'the turn failed with no error' }));

    return true;
  }

  const tally = handling.tally;

  await emit({
    type: 'ended',
    outcome: pickTurnOutcome({
      status: turn.status === 'interrupted' ? 'interrupted' : 'completed',
      hasLimitInterrupt: handling.control.hasLimitInterrupt,
      hasHostInterrupt: handling.control.hasHostInterrupt,
    }),
    stopReason: null,
    turns: tally.calls,
    usage: {
      inputTokens: tally.uncachedInputTokens,
      outputTokens: tally.outputTokens,
      cacheReadTokens: tally.cacheReadTokens,
      cacheWriteTokens: tally.cacheWriteTokens,
    },
    thinkingTokens: tally.reasoningTokens,
  });

  return true;
}
