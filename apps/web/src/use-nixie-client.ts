import { use } from 'react';
import { NixieClientContext } from './nixie-client-context';
import type { NixieClient } from './types';

export function useNixieClient(): NixieClient {
  const nixie = use(NixieClientContext);

  if (nixie === undefined) {
    throw new Error('useNixieClient needs a NixieClientContext provider above it');
  }

  return nixie;
}
