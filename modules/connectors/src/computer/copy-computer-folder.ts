import { join } from 'node:path';
import type { Sandbox } from '@heynixie/sandbox';

// what a computer disk keeps under the guest's home: Chromium's profile and the assistant's files
export const computerFolders = ['profile', 'files'] as const;

export type ComputerFolder = (typeof computerFolders)[number];

export interface FolderEnds {
  readonly from: Sandbox;
  readonly fromEnv: Readonly<Record<string, string>>;
  readonly to: Sandbox;
  readonly toEnv: Readonly<Record<string, string>>;
  readonly folder: ComputerFolder;
}

// Copies one folder of one sandbox into another, one file at a time, and reads each file back from
// the new disk. It throws unless every file came back with the same bytes and the new folder holds
// the same count of files. It removes nothing, so a failed check leaves both disks as they were.
export async function copyComputerFolder(ends: FolderEnds): Promise<void> {
  const fromHome = await ends.from.resolveHome(ends.fromEnv);
  const toHome = await ends.to.resolveHome(ends.toEnv);

  const source = join(fromHome.copyPath, ends.folder);
  const target = join(toHome.copyPath, ends.folder);

  const paths = await ends.from.readFilePaths(source);

  for (const path of paths) {
    const [file] = await ends.from.copyOut([join(source, path)]);

    if (file === undefined) {
      throw new Error(`the old disk gave no file for ${path}`);
    }

    await ends.to.copyIn([{ path: join(target, path), content: file.content }]);

    const [written] = await ends.to.copyOut([join(target, path)]);

    if (written?.content.byteLength !== file.content.byteLength) {
      throw new Error(`the new disk holds a different size for ${ends.folder}/${path}`);
    }
  }

  const held = await ends.to.readFilePaths(target);

  if (held.length !== paths.length) {
    throw new Error(
      `the new disk holds ${String(held.length)} files in ${ends.folder}, the old one ${String(paths.length)}`,
    );
  }
}
