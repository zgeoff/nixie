import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { nixieSchema, readQueryRows, removeTableRows } from '@heynixie/db';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { buildTestTaskSeed, seedLegacyRuleProposal } from '@heynixie/definitions/test-utils';
import { withWriteTransaction, writeRecords } from '@heynixie/log';
import { defaultGateLimits, defaultOwnerPronouns, startMemoryStore } from '@heynixie/memory';
import { buildActionProposalInput } from '@heynixie/policy';
import { sql } from 'kysely';
import { z } from 'zod';
import { buildTestClient } from '../test-utils/build-test-client';
import { createDeviceSession } from '../test-utils/create-device-session';
import { startTestAPI } from '../test-utils/start-test-api';

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
    tasks: buildTestTaskSeed(),
    log: api.context.log,
    source: createPathSource({ directory: root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  // the writer stamps records with the wall clock, so the test clock starts there
  api.clock.advance(Date.now() - api.clock.now());

  // a rule change proposal that a seed of an earlier release left pending
  await seedLegacyRuleProposal(api.context.log);

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
    runAnsweredByBackfill: () =>
      withWriteTransaction(api.context.log.writer, async (tx) => {
        // The backfill is checked against the fold, so the column is cleared first.
        // oxlint-disable-next-line zgeoff/seed-only
        await sql`update proposals set answered_by = null`.execute(tx);

        const migration = nixieSchema.migrations.find(
          (entry) => entry.name === 'record who answered each proposal',
        );

        await migration?.up(tx);
      }),
    runBackfill: () =>
      withWriteTransaction(api.context.log.writer, async (tx) => {
        const tables = await readQueryRows(
          sql`select name from sqlite_master where type = 'table' and name not like 'sqlite\\_%' escape '\\'`,
          tx,
          z.object({ name: z.string() }),
        );

        await removeTableRows(
          tx,
          tables.map((table) => table.name).filter((name) => name !== 'proposals'),
        );

        const migration = nixieSchema.migrations.find(
          (entry) => entry.name === 'create the proposals',
        );

        await migration?.up(tx);

        const answeredBy = nixieSchema.migrations.find(
          (entry) => entry.name === 'record who answered each proposal',
        );

        await answeredBy?.up(tx);
      }),
    readAnsweredBy: async () => {
      const read = await sql`select answered_by from proposals`.execute(db);

      return read.rows;
    },
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

  const listed = await ctx.client.approvals.listItems();

  const declined = listed.items.find((item) => item.proposal.kind === 'action');

  await ctx.client.approvals.answerProposal({
    proposalID: declined?.proposal.proposalID ?? 'missing',
    actionHash: declined?.proposal.actionHash ?? 'missing',
    choice: 'decline',
    note: 'Not needed now.',
    clientActionID: crypto.randomUUID(),
  });

  const folded = await ctx.readRows();

  await ctx.runBackfill();

  const backfilled = await ctx.readRows();

  expect({ rows: backfilled, count: backfilled.length }).toStrictEqual({ rows: folded, count: 3 });
});

test('it folds the answering identity of each answered row as the migration backfills it', async () => {
  const ctx = await setupTest();

  const ask = buildActionProposalInput({
    definitions: ctx.api.context.definitions(),
    thread: 'conversation',
    callSequence: 1,
    tool: 'mail.send',
    effects: ['send'],
    cause: 'no_rule',
    input: { to: 'harbour@example.org' },
    destinations: [{ value: 'harbour@example.org', replyTarget: false }],
    content: [],
  });

  await writeRecords(ctx.api.context.log, [ask.record]);

  const listed = await ctx.client.approvals.listItems();

  const item = listed.items.find((entry) => entry.proposal.kind === 'action');

  await ctx.client.approvals.answerProposal({
    proposalID: item?.proposal.proposalID ?? 'missing',
    actionHash: item?.proposal.actionHash ?? 'missing',
    choice: 'decline',
    clientActionID: crypto.randomUUID(),
  });

  const folded = await ctx.readRows();

  await ctx.runAnsweredByBackfill();

  const backfilled = await ctx.readRows();

  expect(backfilled).toStrictEqual(folded);

  const answeredBy = await ctx.readAnsweredBy();

  expect(answeredBy).toContainEqual({ answered_by: expect.toBeString() });
});
