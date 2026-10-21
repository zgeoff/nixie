import { createContext } from 'react';
import type { NixieClient } from './types';

export const NixieClientContext = createContext<NixieClient | undefined>(undefined);
