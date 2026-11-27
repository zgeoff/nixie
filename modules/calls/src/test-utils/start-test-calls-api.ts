import { onTestFinished } from 'bun:test';
import { defaultAPISettings, sessionHooks } from '@heynixie/api';
import { startTestAPI } from '@heynixie/api/test-utils';
import invariant from 'tiny-invariant';
import { createCallsProcedures } from '../api/create-calls-procedures';
import { callsProjection } from '../projection/calls-projection';
import { buildCallSessionHook } from '../session/build-call-session-hook';
import type { TestCallsContext, TestCallsOptions } from './start-test-calls';
import { buildTestCallsContext } from './start-test-calls';

// The API of a nixie whose config has the voice section: the calls procedures run over a calls
// context on the fake speech layer, the call follows its session out, and the log folds the call
// records. The session hooks empty when the test ends.
export async function startTestCallsAPI(options: TestCallsOptions) {
  const built: TestCallsContext[] = [];

  const api = await startTestAPI(defaultAPISettings, {
    projections: [callsProjection],
    extend: (base) => {
      const calls = buildTestCallsContext(base, options);

      built.push(calls);
      sessionHooks.set([buildCallSessionHook(calls.context)]);

      onTestFinished(() => {
        sessionHooks.set([]);
      });

      return {
        readFeatureProcedures: () => ({
          calls: (context) => createCallsProcedures(calls.context, context),
        }),
      };
    },
  });

  const [calls] = built;

  invariant(calls !== undefined, 'the test turns calls on');

  return { ...api, calls };
}
