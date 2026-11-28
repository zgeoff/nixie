import { computerOwner, legacyComputerOwners } from '@heynixie/connectors';
import type { StaleSandboxesOptions } from '@heynixie/sandbox';
import { removeStaleSandboxes } from '@heynixie/sandbox';
import { checkerOwner } from '@heynixie/sessions';
import type { TasksContext } from '@heynixie/tasks';

type SweptSandboxesOptions = Omit<StaleSandboxesOptions, 'log' | 'keptOwners'>;

// The restart sweep removes the sandboxes of every owner that no runner keeps and the checker does not own.
// It spares the computer and the earlier release's browser and shell sandboxes, whatever their
// image: the computer's next call copies each disk before it destroys the sandbox.
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
