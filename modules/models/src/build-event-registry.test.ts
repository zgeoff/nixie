import { expect, test } from 'bun:test';
import invariant from 'tiny-invariant';
import { buildEventRegistry } from './build-event-registry';

test("it binds each kind's renderer to the events the kind read", async () => {
  const registry = buildEventRegistry([
    {
      name: 'parcel',
      read: () => Promise.resolve([{ sequence: 7, at: 1000, detail: 2 }]),
      render: (detail: number, settings) =>
        `${settings.ownerName ?? 'The owner'} got ${String(detail)} parcels.`,
    },
  ]);

  const [entry] = registry;

  invariant(entry !== undefined);

  const read = await entry.read({ after: 0, through: 10 });
  const bound = await entry.complete(read);

  expect(read).toStrictEqual([{ kind: 'parcel', sequence: 7, at: 1000 }]);

  expect(bound.map((event) => event.render({ ownerName: 'Avery', timeZone: 'UTC' }))).toStrictEqual(
    ['Avery got 2 parcels.'],
  );
});

test('it renders the detail that the kind completed', async () => {
  const registry = buildEventRegistry([
    {
      name: 'parcel',
      read: () => Promise.resolve([{ sequence: 7, at: 1000, detail: 'unopened' }]),
      complete: (events) =>
        Promise.resolve(events.map((event) => ({ ...event, detail: 'opened' }))),
      render: (detail: string) => `A parcel lay ${detail}.`,
    },
  ]);

  const [entry] = registry;

  invariant(entry !== undefined);

  const read = await entry.read({ after: 0, through: 10 });
  const bound = await entry.complete(read);

  expect(bound.map((event) => event.render({ ownerName: null, timeZone: 'UTC' }))).toStrictEqual([
    'A parcel lay opened.',
  ]);
});

test('it passes the range to the kind it reads', async () => {
  const ranges: unknown[] = [];

  const registry = buildEventRegistry([
    {
      name: 'parcel',
      read: (range) => {
        ranges.push(range);

        return Promise.resolve([]);
      },
      render: () => 'A parcel came.',
    },
  ]);

  await registry[0]?.read({ after: 3, through: 9 });

  expect(ranges).toStrictEqual([{ after: 3, through: 9 }]);
});

test('it refuses two event kinds with one name', () => {
  expect(() =>
    buildEventRegistry([
      { name: 'parcel', read: () => Promise.resolve([]), render: () => 'A parcel came.' },
      { name: 'parcel', read: () => Promise.resolve([]), render: () => 'Another parcel came.' },
    ]),
  ).toThrowWithMessage(Error, 'the events block has two event kinds named parcel');
});
