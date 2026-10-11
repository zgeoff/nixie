import { expect, test } from 'bun:test';
import { buildCleanup } from './build-cleanup';

test('it stops each part in reverse, the last registered first', async () => {
  const cleanup = buildCleanup();
  const stopped: string[] = [];

  await cleanup.defer(() => {
    stopped.push('writer');
  });
  await cleanup.defer(() => {
    stopped.push('runners');
  });
  await cleanup.stop();

  expect(stopped).toStrictEqual(['runners', 'writer']);
});

test('it stops every part when one fails, then throws the failure', async () => {
  const cleanup = buildCleanup();
  const stopped: string[] = [];

  await cleanup.defer(() => {
    stopped.push('writer');
  });
  await cleanup.defer(() => Promise.reject(new Error('the endpoint failed to stop')));

  expect(cleanup.stop()).rejects.toThrow('a part failed to stop');
  expect(stopped).toStrictEqual(['writer']);
});

test('it stops a part at once when it registers after the stop began', async () => {
  const cleanup = buildCleanup();
  const stopped: string[] = [];

  await cleanup.stop();
  await cleanup.defer(() => {
    stopped.push('conversation');
  });

  expect(stopped).toStrictEqual(['conversation']);
  expect(cleanup.signal.aborted).toBeTrue();
});
