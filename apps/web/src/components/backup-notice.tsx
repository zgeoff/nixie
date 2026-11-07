import { useQuery } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { match } from 'ts-pattern';
import { css } from '../styled-system/css';
import { useNixieClient } from '../use-nixie-client';

const notice = css({
  color: 'textMuted',
  fontSize: 'sm',
  marginInline: 'auto',
  maxWidth: '3xl',
  paddingBlock: '2',
  paddingInline: '4',
  width: 'full',
});

// nixie checks for receipts once a minute, so a read each minute shows a notice soon after it rises.
const refetchIntervalMs = 60_000;

export function BackupNotice(): ReactNode {
  const nixie = useNixieClient();

  const read = useQuery({
    ...nixie.queryUtils.backups.readNotice.queryOptions(),
    refetchInterval: refetchIntervalMs,
  });

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
        `A backup failed at ${time}. nixie keeps its data, and the next backup tries again within the backup interval.`,
    )
    .with(
      'missing',
      () =>
        `No backup uploaded within the backup interval, as of ${time}. Check that the backup job runs.`,
    )
    .exhaustive();
}
