import type { TargetRef } from '@heynixie/coding';

// A daemon of the gateway's registry, as the session list reports it.
export interface ListedDaemon {
  readonly name: string;
  readonly state: string;
}

// The configured daemons that the list does not show as up. A daemon that the registry does not
// name at all comes back as `missing`, so it never reads as a daemon with no sessions.
export function collectDaemonsNotUp(
  daemons: readonly ListedDaemon[],
  targets: readonly TargetRef[],
): ListedDaemon[] {
  const names = [...new Set(targets.map((target) => target.daemon))];

  return names.flatMap((name): ListedDaemon[] => {
    const listed = daemons.find((daemon) => daemon.name === name);

    if (listed === undefined) {
      return [{ name, state: 'missing' }];
    }

    return listed.state === 'up' ? [] : [listed];
  });
}
