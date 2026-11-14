import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { createPathSource, runSeed } from '@heynixie/definitions';
import { buildTestClient } from './test-utils/build-test-client';
import { createDeviceSession } from './test-utils/create-device-session';
import { startTestAPI } from './test-utils/start-test-api';

async function setupTest() {
  const api = await startTestAPI();

  const root = join(api.dataDir, 'definitions');

  await mkdir(join(root, 'rules'), { recursive: true });

  return {
    api,
    root,
    seed: () =>
      runSeed({
        log: api.context.log,
        source: createPathSource({ directory: root }),
        buildPolicy: () => ({ rules: [], tools: [] }),
      }),
  };
}

test('#rules.listProposals lists a pending rule change with the sentence of each version', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.api.context, 'laptop');

  const client = buildTestClient(ctx.api.url, laptop.token);

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const listed = await client.rules.listProposals();

  expect(listed).toStrictEqual({
    proposals: [
      {
        proposalID: expect.any(String),
        changes: [
          {
            ruleID: 'allow-web',
            before: null,
            after: { ruleHash: expect.any(String), sentence: expect.stringContaining('web.fetch') },
          },
        ],
        effectChanges: [],
        createdAt: expect.toBeValidDate(),
        lapseAt: expect.toBeValidDate(),
      },
    ],
  });
});

test('#rules.approveProposal takes the rule change off the pending list', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.api.context, 'laptop');

  const client = buildTestClient(ctx.api.url, laptop.token);

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const pending = await client.rules.listProposals();

  const proposalID = pending.proposals[0]?.proposalID ?? 'missing';

  const approved = await client.rules.approveProposal({ proposalID });
  const after = await client.rules.listProposals();

  expect({ approved, after }).toStrictEqual({ approved: { proposalID }, after: { proposals: [] } });
});

test('#rules.rejectProposal refuses a rule change you already answered as closed', async () => {
  const ctx = await setupTest();
  const laptop = await createDeviceSession(ctx.api.context, 'laptop');

  const client = buildTestClient(ctx.api.url, laptop.token);

  await writeFile(join(ctx.root, 'nixie.yaml'), 'format: 3\n');
  await writeFile(join(ctx.root, 'persona.md'), '# Persona\n');

  await writeFile(
    join(ctx.root, 'rules', 'web.yaml'),
    'allow-web:\n  outcome: allow\n  tools: [web.fetch]\n',
  );

  await ctx.seed();

  const pending = await client.rules.listProposals();

  const proposalID = pending.proposals[0]?.proposalID ?? 'missing';

  await client.rules.rejectProposal({ proposalID, reason: 'Not this month.' });

  const again = client.rules.rejectProposal({ proposalID, reason: 'Still no.' });

  await Promise.allSettled([again]);

  expect(again).rejects.toMatchObject({ code: 'PROPOSAL_CLOSED' });
});

test('#rules.listProposals refuses a caller with no device session', async () => {
  const ctx = await setupTest();

  const client = buildTestClient(ctx.api.url, 'not-a-token');
  const listed = client.rules.listProposals();

  await Promise.allSettled([listed]);

  expect(listed).rejects.toMatchObject({ code: 'UNAUTHORIZED' });
});
