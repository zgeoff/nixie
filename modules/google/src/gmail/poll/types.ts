import type { Clock } from '@heynixie/clock';
import type { ConnectorContext } from '@heynixie/connections';
import type { Logger } from '@heynixie/logger';
import type { ConnectionArrivalEvent, TriggerContext } from '@heynixie/triggers';
import type { Kysely } from 'kysely';
import type { GoogleHosts } from '../../types';
import type { GmailSourceCursor } from './gmail-source-cursor';

export interface GmailConnection {
  readonly connectionID: string;

  // the short ID, the prefix of the IDs that a Gmail tool takes
  readonly connection: string;
  readonly status: 'active' | 'failing' | 'needs_consent' | 'expiring';
}

export interface GmailArrivalSourceInput {
  readonly clock: Clock;
  readonly hosts: GoogleHosts;
  readonly logEvent: Logger;
  readonly pollIntervalMs: number;

  // the database that holds the reply rules, which ask the poll to read the mail since their send
  // again
  readonly db: Kysely<unknown>;

  // each Google connection granted gmail.modify, the scope the Gmail tools already hold; the source
  // asks for no scope of its own
  readonly listConnections: () => Promise<readonly GmailConnection[]>;

  // the connection's fetcher; null once the connection is no longer live
  readonly readContext: (connectionID: string) => Promise<ConnectorContext | null>;
}

export interface PollState {
  failures: number;

  // epoch ms when the connection's next poll falls due
  dueAt: number;
}

export interface PollRun {
  readonly input: GmailArrivalSourceInput;
  readonly trigger: TriggerContext;
  readonly signal: AbortSignal;
  cursor: GmailSourceCursor;
  readonly states: Map<string, PollState>;
}

export interface PollDelivery {
  readonly historyID: string;
  readonly startedAt: number;
  readonly events: readonly ConnectionArrivalEvent[];

  // the ID of each reply rule that the poll read the mail of again, or that it found read already
  readonly replayed: string[];
}
