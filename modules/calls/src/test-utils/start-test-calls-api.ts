import { defaultAPISettings } from '@heynixie/api';
import { startTestAPI } from '@heynixie/api/test-utils';
import invariant from 'tiny-invariant';
import { createCallsProcedures } from '../api/create-calls-procedures';
import { callsProjection } from '../projection/calls-projection';
import type { TestCallsContext, TestCallsOptions } from './start-test-calls';
import { buildTestCallsContext } from './start-test-calls';

// The API of a nixie whose config has the voice section: the calls procedures run over a calls
// context on the fake speech layer, and the log folds the call records.
export async function startTestCallsAPI(options: TestCallsOptions) {
  const built: TestCallsContext[] = [];

  const api = await startTestAPI(defaultAPISettings, {
    projections: [callsProjection],
    extend: (base) => {
      const calls = buildTestCallsContext(base, options);

      built.push(calls);

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
