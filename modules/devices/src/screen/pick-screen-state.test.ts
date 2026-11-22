import { expect, test } from 'bun:test';
import type { ScreenContent } from '@heynixie/contract';
import type { ScreenState } from '../types';
import { pickScreenState } from './pick-screen-state';
import type { ShownContent } from './pick-screen-state';

interface Row {
  readonly title: string;
  readonly shown: ShownContent | null;
  readonly scene: ScreenContent[];
  readonly expected: ScreenState;
}

test.each<Row>([
  {
    title: 'a show with no end shows until the next show',
    shown: { content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' }, untilMs: null },
    scene: [{ kind: 'markdown', text: '# Saturday' }],
    expected: {
      kind: 'show',
      content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' },
      until: null,
    },
  },
  {
    title: 'a show whose end has not passed shows',
    shown: {
      content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' },
      untilMs: Date.parse('2026-11-21T08:01:00.000Z'),
    },
    scene: [{ kind: 'markdown', text: '# Saturday' }],
    expected: {
      kind: 'show',
      content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' },
      until: '2026-11-21T08:01:00.000Z',
    },
  },
  {
    title: 'a show whose end is now gives way to the idle scene',
    shown: {
      content: { kind: 'image', image: 'k3x9m2p7qa', fit: 'fill' },
      untilMs: Date.parse('2026-11-21T08:00:00.000Z'),
    },
    scene: [{ kind: 'markdown', text: '# Saturday' }],
    expected: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Saturday' }] },
  },
  {
    title: 'no show gives the idle scene',
    shown: null,
    scene: [{ kind: 'markdown', text: '# Saturday' }],
    expected: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Saturday' }] },
  },
  {
    title: 'no show and no scene gives a black screen',
    shown: null,
    scene: [],
    expected: { kind: 'idle', scene: [] },
  },
])('#pickScreenState gives $title', (row) => {
  expect(
    pickScreenState({
      shown: row.shown,
      scene: row.scene,
      nowMs: Date.parse('2026-11-21T08:00:00.000Z'),
    }),
  ).toStrictEqual(row.expected);
});
