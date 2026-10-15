import type { Log } from '@heynixie/log';
import type { Sandbox, SandboxTables } from './types';

export interface StaleSandboxesOptions {
  readonly log: Log;
  readonly adapter: {
    readonly id: string;
    readonly list: (owner: string) => Promise<readonly Pick<Sandbox, 'destroy'>[]>;
  };

  // the owners whose sandboxes outlive a step, such as the conversation, whose task never ends
  readonly keptOwners: readonly string[];
}

// Recovery step 5: destroys every sandbox the adapter made whose owner is not kept, because after a
// restart no step that owned one still runs. A sandbox made by another adapter stays, since only
// its own adapter can destroy it.
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
