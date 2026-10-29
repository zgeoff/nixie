// The names inside the staging directory that nixie and the backup job share. Each set is a
// directory named by its sequence number, zero-padded, so a sort by name is a sort by sequence.
export const backupSetLayout = {
  manifest: 'manifest.json',
  marker: 'complete',
  receipt: 'receipt.json',
  jobLock: 'job.lock',
  sequenceDigits: 12,
} as const;
