import { createHash } from 'node:crypto';
import type { SecretSpec } from '@heynixie/sandbox';
import type { ResolvedProfile } from './types';

const secretPrefix = 'nixie-model-';

// impd caps a name at 31 characters, and a profile ID has no length cap, so the profile goes into
// the digest and the name keeps one length for every profile.
const nameLength = 31;

export function deriveModelSecret(resolved: ResolvedProfile): SecretSpec {
  const host = new URL(resolved.profile.baseURL).hostname;

  // A credential nixie holds goes into the name, because the sandbox backend keeps a granted secret
  // under its name and nixie cannot replace its value. A credential the backend holds stays out, so
  // a rotation replaces the value in place under the same name.
  const parts = [resolved.profile.id, resolved.profile.authHeader, host];

  const digest = createHash('sha256')
    .update([...parts, ...(resolved.credential === null ? [] : [resolved.credential])].join('\n'))
    .digest('hex')
    .slice(0, nameLength - secretPrefix.length);

  return {
    name: `${secretPrefix}${digest}`,
    value: resolved.credential,
    host,
    header: resolved.profile.authHeader,
  };
}
