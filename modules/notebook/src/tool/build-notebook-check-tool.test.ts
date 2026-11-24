import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { pickText, startTestNotebook } from '../test-utils';

async function setupTest() {
  const ctx = await startTestNotebook({ settings: { checkReasonRepeats: 2 } });

  const write = async (title: string) => {
    const outcome = await ctx.call('notebook.write', { title, body: 'Body.' });

    invariant(outcome.status === 'ok');

    return pickText(outcome.result['note']);
  };

  return { ...ctx, write };
}

test('it reports a note with no link and no link to it as an orphan', async () => {
  const ctx = await setupTest();
  const lonely = await ctx.write('Lonely');
  const from = await ctx.write('From');
  const to = await ctx.write('To');

  await ctx.call('notebook.link', { from, to: { note: to }, type: 'cites' });

  const outcome = await ctx.call('notebook.check', {});

  expect(outcome).toMatchObject({
    status: 'ok',
    result: { orphans: [{ note: lonely, title: 'Lonely' }], orphanCount: 1 },
  });
});

test('it counts a note named only in the text of another note as an orphan', async () => {
  const ctx = await setupTest();
  const named = await ctx.write('Named');

  await ctx.call('notebook.write', { title: 'Mentions', body: `See note ${named}.` });

  const outcome = await ctx.call('notebook.check', {});

  expect(outcome).toMatchObject({ result: { orphanCount: 2 } });
});

test('it reports a link whose target is gone as dangling', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const to = await ctx.write('To');

  await ctx.call('notebook.link', { from, to: { note: to }, type: 'cites' });
  await ctx.forget({ note: to, version: 1 });

  const outcome = await ctx.call('notebook.check', {});

  expect(outcome).toMatchObject({
    result: { dangling: [{ from, to: { note: to }, type: 'cites' }], danglingCount: 1 },
  });
});

test('it reports a related reason on more links than check_reason_repeats, ignoring case and spacing', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');

  const targets = [await ctx.write('A'), await ctx.write('B'), await ctx.write('C')];

  for (const [index, target] of targets.entries()) {
    await ctx.call('notebook.link', {
      from,
      to: { note: target },
      type: 'related',
      reason: index === 0 ? 'Same   reason' : 'same reason ',
    });
  }

  const outcome = await ctx.call('notebook.check', {});

  expect(outcome).toMatchObject({
    result: {
      repeatedReasons: [
        {
          reason: expect.stringMatching(/same\s+reason/iu),
          count: 3,
          links: expect.toBeArrayOfSize(3),
        },
      ],
      repeatedReasonCount: 1,
    },
  });
});

test('it cuts each list to 50 entries and gives the total in the count', async () => {
  const ctx = await setupTest();

  for (let count = 0; count < 55; count += 1) {
    await ctx.write(`Orphan ${String(count)}`);
  }

  const outcome = await ctx.call('notebook.check', {});

  invariant(outcome.status === 'ok');

  expect([outcome.result['orphans'], outcome.result['orphanCount']]).toStrictEqual([
    expect.toBeArrayOfSize(50),
    55,
  ]);
});

test('it lists orphans with the oldest edit first', async () => {
  const ctx = await setupTest();
  const first = await ctx.write('First');

  ctx.clock.advance(60_000);

  const second = await ctx.write('Second');
  const outcome = await ctx.call('notebook.check', {});

  expect(outcome).toMatchObject({
    result: {
      orphans: [
        { note: first, title: 'First' },
        { note: second, title: 'Second' },
      ],
    },
  });
});
