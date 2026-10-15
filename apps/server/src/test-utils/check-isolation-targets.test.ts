import { expect, onTestFinished, spyOn, test } from 'bun:test';
import { Socket } from 'node:net';
import { checkIsolationTargets } from './check-isolation-targets';

function startListener(hostname: string) {
  const listener = Bun.listen({
    hostname,
    port: 0,
    socket: {
      data: (socket) => {
        socket.end();
      },
    },
  });

  onTestFinished(() => {
    listener.stop(true);
  });

  return listener;
}

const dualStack = {
  eth0: [
    {
      address: '2001:db8:42::7',
      netmask: 'ffff:ffff:ffff:ffff::',
      family: 'IPv6',
      mac: '52:54:00:12:34:56',
      internal: false,
      cidr: '2001:db8:42::7/64',
      scopeid: 0,
    },
  ],
} as const;

const ipv4Only = {
  eth0: [
    {
      address: '10.42.0.17',
      netmask: '255.255.255.0',
      family: 'IPv4',
      mac: '0a:58:0a:2a:00:11',
      internal: false,
      cidr: '10.42.0.17/24',
    },
    {
      address: 'fe80::858:aff:fe2a:11',
      netmask: 'ffff:ffff:ffff:ffff::',
      family: 'IPv6',
      mac: '0a:58:0a:2a:00:11',
      internal: false,
      cidr: 'fe80::858:aff:fe2a:11/64',
      scopeid: 2,
    },
  ],
} as const;

test('it reports a live IPv4 listener beside the sandbox outcome', async () => {
  const listener = startListener('127.0.0.1');

  const lines = await checkIsolationTargets(
    [['127.0.0.1', listener.port]],
    () => Promise.resolve('failed ECONNREFUSED'),
    { interfaces: ipv4Only },
  );

  expect(lines).toStrictEqual([
    `127.0.0.1:${listener.port} listener connected; sandbox failed ECONNREFUSED`,
  ]);
});

test('it reports a failed listener for a port where nothing listens', async () => {
  const listener = Bun.listen({ hostname: '127.0.0.1', port: 0, socket: { data() {} } });
  const port = listener.port;

  listener.stop(true);

  const lines = await checkIsolationTargets(
    [['127.0.0.1', port]],
    () => Promise.resolve('failed ECONNREFUSED'),
    { interfaces: dualStack },
  );

  expect(lines).toStrictEqual([
    `127.0.0.1:${port} listener failed ECONNREFUSED; sandbox failed ECONNREFUSED`,
  ]);
});

test('it reports a live IPv6 listener from a machine with routable IPv6', async () => {
  const listener = startListener('::1');

  const lines = await checkIsolationTargets(
    [['::1', listener.port]],
    () => Promise.resolve('failed timeout'),
    { interfaces: dualStack },
  );

  expect(lines).toStrictEqual([`::1:${listener.port} listener connected; sandbox failed timeout`]);
});

test('it prints an IPv6 target as unprovable from a machine with only link-local IPv6', async () => {
  const warn = spyOn(console, 'warn').mockImplementation(() => {});

  onTestFinished(() => {
    warn.mockRestore();
  });

  const ipv4 = startListener('127.0.0.1');
  const ipv6 = startListener('::1');

  const lines = await checkIsolationTargets(
    [
      ['127.0.0.1', ipv4.port],
      ['::1', ipv6.port],
    ],
    () => Promise.resolve('failed ECONNREFUSED'),
    { interfaces: ipv4Only },
  );

  const unprovable = `::1:${ipv6.port} listener unprovable from the runner, which has no routable IPv6 address; sandbox failed ECONNREFUSED`;

  expect(lines).toStrictEqual([
    `127.0.0.1:${ipv4.port} listener connected; sandbox failed ECONNREFUSED`,
    unprovable,
  ]);

  expect(warn.mock.calls).toStrictEqual([[`no listener proof: ${unprovable}`]]);
});

test('it reports a listener timeout and closes the socket once the deadline passes', async () => {
  const socket = new Socket();

  onTestFinished(() => {
    socket.destroy();
  });

  const lines = await checkIsolationTargets(
    [['192.0.2.7', 8443]],
    () => Promise.resolve('failed timeout'),
    { interfaces: dualStack, deadlineMs: 50, openSocket: () => socket },
  );

  expect(lines).toStrictEqual(['192.0.2.7:8443 listener failed timeout; sandbox failed timeout']);
  expect(socket.destroyed).toBe(true);
});
