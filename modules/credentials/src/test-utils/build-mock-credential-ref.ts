import type { FileCredentialRef } from '../types';

// The reference of an entry in the secrets file's model credentials.
export function buildMockCredentialRef(name = 'anthropic'): FileCredentialRef {
  return { backend: 'file', group: 'model_credentials', name };
}
