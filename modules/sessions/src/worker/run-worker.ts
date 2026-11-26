import { createShortID } from '@heynixie/db';
import { toErrorFields } from '@heynixie/logger';
import { buildCallCost } from '@heynixie/models';
import type { Sandbox } from '@heynixie/sandbox';
import { buildSandboxSpec, buildWorkerRunOwner } from '@heynixie/sandbox';
import type { SandboxCount } from '@heynixie/spend';
import { checkSpendTurns } from '@heynixie/spend';
import { readTaskGateSnapshot } from '@heynixie/tasks';
import type { RunEndpoint } from '@heynixie/tools';
import type { ModelCallUsage } from '@heynixie/wire';
import invariant from 'tiny-invariant';
import { resolvePlanTurnProfile } from '../turn/resolve-plan-turn-profile';
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
import { writeWorkerGatewayCharged } from './write-worker-gateway-charged';
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

  // the gateway counts the sandbox, so the run may have spent on it
  isRegistered: boolean;
  isStarted: boolean;

  // the calling task's sandbox gave this run's planned dollars up, which the end gives back
  isReserved: boolean;
  stage: 'starting' | 'running';
}

interface WorkerRun {
  readonly names: WorkerRunNames;
  readonly stops: WorkerStops;
  readonly tally: Tally;
  readonly held: Held;

  // what the run charges the calling task, which the end of the run sets
  chargedDollars: number;
}

// Runs one worker for the call that planWorkerRun planned. Every way out passes the one block at
// the end, which frees the minutes, the stops, the tool run, the slot and the sandbox. The slot
// frees when the sandbox's destroy ends, which goes on after the call has its result.
export async function runWorker(deps: WorkerDeps, plan: WorkerPlan): Promise<WorkerResult> {
  const run: WorkerRun = {
    names: {
      workerRunID: crypto.randomUUID(),
      shortID: createShortID(),
      model: plan.target.profile.profile.model,
      profile: plan.target.profile.profile.id,
    },
    stops: createWorkerStops(deps.clock, plan),
    tally: { turns: 0, tokens: 0, dollars: 0 },
    held: {
      release: null,
      sandbox: null,
      lateSandbox: null,
      endpoint: null,
      isRegistered: false,
      isStarted: false,
      isReserved: false,
      stage: 'starting',
    },
    chargedDollars: 0,
  };

  try {
    return await runOpenWorker(deps, plan, run);
  } finally {
    await giveBackReservation(plan, run);
    await releaseWorkerRun(deps, run);
  }
}

const spendStoppedResult: WorkerResult = {
  kind: 'stopped',
  sentence:
    'Model spending is stopped, so nixie started no worker. Every task resumes when the stop clears.',
};

const unreservedResult: WorkerResult = {
  kind: 'stopped',
  sentence:
    'The model gateway did not answer, so nixie could not set aside the dollars of a worker and started none.',
};

async function runOpenWorker(
  deps: WorkerDeps,
  plan: WorkerPlan,
  run: WorkerRun,
): Promise<WorkerResult> {
  const isStoppedAtCall = await probeSpendStopped(deps, plan);

  if (isStoppedAtCall) {
    return spendStoppedResult;
  }

  const grant = await waitForSlot(deps, run);

  if (grant !== 'stopped' && grant.kind === 'full') {
    return {
      kind: 'stopped',
      sentence: `${String(grant.max)} workers already run, which is the most at once, so nixie started none. Call again when one of yours has returned.`,
    };
  }

  if (grant !== 'stopped') {
    run.held.release = grant.release;

    // the stop can trip while the call waits for its slot
    const isStoppedAtSlot = await probeSpendStopped(deps, plan);

    if (isStoppedAtSlot) {
      return spendStoppedResult;
    }
  }

  await ensureStarted(deps, plan, run);

  if (grant !== 'stopped' && !(await reserveDollars(plan, run))) {
    return unreservedResult;
  }

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

  const count = await readGatewayCount(deps, plan, run);

  await chargeGatewayExcess(deps, plan, run, count);

  run.chargedDollars = Math.max(run.tally.dollars, count?.dollars ?? 0);

  const end = pickGatewayEnd(stagesEnd, count, plan.limits);
  const used = buildUsed(deps, plan, run, count);

  await writeWorkerRunEnded(deps, plan, run.names, { end, used });

  return toResult(plan, run, end, used);
}

// The gate of the task whose step started the worker: for a conversation step, the conversation's.
async function probeSpendStopped(deps: WorkerDeps, plan: WorkerPlan): Promise<boolean> {
  if (deps.spend !== undefined) {
    await checkSpendTurns(deps.spend);
  }

  const gate = await readTaskGateSnapshot(deps, plan.caller.thread);

  return !gate.open && gate.reason === 'spend';
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

// The calling task's sandbox gives the run's planned dollars up before the run starts, so the task
// and its worker never spend the same dollars.
async function reserveDollars(plan: WorkerPlan, run: WorkerRun): Promise<boolean> {
  if (plan.hold.onWorkerStart === undefined) {
    return true;
  }

  const isReserved = await plan.hold.onWorkerStart(plan.limits.dollars);

  run.held.isReserved = isReserved;

  return isReserved;
}

// Never throws: each way the stages end is a worker end.
async function runStages(deps: WorkerDeps, plan: WorkerPlan, run: WorkerRun): Promise<WorkerEnd> {
  const state: { turn: WorkerTurnFacts | null; error: string | null } = {
    turn: null,
    error: null,
  };

  try {
    await raceStop(removeFailedDestroys(deps), run.stops.hard);

    run.held.sandbox = await createSandbox(deps, plan, run);

    await registerGatewaySandbox(deps, plan, run.held.sandbox);

    run.held.isRegistered = deps.gateway !== undefined;

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
async function createSandbox(deps: WorkerDeps, plan: WorkerPlan, run: WorkerRun): Promise<Sandbox> {
  const creating = deps.sandboxes.create(
    buildSandboxSpec({
      kind: 'worker',
      image: plan.target.image,
      owner: buildWorkerRunOwner(run.names.workerRunID),
      limits: plan.target.size,
      modelGrant: plan.target.modelGrant,
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
    toolUseMetaKey: plan.target.harness.toolUseMetaKey,
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
  const capabilities = plan.target.harness.capabilities;

  const routed = buildRoutedModel({
    isRouted: deps.gateway !== undefined,
    profile: plan.target.profile,
    turnProfile: plan.target.harness.toTurnProfile('one-off'),
    sandboxName: route.sandbox.id,
  });

  return runGuestTurn({
    harness: plan.target.harness,
    sandbox: route.sandbox,
    command: plan.target.command,
    turn: {
      type: 'turn',
      profile: resolvePlanTurnProfile({
        turnProfile: routed.turnProfile,
        profile: plan.target.profile.profile,
        spend: deps.spend,
      }),
      tools: { url: route.url, token: route.token },
      ...(plan.target.harness.session === null ? {} : { resume: null }),
      systemPrompt: workerSystemPrompt,
      limits: {
        modelCalls: capabilities.has('turn-limit') ? plan.limits.turns : null,
        toolCallWaitMs: plan.target.harness.toolCallWaitMs,
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
  const prices = plan.target.profile.profile.prices;
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

// A model may end its reply with a reasoning block, which the CLI sends as a message of its own with
// no text and no tool use, so the answer comes from the last message that holds either.
function summarizeTurn(turn: GuestTurn): WorkerTurnFacts {
  const reply = turn.assistants.findLast(
    (assistant) => assistant.text !== '' || assistant.toolUses.length > 0,
  );

  return {
    ended: turn.ended.at(-1)?.outcome ?? null,
    failure: turn.failure === null ? null : turn.failure.detail,
    answer: reply?.text.trim() ?? '',
  };
}

// The gateway's count of the worker's sandbox, or null when no gateway counts. When the gateway does
// not answer, the count is the planned limit, where the gateway starts to refuse the sandbox, because
// the guest's own tally can miss spend that the calling task must still pay.
async function readGatewayCount(
  deps: WorkerDeps,
  plan: WorkerPlan,
  run: WorkerRun,
): Promise<SandboxCount | null> {
  const sandbox = run.held.sandbox;

  if (deps.gateway === undefined || sandbox === null || !run.held.isRegistered) {
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

  return {
    dollars: Math.max(plan.limits.dollars, run.tally.dollars),
    tokens: Math.max(plan.limits.tokens, run.tally.tokens),
    tripped: false,
    lastRefusal: null,
  };
}

// The gateway's dollars are the count that holds, so the calling task pays what the guest's own
// usage reports left out. The excess goes in a record too, so a later step's meter counts it.
async function chargeGatewayExcess(
  deps: WorkerDeps,
  plan: WorkerPlan,
  run: WorkerRun,
  count: SandboxCount | null,
): Promise<void> {
  if (count === null || count.dollars <= run.tally.dollars) {
    return;
  }

  const excess = count.dollars - run.tally.dollars;

  await writeWorkerGatewayCharged(deps, plan, run.names, excess);

  plan.hold.onSpend(excess);
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

// Every way out of a run that reserved dollars gives them back, and takes off what the run charged.
async function giveBackReservation(plan: WorkerPlan, run: WorkerRun): Promise<void> {
  if (!run.held.isReserved) {
    return;
  }

  run.held.isReserved = false;

  await plan.hold.onWorkerEnd?.({
    plannedDollars: plan.limits.dollars,
    chargedDollars: Math.max(run.chargedDollars, run.tally.dollars),
  });
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
