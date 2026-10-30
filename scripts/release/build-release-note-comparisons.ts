export interface LastRelease {
  // Empty before the first release.
  readonly tag: string;

  // False for a release from before the config schema was committed.
  readonly hasConfigSchema: boolean;

  readonly releasedSchemaPath: string;
  readonly releasedConfigPath: string;
}

export interface ReleaseNoteComparisons {
  readonly migrations: readonly string[];
  readonly configSchema: readonly string[];
}

// The arguments that point each release-note check at the last release; a check with nothing to
// compare takes none.
export function buildReleaseNoteComparisons(last: Readonly<LastRelease>): ReleaseNoteComparisons {
  if (last.tag === '') {
    return { migrations: [], configSchema: [] };
  }

  return {
    migrations: ['--released', last.releasedSchemaPath, '--last-tag', last.tag],
    configSchema: last.hasConfigSchema
      ? ['--released', last.releasedConfigPath, '--last-tag', last.tag]
      : [],
  };
}
