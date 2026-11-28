import { expect, test } from 'bun:test';
import { collectReachableTools } from './collect-reachable-tools';

test('it drops a tool whose pins all name forgotten connections', () => {
  const tools = collectReachableTools(
    ['gmail.search', 'time.now'],
    { 'gmail.search': ['k3x9m2p7qa', 'p8d2v6n4rc'] },
    new Set(['z1z1z1z1z1']),
  );

  expect(tools).toStrictEqual(['time.now']);
});

test('it keeps a tool with one pin that is still live', () => {
  const tools = collectReachableTools(
    ['gmail.search'],
    { 'gmail.search': ['k3x9m2p7qa', 'p8d2v6n4rc'] },
    new Set(['p8d2v6n4rc']),
  );

  expect(tools).toStrictEqual(['gmail.search']);
});

test('it keeps every tool when the run holds no pins', () => {
  const tools = collectReachableTools(['gmail.search'], undefined, new Set());

  expect(tools).toStrictEqual(['gmail.search']);
});

test('it drops a tool pinned to no connection at all', () => {
  const tools = collectReachableTools(['gmail.search'], { 'gmail.search': [] }, new Set(['a']));

  expect(tools).toStrictEqual([]);
});
