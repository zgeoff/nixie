import { expect, test } from 'bun:test';
import { pickSavedPins } from './pick-saved-pins';

test.each([
  {
    title: 'the pins the host resolved',
    connections: { 'time.now': ['k3x9m2p7qa'] },
    tools: ['time.now'],
    expected: { status: 'pinned', pins: { 'time.now': ['k3x9m2p7qa'] } },
  },
  {
    title: 'no pins for a call that lists no connector tool and names no connection',
    connections: undefined,
    tools: ['tasks.list'],
    expected: { status: 'pinned', pins: {} },
  },
  {
    title: 'unresolved for a list of short IDs the host never resolved',
    connections: ['k3x9m2p7qa'],
    tools: ['time.now'],
    expected: { status: 'unresolved' },
  },
  {
    title: 'unresolved for a connector tool whose pins the host never resolved',
    connections: undefined,
    tools: ['time.now'],
    expected: { status: 'unresolved' },
  },
])('it saves $title', (row) => {
  const saved = pickSavedPins({
    tools: row.tools,
    connections: row.connections,
    usable: { 'time.now': ['k3x9m2p7qa', 'p8d2v6n4rc'] },
  });

  expect(saved).toStrictEqual(row.expected);
});
