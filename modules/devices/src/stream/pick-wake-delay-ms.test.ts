import { expect, test } from 'bun:test';
import type { ScreenState } from '../types';
import { pickWakeDelayMs } from './pick-wake-delay-ms';

interface Row {
  readonly title: string;
  readonly state: ScreenState;
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
    expected: 60_000,
  },
  {
    title: 'a show with no end waits for a record',
    state: { kind: 'show', content: { kind: 'markdown', text: 'a' }, until: null },
    expected: null,
  },
  {
    title: 'an idle screen waits for a record',
    state: { kind: 'idle', scene: [] },
    expected: null,
  },
])('#pickWakeDelayMs gives $title', (row) => {
  expect(pickWakeDelayMs(row.state, Date.parse('2026-11-21T08:00:00.000Z'))).toBe(row.expected);
});
