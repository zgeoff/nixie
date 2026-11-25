import type { JSONObject, WriteTransaction } from '@heynixie/log';
import type { ResultSources, ToolImage } from '../types';

export type SettledOutcome =
  | 'result'
  | 'invalid'
  | 'denied'
  | 'error'
  | 'queued'
  | 'failed'
  | 'unknown';

export interface Settled {
  readonly outcome: SettledOutcome;
  readonly actionID: string | null;
  readonly sources: ResultSources;
  readonly content: JSONObject;
  readonly reply:
    | {
        readonly kind: 'typed';
        readonly result: JSONObject;
        readonly images: readonly ToolImage[];
      }
    | { readonly kind: 'text'; readonly text: string; readonly isError: boolean };

  // the model's loop ends its turn after this result
  readonly endsTurn?: true;

  // the code of the tool's refusal, for a result that changed nothing
  readonly refusalCode?: string;

  // sealed under the result record's key, in order
  readonly attachments?: readonly Uint8Array<ArrayBuffer>[];

  // runs in the transaction that writes the result record
  readonly writeBeside?: (tx: WriteTransaction, resultSequence: number) => Promise<void>;

  // runs in the transaction of every attempt to write the result record, the one that replaces a
  // refused result too, because the call has run and billed whatever the record holds
  readonly writeCharge?: (tx: WriteTransaction) => Promise<void>;
}
