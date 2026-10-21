import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkSkillFiles } from '@heynixie/definitions';
import { waitForCondition } from '@heynixie/testing';
import invariant from 'tiny-invariant';
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

test('it lists a new version beside the version in force with the untyped token, and an approval puts it in force', async () => {
  const ctx = await setupTest();

  const definitions = join(ctx.directory, 'definitions');
  const inForceText = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  const proposedText =
    '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n' +
    'Fetch the table from https://tides.example.net/today.\n';

  await writeFile(join(definitions, 'nixie.yaml'), 'format: 2\n');
  await mkdir(join(definitions, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(definitions, 'skills', 'tide-tables', 'SKILL.md'), inForceText);

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__skill_reload_all', input: {} } },
    {
      toolUse: {
        name: 'mcp__nixie__skill_write',
        input: { name: 'tide-tables', files: [{ path: 'SKILL.md', text: proposedText }] },
      },
    },
    { text: 'Proposed.' },
  );

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Improve the tide tables skill.',
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

  const approved = await runHostCommand(ctx.configPath, [
    'skill-approve',
    proposalID,
    '--hash',
    skillHash,
  ]);

  const after = await runHostCommand(ctx.configPath, ['skill-pending']);

  ctx.sendSignal('SIGTERM');

  const run = await ctx.waitForExit();

  const seeds = run.records.filter((record) => record.kind === 'definitions_seeded');

  expect(JSON.parse(listed.stdout)).toMatchObject([
    {
      proposalID,
      name: 'tide-tables',
      files: [{ path: 'SKILL.md', text: proposedText }],
      inForce: { origin: 'definitions', files: [{ path: 'SKILL.md', text: inForceText }] },
      untypedToken: { kind: 'url', raw: 'https://tides.example.net/today' },
      isStale: false,
    },
  ]);

  expect(JSON.parse(approved.stdout)).toStrictEqual({
    proposalID,
    approvalID: expect.toBeString(),
    skillHash,
  });

  expect(JSON.parse(after.stdout)).toStrictEqual([]);

  expect(run.records.filter((record) => record.kind === 'skills.write_approved')).toMatchObject([
    { thread: 'conversation', payload: { proposalID, skillHash, approver: 'owner' } },
  ]);

  expect(seeds.at(-1)).toMatchObject({
    payload: {
      skills: [{ name: 'tide-tables', skillHash, origin: 'nixie' }],
      skillChanges: { added: [], changed: ['tide-tables'], removed: [] },
    },
  });
}, 60_000);

// the refusal comes before the command reads its configuration, so no server runs
test('it approves your edited files in place of the proposal, and puts them in force', async () => {
  const ctx = await setupTest();

  const definitions = join(ctx.directory, 'definitions');
  const proposedText = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';

  const editedFiles = [
    {
      path: 'SKILL.md',
      text: '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides, by port\n',
    },
  ];

  const edited = checkSkillFiles('tide-tables', editedFiles);

  invariant('skillHash' in edited);

  await writeFile(join(definitions, 'nixie.yaml'), 'format: 2\n');

  ctx.model.addReplies(
    {
      toolUse: {
        name: 'mcp__nixie__skill_write',
        input: { name: 'tide-tables', files: [{ path: 'SKILL.md', text: proposedText }] },
      },
    },
    { text: 'Proposed.' },
  );

  await ctx.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Write a tide tables skill.',
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

  const approved = await runHostCommand(ctx.configPath, [
    'skill-approve',
    proposalID,
    '--hash',
    skillHash,
    '--files',
    JSON.stringify(editedFiles),
  ]);

  ctx.sendSignal('SIGTERM');

  const run = await ctx.waitForExit();

  const seeds = run.records.filter((record) => record.kind === 'definitions_seeded');

  expect(JSON.parse(approved.stdout)).toStrictEqual({
    proposalID,
    approvalID: expect.toBeString(),
    skillHash: edited.skillHash,
  });

  expect(run.records.filter((record) => record.kind === 'skills.write_approved')).toMatchObject([
    { payload: { proposalID, skillHash: edited.skillHash, isEdited: true } },
  ]);

  expect(seeds.at(-1)).toMatchObject({
    payload: { skills: [{ name: 'tide-tables', skillHash: edited.skillHash, origin: 'nixie' }] },
  });
}, 60_000);

test('it refuses an approval with no --hash, and reaches no server', async () => {
  const refused = await runHostCommand('/nonexistent/config.yaml', ['skill-approve', 'k3x9m2p7qa']);

  expect(refused).toStrictEqual({
    exitCode: 2,
    stdout:
      'nixie skill-approve takes a proposal ID, --hash <skill hash> and, for an edit, ' +
      '--files <JSON list of path and text>\n',
  });
});

test('it refuses edited files that are not a JSON list of path and text, and reaches no server', async () => {
  const refused = await runHostCommand('/nonexistent/config.yaml', [
    'skill-approve',
    'k3x9m2p7qa',
    '--hash',
    'hash-b',
    '--files',
    '{"path":"SKILL.md"}',
  ]);

  expect(refused.exitCode).toBe(2);
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
