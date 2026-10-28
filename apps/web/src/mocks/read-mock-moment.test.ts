import { expect, test } from 'bun:test';
import { readMockMoment } from './read-mock-moment';
import { store } from './store';

test('it reads a moment by its short ID, with each linked item and its newest text', async () => {
  const item = await store.memoryItems.create({
    shortID: 'p2k7wd',
    versions: [{ text: 'Waters the fern weekly' }, { change: 'edited', text: 'Waters it twice' }],
  });

  const moment = await store.moments.create({
    shortID: 'f3r9n2ks8q',
    title: 'The fern',
    linkedItemIDs: [item.itemID],
  });

  expect(readMockMoment('f3r9n2ks8q')).toMatchObject({
    momentID: moment.momentID,
    title: 'The fern',
    links: [{ itemID: item.itemID, shortID: 'p2k7wd', text: 'Waters it twice' }],
  });
});

test('it reads no moment that was destroyed', async () => {
  const moment = await store.moments.create({ state: 'destroyed' });

  expect(readMockMoment(moment.momentID)).toBeNull();
});
