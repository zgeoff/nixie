import { expect, onTestFinished, test } from 'bun:test';
import { readFile, writeFile } from 'node:fs/promises';
import {
  connectTestGoogle,
  createTestClient,
  makeHasTool,
  sendClientMessage,
  startE2ENixie,
  startFakeGoogleSite,
} from '@heynixie/server/test-utils';
import { waitFor } from '@zgeoff/testing';

async function setupTest() {
  const google = await startFakeGoogleSite();

  onTestFinished(() => google.stop());

  // a nixie that has no google section, with a fake Google that its tools and polls would reach
  const nixie = await startE2ENixie({
    isGoogleOff: true,
    googleURL: google.url,
    googleAPI: google.api,
  });

  const server = nixie.harness.start();

  const api = await createTestClient(server);

  return { google, nixie, api };
}

test('it offers the model no Gmail, Calendar or Drive tool when the config has no google section', async () => {
  const ctx = await setupTest();

  ctx.nixie.model.addReplies({ text: 'Plum-reply-5GA1' });

  await sendClientMessage(ctx.api.client, { text: 'Quince-message-8HB2' }, 'Plum-reply-5GA1', {
    timeoutMs: 30_000,
  });

  const request = ctx.nixie.model.requests.find((entry) => entry.path === '/v1/messages');
  const tools = request?.body?.tools?.map((tool) => tool.name) ?? [];

  expect({
    hasConversationTool: tools.includes('mcp__nixie__task_start'),
    offered: tools.filter((name) => /gmail|calendar|drive/u.test(name)),
  }).toStrictEqual({ hasConversationTool: true, offered: [] });
});

test('it leaves google out of the features that nixie.read reports', async () => {
  const ctx = await setupTest();
  const read = await ctx.api.client.nixie.read();

  expect(read.features).not.toContain('google');
});

test.each([
  {
    name: 'list',
    call: (api: Awaited<ReturnType<typeof setupTest>>['api']) => api.client.connections.list(),
  },
  {
    name: 'readSetup',
    call: (api: Awaited<ReturnType<typeof setupTest>>['api']) =>
      api.client.connections.readSetup({
        connector: 'google',
        origin: 'https://nixie.example.org',
      }),
  },
])('it answers connections.$name with FEATURE_OFF', async (row) => {
  const ctx = await setupTest();

  expect(row.call(ctx.api)).rejects.toMatchObject({
    code: 'FEATURE_OFF',
    data: { feature: 'google' },
  });
});

test('it sends no request to Gmail once the google section is gone, though a connection is still stored', async () => {
  const google = await startFakeGoogleSite();

  onTestFinished(() => google.stop());

  const nixie = await startE2ENixie({
    googleURL: google.url,
    googleAPI: google.api,
    extraConfig: ['google:', '  gmail:', '    poll_interval: 1m'],
  });

  const first = nixie.harness.start();

  const api = await createTestClient(first);

  await connectTestGoogle(api);

  // the control: while google is on, a poll reaches Gmail
  const before = google.gmail.requests.length;

  await nixie.harness.advance(61_000);

  await waitFor(() => {
    expect(google.gmail.requests.length).toBeGreaterThan(before);
  });

  await first.sendStopSignal();
  await first.waitForExit();

  const config = await readFile(nixie.configPath, 'utf8');

  await writeFile(
    nixie.configPath,
    config.replace('google:\n  gmail:\n    poll_interval: 1m\n', ''),
  );

  const second = nixie.harness.start();

  await second.ready;

  const seen = google.gmail.requests.length;

  await nixie.harness.advance(5 * 61_000);
  await second.sendStopSignal();
  await second.waitForExit();

  expect(google.gmail.requests.length).toBe(seen);
});

test('it leaves a queued Gmail send pending while google is off', async () => {
  const google = await startFakeGoogleSite();

  onTestFinished(() => google.stop());

  const nixie = await startE2ENixie({
    googleURL: google.url,
    googleAPI: google.api,
    isCheckerScripted: true,
  });

  const first = nixie.harness.start();

  const api = await createTestClient(first);

  await nixie.waitForQueueCheck();

  await connectTestGoogle(api);

  await first.request('arm', { point: 'claim.before', kind: 'action', times: 1000 });
  await nixie.markKnownContact('sam@example.org');

  nixie.checkerModel.addReplies({
    toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } },
  });

  nixie.model.addReplies({
    when: makeHasTool('mcp__nixie__gmail_send'),
    toolUse: {
      name: 'mcp__nixie__gmail_send',
      input: { to: ['sam@example.org'], subject: 'Plum notes', text: 'The notes are attached.' },
    },
  });

  void first.request('sendMessage', {
    thread: 'conversation',
    text: 'Email sam@example.org the plum notes, subject Plum notes.',
  });

  await nixie.waitForRecord(
    (record) => record.kind === 'action.queued' && record.payload['tool'] === 'gmail.send',
  );

  await first.kill();

  const config = await readFile(nixie.configPath, 'utf8');

  await writeFile(nixie.configPath, config.replace('google: {}\n', ''));

  nixie.model.addReplies({ when: makeHasTool('mcp__nixie__gmail_send'), text: 'It was sent.' });

  const second = nixie.harness.start();

  await second.ready;

  await nixie.waitForQueueCheck();
  await nixie.harness.advance(10 * 60_000);
  await second.kill();

  const records = await nixie.readRecords();

  expect(
    records
      .filter(
        (record) =>
          record.kind.startsWith('action.') && String(record.payload['tool']).startsWith('gmail.'),
      )
      .map((record) => record.kind),
  ).toStrictEqual(['action.queued']);

  expect(google.gmail.sent).toStrictEqual([]);
});

test('it holds a Gmail match that waits in its window while google is off, and wakes no turn for it', async () => {
  const google = await startFakeGoogleSite();

  onTestFinished(() => google.stop());

  const nixie = await startE2ENixie({
    googleURL: google.url,
    googleAPI: google.api,
    isCheckerScripted: true,
    extraConfig: ['google:', '  gmail:', '    poll_interval: 1m'],
  });

  const first = nixie.harness.start();

  const api = await createTestClient(first);

  await connectTestGoogle(api);

  const isConversationTurn = makeHasTool('mcp__nixie__gmail_wake_set');

  const countRecords = async (kind: string) => {
    const records = await nixie.readRecords();

    return records.filter((record) => record.kind === kind && record.thread !== 'queue-check')
      .length;
  };

  const countWakes = () => countRecords('trigger.mail_woke');

  // the first poll reads the account's place in its history, so the mail below is new
  await nixie.harness.advance(61_000);

  nixie.checkerModel.addReplies({
    toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } },
  });

  nixie.model.addReplies(
    {
      when: isConversationTurn,
      toolUse: {
        name: 'mcp__nixie__gmail_wake_set',
        input: { from: ['@library.example.org'], window: '2h' },
      },
    },
    { when: isConversationTurn, text: 'I will watch for the mail.' },
    { when: isConversationTurn, text: 'The rule is set.' },
  );

  void first.request('sendMessage', {
    thread: 'conversation',
    text: 'Wake me when mail from the library arrives.',
  });

  await nixie.waitForRecord((record) => record.kind === 'trigger.wake_rule_set');

  nixie.model.addReplies({ when: isConversationTurn, text: 'I saw the library mail.' });

  // the first mail wakes at once, and the second waits for the window to end
  google.gmail.seed({
    from: 'hello@library.example.org',
    subject: 'Plum-ledger-1',
    sentAtMs: nixie.harness.now(),
  });

  await nixie.harness.advance(61_000);

  await waitFor(async () => {
    const wakes = await countWakes();

    expect(wakes).toBe(1);
  });

  google.gmail.seed({
    from: 'hello@library.example.org',
    subject: 'Plum-ledger-2',
    sentAtMs: nixie.harness.now(),
  });

  const delivered = await countRecords('trigger.delivered');

  await waitFor(async () => {
    await nixie.harness.advance(61_000);

    const now = await countRecords('trigger.delivered');

    expect(now).toBeGreaterThan(delivered);
  });

  await first.kill();

  const config = await readFile(nixie.configPath, 'utf8');

  await writeFile(
    nixie.configPath,
    config.replace('google:\n  gmail:\n    poll_interval: 1m\n', ''),
  );

  const second = nixie.harness.start();

  await second.ready;

  await nixie.harness.advance(3 * 60 * 60_000, { settle: true });
  await second.kill();

  const wakes = await countWakes();

  expect(wakes).toBe(1);
});
