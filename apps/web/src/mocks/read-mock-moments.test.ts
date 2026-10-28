import { expect, test } from 'bun:test';
import { readMockMoments } from './read-mock-moments';
import { store } from './store';

test('it lists the active moments, newest first', async () => {
  await store.moments.create({ title: 'The fern', keptAt: new Date('2026-10-01T09:00:00Z') });
  await store.moments.create({ title: 'The kiln', keptAt: new Date('2026-10-03T09:00:00Z') });
  await store.moments.create({ title: 'The loom', state: 'retired' });
  await store.moments.create({ title: 'The lathe', state: 'destroyed' });

  const listed = readMockMoments({ includeRetired: false });

  expect(listed.moments.map((moment) => moment.title)).toStrictEqual(['The kiln', 'The fern']);
});

test('it lists more than 50 moments a page at a time, newest first', async () => {
  await Promise.all(
    Array.from({ length: 51 }, (_, index) =>
      store.moments.create({
        title: `Moment ${String(index + 1)}`,
        keptAt: new Date(Date.UTC(2026, 8, 1) + index * 86_400_000),
      }),
    ),
  );

  const page = readMockMoments({ includeRetired: false });
  const rest = readMockMoments({ includeRetired: false, before: 50 });

  expect(page.moments).toHaveLength(50);
  expect(page.moments[0]?.title).toBe('Moment 51');
  expect(page.next).toBe(50);
  expect(rest.moments.map((moment) => moment.title)).toStrictEqual(['Moment 1']);
  expect(rest.next).toBeNull();
});

test('it adds the retired moments when the filter asks for them', async () => {
  await store.moments.create({ title: 'The fern', keptAt: new Date('2026-10-01T09:00:00Z') });

  await store.moments.create({
    title: 'The loom',
    state: 'retired',
    keptAt: new Date('2026-10-02T09:00:00Z'),
  });

  const listed = readMockMoments({ includeRetired: true });

  expect(listed.moments.map((moment) => [moment.title, moment.state])).toStrictEqual([
    ['The loom', 'retired'],
    ['The fern', 'active'],
  ]);
});

test('it finds a moment by every word of the query, in its note or a reflection', async () => {
  await store.moments.create({
    title: 'The fern',
    note: { text: 'It liked the north window.', writtenAt: new Date('2026-10-01T09:00:00Z') },
  });

  await store.moments.create({
    title: 'The kiln',
    reflections: [{ text: 'A north wind cooled it.' }],
  });

  const found = readMockMoments({ includeRetired: false, query: 'North WINDOW' });

  expect(found.moments.map((moment) => moment.title)).toStrictEqual(['The fern']);
});
