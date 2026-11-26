import { expect, test } from 'bun:test';
import { isDefinitionMoved } from './is-definition-moved';

test.each([
  {
    kind: 'a tool of fixed code',
    loaded: { pinHash: undefined, definitionsHash: undefined },
    current: { pinHash: undefined, definitionsHash: undefined },
    snapshotHash: 'sha256:b',
    expected: false,
  },
  {
    kind: 'a tool whose pin moved',
    loaded: { pinHash: 'sha256:p1', definitionsHash: undefined },
    current: { pinHash: 'sha256:p2', definitionsHash: undefined },
    snapshotHash: 'sha256:b',
    expected: true,
  },
  {
    kind: 'a tool rebuilt from another snapshot',
    loaded: { pinHash: 'sha256:p1', definitionsHash: 'sha256:a' },
    current: { pinHash: 'sha256:p1', definitionsHash: 'sha256:b' },
    snapshotHash: 'sha256:b',
    expected: true,
  },
  {
    kind: 'a tool declared before the snapshot in force',
    loaded: { pinHash: 'sha256:p1', definitionsHash: 'sha256:a' },
    current: { pinHash: 'sha256:p1', definitionsHash: 'sha256:a' },
    snapshotHash: 'sha256:b',
    expected: true,
  },
  {
    kind: 'a tool declared by the snapshot in force',
    loaded: { pinHash: 'sha256:p1', definitionsHash: 'sha256:a' },
    current: { pinHash: 'sha256:p1', definitionsHash: 'sha256:a' },
    snapshotHash: 'sha256:a',
    expected: false,
  },
])('it returns $expected for $kind', (row) => {
  expect(isDefinitionMoved(row.loaded, row.current, row.snapshotHash)).toBe(row.expected);
});
