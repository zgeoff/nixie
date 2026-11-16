import { mkdir, writeFile } from 'node:fs/promises';
import { join } from 'node:path';

// Writes the files of an empty git repository with no remote, so the CLI finds a repository root
// at the working directory and none above it. The image holds no git program.
export async function writeEmptyGitRepo(directory: string): Promise<void> {
  const gitDir = join(directory, '.git');

  await Promise.all(
    ['objects/info', 'objects/pack', 'refs/heads', 'refs/tags'].map((path) =>
      mkdir(join(gitDir, path), { recursive: true }),
    ),
  );

  await writeFile(join(gitDir, 'HEAD'), 'ref: refs/heads/main\n');

  await writeFile(
    join(gitDir, 'config'),
    '[core]\n\trepositoryformatversion = 0\n\tfilemode = true\n\tbare = false\n',
  );
}
