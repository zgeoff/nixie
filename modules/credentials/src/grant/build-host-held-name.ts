import { createHash } from 'node:crypto';
import type { GrantRequest } from '../types';
import { modelSecretNameLength, modelSecretPrefix } from './constants';

// The name a value the sandbox host holds keeps, since no value goes in, so a rotation replaces the
// value in place under the same name.
export function buildHostHeldName(request: GrantRequest): string {
  const digest = createHash('sha256')
    .update([request.profileID, request.header, request.host].join('\n'))
    .digest('hex');

  return `${modelSecretPrefix}${digest.slice(0, modelSecretNameLength - modelSecretPrefix.length)}`;
}
