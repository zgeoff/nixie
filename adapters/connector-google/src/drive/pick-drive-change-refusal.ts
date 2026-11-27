import { googleDocType } from './constants';
import { pickDriveType } from './pick-drive-type';
import type { DriveFile } from './types';

export interface DriveRefusal {
  readonly code: 'shared_file' | 'trashed' | 'unsupported_type';
  readonly message: string;
}

// Why a replace of the file's content must not go ahead, or null. A file shared with anyone, or in a
// shared drive, refuses, because a change there reaches each person who can read it. Only a Google
// Doc and a text file take a replacement.
export function pickDriveChangeRefusal(file: DriveFile): DriveRefusal | null {
  if (file.isShared || file.driveID !== null) {
    return {
      code: 'shared_file',
      message:
        'SHARED_FILE: the file is shared, or sits in a shared drive, and a change would reach ' +
        'each person who can read it',
    };
  }

  if (file.isTrashed) {
    return { code: 'trashed', message: 'TRASHED: the file is in the trash' };
  }

  return file.mimeType === googleDocType || pickDriveType(file.mimeType) === 'text'
    ? null
    : {
        code: 'unsupported_type',
        message: 'UNSUPPORTED_TYPE: only a Google Doc and a text file take a new content',
      };
}
