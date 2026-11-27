import type { Clock } from '@heynixie/clock';
import type {
  ConnectorContext,
  Log,
  ToolImage,
  ToolRun,
  WakeRuleContext,
} from '@heynixie/connections';
import type { FetchReply, MarkedTextPart } from '@heynixie/wire';
import type { Transaction } from 'kysely';
import type { GoogleHosts } from '../connector/google-hosts';

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

// a link tag's place in the text, in UTF-16 code units
export interface TagSpan {
  readonly start: number;
  readonly end: number;
}

export interface LinkedText {
  readonly text: string;
  readonly tags: readonly TagSpan[];
}

export interface PageLinks {
  readonly pageURL: string;
  readonly targets: readonly string[];
  readonly numbers: ReadonlyMap<string, number>;
}

export type FittedImage =
  | {
      readonly kind: 'image';
      readonly image: ToolImage;
      readonly width: number;
      readonly height: number;
    }
  | { readonly kind: 'unreadable'; readonly reason: string };

interface CodeFileRow {
  readonly thread: string;
  readonly bytes: number;
  readonly mediaType: string;
}

export interface LinkTagContext {
  readonly pageHost: string | null;
  readonly linkPathChars: number;
}

export interface CodeFileRef {
  readonly thread: string;
  readonly fileID: string;
}

export type CodeFileEntry =
  | { readonly kind: 'missing' }
  | { readonly kind: 'forgotten'; readonly row: CodeFileRow }
  | {
      readonly kind: 'ok';
      readonly row: CodeFileRow;
      readonly name: string;
      readonly isStream: boolean;
    };

export type CodeFileRead =
  | { readonly kind: 'missing' }
  | { readonly kind: 'forgotten' }
  | { readonly kind: 'ok'; readonly bytes: Uint8Array<ArrayBuffer> };

// What the Google tools use of the connectors module: its page, link and code file reads. The
// server fills it, so the adapter depends on the connections module alone.
export interface GoogleToolkit {
  readonly collectPageParts: (linked: LinkedText, limitBytes: number) => string[];
  readonly fitFetchedImage: (bytes: Uint8Array, longEdge: number) => Promise<FittedImage>;
  readonly renderLinkedText: (
    parts: readonly MarkedTextPart[],
    page: PageLinks,
    limits: LinkLimits,
  ) => LinkedText;
  readonly formatLinkTag: (number: number, target: string, context: LinkTagContext) => string;

  // numbers each address in the session of the run; null when the session ended
  readonly writeHitLinks: (
    log: Pick<Log, 'writer'>,
    run: ToolRun,
    urls: readonly string[],
  ) => Promise<ReadonlyMap<string, number> | null>;
  readonly readCodeFile: (
    log: Pick<Log, 'deploymentKey' | 'writer'>,
    file: CodeFileRef,
  ) => Promise<CodeFileRead>;
  readonly readCodeFileEntry: (
    log: Pick<Log, 'deploymentKey' | 'writer'>,
    fileID: string,
  ) => Promise<CodeFileEntry>;
  readonly readMessageTimeZone: (
    log: Pick<Log, 'writer'>,
    beforeSequence?: number,
  ) => Promise<string | null>;
}

export interface GmailDeps {
  readonly toolkit: GoogleToolkit;
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
