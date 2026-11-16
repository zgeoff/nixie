import { expect, test } from 'bun:test';
import { countTextTokens } from '@heynixie/compaction';
import { buildIndexRows } from '../test-utils/build-index-rows';
import { collectTopicRows } from './collect-topic-rows';
import { renderIndexBlock } from './render-index-block';

test('it shows each topic as one row with its count and its items as ID and gist', () => {
  const rows = [
    {
      itemID: '00000000-0000-4000-8000-000000000065',
      shortID: 'b7kq2m9xza',
      subject: 'owner' as const,
      topic: 'home',
      gist: 'spare pump',
      createdSequence: 1,
    },
    {
      itemID: '00000000-0000-4000-8000-000000000032',
      shortID: 'c2hd81mmqa',
      subject: 'owner' as const,
      topic: 'home',
      gist: 'piano tuned',
      createdSequence: 2,
    },
    {
      itemID: '00000000-0000-4000-8000-000000000030',
      shortID: 'k1n0zz8w2p',
      subject: 'shared' as const,
      topic: 'home',
      gist: 'the lasagne',
      createdSequence: 3,
    },
  ];

  const lines = renderIndexBlock(collectTopicRows(rows), {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).split('\n');

  expect(lines.slice(1)).toStrictEqual([
    'About Robin:',
    '  home (2)  [c2hd81mmqa] piano tuned · [b7kq2m9xza] spare pump',
    'Between you and Robin:',
    '  home (1)  [k1n0zz8w2p] the lasagne',
  ]);
});

test('it opens by saying how to read an item and how to open a topic', () => {
  const [opening] = renderIndexBlock(collectTopicRows(buildIndexRows('home', 1)), {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).split('\n');

  expect(opening).toInclude('memory.recall and itemIDs');
  expect(opening).toInclude('people/friends');
  expect(opening).toInclude('memory.recall and topic');
});

test('it folds a topic past the open limit to its 3 newest items and its sub-topics', () => {
  const rows = [
    ...buildIndexRows('people/family', 12, 1),
    ...buildIndexRows('people/friends', 20, 100),
    ...buildIndexRows('home', 2, 500),
  ];

  const lines = renderIndexBlock(collectTopicRows(rows), {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).split('\n');

  const people = lines.slice(2).join(' ').replaceAll(/\s+/gu, ' ');

  expect(people).toInclude(
    'people (32) folded · newest: [pe00000119] people/friends fact number 119',
  );

  expect(people).toInclude('sub-topics: family 12, friends 20');
  expect(lines.join('\n')).not.toInclude('[pe00000001]');
});

test('it folds a topic with no sub-topic to its newest items alone', () => {
  const text = renderIndexBlock(collectTopicRows(buildIndexRows('home', 30)), {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  });

  const row = text.split('\n').slice(2).join(' ').replaceAll(/\s+/gu, ' ').trim();

  expect(row).toStartWith(
    'home (30) folded · newest: [ho00000030] home fact number 30 about the household · [ho00000029]',
  );

  expect(row).not.toInclude('sub-topics');
  expect(row).not.toInclude('[ho00000027]');
});

test('it makes two topics that differ by case one row, spelled as its newest item spells it', () => {
  const rows = [
    {
      itemID: '00000000-0000-4000-8000-000000000058',
      shortID: 'a000000001',
      subject: 'owner' as const,
      topic: 'Garden',
      gist: 'older',
      createdSequence: 1,
    },
    {
      itemID: '00000000-0000-4000-8000-000000000098',
      shortID: 'a000000002',
      subject: 'owner' as const,
      topic: 'garden',
      gist: 'newer',
      createdSequence: 2,
    },
  ];

  const lines = renderIndexBlock(collectTopicRows(rows), {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).split('\n');

  expect(lines.slice(2)).toStrictEqual(['  garden (2)  [a000000002] newer · [a000000001] older']);
});

test('it wraps a long row under its own indent within 100 characters', () => {
  const lines = renderIndexBlock(collectTopicRows(buildIndexRows('home', 10)), {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).split('\n');

  const row = lines.slice(2);

  expect(row.length).toBeGreaterThan(1);
  expect(row.map((line) => line.length)).toSatisfyAll((length) => length <= 100);
  expect(row.slice(1)).toSatisfyAll((line: string) => line.startsWith(' '.repeat(12)));
});

test('it cuts an unbroken word that is wider than a line', () => {
  const rows = [
    {
      itemID: '00000000-0000-4000-8000-000000000001',
      shortID: 'h1garden01',
      subject: 'owner' as const,
      topic: 'household-and-garden-supplies-list',
      gist: 'x'.repeat(250),
      createdSequence: 1,
    },
  ];

  const lines = renderIndexBlock(collectTopicRows(rows), {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).split('\n');

  const row = lines.slice(2);

  expect(row.length).toBeGreaterThan(2);
  expect(row.map((line) => line.length)).toSatisfyAll((length) => length <= 100);
  expect(row.join('').replaceAll(' ', '')).toContain('x'.repeat(250));
});

test('it stays within a budget by folding the topic with the most items first', () => {
  const rows = [...buildIndexRows('home', 20, 1), ...buildIndexRows('trips', 10, 100)];

  const full = renderIndexBlock(collectTopicRows(rows), {
    ownerName: 'Robin',
    openTopicItems: 25,
    budget: 100_000,
  });

  const budget = countTextTokens(full) - 10;

  const text = renderIndexBlock(collectTopicRows(rows), {
    ownerName: 'Robin',
    openTopicItems: 25,
    budget,
  });

  expect(countTextTokens(text)).toBeLessThanOrEqual(budget);
  expect(text).toMatch(/home \(20\) +folded/u);
  expect(text).not.toMatch(/trips \(10\) +folded/u);
});

test('it drops the topics with the fewest items into a closing line once every topic is folded', () => {
  const rows = [
    ...buildIndexRows('home', 30, 1),
    ...buildIndexRows('trips', 26, 100),
    ...buildIndexRows('pets', 2, 300),
  ];

  const full = renderIndexBlock(collectTopicRows(rows), {
    ownerName: 'Robin',
    openTopicItems: 25,
    budget: 100_000,
  });

  const budget = countTextTokens(full) - 10;

  const text = renderIndexBlock(collectTopicRows(rows), {
    ownerName: 'Robin',
    openTopicItems: 25,
    budget,
  });

  const lines = text.split('\n');

  expect(countTextTokens(text)).toBeLessThanOrEqual(budget);
  expect(text).not.toInclude('pets (2)');
  expect(lines.at(-1)).toBe('and 1 more topics with 2 items: list them with memory.recall topics');
});

test('it drops the later topic when two topics have the same number of items', () => {
  const rows = [...buildIndexRows('aaa', 30, 1), ...buildIndexRows('bbb', 30, 100)];

  const full = renderIndexBlock(collectTopicRows(rows), {
    ownerName: 'Robin',
    openTopicItems: 25,
    budget: 100_000,
  });

  const budget = countTextTokens(full) - 10;

  const text = renderIndexBlock(collectTopicRows(rows), {
    ownerName: 'Robin',
    openTopicItems: 25,
    budget,
  });

  expect(text).toInclude('aaa (30)');
  expect(text).not.toInclude('bbb (30)');
  expect(text).toInclude('and 1 more topics with 30 items');
});

test('it ends with no closing line while every topic shows', () => {
  const text = renderIndexBlock(collectTopicRows(buildIndexRows('home', 3)), {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  });

  expect(text).not.toInclude('more topics');
});
