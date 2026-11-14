// The marker that a backup directory holds from before its first copy until its last write, so a
// directory that a failure stopped never reads as a finished backup.
export const unfinishedBackupMarker = 'backup-incomplete';
