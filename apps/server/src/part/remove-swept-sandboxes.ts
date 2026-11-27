import { computerOwner, legacyComputerOwners } from '@heynixie/connectors';
import type { StaleSandboxesOptions } from '@heynixie/sandbox';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { checkerOwner } from '@heynixie/sessions';
import type { TasksContext } from '@heynixie/tasks';

type SweptSandboxesOptions = Omit<StaleSandboxesOptions, 'log' | 'keptOwners'> & {
  // With the computer off its image is not current, and its sandbox holds the owner's desktop disk
  // for when the computer comes back on.
  readonly isComputerOn: boolean;
};

// The restart sweep removes the sandboxes of every owner that no runner keeps and the checker does not own.
// It spares the computer and the earlier release's browser and shell sandboxes, whatever their
// image, until the computer's first call copies their disks and destroys them.
export async function removeSweptSandboxes(
  context: Pick<TasksContext, 'log' | 'runners'>,
  options: SweptSandboxesOptions,
): Promise<void> {
  const kept = await context.runners.readKeptSandboxOwners(context);

  const legacyOwners = Object.values(legacyComputerOwners);
  const { isComputerOn, ...staleOptions } = options;

  await removeStaleSandboxes({
    ...staleOptions,
    log: context.log,
    imageExemptOwners: [
      ...options.imageExemptOwners,
      ...legacyOwners,
      ...(isComputerOn ? [] : [computerOwner]),
    ],
    keptOwners: [checkerOwner, computerOwner, ...legacyOwners, ...kept],
  });
}
