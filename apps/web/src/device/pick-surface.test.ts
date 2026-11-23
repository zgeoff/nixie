import { expect, test } from 'bun:test';
import { pickSurface } from './pick-surface';
import type { DeviceLayout, ScreenEvent } from './use-device-events';

interface Row {
  readonly title: string;
  readonly event: ScreenEvent | null;
  readonly layout: DeviceLayout;
  readonly expected: ReturnType<typeof pickSurface>;
}

test.each<Row>([
  {
    title: 'a show over a layout that has content',
    event: { kind: 'show', content: { kind: 'markdown', text: 'Visitors' }, until: null },
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
          content: { kind: 'markdown', markdown: 'Bins' },
          until: null,
        },
      ],
    },
    expected: { kind: 'blocks', blocks: [{ kind: 'markdown', text: 'Visitors' }] },
  },
  {
    title: 'the layout over the idle scene when a region has content',
    event: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Saturday' }] },
    layout: {
      columns: ['1fr', '1fr'],
      rows: ['1fr'],
      regions: [
        { name: 'pond', column: 1, row: 1, columnSpan: 1, rowSpan: 1, content: null, until: null },
        {
          name: 'note',
          column: 2,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          content: { kind: 'markdown', markdown: 'Bins' },
          until: null,
        },
      ],
    },
    expected: {
      kind: 'layout',
      layout: {
        columns: ['1fr', '1fr'],
        rows: ['1fr'],
        regions: [
          {
            name: 'pond',
            column: 1,
            row: 1,
            columnSpan: 1,
            rowSpan: 1,
            content: null,
            until: null,
          },
          {
            name: 'note',
            column: 2,
            row: 1,
            columnSpan: 1,
            rowSpan: 1,
            content: { kind: 'markdown', markdown: 'Bins' },
            until: null,
          },
        ],
      },
    },
  },
  {
    title: 'the idle scene when every region is blank',
    event: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Saturday' }] },
    layout: {
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [
        { name: 'pond', column: 1, row: 1, columnSpan: 1, rowSpan: 1, content: null, until: null },
      ],
    },
    expected: { kind: 'blocks', blocks: [{ kind: 'markdown', text: '# Saturday' }] },
  },
  {
    title: 'the idle scene when the device holds no layout',
    event: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Saturday' }] },
    layout: null,
    expected: { kind: 'blocks', blocks: [{ kind: 'markdown', text: '# Saturday' }] },
  },
  {
    title: 'a black screen before the first event',
    event: null,
    layout: null,
    expected: { kind: 'blocks', blocks: [] },
  },
])('#pickSurface draws $title', (row) => {
  expect(pickSurface(row.event, row.layout)).toStrictEqual(row.expected);
});
