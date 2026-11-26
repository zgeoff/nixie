import { expect, test } from 'bun:test';
import { buildLayoutReplies } from './build-layout-replies';

test('it queues a layout of 3 regions and the content of each, naming the listed device', () => {
  const body = {
    messages: [
      {
        role: 'user',
        content:
          '{"result":{"devices":[{"shortID":"dk4m7q2w9x","name":"hall display","deviceKind":"screen"}]}}',
      },
    ],
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
    messages: [
      {
        role: 'user',
        content:
          '{"result":{"devices":[{"shortID":"dk4m7q2w9x","name":"hall display","deviceKind":"screen"}]}}',
      },
    ],
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

test.each([
  { step: 'save', tool: 'mcp__nixie__device_layout_save' },
  { step: 'restore', tool: 'mcp__nixie__device_layout_restore' },
] as const)('it queues the $step of the layout named evening on the listed device', (row) => {
  const body = {
    messages: [
      {
        role: 'user',
        content:
          '{"result":{"devices":[{"shortID":"dk4m7q2w9x","name":"hall display","deviceKind":"screen"}]}}',
      },
    ],
  };

  const calls = buildLayoutReplies(row.step).map((reply) => {
    const input = reply.toolUse.input;

    return [reply.toolUse.name, typeof input === 'function' ? input(body) : input];
  });

  expect(calls).toStrictEqual([
    ['mcp__nixie__devices_list', {}],
    [row.tool, { device: 'dk4m7q2w9x', name: 'evening' }],
  ]);
});

test('it queues a layout of 2 regions that keeps the note, and fills the new one', () => {
  const body = {
    messages: [
      {
        role: 'user',
        content:
          '{"result":{"devices":[{"shortID":"dk4m7q2w9x","name":"hall display","deviceKind":"screen"}]}}',
      },
    ],
  };

  const calls = buildLayoutReplies('change').map((reply) => {
    const input = reply.toolUse.input;

    return [reply.toolUse.name, typeof input === 'function' ? input(body) : input];
  });

  expect(calls).toStrictEqual([
    ['mcp__nixie__devices_list', {}],
    [
      'mcp__nixie__device_layout',
      {
        device: 'dk4m7q2w9x',
        columns: ['1fr', '1fr'],
        rows: ['1fr'],
        regions: [
          { name: 'note', column: 1, row: 1 },
          { name: 'garden', column: 2, row: 1, background: 'teal' },
        ],
      },
    ],
    [
      'mcp__nixie__device_region',
      {
        device: 'dk4m7q2w9x',
        region: 'garden',
        content: { kind: 'markdown', markdown: 'Water the pots' },
      },
    ],
  ]);
});

test('it queues a preview of the listed device', () => {
  const body = {
    messages: [
      {
        role: 'user',
        content:
          '{"result":{"devices":[{"shortID":"dk4m7q2w9x","name":"hall display","deviceKind":"screen"}]}}',
      },
    ],
  };

  const calls = buildLayoutReplies('preview').map((reply) => {
    const input = reply.toolUse.input;

    return [reply.toolUse.name, typeof input === 'function' ? input(body) : input];
  });

  expect(calls).toStrictEqual([
    ['mcp__nixie__devices_list', {}],
    ['mcp__nixie__device_preview', { device: 'dk4m7q2w9x' }],
  ]);
});

test('it queues a page for the pond, and a retained message into it', () => {
  const body = {
    messages: [
      {
        role: 'user',
        content:
          '{"result":{"devices":[{"shortID":"dk4m7q2w9x","name":"hall display","deviceKind":"screen"}]}}',
      },
    ],
  };

  const calls = [...buildLayoutReplies('page'), ...buildLayoutReplies('message')].map((reply) => {
    const input = reply.toolUse.input;

    return [reply.toolUse.name, typeof input === 'function' ? input(body) : input];
  });

  expect(calls).toStrictEqual([
    ['mcp__nixie__devices_list', {}],
    [
      'mcp__nixie__device_region',
      {
        device: 'dk4m7q2w9x',
        region: 'pond',
        content: { kind: 'html', html: expect.stringContaining('nixie.onMessage') },
      },
    ],
    ['mcp__nixie__devices_list', {}],
    [
      'mcp__nixie__device_sendToPage',
      { device: 'dk4m7q2w9x', region: 'pond', data: { text: 'hello' }, retain: true },
    ],
  ]);
});

test('it queues a page for the pond that names the approved package and the declared fetch', () => {
  const body = {
    messages: [
      {
        role: 'user',
        content:
          '{"result":{"devices":[{"shortID":"dk4m7q2w9x","name":"hall display","deviceKind":"screen"}]}}',
      },
    ],
  };

  const calls = buildLayoutReplies('package').map((reply) => {
    const input = reply.toolUse.input;

    return [reply.toolUse.name, typeof input === 'function' ? input(body) : input];
  });

  expect(calls).toStrictEqual([
    ['mcp__nixie__devices_list', {}],
    [
      'mcp__nixie__device_region',
      {
        device: 'dk4m7q2w9x',
        region: 'pond',
        content: {
          kind: 'html',
          html: expect.stringContaining('/rpc/device/packages/ripple-count@1.0.0/ripples.js'),
          packages: ['ripple-count@1.0.0'],
          fetches: [{ url: 'https://tides.test/today' }],
        },
      },
    ],
  ]);
});

test('it queues the install of the ripple-count package', () => {
  const calls = buildLayoutReplies('install').map((reply) => {
    const input = reply.toolUse.input;

    return [reply.toolUse.name, typeof input === 'function' ? input({ messages: [] }) : input];
  });

  expect(calls).toStrictEqual([
    ['mcp__nixie__device_addPackage', { name: 'ripple-count', version: '1.0.0' }],
  ]);
});
