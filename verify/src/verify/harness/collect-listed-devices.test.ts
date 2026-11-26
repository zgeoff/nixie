import { expect, test } from 'bun:test';
import { collectListedDevices } from './collect-listed-devices';

test('it collects the devices of a list result in a tool result block', () => {
  const body = {
    messages: [
      {
        role: 'user',
        content: [
          {
            type: 'tool_result',
            tool_use_id: 'toolu_01',
            content: [
              {
                type: 'text',
                text: JSON.stringify({
                  devices: [
                    { shortID: 'aaa111', name: 'laptop', deviceKind: 'client', onCall: false },
                    { shortID: 'fff666', name: 'den {screen}', deviceKind: 'screen', onCall: true },
                  ],
                }),
              },
            ],
          },
        ],
      },
    ],
  };

  expect(collectListedDevices(body)).toStrictEqual([
    { shortID: 'aaa111', name: 'laptop', deviceKind: 'client', onCall: false },
    { shortID: 'fff666', name: 'den {screen}', deviceKind: 'screen', onCall: true },
  ]);
});

test('it collects no device from text that is not JSON', () => {
  const body = { messages: [{ role: 'user', content: 'show the "big" picture on {the} den' }] };

  expect(collectListedDevices(body)).toStrictEqual([]);
});
