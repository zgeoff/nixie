import { expect, onTestFinished, test } from 'bun:test';
import { mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFilesWith } from './collect-files-with';

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'collect-files-with-'));

  onTestFinished(() => rmSync(dir, { recursive: true, force: true }));

  return { dir };
}

test('it leaves out a matching file inside an excluded folder under the scanned folder', () => {
  const ctx = setupTest();

  mkdirSync(join(ctx.dir, 'task', 'projects'), { recursive: true });
  mkdirSync(join(ctx.dir, 'other'));
  writeFileSync(join(ctx.dir, 'task', 'projects', 'session.jsonl'), 'the PIN is GATE-1234');
  writeFileSync(join(ctx.dir, 'other', 'copy.txt'), 'the PIN is GATE-1234');

  expect(collectFilesWith([ctx.dir], 'GATE-1234', [join(ctx.dir, 'task')])).toStrictEqual([
    join(ctx.dir, 'other', 'copy.txt'),
  ]);
});

test('it keeps a matching file in a sibling folder whose name starts with the excluded name', () => {
  const ctx = setupTest();

  mkdirSync(join(ctx.dir, 'task'));
  mkdirSync(join(ctx.dir, 'task-2'));
  writeFileSync(join(ctx.dir, 'task-2', 'copy.txt'), 'the PIN is GATE-1234');

  expect(collectFilesWith([ctx.dir], 'GATE-1234', [join(ctx.dir, 'task')])).toStrictEqual([
    join(ctx.dir, 'task-2', 'copy.txt'),
  ]);
});

test('it finds every matching file when nothing is excluded', () => {
  const ctx = setupTest();

  mkdirSync(join(ctx.dir, 'task'));
  writeFileSync(join(ctx.dir, 'task', 'session.jsonl'), 'the PIN is GATE-1234');
  writeFileSync(join(ctx.dir, 'unrelated.txt'), 'no PIN here');

  expect(collectFilesWith([ctx.dir], 'GATE-1234')).toStrictEqual([
    join(ctx.dir, 'task', 'session.jsonl'),
  ]);
});
