import { createContext } from 'react';
import type { ApprovalRead } from '../types';
import type { DeferSettings } from './build-defer-times';

export interface ThreadApprovals {
  readonly reads: ReadonlyMap<string, ApprovalRead>;
  readonly defer: DeferSettings;
  readonly refresh: () => void;
}

export const ThreadApprovalsContext = createContext<ThreadApprovals | undefined>(undefined);
