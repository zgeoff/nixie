import type { ContractInputs, ContractOutputs } from '@heynixie/contract';
import { startRegistration } from '@simplewebauthn/browser';

type RegistrationOptions = ContractOutputs['passkeys']['registrationOptions']['options'];

type Registration = ContractInputs['passkeys']['register']['response'];

// Runs the browser's prompt that makes one passkey from the options the host issued.
export async function askRegistration(options: RegistrationOptions): Promise<Registration> {
  const response = await startRegistration({
    optionsJSON: {
      ...options,
      excludeCredentials: options.excludeCredentials.map((credential) => ({
        id: credential.id,
        type: credential.type,
        ...(credential.transports === undefined ? {} : { transports: credential.transports }),
      })),
    },
  });

  // The server reads no client extension result, so the registration leaves them out.
  const inner = response.response;

  return {
    id: response.id,
    rawId: response.rawId,
    type: response.type,
    clientExtensionResults: {},
    response: {
      clientDataJSON: inner.clientDataJSON,
      attestationObject: inner.attestationObject,
      ...(inner.authenticatorData === undefined
        ? {}
        : { authenticatorData: inner.authenticatorData }),
      ...(inner.transports === undefined ? {} : { transports: inner.transports }),
      ...(inner.publicKeyAlgorithm === undefined
        ? {}
        : { publicKeyAlgorithm: inner.publicKeyAlgorithm }),
      ...(inner.publicKey === undefined ? {} : { publicKey: inner.publicKey }),
    },
    ...(response.authenticatorAttachment === undefined
      ? {}
      : { authenticatorAttachment: response.authenticatorAttachment }),
  };
}
