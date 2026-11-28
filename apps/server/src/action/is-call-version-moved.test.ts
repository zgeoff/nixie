import { expect, test } from 'bun:test';
import { isCallVersionMoved } from './is-call-version-moved';

test.each([
  {
    title: 'the same pin and snapshot',
    loaded: { pinHash: 'pin-1', definitionsHash: 'snapshot-1' },
    current: { pinHash: 'pin-1', definitionsHash: 'snapshot-1' },
    moved: false,
  },
  {
    title: 'another pin',
    loaded: { pinHash: 'pin-1' },
    current: { pinHash: 'pin-2' },
    moved: true,
  },
  {
    title: 'another snapshot of the declaration',
    loaded: { pinHash: 'pin-1', definitionsHash: 'snapshot-1' },
    current: { pinHash: 'pin-1', definitionsHash: 'snapshot-2' },
    moved: true,
  },
  {
    title: 'an override that was removed',
    loaded: { pinHash: 'pin-1', definitionsHash: 'snapshot-1' },
    current: { pinHash: 'pin-1' },
    moved: true,
  },
  {
    title: 'an override that was added',
    loaded: { pinHash: 'pin-1' },
    current: { pinHash: 'pin-1', definitionsHash: 'snapshot-1' },
    moved: true,
  },
  {
    title: 'a tool with no version',
    loaded: {},
    current: {},
    moved: false,
  },
])('it finds the version moved is $moved for $title', (row) => {
  expect(isCallVersionMoved(row.loaded, row.current)).toBe(row.moved);
});
