import { readdir, rm } from 'node:fs/promises';
import { basename, join } from 'node:path';

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

function isKeptSession(name: string, keep: string | null): boolean {
  return keep !== null && (name === keep || name === `${keep}.jsonl`);
}
