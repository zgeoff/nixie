import { formatPreviousReleaseBuild } from './format-previous-release-build';
import { readPreviousReleaseBuild } from './read-previous-release-build';

if (import.meta.main) {
  const build = await readPreviousReleaseBuild();

  process.stdout.write(`${formatPreviousReleaseBuild(build)}\n`);
}
