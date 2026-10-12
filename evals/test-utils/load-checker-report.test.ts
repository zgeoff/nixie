import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCheckerReport } from './load-checker-report';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-report-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { path: join(dir, 'report.json') };
}

test('it loads the run settings and each call with its verdict', async () => {
  const ctx = await setupTest();
  const report = {
    model: 'claude-sonnet-5-5',
    effort: 'low',
    prompt: 'sha256:0f1e',
    repeats: 1,
    calls: [
      {
        sample: 'coffee',
        pair: 0,
        repeat: 0,
        input: 'sha256:a1b2',
        verdict: 'asserted' as const,
        reason: 'The owner states it.',
        costUSD: 0.003,
        latencyMs: 4100,
      },
    ],
  };

  await writeFile(ctx.path, JSON.stringify(report));

  const loaded = await loadCheckerReport(ctx.path);

  expect(loaded).toStrictEqual(report);
});

test('it refuses a call with a verdict the checker never gives', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    JSON.stringify({
      model: 'claude-sonnet-5-5',
      effort: 'low',
      prompt: 'sha256:0f1e',
      repeats: 1,
      calls: [
        {
          sample: 'coffee',
          pair: 0,
          repeat: 0,
          input: 'sha256:a1b2',
          verdict: 'probably',
          reason: 'The owner states it.',
          costUSD: 0.003,
          latencyMs: 4100,
        },
      ],
    }),
  );

  expect(loadCheckerReport(ctx.path)).rejects.toMatchObject({
    issues: [expect.objectContaining({ path: ['calls', 0, 'verdict'] })],
  });
});
