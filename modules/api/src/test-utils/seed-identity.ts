import invariant from 'tiny-invariant';
import { claimEnrolmentCode } from '../claim-enrolment-code';
import { createEnrolmentCode } from '../create-enrolment-code';
import type { APIContext, Identity } from '../types';
import { verifySessionToken } from '../verify-session-token';

export interface IdentitySeed {
  readonly deviceName: string;
}

export interface SeededIdentity {
  readonly sessionID: string;
  readonly token: string;

  readonly caller: Identity;
}

export async function seedIdentity(
  context: APIContext,
  input: Partial<IdentitySeed> = {},
): Promise<SeededIdentity> {
  const issued = await createEnrolmentCode(context);

  const enrolled = await claimEnrolmentCode(context, {
    clientActionID: crypto.randomUUID(),
    code: issued.code,
    deviceName: input.deviceName ?? 'laptop',
    tokenDelivery: 'bearer',
  });

  invariant(enrolled.status === 'enrolled', `a fresh code failed to enrol: ${enrolled.status}`);

  const caller = await verifySessionToken(context, enrolled.token);

  invariant(caller, 'a fresh session token failed to resolve');

  return { sessionID: enrolled.sessionID, token: enrolled.token, caller };
}
