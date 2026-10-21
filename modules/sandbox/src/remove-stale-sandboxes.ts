import type { Log } from '@heynixie/log';
import type { Sandbox, SandboxTables } from './types';

export interface StaleSandboxesOptions {
  readonly log: Log;
  readonly adapter: {
    readonly id: string;
    readonly list: (owner: string) => Promise<readonly Pick<Sandbox, 'destroy'>[]>;
  };

  readonly keptOwners: readonly string[];
}

export async function removeStaleSandboxes(options: StaleSandboxesOptions): Promise<void> {
  const rows = await options.log.writer.db
    .$extendTables<SandboxTables>()
    .selectFrom('sandboxes')
    .select('owner')
    .distinct()
    .where('adapter', '=', options.adapter.id)
    .orderBy('owner')
    .execute();

  const stale = rows.map((row) => row.owner).filter((owner) => !options.keptOwners.includes(owner));

  const sandboxes = await Promise.all(stale.map((owner) => options.adapter.list(owner)));

  await Promise.all(sandboxes.flat().map((sandbox) => sandbox.destroy()));
}
