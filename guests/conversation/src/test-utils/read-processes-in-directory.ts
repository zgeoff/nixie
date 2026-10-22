import { readdir, readlink } from 'node:fs/promises';

// Linux shows a removed working directory as the old path with " (deleted)" after it, so that exact
// form still finds a process whose directory is gone. A process can exit between the listing and
// the read, so a failed read counts as no match.
export async function readProcessesInDirectory(directory: string): Promise<readonly number[]> {
  const entries = await readdir('/proc');

  const pids = entries.filter((entry) => /^\d+$/u.test(entry)).map(Number);

  const cwds = await Promise.all(pids.map((pid) => readlink(`/proc/${pid}/cwd`).catch(() => '')));

  return pids.filter((_pid, index) => isInside(cwds[index] ?? '', directory));
}

function isInside(path: string, directory: string): boolean {
  return (
    path === directory || path === `${directory} (deleted)` || path.startsWith(`${directory}/`)
  );
}
