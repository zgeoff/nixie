import { computerOwner, legacyComputerOwners } from '@heynixie/connectors';
import type { StaleSandboxesOptions } from '@heynixie/sandbox';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { checkerOwner } from '@heynixie/sessions';
import type { TasksContext } from '@heynixie/tasks';

type RecoveredSandboxesOptions = Omit<StaleSandboxesOptions, 'log' | 'keptOwners'>;

// Recovery removes the sandboxes of every owner that no runner keeps and the checker does not own.
// It spares the computer and the earlier release's browser and shell sandboxes, whatever their
// image, until the computer's first call copies their disks and destroys them.
export async function removeRecoveredSandboxes(
  context: Pick<TasksContext, 'log' | 'runners'>,
  options: RecoveredSandboxesOptions,
): Promise<void> {
  const kept = await context.runners.readKeptSandboxOwners(context);

  const legacyOwners = Object.values(legacyComputerOwners);

  await removeStaleSandboxes({
    ...options,
    log: context.log,
    imageExemptOwners: [...options.imageExemptOwners, ...legacyOwners],
    keptOwners: [checkerOwner, computerOwner, ...legacyOwners, ...kept],
  });
}
