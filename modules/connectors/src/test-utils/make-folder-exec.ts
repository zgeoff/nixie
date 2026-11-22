import { mkdir, readFile, readdir, writeFile } from 'node:fs/promises';
import { dirname, join, relative } from 'node:path';
import type { ExecResult, RunSpec } from '@heynixie/sandbox';
import { execOutputLimitBytes, readStreamOutput } from '@heynixie/sandbox';

export interface FolderExecOptions {
  // A command that feeds its standard input to a file and names a path this accepts succeeds
  // without running, so the write goes missing.
  readonly loseWrite?: (path: string) => boolean;
}

export interface FolderExecContext {
  readonly sandboxID: string;
}

// the folder that holds one sandbox's disk, under the folder the exec runs in
export function getFolderDisk(root: string, sandboxID: string): string {
  return join(root, sandboxID);
}

// Answers an exec of a stub sandbox by running the command for real, with the sandbox's disk folder
// as its root. The command starts in that folder below `cwd` and holds the 1 MiB output limit of an
// adapter's exec. It uses paths below its start, because an absolute name reaches outside the disk.
export function makeFolderExec(root: string, options: FolderExecOptions = {}) {
  return async (command: RunSpec, ctx: FolderExecContext): Promise<ExecResult> => {
    const startedAt = performance.now();
    const isLost = command.argv.some((arg) => options.loseWrite?.(arg) === true);

    if (command.stdin !== undefined && isLost) {
      const none = { bytes: new Uint8Array(), totalBytes: 0, isCut: false };

      return { code: 0, signal: null, stdout: none, stderr: none, durationMs: 0 };
    }

    const cwd = join(getFolderDisk(root, ctx.sandboxID), command.cwd ?? '/');

    await mkdir(cwd, { recursive: true });

    const child = Bun.spawn([...command.argv], {
      cwd,
      stdin: new Blob([command.stdin ?? new Uint8Array()]),
      stdout: 'pipe',
      stderr: 'pipe',
    });

    const [stdout, stderr, code] = await Promise.all([
      readStreamOutput(child.stdout, execOutputLimitBytes),
      readStreamOutput(child.stderr, execOutputLimitBytes),
      child.exited,
    ]);

    return { code, signal: null, stdout, stderr, durationMs: performance.now() - startedAt };
  };
}

// puts files on a sandbox's disk folder by their guest paths, with the folders above them
export async function writeDiskFiles(
  root: string,
  sandboxID: string,
  files: Readonly<Record<string, string | Uint8Array>>,
): Promise<void> {
  for (const [path, content] of Object.entries(files)) {
    const target = join(getFolderDisk(root, sandboxID), path);

    await mkdir(dirname(target), { recursive: true });
    await writeFile(target, content);
  }
}

// the regular files of a sandbox's disk folder, as guest path and text, in no set order
export async function readDiskFiles(
  root: string,
  sandboxID: string,
): Promise<readonly (readonly [string, string])[]> {
  const disk = getFolderDisk(root, sandboxID);

  const names = await readdir(disk, { recursive: true, withFileTypes: true }).catch(() => []);

  return Promise.all(
    names
      .filter((entry) => entry.isFile())
      .map(async (entry) => {
        const path = join(entry.parentPath, entry.name);

        const text = await readFile(path, 'utf8');

        return [join('/', relative(disk, path)), text] as const;
      }),
  );
}
