import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { writeTaskYAMLSamples } from './write-task-yaml-samples';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-task-yaml-samples-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return {
    directory,
    readSample: (path: string) => readFile(join(directory, path), 'utf8'),
  };
}

test('it writes the task.yaml of each sample at its export path', async () => {
  const ctx = await setupTest();
  const written = await writeTaskYAMLSamples(ctx.directory);

  expect(written).toStrictEqual([
    'tasks/rain-gauge/task.yaml',
    'tasks/call-the-vet/task.yaml',
    'tasks/2027/task.yaml',
    'tasks/tidy-the-garden-shed/task.yaml',
    'tasks/naive-cafe-check/task.yaml',
  ]);
});

test('it writes a sample as block YAML with one final newline', async () => {
  const ctx = await setupTest();

  await writeTaskYAMLSamples(ctx.directory);

  const text = await ctx.readSample('tasks/call-the-vet/task.yaml');

  expect(text).toBe(
    [
      'name: Call the vet',
      String.raw`brief: "Book the \"check-up\" # not a comment\nand ask about shots.\n"`,
      'target: conversation',
      'trigger:',
      '  at: 2027-03-09T14:00:00+11:00',
      '',
    ].join('\n'),
  );
});
