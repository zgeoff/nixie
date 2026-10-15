import type { MigrationSummary } from '@heynixie/db';

// The images of one release, each as <repository>@sha256:<digest>, as the release's image stages
// record them
interface ReleaseImages {
  readonly server: string;
  readonly web: string;
  readonly conversation: string;
  readonly fetch: string;
}

interface ConfigSchemaSummary {
  readonly since: string | null;
  readonly breaking: readonly string[];
}

export interface ReleaseManifestInputs {
  readonly version: string;
  readonly commit: string;
  readonly images: ReleaseImages;
  readonly migrations: MigrationSummary;
  readonly configSchema: ConfigSchemaSummary;
}

// The release.json that each release publishes, which a deployment reads in place of nixie's tree.
// format rises only on a change that a reader of the format before would misread. Each image goes
// by tag and digest, because the workflow publishes the file once every image carries the tag.
export function buildReleaseManifest(inputs: ReleaseManifestInputs) {
  return {
    format: 1,
    version: inputs.version,
    tag: `v${inputs.version}`,
    commit: inputs.commit,
    images: {
      server: toTaggedImage(inputs.images.server, inputs.version),
      web: toTaggedImage(inputs.images.web, inputs.version),
    },

    // the sandbox manifest that the server image carries, which impd needs before a rollout
    sandboxImages: {
      conversation: toTaggedImage(inputs.images.conversation, inputs.version),
      fetch: toTaggedImage(inputs.images.fetch, inputs.version),
    },
    migrations: inputs.migrations,
    configSchema: { asset: 'config.schema.json', ...inputs.configSchema },
  };
}

function toTaggedImage(ref: string, version: string): string {
  const match = /^(?<repository>[^@:]+)@(?<digest>sha256:[\da-f]{64})$/u.exec(ref);

  if (match?.groups === undefined) {
    throw new Error(`"${ref}" is not an image named <repository>@sha256:<digest>`);
  }

  return `${match.groups['repository']}:${version}@${match.groups['digest']}`;
}
