import type { AuthenticationResponseJSON } from '@simplewebauthn/server';
import type { Assertion } from './challenge-for';

// The contract's schema allows a missing field as undefined, and the WebAuthn library's type allows
// it only as an absent key.
export function toAuthenticationResponse(assertion: Assertion): AuthenticationResponseJSON {
  return {
    id: assertion.id,
    rawId: assertion.rawId,
    type: assertion.type,

    // verification reads no client extension result
    clientExtensionResults: {},
    response: {
      clientDataJSON: assertion.response.clientDataJSON,
      authenticatorData: assertion.response.authenticatorData,
      signature: assertion.response.signature,
      ...(assertion.response.userHandle === undefined
        ? {}
        : { userHandle: assertion.response.userHandle }),
    },
    ...(assertion.authenticatorAttachment === undefined
      ? {}
      : { authenticatorAttachment: assertion.authenticatorAttachment }),
  };
}
