import { expect, test } from 'bun:test';
import { buildMcpConfigSchema } from './mcp-config-schema';

test('it defaults the listing timeout and an empty server list', () => {
  expect(buildMcpConfigSchema(false).parse({})).toStrictEqual({
    listingTimeoutSeconds: 10,
    servers: {},
  });
});

test('it reads a server with the defaults for trust and range', () => {
  const server = { url: 'https://tracker.example.org/mcp', clientID: 'nixie-7f3a', scope: 'read' };
  const config = buildMcpConfigSchema(false).parse({ servers: { tracker: server } });

  expect(config.servers['tracker']).toStrictEqual({
    ...server,
    trusted: false,
    privateRange: null,
  });
});

test.each(['T', 'a', 'tracker-1', '1tracker', 'averyveryverylongid'])(
  'it refuses the server ID %s',
  (id) => {
    const result = buildMcpConfigSchema(false).safeParse({
      servers: { [id]: { url: 'https://tracker.example.org/mcp', clientID: 'c', scope: 'read' } },
    });

    expect(result.success).toBe(false);
  },
);

test.each(['web', 'coding', 'memory', 'notebook', 'task'])(
  'it refuses the server ID %s, the first segment of a tool nixie registers',
  (id) => {
    const result = buildMcpConfigSchema(false).safeParse({
      servers: { [id]: { url: 'https://tracker.example.org/mcp', clientID: 'c', scope: 'read' } },
    });

    expect(result.success).toBe(false);
  },
);

test.each([
  'http://tracker.example.org/mcp',
  'https://user:pw@tracker.example.org/mcp',
  'https://tracker.example.org/mcp?x=1',
  'https://tracker.example.org/mcp#top',
  'not a url',
])('it refuses the URL %s', (url) => {
  const result = buildMcpConfigSchema(false).safeParse({
    servers: { tracker: { url, clientID: 'c', scope: 'read' } },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['servers', 'tracker', 'url'] });
});

test.each(['127.0.0.0/8', '127.0.0.1/32', '169.254.1.0/24', '0.0.0.0/32', '::1/128', 'fe80::/10'])(
  'it refuses the private range %s in a release build',
  (privateRange) => {
    const result = buildMcpConfigSchema(false).safeParse({
      servers: {
        tracker: {
          url: 'https://tracker.example.org/mcp',
          clientID: 'c',
          scope: 'r',
          privateRange,
        },
      },
    });

    expect(result.error?.issues).toPartiallyContain({
      path: ['servers', 'tracker', 'privateRange'],
    });
  },
);

test('it refuses a private range that is no CIDR range', () => {
  const result = buildMcpConfigSchema(false).safeParse({
    servers: {
      tracker: {
        url: 'https://tracker.example.org/mcp',
        clientID: 'c',
        scope: 'r',
        privateRange: '10.0.0.1',
      },
    },
  });

  expect(result.error?.issues).toPartiallyContain({ path: ['servers', 'tracker', 'privateRange'] });
});

test('it accepts a private network range', () => {
  const result = buildMcpConfigSchema(false).safeParse({
    servers: {
      tracker: {
        url: 'https://tracker.example.org/mcp',
        clientID: 'c',
        scope: 'r',
        privateRange: '10.20.0.0/16',
      },
    },
  });

  expect(result.success).toBe(true);
});

test('it accepts http and a loopback range in a test build', () => {
  const result = buildMcpConfigSchema(true).safeParse({
    servers: {
      tracker: {
        url: 'http://127.0.0.1:8080/mcp',
        clientID: 'c',
        scope: 'r',
        privateRange: '127.0.0.0/8',
      },
    },
  });

  expect(result.success).toBe(true);
});

test('it refuses an unknown key', () => {
  const result = buildMcpConfigSchema(false).safeParse({
    servers: {
      tracker: { url: 'https://tracker.example.org/mcp', clientID: 'c', scope: 'r', token: 'x' },
    },
  });

  expect(result.success).toBe(false);
});
