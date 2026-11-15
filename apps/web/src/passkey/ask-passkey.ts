import type { ContractClient, ContractInputs } from '@heynixie/contract';
import { startAuthentication } from '@simplewebauthn/browser';

type ChallengeFor = ContractInputs['passkeys']['challenge']['for'];

type Assertion = NonNullable<ContractInputs['approvals']['answerProposal']['passkey']>;

// Asks the passkey for an assertion bound to the one check it is for. The browser's prompt is the
// person's confirmation, and a prompt that is cancelled or refused rejects.
export async function askPasskey(
  client: ContractClient,
  binding: ChallengeFor,
): Promise<Assertion> {
  const challenge = await client.passkeys.challenge({ for: binding });

  const options = challenge.options;

  const response = await startAuthentication({
    optionsJSON: {
      challenge: options.challenge,
      rpId: options.rpId,
      userVerification: options.userVerification,
      timeout: options.timeout,
      allowCredentials: [],
    },
  });

  // The server reads no client extension result, so the assertion leaves them out.
  return {
    id: response.id,
    rawId: response.rawId,
    type: response.type,
    clientExtensionResults: {},
    response: {
      clientDataJSON: response.response.clientDataJSON,
      authenticatorData: response.response.authenticatorData,
      signature: response.response.signature,
      ...(response.response.userHandle === undefined
        ? {}
        : { userHandle: response.response.userHandle }),
    },
    ...(response.authenticatorAttachment === undefined
      ? {}
      : { authenticatorAttachment: response.authenticatorAttachment }),
  };
}
