export interface BundleTexts {
  readonly test: string;
  readonly release: string;
}

// A test bundle starts its guests from their source, so it holds a module's source folder as a
// literal, and a release bundle runs on another host, so it holds none.
export function collectSourceDirFaults(texts: BundleTexts, sourceDir: string): string[] {
  const literal = JSON.stringify(sourceDir);

  return [
    ...(texts.test.includes(literal)
      ? []
      : [`the test bundle does not read ${sourceDir} as its source folder`]),
    ...(texts.release.includes(literal)
      ? [`the release bundle reads ${sourceDir}, a folder of the host that built it`]
      : []),
  ];
}
