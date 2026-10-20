import { expect, test } from 'bun:test';
import { startTestMemory } from '@heynixie/memory/test-utils';
import { createRouterClient } from '@orpc/server';
import { createHostSubjectsProcedure } from './create-host-subjects-procedure';

test('it counts the items and proposals of each subject', async () => {
  const memory = await startTestMemory();

  const client = createRouterClient({ subjects: createHostSubjectsProcedure(() => memory.store) });

  await memory.store.remember({
    text: 'Plays the cello',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.remember({
    text: 'The owner and the assistant call the cello Big Bertha',
    subject: 'shared',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  await memory.store.remember({
    text: 'I like hearing about the cello',
    subject: 'self',
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const counts = await client.subjects();

  expect(counts).toStrictEqual({
    items: { owner: 1, shared: 1, self: 1 },
    proposals: { owner: 0, shared: 0, self: 0 },
  });
});

test('it refuses a count before the memory store starts', () => {
  const client = createRouterClient({ subjects: createHostSubjectsProcedure(() => null) });

  expect(client.subjects()).rejects.toMatchObject({ code: 'MEMORY_NOT_STARTED' });
});
