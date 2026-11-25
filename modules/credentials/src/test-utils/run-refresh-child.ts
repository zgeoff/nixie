import { systemClock } from '@heynixie/clock';
import { logProjections, startWriter } from '@heynixie/log';
import { z } from 'zod';
import { buildHeldSpec } from './build-held-spec';
import { createHeldTestStore } from './create-held-test-store';

// The process a crash test kills: it connects a credential and starts a refresh against a provider
// that never answers, so the process dies with the refresh's request on the wire. Its one argument
// is the JSON of the config below.
const configSchema = z.object({
  dataDir: z.string(),
  ca: z.string(),
  origin: z.string(),
  tokenURL: z.string(),
  revokeURL: z.string(),
  clientCredentialID: z.string(),
  tokenCredentialID: z.string(),
});

const config = configSchema.parse(JSON.parse(process.argv[2] ?? ''));

const writer = await startWriter({ dataDir: config.dataDir, clock: systemClock });

const deploymentKey = await crypto.subtle.generateKey({ name: 'AES-KW', length: 256 }, false, [
  'wrapKey',
  'unwrapKey',
]);

const held = await createHeldTestStore({
  log: { writer, deploymentKey, projections: logProjections },
  ca: config.ca,
  now: () => Date.now(),
});

await held.backend.writeClient(config.clientCredentialID, { clientSecret: 'fake-client-secret' });

const client = await held.store.registerHeld(
  { backend: 'database', credentialID: config.clientCredentialID },
  buildHeldSpec(config, 'oauth_client'),
);

await held.store.exchange(client, {
  code: 'fake-code',
  redirectURI: 'https://nixie.example/callback',
  credentialID: config.tokenCredentialID,
});

const token = await held.store.registerHeld(
  { backend: 'database', credentialID: config.tokenCredentialID },
  buildHeldSpec(config, 'oauth_token'),
);

await held.store.refresh(token);
