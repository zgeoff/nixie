import { expect, onTestFinished, test } from 'bun:test';
import { mkdtemp, rm, writeFile } from 'node:fs/promises';
import { tmpdir } from 'node:os';
import { join } from 'node:path';
import { loadWriterCases } from './load-writer-cases';

async function setupTest() {
  const directory = await mkdtemp(join(tmpdir(), 'nixie-writer-cases-'));

  onTestFinished(() => rm(directory, { recursive: true, force: true }));

  return { path: join(directory, 'cases.json') };
}

test('it loads each case with its items, its messages and its rule', async () => {
  const ctx = await setupTest();

  const cases = {
    persona: 'You are Wren, a calm assistant.',
    ownerName: 'Sam',
    assistantName: 'Wren',
    cases: [
      {
        id: 'oat-milk',
        items: [{ itemID: 'item-tea', subject: 'owner' as const, text: 'Sam drinks green tea.' }],
        messages: [{ role: 'owner' as const, text: 'I switched to oat milk.' }],
        rule: 'owner_item' as const,
        target: null,
        patterns: ['oat milk'],
      },
    ],
  };

  await writeFile(ctx.path, JSON.stringify(cases));

  const loaded = await loadWriterCases(ctx.path);

  expect(loaded).toStrictEqual(cases);
});

test('it refuses an item whose subject is self', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    JSON.stringify({
      persona: 'You are Wren, a calm assistant.',
      ownerName: 'Sam',
      assistantName: 'Wren',
      cases: [
        {
          id: 'oat-milk',
          items: [{ itemID: 'item-tea', subject: 'self', text: 'I like green tea.' }],
          messages: [{ role: 'owner', text: 'I switched to oat milk.' }],
          rule: 'owner_item',
          target: null,
          patterns: [],
        },
      ],
    }),
  );

  expect(loadWriterCases(ctx.path)).rejects.toMatchObject({
    issues: [expect.objectContaining({ path: ['cases', 0, 'items', 0, 'subject'] })],
  });
});

test('it refuses a case with a rule it does not know', async () => {
  const ctx = await setupTest();

  await writeFile(
    ctx.path,
    JSON.stringify({
      persona: 'You are Wren, a calm assistant.',
      ownerName: 'Sam',
      assistantName: 'Wren',
      cases: [
        {
          id: 'oat-milk',
          items: [],
          messages: [{ role: 'owner', text: 'I switched to oat milk.' }],
          rule: 'some_item',
          target: null,
          patterns: [],
        },
      ],
    }),
  );

  expect(loadWriterCases(ctx.path)).rejects.toMatchObject({
    issues: [expect.objectContaining({ path: ['cases', 0, 'rule'] })],
  });
});
