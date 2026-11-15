import invariant from 'tiny-invariant';
import { createPasskeyCode } from '../passkey/create-passkey-code';
import { createRegistrationOptions } from '../passkey/create-registration-options';
import { writeRegistration } from '../passkey/write-registration';
import type { APIContext, Identity } from '../types';
import type { AuthenticatorFlags, TestAuthenticator } from './create-test-authenticator';
import { createTestAuthenticator } from './create-test-authenticator';

export interface PasskeySeed {
  readonly caller: Identity;
  readonly origin?: string;
  readonly label?: string;
  readonly flags?: AuthenticatorFlags;
}

export interface SeededPasskey {
  readonly passkeyID: string;
  readonly origin: string;
  readonly rpID: string;
  readonly authenticator: TestAuthenticator;
}

// Registers one passkey through the host code and the registration procedures, as the owner does
// for the first one.
export async function seedPasskey(context: APIContext, seed: PasskeySeed): Promise<SeededPasskey> {
  const origin = seed.origin ?? 'https://nixie.example.org';

  const issued = await createPasskeyCode(context);

  const result = await createRegistrationOptions(context, {
    caller: seed.caller,
    origin,
    code: issued.code,
    assertion: undefined,
  });

  invariant(result.status === 'issued', `registration options were refused: ${result.status}`);

  const authenticator = await createTestAuthenticator();

  const response = await authenticator.register(result.options, {
    origin,
    ...seed.flags,
  });

  const registered = await writeRegistration(context, seed.caller, {
    origin,
    input: {
      clientActionID: crypto.randomUUID(),
      response,
      ...(seed.label === undefined ? {} : { label: seed.label }),
    },
  });

  invariant(registered.status === 'registered', `a registration failed: ${registered.status}`);

  return {
    passkeyID: registered.passkeyID,
    origin,
    rpID: result.options.rp.id,
    authenticator,
  };
}
