import { expect, test } from 'bun:test';
import { waitForCondition } from '@heynixie/testing';
import { z } from 'zod';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { startTestNixie } from './test-utils/start-test-nixie';

// nixie in a test build at ready, with a device signed in through the code it printed at start
async function setupTest() {
  const nixie = await startTestNixie();

  // boot data: every procedure but enrol needs a device session
  const clients = await createTestClient(nixie);

  return { ...nixie, ...clients };
}

test('it lists a skill proposal, rejects it with your reason, and the next turn reads the reason', async () => {
  const ctx = await setupTest();

  ctx.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__skill_write',
        input: {
          name: 'tide-tables',
          files: [
            {
              path: 'SKILL.md',
              text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
            },
          ],
        },
      },
    },
    { text: 'Proposed.' },
    { text: 'Understood.' },
  );

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Write a skill for reading tide tables.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Proposed.');
  });

  const listed = await runHostCommand(ctx.configPath, ['skill-pending']);

  const [{ proposalID, skillHash }] = z
    .tuple([z.object({ proposalID: z.string(), skillHash: z.string() })])
    .parse(JSON.parse(listed.stdout));

  await runHostCommand(ctx.configPath, [
    'skill-reject',
    proposalID,
    '--hash',
    skillHash,
    '--reason',
    'the tide tables come from a feed',
  ]);

  const after = await runHostCommand(ctx.configPath, ['skill-pending']);

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Fine, never mind.',
    thread: 'conversation',
  });

  await waitForCondition(async () => {
    const page = await ctx.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Understood.');
  });

  expect(JSON.parse(listed.stdout)).toMatchObject([
    {
      proposalID,
      name: 'tide-tables',
      baseHash: null,
      inForce: null,
      untypedToken: null,
      files: [
        {
          path: 'SKILL.md',
          text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n',
        },
      ],
    },
  ]);

  expect(JSON.parse(after.stdout)).toStrictEqual([]);

  expect(JSON.stringify(ctx.model.requests.map((request) => request.body?.messages))).toInclude(
    `rejected your skill proposal ${proposalID} (tide-tables). Reason: \\"the tide tables come from a feed\\".`,
  );
}, 60_000);

// the refusal comes before the command reads its configuration, so no server runs
test('it refuses an approval with no --hash, and reaches no server', async () => {
  const refused = await runHostCommand('/nonexistent/config.yaml', [
    'skill-approve',
    'k3x9m2p7qa',
    '--pull-request',
    'https://git.example.com/owner/definitions/pull/7',
  ]);

  expect(refused).toStrictEqual({
    exitCode: 2,
    stdout:
      'nixie skill-approve takes a proposal ID, --hash <skill hash> and --pull-request <url>\n',
  });
});

test('it refuses a rejection with no --reason, and reaches no server', async () => {
  const refused = await runHostCommand('/nonexistent/config.yaml', [
    'skill-reject',
    'k3x9m2p7qa',
    '--hash',
    'hash-b',
  ]);

  expect(refused).toStrictEqual({
    exitCode: 2,
    stdout: 'nixie skill-reject takes a proposal ID, --hash <skill hash> and --reason <why>\n',
  });
});
