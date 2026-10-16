import { expect, onTestFinished, test } from 'bun:test';
import { ORPCError, createImpClient } from '@zgeoff/imp-client';
import { startStubImpd } from './start-stub-impd';

test('it refuses a call with the error in the envelope the imp client reads', () => {
  const url = startStubImpd({
    code: 'RAM_BUDGET_EXCEEDED',
    status: 503,
    message: 'Not enough RAM budget, even after sleeping idle imps',
    data: { budgetMib: 4096, usedMib: 3584, requestedMib: 1024 },
  });

  const client = createImpClient({ url, token: 'not-a-real-token' });

  expect(client.imps.sleep({ name: 'nixie-b' })).rejects.toMatchObject({
    code: 'RAM_BUDGET_EXCEEDED',
    status: 503,
    message: 'Not enough RAM budget, even after sleeping idle imps',
    data: { budgetMib: 4096, usedMib: 3584, requestedMib: 1024 },
  });
});

test('it refuses with an oRPC error, as impd does', async () => {
  const url = startStubImpd({ code: 'NOT_FOUND', status: 404, message: 'no imp nixie-b' });
  const client = createImpClient({ url, token: 'not-a-real-token' });

  const failure = await client.imps.get({ name: 'nixie-b' }).catch((error: unknown) => error);

  expect(failure).toBeInstanceOf(ORPCError);
});

test('it stops listening once the test finishes', () => {
  const url = startStubImpd({ code: 'NOT_FOUND', status: 404, message: 'no imp nixie-b' });

  // registered after the stub's own stop, so it runs once the stub stopped
  onTestFinished(() => {
    expect(fetch(url)).rejects.toThrow();
  });
});
