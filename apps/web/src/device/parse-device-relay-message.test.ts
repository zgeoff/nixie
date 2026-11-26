import { expect, test } from 'bun:test';
import { parseDeviceRelayMessage } from './parse-device-relay-message';
import type { DeviceEvents } from './types';

test('it parses what a holder shows, with its layout, messages and notices', () => {
  const events: DeviceEvents = {
    event: { kind: 'idle', scene: [{ kind: 'markdown', text: '# Sunday' }] },
    layout: {
      columns: ['1fr'],
      rows: ['1fr'],
      regions: [
        {
          name: 'note',
          column: 1,
          row: 1,
          columnSpan: 1,
          rowSpan: 1,
          background: null,
          content: null,
          shown: 'sh1',
          until: null,
        },
      ],
    },
    messages: [
      { kind: 'message', region: 'note', shown: 'sh1', data: { count: 1 }, retain: true, id: 1 },
    ],
    notices: [{ kind: 'data', region: 'note', shown: 'sh1', url: 'https://example.test/a', id: 2 }],
    lastMessageID: 1,
    lastNoticeID: 2,
    connection: 'open',
  };

  expect(parseDeviceRelayMessage({ kind: 'leader', tab: 'a', events })).toStrictEqual({
    kind: 'leader',
    tab: 'a',
    events,
  });
});

test.each([
  ['an unknown kind', { kind: 'takeover', tab: 'a' }],
  ['a holder message with no events', { kind: 'leader', tab: 'a' }],
  [
    'a layout event in the screen event',
    {
      kind: 'leader',
      tab: 'a',
      events: {
        event: { kind: 'layout', layout: null },
        layout: null,
        messages: [],
        notices: [],
        lastMessageID: 0,
        lastNoticeID: 0,
        connection: 'open',
      },
    },
  ],
  ['a string', 'join'],
])('it refuses %s', (_title, data) => {
  expect(parseDeviceRelayMessage(data)).toBeNull();
});
