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
        { name: 'note', column: 1, row: 1, columnSpan: 1, rowSpan: 1, background: null },
        { name: 'clock', column: 2, row: 1, columnSpan: 1, rowSpan: 1, background: null },
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

test('#parseLayout takes a grid of 12 columns, 12 rows and 36 regions', () => {
  expect(
    parseLayout({
      columns: Array.from({ length: 12 }, () => '12fr'),
      rows: Array.from({ length: 12 }, () => '1fr'),
      regions: Array.from({ length: 36 }, (_unused, index) => ({
        name: `r${String(index)}`,
        column: (index % 12) + 1,
        row: Math.floor(index / 12) + 1,
      })),
    }).status,
  ).toBe('ok');
});

test.each(['teal', '#0a1B2c'])('#parseLayout keeps the background %s of a region', (background) => {
  const parsed = parseLayout({
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [{ name: 'note', column: 1, row: 1, background }],
  });

  const kept = parsed.status === 'ok' ? parsed.layout.regions[0]?.background : null;

  expect(kept).toBe(background);
});

test.each<BadRow>([
  {
    title: 'no columns',
    input: { columns: [], rows: ['1fr'], regions: [{ name: 'note', column: 1, row: 1 }] },
    reason: /1 to 12 columns/u,
  },
  {
    title: 'thirteen rows',
    input: {
      columns: ['1fr'],
      rows: Array.from({ length: 13 }, () => '1fr'),
      regions: [{ name: 'note', column: 1, row: 1 }],
    },
    reason: /1 to 12 rows/u,
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
    title: 'thirteen columns',
    input: {
      columns: Array.from({ length: 13 }, () => '1fr'),
      rows: ['1fr'],
      regions: [{ name: 'note', column: 1, row: 1 }],
    },
    reason: /1 to 12 columns/u,
  },
  {
    title: '37 regions',
    input: {
      columns: Array.from({ length: 12 }, () => '1fr'),
      rows: Array.from({ length: 4 }, () => '1fr'),
      regions: Array.from({ length: 37 }, (_unused, index) => ({
        name: `r${String(index)}`,
        column: (index % 12) + 1,
        row: Math.floor(index / 12) + 1,
      })),
    },
    reason: /up to 36 regions/u,
  },
  {
    title: 'a background that is no colour of the palette',
    input: {
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [{ name: 'note', column: 1, row: 1, background: 'chartreuse' }],
    },
    reason: /chartreuse of the region note is not a colour of the palette/u,
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
