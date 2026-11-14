import { setWorkTracker } from '@heynixie/clock';
import { setFaultPointHandler } from '@heynixie/tasks';
import type { HarnessLink } from '@heynixie/testing';
import { readDescendants, startHarnessLink, stopProcesses } from '@heynixie/testing';

export interface CrashHarness {
  readonly link: HarnessLink;

  readonly providerURL: string;

  // the program each fetch sandbox runs in place of the fetcher, which refuses every address a
  // test can serve; null keeps the fetcher
  readonly fetchArgv: readonly string[] | null;

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
  const fetcher = env['NIXIE_TEST_FETCHER'];

  setFaultPointHandler((id, work) => link.waitAtFaultPoint(id, work));
  setWorkTracker(link.workTracker);

  return {
    link,
    providerURL,
    fetchArgv: fetcher === undefined ? null : [process.execPath, fetcher],

    // A guest leads its own process group, so it outlives a nixie that exits. A host that loses
    // nixie loses its sandboxes too, so nixie stops every process it started before it exits.
    stopDescendants: () => {
      stopProcesses(readDescendants(process.pid));
    },
  };
}
