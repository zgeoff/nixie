import { createHash } from 'node:crypto';
import type { SecretSpec } from '@heynixie/sandbox';
import type { ResolvedProfile } from './types';

export function deriveModelSecret(resolved: ResolvedProfile): SecretSpec {
  const host = new URL(resolved.profile.baseURL).hostname;

  // The sandbox backend keeps a granted secret under its name, so a changed credential takes a new
  // name and a sandbox granted the old secret keeps working until it is replaced.
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
