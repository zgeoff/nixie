// The accounts, paths and numbers of the computer image. The Dockerfile creates the accounts with
// these ids, and a test checks that the two agree.

export interface DesktopAccount {
  readonly name: string;
  readonly uid: number;
  readonly gid: number;
  readonly home: string;
}

// Chromium runs as one account, and the terminal and every command as another. The window manager,
// the display and the VNC server run as a third, so neither of the first two shares a user with the
// screen. No account may trace or signal another's processes, which different ids give.
export const chromeAccount: DesktopAccount = {
  name: 'chrome',
  uid: 1001,
  gid: 1001,
  home: '/home/chrome',
};

export const terminalAccount: DesktopAccount = {
  name: 'terminal',
  uid: 1002,
  gid: 1002,
  home: '/home/computer',
};

export const screenAccount: DesktopAccount = {
  name: 'screen',
  uid: 1003,
  gid: 1003,
  home: '/home/screen',
};

export const display = ':99';
export const displayWidth = 1280;
export const displayHeight = 800;

// the VNC server's port, on the loopback of the sandbox
export const vncPort = 5900;

// the memory that the terminal's processes and every command share, so a heavy command ends itself
// before it takes Chromium's memory
export const terminalMemoryLimitBytes = 512 * 1024 * 1024;
export const terminalCgroupName = 'nixie-terminal';

// the program that Playwright starts in place of Chromium: it drops to the Chromium account first
export const chromiumLauncherPath = '/usr/local/bin/nixie-chromium';
