import type { Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { Sandbox } from '../types';
import { readSandboxOwners } from './read-sandbox-owners';
import type { RemovedSandboxes } from './remove-sandboxes';
import { removeSandboxes } from './remove-sandboxes';

export interface StaleSandboxesOptions {
  readonly log: Log;
  readonly logger: Logger;
  readonly adapter: {
    readonly id: string;
    readonly list: (owner: string) => Promise<readonly Pick<Sandbox, 'id' | 'spec' | 'destroy'>[]>;
  };

  readonly keptOwners: readonly string[];

  // the image names of the release; a kept owner's sandbox on any other image is destroyed, and an
  // empty list destroys nothing by image
  readonly currentImages: readonly string[];

  // kept owners whose sandboxes the image check skips
  readonly imageExemptOwners: readonly string[];
}

export async function removeStaleSandboxes(
  options: StaleSandboxesOptions,
): Promise<RemovedSandboxes> {
  const owners = await readSandboxOwners(options.log, options.adapter.id);

  const listed = await Promise.all(
    owners.map(async (owner) => ({ owner, sandboxes: await options.adapter.list(owner) })),
  );

  const stale = listed.flatMap((entry) =>
    entry.sandboxes.filter((sandbox) => isStale(options, entry.owner, sandbox.spec.image)),
  );

  return removeSandboxes(stale, options.logger);
}

function isStale(options: StaleSandboxesOptions, owner: string, image: string): boolean {
  if (!options.keptOwners.includes(owner)) {
    return true;
  }

  return (
    options.currentImages.length > 0 &&
    !options.imageExemptOwners.includes(owner) &&
    !options.currentImages.includes(image)
  );
}
