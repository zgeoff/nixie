import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { buildMemoryTools } from '@heynixie/memory';
import {
  createConsolidationDiff,
  createMemoryItem,
  startTestMemory,
} from '@heynixie/memory/test-utils';
import invariant from 'tiny-invariant';
import { runHostCommand } from './test-utils/run-host-command';
import { runHostCommands } from './test-utils/run-host-commands';
import { startTestControlSocket } from './test-utils/start-test-control-socket';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-diff-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  const memory = await startTestMemory();

  await startTestControlSocket({
    path: join(directory, 'run', 'control.sock'),
    readMemory: () => memory.store,
  });

  return { directory, memory, configPath: join(directory, 'config.yaml') };
}

test('it prints the pending diff, approves one change alone and rejects another', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configPath,
    [
      `server: { data_dir: ${ctx.directory} }`,
      'models:',
      '  profiles:',
      '    chat-direct: { base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
    ].join('\n'),
  );

  const [stale, trip] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' }),
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
  });

  const [first, second] = diff.changes;

  invariant(first && second);

  const runs = await runHostCommands(ctx.configPath, [
    ['memory-diff'],
    ['memory-diff-approve', `${first.changeID}=${first.actionHash}`],
    ['memory-diff-reject', second.changeID, '--hash', second.actionHash],
    ['memory-diff'],
  ]);

  expect(runs.map((run): unknown => JSON.parse(run.stdout))).toMatchObject([
    { diffID: diff.diffID, changes: [{ changeID: first.changeID }, { changeID: second.changeID }] },
    { outcomes: [{ changeID: first.changeID, status: 'applied' }] },
    { changeID: second.changeID },
    null,
  ]);
}, 60_000);

test('it prints the comment the conversation left through memory.comment beside its change', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configPath,
    [
      `server: { data_dir: ${ctx.directory} }`,
      'models:',
      '  profiles:',
      '    chat-direct: { base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
    ].join('\n'),
  );

  const joke = await createMemoryItem(ctx.memory.store, { text: 'Names plants after drummers' });

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'rewrite', inputs: [joke], text: 'Owns plants', reason: 'Long.', source: 'owner' },
    ],
  });

  const [rewrite] = diff.changes;

  const comment = buildMemoryTools(ctx.memory.store, {
    clock: { now: () => Date.now() },
    ownerName: null,
    agentName: null,
    defaultZone: 'UTC',
  }).find((definition) => definition.name === 'memory.comment');

  invariant(rewrite && comment);

  await comment.run(
    {
      callID: 'call-1',
      tool: 'memory.comment',
      input: { changeID: rewrite.shortID, comment: 'This loses the drummers, which is the point.' },
      toolUseID: null,
    },
    {
      run: {
        runID: 'run-1',
        thread: 'conversation',
        tools: ['memory.comment'],
        model: { model: 'claude-test-1', profile: 'chat-direct' },
      },
    },
  );

  const run = await runHostCommand(ctx.configPath, ['memory-diff']);

  expect(JSON.parse(run.stdout)).toMatchObject({
    changes: [
      {
        changeID: rewrite.changeID,
        text: 'Owns plants',
        reason: 'Long.',
        comment: { text: 'This loses the drummers, which is the point.', at: expect.toBeString() },
      },
    ],
  });
}, 60_000);

test('it prints the summary of a conflict beside the changes of its diff', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configPath,
    [
      `server: { data_dir: ${ctx.directory} }`,
      'models:',
      '  profiles:',
      '    chat-direct: { base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
    ].join('\n'),
  );

  const [oat, black, trip] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [{ kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' }],
    summary: {
      text: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
      itemIDs: [oat.itemID, black.itemID, trip.itemID],
    },
  });

  const run = await runHostCommand(ctx.configPath, ['memory-diff']);

  expect(JSON.parse(run.stdout)).toMatchObject({
    diffID: diff.diffID,
    changes: [{ changeID: diff.changes[0]?.changeID }],
    summary: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
  });
}, 60_000);

test('it prints the summary alone when the run proposed no change', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configPath,
    [
      `server: { data_dir: ${ctx.directory} }`,
      'models:',
      '  profiles:',
      '    chat-direct: { base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
    ].join('\n'),
  );

  const [oat, black] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Takes oat milk in coffee' }),
    createMemoryItem(ctx.memory.store, { text: 'Drinks coffee black' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [],
    summary: {
      text: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
      itemIDs: [oat.itemID, black.itemID],
    },
  });

  const run = await runHostCommand(ctx.configPath, ['memory-diff']);

  expect(JSON.parse(run.stdout)).toStrictEqual({
    diffID: diff.diffID,
    model: 'claude-test-1',
    createdAt: new Date(diff.createdAt).toISOString(),
    changes: [],
    summary: 'Two items conflict and stay unchanged: one says oat milk, the other says black.',
  });
}, 60_000);

test('it approves the whole diff when it names every change', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.configPath,
    [
      `server: { data_dir: ${ctx.directory} }`,
      'models:',
      '  profiles:',
      '    chat-direct: { base_url: https://api.anthropic.com, credential: deployment:anthropic,',
      '      auth_header: x-api-key, model: claude-test-1, effort: medium }',
      '  roles: { conversation: chat-direct }',
      'imp: { url: http://127.0.0.1:7070, host_addresses: [192.0.2.10/32] }',
      'definitions: { source: { kind: path, path: /etc/nixie/definitions } }',
    ].join('\n'),
  );

  const [stale, trip] = await Promise.all([
    createMemoryItem(ctx.memory.store, { text: 'Has a dentist appointment' }),
    createMemoryItem(ctx.memory.store, { text: 'Is in Lisbon until May' }),
  ]);

  const diff = await createConsolidationDiff(ctx.memory, {
    changes: [
      { kind: 'retire', inputs: [stale], reason: 'The date has passed.', source: 'owner' },
      { kind: 'retire', inputs: [trip], reason: 'The trip has ended.', source: 'owner' },
    ],
  });

  const run = await runHostCommand(ctx.configPath, [
    'memory-diff-approve',
    ...diff.changes.map((change) => `${change.changeID}=${change.actionHash}`),
  ]);

  expect(JSON.parse(run.stdout)).toMatchObject({
    outcomes: [{ status: 'applied' }, { status: 'applied' }],
  });
}, 60_000);

test('it refuses a malformed answer before it reads the configuration', async () => {
  const runs = await runHostCommands('/nonexistent/config.yaml', [
    ['memory-diff-approve'],
    ['memory-diff-approve', 'change-1'],
    ['memory-diff-approve', 'change-1='],
    ['memory-diff-reject', 'change-1'],
  ]);

  expect(runs.map((run) => run.exitCode)).toStrictEqual([2, 2, 2, 2]);
});
