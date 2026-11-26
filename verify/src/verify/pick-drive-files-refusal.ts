import type { z } from 'zod';
import type { controlRoutes } from './harness/control-routes';

type File = z.output<typeof controlRoutes.driveFiles.output>['files'][number];

interface ExpectedFile {
  readonly name: string;

  // the whole text of the file; checked when given
  readonly text?: string | undefined;
}

// A file that was made twice, or not at all, or with other words, shows in the store that the fake
// Drive kept, which no record of nixie's own can show.
export function pickDriveFilesRefusal(
  files: readonly File[],
  expected: ExpectedFile,
): string | null {
  const named = files.filter((file) => file.name === expected.name);

  if (named.length !== 1) {
    return `the fake Drive holds ${named.length} files named ${expected.name}, not 1`;
  }

  const [only] = named;

  if (expected.text !== undefined && only?.text !== expected.text) {
    return `the file ${expected.name} holds other text than expected`;
  }

  return null;
}
