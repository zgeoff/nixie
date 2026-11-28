import { computerOwner, legacyComputerOwners } from '@heynixie/connectors';
import type { StaleSandboxesOptions } from '@heynixie/sandbox';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { checkerOwner } from '@heynixie/sessions';
import type { TasksContext } from '@heynixie/tasks';

type SweptSandboxesOptions = Omit<StaleSandboxesOptions, 'log' | 'keptOwners'>;

// The computer's next call copies each desktop disk into a sandbox on the current image, and only
// then destroys the old sandbox, so an old image is no reason to remove one here.
export async function removeSweptSandboxes(
  context: Pick<TasksContext, 'log' | 'runners'>,
  options: SweptSandboxesOptions,
): Promise<void> {
  const kept = await context.runners.readKeptSandboxOwners(context);

  const legacyOwners = Object.values(legacyComputerOwners);

  await removeStaleSandboxes({
    ...options,
    log: context.log,
    imageExemptOwners: [...options.imageExemptOwners, ...legacyOwners, computerOwner],
    keptOwners: [checkerOwner, computerOwner, ...legacyOwners, ...kept],
  });
}
