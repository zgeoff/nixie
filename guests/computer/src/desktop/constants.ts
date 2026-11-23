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

// The VNC server listens on a Unix socket alone, in a folder that only the screen account, which
// runs the server, and the guest, which runs as root, can open. It listens on no TCP port, so a page
// in Chromium, which runs as another account, has no way to reach it.
export const vncSocketFolder = '/run/nixie-vnc';
export const vncSocketPath = `${vncSocketFolder}/vnc.sock`;

// How long the guest tries a missing socket again. On a cold start the server listened within a
// second of the first try, and a supervised restart waits a second more.
export const vncConnectWaitMs = 5000;

// Where xterm logs what the terminal shows, in a folder that only the terminal account and the guest
// open. A hand-back reads the last lines of it to tell the assistant what the screen held.
export const terminalLogFolder = '/var/lib/nixie-terminal';
export const terminalLogPath = `${terminalLogFolder}/terminal.log`;

// the memory that the terminal's processes and every command share, so a heavy command ends itself
// before it takes Chromium's memory
export const terminalMemoryLimitBytes = 512 * 1024 * 1024;
export const terminalCgroupName = 'nixie-terminal';

// the program that Playwright starts in place of Chromium: it drops to the Chromium account first
export const chromiumLauncherPath = '/usr/local/bin/nixie-chromium';
