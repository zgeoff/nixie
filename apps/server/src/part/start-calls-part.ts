import type { CallsContext } from '@heynixie/calls';
import invariant from 'tiny-invariant';
import { buildServerCalls } from '../call/build-server-calls';
import { buildServerSpeech } from '../call/build-server-speech';
import type { ServerContext } from '../server/create-server-context';
import { buildTaskMessaging } from '../utils/build-task-messaging';
import { harnessSpeech } from './harness-speech';
import type { ServerInputs } from './server-inputs';

export interface CallsPart {
  readonly context: CallsContext;
}

// The calls module, which starts only with the voice section. Without a speech layer, a call
// refuses to start.
export function startCallsPart(inputs: ServerInputs, context: ServerContext): CallsPart {
  const options = inputs.options;
  const voice = options.config.voice;
  const api = context.apiContext;

  invariant(voice !== undefined, 'the calls part starts only with a voice section');
  invariant(api.budgets !== undefined, 'the server holds the budgets that a call counts against');
  invariant(api.queueRunnerActions !== undefined, 'the server holds the queue runner actions');

  return {
    context: buildServerCalls({
      log: api.log,
      clock: api.clock,
      definitions: api.definitions,
      budgets: api.budgets,
      inForce: context.inForce,
      voice,
      logEvent: options.log,
      speech:
        options.speech ??
        (NIXIE_TEST_BUILD && options.harness !== undefined ? harnessSpeech : null) ??
        buildServerSpeech({
          voice,
          credentials: options.credentials,
          clock: options.writer.clock,
          logEvent: options.log,
        }),
      messaging: buildTaskMessaging(options.config),
      tasks: {
        log: api.log,
        clock: api.clock,
        definitions: api.definitions,
        runSettings: api.runSettings,
        runners: api.runners,
        queueRunnerActions: api.queueRunnerActions,
      },
    }),
  };
}
