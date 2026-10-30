import { expect, test } from 'bun:test';
import { formatStopPreview } from './format-stop-preview';

test('it lists the queued actions a stop cancels and the started ones that run on', () => {
  expect(
    formatStopPreview({
      queued: [
        { actionID: '5d7f9b1c-3e2a-4c6d-8f0b-1a3c5e7d9f24', tool: 'mail.send' },
        { actionID: '6e8a0c2d-4f3b-4d7e-9a1c-2b4d6f8a0c3e', tool: 'calendar.create' },
      ],
      started: [{ actionID: '7f9b1d3e-5a4c-4e8f-8b2d-3c5e7a9b1d4f', tool: 'web.fetch' }],
    }),
  ).toStrictEqual([
    'The stop cancels 2 actions not yet started: mail.send, calendar.create.',
    'Already started, so it runs to its outcome: web.fetch.',
  ]);
});

test('it says a stop cancels nothing when no action waits', () => {
  expect(formatStopPreview({ queued: [], started: [] })).toStrictEqual([
    'The stop cancels no queued action.',
  ]);
});

test('it counts one queued action in the singular', () => {
  expect(
    formatStopPreview({
      queued: [{ actionID: '5d7f9b1c-3e2a-4c6d-8f0b-1a3c5e7d9f24', tool: 'mail.send' }],
      started: [],
    }),
  ).toStrictEqual(['The stop cancels 1 action not yet started: mail.send.']);
});
