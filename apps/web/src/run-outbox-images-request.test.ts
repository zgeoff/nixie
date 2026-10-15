import { expect, test } from 'bun:test';
import { runOutboxImagesRequest } from './run-outbox-images-request';

test("it resolves with the request's result once its transaction commits", async () => {
  await runOutboxImagesRequest('readwrite', (store) => store.put(['kept'], 'message-a'));

  const read: unknown = await runOutboxImagesRequest('readonly', (store) => store.get('message-a'));

  expect(read).toStrictEqual(['kept']);
});

test('it rejects with the error of a request that fails', async () => {
  await runOutboxImagesRequest('readwrite', (store) => store.add(['first'], 'message-a'));

  const second = runOutboxImagesRequest('readwrite', (store) => store.add(['second'], 'message-a'));

  await Promise.allSettled([second]);

  expect(second).rejects.toMatchObject({ name: 'ConstraintError' });
});
