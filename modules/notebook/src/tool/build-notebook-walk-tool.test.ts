import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { pickText, startTestNotebook } from '../test-utils';

async function setupTest() {
  const ctx = await startTestNotebook();

  const write = async (title: string) => {
    const outcome = await ctx.call('notebook.write', { title, body: 'Secret body text.' });

    invariant(outcome.status === 'ok');

    return pickText(outcome.result['note']);
  };

  return { ...ctx, write };
}

test('it walks one hop by default over the links of a note, with the labels of each node', async () => {
  const ctx = await setupTest();
  const boiler = await ctx.write('Boiler');

  const item = await ctx.seed.item(
    'The thermostat is faulty and noisy.',
    'boiler serviced in March',
  );

  await ctx.call('notebook.link', {
    from: boiler,
    to: { memory: item.shortID },
    type: 'disputes',
    reason: 'the item blames the thermostat',
  });

  const outcome = await ctx.call('notebook.walk', { from: boiler });

  expect(outcome).toMatchObject({
    status: 'ok',
    result: {
      nodes: [
        { note: boiler, hops: 0, title: 'Boiler' },
        { memory: item.shortID, hops: 1, gist: 'boiler serviced in March', state: 'active' },
      ],
      links: [
        {
          from: boiler,
          to: { memory: item.shortID },
          type: 'disputes',
          reason: 'the item blames the thermostat',
        },
      ],
      gone: [],
      isCut: false,
    },
  });
});

test('it never returns the text of a note or an item', async () => {
  const ctx = await setupTest();
  const boiler = await ctx.write('Boiler');
  const other = await ctx.write('Other');
  const item = await ctx.seed.item('The thermostat is faulty and noisy.', 'boiler serviced');

  await ctx.call('notebook.link', { from: boiler, to: { note: other }, type: 'cites' });
  await ctx.call('notebook.link', { from: boiler, to: { memory: item.shortID }, type: 'cites' });

  const outcome = await ctx.call('notebook.walk', { from: boiler, hops: 2 });

  const textSource = outcome.status === 'ok' ? outcome.result : null;
  const text = JSON.stringify(textSource);

  expect(text).not.toInclude('Secret body text');
  expect(text).not.toInclude('faulty and noisy');
});

test('it follows links both ways, so a walk passes through an item to the other notes that cite it', async () => {
  const ctx = await setupTest();
  const first = await ctx.write('First');
  const second = await ctx.write('Second');
  const item = await ctx.seed.item('The thermostat is faulty.');

  await ctx.call('notebook.link', { from: first, to: { memory: item.shortID }, type: 'cites' });
  await ctx.call('notebook.link', { from: second, to: { memory: item.shortID }, type: 'cites' });

  const outcome = await ctx.call('notebook.walk', { from: first, hops: 2 });

  expect(outcome).toMatchObject({
    result: {
      nodes: [
        { note: first, hops: 0 },
        { memory: item.shortID, hops: 1 },
        { note: second, hops: 2, title: 'Second' },
      ],
    },
  });
});

test('it visits each node once, even around a cycle', async () => {
  const ctx = await setupTest();
  const first = await ctx.write('First');
  const second = await ctx.write('Second');

  await ctx.call('notebook.link', { from: first, to: { note: second }, type: 'cites' });
  await ctx.call('notebook.link', { from: second, to: { note: first }, type: 'cites' });

  const outcome = await ctx.call('notebook.walk', { from: first, hops: 3 });

  expect(outcome).toMatchObject({ result: { nodes: [{ note: first }, { note: second }] } });
});

test('it follows only the link types it is given', async () => {
  const ctx = await setupTest();
  const first = await ctx.write('First');
  const second = await ctx.write('Second');
  const third = await ctx.write('Third');

  await ctx.call('notebook.link', { from: first, to: { note: second }, type: 'cites' });
  await ctx.call('notebook.link', { from: first, to: { note: third }, type: 'part-of' });

  const outcome = await ctx.call('notebook.walk', { from: first, types: ['part-of'] });

  expect(outcome).toMatchObject({ result: { nodes: [{ note: first }, { note: third }] } });
});

test('it lists a forgotten item in gone, never as a node, and goes no further from it', async () => {
  const ctx = await setupTest();
  const first = await ctx.write('First');
  const second = await ctx.write('Second');
  const item = await ctx.seed.item('The thermostat is faulty.');

  await ctx.call('notebook.link', { from: first, to: { memory: item.shortID }, type: 'cites' });
  await ctx.call('notebook.link', { from: second, to: { memory: item.shortID }, type: 'cites' });

  await ctx.memory.forget({
    target: { itemID: item.itemID, version: item.version },
    provenance: { origin: 'owner', source: 'owner', taskID: null, proposalID: null, checks: null },
  });

  const outcome = await ctx.call('notebook.walk', { from: first, hops: 3 });

  expect(outcome).toMatchObject({
    result: { nodes: [{ note: first, hops: 0 }], gone: [{ memory: item.shortID }] },
  });
});

test('it lists a destroyed moment in gone', async () => {
  const ctx = await setupTest();
  const first = await ctx.write('First');
  const moment = await ctx.seed.moment('The engineer visit');

  invariant(moment);

  await ctx.call('notebook.link', { from: first, to: { moment: moment.shortID }, type: 'cites' });
  await ctx.destroyMoment({ momentID: moment.momentID, version: 1 });

  const outcome = await ctx.call('notebook.walk', { from: first });

  expect(outcome).toMatchObject({ result: { gone: [{ moment: moment.shortID }] } });
});

test('it lists a note that was forgotten in gone, from a link another note holds', async () => {
  const ctx = await setupTest();
  const first = await ctx.write('First');
  const second = await ctx.write('Second');

  await ctx.call('notebook.link', { from: first, to: { note: second }, type: 'cites' });
  await ctx.forget({ note: second, version: 1 });

  const outcome = await ctx.call('notebook.walk', { from: first });

  expect(outcome).toMatchObject({ result: { gone: [{ note: second }] } });
});

test('it shows an item gist only when the caller holds memory.recall', async () => {
  const ctx = await setupTest();
  const first = await ctx.write('First');
  const item = await ctx.seed.item('The thermostat is faulty.', 'a gist');

  await ctx.call('notebook.link', { from: first, to: { memory: item.shortID }, type: 'cites' });

  const outcome = await ctx.call(
    'notebook.walk',
    { from: first },
    { tools: ['notebook.walk', 'notebook.write'] },
  );

  expect(outcome).toMatchObject({ result: { nodes: [{ note: first }, { memory: item.shortID }] } });

  const textSource = outcome.status === 'ok' ? outcome.result : null;
  const text = JSON.stringify(textSource);

  expect(text).not.toInclude('a gist');
});

test('it shows an event time and role only on the own thread of a run that holds log.read', async () => {
  const ctx = await setupTest();
  const first = await ctx.write('First');
  const [message] = await ctx.seed.ownerMessages(['the engineer came on Monday']);

  invariant(message !== undefined);

  await ctx.call('notebook.link', {
    from: first,
    to: { event: String(message) },
    type: 'cites',
  });

  const withLog = await ctx.call('notebook.walk', { from: first });

  const withoutLog = await ctx.call(
    'notebook.walk',
    { from: first },
    { tools: ['notebook.walk', 'memory.recall'] },
  );

  expect(withLog).toMatchObject({
    result: {
      nodes: [{ note: first }, { event: String(message), at: expect.any(String), role: 'owner' }],
    },
  });

  expect(withoutLog).toMatchObject({
    result: { nodes: [{ note: first }, { event: String(message) }] },
  });

  const logTextSource = withLog.status === 'ok' ? withLog.result : null;
  const logText = JSON.stringify(logTextSource);

  expect(logText).not.toInclude('Monday');
});

test('it refuses an unknown note with UNKNOWN_NOTE', async () => {
  const ctx = await setupTest();
  const outcome = await ctx.call('notebook.walk', { from: 'zzzzzzzzzz' });

  expect(outcome).toMatchObject({ refusalCode: 'UNKNOWN_NOTE' });
});

test('it reads a note that is being forgotten as unknown', async () => {
  const ctx = await setupTest();
  const first = await ctx.write('First');

  await ctx.forget({ note: first, version: 1 });

  const outcome = await ctx.call('notebook.walk', { from: first });

  expect(outcome).toMatchObject({ refusalCode: 'UNKNOWN_NOTE' });
});

test('it stops at 200 nodes and sets isCut', async () => {
  const ctx = await setupTest();
  const hub = await ctx.write('Hub');

  for (let count = 0; count < 205; count += 1) {
    const spoke = await ctx.write(`Spoke ${String(count)}`);

    await ctx.call('notebook.link', { from: hub, to: { note: spoke }, type: 'cites' });
  }

  const outcome = await ctx.call('notebook.walk', { from: hub });

  invariant(outcome.status === 'ok');

  const nodes = outcome.result['nodes'];

  invariant(Array.isArray(nodes));

  expect(outcome.result['isCut']).toBe(true);
  expect(nodes.length).toBeLessThanOrEqual(200);
});
