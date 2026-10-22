import type { ViewNoticeKind } from './view-types';

export interface NoticeKeyParts {
  readonly kind: ViewNoticeKind;
  readonly messageSequence: number | null;
}

export function parseNoticeKey(noticeKey: string): NoticeKeyParts {
  if (noticeKey.startsWith('batch/')) {
    return { kind: 'batch', messageSequence: null };
  }

  if (noticeKey.startsWith('turn/')) {
    return {
      kind: 'turn',
      messageSequence: Number(noticeKey.slice(noticeKey.lastIndexOf('/') + 1)),
    };
  }

  return { kind: 'run', messageSequence: null };
}
