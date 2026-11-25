import { expect, test } from 'bun:test';
import { buildMailBodyFields } from './build-mail-body-fields';

test.each([
  ['a send that names its reply wake', 'mail.send', { replyWake: '2d' }, '2d'],
  ['a send with the reply wake off', 'mail.send', { replyWake: 'off' }, 'off: no reply rule'],
  ['a send that names none', 'mail.send', {}, '7d, the default'],
  ['a reply that names none', 'mail.reply', { message: 'mz4k8q2w7p' }, '7d, the default'],
])('#buildMailBodyFields shows the reply rule of %s', (_name, tool, input, expected) => {
  const fields = buildMailBodyFields({ tool, thread: null, input, callSequence: 1 }, 604_800_000);

  expect(fields).toStrictEqual({ status: 'fields', fields: { replyWake: expected } });
});

test('#buildMailBodyFields adds nothing to the card of another tool', () => {
  const fields = buildMailBodyFields(
    { tool: 'web_fetch', thread: null, input: {}, callSequence: 1 },
    604_800_000,
  );

  expect(fields).toStrictEqual({ status: 'none' });
});
