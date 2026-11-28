import { expect, test } from 'bun:test';
import type { StartingMessage } from './format-starting-message';
import { formatStartingMessage } from './format-starting-message';

test.each<{ title: string; starting: StartingMessage; name: string }>([
  {
    title: 'your message by its text',
    starting: { cause: { kind: 'owner' }, ownerText: 'Book a ferry' },
    name: 'Your message: Book a ferry',
  },
  {
    title: 'another message of yours apart from the first',
    starting: { cause: { kind: 'owner' }, ownerText: 'Find a cabin' },
    name: 'Your message: Find a cabin',
  },
  {
    title: 'a long message cut to its first 60 characters and a digest of the whole',
    starting: { cause: { kind: 'owner' }, ownerText: `${'a'.repeat(60)} and more` },
    name: expect.stringMatching(/^Your message: a{60}… \([0-9a-f]{12}\)$/u),
  },
  {
    title: 'a message of several lines on one line',
    starting: { cause: { kind: 'owner' }, ownerText: 'Book a ferry\n\nfor  two' },
    name: 'Your message: Book a ferry for two',
  },
  {
    title: 'your message whose text a forget erased',
    starting: { cause: { kind: 'owner' }, ownerText: null },
    name: 'Your message',
  },
  {
    title: 'outside content',
    starting: { cause: { kind: 'event' }, ownerText: null },
    name: 'Outside content',
  },
  {
    title: 'a timer',
    starting: { cause: { kind: 'timer' }, ownerText: null },
    name: 'A timer',
  },
  {
    title: 'a message from a task',
    starting: { cause: { kind: 'task', taskID: 'a1' }, ownerText: null },
    name: 'A message from a task',
  },
  {
    title: 'an earlier message',
    starting: { cause: { kind: 'carried' }, ownerText: null },
    name: 'An earlier message',
  },
  {
    title: 'a step that recorded no cause',
    starting: { cause: null, ownerText: null },
    name: 'Conversation',
  },
])('#formatStartingMessage names $title', (row) => {
  expect(formatStartingMessage(row.starting)).toStrictEqual(row.name);
});

test('#formatStartingMessage names 2 messages that share their first 60 characters apart', () => {
  const shared = 'a'.repeat(60);

  const first = formatStartingMessage({
    cause: { kind: 'owner' },
    ownerText: `${shared} then book a ferry`,
  });

  const second = formatStartingMessage({
    cause: { kind: 'owner' },
    ownerText: `${shared} then find a cabin`,
  });

  expect(first).not.toStrictEqual(second);
});

test('#formatStartingMessage cuts a long message at a whole character', () => {
  const name = formatStartingMessage({
    cause: { kind: 'owner' },
    ownerText: `${'a'.repeat(59)}😀 and more`,
  });

  expect(name).toStrictEqual(expect.stringMatching(/^Your message: a{59}😀… \([0-9a-f]{12}\)$/u));
});

test('#formatStartingMessage keeps a whole emoji with its skin tone at the cut', () => {
  const name = formatStartingMessage({
    cause: { kind: 'owner' },
    ownerText: `${'a'.repeat(59)}👍🏽 and more`,
  });

  expect(name).toStrictEqual(expect.stringMatching(/^Your message: a{59}👍🏽… \([0-9a-f]{12}\)$/u));
});
