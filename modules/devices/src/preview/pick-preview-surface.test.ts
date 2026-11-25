import { expect, test } from 'bun:test';
import { pickPreviewSurface } from './pick-preview-surface';

test('#pickPreviewSurface draws a show over the layout', () => {
  const layout = {
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
          content: { kind: 'markdown', markdown: 'Bins' } as const,
          untilMs: null,
        },
      },
    ],
  };

  expect(
    pickPreviewSurface(
      { kind: 'show', content: { kind: 'markdown', text: 'Visitors' }, until: null },
      layout,
    ),
  ).toStrictEqual({ kind: 'blocks', blocks: [{ kind: 'markdown', text: 'Visitors' }] });
});

test('#pickPreviewSurface draws the layout while a region shows content', () => {
  const layout = {
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
          content: { kind: 'markdown', markdown: 'Bins' } as const,
          untilMs: null,
        },
      },
    ],
  };

  expect(pickPreviewSurface({ kind: 'idle', scene: [] }, layout)).toStrictEqual({
    kind: 'layout',
    layout,
  });
});

test('#pickPreviewSurface draws the idle scene while every region is blank', () => {
  const layout = {
    layoutID: 'ly3k7m2q9x',
    columns: ['1fr'],
    rows: ['1fr'],
    regions: [
      { name: 'note', column: 1, row: 1, columnSpan: 1, rowSpan: 1, background: null, shown: null },
    ],
  };

  expect(
    pickPreviewSurface({ kind: 'idle', scene: [{ kind: 'markdown', text: 'Hello' }] }, layout),
  ).toStrictEqual({ kind: 'blocks', blocks: [{ kind: 'markdown', text: 'Hello' }] });
});
