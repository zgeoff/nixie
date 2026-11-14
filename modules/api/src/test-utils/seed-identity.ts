import invariant from 'tiny-invariant';
import { claimEnrolmentCode } from '../enrolment/claim-enrolment-code';
import { createEnrolmentCode } from '../enrolment/create-enrolment-code';
import { verifySessionToken } from '../session/verify-session-token';
import type { APIContext, Identity } from '../types';

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
