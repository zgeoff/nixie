import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { pickText, startTestNotebook } from '../test-utils';
import { buildNoteForgottenKind } from './build-note-forgotten-kind';

async function setupTest() {
  const ctx = await startTestNotebook();

  const write = async (title: string) => {
    const outcome = await ctx.call('notebook.write', { title, body: `Body of ${title}.` });

    invariant(outcome.status === 'ok');

    return pickText(outcome.result['note']);
  };

  return { ...ctx, write, kind: buildNoteForgottenKind(ctx.log) };
}

test('it reads a forget by the owner as an event with the note short ID', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.notebook.forget({ note });

  const events = await ctx.kind.read({ after: 0, through: 10_000 });

  expect(events).toStrictEqual([
    { sequence: expect.any(Number), at: expect.any(Number), detail: { shortID: note } },
  ]);
});

test('it reads no event for a forget by the assistant', async () => {
  const ctx = await setupTest();
  const note = await ctx.write('Boiler');

  await ctx.call('notebook.forget', { id: note });
  await ctx.notebook.waitForForgets();

  const events = await ctx.kind.read({ after: 0, through: 10_000 });

  expect(events).toStrictEqual([]);
});

test("it reads the owner's forget that follows more forgets by the assistant than one page", async () => {
  const ctx = await setupTest();

  const kind = buildNoteForgottenKind(ctx.log, 2);

  const owned = await ctx.write('Owned');

  for (const title of ['First', 'Second', 'Third']) {
    const note = await ctx.write(title);

    await ctx.call('notebook.forget', { id: note });
  }

  await ctx.notebook.forget({ note: owned });

  const events = await kind.read({ after: 0, through: 100_000 });

  expect(events.map((event) => event.detail)).toStrictEqual([{ shortID: owned }]);
});
