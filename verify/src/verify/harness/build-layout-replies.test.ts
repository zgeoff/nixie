import { expect, test } from 'bun:test';
import { buildLayoutReplies } from './build-layout-replies';

test('it queues a layout of 3 regions and the content of each, naming the listed device', () => {
  const body = {
    messages: [{ role: 'user', content: '{"result":{"devices":[{"device":"dk4m7q2w9x"}]}}' }],
  };

  const calls = buildLayoutReplies('set').map((reply) => {
    const input = reply.toolUse.input;

    return [reply.toolUse.name, typeof input === 'function' ? input(body) : input];
  });

  expect(calls).toStrictEqual([
    ['mcp__nixie__devices_list', {}],
    [
      'mcp__nixie__device_layout',
      {
        device: 'dk4m7q2w9x',
        columns: ['1fr', '2fr', '1fr'],
        rows: ['1fr'],
        regions: [
          { name: 'pond', column: 1, row: 1 },
          { name: 'note', column: 2, row: 1 },
          { name: 'clock', column: 3, row: 1 },
        ],
      },
    ],
    [
      'mcp__nixie__device_region',
      {
        device: 'dk4m7q2w9x',
        region: 'pond',
        content: { kind: 'markdown', markdown: 'Ripples' },
        minutes: 1,
      },
    ],
    [
      'mcp__nixie__device_region',
      {
        device: 'dk4m7q2w9x',
        region: 'note',
        content: { kind: 'markdown', markdown: 'Bins go out tonight' },
      },
    ],
    [
      'mcp__nixie__device_region',
      {
        device: 'dk4m7q2w9x',
        region: 'clock',
        content: { kind: 'live', live: 'clock', format: 'HH:mm' },
      },
    ],
  ]);
});

test('it queues a replacement of the text of the second region', () => {
  const body = {
    messages: [{ role: 'user', content: '{"result":{"devices":[{"device":"dk4m7q2w9x"}]}}' }],
  };

  const calls = buildLayoutReplies('update').map((reply) => {
    const input = reply.toolUse.input;

    return [reply.toolUse.name, typeof input === 'function' ? input(body) : input];
  });

  expect(calls).toStrictEqual([
    ['mcp__nixie__devices_list', {}],
    [
      'mcp__nixie__device_region',
      {
        device: 'dk4m7q2w9x',
        region: 'note',
        content: { kind: 'markdown', markdown: 'Dentist at 3' },
      },
    ],
  ]);
});
