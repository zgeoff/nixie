import { join } from 'node:path';
import { chromeAccount, terminalAccount } from './constants';

export interface DiskEntry {
  readonly path: string;
  readonly uid: number;
  readonly gid: number;
  readonly mode: number;
  readonly isRecursive: boolean;
}

// The owner and mode of what the disk holds under its home. Root and the terminal's group own the
// home with the sticky bit, so the terminal cannot replace the profile beside its own files. The
// profile is readable by Chromium's account alone, and the files by the terminal's alone.
export function buildDiskEntries(home: string): readonly DiskEntry[] {
  return [
    { path: home, uid: 0, gid: terminalAccount.gid, mode: 0o1775, isRecursive: false },
    {
      path: join(home, 'profile'),
      uid: chromeAccount.uid,
      gid: chromeAccount.gid,
      mode: 0o700,
      isRecursive: true,
    },
    {
      path: join(home, 'files'),
      uid: terminalAccount.uid,
      gid: terminalAccount.gid,
      mode: 0o700,
      isRecursive: true,
    },
  ];
}
