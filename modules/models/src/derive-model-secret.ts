import { createHash } from 'node:crypto';
import type { SecretSpec } from '@heynixie/sandbox';
import type { ResolvedProfile } from './types';

// Derives the secret that the sandbox's injecting backend holds for a profile. Its name carries a
// digest of the credential, its host and its header, so a changed credential gets a new name and
// a sandbox granted the old one keeps working until it is replaced.
export function deriveModelSecret(resolved: ResolvedProfile): SecretSpec {
  const host = new URL(resolved.profile.baseURL).hostname;

  const digest = createHash('sha256')
    .update(`${resolved.profile.authHeader}\n${host}\n${resolved.credential}`)
    .digest('hex')
    .slice(0, 16);

  return {
    name: `model-${resolved.profile.id}-${digest}`,
    value: resolved.credential,
    host,
    header: resolved.profile.authHeader,
  };
}
