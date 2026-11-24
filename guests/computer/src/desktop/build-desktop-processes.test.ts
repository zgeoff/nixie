import { expect, test } from 'bun:test';
import { ownAccount } from '../shell/terminal-account';
import { buildDesktopProcesses } from './build-desktop-processes';
import { terminalLogPath, vncSocketPath } from './constants';

function setupTest() {
  const processes = buildDesktopProcesses({
    terminal: { wrap: (argv) => ['as-terminal', ...argv] },
    terminalShellArgv: ['unshare', '--net', 'bash'],
    terminalEnv: { HOME: '/home/computer', HTTP_PROXY: 'http://127.0.0.1:3128' },
    filesFolder: '/home/computer/files',
  });

  const readArgv = (name: string) => {
    const process = processes.find((candidate) => candidate.name === name);

    return process?.argv ?? [];
  };

  return { processes, readArgv };
}

test('it starts the display first, at 1280 by 800 on an abstract socket alone', () => {
  const ctx = setupTest();

  expect(ctx.processes[0]?.name).toBe('display');

  expect(ctx.readArgv('display')).toStrictEqual([
    'setpriv',
    '--reuid=1003',
    '--regid=1003',
    '--clear-groups',
    '--',
    'Xvfb',
    ':99',
    '-screen',
    '0',
    '1280x800x24',
    '-nolisten',
    'tcp',
    '-nolisten',
    'unix',
    '-ac',
    '-noreset',
  ]);
});

test('it listens for VNC on a Unix socket alone, with the primary selection off', () => {
  const ctx = setupTest();
  const vnc = ctx.readArgv('vnc');

  expect(vnc).toIncludeAllMembers(['-noprimary', '-nosetprimary', '-nopw']);
  expect(vnc[vnc.indexOf('-unixsock') + 1]).toBe(vncSocketPath);
  expect(vnc[vnc.indexOf('-rfbport') + 1]).toBe('0');
  expect(vnc[vnc.indexOf('-rfbportv6') + 1]).toBe('-1');
});

test('it lets a client of the Unix socket through, which x11vnc turns away under -localhost', () => {
  const ctx = setupTest();

  expect(ctx.readArgv('vnc')).not.toContain('-localhost');
});

test('it refuses remote control commands that an X client sends through the display', () => {
  const ctx = setupTest();

  expect(ctx.readArgv('vnc')).toIncludeAllMembers(['-noremote', '-novncconnect']);
});

test('it runs the terminal as its own account, with the namespaced shell, in the files folder', () => {
  const ctx = setupTest();

  expect(ctx.readArgv('terminal')).toStrictEqual([
    'as-terminal',
    'xterm',
    '-l',
    '-lf',
    terminalLogPath,
    '-geometry',
    '100x32+24+24',
    '-e',
    'unshare',
    '--net',
    'bash',
  ]);

  expect(ctx.processes.find((process) => process.name === 'terminal')).toMatchObject({
    cwd: '/home/computer/files',
    env: { DISPLAY: ':99', HTTP_PROXY: 'http://127.0.0.1:3128' },
  });
});

test('it runs the display, the window manager and the VNC server as an account that neither Chromium nor the terminal uses', () => {
  const ctx = setupTest();
  const screen = ['display', 'window-manager', 'vnc'].map((name) => ctx.readArgv(name).slice(0, 3));

  expect(screen).toStrictEqual(
    Array.from({ length: 3 }, () => ['setpriv', '--reuid=1003', '--regid=1003']),
  );
});

test('it leaves a terminal of the test build as the guest’s own user', () => {
  const processes = buildDesktopProcesses({
    terminal: ownAccount,
    terminalShellArgv: ['bash'],
    terminalEnv: {},
    filesFolder: '/files',
  });

  expect(processes.find((process) => process.name === 'terminal')?.argv).toStrictEqual([
    'xterm',
    '-l',
    '-lf',
    terminalLogPath,
    '-geometry',
    '100x32+24+24',
    '-e',
    'bash',
  ]);
});

test('it lets the clipboard pass between the VNC server and its viewer', () => {
  const ctx = setupTest();

  expect(ctx.readArgv('vnc')).not.toIncludeAnyMembers([
    '-nosel',
    '-noclipboard',
    '-nosetclipboard',
  ]);
});
