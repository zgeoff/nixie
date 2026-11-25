import { expect, test } from 'bun:test';
import { createPageMessages } from './create-page-messages';

test('#createPageMessages gives a region its newest retained message', () => {
  const messages = createPageMessages();

  messages.retain('dk4m7q2w9x', {
    region: 'pond',
    shown: 'sh1',
    data: { ripples: 1 },
    retain: true,
  });

  messages.retain('dk4m7q2w9x', {
    region: 'pond',
    shown: 'sh1',
    data: { ripples: 3 },
    retain: true,
  });

  expect(messages.readRetained('dk4m7q2w9x', new Map([['pond', 'sh1']]))).toStrictEqual([
    { region: 'pond', shown: 'sh1', data: { ripples: 3 }, retain: true },
  ]);
});

test('#createPageMessages gives a region that shows new content no message', () => {
  const messages = createPageMessages();

  messages.retain('dk4m7q2w9x', {
    region: 'pond',
    shown: 'sh1',
    data: { ripples: 3 },
    retain: true,
  });

  expect(messages.readRetained('dk4m7q2w9x', new Map([['pond', 'sh2']]))).toStrictEqual([]);
});

test('#createPageMessages keeps the messages of one device apart from another', () => {
  const messages = createPageMessages();

  messages.retain('dk4m7q2w9x', { region: 'pond', shown: 'sh1', data: 'one', retain: true });

  expect(messages.readRetained('zz9plural1', new Map([['pond', 'sh1']]))).toStrictEqual([]);
});
