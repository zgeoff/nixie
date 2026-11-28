import { expect, test } from 'bun:test';
import { writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { runOracle, startE2ENixie } from '@heynixie/server/test-utils';

async function setupTest(definition: readonly string[]) {
  const skills = [
    { name: 'tide-tables', description: 'Reads a tide table.', body: '# Tides\nRead the table.' },
    { name: 'bird-log', description: 'Logs a bird sighting.', body: '# Birds\nLog the bird.' },
  ];

  const nixie = await startE2ENixie({
    skills,
    taskDefinitions: [
      {
        id: 'water-the-tomatoes',
        yaml: [
          'name: Water the tomatoes',
          'brief: Water the tomatoes in the greenhouse and report when done.',
          ...definition,
          'trigger:',
          '  schedule:',
          '    every:',
          '      minutes: 5',
          '',
        ].join('\n'),
        instructions: 'Keep the report to one line.\n',
      },
    ],
  });

  return { nixie };
}

test('it gives a job run the skills its definition lists: the tools, the catalog and a refusal for a skill off the list', async () => {
  const ctx = await setupTest(['skills:', '  - tide-tables']);

  const child = ctx.nixie.harness.start();

  await child.ready;

  await ctx.nixie.waitForQueueCheck();

  ctx.nixie.model.addReplies(
    { toolUse: { name: 'mcp__nixie__skill_read', input: { name: 'tide-tables' } } },
    { toolUse: { name: 'mcp__nixie__skill_read', input: { name: 'bird-log' } } },
    {
      toolUse: { name: 'mcp__nixie__task_report', input: { summary: 'The tomatoes are watered.' } },
    },
    { text: 'Done.' },
  );

  await ctx.nixie.harness.advance(300_000, { settle: true });

  const fired = await ctx.nixie.waitForRecord((record) => record.kind === 'trigger.fired');

  await ctx.nixie.waitForRecord(
    (record) =>
      record.kind === 'task_message' &&
      record.payload['kind'] === 'report' &&
      record.payload['from'] === fired.thread,
  );

  await child.kill();

  const request = ctx.nixie.model.requests.find((entry) => entry.path === '/v1/messages');
  const tools = request?.body?.tools?.map((tool) => tool.name) ?? [];
  const system = JSON.stringify(request?.body?.system);

  const records = await ctx.nixie.readRecords();
  const oracle = await runOracle(ctx.nixie);

  const outcomes = records
    .filter((record) => record.kind === 'tool_result' && record.thread === fired.thread)
    .map((record) => record.payload['outcome']);

  expect(tools.filter((name) => /skill_|code_run/u.test(name))).toStrictEqual([
    'mcp__nixie__code_run',
    'mcp__nixie__skill_read',
    'mcp__nixie__skill_reload',
    'mcp__nixie__skill_reload_all',
  ]);

  expect(system).toInclude('tide-tables: Reads a tide table.');
  expect(system).not.toInclude('bird-log');
  expect(outcomes).toStrictEqual(['result', 'error', 'result']);
  expect(oracle.repeatedActions).toStrictEqual([]);
});

test('it gives a job run whose definition lists no skill no skill tool and no catalog', async () => {
  const ctx = await setupTest([]);

  const child = ctx.nixie.harness.start();

  await child.ready;

  await ctx.nixie.waitForQueueCheck();

  ctx.nixie.model.addReplies(
    {
      toolUse: { name: 'mcp__nixie__task_report', input: { summary: 'The tomatoes are watered.' } },
    },
    { text: 'Done.' },
  );

  await ctx.nixie.harness.advance(300_000, { settle: true });

  const fired = await ctx.nixie.waitForRecord((record) => record.kind === 'trigger.fired');

  await ctx.nixie.waitForRecord(
    (record) =>
      record.kind === 'task_message' &&
      record.payload['kind'] === 'report' &&
      record.payload['from'] === fired.thread,
  );

  await child.kill();

  const request = ctx.nixie.model.requests.find((entry) => entry.path === '/v1/messages');
  const tools = request?.body?.tools?.map((tool) => tool.name) ?? [];
  const system = JSON.stringify(request?.body?.system);

  expect(tools.filter((name) => name.includes('skill_'))).toStrictEqual([]);
  expect(system).not.toInclude('tide-tables');
});

test.each([
  { tool: 'skill_read', input: { name: 'bird-log' }, outcome: 'error' },
  { tool: 'skill_reload', input: { name: 'bird-log' }, outcome: 'error' },
  {
    tool: 'code.run',
    input: { language: 'python', program: 'print(1)', skills: ['bird-log'] },
    outcome: 'error',
  },
  { tool: 'skill_reload_all', input: {}, outcome: 'result' },
] as const)(
  'it runs $tool of a job run only on the skills its definition lists now, though an earlier run pinned a skill it dropped',
  async (row) => {
    const ctx = await setupTest([
      'context: continuing',
      'skills:',
      '  - bird-log',
      '  - tide-tables',
    ]);

    const first = ctx.nixie.harness.start();

    await first.ready;

    await ctx.nixie.waitForQueueCheck();

    ctx.nixie.model.addReplies({ text: 'Done.' });

    await ctx.nixie.harness.advance(300_000, { settle: true });

    const fired = await ctx.nixie.waitForRecord((record) => record.kind === 'trigger.fired');

    await ctx.nixie.waitForRecord(
      (record) => record.kind === 'task.run_ended' && record.thread === fired.thread,
    );

    await first.kill();

    await writeFile(
      join(ctx.nixie.directory, 'definitions', 'tasks', 'water-the-tomatoes', 'task.yaml'),
      [
        'name: Water the tomatoes',
        'brief: Water the tomatoes in the greenhouse and report when done.',
        'context: continuing',
        'skills:',
        '  - tide-tables',
        'trigger:',
        '  schedule:',
        '    every:',
        '      minutes: 5',
        '',
      ].join('\n'),
    );

    const second = ctx.nixie.harness.start();

    await second.ready;

    await ctx.nixie.waitForQueueCheck();

    const before = await ctx.nixie.readRecords();

    const lastSequenceBefore = before.at(-1)?.sequence ?? 0;

    ctx.nixie.model.addReplies(
      { toolUse: { name: `mcp__nixie__${row.tool.replace('.', '_')}`, input: row.input } },
      { text: 'Done.' },
    );

    await ctx.nixie.harness.advance(300_000, { settle: true });

    await ctx.nixie.waitForRecord(
      (record) => record.kind === 'task.run_ended' && record.sequence > lastSequenceBefore,
    );

    await second.kill();

    const all = await ctx.nixie.readRecords();

    const records = all.filter((record) => record.sequence > lastSequenceBefore);

    const outcomes = records
      .filter((record) => record.kind === 'tool_result')
      .map((record) => record.payload['outcome']);

    const reloaded = records.filter((record) => record.kind === 'skills.reloaded');

    expect(outcomes).toStrictEqual([row.outcome]);
    expect(JSON.stringify(reloaded)).not.toInclude('bird-log');
  },
);
