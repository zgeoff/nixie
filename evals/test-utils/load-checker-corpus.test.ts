import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCheckerCorpus } from './load-checker-corpus';

async function setupTest() {
  const dir = await mkdtemp(join(tmpdir(), 'nixie-corpus-'));

  onTestFinished(() => rm(dir, { recursive: true, force: true }));

  return { path: join(dir, 'corpus.json') };
}

test('it loads each sample with its message and its labelled pairs', async () => {
  const ctx = await setupTest();
  const corpus = {
    samples: [
      {
        id: 'coffee',
        message: {
          text: 'I take my coffee black.',
          spans: [{ start: 0, end: 23, source: 'typed' as const }],
        },
        pairs: [
          {
            asserted: true,
            bucket: 'statement',
            memory: 'The owner takes their coffee black.',
            quote: 'I take my coffee black.',
            mustConfirm: false,
          },
        ],
      },
    ],
  };

  await writeFile(ctx.path, JSON.stringify(corpus));

  const loaded = await loadCheckerCorpus(ctx.path);

  expect(loaded).toStrictEqual(corpus);
});

test('it refuses a pair with no label', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    JSON.stringify({
      samples: [
        {
          id: 'coffee',
          message: {
            text: 'I take my coffee black.',
            spans: [{ start: 0, end: 23, source: 'typed' }],
          },
          pairs: [
            {
              bucket: 'statement',
              memory: 'The owner takes their coffee black.',
              quote: 'I take my coffee black.',
              mustConfirm: false,
            },
          ],
        },
      ],
    }),
  );

  expect(loadCheckerCorpus(ctx.path)).rejects.toMatchObject({
    issues: [expect.objectContaining({ path: ['samples', 0, 'pairs', 0, 'asserted'] })],
  });
});
