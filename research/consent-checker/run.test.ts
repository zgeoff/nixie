import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, readFile, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'consent-run-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir, entry: join(import.meta.dir, 'run.ts') };
}

test('it writes the cases and prints only their counts', async () => {
  const ctx = await setupTest();
  const plainPath = join(ctx.dir, 'records.jsonl');
  const outPath = join(ctx.dir, 'cases.jsonl');

  await writeFile(
    plainPath,
    [
      '{"sequence":1,"recordedAt":"2026-03-02T09:00:00Z","kind":"owner_message","thread":"conversation","parent":null,"payload":{"spans":"as_sent"},"erasable":{"status":"readable","fields":{"text":"note that the shed key is under the pot","spans":[]}}}',
      '{"sequence":2,"recordedAt":"2026-03-02T09:00:01Z","kind":"task.step_started","thread":"conversation","parent":null,"payload":{},"erasable":{"status":"none"}}',
      '{"sequence":3,"recordedAt":"2026-03-02T09:00:02Z","kind":"tool_called","thread":"conversation","parent":null,"payload":{"tool":"memory.remember"},"erasable":{"status":"readable","fields":{"input":{"text":"The shed key is under the pot"}}}}',
      '',
    ].join('\n'),
  );

  const child = Bun.spawnSync(['bun', ctx.entry, 'cases', '--plain', plainPath, '--out', outPath]);

  expect(child.exitCode).toBe(0);
  expect(child.stdout.toString()).toBe(
    'turns 1, natural pairs 1, swapped pairs 0\n' +
      'left out: 0 read-only calls, 0 calls with no owner message, 0 unreadable calls, 0 unreadable messages, 0 messages with unknown spans\n' +
      '  memory.remember: 1\n',
  );
  expect(
    (await readFile(outPath, 'utf8'))
      .trim()
      .split('\n')
      .map((line) => JSON.parse(line).caseID),
  ).toStrictEqual(['2/3']);
});

test('it refuses an unknown command', () => {
  const child = Bun.spawnSync(['bun', join(import.meta.dir, 'run.ts'), 'label']);

  expect(child.exitCode).toBe(1);
  expect(child.stderr.toString()).toInclude('unknown command label; pass cases, check or score');
});
