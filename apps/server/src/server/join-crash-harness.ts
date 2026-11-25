import { setWorkTracker } from '@heynixie/clock';
import { setFaultPointHandler } from '@heynixie/tasks';
import type { HarnessLink } from '@heynixie/testing';
import { readDescendants, startHarnessLink, stopProcesses } from '@heynixie/testing';

export interface CrashHarness {
  readonly link: HarnessLink;

  readonly providerURL: string;

  // the atc-gateway double that serves the coding runner in place of the configured gateway; null
  // keeps the configured one
  readonly atcURL: string | null;

  // the program each fetch sandbox runs in place of the fetcher, which refuses every address a
  // test can serve, with the URL of the test site as its argument when there is one; null keeps the
  // fetcher
  readonly fetchArgv: readonly string[] | null;

  // the fake Google site that consents, token requests and scope reads go to; null keeps Google's
  // own hosts
  readonly googleURL: string | null;

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
  const fetchSiteURL = env['NIXIE_TEST_FETCH_SITE_URL'];

  setFaultPointHandler((id, work) => link.waitAtFaultPoint(id, work));
  setWorkTracker(link.workTracker);

  return {
    link,
    providerURL,
    atcURL: env['NIXIE_TEST_ATC_URL'] ?? null,
    googleURL: env['NIXIE_TEST_GOOGLE_URL'] ?? null,
    fetchArgv:
      fetcher === undefined
        ? null
        : [process.execPath, fetcher, ...(fetchSiteURL === undefined ? [] : [fetchSiteURL])],

    // A guest leads its own process group, so it outlives a nixie that exits. A host that loses
    // nixie loses its sandboxes too, so nixie stops every process it started before it exits.
    stopDescendants: () => {
      stopProcesses(readDescendants(process.pid));
    },
  };
}
