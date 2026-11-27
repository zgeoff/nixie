import { expect, onTestFinished, test } from 'bun:test';
import { join } from 'node:path';
import { startTestModelGateway } from '@heynixie/model-gateway/test-utils';
import {
  connectTestGoogle,
  createTestClient,
  makeHasTool,
  runHostCommand,
  startE2ENixie,
  startFakeGoogleSite,
} from '@heynixie/server/test-utils';
import { waitFor } from '@zgeoff/testing';
import { z } from 'zod';

async function setupTest() {
  const google = await startFakeGoogleSite();

  onTestFinished(() => google.stop());

  const nixie = await startE2ENixie({
    googleURL: google.url,
    googleAPI: google.api,
    isCheckerScripted: true,
    extraConfig: ['google:', '  gmail:', '    poll_interval: 1m'],
    routeModel: async (upstreamURL) => {
      const gateway = await startTestModelGateway({ upstreamURL });

      return {
        baseURL: gateway.baseURL,
        config: [
          'turn_input_log:',
          '  default: always',
          '  close_wait: 500ms',
          '  sources:',
          '    gateway:',
          `      base_url: ${gateway.url}`,
          `      dir: ${gateway.spoolDir}`,
        ],
      };
    },
  });

  const server = nixie.harness.start();

  const api = await createTestClient(server);
  const connected = await connectTestGoogle(api);

  const inputSchema = z.object({ inputID: z.string() });
  const listedSchema = z.object({ inputs: z.array(inputSchema) });

  // Each logged request as the bytes the model received, through the host commands an operator runs.
  const readLoggedInputs = async (): Promise<readonly string[]> => {
    const listed = await runHostCommand(nixie.configPath, ['turn-input', 'list']);

    const parsed: unknown = JSON.parse(listed.stdout);
    const inputs = listedSchema.parse(parsed).inputs;

    const opened = await Promise.all(
      inputs.map((input) =>
        runHostCommand(nixie.configPath, ['turn-input', 'open', input.inputID]),
      ),
    );

    return opened.map((open) => open.stdout);
  };

  // The text of each file the guests keep under their homes' .claude folders, where the SDK keeps
  // the transcript that a session resumes from.
  const readTranscripts = async (): Promise<readonly string[]> => {
    const glob = new Bun.Glob('sandboxes/**/.claude/**/*.jsonl');

    const paths = await Array.fromAsync(glob.scan({ cwd: nixie.dataDir, dot: true }));

    return Promise.all(paths.map((path) => Bun.file(join(nixie.dataDir, path)).text()));
  };

  const readModelBodies = () =>
    nixie.model.requests
      .filter((request) => request.path === '/v1/messages')
      .map((request) => JSON.stringify(request.body));

  const countRecords = async (kind: string) => {
    const records = await nixie.readRecords();

    return records.filter((record) => record.kind === kind && record.thread !== 'queue-check')
      .length;
  };

  // Moves the clock one poll on, and waits until that poll commits.
  const advancePoll = async () => {
    const polls = await countRecords('trigger.delivered');

    await nixie.harness.advance(61_000);

    await waitFor(async () => {
      const count = await countRecords('trigger.delivered');

      expect(count).toBeGreaterThan(polls);
    });
  };

  // Waits until this many turns have committed. The first turn starts the guest, which takes a few
  // seconds, so the wait matches the harness's own record wait.
  const waitForTurns = async (count: number) => {
    await waitFor(
      async () => {
        const committed = await countRecords('task.step_committed');

        expect(committed).toBe(count);
      },
      { intervalMs: 100, timeoutMs: 10_000 },
    );
  };

  return {
    isConversationTurn: makeHasTool('mcp__nixie__gmail_wake_set'),
    google,
    nixie,
    server,
    api,
    connected,
    readLoggedInputs,
    readTranscripts,
    readModelBodies,
    advancePoll,
    waitForTurns,
  };
}

test('it takes the subject of a Gmail mail that woke the conversation out of the session and the logged requests, when the account is forgotten', async () => {
  const ctx = await setupTest();

  const subject = 'Heron-ledger-7Q2X';

  // the first poll reads the account's place in its history, so the mail below is new
  await ctx.advancePoll();

  // the consent checker finds the call in the user's own words, so the rule needs no approval
  ctx.nixie.checkerModel.addReplies({
    toolUse: { name: 'StructuredOutput', input: { verdict: 'asserted', reason: 'Stated.' } },
  });

  ctx.nixie.model.addReplies(
    {
      when: ctx.isConversationTurn,
      toolUse: {
        name: 'mcp__nixie__gmail_wake_set',
        input: { from: ['@library.example.org'], window: '1m' },
      },
    },
    { when: ctx.isConversationTurn, text: 'I will watch for the mail.' },

    // The rule's outcome can land in the inbox while the turn still runs, and the turn then asks
    // the model once more. A later turn takes this reply when it does not.
    { when: ctx.isConversationTurn, text: 'The rule is set.' },
  );

  void ctx.server.request('sendMessage', {
    thread: 'conversation',
    text: 'Wake me when mail from the library arrives.',
  });

  await ctx.waitForTurns(1);

  ctx.nixie.model.addReplies({ when: ctx.isConversationTurn, text: 'I saw the library mail.' });

  ctx.google.gmail.seed({
    from: 'hello@library.example.org',
    subject,
    sentAtMs: ctx.nixie.harness.now(),
  });

  await ctx.advancePoll();
  await ctx.waitForTurns(2);

  await waitFor(
    async () => {
      const logged = await ctx.readLoggedInputs();

      expect(logged).toSatisfyAny((text: string) => text.includes(subject));
    },
    { intervalMs: 1000 },
  );

  const before = {
    model: ctx.readModelBodies(),
    logged: await ctx.readLoggedInputs(),
    transcripts: await ctx.readTranscripts(),
  };

  await ctx.api.client.connections.forget({
    clientActionID: crypto.randomUUID(),
    connection: ctx.connected.connection,
  });

  await ctx.nixie.waitForRecord((record) => record.kind === 'erasure.finished');

  // a new session removes stale transcripts itself, which would hide a purge that never ran
  const transcriptsAfter = await ctx.readTranscripts();

  ctx.nixie.model.addReplies({ when: ctx.isConversationTurn, text: 'Nothing new.' });
  void ctx.server.request('sendMessage', { thread: 'conversation', text: 'Anything new?' });

  await ctx.waitForTurns(3);

  const after = {
    model: ctx.readModelBodies().find((text) => text.includes('Anything new?')),
    logged: await ctx.readLoggedInputs(),
  };

  expect(before.model).toSatisfyAny((text: string) => text.includes(subject));
  expect(before.logged).toSatisfyAny((text: string) => text.includes(subject));
  expect(before.transcripts).toSatisfyAny((text: string) => text.includes(subject));
  expect(after.model).toBeString();
  expect(after.model).not.toInclude(subject);
  expect(after.logged).toSatisfyAll((text: string) => !text.includes(subject));
  expect(transcriptsAfter).toSatisfyAll((text: string) => !text.includes(subject));
});
