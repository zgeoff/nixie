import type { FakeHold } from '../fake-gmail/build-fake-hold';
import type { FakeFailure } from '../fake-gmail/create-fake-gmail';

export interface FakeFileSeed {
  readonly id?: string;
  readonly name: string;

  // `text/plain` when absent; a Google Doc is `application/vnd.google-apps.document`
  readonly mimeType?: string;
  readonly text?: string;
  readonly bytes?: Uint8Array;

  // shared with anyone
  readonly isShared?: boolean;

  // the shared drive the file sits in
  readonly driveID?: string;
  readonly isTrashed?: boolean;
  readonly appProperties?: Readonly<Record<string, string>>;
}

export interface StoredFile {
  readonly id: string;
  name: string;
  readonly mimeType: string;
  bytes: Uint8Array;
  modifiedTime: string;
  isShared: boolean;
  readonly driveID: string | null;
  readonly isTrashed: boolean;
  appProperties: Record<string, string>;
}

export interface FakeDrive {
  readonly files: Map<string, StoredFile>;

  // each request as `GET /drive/v3/files?...`, in order
  readonly requests: string[];
  readonly failures: FakeFailure[];

  // stops the next request whose line starts with `line` before it answers
  readonly hold: (line: string) => FakeHold;
  readonly holds: FakeHold[];

  // how many leading pages of a file list hold no file but name a next page, as Drive can answer
  emptyListPages: number;
  readonly seed: (file: FakeFileSeed) => { readonly id: string };
  readonly serve: (request: Request) => Promise<Response | null>;
}

export interface FakeDriveState {
  counter: number;
}

export interface FakeDriveCall {
  readonly request: Request;
  readonly url: URL;
}
