// The model's names for the Drive tools.
export const driveToolNames = {
  search: 'drive.search',
  read: 'drive.read',
  create: 'drive.create',
  change: 'drive.change',
} as const;

// The read-only check that only the action queue calls.
export const driveCheckName = 'drive.find_change';

// the one scope that every Drive tool needs
export const driveScope = 'drive.file';
