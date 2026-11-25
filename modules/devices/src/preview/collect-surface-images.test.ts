import { expect, test } from 'bun:test';
import { collectSurfaceImages } from './collect-surface-images';

test('it names the images of the blocks of a show', () => {
  expect(
    collectSurfaceImages({
      kind: 'blocks',
      blocks: [
        { kind: 'markdown', text: 'Saturday' },
        { kind: 'image', image: 'k3x9m2p7qa', fit: 'whole' },
      ],
    }),
  ).toStrictEqual(['k3x9m2p7qa']);
});

test('it names the images that the regions of a layout show', () => {
  expect(
    collectSurfaceImages({
      kind: 'layout',
      layout: {
        layoutID: 'ly4n8k2w7q',
        columns: ['1fr', '1fr'],
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
              shownID: 'sh8d4n6w1z',
              sequence: 2,
              content: { kind: 'markdown', markdown: 'Bins go out tonight' },
              untilMs: null,
            },
          },
        ],
      },
    }),
  ).toStrictEqual(['k3x9m2p7qa']);
});
