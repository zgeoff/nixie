import { store } from './store';

export function readMockBackupNotice() {
  const notice = store.backupNotices.all().findLast(() => true);

  return {
    notice:
      notice === undefined
        ? null
        : { cause: notice.cause, sequence: notice.sequence, raisedAt: notice.raisedAt },
  };
}
