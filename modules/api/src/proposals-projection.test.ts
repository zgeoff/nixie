import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nixieSchema } from '@heynixie/db';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { withWriteTransaction, writeRecords } from '@heynixie/log';
import {
  defaultGateLimits,
  defaultOwnerPronouns,
  findNoAllowRule,
  startMemoryStore,
} from '@heynixie/memory';
import { buildMockWriteCaller } from '@heynixie/memory/test-utils';
import { buildActionProposalInput } from '@heynixie/policy';
import { sql } from 'kysely';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  const root = join(api.dataDir, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await runSeed({
    log: api.context.log,
    source: createPathSource({ directory: root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  // the writer stamps records with the wall clock, so the test clock starts there
  api.clock.advance(Date.now() - api.clock.now());

  const memory = await startMemoryStore({
    log: api.context.log,
    definitions: () => ({ snapshotHash: 'sha256:test' }),
    cleanupSessions: () => Promise.resolve(),
    gate: {
      check: () =>
        Promise.resolve({
          verdict: 'unsure',
          reason: 'no checker is wired',
          model: 'no-checker',
          failure: 'error',
        }),
      clock: api.clock,
      defaultZone: 'UTC',
      findAllowRule: findNoAllowRule,
      limits: defaultGateLimits,
      ownerName: null,
      ownerPronouns: defaultOwnerPronouns,
      getPromptsInForce: () => ({ snapshotHash: 'sha256:test', prompts: {} }),
    },
  });

  onTestFinished(() => memory.stop());

  api.setMemory(memory);

  const laptop = await createDeviceSession(api.context, 'laptop');

  const db = api.context.log.writer.db;

  return {
    api,
    memory,
    client: buildTestClient(api.url, laptop.token),
    readRows: async () => {
      const read = await sql`select * from proposals order by proposal_id`.execute(db);

      return read.rows;
    },
    runBackfill: () =>
      withWriteTransaction(api.context.log.writer, async (tx) => {
        await sql`delete from proposals`.execute(tx);

        const migration = nixieSchema.migrations.find(
          (entry) => entry.name === 'create the proposals',
        );

        await migration?.up(tx);
      }),
  };
}

test('it folds the same rows from the log as the migration backfills from it', async () => {
  const ctx = await setupTest();

  const asks = ['harbour@example.org', 'marina@example.org'].map((to) =>
    buildActionProposalInput({
      definitions: ctx.api.context.definitions(),
      thread: 'conversation',
      callSequence: 1,
      tool: 'mail.send',
      effects: ['send'],
      cause: 'no_rule',
      input: { to },
      destinations: [{ value: to, replyTarget: false }],
      content: [],
    }),
  );

  await writeRecords(
    ctx.api.context.log,
    asks.map((ask) => ask.record),
  );

  await ctx.memory.writes.remember({
    text: 'Keeps a rowing boat at the lake',
    caller: buildMockWriteCaller(),
  });

  await ctx.memory.writes.remember({
    text: 'Moors the boat at the north jetty',
    caller: buildMockWriteCaller(),
  });

  const listed = await ctx.client.approvals.listItems();

  const declined = listed.items.find((item) => item.proposal.kind === 'action');
  const approved = listed.items.find((item) => item.group === 'memory');

  await ctx.client.approvals.answerProposal({
    proposalID: declined?.proposal.proposalID ?? 'missing',
    actionHash: declined?.proposal.actionHash ?? 'missing',
    choice: 'decline',
    note: 'Not needed now.',
    clientActionID: crypto.randomUUID(),
  });

  await ctx.client.approvals.answerProposal({
    proposalID: approved?.proposal.proposalID ?? 'missing',
    actionHash: approved?.proposal.actionHash ?? 'missing',
    choice: 'approve',
    clientActionID: crypto.randomUUID(),
  });

  const folded = await ctx.readRows();

  await ctx.runBackfill();

  const backfilled = await ctx.readRows();

  expect({ rows: backfilled, count: backfilled.length }).toStrictEqual({ rows: folded, count: 5 });
});
