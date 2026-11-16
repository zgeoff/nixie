import { expect, test } from 'bun:test';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { parseTaskDefinitions } from './parse-task-definitions';
import type { SeedFaultCode } from './types';

function setupTest() {
  const seed = buildTestTaskSeed();

  return {
    parse: (files: Record<string, string>) =>
      parseTaskDefinitions(new Map(Object.entries(files)), seed),
  };
}

test('it accepts a definition and fills the defaults of the keys it leaves out', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'tasks/rain-gauge/task.yaml': [
      'name: Check the rain gauge',
      'brief: Read the gauge and note the total.',
      'memory: read',
      'tools:',
      '  - memory.recall',
      'report: wake',
      'trigger:',
      '  schedule:',
      '    every: week',
      '    on: fri',
      '    at: "08:00"',
      '',
    ].join('\n'),
    'tasks/rain-gauge/instructions.md': 'Keep the note to one line.\n',
  });

  expect(parsed).toStrictEqual({
    definitions: [
      {
        id: 'rain-gauge',
        hash: expect.stringMatching(/^[0-9a-f]{64}$/u),
        form: {
          name: 'Check the rain gauge',
          brief: 'Read the gauge and note the total.',
          memory: 'read',
          tools: ['memory.recall'],
          report: 'wake',
          trigger: {
            schedule: { every: 'week', on: 'fri', at: '08:00', zone: 'owner', catchUp: 'once' },
          },
          enabled: true,
          target: 'task',
          context: 'fresh',
          wakeable: false,
          step: null,
          destinations: [],
          maxCalls: {},
        },
        files: {
          'tasks/rain-gauge/task.yaml': expect.any(String),
          'tasks/rain-gauge/instructions.md': 'Keep the note to one line.\n',
        },
      },
    ],
    warnings: [],
    faults: [],
    paths: new Set(['tasks/rain-gauge/task.yaml', 'tasks/rain-gauge/instructions.md']),
  });
});

test('it accepts a reminder with an at trigger', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'tasks/call-the-vet/task.yaml':
      'name: Call the vet\nbrief: Book the check-up.\ntarget: conversation\ntrigger:\n  at: "2027-03-09T14:00:00+11:00"\n',
  });

  expect(parsed.faults).toStrictEqual([]);
  expect(parsed.definitions[0]?.form['trigger']).toStrictEqual({ at: '2027-03-09T14:00:00+11:00' });
});

test('it keeps the step file in the files and the hash of a definition that names it', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\nstep:\n  file: gauge.ts\n  api: 1\n`,
    'tasks/rain-gauge/gauge.ts': 'export const total = 1;\n',
  });

  expect(parsed.faults).toStrictEqual([]);

  expect(parsed.definitions[0]?.files['tasks/rain-gauge/gauge.ts']).toBe(
    'export const total = 1;\n',
  );

  expect(parsed.paths.has('tasks/rain-gauge/gauge.ts')).toBe(true);
});

test.each<[SeedFaultCode, Record<string, string>, string]>([
  [
    'missing_task_yaml',
    { 'tasks/rain-gauge/instructions.md': 'Keep it short.\n' },
    'tasks/rain-gauge/',
  ],
  [
    'bad_id',
    {
      'tasks/Rain_Gauge/task.yaml':
        'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
    },
    'tasks/Rain_Gauge/',
  ],
  [
    'bad_id',
    {
      [`tasks/${'a'.repeat(65)}/task.yaml`]:
        'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
    },
    `tasks/${'a'.repeat(65)}/`,
  ],
  [
    'unnamed_step_file',
    {
      'tasks/rain-gauge/task.yaml':
        'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
      'tasks/rain-gauge/gauge.ts': 'export {};\n',
    },
    'tasks/rain-gauge/gauge.ts',
  ],
  [
    'unnamed_step_file',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\nstep:\n  file: gauge.ts\n  api: 1\n`,
      'tasks/rain-gauge/gauge.ts': 'export {};\n',
      'tasks/rain-gauge/other.ts': 'export {};\n',
    },
    'tasks/rain-gauge/other.ts',
  ],
  [
    'reminder_key',
    {
      'tasks/call-the-vet/task.yaml':
        'name: Call the vet\nbrief: Book it.\ntarget: conversation\nwakeable: true\ntrigger:\n  at: "2027-03-09T14:00:00Z"\n',
    },
    'tasks/call-the-vet/task.yaml',
  ],
  [
    'reminder_without_trigger',
    {
      'tasks/call-the-vet/task.yaml': 'name: Call the vet\nbrief: Book it.\ntarget: conversation\n',
    },
    'tasks/call-the-vet/task.yaml',
  ],
  [
    'bad_slot',
    {
      'tasks/rain-gauge/task.yaml':
        'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
      'tasks/rain-gauge/instructions.md': 'It fired at {{ trigger.firedAt }}.\n',
    },
    'tasks/rain-gauge/instructions.md',
  ],
  [
    'bad_slot',
    {
      'tasks/rain-gauge/task.yaml':
        'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
      'tasks/rain-gauge/instructions.md': 'Read {{ inputs.gauge }}.\n',
    },
    'tasks/rain-gauge/instructions.md',
  ],
  [
    'bad_schedule',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntrigger:\n  schedule:\n    every: month\n    at: "08:00"\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_schedule',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntrigger:\n  schedule:\n    every: week\n    at: "08:00"\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'at_without_offset',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntrigger:\n  at: "2027-03-09T14:00:00"\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'start_refused',
    { 'tasks/rain-gauge/task.yaml': 'brief: Read the gauge.\n' },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'start_refused',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\nlimits:\n  turns: nine\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'start_refused',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntools:\n  - task.define\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'start_refused',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntools:\n  - memory.recall\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_max_calls',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntools:\n  - web.fetch\nmaxCalls:\n  web.fetch: 0\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_max_calls',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntools:\n  - web.fetch\nmaxCalls:\n  files.write: 2\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_max_calls',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\nmaxCalls: many\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_definition',
    { 'tasks/rain-gauge/task.yaml': 'name: [unclosed\n' },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_definition',
    { 'tasks/rain-gauge/task.yaml': '- one\n- two\n' },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_definition',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\nenabled: "yes"\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_definition',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntarget: elsewhere\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_definition',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ncontext: forever\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_definition',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\nwakeable: 1\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_definition',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\nstep:\n  file: gauge.ts\n  api: 1\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_definition',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\nstep:\n  file: gauge.ts\n  api: 2\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_definition',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ndestinations:\n  - "two words"\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_definition',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ndestinations:\n  - ""\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
  [
    'bad_definition',
    {
      'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntrigger:\n  at: "next week"\n`,
    },
    'tasks/rain-gauge/task.yaml',
  ],
])('it refuses a fault of %s at %s', (code, files, path) => {
  const ctx = setupTest();
  const parsed = ctx.parse(files);

  expect(parsed.faults).toStrictEqual([{ path, fault: code, reasons: expect.any(Array) }]);
});

test('it lists a start refusal with the sentences of the check', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntools:\n  - task.define\n`,
  });

  expect(parsed.faults[0]?.reasons).toHaveLength(1);
});

test('it reports every fault of every folder', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'tasks/a-first/task.yaml': 'brief: Missing a name.\n',
    'tasks/b-second/instructions.md': 'No task file.\n',
  });

  expect(parsed.faults.map((fault) => [fault.path, fault.fault])).toStrictEqual([
    ['tasks/a-first/task.yaml', 'start_refused'],
    ['tasks/b-second/', 'missing_task_yaml'],
  ]);
});

test.each([
  ['role', 'role: helper\n', 'role'],
  ['runner', 'runner: sandbox\n', 'runner'],
  ['skills', 'skills:\n  - pdf-forms\n', 'skills'],
  ['inputs', 'inputs:\n  gauge: text\n', 'inputs'],
  ['trigger.log', 'trigger:\n  log:\n    kind: note\n', 'trigger.log'],
  ['trigger.poll', 'trigger:\n  poll:\n    every: 5\n', 'trigger.poll'],
  [
    'trigger.schedule.cron',
    'trigger:\n  schedule:\n    every: day\n    at: "08:00"\n    cron: "* * * * *"\n',
    'trigger.schedule.cron',
  ],
  [
    'trigger.schedule.every.extra',
    'trigger:\n  schedule:\n    every:\n      minutes: 10\n      extra: true\n',
    'trigger.schedule.every.extra',
  ],
  [
    'trigger.schedule.window.step',
    'trigger:\n  schedule:\n    every: day\n    window:\n      from: "08:00"\n      until: "09:00"\n      step: 5\n',
    'trigger.schedule.window.step',
  ],
  ['step.mode', 'step:\n  file: gauge.ts\n  api: 1\n  mode: fast\n', 'step.mode'],
  ['limits.hours', 'limits:\n  turns: 5\n  hours: 2\n', 'limits.hours'],
])('it skips a definition that holds %s, with a warning that names it', (_label, extra, field) => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\n${extra}`,
    'tasks/gauge-too/task.yaml':
      'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
  });

  expect(parsed.warnings).toStrictEqual([
    { kind: 'field_unknown', definition: 'rain-gauge', field },
  ]);

  expect(parsed.faults).toStrictEqual([]);
  expect(parsed.definitions.map((definition) => definition.id)).toStrictEqual(['gauge-too']);
  expect(parsed.paths).toStrictEqual(new Set(['tasks/gauge-too/task.yaml']));
});

test('it skips a definition with an unknown field instead of refusing its known keys', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'tasks/rain-gauge/task.yaml': 'role: helper\nenabled: "yes"\ntools:\n  - task.define\n',
    'tasks/rain-gauge/stray.ts': 'export {};\n',
    'tasks/rain-gauge/instructions.md': 'Read {{ inputs.gauge }}.\n',
  });

  expect(parsed.faults).toStrictEqual([]);

  expect(parsed.warnings).toStrictEqual([
    { kind: 'field_unknown', definition: 'rain-gauge', field: 'role' },
  ]);
});

test('it drops a tool that nothing registers, with a warning, and keeps the rest', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntools:\n  - time.now\n  - telepathy.send\n`,
  });

  expect(parsed.warnings).toStrictEqual([
    { kind: 'tool_dropped', definition: 'rain-gauge', tool: 'telepathy.send' },
  ]);

  expect(parsed.definitions[0]?.form['tools']).toStrictEqual(['time.now']);
});

test('it accepts a registered tool that the conversation cannot hand to a task', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntools:\n  - files.write\n`,
  });

  expect(parsed.faults).toStrictEqual([]);
  expect(parsed.definitions[0]?.form['tools']).toStrictEqual(['files.write']);
});

test('it accepts a cap on a tool that the definition lists', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'tasks/rain-gauge/task.yaml': `name: Check the rain gauge\nbrief: Read the gauge and note the total.\ntools:\n  - web.fetch\nmaxCalls:\n  web.fetch: 3\n`,
  });

  expect(parsed.faults).toStrictEqual([]);
  expect(parsed.definitions[0]?.form['maxCalls']).toStrictEqual({ 'web.fetch': 3 });
});

test('it gives a definition another hash after an edit of its instructions', () => {
  const ctx = setupTest();

  const before = ctx.parse({
    'tasks/rain-gauge/task.yaml':
      'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
    'tasks/rain-gauge/instructions.md': 'Keep it short.\n',
  });

  const after = ctx.parse({
    'tasks/rain-gauge/task.yaml':
      'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
    'tasks/rain-gauge/instructions.md': 'Keep it long.\n',
  });

  expect(after.definitions[0]?.hash).not.toBe(before.definitions[0]?.hash);
});

test('it gives two folders with the same task.yaml their own hashes', () => {
  const ctx = setupTest();
  const yaml = 'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n';
  const parsed = ctx.parse({ 'tasks/first/task.yaml': yaml, 'tasks/second/task.yaml': yaml });

  expect(parsed.definitions[0]?.hash).not.toBe(parsed.definitions[1]?.hash);
});

test('it gives a definition the same hash after a comment in its task.yaml', () => {
  const ctx = setupTest();

  const before = ctx.parse({
    'tasks/rain-gauge/task.yaml':
      'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
  });

  const after = ctx.parse({
    'tasks/rain-gauge/task.yaml': `# the garden gauge\nname: Check the rain gauge\nbrief: Read the gauge and note the total.\n`,
  });

  expect(after.definitions[0]?.hash).toBe(before.definitions[0]?.hash);
});

test('it gives a definition the same hash after a change of line endings in its instructions', () => {
  const ctx = setupTest();

  const lf = ctx.parse({
    'tasks/rain-gauge/task.yaml':
      'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
    'tasks/rain-gauge/instructions.md': 'Keep it short.\nThen stop.\n',
  });

  const crlf = ctx.parse({
    'tasks/rain-gauge/task.yaml':
      'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
    'tasks/rain-gauge/instructions.md': 'Keep it short.\r\nThen stop.\r\n',
  });

  expect(crlf.definitions[0]?.hash).toBe(lf.definitions[0]?.hash);
});

test('it gives a definition another hash after an edit of its step file', () => {
  const ctx = setupTest();
  const yaml = `name: Check the rain gauge\nbrief: Read the gauge and note the total.\nstep:\n  file: gauge.ts\n  api: 1\n`;

  const before = ctx.parse({
    'tasks/rain-gauge/task.yaml': yaml,
    'tasks/rain-gauge/gauge.ts': 'a',
  });

  const after = ctx.parse({ 'tasks/rain-gauge/task.yaml': yaml, 'tasks/rain-gauge/gauge.ts': 'b' });

  expect(after.definitions[0]?.hash).not.toBe(before.definitions[0]?.hash);
});

test('it leaves a file outside a definition folder out of the applied files, with no fault', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'tasks/loose.yaml': 'name: Loose\n',
    'tasks/rain-gauge/task.yaml':
      'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
    'tasks/rain-gauge/notes.md': 'Some notes.\n',
    'tasks/rain-gauge/other.yaml': 'name: Other\n',
    'tasks/rain-gauge/nested/deep.ts': 'export {};\n',
  });

  expect(parsed.faults).toStrictEqual([]);
  expect(parsed.paths).toStrictEqual(new Set(['tasks/rain-gauge/task.yaml']));
});

test('it reads no definition from a folder outside tasks', () => {
  const ctx = setupTest();

  const parsed = ctx.parse({
    'jobs/rain-gauge/task.yaml':
      'name: Check the rain gauge\nbrief: Read the gauge and note the total.\n',
  });

  expect(parsed.definitions).toStrictEqual([]);
});
