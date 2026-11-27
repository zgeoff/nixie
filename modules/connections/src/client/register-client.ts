import { createShortID } from '@heynixie/db';
import { clientRegisteredCodec } from '../record/client-registered-codec';
import type { ServiceContext } from '../service-context';
import type { OperationAttempt, RegisterClientResult } from '../types';
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
  attempt?: OperationAttempt<RegisterClientResult>,
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

    const registered: RegisterClientResult = { kind: 'registered', client: shortID, redirectURI };

    await context.backend.writeRegisteredClient(
      crypto.randomUUID(),
      {
        clientID: input.clientID,
        clientSecret: input.clientSecret,
        connectorID: context.connector.id,
      },
      {
        shortID,
        origin,
        redirectURI,
        pickerKey: input.pickerKey,
        projectNumber: input.projectNumber,
        secretFingerprint,
        settle: (tx) => attempt?.settle(tx, registered) ?? Promise.resolve(),
        record: {
          kind: clientRegisteredCodec.kind,
          payload: clientRegisteredCodec.encode({
            client: shortID,
            fingerprint: secretFingerprint,
          }),
        },
      },
    );

    return registered;
  });
}
