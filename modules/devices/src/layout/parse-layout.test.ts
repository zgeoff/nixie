import { expect, test } from 'bun:test';
import type { LayoutInput } from './parse-layout';
import { parseLayout } from './parse-layout';

interface BadRow {
  readonly title: string;
  readonly input: LayoutInput;
  readonly reason: RegExp;
}

test('#parseLayout gives each region a span of 1 when it leaves the span out', () => {
  expect(
    parseLayout({
      columns: ['1fr', '2fr'],
      rows: ['1fr'],
      regions: [
        { name: 'note', column: 1, row: 1 },
        { name: 'clock', column: 2, row: 1 },
      ],
    }),
  ).toStrictEqual({
    status: 'ok',
    layout: {
      columns: ['1fr', '2fr'],
      rows: ['1fr'],
      regions: [
        { name: 'note', column: 1, row: 1, columnSpan: 1, rowSpan: 1 },
        { name: 'clock', column: 2, row: 1, columnSpan: 1, rowSpan: 1 },
      ],
    },
  });
});

test('#parseLayout takes a region that spans several tracks', () => {
  expect(
    parseLayout({
      columns: ['1fr', '1fr'],
      rows: ['1fr', '1fr'],
      regions: [{ name: 'pond', column: 1, row: 1, columnSpan: 2, rowSpan: 2 }],
    }).status,
  ).toBe('ok');
});

test('#parseLayout takes a grid with no regions', () => {
  expect(parseLayout({ columns: ['1fr'], rows: ['1fr'], regions: [] })).toStrictEqual({
    status: 'ok',
    layout: { columns: ['1fr'], rows: ['1fr'], regions: [] },
  });
});

test.each<BadRow>([
  {
    title: 'no columns',
    input: { columns: [], rows: ['1fr'], regions: [{ name: 'note', column: 1, row: 1 }] },
    reason: /1 to 6 columns/u,
  },
  {
    title: 'seven rows',
    input: {
      columns: ['1fr'],
      rows: ['1fr', '1fr', '1fr', '1fr', '1fr', '1fr', '1fr'],
      regions: [{ name: 'note', column: 1, row: 1 }],
    },
    reason: /1 to 6 rows/u,
  },
  {
    title: 'a track that is not a whole number of fr',
    input: { columns: ['1.5fr'], rows: ['1fr'], regions: [{ name: 'note', column: 1, row: 1 }] },
    reason: /1.5fr is not one/u,
  },
  {
    title: 'a track of 13fr',
    input: { columns: ['13fr'], rows: ['1fr'], regions: [{ name: 'note', column: 1, row: 1 }] },
    reason: /13fr is not one/u,
  },
  {
    title: 'thirteen regions',
    input: {
      columns: ['1fr', '1fr', '1fr', '1fr', '1fr', '1fr'],
      rows: ['1fr', '1fr', '1fr'],
      regions: Array.from({ length: 13 }, (_unused, index) => ({
        name: `r${String(index)}`,
        column: (index % 6) + 1,
        row: Math.floor(index / 6) + 1,
      })),
    },
    reason: /up to 12 regions/u,
  },
  {
    title: 'a name with capitals',
    input: { columns: ['1fr'], rows: ['1fr'], regions: [{ name: 'Note', column: 1, row: 1 }] },
    reason: /Note is not 1 to 32/u,
  },
  {
    title: 'a name of 33 characters',
    input: {
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [{ name: 'a'.repeat(33), column: 1, row: 1 }],
    },
    reason: /is not 1 to 32/u,
  },
  {
    title: 'a name used twice',
    input: {
      columns: ['1fr', '1fr'],
      rows: ['1fr'],
      regions: [
        { name: 'note', column: 1, row: 1 },
        { name: 'note', column: 2, row: 1 },
      ],
    },
    reason: /note is used twice/u,
  },
  {
    title: 'a region outside the grid',
    input: { columns: ['1fr'], rows: ['1fr'], regions: [{ name: 'note', column: 2, row: 1 }] },
    reason: /note does not sit inside/u,
  },
  {
    title: 'a span that leaves the grid',
    input: {
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [{ name: 'note', column: 1, row: 1, columnSpan: 2 }],
    },
    reason: /note does not sit inside/u,
  },
  {
    title: 'a column of 0',
    input: { columns: ['1fr'], rows: ['1fr'], regions: [{ name: 'note', column: 0, row: 1 }] },
    reason: /note does not sit inside/u,
  },
  {
    title: 'two regions that overlap',
    input: {
      columns: ['1fr', '1fr'],
      rows: ['1fr'],
      regions: [
        { name: 'note', column: 1, row: 1, columnSpan: 2 },
        { name: 'clock', column: 2, row: 1 },
      ],
    },
    reason: /note and clock overlap/u,
  },
])('#parseLayout refuses $title', (row) => {
  const parsed = parseLayout(row.input);
  const reason = parsed.status === 'bad' ? parsed.reason : null;

  expect(reason).toMatch(row.reason);
});
