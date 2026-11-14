// A backup and a restore never run on one data directory at once, and each answers the other with
// this refusal rather than an error.
export interface DataRefusal {
  readonly refused: 'restore-running' | 'backup-running';
}
