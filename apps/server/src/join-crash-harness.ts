import { setFaultPointHandler } from '@heynixie/tasks';
import type { HarnessLink } from '@heynixie/testing';
import { startHarnessLink } from '@heynixie/testing';

export interface CrashHarness {
  readonly link: HarnessLink;

  readonly providerURL: string;
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

  return { link, providerURL };
}
