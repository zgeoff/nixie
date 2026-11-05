import { mock } from 'bun:test';

export function buildStubLibraryOpener(libraries: Readonly<Record<string, string>>) {
  return mock((name: string) => {
    const library = libraries[name];

    if (library === undefined) {
      throw new Error(`cannot open ${name}`);
    }

    return library;
  });
}
