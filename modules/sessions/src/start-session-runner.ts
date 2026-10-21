import { buildModelGrant, deriveModelSecret } from '@heynixie/models';
import type { ResolvedProfile } from '@heynixie/models';
import type { GuestCommand, Sandbox, SandboxAdapter, SandboxLimits } from '@heynixie/sandbox';
import { buildSandboxSpec, findKeptSandbox } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import type { ToolEndpoint, ToolRunModel } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { isContextOverflow } from './is-context-overflow';
import { runGuestTurn } from './run-guest-turn';

export interface SessionRunnerOptions {
  readonly context: TasksContext;

  readonly profile: ResolvedProfile;
  readonly sandboxes: SandboxAdapter;
  readonly tools: Pick<ToolEndpoint, 'startRun'>;
  readonly toolNames: readonly string[];

  readonly taskID: string;
  readonly image: string;
  readonly limits: SandboxLimits;
  readonly command: GuestCommand;
}

export interface SessionInput {
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly signal: AbortSignal;
}

export interface SessionUsage {
  readonly inputTokens: number;
  readonly outputTokens: number;
  readonly cacheReadTokens: number;
  readonly cacheWriteTokens: number;
}

export interface SessionRunner {
  readonly model: ToolRunModel;

  readonly runSession: (session: SessionInput) => Promise<SessionUsage>;
  readonly stop: () => Promise<void>;
}

export async function startSessionRunner(options: SessionRunnerOptions): Promise<SessionRunner> {
  const secret = deriveModelSecret(options.profile);

  await options.sandboxes.addSecret(secret);

  const sandbox = await setupSessionSandbox(options, buildModelGrant(secret));

  const model: ToolRunModel = {
    model: options.profile.profile.model,
    profile: options.profile.profile.id,
  };

  const endpoint = await options.tools.startRun({
    runID: options.taskID,
    thread: options.taskID,
    tools: options.toolNames,
    model,
  });

  return {
    model,
    runSession: (session) => runSession({ ...options, sandbox, token: endpoint.token }, session),
    stop: () => endpoint.stop(),
  };
}

async function setupSessionSandbox(
  options: SessionRunnerOptions,
  grant: ReturnType<typeof buildModelGrant>,
): ReturnType<SandboxAdapter['create']> {
  const spec = buildSandboxSpec({
    kind: 'worker',
    image: options.image,
    owner: options.taskID,
    limits: options.limits,
    modelGrant: grant,
  });

  const existing = await options.sandboxes.list(options.taskID);

  const kept = findKeptSandbox(existing, spec);

  await Promise.all(
    existing.filter((sandbox) => sandbox !== kept).map((sandbox) => sandbox.destroy()),
  );

  return kept ?? options.sandboxes.create(spec);
}

interface SessionRun extends SessionRunnerOptions {
  readonly sandbox: Sandbox;

  readonly token: string;
}

async function runSession(run: SessionRun, session: SessionInput): Promise<SessionUsage> {
  const route = await run.sandbox.toolRoute();

  invariant(route, 'the session sandbox has no tool route');

  const profile = run.profile.profile;

  const turn = await runGuestTurn({
    sandbox: run.sandbox,
    command: run.command,
    turn: {
      type: 'turn',
      profile: {
        model: profile.model,
        baseURL: profile.baseURL,
        effort: profile.effort,
        authHeader: profile.authHeader,
        contextTokens: profile.contextTokens,

        // Each run starts a fresh session, so a 1-hour cache entry costs more to write and is never
        // read again.
        cacheTTL: '5m',
      },
      tools: { url: route.url, token: run.token },
      resume: null,
      systemPrompt: session.systemPrompt,
      input: [{ uuid: crypto.randomUUID(), text: session.prompt }],
    },
    messages: [],
    signal: session.signal,
  });

  if (turn.failure !== null || turn.ended.length === 0) {
    throw new Error(
      `the ${run.taskID} session failed: ${turn.failure?.reason ?? 'no result'}: ${turn.failure?.detail ?? ''}`,
    );
  }

  requireTrustedEnd(run.taskID, turn.ended);

  return countSessionUsage(turn.ended);
}

type EndedFrame = Awaited<ReturnType<typeof runGuestTurn>>['ended'][number];

function requireTrustedEnd(taskID: string, ended: readonly EndedFrame[]): void {
  if (ended.some((frame) => isContextOverflow(frame))) {
    throw new Error(`the ${taskID} session's context passed its window`);
  }

  if (ended.some((frame) => frame.isError === true)) {
    throw new Error(`the ${taskID} session ended at a model API error`);
  }
}

function countSessionUsage(ended: readonly EndedFrame[]): SessionUsage {
  const countTotal = (pick: (usage: EndedFrame['usage']) => number) =>
    ended.reduce((total, frame) => total + pick(frame.usage), 0);

  return {
    inputTokens: countTotal((usage) => usage.inputTokens),
    outputTokens: countTotal((usage) => usage.outputTokens),
    cacheReadTokens: countTotal((usage) => usage.cacheReadTokens),
    cacheWriteTokens: countTotal((usage) => usage.cacheWriteTokens),
  };
}
