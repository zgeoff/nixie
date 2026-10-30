import type { MigrationSummary } from '@heynixie/db';
import type { z } from 'zod';
import type { releaseImagesSchema } from './release-images-schema';

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

export function buildReleaseManifest(inputs: ReleaseManifestInputs) {
  const releaseImages: z.infer<typeof releaseImagesSchema> = {
    images: {
      server: toTaggedImage(inputs.images.server, inputs.version),
      web: toTaggedImage(inputs.images.web, inputs.version),
    },
    sandboxImages: {
      conversation: toTaggedImage(inputs.images.conversation, inputs.version),
      fetch: toTaggedImage(inputs.images.fetch, inputs.version),
    },
  };

  return {
    format: 1,
    version: inputs.version,
    tag: `v${inputs.version}`,
    commit: inputs.commit,
    ...releaseImages,
    migrations: inputs.migrations,
    configSchema: { asset: 'config.schema.json', ...inputs.configSchema },
  };
}

function toTaggedImage(ref: string, version: string): string {
  // only the registry host may hold a colon, for its port, so a tag in the last segment fails
  const match = /^(?<repository>(?:[^/@]+\/)*[^/@:]+)@(?<digest>sha256:[\da-f]{64})$/u.exec(ref);

  if (match?.groups === undefined) {
    throw new Error(`"${ref}" is not an image named <repository>@sha256:<digest>`);
  }

  return `${match.groups['repository']}:${version}@${match.groups['digest']}`;
}
