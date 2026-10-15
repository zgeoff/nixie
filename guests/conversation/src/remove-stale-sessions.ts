import { readdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

// Removes every SDK session on the guest's disk but the one the turn resumes. Each turn forks a
// session that copies the history up to its boundary, so keeping the old ones would grow the disk
// by a whole transcript per turn. With no config folder set, it removes nothing.
export async function removeStaleSessions(
  configDir: string | undefined,
  keep: string | null,
): Promise<void> {
  if (configDir === undefined) {
    return;
  }

  const projectsDir = join(configDir, 'projects');

  const projects = await readdir(projectsDir).catch(() => []);

  const entries = await Promise.all(
    projects.map(async (project) => {
      const names = await readdir(join(projectsDir, project));

      return names.map((name) => join(projectsDir, project, name));
    }),
  );

  const stale = entries.flat().filter((path) => !isKeptSession(basename(path), keep));

  await Promise.all(stale.map((path) => rm(path, { recursive: true, force: true })));
}

// a session's transcript is <id>.jsonl, and its side files sit in a folder named <id>
function isKeptSession(name: string, keep: string | null): boolean {
  return keep !== null && (name === keep || name === `${keep}.jsonl`);
}
