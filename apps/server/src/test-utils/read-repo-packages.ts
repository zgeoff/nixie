import { readFile, readdir } from 'node:fs/promises';
import { join } from 'node:path';
import { z } from 'zod';
import type { RepoPackage } from './types';

const packageSchema = z.object({
  name: z.string(),
  dependencies: z.record(z.string(), z.string()).optional(),
  devDependencies: z.record(z.string(), z.string()).optional(),
});

const turboSchema = z.object({ tags: z.array(z.string()).optional() });

// Each package under a group folder of the repo, such as modules or adapters.
export async function readRepoPackages(root: string, group: string): Promise<RepoPackage[]> {
  const folders = await readdir(join(root, group));

  return Promise.all(
    folders.map(async (folder) => {
      const directory = `${group}/${folder}`;

      const infoText = await readFile(join(root, directory, 'package.json'), 'utf8');
      const turboText = await readFile(join(root, directory, 'turbo.json'), 'utf8');

      const info = packageSchema.parse(JSON.parse(infoText));
      const turbo = turboSchema.parse(JSON.parse(turboText));

      return {
        directory,
        name: info.name,
        tags: turbo.tags ?? [],
        dependsOn: Object.keys({ ...info.dependencies, ...info.devDependencies }).filter((name) =>
          name.startsWith('@heynixie/'),
        ),
      };
    }),
  );
}
