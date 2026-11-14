import { deriveModelSecret, getHarness } from '@heynixie/models';
import type { ModelRole, ResolvedProfile } from '@heynixie/models';
import type { GuestCommand, Sandbox, SandboxAdapter, SandboxLimits } from '@heynixie/sandbox';
import type { TasksContext } from '@heynixie/tasks';
import type { RunEndpoint, ToolEndpoint, ToolRunModel } from '@heynixie/tools';
import invariant from 'tiny-invariant';
import { createWorkerSandbox } from './create-worker-sandbox';
import { isContextOverflow } from './is-context-overflow';
import type { StepCapturePort } from './open-step-capture';
import { openStepCapture } from './open-step-capture';
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

  // the turn-input log, and the role its roles list names this runner by
  readonly turnInputs?: StepCapturePort;
  readonly captureRole?: ModelRole;
}

export interface SessionInput {
  readonly systemPrompt: string;
  readonly prompt: string;
  readonly signal: AbortSignal;

  readonly stepRunID: string;
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

  const harness = getHarness(options.profile.profile.harness);

  const worker = await createWorkerSandbox({
    sandboxes: options.sandboxes,
    image: options.image,
    owner: options.taskID,
    limits: options.limits,
    modelGrant: harness.buildGrant(secret),
  });

  const model: ToolRunModel = {
    model: options.profile.profile.model,
    profile: options.profile.profile.id,
  };

  const endpoint = await options.tools.startRun({
    runID: options.taskID,
    thread: options.taskID,
    tools: options.toolNames,
    model,
    toolUseMetaKey: harness.toolUseMetaKey,
  });

  return {
    model,
    runSession: (session) => runSession({ ...options, sandbox: worker.sandbox, endpoint }, session),
    stop: () => endpoint.stop(),
  };
}

interface SessionRun extends SessionRunnerOptions {
  readonly sandbox: Sandbox;

  readonly endpoint: Pick<RunEndpoint, 'startStep'>;
}

async function runSession(run: SessionRun, session: SessionInput): Promise<SessionUsage> {
  const route = await run.sandbox.toolRoute();

  invariant(route, 'the session sandbox has no tool route');

  // A tool call under the step's token carries the step's run ID, so a write that a step's lease
  // guards can refuse a call from a step that lost its task.
  const step = run.endpoint.startStep(session.stepRunID);

  try {
    return await runStepSession(run, session, { url: route.url, token: step.token });
  } finally {
    await step.stop();
  }
}

interface SessionTools {
  readonly url: string;
  readonly token: string;
}

async function runStepSession(
  run: SessionRun,
  session: SessionInput,
  tools: SessionTools,
): Promise<SessionUsage> {
  const profile = run.profile.profile;
  const port = run.captureRole === undefined ? undefined : run.turnInputs;

  const capture = await openStepCapture(port, {
    step: { taskID: run.taskID, stepRunID: session.stepRunID },
    profile,
    role: run.captureRole ?? 'memory-writer',
  });

  const calls = { count: 0 };

  try {
    return await runCapturedSession(run, session, {
      tools,
      baseURL: capture.baseURL,
      calls,
    });
  } finally {
    await capture.close({ callFrames: calls.count });
  }
}

interface CapturedSession {
  readonly tools: SessionTools;
  readonly baseURL: string;
  readonly calls: { count: number };
}

async function runCapturedSession(
  run: SessionRun,
  session: SessionInput,
  captured: CapturedSession,
): Promise<SessionUsage> {
  const profile = run.profile.profile;
  const harness = getHarness(profile.harness);
  const tools = captured.tools;

  const turn = await runGuestTurn({
    sandbox: run.sandbox,
    command: run.command,
    turn: {
      type: 'turn',
      profile: {
        ...harness.toTurnProfile(profile),

        // Each run starts a fresh session, so a 1-hour cache entry costs more to write and is never
        // read again.
        cacheTTL: '5m',
        baseURL: captured.baseURL,
      },
      tools,
      resume: null,
      systemPrompt: session.systemPrompt,
      limits: { modelCalls: null, toolCallWaitMs: harness.toolCallWaitMs },
      input: [{ uuid: crypto.randomUUID(), text: session.prompt }],
    },
    messages: [],
    signal: session.signal,
    onCall: () => {
      captured.calls.count += 1;

      return Promise.resolve();
    },
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
