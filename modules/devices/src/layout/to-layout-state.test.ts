import { expect, test } from 'bun:test';
import { toLayoutState } from './to-layout-state';

test('#toLayoutState gives a null layout for no layout', () => {
  expect(toLayoutState(null)).toStrictEqual({ kind: 'layout', layout: null });
});

test('#toLayoutState gives a blank region no content and no end', () => {
  expect(
    toLayoutState({
      layoutID: 'ly3k7m2q9x',
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [{ name: 'pond', column: 1, row: 1, columnSpan: 1, rowSpan: 1, shown: null }],
    }),
  ).toStrictEqual({
    kind: 'layout',
    layout: {
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [
        { name: 'pond', column: 1, row: 1, columnSpan: 1, rowSpan: 1, content: null, until: null },
      ],
    },
  });
});

test('#toLayoutState gives a region its content and the time it ends', () => {
  expect(
    toLayoutState({
      layoutID: 'ly3k7m2q9x',
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [
        {
          name: 'note',
          column: 1,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          shown: {
            shownID: 'sh3k7m2q9x',
            sequence: 4,
            content: { kind: 'markdown', markdown: 'Bins go out tonight' },
            untilMs: Date.parse('2026-11-21T09:30:00.000Z'),
          },
        },
      ],
    }),
  ).toStrictEqual({
    kind: 'layout',
    layout: {
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [
        {
          name: 'note',
          column: 1,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          content: { kind: 'markdown', markdown: 'Bins go out tonight' },
          until: '2026-11-21T09:30:00.000Z',
        },
      ],
    },
  });
});
