import type { ForgetBackupState } from '../types';

// One backup state for the records of an image forget: failed when any record's state is failed,
// else unknown when any is unknown, else pending when any is pending, else the state they share.
export function pickImageForgetBackup(states: readonly ForgetBackupState[]): ForgetBackupState {
  return (
    states.find((state) => state.state === 'failed') ??
    states.find((state) => state.state === 'unknown') ??
    states.find((state) => state.state === 'pending') ??
    states[0] ?? { state: 'complete' }
  );
}
