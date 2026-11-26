import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderToolChangeNote } from './render-tool-change-note';

test('it renders a tool change as a system message that names the tool with its old and new hash', () => {
  const record = buildMockLogRecord({
    sequence: 91,
    kind: 'tool_changed',
    thread: 'conversation',
    recordedAt: new Date('2026-03-03T09:12:30Z'),
    payload: { tool: 'tracker.item_get', fromHash: 'aaa111', toHash: 'bbb222' },
  });

  const rendered = renderToolChangeNote(record, {
    defaultZone: 'Europe/London',
    now: new Date('2026-03-03T09:13:00Z'),
  });

  expect(rendered).toMatch(
    /^<system-message type="mcp" id="[\da-f]{12}" at="Tue 3 Mar, 09:12, London">\n\[#91\] tracker\.item_get changed on its server \(aaa111 to bbb222\)\. This turn lists the new form\.\n<\/system-message id="[\da-f]{12}">$/u,
  );
});
