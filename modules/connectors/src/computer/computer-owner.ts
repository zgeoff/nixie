// the owner of the computer's sandbox, one per deployment
export const computerOwner = 'computer-desktop';

// The owners of the browser and shell sandboxes that the computer replaced. A deployment that ran
// an earlier release still holds one of each until the move copies their disks.
export const legacyComputerOwners = {
  browser: 'computer-browser',
  shell: 'computer-shell',
} as const;
