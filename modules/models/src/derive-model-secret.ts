import { createHash } from 'node:crypto';
import type { SecretSpec } from '@heynixie/sandbox';
import type { ResolvedProfile } from './types';

const secretPrefix = 'nixie-model-';

// impd caps a name at 31 characters, and a profile ID has no length cap, so the profile goes into
// the digest and the name keeps one length for every profile.
const nameLength = 31;

export function deriveModelSecret(resolved: ResolvedProfile): SecretSpec {
  const host = new URL(resolved.profile.baseURL).hostname;

  // The sandbox backend keeps a granted secret under its name, so a changed credential takes a new
  // name and a sandbox granted the old secret keeps working until it is replaced.
  const digest = createHash('sha256')
    .update(
      `${resolved.profile.id}\n${resolved.profile.authHeader}\n${host}\n${resolved.credential}`,
    )
    .digest('hex')
    .slice(0, nameLength - secretPrefix.length);

  return {
    name: `${secretPrefix}${digest}`,
    value: resolved.credential,
    host,
    header: resolved.profile.authHeader,
  };
}
