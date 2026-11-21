import type { ComputerKind } from './types';

// the owner of each kind's sandbox, one each per deployment
export const computerOwners: Readonly<Record<ComputerKind, string>> = {
  browser: 'computer-browser',
  shell: 'computer-shell',
};
