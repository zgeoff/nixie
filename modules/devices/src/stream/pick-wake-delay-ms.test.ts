import { expect, test } from 'bun:test';
import type { LayoutView, ScreenState } from '../types';
import { pickWakeDelayMs } from './pick-wake-delay-ms';

interface Row {
  readonly title: string;
  readonly state: ScreenState;
  readonly layout: LayoutView | null;
  readonly expected: number | null;
}

test.each<Row>([
  {
    title: 'a show with an end waits for its end',
    state: {
      kind: 'show',
      content: { kind: 'markdown', text: 'a' },
      until: '2026-11-21T08:01:00.000Z',
    },
    layout: null,
    expected: 60_000,
  },
  {
    title: 'a show with no end waits for a record',
    state: { kind: 'show', content: { kind: 'markdown', text: 'a' }, until: null },
    layout: null,
    expected: null,
  },
  {
    title: 'an idle screen waits for a record',
    state: { kind: 'idle', scene: [] },
    layout: null,
    expected: null,
  },
  {
    title: 'a layout waits for its earliest region end',
    state: { kind: 'idle', scene: [] },
    layout: {
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
            shownID: 'sh1',
            sequence: 1,
            content: { kind: 'markdown', markdown: 'a' },
            untilMs: Date.parse('2026-11-21T08:01:30.000Z'),
          },
        },
        {
          name: 'note',
          column: 1,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          background: null,
          shown: {
            shownID: 'sh2',
            sequence: 2,
            content: { kind: 'markdown', markdown: 'b' },
            untilMs: Date.parse('2026-11-21T08:00:30.000Z'),
          },
        },
        {
          name: 'clock',
          column: 1,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          background: null,
          shown: {
            shownID: 'sh3',
            sequence: 3,
            content: { kind: 'markdown', markdown: 'c' },
            untilMs: null,
          },
        },
      ],
    },
    expected: 30_000,
  },
  {
    title: 'a layout whose regions have no end waits for a record',
    state: { kind: 'idle', scene: [] },
    layout: {
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
        {
          name: 'note',
          column: 1,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          background: null,
          shown: {
            shownID: 'sh2',
            sequence: 2,
            content: { kind: 'markdown', markdown: 'b' },
            untilMs: null,
          },
        },
      ],
    },
    expected: null,
  },
  {
    title: 'a region that ends before the show covering it waits for the region',
    state: {
      kind: 'show',
      content: { kind: 'markdown', text: 'a' },
      until: '2026-11-21T08:10:00.000Z',
    },
    layout: {
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
            shownID: 'sh1',
            sequence: 1,
            content: { kind: 'markdown', markdown: 'a' },
            untilMs: Date.parse('2026-11-21T08:02:00.000Z'),
          },
        },
      ],
    },
    expected: 120_000,
  },
])('#pickWakeDelayMs gives $title', (row) => {
  expect(pickWakeDelayMs(row.state, row.layout, Date.parse('2026-11-21T08:00:00.000Z'))).toBe(
    row.expected,
  );
});
