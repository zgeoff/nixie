import { budgetProjections, buildBuiltInBudgets } from '@heynixie/budgets';
import type { Clock } from '@heynixie/clock';
import type { Log, Writer } from '@heynixie/log';
import { logProjections } from '@heynixie/log';
import { startTestLog } from '@heynixie/log/test-utils';
import type { FakeClock } from '@zgeoff/testing/clock';
import { callsProjection } from '../projection/calls-projection';
import type { CallsContext, CreateCallTask, VoiceDefinitions } from '../types';
import { callBudgetName } from '../utils/call-budget-ids';
import { defaultVoiceDefinitions } from '../voice/voice-definitions-schema';
import type { FakeSpeechLayer } from './build-fake-speech-layer';
import { buildFakeSpeechLayer } from './build-fake-speech-layer';

export interface TestCallsOptions {
  // 'off' leaves the voice config out, which turns calls off
  readonly voice?: 'on' | 'off';

  // 'absent' wires no speech layer, as a server with no adapter does
  readonly speech?: 'wired' | 'absent';

  // the price per minute in micros that the voice definitions hold; null leaves it unset
  readonly pricePerMinuteMicros?: number | null;
}

export interface TestCallsContext {
  readonly context: CallsContext;
  readonly speech: FakeSpeechLayer;

  // each task that the seam created, in order
  readonly createdTasks: readonly (CreateCallTask & { readonly taskID: string })[];

  // each event that the calls module logged
  readonly logged: readonly { readonly event: string; readonly fields: unknown }[];
}

export interface TestCalls extends TestCallsContext {
  readonly writer: Writer;
  readonly log: Log;
  readonly clock: FakeClock;
}

export interface TestCallsParts {
  readonly log: Log;
  readonly clock: Clock;
}

// The calls context on a log that folds the budget and call records, with the fake speech layer
// and a call budget zone of UTC.
export function buildTestCallsContext(
  parts: TestCallsParts,
  options: TestCallsOptions = {},
): TestCallsContext {
  const definitions = { snapshotHash: 'sha256:aa11' };
  const speech = buildFakeSpeechLayer();
  const createdTasks: (CreateCallTask & { readonly taskID: string })[] = [];
  const logged: { event: string; fields: unknown }[] = [];

  const voice: VoiceDefinitions = {
    ...defaultVoiceDefinitions,
    pricePerMinuteMicros:
      options.pricePerMinuteMicros === undefined ? 50_000 : options.pricePerMinuteMicros,
  };

  const context: CallsContext = {
    log: parts.log,
    clock: parts.clock,
    definitions: () => definitions,
    logEvent: (event, fields) => {
      logged.push({ event, fields });
    },
    budgets: {
      log: parts.log,
      clock: parts.clock,
      zone: 'UTC',
      definitions: () => definitions,
      builtIn: () => buildBuiltInBudgets([callBudgetName]),
    },
    voice:
      options.voice === 'off'
        ? null
        : { provider: 'gpt-live', credential: 'deployment:speech_key' },
    speech: options.speech === 'absent' ? null : speech,
    readVoiceDefinitions: () => voice,
    createTask: (_tx, input) => {
      const taskID = crypto.randomUUID();

      createdTasks.push({ ...input, taskID });

      return Promise.resolve(taskID);
    },
    readInstructions: () => Promise.resolve('the voice-call prompt'),
    sessions: new Map(),
    openings: new Set(),
  };

  return { context, speech, createdTasks, logged };
}

// A log that folds the budget and call records, and the calls context on top. The clock starts at
// 09:00 UTC on 2026-10-16.
export async function startTestCalls(options: TestCallsOptions = {}): Promise<TestCalls> {
  const started = await startTestLog();

  const log: Log = {
    ...started.log,
    projections: [...logProjections, ...budgetProjections, callsProjection],
  };

  return {
    writer: started.writer,
    log,
    clock: started.clock,
    ...buildTestCallsContext({ log, clock: started.clock }, options),
  };
}
