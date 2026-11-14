import type { ReactNode } from 'react';
import { css } from '../styled-system/css';
import type { ForgetBackup } from '../types';
import { formatForgetBackup } from './format-forget-backup';

export interface ForgetBackupLineProps {
  readonly backup: ForgetBackup;
}

const line = css({ color: 'textMuted', fontSize: 'sm', marginTop: '1' });

export function ForgetBackupLine(props: ForgetBackupLineProps): ReactNode {
  return <p className={line}>{formatForgetBackup(props.backup)}</p>;
}
