import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadCheckerCorpus } from './load-checker-corpus';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-corpus-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'corpus.json') };
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
          sentAt: '2026-10-19T08:00:00Z',
          timeZone: 'Europe/London',
        },
        pairs: [
          {
            asserted: true,
            bucket: 'statement',
            memory: 'The owner takes their coffee black.',
            quote: 'I take my coffee black.',
          },
          {
            asserted: false,
            bucket: 'no time limit',
            memory: 'The owner takes their coffee black.',
            quote: 'I take my coffee black.',
            until: '2026-10-25T23:59:59+00:00',
          },
        ],
      },
    ],
  };

  await writeFile(ctx.path, JSON.stringify(corpus));

  const loaded = await loadCheckerCorpus(ctx.path);

  expect(loaded).toStrictEqual(corpus);
});

test('it refuses a message with no time it was sent', async () => {
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
            timeZone: 'Europe/London',
          },
          pairs: [
            {
              asserted: true,
              bucket: 'statement',
              memory: 'The owner takes their coffee black.',
              quote: 'I take my coffee black.',
            },
          ],
        },
      ],
    }),
  );

  expect(loadCheckerCorpus(ctx.path)).rejects.toMatchObject({
    issues: [expect.objectContaining({ path: ['samples', 0, 'message', 'sentAt'] })],
  });
});

test('it refuses an end time with no offset', async () => {
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
            sentAt: '2026-10-19T08:00:00Z',
            timeZone: 'Europe/London',
          },
          pairs: [
            {
              asserted: false,
              bucket: 'no time limit',
              memory: 'The owner takes their coffee black.',
              quote: 'I take my coffee black.',
              until: '2026-10-25T23:59:59',
            },
          ],
        },
      ],
    }),
  );

  expect(loadCheckerCorpus(ctx.path)).rejects.toMatchObject({
    issues: [expect.objectContaining({ path: ['samples', 0, 'pairs', 0, 'until'] })],
  });
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
            sentAt: '2026-10-19T08:00:00Z',
            timeZone: 'Europe/London',
          },
          pairs: [
            {
              bucket: 'statement',
              memory: 'The owner takes their coffee black.',
              quote: 'I take my coffee black.',
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
