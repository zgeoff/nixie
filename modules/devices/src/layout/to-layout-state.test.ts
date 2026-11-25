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
      regions: [
        {
          name: 'pond',
          column: 1,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          background: null,
          shown: null,
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
          name: 'pond',
          column: 1,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          background: null,
          content: null,
          shown: null,
          until: null,
        },
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
          background: null,
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
          background: null,
          content: { kind: 'markdown', markdown: 'Bins go out tonight' },
          shown: 'sh3k7m2q9x',
          until: '2026-11-21T09:30:00.000Z',
        },
      ],
    },
  });
});

test('#toLayoutState gives a page the tickets of its frame and images, never its markup', () => {
  const state = toLayoutState(
    {
      layoutID: 'ly3k7m2q9x',
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [
        {
          name: 'pond',
          column: 1,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          background: null,
          shown: {
            shownID: 'sh3k7m2q9x',
            sequence: 5,
            untilMs: null,
            content: { kind: 'html', html: '<p>secret-markup</p>', images: ['k3x9m2p7qa'] },
          },
        },
      ],
    },
    new Map([['pond', { frame: 'frame-1', images: [{ image: 'k3x9m2p7qa', ticket: 'image-1' }] }]]),
  );

  expect(state.layout?.regions[0]?.content).toStrictEqual({
    kind: 'html',
    frame: 'frame-1',
    images: [{ image: 'k3x9m2p7qa', ticket: 'image-1' }],
  });
});

test('#toLayoutState gives a page that holds no tickets no content', () => {
  const state = toLayoutState({
    layoutID: 'ly3k7m2q9x',
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [
      {
        name: 'pond',
        column: 1,
        row: 1,
        columnSpan: 1,
        rowSpan: 1,
        background: null,
        shown: {
          shownID: 'sh3k7m2q9x',
          sequence: 5,
          untilMs: null,
          content: { kind: 'html', html: '<p>ripples</p>' },
        },
      },
    ],
  });

  expect(state.layout?.regions[0]?.content).toBeNull();
});
