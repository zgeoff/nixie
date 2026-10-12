import invariant from 'tiny-invariant';
import { claimEnrolmentCode } from '../claim-enrolment-code';
import { createEnrolmentCode } from '../create-enrolment-code';
import type { APIContext, Identity } from '../types';
import { verifySessionToken } from '../verify-session-token';

interface DeviceSession {
  readonly sessionID: string;
  readonly token: string;

  // the identity the token resolves to, which a procedure receives as its caller
  readonly caller: Identity;
}

// A device session as enrolment makes it: a host code, used once by a device of the given name.
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

  // a fresh host code always enrols, and the token it gives always resolves
  invariant(enrolled.status === 'enrolled', `a fresh code failed to enrol: ${enrolled.status}`);
  const caller = await verifySessionToken(context, enrolled.token);

  invariant(caller, 'a fresh session token failed to resolve');
  return { sessionID: enrolled.sessionID, token: enrolled.token, caller };
}
