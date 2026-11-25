import type { Clock } from '@heynixie/clock';
import type { CheckedTables } from '@heynixie/db';
import type { Definitions, JSONObject, JSONValue, Log, WriteTransaction } from '@heynixie/log';
import type { Logger } from '@heynixie/logger';
import type { TasksContext } from '@heynixie/tasks';
import type { ToolRun } from '@heynixie/tools';
import type { WakeRulesConfig } from '@heynixie/triggers';
import type { FetchReply } from '@heynixie/wire';

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

  // the HTML of the mail as it came; empty when it has none
  readonly html: string;
  readonly attachments: readonly MailAttachment[];

  // the bytes of each attachment, in the order of the list
  readonly attachmentContents: readonly Uint8Array<ArrayBuffer>[];
}

// An attachment of a stored mail. The mail keeps the bytes of the first attachments, up to a limit.
interface StoredAttachment extends MailAttachment {
  readonly isStored: boolean;
}

// The text of a stored mail, read from its record's erasable fields.
export interface StoredMailFields {
  readonly from: string;
  readonly to: readonly string[];
  readonly cc: readonly string[];
  readonly subject: string;
  readonly text: string;

  // the HTML of the mail as it came; empty when it has none
  readonly html: string;
  readonly attachments: readonly StoredAttachment[];

  // the Message-ID header, empty when the mail has none
  readonly messageIDHeader: string;

  // the IDs that the mail answers, nearest first
  readonly references: readonly string[];
}

// Reads the text and the links of a mail's HTML where the web fetch tool reads a page: in the fetch
// sandbox, which makes no request.
export interface MailHTMLReader {
  readonly readHTML: (html: string) => Promise<FetchReply>;
}

export interface MailSettings {
  // the assistant's own address
  readonly address: string;
  readonly hostPollIntervalMs: number;
  readonly wake: WakeRulesConfig;

  // the most characters of a link's path that its tag shows, as the web fetch tool sets it
  readonly linkPathChars: number;
}

// A file of a code run, which a mail sends or a received attachment becomes.
interface MailFileRow {
  readonly thread: string;
  readonly bytes: number;
  readonly mediaType: string;
}

export type MailFileEntry =
  | { readonly kind: 'missing' }
  | { readonly kind: 'forgotten'; readonly row: MailFileRow }
  | {
      readonly kind: 'ok';
      readonly row: MailFileRow;

      // the last segment of the file's path in the run's result
      readonly name: string;

      // the file is a kept stream of the run, not a file the program wrote
      readonly isStream: boolean;
    };

export type MailFileRead =
  | { readonly kind: 'ok'; readonly bytes: Uint8Array<ArrayBuffer> }
  | { readonly kind: 'missing' | 'forgotten' };

// The files of the threads' code runs, which the mail module reads to send them.
export interface MailFileReader {
  // the file with its run's result, whatever thread it belongs to
  readonly readEntry: (fileID: string) => Promise<MailFileEntry>;

  // the file's bytes, when it belongs to the thread
  readonly readFile: (thread: string, fileID: string) => Promise<MailFileRead>;
}

// A file that bytes became, for a result record to hold.
interface MailStoredFile {
  readonly file: string;
  readonly mediaType: string;
  readonly files: readonly {
    readonly file: string;
    readonly path: string;
    readonly bytes: number;
    readonly mediaType: string;
    readonly isShown: boolean;
  }[];
  readonly attachments: readonly Uint8Array<ArrayBuffer>[];

  // writes the file's row in the transaction of the result record that holds its bytes
  readonly writeBeside: (tx: WriteTransaction, sequence: number) => Promise<void>;
}

interface StoredFileRequest {
  readonly name: string;
  readonly bytes: Uint8Array<ArrayBuffer>;
  readonly thread: string;
}

interface LinkTagRequest {
  readonly urls: readonly string[];
  readonly linkPathChars: number;
}

interface LinkedTextRequest {
  // the text of a fetcher's reply, with a mark where each link ends
  readonly text: string;

  // the target of each mark, by the index the mark names
  readonly links: readonly string[];
  readonly textBytes: number;
  readonly linkPathChars: number;
}

// What the mail module takes from the web tools and the code files, which the server wires: the
// two modules never import each other.
export interface MailPorts extends MailFileReader {
  // keeps bytes as a file of the thread
  readonly buildStoredFile: (request: StoredFileRequest) => MailStoredFile;

  // numbers each URL in the session of the call, as a search hit is, and returns each URL's tag, or
  // null when the session ended
  readonly writeLinkTags: (
    run: ToolRun,
    request: LinkTagRequest,
  ) => Promise<ReadonlyMap<string, string> | null>;

  // numbers each link of a text the fetcher read, and returns the text with each mark replaced by
  // its tag, or null when the session ended
  readonly writeLinkedText: (run: ToolRun, request: LinkedTextRequest) => Promise<string | null>;
}

export interface MailActionAttempt {
  readonly actionID: string;
  readonly tool: string;
  readonly arguments: JSONObject;
}

export type MailProviderResponse =
  | { readonly kind: 'success'; readonly result: JSONObject }
  | { readonly kind: 'refused'; readonly reason: string };

export type MailCheckResponse =
  | { readonly kind: 'found'; readonly result: JSONObject }
  | { readonly kind: 'not_found' }
  | { readonly kind: 'inconclusive' };

// The queue's connector of a mail tool, in the shape the actions module runs.
export interface MailActionConnector {
  readonly run: (attempt: MailActionAttempt) => Promise<MailProviderResponse>;
  readonly reconcile: {
    readonly kind: 'check';
    readonly tool: string;
    readonly onNotFound: 'retry';
  };
  readonly check: (attempt: MailActionAttempt) => Promise<MailCheckResponse>;
}

export interface MailContext {
  readonly log: Log;
  readonly clock: Clock;
  readonly definitions: () => Definitions;
  readonly settings: MailSettings;
  readonly logEvent: Logger;
  readonly ports: MailPorts;
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
