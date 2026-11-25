import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { match } from 'ts-pattern';
import { css } from '../styled-system/css';
import { useNixieClient } from '../utils/use-nixie-client';

const notice = css({
  color: 'textMuted',
  fontSize: 'sm',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});

export function BackupNotice(): ReactNode {
  const nixie = useNixieClient();
  const read = useQuery(nixie.queryUtils.backups.readNotice.queryOptions());
  const current = read.data?.notice ?? null;

  if (current === null) {
    return null;
  }

  return (
    <p className={notice} role="alert">
      {renderNotice(current)}
    </p>
  );
}

interface Notice {
  readonly cause: 'failed' | 'missing';
  readonly raisedAt: Date;
}

function renderNotice(current: Notice): string {
  const time = current.raisedAt.toLocaleString(undefined, {
    day: 'numeric',
    hour: 'numeric',
    minute: '2-digit',
    month: 'short',
  });

  return match(current.cause)
    .with(
      'failed',
      () =>
        `nixie found a failed backup at ${time}. nixie keeps its data, and the next backup tries again within the backup interval.`,
    )
    .with(
      'missing',
      () =>
        `nixie found at ${time} that a backup had not uploaded within the backup interval. Check that the backup job runs.`,
    )
    .exhaustive();
}
