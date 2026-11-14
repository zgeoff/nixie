import { join } from 'node:path';
import type { CloseCapturesOptions } from './capture/close-captures';
import { closeCaptures } from './capture/close-captures';
import { openCapture } from './capture/open-capture';
import { runIntakeTick } from './intake/run-intake-tick';
import type { TurnInputList } from './reading/list-turn-inputs';
import { listTurnInputs } from './reading/list-turn-inputs';
import type { OpenTurnInputResult } from './reading/open-turn-input';
import { openTurnInput } from './reading/open-turn-input';
import type { ForgetScope } from './removal/pick-forgotten-inputs';
import { removeForgottenInputs } from './removal/remove-forgotten-inputs';
import { runStartRepair } from './removal/run-start-repair';
import { runTurnInputSweep } from './removal/run-turn-input-sweep';
import { runTurnInputsReset } from './removal/run-turn-inputs-reset';
import type { InputLogSetting } from './state/pick-input-log-state';
import { readInputLogState } from './state/read-input-log-state';
import type { SetInputLogRequest, SetInputLogResult } from './state/set-input-log';
import { setInputLog } from './state/set-input-log';
import type { Capture, OpenCaptureInput, TurnInputsContext, TurnInputsOptions } from './types';
import { createLane } from './utils/create-lane';
import type { Interval } from './utils/start-interval';
import { startInterval } from './utils/start-interval';

export interface TurnInputsWork {
  readonly stop: () => Promise<void>;
}

export interface TurnInputs {
  readonly openCapture: (input: OpenCaptureInput) => Promise<Capture>;
  readonly closeCaptures: (options: CloseCapturesOptions) => Promise<void>;

  // removes the requests a forget covers, and throws when one could not be removed
  readonly removeForgotten: (scope: ForgetScope) => Promise<void>;
  readonly list: (limit: number) => Promise<TurnInputList>;
  readonly open: (inputID: string) => Promise<OpenTurnInputResult>;
  readonly set: (request: SetInputLogRequest) => Promise<SetInputLogResult>;
  readonly readState: () => Promise<InputLogSetting>;

  // before the first step: asks each gateway and repairs what a stop left behind
  readonly runStart: () => Promise<void>;
  readonly runSweep: () => Promise<void>;
  readonly runReset: () => Promise<void>;

  // the intake each second while a capture is open, and the sweep every 10 minutes
  readonly startWork: () => TurnInputsWork;
}

export function createTurnInputs(options: TurnInputsOptions): TurnInputs {
  const ctx: TurnInputsContext = {
    ...options,
    lane: createLane(),
    open: new Map(),
    answers: new Map(),
    failures: new Map(),
    storeDir: join(options.log.writer.dataDir, 'turn-inputs'),
  };

  return {
    openCapture: (input) => openCapture(ctx, input),
    closeCaptures: (closeOptions) => closeCaptures(ctx, closeOptions),
    removeForgotten: (scope) => removeForgottenInputs(ctx, scope),
    list: (limit) => listTurnInputs(ctx, limit),
    open: (inputID) => openTurnInput(ctx, inputID),
    set: (request) => setInputLog(ctx, request),
    readState: () => readInputLogState(ctx),
    runStart: () => runStartRepair(ctx),
    runSweep: () => ctx.lane.run(() => runTurnInputSweep(ctx)),
    runReset: () => runTurnInputsReset(ctx),
    startWork: () => startWork(ctx),
  };
}

const intakeMs = 1000;
const sweepMs = 10 * 60 * 1000;

function startWork(ctx: TurnInputsContext): TurnInputsWork {
  const onError = () => {
    ctx.logger('turn_input.work_failed', { reason: 'tick' }, 'warn');
  };

  const intervals: readonly Interval[] = [
    startInterval({
      clock: ctx.clock,
      intervalMs: intakeMs,
      run: () => runIntakeTick(ctx),
      onError,
    }),
    startInterval({
      clock: ctx.clock,
      intervalMs: sweepMs,
      run: () => ctx.lane.run(() => runTurnInputSweep(ctx)),
      onError,
    }),
  ];

  return {
    stop: async () => {
      await Promise.all(intervals.map((interval) => interval.stop()));
    },
  };
}
