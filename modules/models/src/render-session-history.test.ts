import { expect, test } from 'bun:test';
import { buildMockLogRecord } from '@heynixie/log/test-utils';
import { renderSessionHistory } from './render-session-history';

test('it renders nothing for a thread with no earlier turn', () => {
  expect(renderSessionHistory([])).toBeNull();
});

test('it renders the recent turns in order inside a labelled block', () => {
  const message = buildMockLogRecord({
    kind: 'owner_message',
    recordedAt: new Date('2026-10-12T10:31:00Z'),
    erasable: { status: 'readable', fields: { text: 'Where is the spare key?' } },
  });
  const reply = buildMockLogRecord({
    kind: 'model.reply',
    recordedAt: new Date('2026-10-12T10:32:00Z'),
    erasable: { status: 'readable', fields: { text: 'Under the blue flowerpot.' } },
  });

  expect(renderSessionHistory([message, reply])).toMatchInlineSnapshot(`
    "<conversation-history>
    This session was rebuilt from nixie records after the earlier one was lost. These are the most recent turns before the new message, oldest first, word for word; older turns are left out.
    [2026-10-12 10:31] owner: Where is the spare key?
    [2026-10-12 10:32] nixie: Under the blue flowerpot.
    </conversation-history>"
  `);
});
