import { randomUUID } from 'node:crypto';
import type { ContractClient } from '../../../libs/contract/src/index';
import { buildLiveClient } from './build-live-client';
import { parseEnrolmentCode } from './parse-enrolment-code';
import type { KubectlTarget } from './parse-live-env';
import { requireLiveValue } from './require-live-value';
import { runKubectl } from './run-kubectl';

export interface LiveSession {
  readonly client: ContractClient;
  readonly sessionID: string;

  // revokes the session, which the caller registers as the test's cleanup
  readonly revoke: () => Promise<void>;
}

// Enrols a device on a deployed nixie with a code from the host command in nixie's pod, and
// returns a client that calls the API with the device's bearer token, and the revoke that leaves
// no live session behind.
export async function createLiveSession(url: string, kubectl: KubectlTarget): Promise<LiveSession> {
  const issued = await runKubectl(kubectl, [
    'exec',
    'nixie-0',
    '--container',
    'nixie',
    '--',
    'bun',
    '/app/main.js',
    'enrol-code',
  ]);
  const enrolled = await buildLiveClient(url, null).sessions.enrol({
    clientActionID: randomUUID(),
    code: parseEnrolmentCode(issued),
    deviceName: 'live check',
    tokenDelivery: 'bearer',
  });
  const client = buildLiveClient(url, requireLiveValue(enrolled.token ?? null, 'a bearer token'));

  return {
    client,
    sessionID: enrolled.sessionID,
    revoke: async () => {
      await client.sessions.revoke({ clientActionID: randomUUID(), sessionID: enrolled.sessionID });
    },
  };
}
