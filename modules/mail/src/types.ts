import type { Clock } from '@heynixie/clock';
import type { CheckedTables } from '@heynixie/db';
import type { Definitions, JSONValue, Log } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { TasksContext } from '@heynixie/tasks';
import type { WakeRulesConfig } from '@heynixie/triggers';

// The one interface through which nixie reaches the mail host. An adapter per host implements it;
// the in-memory host stands in for tests and the test build.
export interface MailHost {
  // the host's state now; it finds no mail
  readonly begin: () => Promise<HostCursor>;
  readonly readChanges: (cursor: HostCursor) => Promise<HostChanges>;
  readonly send: (mail: OutgoingMail) => Promise<{ readonly hostMessageID: string }>;

  // reconciles a send by the Message-ID that nixie set
  readonly findSent: (
    messageIDHeader: string,
  ) => Promise<{ readonly hostMessageID: string } | null>;

  // a push hint, when the host has one
  readonly watch?: (signal: AbortSignal) => AsyncIterable<void>;
}

export type HostCursor = JSONValue;

export type HostChanges =
  | {
      readonly kind: 'changes' | 'resynced';
      readonly cursor: HostCursor;
      readonly mails: readonly HostMail[];
    }

  // after: the host's retry time, in ms
  | { readonly kind: 'failed'; readonly reason: string; readonly after?: number };

export interface HostMail {
  readonly hostMessageID: string;

  // epoch ms
  readonly receivedAt: number;

  // the RFC 5322 message; only the mail module parses mail
  readonly raw: Uint8Array;
}

export interface OutgoingMail {
  // its Message-ID is '<actionID>@<the assistant's domain>'
  readonly raw: Uint8Array;
}

export interface MailAttachment {
  readonly name: string;
  readonly bytes: number;
}

// A mail read from its raw form. Every text is untrusted.
export interface ParsedMail {
  // the Message-ID header without its angle brackets, or null
  readonly messageID: string | null;

  // the IDs of the mails it answers, nearest first, without angle brackets
  readonly references: readonly string[];

  // the From address alone, lowered
  readonly from: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly attachments: readonly MailAttachment[];
}

// The text of a stored mail, read from its record's erasable fields.
export interface StoredMailFields {
  readonly from: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly text: string;
  readonly attachments: readonly MailAttachment[];

  // the Message-ID header, empty when the mail has none
  readonly messageIDHeader: string;

  // the IDs that the mail answers, nearest first
  readonly references: readonly string[];
}

export interface MailSettings {
  // the assistant's own address
  readonly address: string;
  readonly hostPollIntervalMs: number;
  readonly wake: WakeRulesConfig;

  // the most characters of a link's path that its tag shows, as the web fetch tool sets it
  readonly linkPathChars: number;
}

export interface MailContext {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
  readonly settings: MailSettings;
  readonly logEvent: Logger;
}

// The context of the tools and the connector, which run in a server that holds the whole tasks
// context.
export interface MailToolContext extends MailContext {
  readonly tasks: TasksContext;
}

interface MailMessageTable {
  readonly message_id: string;
  readonly short_id: string;
  readonly thread_short_id: string;
  readonly host_message_id: string;
  readonly direction: 'in' | 'out';

  // epoch ms
  readonly received_at: number;
  readonly unread: number;
  readonly header_hash: string;

  // the record that holds the mail's text
  readonly record_sequence: number;
  readonly updated_sequence: number;
}

export type MailTables = CheckedTables<Readonly<{ mail_messages: MailMessageTable }>>;
