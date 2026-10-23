import { setFaultPointHandler } from '@heynixie/tasks';
import type { HarnessLink } from '@heynixie/testing';
import { readDescendants, startHarnessLink, stopProcesses } from '@heynixie/testing';

export interface CrashHarness {
  readonly link: HarnessLink;

  readonly providerURL: string;

  readonly stopDescendants: () => void;
}

export function joinCrashHarness(
  env: Readonly<Record<string, string | undefined>>,
): CrashHarness | null {
  // The crash harness spawns nixie with an IPC channel, and a nixie started any other way has none.
  if (process.send === undefined) {
    return null;
  }

  const providerURL = env['NIXIE_TEST_PROVIDER_URL'];

  if (providerURL === undefined) {
    throw new Error('the crash harness names no provider in NIXIE_TEST_PROVIDER_URL');
  }

  const link = startHarnessLink(env);

  setFaultPointHandler((id, work) => link.waitAtFaultPoint(id, work));

  return {
    link,
    providerURL,

    // A guest leads its own process group, so it outlives a nixie that exits. A host that loses
    // nixie loses its sandboxes too, so nixie stops every process it started before it exits.
    stopDescendants: () => {
      stopProcesses(readDescendants(process.pid));
    },
  };
}
