import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildTestClient, startTestAPI } from '@heynixie/api/test-utils';
import {
  createPathSource,
  readDefinitionsInForce,
  readSnapshotPolicy,
  runInForceSeed,
  runSeed,
} from '@heynixie/definitions';
import { buildTestTaskSeed } from '@heynixie/definitions/test-utils';
import { writeRecords } from '@heynixie/log';
import type { PolicyCall } from '@heynixie/policy';
import { buildActionProposalInput, makeDecisionPoint } from '@heynixie/policy';
import { createConversationTask } from '@heynixie/tasks';
import invariant from 'tiny-invariant';
import { buildSeeder } from './test-utils/build-seeder';

async function setupTest() {
  const api = await startTestAPI();

  await createConversationTask(api.context);

  const root = join(api.dataDir, 'definitions');

  await mkdir(root, { recursive: true });
  await writeFile(join(root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(root, 'persona.md'), '# Persona\n');

  await runSeed({
    tasks: buildTestTaskSeed(),
    log: api.context.log,
    source: createPathSource({ directory: root }),
    buildPolicy: () => ({ rules: [], tools: [] }),
  });

  const decide = makeDecisionPoint({
    findDeclaration: (tool) =>
      tool === 'test.send'
        ? {
            effects: ['send'],
            destinations: ['to'],
            amount: null,
            content: ['body'],
            results: { delivered: 'untrusted' },
          }
        : null,
    readInputs: async (snapshot) => {
      const read = await readSnapshotPolicy(api.context.log.writer.db, snapshot);

      return { rules: read.rules, contacts: [], tools: read.tools, ownerDestinations: [] };
    },
    findJobDestinations: () => [],
    readConsent: () => Promise.resolve(null),
  });

  return {
    api,
    seed: buildSeeder(api),
    buildClient: (token: string) => buildTestClient(api.url, token),
    runInForceSeed: () =>
      runInForceSeed({ log: api.context.log, buildPolicy: () => ({ rules: [], tools: [] }) }),
    decideSend: async (body: string) => {
      const inForce = await readDefinitionsInForce(api.context.log.writer.db);

      invariant(inForce, 'the seed put definitions in force');

      const call: PolicyCall = {
        tool: 'test.send',
        toolList: ['test.send'],
        context: 'conversation',
        definitionID: null,
        args: { to: 'harbour-office@example.org', body },
        destinations: [{ value: 'harbour-office@example.org', replyTarget: false }],
        sources: ['owner'],
        at: api.clock.now(),
        turnMessageSequence: null,
        onBehalfOf: [],
        snapshot: inForce.snapshotHash,
      };

      return decide(call);
    },
  };
}

test('it allows the next matching send with no prompt once you answer an ask with always allow', async () => {
  const ctx = await setupTest();
  const laptop = await ctx.seed.identity({ deviceName: 'laptop' });

  const client = ctx.buildClient(laptop.token);

  const asked = await ctx.decideSend('The mooring fee is paid.');

  invariant(asked.decision.cause, 'the first send to an unknown destination asks');

  await writeRecords(ctx.api.context.log, [
    buildActionProposalInput({
      definitions: ctx.api.context.definitions(),
      thread: 'conversation',
      callSequence: 1,
      tool: 'test.send',
      effects: ['send'],
      cause: asked.decision.cause,
      input: { to: 'harbour-office@example.org', body: 'The mooring fee is paid.' },
      destinations: [{ value: 'harbour-office@example.org', replyTarget: false }],
      content: ['body'],
    }).record,
  ]);

  const listed = await client.approvals.listItems();

  const [item] = listed.items;

  invariant(item, 'the ask lists as a proposal');

  await client.approvals.answerProposal({
    proposalID: item.proposal.proposalID,
    actionHash: item.proposal.actionHash,
    choice: 'always_allow',
    ruleHash: item.proposal.ruleHash ?? 'missing',
    clientActionID: crypto.randomUUID(),
  });

  await ctx.runInForceSeed();

  const next = await ctx.decideSend('The winter berth is booked.');

  expect({ asked: asked.decision.outcome, next: next.decision.outcome }).toStrictEqual({
    asked: 'ask',
    next: 'allow',
  });
});
