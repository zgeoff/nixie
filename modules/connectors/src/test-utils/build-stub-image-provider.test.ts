import { expect, test } from 'bun:test';
import { buildStubImageProvider } from './build-stub-image-provider';

test('it draws a PNG and keeps the request it got', async () => {
  const provider = buildStubImageProvider();

  const reply = await provider.draw({
    model: 'model-a',
    prompt: 'a cove',
    size: '1024x1024',
    references: [],
    signal: new AbortController().signal,
  });

  expect(reply.kind).toBe('image');
  expect(provider.requests.map((request) => request.prompt)).toStrictEqual(['a cove']);
});

test('it answers with the reply the test gives', async () => {
  const provider = buildStubImageProvider();

  provider.replyWith(() => ({ kind: 'refused', reason: 'safety', message: 'no', isBilled: false }));

  const reply = await provider.draw({
    model: 'model-a',
    prompt: 'a cove',
    size: '1024x1024',
    references: [],
    signal: new AbortController().signal,
  });

  expect(reply).toStrictEqual({
    kind: 'refused',
    reason: 'safety',
    message: 'no',
    isBilled: false,
  });
});
