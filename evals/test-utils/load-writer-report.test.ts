import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWriterReport } from './load-writer-report';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-writer-report-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'report.json') };
}

test('it loads each run with what it staged and flagged', async () => {
  const ctx = await setupTest();

  const report = {
    model: 'claude-haiku-5-5',
    effort: 'low',
    repeats: 1,
    calls: [
      {
        case: 'oat-milk',
        repeat: 0,
        input: 'sha256:abc',
        writes: [
          {
            op: 'remember' as const,
            subject: 'owner' as const,
            itemID: null,
            text: 'Sam drinks oat milk.',
            until: null,
          },
        ],
        flags: ['The assistant likes oat milk too.'],
        failure: null,
        inputTokens: 1200,
        outputTokens: 80,
      },
    ],
  };

  await writeFile(ctx.path, JSON.stringify(report));

  const loaded = await loadWriterReport(ctx.path);

  expect(loaded).toStrictEqual(report);
});

test('it refuses a write whose subject is self', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    JSON.stringify({
      model: 'claude-haiku-5-5',
      effort: 'low',
      repeats: 1,
      calls: [
        {
          case: 'oat-milk',
          repeat: 0,
          input: 'sha256:abc',
          writes: [
            {
              op: 'remember',
              subject: 'self',
              itemID: null,
              text: 'I like oat milk.',
              until: null,
            },
          ],
          flags: [],
          failure: null,
          inputTokens: 1200,
          outputTokens: 80,
        },
      ],
    }),
  );

  expect(loadWriterReport(ctx.path)).rejects.toMatchObject({
    issues: [expect.objectContaining({ path: ['calls', 0, 'writes', 0, 'subject'] })],
  });
});
