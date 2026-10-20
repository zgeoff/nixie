import { expect, mock, test } from 'bun:test';
import type { HostContractClient } from '@heynixie/contract';
import { createORPCClient } from '@orpc/client';
import { RPCLink } from '@orpc/client/fetch';
import { makeHostResponder } from './make-host-responder';
import { startTestAPI } from './test-utils/start-test-api';

function setupTest() {
  return startTestAPI();
}

test('it answers a host procedure call with its output, dates included', async () => {
  const ctx = await setupTest();

  const respond = makeHostResponder({
    context: ctx.context,
    readMemory: () => null,
    runReset: () =>
      Promise.resolve({
        resetAt: new Date('2026-10-11T12:15:00.000Z'),
        lastSequence: 42,
        keptSessions: 2,
      }),
  });

  const client = createORPCClient<HostContractClient>(
    new RPCLink({ url: 'http://localhost/rpc', fetch: respond }),
  );

  const reset = await client.reset();

  expect(reset).toStrictEqual({
    resetAt: new Date('2026-10-11T12:15:00.000Z'),
    lastSequence: 42,
    keptSessions: 2,
  });
});

test('it answers 404 to a request outside the procedures', async () => {
  const ctx = await setupTest();

  const respond = makeHostResponder({
    context: ctx.context,
    readMemory: () => null,
    runReset: mock(),
  });

  const response = await respond(
    new Request('http://localhost/enrolment-codes', { method: 'POST' }),
  );

  expect(response.status).toBe(404);
});

test('it answers 500 with the reason when a procedure fails', async () => {
  const ctx = await setupTest();

  const respond = makeHostResponder({
    context: ctx.context,
    readMemory: () => null,
    runReset: () => Promise.reject(new Error('the database is locked')),
  });

  const client = createORPCClient<HostContractClient>(
    new RPCLink({ url: 'http://localhost/rpc', fetch: respond }),
  );

  const reset = client.reset();

  await reset.catch(() => {});

  expect(reset).rejects.toMatchObject({
    code: 'INTERNAL_SERVER_ERROR',
    status: 500,
    message: 'the database is locked',
  });
});

test('it answers 503 to a memory procedure before the memory store starts', async () => {
  const ctx = await setupTest();

  const respond = makeHostResponder({
    context: ctx.context,
    readMemory: () => null,
    runReset: mock(),
  });

  const client = createORPCClient<HostContractClient>(
    new RPCLink({ url: 'http://localhost/rpc', fetch: respond }),
  );

  const listed = client.memory.proposals.list();

  await listed.catch(() => {});

  expect(listed).rejects.toMatchObject({ code: 'MEMORY_NOT_STARTED', status: 503 });
});
