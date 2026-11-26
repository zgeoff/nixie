import { toMicrosUp } from '@heynixie/budgets';
import type { Logger } from '@heynixie/logger';
import type { ModelPrices } from '@heynixie/models';
import type { SpendGateway } from '@heynixie/spend';
import { pickSandboxLimit } from '@heynixie/spend';
import type { TaskLimits, TaskMeterReadReason, TaskRun, TasksContext } from '@heynixie/tasks';
import { readMeterReads, writeMeterRead } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import type { CallBudget } from '../create-call-budget';
import { createCallBudget } from '../create-call-budget';
import { readRunUsage } from '../read-run-usage';
import { createGatewayBudget } from './create-gateway-budget';
import { patchSandboxLimit } from './patch-sandbox-limit';

export interface StepMeterDeps {
  readonly context: TasksContext;
  readonly gateway: SpendGateway | undefined;
  readonly logger: Logger;
}

export interface StepMeterFacts {
  readonly taskRun: TaskRun;

  // what the task run used when the step began
  readonly used: TaskLimits;

  // the profile's prices, which a task run without a gateway prices the guest's calls by
  readonly prices: ModelPrices | null;
}

// 'ready': the turn may run, under the budget. 'held': the gateway did not answer, so the step does
// not start. 'limit': the read shows the task run at its dollar limit, so the step runs no turn.
export type StepBegin =
  | { readonly kind: 'ready'; readonly budget: CallBudget }
  | { readonly kind: 'held' }
  | { readonly kind: 'limit'; readonly used: TaskLimits };

export interface StepEnd {
  readonly isLimitReached: boolean;

  // whether the gateway's sandbox refused a request since the step began, which ends the step at the
  // dollar limit even when its guest turn threw
  readonly isRefused: boolean;
  readonly used: TaskLimits;
}

export interface StepMeter {
  // before the step's turn, once the step's sandbox is awake: the read of the sandbox that starts
  // the task run or the step
  readonly begin: (sandboxID: string) => Promise<StepBegin>;

  // after the turn, whether or not it threw: the read of the sandbox that ends the step. A sandbox
  // that refused a request at or after the instant ended the step at the dollar limit.
  readonly end: (sandboxID: string, startedAtMs: number) => Promise<StepEnd>;
}

// A task run's meter is the one its start record names. A task run that began before the start
// record named a meter keeps pricing its turn from the runner's own tally, and records no read.
export function createStepMeter(deps: StepMeterDeps, facts: StepMeterFacts): StepMeter {
  const meter = facts.taskRun.opened.meter;

  if (meter === 'gateway') {
    invariant(deps.gateway !== undefined, 'a task run that the gateway counts needs the gateway');

    return createGatewayStepMeter({ ...deps, gateway: deps.gateway }, facts);
  }

  return createRecordsStepMeter(deps, facts, meter === 'records');
}

interface GatewayMeterDeps extends StepMeterDeps {
  readonly gateway: SpendGateway;
}

function createGatewayStepMeter(deps: GatewayMeterDeps, facts: StepMeterFacts): StepMeter {
  const taskRun = facts.taskRun;
  const taskID = taskRun.taskID;
  const limits = taskRun.opened.limits;

  const write = (sandbox: string, reason: TaskMeterReadReason, countMicros: number) =>
    writeMeterRead(deps.context, {
      taskID,
      taskRunID: taskRun.runID,
      sandbox,
      reason,
      countMicros,
    });

  // The count that the gateway holds for the sandbox, or null when it did not answer
  const readCount = async (sandboxID: string, reason: TaskMeterReadReason) => {
    const read = await deps.gateway.readSandbox(sandboxID);

    if (read.kind !== 'ok') {
      deps.logger(
        'task.meter_read_failed',
        { taskID, sandboxID, reason, outcome: read.kind },
        'warn',
      );

      return null;
    }

    return read.value;
  };

  return {
    begin: async (sandboxID) => {
      const count = await readCount(sandboxID, 'step_start');

      if (count === null) {
        return { kind: 'held' };
      }

      const startMicros = toMicrosUp(count.dollars);

      const reads = await readMeterReads(deps.context, taskRun);

      const reason = reads.length === 0 ? 'run_start' : 'step_start';

      await write(sandboxID, reason, startMicros);

      const usage = await readRunUsage(deps.context, taskRun);

      const leftDollars = limits.dollars - usage.used.dollars;

      if (leftDollars <= 0) {
        return { kind: 'limit', used: usage.used };
      }

      const setLeftDollars = (left: number) =>
        patchSandboxLimit(
          deps.gateway,
          sandboxID,
          pickSandboxLimit({ startMicros, leftDollars: left }),
        );

      if (!(await setLeftDollars(leftDollars))) {
        return { kind: 'held' };
      }

      const readWorkerEnd = async () => {
        const read = await readCount(sandboxID, 'worker_end');

        if (read !== null) {
          await write(sandboxID, 'worker_end', toMicrosUp(read.dollars));
        }
      };

      return {
        kind: 'ready',
        budget: createGatewayBudget({ leftDollars, setLeftDollars, readWorkerEnd }),
      };
    },
    end: async (sandboxID, startedAtMs) => {
      const count = await readCount(sandboxID, 'step_end');

      if (count !== null) {
        await write(sandboxID, 'step_end', toMicrosUp(count.dollars));
      }

      const usage = await readRunUsage(deps.context, taskRun);

      const isRefused = isRefusedBySandbox(count, startedAtMs);

      return { isLimitReached: isRefused, isRefused, used: usage.used };
    },
  };
}

// A sandbox that reached its own limit refuses each request, so a step that the sandbox refused
// since it began ended at the task run's dollar limit.
function isRefusedBySandbox(
  count: {
    readonly lastRefusal: { readonly counter: string; readonly atMs: number } | null;
  } | null,
  startedAtMs: number,
): boolean {
  const refusal = count?.lastRefusal ?? null;

  return refusal !== null && refusal.counter === 'sandbox' && refusal.atMs >= startedAtMs;
}

// Without a gateway the runner prices the guest's call frames with the profile's table, and the
// reads carry its running tally under the task's own ID, because no sandbox holds a count.
function createRecordsStepMeter(
  deps: StepMeterDeps,
  facts: StepMeterFacts,
  isRecorded: boolean,
): StepMeter {
  const taskRun = facts.taskRun;
  const taskID = taskRun.taskID;
  const prices = facts.prices;

  invariant(prices !== null, `the profile of task ${taskID} sets no prices`);

  const write = (reason: TaskMeterReadReason, countMicros: number) =>
    isRecorded
      ? writeMeterRead(deps.context, {
          taskID,
          taskRunID: taskRun.runID,
          sandbox: taskID,
          reason,
          countMicros,
        })
      : Promise.resolve();

  let baseMicros = 0;
  let budget: CallBudget | undefined;
  const readTallyMicros = () => baseMicros + toMicrosUp(budget?.getSpentDollars() ?? 0);

  return {
    begin: async () => {
      const reads = await readMeterReads(deps.context, taskRun);

      baseMicros = Math.max(
        0,
        ...reads.filter((read) => read.sandbox === taskID).map((read) => read.countMicros),
      );

      const reason = reads.length === 0 ? 'run_start' : 'step_start';

      await write(reason, baseMicros);

      const leftDollars = taskRun.opened.limits.dollars - facts.used.dollars;

      if (leftDollars <= 0) {
        return { kind: 'limit', used: facts.used };
      }

      const called = createCallBudget(prices, leftDollars);

      budget = called;

      return {
        kind: 'ready',
        budget: {
          ...called,
          onWorkerStart: () => Promise.resolve(true),
          onWorkerEnd: () => write('worker_end', readTallyMicros()),
        },
      };
    },
    end: async () => {
      invariant(budget !== undefined, 'a step ends after it began');

      await write('step_end', readTallyMicros());

      const read = isRecorded ? await readRunUsage(deps.context, taskRun) : null;

      const used = read?.used ?? {
        turns: facts.used.turns,
        dollars: facts.used.dollars + budget.getSpentDollars(),
      };

      return { isLimitReached: budget.signal.aborted, isRefused: false, used };
    },
  };
}
