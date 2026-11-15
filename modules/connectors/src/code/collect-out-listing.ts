import { codeRunLimits } from './code-run-limits';

export interface OutFile {
  // relative to the work folder, such as out/totals.png
  readonly path: string;
  readonly bytes: number;
}

// Parses what `find /work/out -type f -printf '%s %P\0'` prints: each entry is a size, a space and
// the path below out/, ended by a NUL. A path may hold a space or a newline, so an entry splits at
// its first space only. The entries come back in path order.
export function collectOutListing(output: Uint8Array): readonly OutFile[] {
  const text = new TextDecoder().decode(output);

  const files: OutFile[] = [];

  for (const entry of text.split('\0')) {
    const space = entry.indexOf(' ');
    const bytes = Number(entry.slice(0, space));

    if (space > 0 && Number.isSafeInteger(bytes)) {
      files.push({ path: `out/${entry.slice(space + 1)}`, bytes });
    }
  }

  return files.toSorted((first, second) => (first.path < second.path ? -1 : 1));
}

export function sumBytes(listed: readonly OutFile[]): number {
  return listed.reduce((sum, file) => sum + file.bytes, 0);
}

// whether out/ holds more files or more bytes than a code run returns; a listing that the exec cap
// cut counts as past the limit
export function isFilesLimitPassed(listed: readonly OutFile[], isCut: boolean): boolean {
  return (
    isCut ||
    listed.length > codeRunLimits.outputFiles ||
    sumBytes(listed) > codeRunLimits.outputBytes
  );
}
