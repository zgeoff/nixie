import { expect, test } from 'bun:test';
import { formatCallStatus } from './format-call-status';

test.each([
  { phase: 'connecting', connection: 'new', text: 'Connecting' },
  { phase: 'reconnecting', connection: 'failed', text: 'Reconnecting' },
  { phase: 'live', connection: 'new', text: 'Connecting' },
  { phase: 'live', connection: 'connecting', text: 'Connecting' },
  { phase: 'live', connection: 'connected', text: 'Connected' },
  { phase: 'live', connection: 'disconnected', text: 'Connection unstable' },
  { phase: 'live', connection: 'failed', text: 'Connection lost' },
  { phase: 'ended', connection: 'closed', text: 'Call ended' },
] as const)('#formatCallStatus words $phase with $connection as $text', (row) => {
  expect(formatCallStatus(row)).toBe(row.text);
});
