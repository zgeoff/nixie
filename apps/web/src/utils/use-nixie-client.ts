import { use } from 'react';
import type { NixieClient } from '../types';
import { NixieClientContext } from './nixie-client-context';

export function useNixieClient(): NixieClient {
  const nixie = use(NixieClientContext);

  if (nixie === undefined) {
    throw new Error('useNixieClient needs a NixieClientContext provider above it');
  }

  return nixie;
}
