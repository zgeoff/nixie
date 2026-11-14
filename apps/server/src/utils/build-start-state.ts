import type { PartReport } from '@heynixie/ops';
import type { BackupWatch } from './build-backups-report';

interface StartReports {
  readonly database: PartReport;

  readonly definitions: PartReport;

  readonly images: PartReport;

  readonly conversation: PartReport;

  readonly turns: PartReport;

  readonly areRunnersStarted: boolean;

  readonly backups: BackupWatch;
}

export interface StartState {
  readonly read: () => StartReports;
  readonly update: (reports: Partial<StartReports>) => void;
}

export function buildStartState(database: PartReport): StartState {
  const current: { reports: StartReports } = {
    reports: {
      database,
      definitions: { isReady: false, reason: 'no seed has applied yet' },
      images: { isReady: false, reason: 'the images in the sandbox manifest are not all added' },
      conversation: { isReady: false, reason: 'the conversation imp has not started' },
      turns: { isReady: true, reason: null },
      areRunnersStarted: false,
      backups: { state: 'not_started' },
    },
  };

  return {
    read: () => current.reports,
    update: (reports) => {
      current.reports = { ...current.reports, ...reports };
    },
  };
}
