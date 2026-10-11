import { claimEnrolmentCode } from '../claim-enrolment-code';
import { createEnrolmentCode } from '../create-enrolment-code';
import type { APIContext } from '../types';

// A device session as enrolment makes it: a host code, used once by a device of the given name.
// Returns the session's ID and the token the device holds.
export async function createDeviceSession(
  context: APIContext,
  deviceName: string,
): Promise<{ readonly sessionID: string; readonly token: string }> {
  const issued = await createEnrolmentCode(context);
  const enrolled = await claimEnrolmentCode(context, {
    clientActionID: crypto.randomUUID(),
    code: issued.code,
    deviceName,
    tokenDelivery: 'bearer',
  });

  if (enrolled.status !== 'enrolled') {
    throw new Error(`a fresh code failed to enrol: ${enrolled.status}`);
  }
  return { sessionID: enrolled.sessionID, token: enrolled.token };
}
