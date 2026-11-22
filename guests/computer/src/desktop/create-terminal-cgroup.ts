import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';
import { buildCgroupWrites } from './build-cgroup-writes';

export interface TerminalCgroup {
  // the file that a process writes its id to, to join the group
  readonly procsPath: string;

  // ends every process of the group
  readonly kill: () => Promise<void>;
}

// Creates the cgroup that holds the terminal's processes and every command, with its memory limit.
// A process in it does not end with the guest's own cgroup, so a start and a stop end the group.
export async function createTerminalCgroup(
  root: string,
  name: string,
  memoryLimitBytes: number,
): Promise<TerminalCgroup> {
  const folder = join(root, name);

  await mkdir(folder, { recursive: true });

  const cgroup: TerminalCgroup = {
    procsPath: join(folder, 'cgroup.procs'),
    kill: async () => {
      await writeFile(join(folder, 'cgroup.kill'), '1').catch(() => {});
    },
  };

  await cgroup.kill();

  for (const write of buildCgroupWrites(memoryLimitBytes)) {
    await writeFile(join(folder, write.file), write.value);
  }

  return cgroup;
}
