import { expect, test } from 'bun:test';
import { initialHealth } from '../health/types';
import { buildServerRow } from '../test-utils/build-server-row';
import { buildToolRow } from '../test-utils/build-tool-row';
import { pickCallGate } from './pick-call-gate';

test.each([
  {
    title: 'an exposed tool of a server whose newest listing passed',
    server: buildServerRow(),
    toolRow: buildToolRow(),
    health: { ...initialHealth, hasPassed: true },
    gate: { kind: 'open' },
  },
  {
    title: 'a tool that changed and waits',
    server: buildServerRow(),
    toolRow: buildToolRow({ state: 'stopped_changed' }),
    health: { ...initialHealth, hasPassed: true },
    gate: { kind: 'refused', text: 'tracker.item_get changed and waits for your review' },
  },
  {
    title: 'a tool that no longer fits its declaration',
    server: buildServerRow(),
    toolRow: buildToolRow({ state: 'stopped_unfit' }),
    health: { ...initialHealth, hasPassed: true },
    gate: {
      kind: 'refused',
      text: 'tracker.item_get no longer fits its declaration and waits for your review',
    },
  },
  {
    title: 'a hidden tool',
    server: buildServerRow(),
    toolRow: buildToolRow({ state: 'hidden_new' }),
    health: { ...initialHealth, hasPassed: true },
    gate: { kind: 'refused', text: 'tracker.item_get is not available' },
  },
  {
    title: 'a server that waits for approval',
    server: buildServerRow({ state: 'held' }),
    toolRow: buildToolRow(),
    health: { ...initialHealth, hasPassed: true },
    gate: { kind: 'refused', text: 'tracker waits for your approval' },
  },
  {
    title: 'a server that left the config',
    server: buildServerRow({ state: 'removed' }),
    toolRow: buildToolRow(),
    health: { ...initialHealth, hasPassed: true },
    gate: { kind: 'refused', text: 'tracker is no longer configured' },
  },
  {
    title: 'a server whose grant the last listing found refused',
    server: buildServerRow(),
    toolRow: buildToolRow(),
    health: { ...initialHealth, lastError: 'unauthorised' },
    gate: { kind: 'refused', text: 'tracker needs you to sign in again' },
  },
  {
    title: 'a server that failed its listing, before the next try is due',
    server: buildServerRow(),
    toolRow: buildToolRow(),
    health: { ...initialHealth, failures: 1, lastError: 'refused', nextTryAtMs: 5000 },
    gate: { kind: 'refused', text: 'tracker is unreachable, next try at 5000' },
  },
  {
    title: 'a server that failed its listing, once the next try is due',
    server: buildServerRow(),
    toolRow: buildToolRow(),
    health: { ...initialHealth, failures: 1, lastError: 'refused', nextTryAtMs: 900 },
    gate: { kind: 'list' },
  },
  {
    title: 'a server that has not listed since the start',
    server: buildServerRow(),
    toolRow: buildToolRow(),
    health: initialHealth,
    gate: { kind: 'list' },
  },
])('it picks the gate of $title', (row) => {
  const gate = pickCallGate({
    serverID: 'tracker',
    tool: 'tracker.item_get',
    server: row.server,
    toolRow: row.toolRow,
    health: row.health,
    nowMs: 1000,
    formatTime: (timeMs) => `at ${String(timeMs)}`,
  });

  expect(gate).toStrictEqual(row.gate);
});
