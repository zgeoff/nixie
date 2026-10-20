import { expect, test } from 'bun:test';
import { createRouterClient } from '@orpc/server';
import { claimEnrolmentCode } from './claim-enrolment-code';
import { createHostSessionProcedures } from './create-host-session-procedures';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  return { ...api, client: createRouterClient(createHostSessionProcedures(api.context)) };
}

test('#issueCode issues a code that enrols one device, until its lapse time', async () => {
  const ctx = await setupTest();
  const issued = await ctx.client.issueCode();

  const enrolled = await claimEnrolmentCode(ctx.context, {
    clientActionID: '0b9d8f0e-6f1c-4d2a-9b7e-3c5a1d2e4f60',
    code: issued.code,
    deviceName: 'phone',
    tokenDelivery: 'bearer',
  });

  expect(issued.expiresAt).toStrictEqual(new Date(1_000_000 + 15 * 60 * 1000));
  expect(enrolled.status).toBe('enrolled');
});

test('#list lists every live device session, oldest first, with none marked current', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  ctx.clock.advance(1);

  const phone = await createDeviceSession(ctx.context, 'phone');
  const sessions = await ctx.client.list();

  expect(sessions).toStrictEqual([
    {
      sessionID: laptop.sessionID,
      deviceName: 'laptop',
      createdAt: new Date(1_000_000),
      lastUsedAt: new Date(1_000_000),
    },
    {
      sessionID: phone.sessionID,
      deviceName: 'phone',
      createdAt: new Date(1_000_001),
      lastUsedAt: new Date(1_000_001),
    },
  ]);
});

test('#label sets the label of a session and answers with the label it kept', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const labelled = await ctx.client.label({
    sessionID: laptop.sessionID,
    label: '  work   laptop ',
  });

  expect(labelled).toStrictEqual({ sessionID: laptop.sessionID, label: 'work laptop' });
});

test('#label refuses a session that is not signed in with SESSION_NOT_FOUND', async () => {
  const ctx = await setupTest();

  const labelled = ctx.client.label({
    sessionID: '0b8f1d2e-4c6a-4e9b-8d3f-1a2b3c4d5e6f',
    label: 'work',
  });

  await labelled.catch(() => {});

  expect(labelled).rejects.toMatchObject({
    code: 'SESSION_NOT_FOUND',
    status: 404,
    message: 'no device session that is still signed in has that ID',
  });
});

test('#label refuses a label of only spaces with LABEL_INVALID', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.context, 'laptop');

  const labelled = ctx.client.label({ sessionID: laptop.sessionID, label: '   ' });

  await labelled.catch(() => {});

  expect(labelled).rejects.toMatchObject({
    code: 'LABEL_INVALID',
    status: 400,
    message: 'a label holds 1 to 100 characters besides spaces',
  });
});

test('#label refuses a request with no session ID as a bad request', async () => {
  const ctx = await setupTest();

  const labelled = ctx.client.label({ sessionID: '', label: 'work' });

  await labelled.catch(() => {});

  expect(labelled).rejects.toMatchObject({ code: 'BAD_REQUEST', status: 400 });
});
