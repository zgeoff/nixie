import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { parseTaskFolder } from '../task/parse-task-folder';
import { buildTestTaskSeed } from '../test-utils/build-test-task-seed';
import { buildDefineVersion } from './build-define-version';
import type { TaskDefineInput } from './build-define-version';

function setupTest() {
  const seed = buildTestTaskSeed();

  return {
    buildVersion: (input: TaskDefineInput) => {
      const built = buildDefineVersion(input, seed);

      if (built.status !== 'built') {
        throw new Error(`the fixture is invalid: ${built.reasons.join('; ')}`);
      }

      return built.definition;
    },
    parseJSONText: (input: TaskDefineInput, id: string) => {
      const folder = { id, files: new Map([['task.yaml', JSON.stringify(input)]]) };

      return parseTaskFolder(folder, {
        toolNames: seed.toolNames,
        checkTaskStart: (start) => seed.checkTaskStart(start, 'conversation'),
      });
    },
  };
}

test.each([
  {
    title: 'a colon in the name and a weekly schedule',
    input: {
      name: 'Rain gauge: weekly total',
      brief: 'Read the gauge.',
      target: 'conversation',
      trigger: {
        schedule: { every: 'week', on: 'fri', at: '08:00', zone: 'owner', catchUp: 'once' },
      },
    },
  },
  {
    title: 'a multi-line brief with quotes and a hash, and an at trigger',
    input: {
      name: 'Call the vet',
      brief: 'Book the "check-up" # not a comment\nand ask about shots.\n',
      target: 'conversation',
      trigger: { at: '2027-03-09T14:00:00+11:00' },
    },
  },
  {
    title: 'a numeric-looking name, the string null and empty tools',
    input: {
      name: '2027',
      brief: 'null',
      target: 'task',
      trigger: { schedule: { every: 'day', at: '04:00', zone: 'owner', catchUp: 'once' } },
      tools: [],
    },
  },
  {
    title: 'a long brief, a tool and the optional keys',
    input: {
      name: 'Tidy the garden shed',
      brief: `${'Sort the tools by use and put the rarely used ones on the top shelf. '.repeat(6)}Done.`,
      target: 'task',
      trigger: { schedule: { every: 'day', at: '21:00', zone: 'owner', catchUp: 'once' } },
      tools: ['time.now'],
      memory: 'read',
      report: 'wake',
    },
  },
  {
    title: 'unicode in the name',
    input: {
      name: 'Naïve café check ☕',
      brief: 'Ask how the café is going.',
      target: 'conversation',
      trigger: { schedule: { every: 'day', at: '09:00', zone: 'owner', catchUp: 'once' } },
    },
  },
] satisfies readonly { title: string; input: TaskDefineInput }[])(
  'it stores $title as block YAML with one final newline, and the same form and hash as the JSON text gave',
  (row) => {
    const ctx = setupTest();
    const definition = ctx.buildVersion(row.input);
    const text = Object.values(definition.files)[0] ?? '';
    const old = ctx.parseJSONText(row.input, definition.definitionID);

    expect({
      text: { endsInOneNewline: /[^\n]\n$/u.test(text), isBlock: !text.startsWith('{') },
      parsed: Bun.YAML.parse(text),
      form: old.definition?.form,
      hash: old.definition?.hash,
    }).toStrictEqual({
      text: { endsInOneNewline: true, isBlock: true },
      parsed: structuredClone(row.input),
      form: definition.form,
      hash: definition.hash,
    });
  },
);

test('it stores a task.yaml that the default oxfmt check accepts', async () => {
  const ctx = setupTest();

  const directory = await mkdtemp(join(tmpdir(), 'nixie-render-task-yaml-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  // an empty config keeps this repo's own formatter settings away, as in the definitions repo
  await writeFile(join(directory, '.oxfmtrc.json'), '{}\n');

  const definition = ctx.buildVersion({
    name: 'Rain gauge: weekly total',
    brief: 'Book the "check-up" # not a comment\nand ask about shots.\n',
    target: 'conversation',
    trigger: {
      schedule: { every: 'week', on: 'fri', at: '08:00', zone: 'owner', catchUp: 'once' },
    },
  });

  const entries = Object.entries(definition.files);

  for (const entry of entries) {
    await mkdir(join(directory, dirname(entry[0])), { recursive: true });
    await writeFile(join(directory, entry[0]), entry[1]);
  }

  const oxfmt = join(import.meta.dir, '..', '..', '..', '..', 'node_modules', '.bin', 'oxfmt');

  const run = Bun.spawn([oxfmt, '--check', '.'], {
    cwd: directory,
    stdout: 'pipe',
    stderr: 'pipe',
  });

  const exitCode = await run.exited;

  expect({ filesChecked: entries.length > 0, exitCode }).toStrictEqual({
    filesChecked: true,
    exitCode: 0,
  });
});
