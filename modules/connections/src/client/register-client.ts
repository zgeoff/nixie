import { createShortID } from '@heynixie/db';
import { clientRegisteredCodec } from '../record/client-registered-codec';
import type { ServiceContext } from '../service-context';
import type { RegisterClientResult } from '../types';
import { pickRegisteredOrigin } from './pick-registered-origin';
import { readLiveClient } from './read-live-client';

export interface RegisterClientInput {
  readonly clientID: string;
  readonly clientSecret: string;
  readonly origin: string;

  // the Origin header of the call that registers the client
  readonly headerOrigin: string | undefined;
  readonly pickerKey: string | null;
  readonly projectNumber: string | null;
}

// Saves the owner's OAuth client: the secret sealed under a key of its own, the redirect URI that
// Google checks, and the picker's two public values. One client per connector is live at a time.
export function registerClient(
  context: ServiceContext,
  input: RegisterClientInput,
): Promise<RegisterClientResult> {
  return context.lock.withLock(async () => {
    const origin = pickRegisteredOrigin(input.origin, input.headerOrigin);

    if (origin === null) {
      return { kind: 'invalid_origin' };
    }

    if ((await readLiveClient(context)) !== null) {
      return { kind: 'client_exists' };
    }

    const shortID = createShortID();
    const redirectURI = `${origin}${context.endpoints.returnPath}`;

    const secretFingerprint = await context.store.readFingerprint(input.clientSecret);

    await context.backend.writeRegisteredClient(
      crypto.randomUUID(),
      { clientID: input.clientID, clientSecret: input.clientSecret },
      {
        shortID,
        origin,
        redirectURI,
        pickerKey: input.pickerKey,
        projectNumber: input.projectNumber,
        secretFingerprint,
        record: {
          kind: clientRegisteredCodec.kind,
          payload: clientRegisteredCodec.encode({
            client: shortID,
            fingerprint: secretFingerprint,
          }),
        },
      },
    );

    return { kind: 'registered', client: shortID, redirectURI };
  });
}
