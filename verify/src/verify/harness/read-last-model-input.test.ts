import { expect, test } from 'bun:test';
import { readLastModelInput } from './read-last-model-input';

test('#readLastModelInput returns the last message of the newest request as JSON', () => {
  const requests = [
    { path: '/v1/messages', headers: {}, body: { messages: [{ role: 'user', content: 'old' }] } },
    {
      path: '/v1/messages',
      headers: {},
      body: {
        messages: [
          { role: 'user', content: 'first' },
          { role: 'user', content: [{ type: 'text', text: 'exitCode 0' }] },
        ],
      },
    },
  ];

  expect(readLastModelInput(requests)).toBe('[{"type":"text","text":"exitCode 0"}]');
});

test('#readLastModelInput returns null when no request was made', () => {
  expect(readLastModelInput([])).toBe('null');
});
