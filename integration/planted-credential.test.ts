import { expect, test } from 'bun:test';
import { startTestSite } from '@heynixie/egress/test-utils';
import { kagiAPIURL, kagiStore } from '@heynixie/search-kagi/mocks';
import {
  createTestClient,
  sendClientMessage,
  startInProcessNixie,
} from '@heynixie/server/test-utils';

type Connection = 'the mock network' | 'a pinned connection';

async function setupTest(connection: Connection) {
  const planted = 'planted-kagi-key-0042';

  // The loopback site answers as Kagi through the mock network, and compresses its reply, so the
  // fetcher decodes the body before it removes the key.
  const site = await startTestSite({
    names: ['kagi-site.test'],
    respond: async (request) => {
      const sent = await request.text();

      const answer = await fetch(`${kagiAPIURL}/search`, {
        method: request.method,
        headers: {
          authorization: request.headers.get('authorization') ?? '',
          'content-type': 'application/json',
        },
        body: sent,
      });

      const raw = await answer.arrayBuffer();

      return new Response(Bun.gzipSync(new Uint8Array(raw)), {
        status: answer.status,
        headers: { 'content-type': 'application/json', 'content-encoding': 'gzip' },
      });
    },
  });

  const routes = {
    'the mock network': { apiURL: kagiAPIURL },
    'a pinned connection': {
      apiURL: `https://kagi-site.test:${String(site.port)}/api/v1`,
      credentialSite: { names: ['kagi-site.test'], ca: site.ca },
    },
  } as const;

  const route = routes[connection];

  const nixie = await startInProcessNixie({
    extraConfig: ['search:', '  credential: deployment:search', `  api_url: ${route.apiURL}`],
    extraSecrets: ['connector_credentials:', `  search: ${planted}`],
    ...('credentialSite' in route ? { credentialSite: route.credentialSite } : {}),
  });

  const api = await createTestClient(nixie);

  await kagiStore.keys.create({ key: planted });

  // An own value is cut from a tool result only as it is, so the encoded echo reaches the result
  // unless the fetcher cut it.
  const encoded = Buffer.from(planted).toString('base64');

  // the service echoes the key it was given, the way a careless provider could
  await kagiStore.results.create({
    query: 'ferry timetable',
    url: 'https://ferries.example.test/times',
    title: `Ferry times for ${planted}`,
    snippet: `account ${planted} token ${encoded}`,
  });

  return { planted, encoded, nixie, api };
}

test.each<Connection>(['the mock network', 'a pinned connection'])(
  'it keeps a planted key out of the tool result, the log lines and every record, over %s',
  async (connection) => {
    const ctx = await setupTest(connection);

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
    expect(seen).not.toContain(ctx.encoded);
    expect(ctx.nixie.toolResults.at(-1)?.result).toInclude('Ferry times for');
  },
);

test.each<Connection>(['the mock network', 'a pinned connection'])(
  'it keeps a planted key out of the files the server writes to its data directory, over %s',
  async (connection) => {
    const ctx = await setupTest(connection);

    ctx.nixie.guest.addReplies(
      { toolUse: { name: 'search', input: { query: 'ferry timetable' } } },
      { text: 'Searched.' },
    );

    await sendClientMessage(ctx.api.client, { text: 'How do I get to Manly?' }, 'Searched.');

    const files = await ctx.nixie.readDataFiles();

    const leaked = files.filter(
      (file) => file.text.includes(ctx.planted) || file.text.includes(ctx.encoded),
    );

    expect(leaked).toStrictEqual([]);
  },
);
