import { expect, test } from 'bun:test';
import { createDeviceSession } from '@heynixie/api/test-utils';
import { startTestCallsAPI } from './start-test-calls-api';

test('it mounts the calls procedures of the context it builds', async () => {
  const api = await startTestCallsAPI({});
  const owner = await createDeviceSession(api.context, 'phone');

  expect(api.context.readFeatureProcedures?.().calls).toBeFunction();
  expect(owner.token).toBeString();
});
