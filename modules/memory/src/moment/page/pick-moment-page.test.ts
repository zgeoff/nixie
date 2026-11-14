import { expect, test } from 'bun:test';
import { pickMomentPage } from './pick-moment-page';

test('it reads the span from its start on a first page with no reflections', () => {
  const page = pickMomentPage({
    detail: { title: 'The kettle argument', note: 'Settled for good.', reflections: [] },
    after: null,
    anchor: null,
    firstSequence: 12,
    tokenCap: 400,
  });

  expect(page).toStrictEqual({
    title: 'The kettle argument',
    isTitleCut: false,
    isFirstPage: true,
    note: 'Settled for good.',
    isNoteCut: false,
    reflections: [],
    records: { kind: 'read', after: null, tokenCap: expect.toBeWithin(100, 400) },
  });
});

test('it leaves the note off a later page and reads the span after the cursor record', () => {
  const page = pickMomentPage({
    detail: { title: 'The kettle argument', note: 'Settled for good.', reflections: [] },
    after: { kind: 'record', after: 30 },
    anchor: null,
    firstSequence: 12,
    tokenCap: 400,
  });

  expect(page).toMatchObject({
    isFirstPage: false,
    note: null,
    records: { kind: 'read', after: 30 },
  });
});

test('it goes on from the reflection after the anchor, and skips the span', () => {
  const page = pickMomentPage({
    detail: {
      title: 'The kettle argument',
      note: null,
      reflections: [
        { reflectionID: 'r1', model: 'claude-test-4', createdAt: 1, writtenAt: 1, text: 'Noise.' },
        { reflectionID: 'r2', model: 'claude-test-4', createdAt: 2, writtenAt: 2, text: 'Price.' },
      ],
    },
    after: { kind: 'reflection', after: 'r1' },
    anchor: { createdAt: 1, reflectionID: 'r1' },
    firstSequence: 12,
    tokenCap: 400,
  });

  expect(page.reflections.map((reflection) => reflection.reflectionID)).toStrictEqual(['r2']);
});

test('it ends a page at the last reflection that fits, with a cursor on that reflection', () => {
  const page = pickMomentPage({
    detail: {
      title: 'The kettle argument',
      note: null,
      reflections: [
        {
          reflectionID: 'r1',
          model: 'claude-test-4',
          createdAt: 1,
          writtenAt: 1,
          text: 'The quiet kettle won. '.repeat(20),
        },
        {
          reflectionID: 'r2',
          model: 'claude-test-4',
          createdAt: 2,
          writtenAt: 2,
          text: 'The price stopped mattering. '.repeat(20),
        },
      ],
    },
    after: null,
    anchor: null,
    firstSequence: 12,
    tokenCap: 200,
  });

  expect(page.reflections.map((reflection) => reflection.reflectionID)).toStrictEqual(['r1']);
  expect(page.records).toStrictEqual({ kind: 'none', next: { kind: 'reflection', after: 'r1' } });
});

test('it cuts a title longer than a quarter of the page, and still shows the first reflection whole', () => {
  const title = 'k'.repeat(24_001);

  const page = pickMomentPage({
    detail: {
      title,
      note: null,
      reflections: [
        { reflectionID: 'r1', model: 'claude-test-4', createdAt: 1, writtenAt: 1, text: 'Noise.' },
      ],
    },
    after: null,
    anchor: null,
    firstSequence: 12,
    tokenCap: 6000,
  });

  expect(page.isTitleCut).toBeTrue();

  expect(page.title).toSatisfy(
    (cut: string | null) => cut !== null && title.startsWith(cut) && cut.length < 24_001,
  );

  expect(page.reflections).toMatchObject([{ reflectionID: 'r1', text: 'Noise.', isCut: false }]);
  expect(page.records).toMatchObject({ kind: 'read', tokenCap: expect.toBeWithin(1500, 6000) });
});
