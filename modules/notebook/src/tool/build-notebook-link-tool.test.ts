import { expect, test } from 'bun:test';
import type { JSONObject } from '@heynixie/log';
import invariant from 'tiny-invariant';
import { pickText, startTestNotebook } from '../test-utils';

async function setupTest() {
  const ctx = await startTestNotebook();

  const write = async (title: string) => {
    const outcome = await ctx.call('notebook.write', { title, body: 'Body.' });

    invariant(outcome.status === 'ok');

    return pickText(outcome.result['note']);
  };

  const readLinks = async (note: string) => {
    const outcome = await ctx.call('notebook.read', { note });

    invariant(outcome.status === 'ok');

    return outcome.result['links'];
  };

  return { ...ctx, write, readLinks };
}

test.each([
  ['supersedes', 'note'],
  ['supersedes', 'memory'],
  ['disputes', 'note'],
  ['disputes', 'memory'],
  ['part-of', 'note'],
  ['cites', 'note'],
  ['cites', 'memory'],
  ['cites', 'moment'],
  ['cites', 'event'],
  ['related', 'note'],
  ['related', 'memory'],
  ['related', 'moment'],
  ['related', 'event'],
])('it links with %s to a %s', async (type, kind) => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const other = await ctx.write('Other');
  const item = await ctx.seed.item('The thermostat is faulty.');
  const moment = await ctx.seed.moment('The engineer visit');
  const [message] = await ctx.seed.ownerMessages(['the engineer came']);

  invariant(moment !== undefined && moment !== null && message !== undefined);

  const targets: Record<string, JSONObject> = {
    note: { note: other },
    memory: { memory: item.shortID },
    moment: { moment: moment.shortID },
    event: { event: String(message) },
  };

  const to = targets[kind];

  invariant(to);

  const outcome = await ctx.call('notebook.link', {
    from,
    to,
    type,
    reason: 'because',
  });

  expect(outcome).toMatchObject({ status: 'ok', result: { linked: true } });
});

test.each([
  ['supersedes', 'moment'],
  ['supersedes', 'event'],
  ['disputes', 'moment'],
  ['disputes', 'event'],
  ['part-of', 'memory'],
  ['part-of', 'moment'],
  ['part-of', 'event'],
])('it refuses %s to a %s with BAD_LINK', async (type, kind) => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const item = await ctx.seed.item('The thermostat is faulty.');
  const moment = await ctx.seed.moment('The engineer visit');
  const [message] = await ctx.seed.ownerMessages(['the engineer came']);

  invariant(moment !== undefined && moment !== null && message !== undefined);

  const targets: Record<string, JSONObject> = {
    memory: { memory: item.shortID },
    moment: { moment: moment.shortID },
    event: { event: String(message) },
  };

  const to = targets[kind];

  invariant(to);

  const outcome = await ctx.call('notebook.link', { from, to, type });

  expect(outcome).toMatchObject({ refusalCode: 'BAD_LINK' });
});

test('it refuses an unknown source note with UNKNOWN_NOTE', async () => {
  const ctx = await setupTest();
  const other = await ctx.write('Other');

  const outcome = await ctx.call('notebook.link', {
    from: 'zzzzzzzzzz',
    to: { note: other },
    type: 'cites',
  });

  expect(outcome).toMatchObject({ refusalCode: 'UNKNOWN_NOTE' });
});

test('it refuses a target ID in no valid format with BAD_TARGET', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');

  const outcome = await ctx.call('notebook.link', {
    from,
    to: { memory: 'not a short id!' },
    type: 'cites',
  });

  expect(outcome).toMatchObject({ refusalCode: 'BAD_TARGET' });
});

test('it refuses a well-formed ID with no row of the declared kind with UNKNOWN_TARGET', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const other = await ctx.write('Other');

  const memory = await ctx.call('notebook.link', {
    from,
    to: { memory: 'abcdefghij' },
    type: 'cites',
  });

  const wrongKind = await ctx.call('notebook.link', {
    from,
    to: { moment: other },
    type: 'cites',
  });

  expect([memory, wrongKind]).toStrictEqual([
    expect.objectContaining({ refusalCode: 'UNKNOWN_TARGET' }),
    expect.objectContaining({ refusalCode: 'UNKNOWN_TARGET' }),
  ]);
});

test('it refuses an event on another thread with the same UNKNOWN_TARGET as an event that does not exist', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const [message] = await ctx.seed.ownerMessages(['the engineer came']);

  invariant(message !== undefined);

  const otherThread = await ctx.call(
    'notebook.link',
    { from, to: { event: String(message) }, type: 'cites' },
    { thread: 'task-7' },
  );

  const missing = await ctx.call('notebook.link', {
    from,
    to: { event: '999999' },
    type: 'cites',
  });

  expect(otherThread).toMatchObject({ refusalCode: 'UNKNOWN_TARGET' });

  expect(otherThread).toMatchObject({
    result: { message: expect.stringContaining(String(message)) },
  });

  expect(missing).toMatchObject({ refusalCode: 'UNKNOWN_TARGET' });
});

test('it refuses a link from a note to itself with SELF_LINK', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const outcome = await ctx.call('notebook.link', { from, to: { note: from }, type: 'cites' });

  expect(outcome).toMatchObject({ refusalCode: 'SELF_LINK' });
});

test('it refuses a related link with no reason with REASON_REQUIRED', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const other = await ctx.write('Other');
  const outcome = await ctx.call('notebook.link', { from, to: { note: other }, type: 'related' });

  expect(outcome).toMatchObject({ refusalCode: 'REASON_REQUIRED' });
});

test('it checks BAD_LINK before REASON_REQUIRED', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const item = await ctx.seed.item('The thermostat is faulty.');

  const outcome = await ctx.call('notebook.link', {
    from,
    to: { memory: item.shortID },
    type: 'part-of',
  });

  expect(outcome).toMatchObject({ refusalCode: 'BAD_LINK' });
});

test('it refuses a part-of link that closes a cycle with PART_OF_CYCLE', async () => {
  const ctx = await setupTest();
  const first = await ctx.write('First');
  const second = await ctx.write('Second');
  const third = await ctx.write('Third');

  await ctx.call('notebook.link', { from: first, to: { note: second }, type: 'part-of' });
  await ctx.call('notebook.link', { from: second, to: { note: third }, type: 'part-of' });

  const outcome = await ctx.call('notebook.link', {
    from: third,
    to: { note: first },
    type: 'part-of',
  });

  expect(outcome).toMatchObject({ refusalCode: 'PART_OF_CYCLE' });
});

test('it takes a retired item as a target, so a note can supersede it', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const item = await ctx.seed.item('The thermostat is faulty.');

  await ctx.memory.retire({
    target: { itemID: item.itemID, version: item.version },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await ctx.call('notebook.link', {
    from,
    to: { memory: item.shortID },
    type: 'supersedes',
  });

  expect(outcome).toMatchObject({ result: { linked: true } });
});

test('it refuses a forgotten item as a target with UNKNOWN_TARGET', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const item = await ctx.seed.item('The thermostat is faulty.');

  await ctx.memory.forget({
    target: { itemID: item.itemID, version: item.version },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await ctx.call('notebook.link', {
    from,
    to: { memory: item.shortID },
    type: 'disputes',
  });

  expect(outcome).toMatchObject({ refusalCode: 'UNKNOWN_TARGET' });
});

test('it takes a target by UUID, and stores the UUID while the result shows the short ID', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const item = await ctx.seed.item('The thermostat is faulty.');

  await ctx.call('notebook.link', { from, to: { memory: item.itemID }, type: 'disputes' });

  const awaited = await ctx.readLinks(from);

  expect(awaited).toStrictEqual([{ type: 'disputes', to: { memory: item.shortID } }]);
});

test('it replaces the reason of a second link with the same source, target and type', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const other = await ctx.write('Other');

  await ctx.call('notebook.link', {
    from,
    to: { note: other },
    type: 'related',
    reason: 'first reason',
  });

  await ctx.call('notebook.link', {
    from,
    to: { note: other },
    type: 'related',
    reason: 'second reason',
  });

  const awaited2 = await ctx.readLinks(from);

  expect(awaited2).toStrictEqual([
    { type: 'related', to: { note: other }, reason: 'second reason' },
  ]);
});

test('it keeps one link of each type to a target', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const other = await ctx.write('Other');

  await ctx.call('notebook.link', { from, to: { note: other }, type: 'cites' });
  await ctx.call('notebook.link', { from, to: { note: other }, type: 'supersedes' });

  const awaited3 = await ctx.readLinks(from);

  expect(awaited3).toHaveLength(2);
});

test('it never makes an edit stale', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const other = await ctx.write('Other');

  await ctx.call('notebook.link', { from, to: { note: other }, type: 'cites' });
  await ctx.call('notebook.unlink', { from, to: { note: other }, type: 'cites' });

  const outcome = await ctx.call('notebook.edit', { note: from, version: 1, title: 'New' });

  expect(outcome).toMatchObject({ result: { version: 2 } });
});

test('it leaves the reason out of the call record, and holds the UUIDs under hidden', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const other = await ctx.write('Other');

  const outcome = await ctx.call('notebook.link', {
    from,
    to: { note: other },
    type: 'related',
    reason: 'a private reason',
  });

  expect(outcome).toMatchObject({
    record: { from, to: { note: other }, type: 'related' },
    hidden: { uuids: { [from]: expect.any(String), [other]: expect.any(String) } },
  });

  const recordTextSource = outcome.status === 'ok' ? outcome.record : null;
  const recordText = JSON.stringify(recordTextSource);

  expect(recordText).not.toInclude('a private reason');
});

test('it keeps the reason in the erasable field of the linked record', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const other = await ctx.write('Other');

  await ctx.call('notebook.link', {
    from,
    to: { note: other },
    type: 'related',
    reason: 'a reason',
  });

  const [linked] = await ctx.readRecords(['notebook.linked']);

  expect(linked?.record.erasable).toStrictEqual({
    status: 'readable',
    fields: { reason: 'a reason' },
  });
});

test('it unlinks a link, answers true, and answers false when no such link existed', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');
  const other = await ctx.write('Other');

  await ctx.call('notebook.link', { from, to: { note: other }, type: 'cites' });

  const first = await ctx.call('notebook.unlink', { from, to: { note: other }, type: 'cites' });
  const second = await ctx.call('notebook.unlink', { from, to: { note: other }, type: 'cites' });

  expect([first, second]).toStrictEqual([
    expect.objectContaining({ result: { unlinked: true } }),
    expect.objectContaining({ result: { unlinked: false } }),
  ]);
});

test('it refuses an unlink from an unknown note with UNKNOWN_NOTE, and from a bad target with BAD_TARGET', async () => {
  const ctx = await setupTest();
  const from = await ctx.write('From');

  const unknown = await ctx.call('notebook.unlink', {
    from: 'zzzzzzzzzz',
    to: { note: from },
    type: 'cites',
  });

  const bad = await ctx.call('notebook.unlink', {
    from,
    to: { memory: 'not valid!' },
    type: 'cites',
  });

  expect([unknown, bad]).toStrictEqual([
    expect.objectContaining({ refusalCode: 'UNKNOWN_NOTE' }),
    expect.objectContaining({ refusalCode: 'BAD_TARGET' }),
  ]);
});
