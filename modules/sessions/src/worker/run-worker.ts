import { createShortID } from '@heynixie/db';
import { toErrorFields } from '@heynixie/logger';
import { buildCallCost } from '@heynixie/models';
import type { Sandbox } from '@heynixie/sandbox';
import { buildSandboxSpec, buildWorkerRunOwner } from '@heynixie/sandbox';
import type { SandboxCount } from '@heynixie/spend';
import type { RunEndpoint } from '@heynixie/tools';
import type { ModelCallUsage } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { buildRoutedModel } from '../utils/build-routed-model';
import type { GuestTurn } from '../utils/run-guest-turn';
import { runGuestTurn } from '../utils/run-guest-turn';
import type { WorkerStops } from './create-worker-stops';
import { createWorkerStops } from './create-worker-stops';
import { pickGatewayEnd } from './pick-gateway-end';
import type { WorkerTurnFacts } from './pick-worker-end';
import { pickWorkerEnd } from './pick-worker-end';
import { raceStop } from './race-stop';
import { removeFailedDestroys } from './remove-failed-destroys';
import { renderWorkerEnd } from './render-worker-end';
import { startWorkerRemoval } from './start-worker-removal';
import type {
  WorkerDeps,
  WorkerEnd,
  WorkerPlan,
  WorkerResult,
  WorkerRunNames,
  WorkerSlotGrant,
} from './types';
import { workerSystemPrompt } from './worker-system-prompt';
import type { WorkerUsed } from './worker-used';
import { writeWorkerRunEnded } from './write-worker-run-ended';
import { writeWorkerRunStarted } from './write-worker-run-started';
import { writeWorkerTurnEnded } from './write-worker-turn-ended';

interface Tally {
  turns: number;
  tokens: number;
  dollars: number;
}

// What a run holds until its one exit block frees it.
interface Held {
  release: (() => void) | null;
  sandbox: Sandbox | null;

  // a create that a stop beat, whose sandbox the exit block destroys if it ever arrives
  lateSandbox: Promise<Sandbox> | null;
  endpoint: RunEndpoint | null;
  isStarted: boolean;
  stage: 'starting' | 'running';
}

interface WorkerRun {
  readonly names: WorkerRunNames;
  readonly stops: WorkerStops;
  readonly tally: Tally;
  readonly held: Held;
}

// Runs one worker for the call that planWorkerRun planned. Every way out passes the one block at
// the end, which frees the minutes, the stops, the tool run, the slot and the sandbox. The slot
// frees when the sandbox's destroy ends, which goes on after the call has its result.
export async function runWorker(deps: WorkerDeps, plan: WorkerPlan): Promise<WorkerResult> {
  const run: WorkerRun = {
    names: {
      workerRunID: crypto.randomUUID(),
      shortID: createShortID(),
      model: deps.profile.profile.model,
      profile: deps.profile.profile.id,
    },
    stops: createWorkerStops(deps.clock, plan),
    tally: { turns: 0, tokens: 0, dollars: 0 },
    held: {
      release: null,
      sandbox: null,
      lateSandbox: null,
      endpoint: null,
      isStarted: false,
      stage: 'starting',
    },
  };

  try {
    return await runOpenWorker(deps, plan, run);
  } finally {
    await releaseWorkerRun(deps, run);
  }
}

async function runOpenWorker(
  deps: WorkerDeps,
  plan: WorkerPlan,
  run: WorkerRun,
): Promise<WorkerResult> {
  const grant = await waitForSlot(deps, run);

  if (grant !== 'stopped' && grant.kind === 'full') {
    return {
      kind: 'stopped',
      sentence: `${String(grant.max)} workers already run, which is the most at once, so nixie started none. Call again when one of yours has returned.`,
    };
  }

  if (grant !== 'stopped') {
    run.held.release = grant.release;
  }

  await ensureStarted(deps, plan, run);

  const stagesEnd =
    grant === 'stopped'
      ? pickWorkerEnd({
          isAborted: plan.hold.signal.aborted,
          isMinutesUp: run.stops.isMinutesUp(),
          tripped: null,
          isInterrupted: false,
          stage: 'starting',
          error: null,
          turn: null,
        })
      : await runStages(deps, plan, run);

  const count = await readGatewayCount(deps, run);

  const end = pickGatewayEnd(stagesEnd, count, plan.limits);
  const used = buildUsed(deps, plan, run, count);

  await writeWorkerRunEnded(deps, plan, run.names, { end, used });

  return toResult(plan, run, end, used);
}

// A call that waits for a slot counts the wait in its minutes, and a stop can end the wait.
async function waitForSlot(deps: WorkerDeps, run: WorkerRun): Promise<WorkerSlotGrant | 'stopped'> {
  try {
    return await deps.slots.acquire(run.stops.hard);
  } catch (error) {
    if (run.stops.hard.aborted) {
      return 'stopped';
    }

    throw error;
  }
}

// The start record goes in before the sandbox's create, and a run that a stop ended while it
// waited for its slot still leaves one, so its end record has a start.
async function ensureStarted(deps: WorkerDeps, plan: WorkerPlan, run: WorkerRun): Promise<void> {
  if (!run.held.isStarted) {
    run.held.isStarted = true;

    await writeWorkerRunStarted(deps, plan, run.names);
  }
}

// Never throws: each way the stages end is a worker end.
async function runStages(deps: WorkerDeps, plan: WorkerPlan, run: WorkerRun): Promise<WorkerEnd> {
  const state: { turn: WorkerTurnFacts | null; error: string | null } = {
    turn: null,
    error: null,
  };

  try {
    await raceStop(removeFailedDestroys(deps), run.stops.hard);

    run.held.sandbox = await createSandbox(deps, run);

    await registerGatewaySandbox(deps, plan, run.held.sandbox);

    run.held.endpoint = await startToolRun(deps, plan, run);

    const route = await raceStop(run.held.sandbox.toolRoute(), run.stops.hard);

    invariant(route, 'the worker sandbox has no tool route');

    run.held.stage = 'running';

    const turn = await runGuest(deps, plan, run, {
      sandbox: run.held.sandbox,
      url: route.url,
      token: run.held.endpoint.token,
    });

    state.turn = summarizeTurn(turn);
  } catch (error) {
    state.error = error instanceof Error ? error.message : String(error);
  }

  return pickWorkerEnd({
    isAborted: plan.hold.signal.aborted,
    isMinutesUp: run.stops.isMinutesUp(),
    tripped: run.stops.getTripped(),
    isInterrupted: plan.hold.interrupt.aborted,
    stage: run.held.stage,
    error: state.error,
    turn: state.turn,
  });
}

// The create has the minutes for its limit, and a sandbox that arrives after a stop is destroyed.
async function createSandbox(deps: WorkerDeps, run: WorkerRun): Promise<Sandbox> {
  const creating = deps.sandboxes.create(
    buildSandboxSpec({
      kind: 'worker',
      image: deps.image,
      owner: buildWorkerRunOwner(run.names.workerRunID),
      limits: deps.size,
      modelGrant: deps.modelGrant,
    }),
  );

  try {
    return await raceStop(creating, run.stops.hard);
  } catch (error) {
    run.held.lateSandbox = creating;
    throw error;
  }
}

// The gateway counts the worker's sandbox against the limits the plan holds, before its first
// model request. A refusal fails the start.
async function registerGatewaySandbox(
  deps: WorkerDeps,
  plan: WorkerPlan,
  sandbox: Sandbox,
): Promise<void> {
  if (deps.gateway === undefined) {
    return;
  }

  const put = await deps.gateway.putSandbox(sandbox.id, {
    dollars: plan.limits.dollars,
    tokens: plan.limits.tokens,
  });

  if (put.kind !== 'ok') {
    throw new Error(`the gateway did not register the worker's sandbox: ${put.reason}`);
  }
}

function startToolRun(deps: WorkerDeps, plan: WorkerPlan, run: WorkerRun): Promise<RunEndpoint> {
  const tools = deps.readTools();

  invariant(tools, 'the tool endpoint is not running');

  return tools.startRun({
    runID: run.names.workerRunID,
    thread: plan.caller.thread,
    logThread: plan.caller.logThread,
    tools: [...plan.tools],
    model: { model: run.names.model, profile: run.names.profile },
    ...(plan.caller.taskRun === undefined ? {} : { taskRun: plan.caller.taskRun }),
    toolUseMetaKey: deps.harness.toolUseMetaKey,
    parent: plan.caller.callSequence,
  });
}

interface GuestRoute {
  readonly sandbox: Sandbox;
  readonly url: string;
  readonly token: string;
}

function runGuest(
  deps: WorkerDeps,
  plan: WorkerPlan,
  run: WorkerRun,
  route: GuestRoute,
): Promise<GuestTurn> {
  const capabilities = deps.harness.capabilities;

  return runGuestTurn({
    harness: deps.harness,
    sandbox: route.sandbox,
    command: deps.command,
    turn: {
      type: 'turn',
      profile: buildRoutedModel({
        isRouted: deps.gateway !== undefined,
        profile: deps.profile,
        turnProfile: deps.harness.toTurnProfile('one-off'),
        sandboxName: route.sandbox.id,
      }).turnProfile,
      tools: { url: route.url, token: route.token },
      ...(deps.harness.session === null ? {} : { resume: null }),
      systemPrompt: workerSystemPrompt,
      limits: {
        modelCalls: capabilities.has('turn-limit') ? plan.limits.turns : null,
        toolCallWaitMs: deps.harness.toolCallWaitMs,
      },
      input: [{ uuid: crypto.randomUUID(), text: plan.question }],
    },
    messages: [],
    signal: run.stops.hard,
    ...(capabilities.has('interrupt') ? { interrupt: run.stops.interrupt } : {}),
    onCall: (usage, replies) => runCall(deps, plan, run, { usage, text: replies.text }),
  });
}

interface WorkerCall {
  readonly usage: ModelCallUsage;
  readonly text: string;
}

// One model call ends: its record goes in at once, so a crash misses at most the call that runs,
// and the calling turn's budget takes its dollars.
async function runCall(
  deps: WorkerDeps,
  plan: WorkerPlan,
  run: WorkerRun,
  call: WorkerCall,
): Promise<void> {
  const prices = deps.profile.profile.prices;
  const dollars = prices === null ? 0 : buildCallCost(call.usage, prices);

  run.tally.turns += 1;

  run.tally.tokens +=
    call.usage.uncachedInputTokens +
    call.usage.cacheReadTokens +
    call.usage.cacheWrite5mTokens +
    call.usage.cacheWrite1hTokens +
    call.usage.outputTokens;

  run.tally.dollars += dollars;

  await writeWorkerTurnEnded(deps, plan, run.names, {
    turn: run.tally.turns,
    usage: call.usage,
    dollars,
    text: call.text,
  });

  plan.hold.onSpend(dollars);

  if (run.tally.tokens >= plan.limits.tokens) {
    run.stops.trip('tokens');
  } else if (run.tally.dollars >= plan.limits.dollars) {
    run.stops.trip('dollars');
  }
}

function summarizeTurn(turn: GuestTurn): WorkerTurnFacts {
  return {
    ended: turn.ended.at(-1)?.outcome ?? null,
    failure: turn.failure === null ? null : turn.failure.detail,
    answer: turn.assistants.at(-1)?.text.trim() ?? '',
  };
}

// The gateway's count of the worker's sandbox, or null when it counts none or does not answer.
async function readGatewayCount(deps: WorkerDeps, run: WorkerRun): Promise<SandboxCount | null> {
  const sandbox = run.held.sandbox;

  if (deps.gateway === undefined || sandbox === null) {
    return null;
  }

  const read = await deps.gateway.readSandbox(sandbox.id);

  if (read.kind === 'ok') {
    return read.value;
  }

  deps.logger(
    'worker.gateway_read_failed',
    { workerRunID: run.names.workerRunID, outcome: read.kind },
    'warn',
  );

  return null;
}

function buildUsed(
  deps: WorkerDeps,
  plan: WorkerPlan,
  run: WorkerRun,
  count: SandboxCount | null,
): WorkerUsed {
  const minutes = (deps.clock.now() - plan.calledAt) / 60_000;

  return {
    minutes: Math.round(minutes * 10) / 10,
    turns: run.tally.turns,
    tokens: count === null ? run.tally.tokens : Math.round(count.tokens),
    dollars: count === null ? run.tally.dollars : count.dollars,
  };
}

// A run that the calling step's signal aborted has no result: its call rejects.
function toResult(
  plan: WorkerPlan,
  run: WorkerRun,
  end: WorkerEnd,
  used: WorkerUsed,
): WorkerResult {
  if (end.outcome === 'aborted') {
    throw plan.hold.signal.reason ?? new Error('the calling step ended');
  }

  if (end.outcome === 'answered') {
    return { kind: 'answered', shortID: run.names.shortID, answer: end.answer, used };
  }

  return {
    kind: 'stopped',
    sentence: renderWorkerEnd(end, {
      shortID: run.names.shortID,
      used,
      limits: plan.limits,
      isTaskLimit: plan.isTaskLimit,
    }),
  };
}

// Safe to run twice. The tool run stops first, so no call of the worker lands after the end record,
// then the sandbox goes, and the slot frees when its destroy ends.
async function releaseWorkerRun(deps: WorkerDeps, run: WorkerRun): Promise<void> {
  const held = run.held;
  const endpoint = held.endpoint;
  const sandbox = held.sandbox;
  const lateSandbox = held.lateSandbox;
  const release = held.release;

  run.stops.close();

  run.held.endpoint = null;
  run.held.sandbox = null;
  run.held.lateSandbox = null;
  run.held.release = null;

  if (endpoint !== null) {
    try {
      await endpoint.stop();
    } catch (error) {
      deps.logger('worker.endpoint_stop_failed', toErrorFields(error), 'error');
    }
  }

  const free = release ?? (() => {});

  if (sandbox !== null) {
    startWorkerRemoval(deps, sandbox, free);

    return;
  }

  free();

  if (lateSandbox !== null) {
    void removeLateSandbox(deps, lateSandbox);
  }
}

// A create that a stop beat may still hand over a sandbox, which goes at once. The slot is already
// free, because a create that never returns must not hold it.
async function removeLateSandbox(deps: WorkerDeps, creating: Promise<Sandbox>): Promise<void> {
  const late = await creating.catch(() => null);

  if (late !== null) {
    startWorkerRemoval(deps, late, () => {});
  }
}
