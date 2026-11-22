import type { TerminalAccount } from '../shell/terminal-account';
import type { DesktopAccount } from './constants';
import { display, displayHeight, displayWidth, screenAccount, vncPort } from './constants';

export interface DesktopProcess {
  readonly name: string;
  readonly argv: readonly string[];
  readonly env: Readonly<Record<string, string>>;
  readonly cwd?: string;

  // a process that the guest starts again when it exits
  readonly isSupervised: boolean;
}

export interface DesktopProcessOptions {
  readonly terminal: TerminalAccount;

  // the terminal's shell, already inside its own network namespace
  readonly terminalShellArgv: readonly string[];
  readonly terminalEnv: Readonly<Record<string, string>>;
  readonly filesFolder: string;
}

// The processes of the virtual desktop: the display, a window manager, the terminal and a VNC server.
// The display listens on an abstract socket alone, and the VNC server on the loopback of the
// sandbox, view-only, with its clipboard off.
export function buildDesktopProcesses(options: DesktopProcessOptions): readonly DesktopProcess[] {
  const screenEnv = { DISPLAY: display, HOME: screenAccount.home };

  return [
    {
      name: 'display',
      argv: toAccountArgv(screenAccount, [
        'Xvfb',
        display,
        '-screen',
        '0',
        `${String(displayWidth)}x${String(displayHeight)}x24`,
        '-nolisten',
        'tcp',
        '-nolisten',
        'unix',
        '-ac',
        '-noreset',
      ]),
      env: screenEnv,
      isSupervised: false,
    },
    {
      name: 'window-manager',
      argv: toAccountArgv(screenAccount, ['openbox']),
      env: screenEnv,
      isSupervised: true,
    },
    {
      name: 'vnc',
      argv: toAccountArgv(screenAccount, [
        'x11vnc',
        '-display',
        display,
        '-localhost',
        '-rfbport',
        String(vncPort),
        '-nopw',
        '-forever',
        '-shared',
        '-viewonly',
        '-nosel',
        '-noprimary',
        '-nosetprimary',
        '-noclipboard',
        '-nosetclipboard',
        '-quiet',
      ]),
      env: screenEnv,
      isSupervised: true,
    },
    {
      name: 'terminal',
      argv: options.terminal.wrap([
        'xterm',
        '-geometry',
        '100x32+24+24',
        '-e',
        ...options.terminalShellArgv,
      ]),
      env: { ...options.terminalEnv, DISPLAY: display },
      cwd: options.filesFolder,
      isSupervised: true,
    },
  ];
}

function toAccountArgv(account: DesktopAccount, argv: readonly string[]): string[] {
  return [
    'setpriv',
    `--reuid=${String(account.uid)}`,
    `--regid=${String(account.gid)}`,
    '--clear-groups',
    '--',
    ...argv,
  ];
}
