import { readdir, rm } from 'node:fs/promises';
import { join } from 'node:path';

export async function removeStaleWebBuilds(buildsDir: string): Promise<void> {
  const entries = await readdir(buildsDir).catch(() => []);

  const stale = entries.filter((entry) => /^\d+$/u.test(entry) && !probeProcess(Number(entry)));

  await Promise.all(
    stale.map((entry) => rm(join(buildsDir, entry), { recursive: true, force: true })),
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
