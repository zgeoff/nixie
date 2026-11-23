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

test('it shows each sub-topic of an open topic on its own, after the items of the topic itself', () => {
  const rows = [
    ...buildIndexRows('people', 1, 1),
    ...buildIndexRows('people/family', 2, 10),
    ...buildIndexRows('people/friends', 1, 20),
  ];

  const text = renderIndexBlock(collectTopicRows(rows), {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).replaceAll(/\s+/gu, ' ');

  expect(text).toInclude(
    'people (4) [pe00000001] people fact number 1 about the household | family (2): [pe00000011] people/family fact number 11 about the household · [pe00000010] people/family fact number 10 about the household | friends (1): [pe00000020] people/friends fact number 20 about the household',
  );
});

test('it folds the biggest sub-topic first, to its count and 3 items, and keeps its sibling open', () => {
  const rows = [
    ...buildIndexRows('people/family', 12, 1),
    ...buildIndexRows('people/friends', 20, 100),
    ...buildIndexRows('home', 2, 500),
  ];

  const text = renderIndexBlock(collectTopicRows(rows), {
    budget: 500,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).replaceAll(/\s+/gu, ' ');

  expect(text).toInclude(
    'friends (20) folded · newest: [pe00000119] people/friends fact number 119 about the household · [pe00000118]',
  );

  expect(text).toInclude('family (12): [pe00000012]');
  expect(text).toInclude('[pe00000001]');
  expect(text).not.toInclude('[pe00000116]');
  expect(text).not.toInclude('people (32) folded');
});

test('it folds a whole topic only once every one of its sub-topics is folded', () => {
  const rows = collectTopicRows([
    ...buildIndexRows('people/family', 12, 1),
    ...buildIndexRows('people/friends', 20, 100),
    ...buildIndexRows('home', 2, 500),
  ]);

  const [open, subsFolded, wholeFolded] = [500, 300, 200].map((budget) =>
    renderIndexBlock(rows, { budget, openTopicItems: 25, ownerName: 'Robin' }).replaceAll(
      /\s+/gu,
      ' ',
    ),
  );

  expect(open).not.toInclude('family (12) folded');
  expect(subsFolded).toInclude('family (12) folded');
  expect(subsFolded).toInclude('friends (20) folded');
  expect(subsFolded).not.toInclude('people (32) folded');
  expect(wholeFolded).toInclude('people (32) folded · newest: [pe00000119]');
  expect(wholeFolded).toInclude('sub-topics: family 12, friends 20');
});

test('it starts a sub-topic past the open limit folded, and the topic with it when every sub-topic is', () => {
  const text = renderIndexBlock(collectTopicRows(buildIndexRows('garden/beds', 30)), {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).replaceAll(/\s+/gu, ' ');

  expect(text).toInclude('garden (30) folded · newest: [ga00000030]');
  expect(text).toInclude('sub-topics: beds 30');
});

test('it keeps a sub-topic past the open limit folded while its sibling shows every item', () => {
  const rows = collectTopicRows([
    ...buildIndexRows('people/family', 5, 1),
    ...buildIndexRows('people/friends', 30, 100),
  ]);

  const text = renderIndexBlock(rows, {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).replaceAll(/\s+/gu, ' ');

  expect(text).toInclude('family (5): [pe00000005]');
  expect(text).toInclude('friends (30) folded · newest: [pe00000129]');
  expect(text).not.toInclude('people (35) folded');
});

test.each([
  ['newest', '[ho00000030] home fact number 30 about the household · [ho00000029]'],
  ['oldest', '[ho00000001] home fact number 1 about the household · [ho00000002]'],
] as const)(
  'it shows the 3 %s items of a folded row in the topic’s folded order',
  (order, shown) => {
    const rows = collectTopicRows(buildIndexRows('home', 30), [
      { subject: 'owner', topic: 'Home', order },
    ]);

    const text = renderIndexBlock(rows, {
      budget: 3000,
      openTopicItems: 25,
      ownerName: 'Robin',
    }).replaceAll(/\s+/gu, ' ');

    expect(text).toInclude(`home (30) folded · ${order}: ${shown}`);
  },
);

test('it applies the folded order of a topic to a folded sub-topic of an open row, and only for its own subject', () => {
  const rows = collectTopicRows(
    [
      ...buildIndexRows('people/friends', 30, 100),
      ...buildIndexRows('people/family', 5, 200),
      ...buildIndexRows('home', 30, 1),
    ],
    [
      { subject: 'owner', topic: 'people', order: 'oldest' },
      { subject: 'shared', topic: 'home', order: 'oldest' },
    ],
  );

  const text = renderIndexBlock(rows, {
    budget: 100_000,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).replaceAll(/\s+/gu, ' ');

  expect(text).toInclude('friends (30) folded · oldest: [pe00000100]');
  expect(text).toInclude('family (5): [pe00000204]');
  expect(text).toInclude('home (30) folded · newest: [ho00000030]');
});

test('it folds every sub-topic of the index before a topic with none', () => {
  const rows = collectTopicRows([
    ...buildIndexRows('people/family', 7, 1),
    ...buildIndexRows('people/friends', 8, 100),
    ...buildIndexRows('home', 20, 500),
  ]);

  const text = renderIndexBlock(rows, {
    budget: 560,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).replaceAll(/\s+/gu, ' ');

  expect(text).toInclude('family (7) folded');
  expect(text).toInclude('friends (8) folded');
  expect(text).toInclude('home (20) [ho00000519]');
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

test('it cuts a wide word of characters outside the basic plane between whole characters', () => {
  const rows = [
    {
      itemID: '00000000-0000-4000-8000-000000000001',
      shortID: 'h1garden01',
      subject: 'owner' as const,
      topic: 'g'.repeat(39),
      gist: '🌷'.repeat(40),
      createdSequence: 1,
    },
  ];

  const lines = renderIndexBlock(collectTopicRows(rows), {
    budget: 3000,
    openTopicItems: 25,
    ownerName: 'Robin',
  }).split('\n');

  const row = lines.slice(2);

  expect(row.length).toBeGreaterThan(1);
  expect(row).toSatisfyAll((line: string) => line.isWellFormed() && line.length <= 100);
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
