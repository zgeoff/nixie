import { expect, test } from 'bun:test';
import { startTestMemory } from '@heynixie/memory/test-utils';
import { readGoogleBodyFields } from './read-google-body-fields';

test('it words the card of a Gmail label change with its thread count and each label', async () => {
  const memory = await startTestMemory();

  const fields = await readGoogleBodyFields(
    memory.log,
    {
      tool: 'gmail.label',
      thread: 'conversation',
      input: { threads: ['k3x9m2p7qa.a1', 'k3x9m2p7qa.b2'], add: ['Reports'], remove: ['INBOX'] },
      callSequence: 1,
    },
    'UTC',
  );

  expect(fields).toStrictEqual({
    status: 'fields',
    fields: {},
    sentence: 'Label 2 threads: add Reports, remove INBOX',
    approveLabel: 'Label',
  });
});

test('it leaves the card of a Gmail send without a body when its facts are gone', async () => {
  const memory = await startTestMemory();

  const fields = await readGoogleBodyFields(
    memory.log,
    { tool: 'gmail.send', thread: 'conversation', input: {}, callSequence: 1 },
    'UTC',
  );

  expect(fields).toStrictEqual({ status: 'unreadable' });
});

test('it words the card of a calendar invitation in the default zone of the deployment', async () => {
  const memory = await startTestMemory();

  const fields = await readGoogleBodyFields(
    memory.log,
    {
      tool: 'calendar.create_event_with_guests',
      thread: 'conversation',
      input: {
        title: 'Lunch',
        start: '2026-12-02T12:00:00+11:00',
        end: '2026-12-02T13:00:00+11:00',
        guests: ['lee@example.org'],
      },
      callSequence: 1,
    },
    'Australia/Sydney',
  );

  expect(fields).toMatchObject({
    status: 'fields',
    sentence: 'Invite lee@example.org to "Lunch" on Wed 2 Dec 2026, 12:00 Sydney',
    approveLabel: 'Send invitations',
  });
});
