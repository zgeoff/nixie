import { expect, test } from 'bun:test';
import { kagiAPIURL, kagiStore } from '@heynixie/search-kagi/mocks';
import {
  createTestClient,
  sendClientMessage,
  startInProcessNixie,
} from '@heynixie/server/test-utils';

async function setupTest() {
  const planted = 'planted-kagi-key-0042';

  const nixie = await startInProcessNixie({
    extraConfig: ['search:', '  credential: deployment:search', `  api_url: ${kagiAPIURL}`],
    extraSecrets: ['connector_credentials:', `  search: ${planted}`],
  });

  const api = await createTestClient(nixie);

  await kagiStore.keys.create({ key: planted });

  // the service echoes the key it was given, the way a careless provider could
  await kagiStore.results.create({
    query: 'ferry timetable',
    url: 'https://ferries.example.test/times',
    title: `Ferry times for ${planted}`,
    snippet: `account ${planted}`,
  });

  return { planted, nixie, api };
}

test('it keeps a planted key out of the tool result, the log lines and every record', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'search', input: { query: 'ferry timetable' } } },
    { text: 'Searched.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'How do I get to Manly?' }, 'Searched.');

  const read = await ctx.api.client.conversation.read({ thread: 'conversation' });

  const seen = JSON.stringify({
    results: ctx.nixie.toolResults,
    logs: ctx.nixie.readLogEvents(),
    records: read.records,
  });

  expect(seen).not.toContain(ctx.planted);
  expect(ctx.nixie.toolResults.at(-1)?.result).toInclude('Ferry times for');
});

test('it keeps a planted key out of the files the server writes to its data directory', async () => {
  const ctx = await setupTest();

  ctx.nixie.guest.addReplies(
    { toolUse: { name: 'search', input: { query: 'ferry timetable' } } },
    { text: 'Searched.' },
  );

  await sendClientMessage(ctx.api.client, { text: 'How do I get to Manly?' }, 'Searched.');

  const files = await ctx.nixie.readDataFiles();

  expect(files.filter((file) => file.text.includes(ctx.planted))).toStrictEqual([]);
});
