import type { Clock } from '@heynixie/clock';
import type { Log } from '@heynixie/log';
import type { WakeRuleContext } from '@heynixie/triggers';
import type { FetchReply } from '@heynixie/wire';
import type { Transaction } from 'kysely';
import type { ConnectorContext } from '../../types';
import type { GoogleHosts } from '../google-hosts';

// How the Gmail tools reach a connection. A short ID names one live connection; none lists them all.
export interface GmailAccess {
  readonly readLiveContexts: (connection?: string) => Promise<readonly ConnectorContext[]>;

  // the short ID of each live connection that the Gmail poll covers: one granted gmail.modify that
  // needs no new consent. A wake rule on any other connection would never fire.
  readonly readPolledConnections: () => Promise<readonly string[]>;

  // whether the connection is still live, read in the caller's write transaction, so a rule writer
  // that held a connection before a forget wrote it refuses once the forget has committed
  readonly probeLive: (tx: Transaction<unknown>, connectionID: string) => Promise<boolean>;
}

// What the wake tools need of the triggers module: the context of a rule write, which binds with
// the connections, and the settings of the `wake_rules` config section.
export interface GmailWakePort {
  readonly context: () => WakeRuleContext;

  // a rule's window when the call gives none
  readonly defaultWindowMs: number;

  // the expiry of the rule that a send registers, when the call gives none
  readonly replyExpiryMs: number;
}

export interface GmailDeps {
  readonly hosts: GoogleHosts;
  readonly access: GmailAccess;
  readonly log: Pick<Log, 'deploymentKey' | 'writer'>;
  readonly clock: Pick<Clock, 'now'>;
  readonly wake: GmailWakePort;

  // reads the text and the links of a mail's HTML in the fetch sandbox, which makes no request
  readonly readHTML: (html: string) => Promise<FetchReply>;

  // the most bytes of one text part, as the web fetch config sets it
  readonly textBytes: number;
  readonly linkPathChars: number;
  readonly imageLongEdge: number;
}

// A part of a Gmail message, from its `payload`.
export interface GmailPart {
  // such as `0.1`
  readonly partID: string;
  readonly mimeType: string;
  readonly filename: string;
  readonly headers: ReadonlyMap<string, string>;
  readonly size: number;
  readonly data: string | null;
  readonly attachmentID: string | null;
  readonly parts: readonly GmailPart[];
}

export interface GmailMessage {
  readonly id: string;
  readonly threadID: string;
  readonly labels: readonly string[];
  readonly snippet: string;
  readonly internalDateMs: number;
  readonly payload: GmailPart;
}

export interface GmailAttachment {
  // the MIME part ID, which the model passes back
  readonly attachment: string;
  readonly name: string;
  readonly type: string;
  readonly bytes: number;
}

export interface LinkLimits {
  readonly textBytes: number;
  readonly linkPathChars: number;
}
