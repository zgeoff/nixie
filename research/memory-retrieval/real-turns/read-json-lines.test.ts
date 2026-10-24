import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { z } from 'zod';
import { readJSONLines } from './read-json-lines.ts';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'json-lines-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it reads each line that matches the schema and skips blank lines', async () => {
  const ctx = await setupTest();
  const path = join(ctx.dir, 'labels.jsonl');

  await writeFile(path, '{"caseID":"t4","relevant":["M1"]}\n\n{"caseID":"t9","relevant":[]}\n');

  expect(await readJSONLines(path, z.object({ caseID: z.string(), relevant: z.array(z.string()) }))).toStrictEqual([
    { caseID: 't4', relevant: ['M1'] },
    { caseID: 't9', relevant: [] },
  ]);
});

test('it rejects a line whose field has the wrong type, naming the line and the field', async () => {
  const ctx = await setupTest();
  const path = join(ctx.dir, 'labels.jsonl');

  await writeFile(path, '{"caseID":"t4","relevant":["M1"]}\n{"caseID":"t9","relevant":"M2"}\n');

  expect(readJSONLines(path, z.object({ caseID: z.string(), relevant: z.array(z.string()) }))).rejects.toThrow(
    `${path}:2 does not match its schema at relevant`,
  );
});

test('it rejects a line that is not JSON', async () => {
  const ctx = await setupTest();
  const path = join(ctx.dir, 'labels.jsonl');

  await writeFile(path, '{"caseID":"t4"\n');

  expect(readJSONLines(path, z.object({ caseID: z.string() }))).rejects.toThrow(`${path}:1 does not match its schema at (line)`);
});
