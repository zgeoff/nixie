import { expect, test } from 'bun:test';
import { startGoogleConnections } from '../test-utils/start-google-connections';

test('it sets the picker key and the project number, and clears both with null', async () => {
  const ctx = await startGoogleConnections();

  await ctx.connections.setPicker(ctx.client, {
    pickerKey: 'AIzaKey',
    projectNumber: '123456789012',
  });

  const set = await ctx.connections.readSetup('https://nixie.example.org');

  await ctx.connections.setPicker(ctx.client, null);

  const cleared = await ctx.connections.readSetup('https://nixie.example.org');

  expect([
    [set.client?.pickerKey, set.client?.projectNumber],
    [cleared.client?.pickerKey, cleared.client?.projectNumber],
  ]).toStrictEqual([
    ['AIzaKey', '123456789012'],
    [null, null],
  ]);
});

test('it answers an unknown client, and records a change with the client alone', async () => {
  const ctx = await startGoogleConnections();
  const unknown = await ctx.connections.setPicker('unknownclient', null);

  await ctx.connections.setPicker(ctx.client, { pickerKey: 'AIzaKey', projectNumber: '1' });

  const records = await ctx.readRecordPayloads('connection.picker_set');

  expect([unknown, records]).toStrictEqual([
    { kind: 'client_not_found' },
    [{ client: ctx.client }],
  ]);
});

test('it keeps the picker as it was when the step that stores the outcome fails', async () => {
  const ctx = await startGoogleConnections();

  const settled = ctx.connections.setPicker(
    ctx.client,
    { pickerKey: 'AIzaKey', projectNumber: '123456789012' },
    { isRetry: false, settle: () => Promise.reject(new Error('the outcome could not be stored')) },
  );

  await Promise.allSettled([settled]);

  const setup = await ctx.connections.readSetup('https://nixie.example.org');

  expect([setup.client?.pickerKey, setup.client?.projectNumber]).toStrictEqual([null, null]);
});
