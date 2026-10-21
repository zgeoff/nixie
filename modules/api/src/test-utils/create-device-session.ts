import invariant from 'tiny-invariant';
import { claimEnrolmentCode } from '../claim-enrolment-code';
import { createEnrolmentCode } from '../create-enrolment-code';
import type { APIContext, Identity } from '../types';
import { verifySessionToken } from '../verify-session-token';

interface DeviceSession {
  readonly sessionID: string;
  readonly token: string;

  readonly caller: Identity;
}

export async function createDeviceSession(
  context: APIContext,
  deviceName: string,
): Promise<DeviceSession> {
  const issued = await createEnrolmentCode(context);

  const enrolled = await claimEnrolmentCode(context, {
    clientActionID: crypto.randomUUID(),
    code: issued.code,
    deviceName,
    tokenDelivery: 'bearer',
  });

  invariant(enrolled.status === 'enrolled', `a fresh code failed to enrol: ${enrolled.status}`);

  const caller = await verifySessionToken(context, enrolled.token);

  invariant(caller, 'a fresh session token failed to resolve');

  return { sessionID: enrolled.sessionID, token: enrolled.token, caller };
}
