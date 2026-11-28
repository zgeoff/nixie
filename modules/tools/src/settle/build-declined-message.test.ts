import { expect, test } from 'bun:test';
import { buildDeclinedMessage } from './build-declined-message';

test('it denies the call and names the declined proposal', () => {
  const settled = buildDeclinedMessage('k3v8n2p6wd');

  expect(settled.outcome).toBe('denied');

  expect(settled.reply).toStrictEqual({
    kind: 'text',
    text: 'denied: the user declined this same action earlier in this run (`k3v8n2p6wd`), so it asks nothing more. Do not propose it again.',
    isError: true,
  });
});
