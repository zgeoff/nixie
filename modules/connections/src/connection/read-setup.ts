import { readLiveClient } from '../client/read-live-client';
import { fillSetupSteps } from '../connector/fill-setup-steps';
import type { ServiceContext } from '../service-context';
import type { SetupReply } from '../types';

// The setup steps with their placeholders filled: from the registered client's origin, or from the
// page's own origin before the owner registers one.
export async function readSetup(context: ServiceContext, pageOrigin: string): Promise<SetupReply> {
  const client = await readLiveClient(context);

  const origin = client?.origin ?? pageOrigin;

  const steps = fillSetupSteps(context.connector.setup, {
    origin,
    redirectURI: client?.redirect_uri ?? `${origin}${context.endpoints.returnPath}`,
  });

  if (client === null || client.short_id === null) {
    return { steps, client: null };
  }

  return {
    steps,
    client: {
      client: client.short_id,
      clientID: client.provider_client_id,
      origin: client.origin ?? origin,
      redirectURI: client.redirect_uri ?? `${origin}${context.endpoints.returnPath}`,
      fingerprint: client.secret_fingerprint ?? '',
      pickerKey: client.picker_key,
      projectNumber: client.project_number,
    },
  };
}
