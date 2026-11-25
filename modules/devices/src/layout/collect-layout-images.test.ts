import { expect, test } from 'bun:test';
import { collectLayoutImages } from './collect-layout-images';

test('#collectLayoutImages names the image of each region that shows one', () => {
  expect(
    collectLayoutImages({
      layoutID: 'ly3k7m2q9x',
      columns: ['1fr', '1fr', '1fr'],
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
            shownID: 'sh1',
            sequence: 1,
            content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'whole' },
            untilMs: null,
          },
        },
        {
          name: 'note',
          column: 2,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          background: null,
          shown: {
            shownID: 'sh2',
            sequence: 2,
            content: { kind: 'markdown', markdown: 'a' },
            untilMs: null,
          },
        },
        {
          name: 'clock',
          column: 3,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          background: null,
          shown: null,
        },
      ],
    }),
  ).toStrictEqual(['k3x9m2p7qa']);
});

test('#collectLayoutImages names no image for no layout', () => {
  expect(collectLayoutImages(null)).toStrictEqual([]);
});
