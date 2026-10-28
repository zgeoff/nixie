import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export async function removeExitedProcessDirs(parentDir: string): Promise<void> {
  const entries = await readdir(parentDir).catch(() => []);

  const exited = entries.filter((entry) => /^\d+$/u.test(entry) && !probeProcess(Number(entry)));

  await Promise.all(
    exited.map((entry) => rm(join(parentDir, entry), { recursive: true, force: true })),
  );
}

function probeProcess(pid: number): boolean {
  try {
    process.kill(pid, 0);

    return true;
  } catch (error) {
    return error instanceof Error && 'code' in error && error.code === 'EPERM';
  }
}
