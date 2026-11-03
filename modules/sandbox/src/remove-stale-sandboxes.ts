import type { Log } from '@heynixie/log';
import { readSandboxOwners } from './read-sandbox-owners';
import type { Sandbox } from './types';

export interface StaleSandboxesOptions {
  readonly log: Log;
  readonly adapter: {
    readonly id: string;
    readonly list: (owner: string) => Promise<readonly Pick<Sandbox, 'destroy'>[]>;
  };

  readonly keptOwners: readonly string[];
}

export async function removeStaleSandboxes(options: StaleSandboxesOptions): Promise<void> {
  const owners = await readSandboxOwners(options.log, options.adapter.id);

  const stale = owners.filter((owner) => !options.keptOwners.includes(owner));

  const sandboxes = await Promise.all(stale.map((owner) => options.adapter.list(owner)));

  await Promise.all(sandboxes.flat().map((sandbox) => sandbox.destroy()));
}
