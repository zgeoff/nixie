import type { CallsContext, SpeechLayer, VoiceConfig } from '@heynixie/calls';
import { buildCallRuntime, defaultVoiceDefinitions, defaultVoicePrompt } from '@heynixie/calls';
import type { Clock } from '@heynixie/clock';
import type { Definitions, Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { TasksContext } from '@heynixie/tasks';
import { writeCallTask, writeTaskControl } from '@heynixie/tasks';
import type { InForce } from '../types';

export interface ServerCallsOptions {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
  readonly budgets: CallsContext['budgets'];
  readonly inForce: InForce;

  // the voice section of the config, or null without it, which turns calls off
  readonly voice: VoiceConfig | null;
  readonly logEvent: Logger;

  // null where the server wires no adapter
  readonly speech: SpeechLayer | null;

  // what the call's task and the cut of its turn need
  readonly tasks: Pick<
    TasksContext,
    'log' | 'clock' | 'definitions' | 'runSettings' | 'runners' | 'queueRunnerActions'
  >;
}

// The calls module's context. The server holds no speech adapter yet, so `calls.start` answers
// SPEECH_UNAVAILABLE for a configured voice unless a test build passes a speech layer.
export function buildServerCalls(options: ServerCallsOptions): CallsContext {
  return {
    log: options.log,
    clock: options.clock,
    definitions: options.definitions,
    logEvent: options.logEvent,
    budgets: options.budgets,
    voice: options.voice,
    speech: options.speech,
    readVoiceDefinitions: () => options.inForce.read()?.voice ?? defaultVoiceDefinitions,
    createTask: (tx, input) => writeCallTask(tx, options.tasks, input),
    readInstructions: () => Promise.resolve(defaultVoicePrompt),
    interruptTurn: async (taskID) => {
      await writeTaskControl(options.tasks, { taskID, control: 'interrupt' });
    },
    runtime: buildCallRuntime(),
    sessions: new Map(),
    openings: new Set(),
  };
}
