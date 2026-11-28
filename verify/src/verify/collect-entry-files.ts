import { isGlobMatch } from '@wringer/core';

// The files an entry names: the files its glob matches, and the files under a folder it names,
// less the files an ignore glob matches.
export function collectEntryFiles(
  files: readonly string[],
  entry: string,
  ignore: readonly string[],
): readonly string[] {
  const entryGlobs = [entry, `${entry.replace(/\/+$/u, '')}/**`];

  return files.filter((file) => isGlobMatch(file, entryGlobs) && !isGlobMatch(file, ignore));
}
