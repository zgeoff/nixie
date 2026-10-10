import { createContext } from 'react';
import type { NixieClient } from './types';

// Carries the oRPC client to every view. The root route provides the one the router built, and the
// tests' render util provides a browser client.
export const NixieClientContext = createContext<NixieClient | undefined>(undefined);
