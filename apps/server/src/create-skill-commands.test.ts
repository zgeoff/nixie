import { expect, test } from 'bun:test';
import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { checkSkillFiles } from '@heynixie/definitions';
import invariant from 'tiny-invariant';
import { z } from 'zod';
import { createTestClient } from './test-utils/create-test-client';
import { runHostCommand } from './test-utils/run-host-command';
import { startTestNixie } from './test-utils/start-test-nixie';
import { waitForTurn } from './test-utils/wait-for-turn';

async function setupTest() {
  const nixie = await startTestNixie();

  return nixie;
}

test('it lists a skill proposal, rejects it with your reason, and the next turn reads the reason', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

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

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Write a skill for reading tide tables.',
    thread: 'conversation',
  });

  await waitForTurn(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

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

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Fine, never mind.',
    thread: 'conversation',
  });

  await waitForTurn(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

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
  const api = await createTestClient(ctx);

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

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Improve the tide tables skill.',
    thread: 'conversation',
  });

  await waitForTurn(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

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
  const written = await runHostCommand(ctx.configPath, ['skill-written']);

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

  expect(JSON.parse(written.stdout)).toMatchObject([
    { proposalID, name: 'tide-tables', skillHash, isConflict: false },
  ]);

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

test('it approves your edited files in place of the proposal, and puts them in force', async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

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

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Write a tide tables skill.',
    thread: 'conversation',
  });

  await waitForTurn(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

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

test("it resolves a conflict by keeping nixie's version, which stays in force with no conflict", async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  const definitions = join(ctx.directory, 'definitions');
  const inForceText = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';
  const proposedText = `${inForceText}By port.\n`;

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
    { toolUse: { name: 'mcp__nixie__skill_reload_all', input: {} } },
    { text: 'Reloaded.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Improve the tide tables skill.',
    thread: 'conversation',
  });

  await waitForTurn(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

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

  const approvalID = z
    .object({ approvalID: z.string() })
    .parse(JSON.parse(approved.stdout)).approvalID;

  await writeFile(
    join(definitions, 'skills', 'tide-tables', 'SKILL.md'),
    `${inForceText}By hour.\n`,
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Reload the skills.',
    thread: 'conversation',
  });

  await waitForTurn(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

    return page.records.some((record) => record.message?.text === 'Reloaded.');
  });

  const conflicted = await runHostCommand(ctx.configPath, ['skill-written']);

  const resolved = await runHostCommand(ctx.configPath, [
    'skill-resolve',
    approvalID,
    '--keep',
    'nixie',
  ]);

  const written = await runHostCommand(ctx.configPath, ['skill-written']);

  expect(JSON.parse(conflicted.stdout)).toMatchObject([{ approvalID, isConflict: true }]);

  expect(resolved).toStrictEqual({
    exitCode: 0,
    stdout: `${JSON.stringify({ approvalID, keep: 'nixie' })}\n`,
  });

  expect(JSON.parse(written.stdout)).toMatchObject([
    { approvalID, name: 'tide-tables', skillHash, isConflict: false },
  ]);
}, 60_000);

test("it resolves a skill nixie wrote by keeping the definitions' version, which goes back in force", async () => {
  const ctx = await setupTest();
  const api = await createTestClient(ctx);

  const definitions = join(ctx.directory, 'definitions');
  const inForceText = '---\nname: tide-tables\ndescription: Reads a tide table.\n---\n# Tides\n';
  const inForce = checkSkillFiles('tide-tables', [{ path: 'SKILL.md', text: inForceText }]);

  invariant('skillHash' in inForce);

  await writeFile(join(definitions, 'nixie.yaml'), 'format: 2\n');
  await mkdir(join(definitions, 'skills', 'tide-tables'), { recursive: true });
  await writeFile(join(definitions, 'skills', 'tide-tables', 'SKILL.md'), inForceText);

  ctx.model.addReplies(
    { toolUse: { name: 'mcp__nixie__skill_reload_all', input: {} } },
    {
      toolUse: {
        name: 'mcp__nixie__skill_write',
        input: {
          name: 'tide-tables',
          files: [{ path: 'SKILL.md', text: `${inForceText}By port.\n` }],
        },
      },
    },
    { text: 'Proposed.' },
  );

  await api.client.conversation.send({
    clientMessageId: crypto.randomUUID(),
    spans: [],
    text: 'Improve the tide tables skill.',
    thread: 'conversation',
  });

  await waitForTurn(async () => {
    const page = await api.client.conversation.read({ thread: 'conversation' });

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

  const approvalID = z
    .object({ approvalID: z.string() })
    .parse(JSON.parse(approved.stdout)).approvalID;

  const resolved = await runHostCommand(ctx.configPath, [
    'skill-resolve',
    approvalID,
    '--keep',
    'definitions',
  ]);

  const written = await runHostCommand(ctx.configPath, ['skill-written']);

  ctx.sendSignal('SIGTERM');

  const run = await ctx.waitForExit();

  const seeds = run.records.filter((record) => record.kind === 'definitions_seeded');

  expect(resolved).toStrictEqual({
    exitCode: 0,
    stdout: `${JSON.stringify({ approvalID, keep: 'definitions' })}\n`,
  });

  expect(JSON.parse(written.stdout)).toStrictEqual([]);

  expect(seeds.at(-1)).toMatchObject({
    payload: {
      skills: [{ name: 'tide-tables', skillHash: inForce.skillHash, origin: 'definitions' }],
    },
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
}, 30_000);

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
}, 30_000);

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
}, 30_000);

test('it refuses a resolve that keeps neither side, and reaches no server', async () => {
  const refused = await runHostCommand('/nonexistent/config.yaml', [
    'skill-resolve',
    '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
    '--keep',
    'both',
  ]);

  expect(refused).toStrictEqual({
    exitCode: 1,
    stdout: `nixie: Optional argument '--keep' should be chosen from 'enum' ["nixie", "definitions"] values\n`,
  });
}, 30_000);

test('it refuses a resolve given a second word, and reaches no server', async () => {
  const refused = await runHostCommand('/nonexistent/config.yaml', [
    'skill-resolve',
    '5b1e0c7a-3d9f-4e62-8a14-7c2f6b0d9e31',
    '9e4a2f61-7b0c-4d38-b5e2-1a6c8f3d0b74',
    '--keep',
    'nixie',
  ]);

  expect(refused).toStrictEqual({
    exitCode: 2,
    stdout: 'nixie skill-resolve takes an approval ID and --keep nixie|definitions\n',
  });
}, 30_000);
