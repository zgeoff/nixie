import { expect, test } from 'bun:test';
import { buildNamespacedArgv, buildUnshareArgv } from './make-shell-handler';

function setupTest() {
  return { bridgeScript: '/app/bridge.js', proxySocketPath: '/run/nixie-computer/proxy.sock' };
}

test('it puts a command in new user, network and process namespaces behind the bridge to the proxy', () => {
  const ctx = setupTest();

  expect(buildUnshareArgv(ctx, ['bash', '-lc', 'ls'])).toStrictEqual([
    'unshare',
    '--user',
    '--map-root-user',
    '--net',
    '--pid',
    '--fork',
    '--kill-child',
    process.execPath,
    '/app/bridge.js',
    '/run/nixie-computer/proxy.sock',
    '3128',
    'bash',
    '-lc',
    'ls',
  ]);
});

test('it starts a command as the terminal account, with the namespaces made after the drop to its user', () => {
  const ctx = setupTest();

  const argv = buildNamespacedArgv(
    { ...ctx, account: { wrap: (inner) => ['as-terminal', ...inner] } },
    ['bash'],
  );

  expect(argv.slice(0, 3)).toStrictEqual(['as-terminal', 'unshare', '--user']);
});
