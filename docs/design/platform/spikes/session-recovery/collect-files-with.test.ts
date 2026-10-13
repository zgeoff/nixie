import { expect, onTestFinished, test } from 'bun:test';
import { chmodSync, mkdirSync, mkdtempSync, rmSync, writeFileSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { collectFilesWith } from './collect-files-with';

// root reads a file whatever its mode, so a permission error needs another user; Bun 1.4.2's
// skipIf takes a boolean and has no in-body skip
const isRoot = process.getuid?.() === 0;

function setupTest() {
  const dir = mkdtempSync(join(tmpdir(), 'collect-files-with-'));

  // a folder a test locks must be listable again before its removal
  onTestFinished(() => {
    Bun.spawnSync(['chmod', '-R', 'u+rwx', dir]);
    rmSync(dir, { recursive: true, force: true });
  });

  return { dir };
}

test('it leaves out a matching file inside an excluded folder under the scanned folder', () => {
  const ctx = setupTest();

  mkdirSync(join(ctx.dir, 'task', 'projects'), { recursive: true });
  mkdirSync(join(ctx.dir, 'other'));
  writeFileSync(join(ctx.dir, 'task', 'projects', 'session.jsonl'), 'the PIN is GATE-1234');
  writeFileSync(join(ctx.dir, 'other', 'copy.txt'), 'the PIN is GATE-1234');

  expect(collectFilesWith([ctx.dir], 'GATE-1234', [join(ctx.dir, 'task')])).toStrictEqual({
    found: [join(ctx.dir, 'other', 'copy.txt')],
    unread: [],
  });
});

test('it keeps a matching file in a sibling folder whose name starts with the excluded name', () => {
  const ctx = setupTest();

  mkdirSync(join(ctx.dir, 'task'));
  mkdirSync(join(ctx.dir, 'task-2'));
  writeFileSync(join(ctx.dir, 'task-2', 'copy.txt'), 'the PIN is GATE-1234');

  expect(collectFilesWith([ctx.dir], 'GATE-1234', [join(ctx.dir, 'task')])).toStrictEqual({
    found: [join(ctx.dir, 'task-2', 'copy.txt')],
    unread: [],
  });
});

test('it finds every matching file when nothing is excluded', () => {
  const ctx = setupTest();

  mkdirSync(join(ctx.dir, 'task'));
  writeFileSync(join(ctx.dir, 'task', 'session.jsonl'), 'the PIN is GATE-1234');
  writeFileSync(join(ctx.dir, 'unrelated.txt'), 'no PIN here');

  expect(collectFilesWith([ctx.dir], 'GATE-1234')).toStrictEqual({
    found: [join(ctx.dir, 'task', 'session.jsonl')],
    unread: [],
  });
});

test('it finds the text at the end of a file of 50 MB', () => {
  const ctx = setupTest();
  const content = Buffer.alloc(50_000_000, 'a');
  content.write('GATE-1234', content.length - 'GATE-1234'.length);

  writeFileSync(join(ctx.dir, 'large.jsonl'), content);

  expect(collectFilesWith([ctx.dir], 'GATE-1234')).toStrictEqual({
    found: [join(ctx.dir, 'large.jsonl')],
    unread: [],
  });
});

test('it finds the text where it crosses a read boundary in a file of 50 MB', () => {
  const ctx = setupTest();
  const content = Buffer.alloc(50_000_000, 'a');
  content.write('GATE-1234', 16 * 1024 * 1024 - 4);

  writeFileSync(join(ctx.dir, 'large.jsonl'), content);

  expect(collectFilesWith([ctx.dir], 'GATE-1234')).toStrictEqual({
    found: [join(ctx.dir, 'large.jsonl')],
    unread: [],
  });
});

test('it reports no file when a file of 50 MB does not hold the text', () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.dir, 'large.jsonl'), Buffer.alloc(50_000_000, 'a'));

  expect(collectFilesWith([ctx.dir], 'GATE-1234')).toStrictEqual({ found: [], unread: [] });
});

test.skipIf(isRoot)('it reports a file it cannot read as unread, never as clean', () => {
  const ctx = setupTest();

  writeFileSync(join(ctx.dir, 'locked.jsonl'), 'the PIN is GATE-1234');
  chmodSync(join(ctx.dir, 'locked.jsonl'), 0o000);
  writeFileSync(join(ctx.dir, 'open.jsonl'), 'the PIN is GATE-1234');

  expect(collectFilesWith([ctx.dir], 'GATE-1234')).toStrictEqual({
    found: [join(ctx.dir, 'open.jsonl')],
    unread: [join(ctx.dir, 'locked.jsonl')],
  });
});

test.skipIf(isRoot)('it reports a folder it cannot list as unread, never as clean', () => {
  const ctx = setupTest();

  mkdirSync(join(ctx.dir, 'locked'));
  writeFileSync(join(ctx.dir, 'locked', 'session.jsonl'), 'the PIN is GATE-1234');
  chmodSync(join(ctx.dir, 'locked'), 0o000);

  expect(collectFilesWith([ctx.dir], 'GATE-1234')).toStrictEqual({
    found: [],
    unread: [join(ctx.dir, 'locked')],
  });
});
