import { expect, test } from 'bun:test';
import { parseCLIArgs } from './parse-cli-args';

test('it serves with every default when the command line is empty', async () => {
  const parsed = await parseCLIArgs([], ['serve', 'health']);

  expect(parsed).toStrictEqual({
    kind: 'command',
    command: 'serve',
    flags: {
      config: '/etc/nixie/config.yaml',
      manifest: '/app/sandbox-manifest.json',
      encoder: '/app/encoder',
      sops: '/usr/local/bin/sops',
      live: false,
      'as-new': false,
      'keep-sessions': false,
      yes: false,
      'dry-run': false,
    },
    args: [],
  });
});

test.each([
  [
    'serve',
    ['serve', '--config', '/srv/nixie.yaml', '--encoder=', '--sops', '/bin/sops'],
    {
      kind: 'command',
      command: 'serve',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '',
        sops: '/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: [],
    },
  ],
  [
    'check-encoder',
    ['check-encoder', '--encoder', '/opt/encoder'],
    {
      kind: 'command',
      command: 'check-encoder',
      flags: {
        config: '/etc/nixie/config.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/opt/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: [],
    },
  ],
  [
    'health',
    ['health', '--live', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'health',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: true,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: [],
    },
  ],
  [
    'sandbox-manifest',
    ['sandbox-manifest', '--manifest', '/srv/manifest.json'],
    {
      kind: 'command',
      command: 'sandbox-manifest',
      flags: {
        config: '/etc/nixie/config.yaml',
        manifest: '/srv/manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: [],
    },
  ],
  [
    'enrol-code',
    ['enrol-code', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'enrol-code',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: [],
    },
  ],
  [
    'sessions',
    ['sessions', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'sessions',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: [],
    },
  ],
  [
    'session-label',
    ['session-label', 's1', 'laptop', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'session-label',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: ['s1', 'laptop'],
    },
  ],
  [
    'reset',
    ['reset', '--keep-sessions', '--yes'],
    {
      kind: 'command',
      command: 'reset',
      flags: {
        config: '/etc/nixie/config.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': true,
        yes: true,
        'dry-run': false,
      },
      args: [],
    },
  ],
  [
    'memory-subjects',
    ['memory-subjects', '--dry-run', '--database', '/data/backup/nixie.db'],
    {
      kind: 'command',
      command: 'memory-subjects',
      flags: {
        config: '/etc/nixie/config.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': true,
        database: '/data/backup/nixie.db',
      },
      args: [],
    },
  ],
  [
    'memory-pending',
    ['memory-pending', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'memory-pending',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: [],
    },
  ],
  [
    'memory-approve',
    ['memory-approve', 'p1', '--hash', 'h1', '--revise', 'm1@2', '--as-new', '--text', 'new text'],
    {
      kind: 'command',
      command: 'memory-approve',
      flags: {
        config: '/etc/nixie/config.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': true,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
        hash: 'h1',
        revise: 'm1@2',
        text: 'new text',
      },
      args: ['p1'],
    },
  ],
  [
    'memory-reject',
    ['memory-reject', 'p1', '--hash', 'h1', '--reason', 'not true'],
    {
      kind: 'command',
      command: 'memory-reject',
      flags: {
        config: '/etc/nixie/config.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
        hash: 'h1',
        reason: 'not true',
      },
      args: ['p1'],
    },
  ],
  [
    'memory-show',
    ['memory-show', 'm1', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'memory-show',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: ['m1'],
    },
  ],
  [
    'memory-edit',
    ['memory-edit', 'm1@2', '--text', 'fixed'],
    {
      kind: 'command',
      command: 'memory-edit',
      flags: {
        config: '/etc/nixie/config.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
        text: 'fixed',
      },
      args: ['m1@2'],
    },
  ],
  [
    'memory-retire',
    ['memory-retire', 'm1@2', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'memory-retire',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: ['m1@2'],
    },
  ],
  [
    'memory-restore',
    ['memory-restore', 'm1@2', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'memory-restore',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: ['m1@2'],
    },
  ],
  [
    'memory-forget',
    ['memory-forget', 'm1@2', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'memory-forget',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: ['m1@2'],
    },
  ],
  [
    'memory-pin',
    ['memory-pin', 'm1', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'memory-pin',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: ['m1'],
    },
  ],
  [
    'memory-unpin',
    ['memory-unpin', 'm1', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'memory-unpin',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: ['m1'],
    },
  ],
  [
    'memory-diff',
    ['memory-diff', '--config', '/srv/nixie.yaml'],
    {
      kind: 'command',
      command: 'memory-diff',
      flags: {
        config: '/srv/nixie.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
      },
      args: [],
    },
  ],
  [
    'memory-diff-approve',
    ['memory-diff-approve', 'c1', '--hash', 'h1'],
    {
      kind: 'command',
      command: 'memory-diff-approve',
      flags: {
        config: '/etc/nixie/config.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
        hash: 'h1',
      },
      args: ['c1'],
    },
  ],
  [
    'memory-diff-reject',
    ['memory-diff-reject', 'c1', '--hash', 'h1', '--reason', 'stale'],
    {
      kind: 'command',
      command: 'memory-diff-reject',
      flags: {
        config: '/etc/nixie/config.yaml',
        manifest: '/app/sandbox-manifest.json',
        encoder: '/app/encoder',
        sops: '/usr/local/bin/sops',
        live: false,
        'as-new': false,
        'keep-sessions': false,
        yes: false,
        'dry-run': false,
        hash: 'h1',
        reason: 'stale',
      },
      args: ['c1'],
    },
  ],
] as const)('it reads the flags and arguments of %s', async (_name, argv, expected) => {
  const parsed = await parseCLIArgs(argv, [
    'serve',
    'check-encoder',
    'health',
    'sandbox-manifest',
    'enrol-code',
    'sessions',
    'session-label',
    'reset',
    'memory-pending',
    'memory-approve',
    'memory-reject',
    'memory-show',
    'memory-edit',
    'memory-retire',
    'memory-restore',
    'memory-forget',
    'memory-pin',
    'memory-unpin',
    'memory-diff',
    'memory-diff-approve',
    'memory-diff-reject',
    'memory-subjects',
  ]);

  expect(parsed).toStrictEqual(expected);
});

test('it reads flags written with = and flags before the command', async () => {
  const parsed = await parseCLIArgs(['--config=/srv/nixie.yaml', 'health', '--live'], ['health']);

  expect(parsed).toMatchObject({
    command: 'health',
    flags: { config: '/srv/nixie.yaml', live: true },
  });
});

test('it takes the command from the first word after -- when none comes before it', async () => {
  const parsed = await parseCLIArgs(
    ['--config', '/srv/nixie.yaml', '--', 'health'],
    ['serve', 'health'],
  );

  expect(parsed).toMatchObject({
    kind: 'command',
    command: 'health',
    flags: { config: '/srv/nixie.yaml' },
    args: [],
  });
});

test('it hands the words after a command named after -- to that command', async () => {
  const parsed = await parseCLIArgs(
    ['--', 'session-label', 's1', '-work'],
    ['serve', 'session-label'],
  );

  expect(parsed).toMatchObject({ command: 'session-label', args: ['s1', '-work'] });
});

test('it returns a word after -- that names no command as unknown', async () => {
  const parsed = await parseCLIArgs(['--', 'frobnicate'], ['serve', 'health']);

  expect(parsed).toStrictEqual({ kind: 'unknown-command', command: 'frobnicate' });
});

test('it keeps the words after -- as arguments, a dash-led one included', async () => {
  const parsed = await parseCLIArgs(
    ['session-label', 's1', '--', '-work', 'laptop'],
    ['session-label'],
  );

  expect(parsed).toMatchObject({ command: 'session-label', args: ['s1', '-work', 'laptop'] });
});

test('it returns a command nixie does not have as unknown', async () => {
  const parsed = await parseCLIArgs(['frobnicate', '--yes'], ['serve', 'health']);

  expect(parsed).toStrictEqual({ kind: 'unknown-command', command: 'frobnicate' });
});

test('it refuses a flag nixie does not take', async () => {
  const parsed = await parseCLIArgs(['health', '--frobnicate'], ['health']);

  expect(parsed).toStrictEqual({ kind: 'invalid-flags', message: 'Unknown option: --frobnicate' });
});

test('it refuses a value flag given no value', async () => {
  const parsed = await parseCLIArgs(['memory-approve', 'p1', '--hash'], ['memory-approve']);

  expect(parsed).toStrictEqual({
    kind: 'invalid-flags',
    message: "Optional argument '--hash' requires a value",
  });
});
