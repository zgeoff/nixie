import { expect, onTestFinished, test } from 'bun:test';
import { mkdir, mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadSessionTranscript } from './load-session-transcript';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-transcript-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { dir };
}

test('it loads every entry of the session, in the project folder that holds it', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'projects', '-tmp-other'), { recursive: true });
  await mkdir(join(ctx.dir, 'projects', '-tmp-probe'), { recursive: true });

  await writeFile(
    join(ctx.dir, 'projects', '-tmp-probe', 'b7c1e9a4.jsonl'),
    [
      JSON.stringify({ type: 'user', uuid: 'u-1', message: { content: 'tide notes' } }),
      JSON.stringify({ type: 'system', subtype: 'compact_boundary', uuid: 'u-2' }),
      JSON.stringify({ type: 'user', uuid: 'u-3', isCompactSummary: true }),
      '',
    ].join('\n'),
  );

  const entries = await loadSessionTranscript(ctx.dir, 'b7c1e9a4');

  expect(entries).toStrictEqual([
    { type: 'user', uuid: 'u-1', message: { content: 'tide notes' } },
    { type: 'system', subtype: 'compact_boundary', uuid: 'u-2' },
    { type: 'user', uuid: 'u-3', isCompactSummary: true },
  ]);
});

test('it refuses a session with no transcript', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'projects', '-tmp-probe'), { recursive: true });

  expect(loadSessionTranscript(ctx.dir, 'b7c1e9a4')).rejects.toThrowWithMessage(
    Error,
    /no transcript for session b7c1e9a4/u,
  );
});

test('it refuses a config directory the CLI never wrote to', async () => {
  const ctx = await setupTest();

  expect(loadSessionTranscript(ctx.dir, 'b7c1e9a4')).rejects.toThrowWithMessage(
    Error,
    /no transcript for session b7c1e9a4/u,
  );
});

test('it refuses an entry with no type', async () => {
  const ctx = await setupTest();

  await mkdir(join(ctx.dir, 'projects', '-tmp-probe'), { recursive: true });

  await writeFile(
    join(ctx.dir, 'projects', '-tmp-probe', 'b7c1e9a4.jsonl'),
    JSON.stringify({ uuid: 'u-1' }),
  );

  expect(loadSessionTranscript(ctx.dir, 'b7c1e9a4')).rejects.toMatchObject({
    issues: [expect.objectContaining({ path: ['type'] })],
  });
});
