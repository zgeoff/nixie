import { expect, test } from 'bun:test';
import { getHarnessImage } from './get-harness-image';

test('it gives the image under the key the harness record names', () => {
  expect(
    getHarnessImage(
      { conversation: 'nixie-conversation-0123456789ab', fetch: 'nixie-fetch' },
      'conversation',
    ),
  ).toBe('nixie-conversation-0123456789ab');
});

test('it throws for a key the sandbox manifest lacks', () => {
  expect(() => getHarnessImage({ fetch: 'nixie-fetch' }, 'conversation')).toThrow(
    'the sandbox manifest holds no conversation image',
  );
});
