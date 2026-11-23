import type { handoverCloses } from './handover-closed-codec';

export type HandoverClose = (typeof handoverCloses)[number];

export interface HandoverAsk {
  readonly reason: string;
}

export interface HandoverEnd {
  readonly by: HandoverClose;
  readonly waitedSeconds: number;
}

export interface HandoverRecords {
  readonly writeAsked: (input: HandoverAsk) => Promise<void>;
  readonly writeClosed: (input: HandoverEnd) => Promise<void>;
}

export type AskResult =
  | { readonly kind: 'asked' }
  | { readonly kind: 'already_asked' }
  | { readonly kind: 'taken_over' };

export type CancelResult = { readonly kind: 'cancelled' } | { readonly kind: 'not_asked' };

// The assistant's ask for a person to take the desktop. It lives in memory, and a restart reopens
// it from its record.
export interface Handover {
  // Opens an ask unless one is open or a hold is. The ask expires after its time with no take-over.
  readonly ask: (reason: string) => Promise<AskResult>;

  // Closes the open ask as the assistant's own doing
  readonly cancel: () => Promise<CancelResult>;

  // Ends the ask because a hold started: no record closes it, since the take-over answers it
  readonly answer: () => void;

  // Opens the ask that a restart cut, with its time left counted from when it was asked
  readonly resume: (askedAtMs: number) => void;

  // stops the expiry timer, for a computer that stops
  readonly stop: () => void;
}
