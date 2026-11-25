import { expect, test } from 'bun:test';
import { buildActionAttempt } from '../test-utils/build-action-attempt';
import { buildActionConnector } from './build-action-connector';

test('it answers a refusal that never reached the server as refused', async () => {
  const connector = buildActionConnector(() =>
    Promise.resolve({ kind: 'refused', text: 'tracker waits for your approval' }),
  );

  const response = await connector.run(buildActionAttempt());

  expect(response).toStrictEqual({ kind: 'refused', reason: 'tracker waits for your approval' });
});

test('it answers a failure whose outcome is unknown as ambiguous', async () => {
  const connector = buildActionConnector(() =>
    Promise.resolve({ kind: 'failed', text: 'tracker.item_create failed' }),
  );

  const response = await connector.run(buildActionAttempt());

  expect(response).toStrictEqual({ kind: 'ambiguous', reason: 'tracker.item_create failed' });
});

test('it answers the server answer as a success', async () => {
  const connector = buildActionConnector(() =>
    Promise.resolve({ kind: 'answered', outcome: { status: 'ok', result: { text: 'done' } } }),
  );

  const response = await connector.run(buildActionAttempt());

  expect(response).toStrictEqual({ kind: 'success', result: { text: 'done' } });
});

test("it answers a server's own error as refused, with the server's text", async () => {
  const connector = buildActionConnector(() =>
    Promise.resolve({
      kind: 'answered',
      outcome: { status: 'ok', result: { text: 'no such item' }, isError: true },
    }),
  );

  const response = await connector.run(buildActionAttempt());

  expect(response).toStrictEqual({ kind: 'refused', reason: 'no such item' });
});

test('it passes the approved arguments to the call', async () => {
  const seen: unknown[] = [];

  const connector = buildActionConnector((input) => {
    seen.push(input);

    return Promise.resolve({ kind: 'failed', text: 'x' });
  });

  await connector.run(buildActionAttempt({ arguments: { title: 'x' } }));

  expect(seen).toStrictEqual([{ title: 'x' }]);
});
